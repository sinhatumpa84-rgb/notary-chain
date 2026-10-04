const mongoose = require('mongoose');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const axios    = require('axios');

const Document  = require('../models/Document');
const AIReport  = require('../models/AIReport');
const r         = require('../utils/apiResponse');
const logger    = require('../utils/logger');
const { extractDocumentContentAndMetadata } = require('../utils/pdfExtractor');
const { calculateDeterministicTrustScore } = require('../utils/trustScoreEngine');
const { detectDocumentBundle } = require('../utils/bundleDetector');
const { sanitizePartiesList } = require('../utils/entityValidator');
const { processAndVerifyDocument } = require('../services/verificationEngine');
const { analyzeEvidenceWithGrok } = require('../services/ai/grokService');

/* ─── Multer – store uploads in memory for 100% serverless compatibility ─ */
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp'
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Unsupported file type. Please upload PDF, DOCX, TXT, or images.'), false);
};

exports.multerUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }  // 50 MB
}).single('file');

/* ─── AI Intelligence Engine (xAI Grok & Groq Support) ─────────────── */
const NOTARYCHAIN_ANALYSIS_VERSION = "2.1.0";

async function callGroq(messages, temperature = 0.1, max_tokens = 2000) {
  const groqKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY || '';
  const xaiKey  = process.env.XAI_API_KEY || (process.env.GROK_API_KEY && process.env.GROK_API_KEY.startsWith('xai-') ? process.env.GROK_API_KEY : '');

  // 1. Try xAI Grok if key provided
  if (xaiKey) {
    const xaiModels = ['grok-2-1212', 'grok-2-vision-1212', 'grok-beta'];
    for (const model of xaiModels) {
      try {
        const res = await axios.post(
          'https://api.x.ai/v1/chat/completions',
          {
            model,
            messages,
            temperature,
            response_format: { type: 'json_object' }
          },
          {
            headers: {
              'Authorization': `Bearer ${xaiKey}`,
              'Content-Type':  'application/json'
            },
            timeout: 30000
          }
        );
        const text = res.data?.choices?.[0]?.message?.content;
        if (text) return text;
      } catch (err) {
        logger.warn(`xAI Grok model ${model} failed:`, err.response?.data?.error?.message || err.message);
      }
    }
  }

  // 2. Try Groq (GPT OSS / Llama)
  if (groqKey) {
    const groqModels = ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'openai/gpt-oss-20b', 'groq/compound'];
    for (const model of groqModels) {
      try {
        const res = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model,
            messages,
            temperature,
            max_tokens,
            response_format: { type: 'json_object' }
          },
          {
            headers: {
              'Authorization': `Bearer ${groqKey}`,
              'Content-Type':  'application/json'
            },
            timeout: 30000
          }
        );
        const text = res.data?.choices?.[0]?.message?.content;
        if (text) return text;
      } catch (err) {
        logger.warn(`Groq model ${model} failed:`, err.response?.data?.error?.message || err.message);
      }
    }
  }
  return null;
}

/**
 * EXACT Groq System Prompt with strict entity categories & contextual dates
 */
const GROQ_SYSTEM_PROMPT = `You are the AI legal-document intelligence engine for NotaryChain.

Your job is to analyze the ACTUAL CONTENT of the supplied document.

CRITICAL RULES:

1. Analyze only DOCUMENT_CONTENT.
Do NOT interpret PDF metadata, XMP metadata, C2PA manifests,
certificate authorities, SSL certificates, ReportLab information,
PDF producer information, PDF creator information, PDF object IDs,
font encoding data, cryptographic PDF metadata, or internal PDF
structures as legal document content.
Those values are technical metadata only.
Never treat a certificate authority such as SSL.com as a contracting party or legal signatory.
Never treat a C2PA signature as a human/legal signature.

2. CONTRACTING PARTY EXTRACTION (CRITICAL):
You must extract only actual named legal entities (companies, institutions, persons) as CONTRACTING_PARTY.
Never return a sentence fragment, clause, legal phrase, pronoun, document title, or generic role as a contracting party.

Do NOT extract phrases like:
- "This Mutual Non-Disclosure Agreement (the Agreement) is entered into by"
- "the parties hereto"
- "the undersigned"
- "the Agreement"
- "the Company"
- "the Client"
- "the Service Provider"
- "hereinafter referred to as..."
- "each party"
- "both parties"

If the document says:
"This Agreement is entered into by BlueLedger Analytics Pte. Ltd., a Singapore corporation and Northstar Robotics India Private Limited"
return:
[
  {
    "value": "BlueLedger Analytics Pte. Ltd.",
    "type": "organization",
    "source_page": 1,
    "confidence": 0.99
  },
  {
    "value": "Northstar Robotics India Private Limited",
    "type": "organization",
    "source_page": 1,
    "confidence": 0.99
  }
]

Do NOT classify sentence fragments or introductory phrases as an organization or party.
- "signatories": entities who sign the document.
- "team_members": individuals explicitly described as team members, contributors, authors, engineers, or developers (e.g. Rahul Sen, Ananya Das, Rohan Mehta, Priya Sharma, Kabir Roy).
- "individuals": other named persons (type: "PERSON").
- "organizations": other mentioned companies/institutions (type: "ORGANIZATION").

3. DATE SEMANTIC CONTEXT (CRITICAL):
Do NOT default every date to "EXECUTION" or "EXECUTION_DATE".
Preserve the exact semantic context surrounding each date:
- "label": descriptive phrase (e.g. "Project Started", "Prototype Review", "Final Testing", "Technology Exhibition", "Effective Date", "Payment Due Date", "Birth Date").
- "type": "PROJECT_START" | "PROJECT_REVIEW" | "TESTING_DATE" | "EXHIBITION_DATE" | "EFFECTIVE_DATE" | "EXECUTION_DATE" | "EXPIRATION_DATE" | "TERMINATION_DATE" | "PAYMENT_DUE_DATE" | "INVOICE_DATE" | "BIRTH_DATE" | "MILESTONE_DATE" | "OTHER".
- "value": "YYYY-MM-DD" or text.
If no execution date exists, execution_date is null. Never assign EXECUTION_DATE as a generic fallback.

4. LEGAL APPLICABILITY & TRUST SCORE:
- If the document is NOT a legal contract, financial instrument, or identity dossier (e.g. general document, project overview, technical spec):
  * "document.category": "general" | "other"
  * "legal_applicability": "NOT_APPLICABLE"
  * "trust_score": null
  * "risk_level": "NOT_APPLICABLE"
  * "extraction_confidence": 0.98
- If the document IS a legal contract, NDA, MSA, invoice, amendment, or identity document:
  * "legal_applicability": "APPLICABLE"
  * "trust_score": 10-98 (calculated based on completeness, balance, and risk)
  * "risk_level": "LOW" | "MEDIUM" | "HIGH"

Return structured JSON only matching this schema:
{
  "status": "SUCCESS",
  "document": {
    "title": "Extracted Document Title",
    "category": "contract|invoice|identity|amendment|general|other",
    "document_id": "Doc ID or N/A",
    "legal_applicability": "APPLICABLE|NOT_APPLICABLE",
    "confidence": 0.95
  },
  "contracting_parties": [
    { "value": "Name of party", "type": "organization|person", "source_page": 1, "confidence": 0.99 }
  ],
  "signatories": [
    { "value": "Name of Signatory", "role": "Title / Role", "source_page": 1, "confidence": 0.99 }
  ],
  "team_members": [
    { "value": "Name of Team Member", "role": "Role / Contributor", "source_page": 1 }
  ],
  "individuals": [
    { "value": "Name of Person", "source_page": 1 }
  ],
  "organizations": [
    { "value": "Name of Organization", "source_page": 1 }
  ],
  "dates": [
    { "label": "Project Started", "type": "PROJECT_START", "value": "2026-08-15", "source_page": 1 }
  ],
  "monetary_values": [
    { "type": "fee|subtotal|tax|total", "value": "6200", "currency": "USD", "source_page": 1 }
  ],
  "key_terms": [
    { "label": "Term label", "value": "Term details", "source_page": 1 }
  ],
  "clauses": [
    { "type": "confidentiality|liability|termination|governing_law|payment", "title": "Clause Title", "summary": "Clause summary", "source_page": 1 }
  ],
  "obligations": [
    { "party": "Party Name", "obligation": "Specific obligation", "source_page": 1 }
  ],
  "governing_law": "Detected governing jurisdiction or null",
  "contradictions": [
    { "explanation": "Detailed explanation of contradiction", "source_page": 1 }
  ],
  "missing_information": [],
  "risk_flags": [],
  "legal_applicability": "APPLICABLE|NOT_APPLICABLE",
  "trust_score": 85,
  "risk_level": "LOW|MEDIUM|HIGH|NOT_APPLICABLE",
  "technical_metadata_used_for_legal_analysis": false
}`;

/**
 * Fallback semantic analyzer when Groq API is offline
 */
function fallbackDocumentAnalysis(documentContent, title, category) {
  const allText = documentContent.pages.map(p => p.text).join('\n');
  const lower = allText.toLowerCase();

  const contractingParties = [];
  const teamMembers = [];
  const individuals = [];
  const signatories = [];
  const dates = [];
  const monetaryValues = [];
  const clauses = [];
  const riskFlags = [];
  const contradictions = [];
  const missingInfo = [];

  const isLegalInstrument = lower.includes('agreement') || lower.includes('contract') || lower.includes('nda') || lower.includes('invoice') || lower.includes('amendment') || lower.includes('identity') || lower.includes('verification');

  // Match team members
  const teamMatch = allText.match(/(?:Team Members?|Contributors?|Authors?|Engineers?|Developers?)[:\s\n]+([^\n.]+)/i);
  if (teamMatch) {
    const names = teamMatch[1].split(/[,;\n•\-\/]/).map(n => n.trim()).filter(n => n.length > 2);
    names.forEach(n => teamMembers.push({ value: n, role: 'Team Member', source_page: 1 }));
  }

  // Match parties from legal phrases
  const partyPhraseMatch = allText.match(/(?:entered into by and between|entered into between|by and between|between|parties:?|by and among)\s+([A-Z][a-zA-Z0-9\s.,&-]+?)\s+(?:and|&)\s+([A-Z][a-zA-Z0-9\s.,&-]+?)(?:\.|\n|Effective|\(|\s+a\s+[A-Z]|$)/i);
  if (partyPhraseMatch) {
    [partyPhraseMatch[1], partyPhraseMatch[2]].forEach(p => {
      const clean = p.replace(/^(?:Seller|Buyer)[:\s]*/i, '').trim();
      if (clean.length > 2 && !contractingParties.some(cp => cp.value === clean)) {
        contractingParties.push({ value: clean, type: 'organization', source_page: 1, confidence: 0.95 });
      }
    });
  }

  // Match parties from header lines
  const partyLineMatch = allText.match(/(?:Parties|By and Between|Seller|Buyer)[:\s\n]+([^\n.]+)/i);
  if (partyLineMatch) {
    const rawParties = partyLineMatch[1].split(/\s+(?:and|And|&)\s+/);
    rawParties.forEach(p => {
      const clean = p.replace(/^(?:Seller|Buyer)[:\s]*/i, '').trim();
      if (clean.length > 2 && !contractingParties.some(cp => cp.value === clean)) {
        contractingParties.push({ value: clean, type: 'organization', source_page: 1, confidence: 0.95 });
      }
    });
  }

  // Match organizations
  const orgMatches = allText.match(/([A-Z][a-zA-Z0-9\s.,&-]+(?:Pte\.?\s*Ltd\.?|Private\s*Limited|LLC|Inc\.?|Corp\.?|Corporation|Ltd\.?))/g);
  if (orgMatches) {
    const uniqueOrgs = [...new Set(orgMatches.map(o => o.trim()))];
    uniqueOrgs.slice(0, 4).forEach(org => {
      if (isLegalInstrument && !contractingParties.some(cp => cp.value === org)) {
        contractingParties.push({ value: org, type: 'organization', source_page: 1, confidence: 0.95 });
      }
    });
  }

  // Match signatories from structured sign blocks and inline "Signed: Name, Role and Name, Role"
  const signedLineMatch = allText.match(/(?:Signed:?|Signatures?:?|Signatory:?|Signed by:?)\s*([^\n.]+)/i);
  if (signedLineMatch) {
    const sigEntries = signedLineMatch[1].split(/\s+(?:and|And|&)\s+/);
    sigEntries.forEach(entry => {
      const parts = entry.split(/[,–-]\s*/);
      const name = parts[0].replace(/^(?:Signed:?|Signatures?:?|By:?|Client:?|Provider:?)\s*/i, '').trim();
      const role = parts[1] ? parts[1].trim() : 'Authorized Signatory';
      if (name.length > 2 && !signatories.some(s => s.value === name)) {
        signatories.push({ value: name, role: role, source_page: 1, confidence: 0.95 });
      }
    });
  }

  const sigMatches = allText.match(/(?:Signed by|Name:|Signatory:|Director:|CEO:|Chief Executive Officer:?|Signed by Provider:?|Signed by Client:?)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi);
  if (sigMatches) {
    sigMatches.forEach(sm => {
      const name = sm.replace(/^(?:Signed by|Name:|Signatory:|Director:|CEO:|Chief Executive Officer:?|Signed by Provider:?|Signed by Client:?)\s*/i, '').trim();
      if (!signatories.some(s => s.value === name)) {
        signatories.push({ value: name, role: 'Authorized Signatory', source_page: 1, confidence: 0.9 });
      }
    });
  }

  // Match financial terms
  const feeMatch = allText.match(/(?:Subtotal|Tax|Total Due|Total|New Monthly Retainer Fee|Fee)[:\s\n]*(?:USD|\$)?\s*([\d,]+(?:\.\d{2})?)/gi);
  if (feeMatch) {
    feeMatch.forEach(fm => {
      const labelMatch = fm.match(/^(Subtotal|Tax|Total Due|Total|New Monthly Retainer Fee|Fee)/i);
      const numMatch = fm.match(/[\d,]+(?:\.\d{2})?/);
      if (labelMatch && numMatch) {
        monetaryValues.push({
          type: labelMatch[1].toLowerCase().replace(/\s+/g, '_'),
          value: numMatch[0].replace(/,/g, ''),
          currency: 'USD',
          source_page: 1
        });
      }
    });
  }

  // Match dates with context (support YYYY-MM-DD, DD Month YYYY, Month DD, YYYY)
  const dateLineRegex = /([A-Za-z\s]+)[:—–-]\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]+\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/g;
  let dMatch;
  while ((dMatch = dateLineRegex.exec(allText)) !== null) {
    const label = dMatch[1].trim();
    const val = dMatch[2].trim();
    let type = 'OTHER';
    const lLow = label.toLowerCase();
    if (lLow.includes('start') || lLow.includes('commenc')) type = 'PROJECT_START';
    else if (lLow.includes('review')) type = 'PROJECT_REVIEW';
    else if (lLow.includes('test')) type = 'TESTING_DATE';
    else if (lLow.includes('exhibit')) type = 'EXHIBITION_DATE';
    else if (lLow.includes('effective')) type = 'EFFECTIVE_DATE';
    else if (lLow.includes('execution') || lLow.includes('signed')) type = 'EXECUTION_DATE';
    else if (lLow.includes('invoice') || lLow.includes('date')) type = 'INVOICE_DATE';
    dates.push({ label, type, value: val, source_page: 1 });
  }

  // Match governing law
  const govMatch = allText.match(/(?:Governing Law|Jurisdiction)[:\s]+(?:the\s+)?([A-Za-z\s]+?)(?:\.|\n|$)/i);
  const governingLaw = govMatch ? govMatch[1].trim() : (lower.includes('singapore') ? 'Singapore' : (lower.includes('california') ? 'State of California' : (lower.includes('delaware') ? 'Delaware' : null)));

  return {
    status: 'SUCCESS',
    document: {
      title: title || 'Document Analysis',
      category: isLegalInstrument ? (category || 'contract') : 'general',
      document_id: 'N/A',
      legal_applicability: isLegalInstrument ? 'APPLICABLE' : 'NOT_APPLICABLE',
      confidence: 0.90
    },
    contracting_parties: contractingParties,
    parties: contractingParties,
    team_members: teamMembers,
    individuals: individuals,
    signatories: signatories,
    dates: dates,
    monetary_values: monetaryValues,
    key_terms: [
      { label: 'Document Title', value: title, source_page: 1 },
      { label: 'Extracted Pages', value: `${documentContent.pages.length} page(s)`, source_page: 1 }
    ],
    clauses,
    obligations: [],
    governing_law: governingLaw,
    contradictions,
    missing_information: missingInfo,
    risk_flags: riskFlags,
    legal_applicability: 'APPLICABLE',
    trust_score: isLegalInstrument ? (contractingParties.length >= 2 ? 98 : 80) : 90,
    risk_level: isLegalInstrument ? (contractingParties.length >= 2 ? 'LOW' : 'MEDIUM') : 'LOW',
    technical_metadata_used_for_legal_analysis: false
  };
}

/**
 * Execute Groq AI analysis on pure document content
 */
async function analyzeDocumentContentWithGroq(documentContent, technicalMetadata, title, category, docIndex = 1) {
  const totalChars = documentContent.pages.reduce((acc, p) => acc + p.text.length, 0);
  if (totalChars < 10) {
    let parsedResponse = fallbackDocumentAnalysis(documentContent, title, category);
    const cat = (parsedResponse.document?.category || category || '').toLowerCase();
    const isLegal = parsedResponse.legal_applicability === 'APPLICABLE' ||
                    ['contract', 'agreement', 'nda', 'msa', 'amendment', 'invoice', 'financial', 'identity'].includes(cat);

    const deterministicScore = calculateDeterministicTrustScore({
      parties: parsedResponse.contracting_parties || [],
      signatories: parsedResponse.signatories || [],
      contradictions: parsedResponse.contradictions || [],
      missing_information: parsedResponse.missing_information || [],
      risk_flags: parsedResponse.risk_flags || [],
      identity_mismatch: false,
      biometric_score: null,
      category: cat,
      legal_applicability: isLegal ? 'APPLICABLE' : 'NOT_APPLICABLE'
    });

    parsedResponse.legal_applicability = deterministicScore.legal_applicability;
    parsedResponse.trust_score = deterministicScore.trust_score;
    parsedResponse.risk_level = deterministicScore.risk_level;
    parsedResponse.risk_factors = deterministicScore.risk_factors;
    parsedResponse.technical_metadata_used_for_legal_analysis = false;
    return parsedResponse;
  }

  const groqPayload = {
    document_index: docIndex,
    document: {
      filename: title,
      pages: documentContent.pages.map(p => ({
        page_number: p.page_number,
        text: p.text.substring(0, 3500)
      }))
    }
  };

  logger.info(`[GROK_REQUEST] Analyzing Document #${docIndex} "${title}" (${documentContent.pages.length} page(s), ${totalChars} chars)`);

  let parsedResponse = null;
  const rawGroq = await callGroq([
    { role: 'system', content: GROQ_SYSTEM_PROMPT },
    { role: 'user',   content: `You are analyzing Document #${docIndex} from a larger bundle. Please analyze this specific document content:\n\n${JSON.stringify(groqPayload, null, 2)}` }
  ]);

  if (rawGroq) {
    try {
      const jsonMatch = rawGroq.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      logger.warn('[GROK_RESPONSE] JSON parse error, falling back to deterministic parser:', parseErr.message);
    }
  }

  if (!parsedResponse) {
    parsedResponse = fallbackDocumentAnalysis(documentContent, title, category);
  }

  // Normalize contracting_parties vs general entities
  const cat = (parsedResponse.document?.category || category || '').toLowerCase();
  const isLegal = parsedResponse.legal_applicability === 'APPLICABLE' ||
                  ['contract', 'agreement', 'nda', 'msa', 'amendment', 'invoice', 'financial', 'identity'].includes(cat);

  const rawParties = Array.isArray(parsedResponse.contracting_parties) && parsedResponse.contracting_parties.length > 0
    ? parsedResponse.contracting_parties
    : (isLegal && Array.isArray(parsedResponse.parties) ? parsedResponse.parties : []);

  const cleanParties = sanitizePartiesList(rawParties);

  parsedResponse.contracting_parties = cleanParties;
  parsedResponse.parties = cleanParties; // backward compatibility
  parsedResponse.team_members = Array.isArray(parsedResponse.team_members) ? parsedResponse.team_members : [];
  parsedResponse.individuals = Array.isArray(parsedResponse.individuals) ? parsedResponse.individuals : [];
  parsedResponse.signatories = Array.isArray(parsedResponse.signatories) ? parsedResponse.signatories : [];

  // Extract grounded indicators from actual document content
  const docText = documentContent.pages.map(p => p.text).join('\n');
  const bioMatch = docText.match(/(?:Face|Facial|Biometric|Similarity)[\s\w:]*?(\d{1,2}(?:\.\d+)?)\s*%/i);
  const biometricScore = bioMatch ? parseFloat(bioMatch[1]) : null;
  const isIdentityMismatch = /mismatch|dob mismatch|name mismatch/i.test(docText);

  // Check contradictions in text
  const contradictions = [...(parsedResponse.contradictions || [])];
  if (/advance/i.test(docText) && /arrears/i.test(docText)) {
    if (!contradictions.some(c => (typeof c === 'string' ? c : (c.explanation || '')).toLowerCase().includes('advance'))) {
      contradictions.push({ explanation: 'Conflicting billing terms: agreement specifies both advance and arrears billing.', source_page: 1 });
    }
  }
  if (isIdentityMismatch && !contradictions.some(c => (typeof c === 'string' ? c : (c.explanation || '')).toLowerCase().includes('dob'))) {
    contradictions.push({ explanation: 'Identity verification failed: recorded DOB does not match scanned ID DOB.', source_page: 1 });
  }

  // Check risk flags in text
  const riskFlags = [...(parsedResponse.risk_flags || [])];
  if (/offshore|wire funds urgently|cayman/i.test(docText)) {
    if (!riskFlags.some(r => (typeof r === 'string' ? r : (r.flag || '')).toLowerCase().includes('offshore'))) {
      riskFlags.push({ severity: 'high', code: 'SUSPICIOUS_PAYMENT', flag: 'Suspicious payment instruction: wire transfer routed to offshore holding account.' });
    }
  }
  if (/subject to mutual written confirmation|effective date: subject to/i.test(docText)) {
    if (!riskFlags.some(r => (typeof r === 'string' ? r : (r.flag || '')).toLowerCase().includes('ambiguous'))) {
      riskFlags.push({ severity: 'medium', code: 'AMBIGUOUS_DATE', flag: 'Ambiguous effective date: relies on future unconfirmed confirmation.' });
    }
  }
  if (/missing signature date|missing client signature|blank\s*-\s*missing/i.test(docText)) {
    if (!riskFlags.some(r => (typeof r === 'string' ? r : (r.flag || '')).toLowerCase().includes('missing signature'))) {
      riskFlags.push({ severity: 'high', code: 'MISSING_SIGNATURES', flag: 'Client signature date is missing / unexecuted.' });
    }
  }

  // Compute authoritative deterministic Trust Score outside of LLM
  const deterministicScore = calculateDeterministicTrustScore({
    parties: cleanParties,
    signatories: parsedResponse.signatories,
    contradictions,
    missing_information: parsedResponse.missing_information || [],
    risk_flags: riskFlags,
    identity_mismatch: isIdentityMismatch,
    biometric_score: biometricScore,
    category: cat,
    legal_applicability: isLegal ? 'APPLICABLE' : 'NOT_APPLICABLE'
  });

  parsedResponse.contradictions = contradictions;
  parsedResponse.risk_flags = riskFlags;
  parsedResponse.legal_applicability = deterministicScore.legal_applicability;
  parsedResponse.trust_score = deterministicScore.trust_score;
  parsedResponse.risk_level = deterministicScore.risk_level;
  parsedResponse.risk_factors = deterministicScore.risk_factors;
  parsedResponse.technical_metadata_used_for_legal_analysis = false;

  return parsedResponse;
}

/* ─────────────────────────────────────────────────────────────── */

/**
 * POST /api/documents/upload
 * Full 18-step authoritative document verification and multi-document analysis pipeline
 */
exports.upload = async (req, res, next) => {
  try {
    logger.info('[UPLOAD] Document upload request received');
    const { title, category, description } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded. Please attach a file.' });
    }

    logger.info(`[PDF_VALIDATION] Validating file "${file.originalname}" (${file.mimetype}, ${file.size} bytes)`);

    // ── 0. Authoritative Account-Based Quota Check ────────────────
    const User = require('../models/User');
    let currentUserDoc = null;
    const rawUserId = req.user?._id || req.user?.id;
    if (rawUserId && mongoose.connection.readyState === 1) {
      if (mongoose.Types.ObjectId.isValid(rawUserId)) {
        currentUserDoc = await User.findById(rawUserId);
      } else if (req.user?.email) {
        currentUserDoc = await User.findOne({ email: req.user.email });
      }
      if (currentUserDoc) {
        const quota = currentUserDoc.getQuotaInfo();
        if (!quota.canVerify) {
          return res.status(403).json({
            success: false,
            isLimitReached: true,
            message: 'Free verification limit has been reached (3/3 in 24 hours). Upgrade to Pro to continue.',
            quota
          });
        }
      }
    }

    const docTitle = (title || path.parse(file.originalname).name).trim();

    // ── 1. Execute Evidence-Based Verification Pipeline ───────────
    const verificationResult = await processAndVerifyDocument({
      fileBuffer,
      originalFilename: file.originalname,
      mimetype: file.mimetype,
      docTitle,
      category: category || 'contract',
      user: req.user,
      clientOcrText: req.body.extractedText
    });

    const sha256Hash = verificationResult.fileHash;
    const document_content = verificationResult.documentContent || { pages: [{ page_number: 1, text: verificationResult.extractedText || '' }] };
    const technical_metadata = verificationResult.extractedMetadata || {};
    const primaryAiAnalysis = verificationResult.aiAnalysis;

    // ── 2. Multi-Document Bundle Detection ────────────────────────
    const bundleDetection = detectDocumentBundle(document_content, docTitle);
    logger.info(`[BUNDLE_DETECTION] Mode: ${bundleDetection.document_mode}, Detected ${bundleDetection.total_documents} document(s)`);

    let bundleResult = null;
    let aiError = null;

    if (bundleDetection.document_mode === 'BUNDLE') {
      try {
        const subDocAnalyses = await Promise.all(
          bundleDetection.documents.map(async (subDoc) => {
            const analysis = await analyzeEvidenceWithGrok({
              documentText: subDoc.content.pages.map(p => p.text).join('\n'),
              documentTitle: subDoc.title,
              filename: file.originalname,
              mimetype: file.mimetype,
              metadataEvidence: { technical_metadata },
              pageCount: subDoc.pages.length
            });
            return {
              document_index: subDoc.document_index,
              title: subDoc.title,
              category: subDoc.category,
              pages: subDoc.pages,
              content_hash: subDoc.content_hash,
              analysis
            };
          })
        );

        const highestRisk = subDocAnalyses.some(d => d.analysis?.risk_level === 'high')
          ? 'HIGH'
          : (subDocAnalyses.some(d => d.analysis?.risk_level === 'medium') ? 'MEDIUM' : 'LOW');

        const docsRequiringReview = subDocAnalyses.filter(
          d => d.analysis?.risk_level === 'high' || d.analysis?.risk_level === 'medium'
        ).length;

        bundleResult = {
          document_mode: 'BUNDLE',
          bundle_title: docTitle,
          bundle_sha256: sha256Hash,
          total_documents: subDocAnalyses.length,
          total_pages: document_content.pages.length,
          highest_risk: highestRisk,
          documents_requiring_review: docsRequiringReview,
          overall_status: docsRequiringReview > 0 ? 'REVIEW REQUIRED' : 'CLEAN',
          documents: subDocAnalyses
        };
      } catch (err) {
        logger.error('Bundle analysis error:', err.message);
        aiError = 'Bundle analysis partially completed';
      }
    } else {
      bundleResult = {
        document_mode: 'SINGLE',
        bundle_title: docTitle,
        bundle_sha256: sha256Hash,
        total_documents: 1,
        total_pages: document_content.pages.length,
        highest_risk: verificationResult.riskLevel || 'LOW',
        documents_requiring_review: verificationResult.verificationStatus === 'PENDING_REVIEW' ? 1 : 0,
        overall_status: verificationResult.verificationStatus,
        documents: [{
          document_index: 1,
          title: docTitle,
          category: verificationResult.documentType || category || 'contract',
          pages: document_content.pages.map(p => p.page_number),
          content_hash: sha256Hash,
          analysis: primaryAiAnalysis
        }]
      };
    }

    // ── 3. Save Document record & AI Report to MongoDB ────────────
    let docRecord = null;
    const combinedOcrText = document_content.pages.map(p => p.text).join('\n');

    if (mongoose.connection.readyState === 1) {
      const uId = currentUserDoc?._id || (mongoose.Types.ObjectId.isValid(rawUserId) ? rawUserId : new mongoose.Types.ObjectId());
      docRecord = await Document.create({
        title:            docTitle,
        description:      description || '',
        fileUrl:          `/uploads/${Date.now()}-${file.originalname}`,
        originalFileName: file.originalname,
        originalFilename: file.originalname,
        fileType:         path.extname(file.originalname).replace('.', '').toUpperCase(),
        fileSize:         file.size || fileBuffer.length,
        mimeType:         file.mimetype,
        uploadedBy:       uId,
        hash:             sha256Hash,
        fileHash:         sha256Hash,
        documentType:     verificationResult.documentType,
        extractedMetadata: technical_metadata,
        extractedText:    combinedOcrText.substring(0, 8000),
        aiAnalysis:       primaryAiAnalysis || null,
        verificationStatus: verificationResult.verificationStatus,
        verificationScore: verificationResult.verificationScore,
        riskScore:        verificationResult.riskScore,
        verificationReasons: verificationResult.verificationReasons,
        suspiciousIndicators: verificationResult.suspiciousIndicators,
        hashHistory:      verificationResult.hashHistory,
        blockchainRecord: verificationResult.blockchainRecord,
        status:           verificationResult.verificationStatus.toLowerCase(),
        category:         category || verificationResult.documentType || (bundleResult?.document_mode === 'BUNDLE' ? 'bundle' : 'contract'),
        uploadedAt:       new Date(),
        analyzedAt:       new Date(),
        analysisVersion:  '3.0.0-grok',
        metadata: {
          ocrText: combinedOcrText.substring(0, 8000),
          document_content,
          technical_metadata,
          bundle_result: bundleResult,
          aiAnalysis: primaryAiAnalysis || null,
          verificationResult
        }
      });

      try {
        await AIReport.create({
          documentId:     docRecord._id,
          reportType:     'summarization',
          status:         primaryAiAnalysis ? 'completed' : 'failed',
          results:        bundleResult || primaryAiAnalysis || { error: aiError },
          confidence:     verificationResult.verificationScore || 0,
          requestedBy:    req.user._id,
          processedAt:    new Date(),
          processingTime: 0
        });

        // Save AuditLog entry
        const AuditLog = require('../models/AuditLog');
        await AuditLog.create({
          userId: req.user._id || req.user.id,
          userRole: req.user.role || 'company',
          documentId: docRecord._id,
          action: 'DOCUMENT_UPLOADED',
          category: 'document',
          status: 'success',
          metadata: {
            title: docTitle,
            category: category || 'contract',
            hash: sha256Hash,
            document_mode: bundleResult?.document_mode,
            total_documents: bundleResult?.total_documents,
            verificationStatus: verificationResult.verificationStatus,
            verificationScore: verificationResult.verificationScore
          }
        });
        logger.info('[AUDIT_LOG] Audit log recorded successfully');
      } catch (dbErr) {
        logger.warn('Could not save AI report or audit log:', dbErr.message);
      }
    }

    // ── 4. Authoritative Quota Update ─────────────────────────────
    if (currentUserDoc) {
      currentUserDoc.subscription = currentUserDoc.subscription || {};
      const newCount = (currentUserDoc.subscription.verificationCount || 0) + 1;
      currentUserDoc.subscription.verificationCount = newCount;
      if ((currentUserDoc.subscription.plan || 'FREE') === 'FREE' && newCount >= 3) {
        currentUserDoc.subscription.currentPeriodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }
      await currentUserDoc.save();
    }

    // ── 5. Return Structured API Response ─────────────────────────
    return res.status(201).json({
      success: true,
      message: `Document processed. Verification Status: ${verificationResult.verificationStatus}`,
      data: {
        document: docRecord || {
          title: docTitle,
          hash: sha256Hash,
          fileHash: sha256Hash,
          verificationStatus: verificationResult.verificationStatus,
          verificationScore: verificationResult.verificationScore,
          originalFileName: file.originalname,
          fileSize: file.size
        },
        verificationStatus: verificationResult.verificationStatus,
        verificationScore: verificationResult.verificationScore,
        riskScore: verificationResult.riskScore,
        riskLevel: verificationResult.riskLevel,
        verificationReasons: verificationResult.verificationReasons,
        suspiciousIndicators: verificationResult.suspiciousIndicators,
        blockchainRecord: verificationResult.blockchainRecord,
        analysis_version: '3.0.0-grok',
        document_content,
        technical_metadata,
        bundle_result: bundleResult,
        aiAnalysis: primaryAiAnalysis || null,
        aiError: aiError || null
      }
    });
  } catch (err) {
    logger.error('Document upload error:', err.message);
    next(err);
  }
};

/* ─── Remaining CRUD handlers ─────────────────────────────────── */
const d = require('../services/documentService');
const h = require('../utils/helpers');

exports.getAll = async (req, res, next) => {
  try {
    const data = await d.getAll(req.user._id, req.user.role, h.getPaginationParams(req.query));
    r.paginated(res, data.data, req.query.page || 1, req.query.limit || 10, data.total);
  } catch (x) {
    next(x);
  }
};

exports.getById = async (req, res, next) => {
  try {
    r.success(res, await d.getById(req.params.id, req.user._id));
  } catch (x) {
    next(x);
  }
};

exports.update = async (req, res, next) => {
  try {
    r.success(res, await d.update(req.params.id, req.user._id, req.body));
  } catch (x) {
    next(x);
  }
};

exports.deleteDocument = async (req, res, next) => {
  try {
    await d.softDelete(req.params.id, req.user._id);
    r.success(res, null, 'Deleted');
  } catch (x) {
    next(x);
  }
};

// ─── Real uploadNewVersion with hash comparison & audit trail ──────────
exports.uploadNewVersion = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'Please attach a new document file for versioning.' });
    }

    const docId = req.params.id;
    const existingDoc = await Document.findOne({ _id: docId, uploadedBy: req.user._id, isDeleted: false });
    if (!existingDoc) {
      return res.status(404).json({ success: false, message: 'Document not found or unauthorized.' });
    }

    const fileBuffer = file.buffer || (file.path ? fs.readFileSync(file.path) : Buffer.from(''));
    const verificationResult = await processAndVerifyDocument({
      fileBuffer,
      originalFilename: file.originalname,
      mimetype: file.mimetype,
      docTitle: existingDoc.title,
      category: existingDoc.category,
      user: req.user,
      existingDoc
    });

    // Save previous version in versions array
    existingDoc.versions.push({
      versionNumber: existingDoc.currentVersion || 1,
      fileUrl: existingDoc.fileUrl,
      fileName: existingDoc.originalFileName,
      fileSize: existingDoc.fileSize,
      uploadedAt: existingDoc.updatedAt || existingDoc.createdAt,
      uploadedBy: req.user._id,
      changeNotes: req.body.changeNotes || `Updated to version ${(existingDoc.currentVersion || 1) + 1}`
    });

    existingDoc.currentVersion = (existingDoc.currentVersion || 1) + 1;
    existingDoc.fileUrl = `/uploads/${Date.now()}-${file.originalname}`;
    existingDoc.originalFileName = file.originalname;
    existingDoc.fileSize = file.size || fileBuffer.length;
    existingDoc.mimeType = file.mimetype;
    existingDoc.hash = verificationResult.fileHash;
    existingDoc.fileHash = verificationResult.fileHash;
    existingDoc.documentType = verificationResult.documentType;
    existingDoc.extractedMetadata = verificationResult.extractedMetadata;
    existingDoc.extractedText = verificationResult.extractedText?.substring(0, 8000);
    existingDoc.aiAnalysis = verificationResult.aiAnalysis;
    existingDoc.verificationStatus = verificationResult.verificationStatus;
    existingDoc.verificationScore = verificationResult.verificationScore;
    existingDoc.riskScore = verificationResult.riskScore;
    existingDoc.verificationReasons = verificationResult.verificationReasons;
    existingDoc.suspiciousIndicators = verificationResult.suspiciousIndicators;
    existingDoc.hashHistory = verificationResult.hashHistory;
    existingDoc.blockchainRecord = verificationResult.blockchainRecord;
    existingDoc.status = verificationResult.verificationStatus.toLowerCase();
    existingDoc.analyzedAt = new Date();

    await existingDoc.save();

    // Log in AuditLog
    const AuditLog = require('../models/AuditLog');
    await AuditLog.create({
      userId: req.user._id,
      userRole: req.user.role || 'company',
      documentId: existingDoc._id,
      action: 'DOCUMENT_VERSION_UPLOADED',
      category: 'document',
      status: 'success',
      metadata: {
        newHash: verificationResult.fileHash,
        version: existingDoc.currentVersion,
        isHashMismatch: verificationResult.isHashMismatch,
        newStatus: verificationResult.verificationStatus
      }
    });

    return res.status(200).json({
      success: true,
      message: `Version ${existingDoc.currentVersion} uploaded and audited. Status: ${verificationResult.verificationStatus}`,
      data: {
        document: existingDoc,
        verificationResult
      }
    });
  } catch (err) {
    logger.error('Upload new version error:', err.message);
    next(err);
  }
};

exports.shareDocument = async (req, res, next) => {
  try {
    r.success(res, await d.shareDocument(req.params.id, req.user._id, { user: req.body.userId, permission: req.body.permission }));
  } catch (x) {
    next(x);
  }
};

exports.removeShare = async (req, res, next) => {
  try {
    r.success(res, await d.removeShare(req.params.id, req.user._id, req.params.userId));
  } catch (x) {
    next(x);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    r.success(res, await d.updateStatus(req.params.id, req.user._id, req.user.role, req.body.status));
  } catch (x) {
    next(x);
  }
};

// ─── Real downloadDocument returning actual file metadata ───────────
exports.downloadDocument = async (req, res, next) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, uploadedBy: req.user._id, isDeleted: false });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    return res.json({
      success: true,
      data: {
        title: doc.title,
        originalFileName: doc.originalFileName,
        fileHash: doc.fileHash || doc.hash,
        verificationStatus: doc.verificationStatus,
        verificationScore: doc.verificationScore,
        downloadUrl: doc.fileUrl,
        mimeType: doc.mimeType,
        size: doc.fileSize
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.getTimeline = async (req, res, next) => {
  try {
    r.success(res, await d.getTimeline(req.params.id));
  } catch (x) {
    next(x);
  }
};
