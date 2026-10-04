/**
 * xAI Grok Document Intelligence & Reasoning Service for NotaryChain
 * Interfaces with xAI Grok API to provide structured analysis of document evidence.
 * AI recommendation is advisory only — the backend enforces final verification rules.
 */

const axios = require('axios');
const logger = require('../../utils/logger');

const XAI_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const XAI_BASE_URL = 'https://api.x.ai/v1/chat/completions';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

const GROK_MODELS = ['grok-2-latest', 'grok-2-1212', 'grok-beta'];
const FALLBACK_MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'groq/compound'];

const GROK_SYSTEM_PROMPT = `You are the xAI Grok Document Verification Reasoning Engine for NotaryChain.
Your role is to analyze extracted document evidence objectively without hallucinating authenticity.

CRITICAL RULES:
1. NEVER declare a document VERIFIED or AUTHENTIC merely because text was extracted or looks professional.
2. Only recommend "VERIFIED" if there is explicit, cryptographic, third-party, or verifiable proof. Otherwise recommend "UNVERIFIED" or "PENDING_REVIEW".
3. If contradictions, altered clauses, or suspicious wire/banking details exist, recommend "SUSPICIOUS".
4. If there is conclusive evidence of forgery or tamper mismatch, recommend "REJECTED".
5. Return STRICTLY a valid JSON object matching the following structure:
{
  "document_type": "contract | agreement | invoice | financial | identity | certificate | legal | general",
  "summary": "Objective concise summary of visible content",
  "extracted_fields": {
    "title": "Title of the document",
    "parties": [{"name": "Exact Entity Name", "role": "Party A / Disclosing / Customer", "page": 1}],
    "signatories": [{"name": "Signatory Name", "title": "Role/Title", "page": 1}],
    "dates": [{"label": "Effective Date / Issue Date", "value": "YYYY-MM-DD or string", "page": 1}],
    "document_numbers": ["Invoice #, Passport #, Registration #"],
    "financial_values": [{"type": "Fee / Total / Rate", "amount": "499", "currency": "INR / USD"}],
    "issuer": "Issuing organization or authority if evident"
  },
  "risk_level": "low | medium | high | critical",
  "suspicious_indicators": ["List of suspicious patterns, conflicting terms, or red flags"],
  "inconsistencies": ["List of internal contradictions"],
  "tampering_indicators": ["List of detected alterations or format anomalies"],
  "evidence": ["Concrete factual observations directly visible in text"],
  "recommended_status": "UNVERIFIED | PENDING_REVIEW | SUSPICIOUS | REJECTED",
  "confidence": 0.85,
  "reasoning": [
    "Step-by-step audit rationale 1",
    "Step-by-step audit rationale 2"
  ]
}

DO NOT wrap with markdown ticks if possible, but if returned, ensure it parses as standard JSON.`;

/**
 * Executes structured Grok analysis over extracted document content & evidence
 */
async function analyzeEvidenceWithGrok({
  documentText = '',
  documentTitle = '',
  filename = '',
  mimetype = '',
  metadataEvidence = {},
  pageCount = 1
}) {
  const promptContent = `DOCUMENT AUDIT REQUEST:
Filename: "${filename}" (${mimetype})
Title / Stated Name: "${documentTitle}"
Page Count: ${pageCount}
Structural & Metadata Findings: ${JSON.stringify(metadataEvidence)}

RAW EXTRACTED TEXT CONTENT (First 6,000 characters):
${documentText.slice(0, 6000)}

Please perform an evidence-based audit according to your system instructions.`;

  const messages = [
    { role: 'system', content: GROK_SYSTEM_PROMPT },
    { role: 'user', content: promptContent }
  ];

  // 1. Try xAI Grok Official API
  if (XAI_API_KEY) {
    for (const model of GROK_MODELS) {
      try {
        logger.info(`[GrokService] Attempting analysis with xAI model: ${model}`);
        const res = await axios.post(
          XAI_BASE_URL,
          {
            model,
            messages,
            temperature: 0.1,
            max_tokens: 2200,
            response_format: { type: 'json_object' }
          },
          {
            headers: {
              'Authorization': `Bearer ${XAI_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 25000
          }
        );

        const rawText = res.data?.choices?.[0]?.message?.content;
        const validated = validateGrokResponse(rawText, model);
        if (validated) {
          logger.info(`[GrokService] Successfully analyzed via xAI Grok (${model})`);
          return validated;
        }
      } catch (err) {
        logger.warn(`[GrokService] xAI model ${model} error:`, err.response?.data?.error?.message || err.message);
      }
    }
  }

  // 2. Fallback to Open Source LLMs via Groq (Llama / Qwen) — NEVER Gemini
  if (GROQ_API_KEY) {
    for (const model of FALLBACK_MODELS) {
      try {
        logger.info(`[GrokService] Running fallback analysis via Groq model: ${model}`);
        const res = await axios.post(
          GROQ_BASE_URL,
          {
            model,
            messages,
            temperature: 0.1,
            max_tokens: 2200,
            response_format: { type: 'json_object' }
          },
          {
            headers: {
              'Authorization': `Bearer ${GROQ_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 20000
          }
        );

        const rawText = res.data?.choices?.[0]?.message?.content;
        const validated = validateGrokResponse(rawText, `Groq (${model})`);
        if (validated) {
          logger.info(`[GrokService] Successfully analyzed via Groq fallback (${model})`);
          return validated;
        }
      } catch (err) {
        logger.warn(`[GrokService] Groq model ${model} error:`, err.response?.data?.error?.message || err.message);
      }
    }
  }

  // 3. Deterministic Local Reasoning Fallback (When API offline or credentials empty)
  logger.warn('[GrokService] Cloud AI services unreachable. Executing deterministic local reasoning.');
  return generateDeterministicAnalysis(documentText, documentTitle, filename);
}

/**
 * Validates and sanitizes structured Grok output
 */
function validateGrokResponse(rawText, engineName) {
  if (!rawText) return null;
  try {
    let clean = rawText.trim();
    if (clean.startsWith('```json')) clean = clean.slice(7);
    if (clean.startsWith('```')) clean = clean.slice(3);
    if (clean.endsWith('```')) clean = clean.slice(0, -3);

    const parsed = JSON.parse(clean.trim());

    const validStatuses = ['UNVERIFIED', 'PENDING_REVIEW', 'SUSPICIOUS', 'REJECTED', 'VERIFIED'];
    const validRisks = ['low', 'medium', 'high', 'critical'];

    return {
      engine: engineName,
      document_type: (parsed.document_type || 'general').toLowerCase(),
      summary: parsed.summary || 'Summary unavailable.',
      extracted_fields: {
        title: parsed.extracted_fields?.title || '',
        parties: Array.isArray(parsed.extracted_fields?.parties) ? parsed.extracted_fields.parties : [],
        signatories: Array.isArray(parsed.extracted_fields?.signatories) ? parsed.extracted_fields.signatories : [],
        dates: Array.isArray(parsed.extracted_fields?.dates) ? parsed.extracted_fields.dates : [],
        document_numbers: Array.isArray(parsed.extracted_fields?.document_numbers) ? parsed.extracted_fields.document_numbers : [],
        financial_values: Array.isArray(parsed.extracted_fields?.financial_values) ? parsed.extracted_fields.financial_values : [],
        issuer: parsed.extracted_fields?.issuer || ''
      },
      risk_level: validRisks.includes(parsed.risk_level?.toLowerCase()) ? parsed.risk_level.toLowerCase() : 'medium',
      suspicious_indicators: Array.isArray(parsed.suspicious_indicators) ? parsed.suspicious_indicators : [],
      inconsistencies: Array.isArray(parsed.inconsistencies) ? parsed.inconsistencies : [],
      tampering_indicators: Array.isArray(parsed.tampering_indicators) ? parsed.tampering_indicators : [],
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      recommended_status: validStatuses.includes(parsed.recommended_status?.toUpperCase()) ? parsed.recommended_status.toUpperCase() : 'UNVERIFIED',
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7,
      reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning : []
    };
  } catch (err) {
    logger.error('[GrokService] Failed to parse Grok JSON output:', err.message);
    return null;
  }
}

/**
 * Deterministic local fallback generator
 */
function generateDeterministicAnalysis(text, title, filename) {
  const lower = (text || '').toLowerCase();
  const isAgreement = ['agreement', 'contract', 'nda', 'confidentiality'].some(k => lower.includes(k) || filename.toLowerCase().includes(k));
  const isInvoice = ['invoice', 'bill', 'receipt', 'tax invoice'].some(k => lower.includes(k));

  const docType = isAgreement ? 'contract' : (isInvoice ? 'invoice' : 'general');
  const parties = [];
  if (isAgreement) {
    const partyAMatch = text.match(/party\s*a\s*:?\s*([^\n\r]+)/i);
    const partyBMatch = text.match(/party\s*b\s*:?\s*([^\n\r]+)/i);
    if (partyAMatch) parties.push({ name: partyAMatch[1].trim(), role: 'Party A', page: 1 });
    if (partyBMatch) parties.push({ name: partyBMatch[1].trim(), role: 'Party B', page: 1 });
  }

  return {
    engine: 'Deterministic Local Rule Engine',
    document_type: docType,
    summary: `Analyzed document "${title || filename}" containing ${text.length} characters of readable content.`,
    extracted_fields: {
      title: title || filename,
      parties,
      signatories: [],
      dates: [],
      document_numbers: [],
      financial_values: [],
      issuer: ''
    },
    risk_level: parties.length >= 2 ? 'low' : 'medium',
    suspicious_indicators: [],
    inconsistencies: [],
    tampering_indicators: [],
    evidence: [`Extracted ${text.length} characters of direct text.`],
    recommended_status: parties.length >= 2 ? 'UNVERIFIED' : 'PENDING_REVIEW',
    confidence: 0.8,
    reasoning: [
      'Cloud AI unavailable; evaluated with deterministic structural rules.',
      parties.length >= 2 ? 'Identified bilateral contracting parties.' : 'Missing explicit bilateral party declarations.'
    ]
  };
}

module.exports = {
  analyzeEvidenceWithGrok,
  validateGrokResponse
};
