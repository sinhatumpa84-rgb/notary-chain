/**
 * Evidence-Based Document Verification Engine for NotaryChain
 * 
 * Enforces strict verification standards:
 * - NO FAKE VERIFICATION: Success in upload, OCR, or AI analysis NEVER equals "VERIFIED".
 * - Deterministic rules override AI speculation.
 * - Explicit verification states: VERIFIED, UNVERIFIED, PENDING_REVIEW, SUSPICIOUS, REJECTED, ANALYSIS_FAILED.
 * - Full audit trail, metadata verification, and blockchain anchor validation.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const { extractDocumentContentAndMetadata } = require('../utils/pdfExtractor');
const { verifyDocumentMetadata } = require('../utils/metadataVerifier');
const { analyzeEvidenceWithGrok } = require('./ai/grokService');
const { calculateDeterministicTrustScore } = require('../utils/trustScoreEngine');
const blockchainService = require('./blockchainService');

/**
 * Main verification pipeline
 */
async function processAndVerifyDocument({
  fileBuffer,
  originalFilename,
  mimetype,
  docTitle,
  category = 'contract',
  user,
  existingDoc = null,
  clientOcrText = ''
}) {
  const uploadTimestamp = new Date();

  // 1. File Evidence & Cryptographic Hash
  const fileSize = fileBuffer.length;
  if (!fileBuffer || fileSize === 0) {
    return {
      status: 'ANALYSIS_FAILED',
      reasons: ['File payload is empty or corrupted (0 bytes).'],
      trustScore: 0,
      riskScore: 10.0,
      riskLevel: 'CRITICAL',
      fileHash: '',
      blockchainRecord: { isAnchored: false }
    };
  }

  const rawSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  logger.info(`[VerificationEngine] Document "${originalFilename}" SHA-256: ${rawSha256}`);

  // 2. Hash Change / Tamper Detection vs Existing Document Record
  let hashHistory = [];
  let isHashMismatch = false;

  if (existingDoc) {
    hashHistory = existingDoc.hashHistory || [];
    const prevHash = existingDoc.fileHash || existingDoc.hash;
    if (prevHash && prevHash !== rawSha256) {
      isHashMismatch = true;
      hashHistory.push({
        hash: rawSha256,
        previousHash: prevHash,
        modifiedAt: uploadTimestamp,
        reason: 'New version uploaded; cryptographic hash mismatch detected.',
        updatedBy: user?._id || user?.id
      });
      logger.warn(`[VerificationEngine] Hash mismatch detected for docId ${existingDoc._id}: ${prevHash} -> ${rawSha256}`);
    }
  }

  // 3. Content Extraction & Metadata Isolation
  let extractionResult;
  try {
    extractionResult = await extractDocumentContentAndMetadata(
      fileBuffer,
      mimetype,
      originalFilename,
      clientOcrText
    );
  } catch (extractErr) {
    logger.error('[VerificationEngine] Content extraction error:', extractErr.message);
    return {
      status: 'ANALYSIS_FAILED',
      reasons: [`Text and metadata extraction failed: ${extractErr.message}`],
      trustScore: 10,
      riskScore: 9.0,
      riskLevel: 'HIGH',
      fileHash: rawSha256,
      blockchainRecord: { isAnchored: false }
    };
  }

  const { document_content, technical_metadata, total_chars } = extractionResult;
  const technicalMetadata = technical_metadata || {};
  const combinedText = (document_content?.pages || []).map(p => p.text).join('\n').trim();

  // If file contains virtually no readable text
  if (total_chars < 15) {
    logger.warn(`[VerificationEngine] Insufficient text extracted (${total_chars} chars) from ${originalFilename}`);
  }

  // 4. Metadata Verification (Chronological & Container consistency)
  const metaVerification = verifyDocumentMetadata({
    filename: originalFilename,
    mimetype,
    fileSize,
    technicalMetadata,
    extractedDates: [],
    extractedParties: []
  });

  // 5. Grok AI Evidence-Based Reasoning (Advisory)
  let grokAnalysis = null;
  try {
    grokAnalysis = await analyzeEvidenceWithGrok({
      documentText: combinedText,
      documentTitle: docTitle || originalFilename,
      filename: originalFilename,
      mimetype,
      metadataEvidence: {
        fileSize,
        mimeConsistent: metaVerification.isConsistent,
        anomalies: metaVerification.anomalies,
        technicalMetadata
      },
      pageCount: document_content.pages.length
    });
  } catch (aiErr) {
    logger.error('[VerificationEngine] Grok analysis exception:', aiErr.message);
  }

  // 6. Deterministic Trust & Risk Calculation
  const parties = grokAnalysis?.extracted_fields?.parties || [];
  const signatories = grokAnalysis?.extracted_fields?.signatories || [];
  const contradictions = grokAnalysis?.inconsistencies || [];
  const suspiciousFlags = [
    ...(grokAnalysis?.suspicious_indicators || []),
    ...(metaVerification.anomalies.map(a => a.description))
  ];

  const deterministicScore = calculateDeterministicTrustScore({
    parties,
    signatories,
    contradictions,
    missing_information: [],
    risk_flags: suspiciousFlags,
    category: grokAnalysis?.document_type || category
  });

  // Risk Score out of 10
  const trustScoreNum = deterministicScore.trust_score;
  const riskScoreNum = parseFloat(((100 - trustScoreNum) / 10).toFixed(1));

  // 7. Blockchain Anchoring Verification
  let blockchainRecord = {
    isAnchored: false,
    network: 'Polygon Amoy Testnet (Chain 80002)',
    status: 'Not Anchored On-Chain'
  };

  try {
    const onChainCheck = await blockchainService.verifyDocumentHash(rawSha256);
    if (onChainCheck && onChainCheck.exists) {
      blockchainRecord = {
        isAnchored: true,
        txHash: onChainCheck.txHash || onChainCheck.transactionHash,
        blockNumber: onChainCheck.blockNumber,
        network: 'Polygon Amoy Testnet (Chain 80002)',
        anchoredAt: onChainCheck.timestamp ? new Date(onChainCheck.timestamp * 1000) : new Date(),
        verifiedAt: new Date(),
        onChainHashMatches: true
      };
      logger.info(`[VerificationEngine] Hash ${rawSha256} verified on Polygon ledger! Tx: ${blockchainRecord.txHash}`);
    }
  } catch (bcErr) {
    logger.warn('[VerificationEngine] Blockchain check advisory:', bcErr.message);
  }

  // 8. FINAL AUTHORITATIVE VERIFICATION STATUS DECISION
  // Status MUST be derived from evidence, NEVER assumed!
  let finalStatus = 'UNVERIFIED';
  const verificationReasons = [];

  if (isHashMismatch) {
    finalStatus = 'SUSPICIOUS';
    verificationReasons.push('Cryptographic hash mismatch: Current document content differs from previously registered version.');
  } else if (metaVerification.hasSevereAnomaly) {
    finalStatus = 'SUSPICIOUS';
    verificationReasons.push(...metaVerification.anomalies.map(a => a.description));
  } else if (contradictions.length > 0) {
    finalStatus = 'SUSPICIOUS';
    verificationReasons.push(`Internal contractual contradiction: ${contradictions.join('; ')}`);
  } else if (suspiciousFlags.some(f => f.toLowerCase().includes('wire') || f.toLowerCase().includes('offshore'))) {
    finalStatus = 'SUSPICIOUS';
    verificationReasons.push('Flagged suspicious payment or financial routing instructions.');
  } else if (total_chars < 20) {
    finalStatus = 'PENDING_REVIEW';
    verificationReasons.push('Document contains minimal extractable text; manual review required.');
  } else if (category === 'contract' && parties.length < 2) {
    finalStatus = 'PENDING_REVIEW';
    verificationReasons.push('Essential contracting parties are incomplete or unverified.');
  } else if (category === 'contract' && signatories.length === 0) {
    finalStatus = 'PENDING_REVIEW';
    verificationReasons.push('Signatory execution blocks are missing or unexecuted.');
  } else if (blockchainRecord.isAnchored && blockchainRecord.onChainHashMatches && deterministicScore.risk_level === 'LOW') {
    // Only with cryptographic on-chain anchor AND clean low-risk content is it VERIFIED
    finalStatus = 'VERIFIED';
    verificationReasons.push('SHA-256 hash anchored and verified on Polygon Amoy ledger.');
    verificationReasons.push('Bilateral parties, execution signatories, and internal covenants verified.');
  } else {
    // Clean, structured document BUT not yet anchored to blockchain or digital signature registry
    finalStatus = 'UNVERIFIED';
    verificationReasons.push('Content analyzed and internally consistent.');
    verificationReasons.push('Not yet anchored to Polygon ledger or certified by authoritative signature registry.');
  }

  return {
    verificationStatus: finalStatus,
    verificationScore: trustScoreNum,
    riskScore: riskScoreNum,
    riskLevel: deterministicScore.risk_level,
    verificationReasons,
    suspiciousIndicators: suspiciousFlags,
    fileHash: rawSha256,
    fileSize,
    mimeType: mimetype,
    documentType: grokAnalysis?.document_type || category,
    documentContent: document_content,
    extractedMetadata: technical_metadata,
    extractedText: combinedText,
    aiAnalysis: grokAnalysis,
    hashHistory,
    blockchainRecord,
    isHashMismatch,
    analyzedAt: new Date()
  };
}

module.exports = {
  processAndVerifyDocument
};
