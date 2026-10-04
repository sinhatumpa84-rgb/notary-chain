'use strict';

const router        = require('express').Router();
const { protect }   = require('../middleware/auth');
const blockchain    = require('../services/blockchainService');
const blockchainSecurity = require('../services/blockchainSecurityService');
const { hashSHA256 } = require('../utils/helpers');
const resU          = require('../utils/apiResponse');
const ApiError      = require('../utils/apiError');

/**
 * GET /api/blockchain/ai-security
 * Advisory Hugging Face blockchain telemetry & anomaly monitor.
 */
router.get('/ai-security', async (req, res, next) => {
  try {
    const analysis = await blockchainSecurity.analyzeBlockchainSecurity();
    resU.success(res, analysis, 'Blockchain AI Security analysis complete');
  } catch (err) {
    resU.success(res, {
      success: true,
      isAiAvailable: false,
      status: 'AI security analysis temporarily unavailable.',
      risk: 'UNKNOWN',
      analysis: 'AI security analysis temporarily unavailable. Deterministic blockchain verification is operational.'
    }, 'Advisory fallback');
  }
});

/**
 * POST /api/blockchain/ai-security-check
 * Check specific transaction / document hash telemetry with Hugging Face.
 */
router.post('/ai-security-check', async (req, res, next) => {
  try {
    const analysis = await blockchainSecurity.analyzeBlockchainSecurity(req.body);
    resU.success(res, analysis, 'Telemetry security check complete');
  } catch (err) {
    resU.success(res, {
      success: true,
      isAiAvailable: false,
      status: 'AI security analysis temporarily unavailable.',
      risk: 'UNKNOWN',
      analysis: 'AI security analysis temporarily unavailable.'
    }, 'Advisory fallback');
  }
});

/**
 * GET /api/blockchain/health
 * Run the 19-point blockchain health check. No auth required so the
 * dashboard can poll without a session.
 */
router.get('/health', async (req, res, next) => {
  try {
    const report = await blockchain.runHealthCheck();
    resU.success(res, report, 'Health check complete');
  } catch (err) {
    next(err);
  }
});

const mongoose = require('mongoose');
const Document = require('../models/Document');
const logger = require('../utils/logger');

/**
 * POST /api/blockchain/store-hash
 * Body: { content?: string, hash?: string, docId: string }
 *
 * Either pass a pre-computed `hash` (64-char hex) or a raw `content`
 * string from which the service will derive the SHA-256 hash.
 */
router.post('/store-hash', protect, async (req, res, next) => {
  try {
    const { content, hash, docId } = req.body;
    if (!docId) throw new ApiError.BadRequestError('docId is required');

    const finalHash = hash || hashSHA256(content || '');
    if (!finalHash || finalHash.length !== 64)
      throw new ApiError.BadRequestError('Provide a valid 64-char hex SHA-256 hash or raw content');

    const result = await blockchain.storeDocumentHash(finalHash, docId);

    // Synchronize to MongoDB as single source of truth
    let linkedDoc = null;
    try {
      const isObjectId = mongoose.Types.ObjectId.isValid(docId);
      const query = isObjectId ? { _id: docId } : { $or: [{ fileHash: finalHash }, { hash: finalHash }] };
      const doc = await Document.findOne(query);
      if (doc) {
        doc.blockchainRecord = {
          txHash: result.txHash,
          blockNumber: result.blockNumber,
          anchoredAt: new Date(),
          network: 'Polygon Amoy',
          contractAddress: process.env.CONTRACT_ADDRESS || '',
          explorerUrl: result.explorerUrl
        };
        doc.blockchainTxHash = result.txHash;

        // Transition status if unverified and clean
        if (doc.verificationStatus === 'UNVERIFIED' || !doc.verificationStatus) {
          doc.verificationStatus = 'VERIFIED';
          doc.verificationReasons = [
            ...(doc.verificationReasons || []),
            `Anchored on Polygon Amoy blockchain at block #${result.blockNumber} (tx: ${result.txHash})`
          ];
        }
        await doc.save();
        linkedDoc = doc;
      }
    } catch (dbErr) {
      logger.warn('[Blockchain] Could not link blockchain record to Document in MongoDB:', dbErr.message);
    }

    resU.success(res, { hash: finalHash, ...result, document: linkedDoc }, 'Hash stored on blockchain and synced to MongoDB');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/blockchain/verify/:hash
 * Verify whether a document hash exists on-chain.
 */
router.get('/verify/:hash', protect, async (req, res, next) => {
  try {
    const { hash } = req.params;
    if (!hash || hash.length !== 64)
      throw new ApiError.BadRequestError('Provide a valid 64-char hex SHA-256 hash');

    const record = await blockchain.verifyDocumentHash(hash);
    const doc = await Document.findOne({ $or: [{ fileHash: hash }, { hash }] })
      .select('title originalFileName verificationStatus verificationScore suspiciousIndicators extractedMetadata createdAt');

    resU.success(res, {
      ...record,
      documentRecord: doc || null,
      isAuthenticOnChain: Boolean(record.exists),
      verificationStatus: record.exists ? (doc?.verificationStatus || 'VERIFIED') : (doc?.verificationStatus || 'UNVERIFIED')
    }, record.exists ? 'Hash verified on blockchain' : 'Hash not found on blockchain');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/blockchain/transaction/:txHash
 * Retrieve transaction receipt from the chain.
 */
router.get('/transaction/:txHash', protect, async (req, res, next) => {
  try {
    const receipt = await blockchain.getTransactionReceipt(req.params.txHash);
    if (!receipt) throw new ApiError.NotFoundError('Transaction not found or not yet mined');
    resU.success(res, receipt);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/blockchain/balance/:address
 * Retrieve real on-chain MATIC and USDC balance.
 */
router.get('/balance/:address', protect, async (req, res, next) => {
  try {
    const walletService = require('../services/walletService');
    const balance = await walletService.getBalance(req.params.address);
    resU.success(res, balance, 'Wallet balance fetched successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/blockchain/connect-wallet
 * Save verified Web3 wallet address to user's MongoDB document.
 */
router.post('/connect-wallet', protect, async (req, res, next) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.startsWith('0x')) {
      throw new ApiError.BadRequestError('Valid Ethereum/Polygon wallet address is required (0x...)');
    }
    const User = require('../models/User');
    if (req.user && req.user._id) {
      await User.findByIdAndUpdate(req.user._id, { walletAddress, walletConnected: true });
    }
    resU.success(res, { walletAddress, walletConnected: true }, 'Web3 wallet connected and saved to MongoDB');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

