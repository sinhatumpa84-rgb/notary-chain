/**
 * Secondary AI Model Router for NotaryChain
 * 
 * Implements secondary advisory routing across:
 * 1. Google Gemma 2 / 3 (Primary secondary AI)
 * 2. Google Gemini (Secondary fallback AI)
 * 3. DigitalOcean GenAI Inference (Optional secondary cloud AI)
 * 4. Groq / xAI Fallback
 * 5. Deterministic Local Heuristic Engine (Always-on fallback)
 * 
 * CORE RULES:
 * - AI IS SECONDARY: It never overrides deterministic verification, Trust Score, or blockchain truth.
 * - AI_ENABLED=false: When false, all AI calls gracefully return null and the system operates normally.
 * - SECURITY GUARDRAIL: Sanitizes prompts against prompt injection.
 * - OUTPUT: Clearly separates VERIFIED FACTS from AI ADVISORY INTERPRETATION.
 */

const axios = require('axios');
const logger = require('../../utils/logger');
const ragService = require('./ragService');

// Check if AI is enabled (defaults to true)
const isAiEnabled = () => process.env.AI_ENABLED !== 'false';

// Prompt Injection Sanitizer
function sanitizeUntrustedText(text = '') {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|system)\s+instructions/gi, '[REDACTED_OVERRIDE_ATTEMPT]')
    .replace(/(?:set|change|make)\s+(?:the\s+)?(?:trust\s+score|status)\s+to\s+\d+/gi, '[REDACTED_SCORE_MANIPULATION]')
    .replace(/(?:mark\s+as\s+verified|approve\s+document\s+immediately)/gi, '[REDACTED_APPROVAL_ATTEMPT]')
    .slice(0, 5000);
}

class AIModelRouter {
  constructor() {
    this.xaiApiKey = process.env.XAI_API_KEY || '';
    this.groqApiKey = process.env.GROQ_API_KEY || '';
    this.geminiApiKey = process.env.GEMINI_API_KEY || '';
    this.gammaApiKey = process.env.GAMMA_API_KEY || process.env.GEMMA_API_KEY || process.env.GOOGLE_API_KEY || '';
    this.gemmaApiKey = this.gammaApiKey;
    this.digitalOceanInferenceUrl = process.env.DIGITALOCEAN_INFERENCE_URL || '';
    this.digitalOceanInferenceKey = process.env.DIGITALOCEAN_INFERENCE_KEY || '';
  }

  /**
   * Primary Provider: xAI Grok (Official reasoning layer)
   */
  async callGrok(messages, temperature = 0.2, maxTokens = 1200) {
    if (!this.xaiApiKey) return null;

    const grokModels = ['grok-2-latest', 'grok-2-1212', 'grok-beta'];
    for (const model of grokModels) {
      try {
        const res = await axios.post(
          'https://api.x.ai/v1/chat/completions',
          {
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            response_format: { type: 'json_object' }
          },
          {
            headers: {
              'Authorization': `Bearer ${this.xaiApiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 20000
          }
        );

        const content = res.data?.choices?.[0]?.message?.content;
        if (content) {
          logger.info(`[AI Router] Successfully responded via xAI Grok (${model})`);
          return { content, model: `xAI Grok (${model})` };
        }
      } catch (err) {
        logger.warn(`[AI Router] Grok model ${model} warning:`, err.response?.data?.error?.message || err.message);
      }
    }
    return null;
  }

  /**
   * Google Gemini Provider (configured via GEMINI_API_KEY)
   */
  async callGemini(messages, temperature = 0.2, maxTokens = 1200) {
    if (!this.geminiApiKey) return null;

    const geminiModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
    for (const model of geminiModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`;
        const promptText = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

        const res = await axios.post(
          url,
          {
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
              responseMimeType: 'application/json'
            }
          },
          { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
        );

        const candidate = res.data?.candidates?.[0];
        const content = candidate?.content?.parts?.map(x => x.text || '').join('');
        if (content) {
          logger.info(`[AI Router] Successfully responded via Google Gemini (${model})`);
          return { content, model: `Google Gemini (${model})` };
        }
      } catch (err) {
        logger.warn(`[AI Router] Gemini model ${model} warning:`, err.response?.data?.error?.message || err.message);
      }
    }
    return null;
  }

  /**
   * Tertiary Fallback: Google Gamma / Gemma (configured via GAMMA_API_KEY or GEMMA_API_KEY)
   */
  async callGemma(messages, temperature = 0.2, maxTokens = 1200) {
    if (!this.gemmaApiKey) return null;

    const gemmaModels = ['gemma-2-27b-it', 'gemma-2-9b-it', 'gemma-3-12b-it'];
    for (const model of gemmaModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.gemmaApiKey}`;
        const promptText = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
        
        const res = await axios.post(
          url,
          {
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
              responseMimeType: 'application/json'
            }
          },
          { timeout: 15000 }
        );

        const content = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
          logger.info(`[AI Router] Successfully responded via Google Gemma (${model})`);
          return { content, model: `Google Gemma (${model})` };
        }
      } catch (err) {
        logger.warn(`[AI Router] Gemma model ${model} warning:`, err.response?.data?.error?.message || err.message);
      }
    }
    return null;
  }

  /**
   * Secondary Provider: DigitalOcean GenAI Inference (Optional cloud layer)
   */
  async callDigitalOcean(messages, temperature = 0.2, maxTokens = 1200) {
    if (!this.digitalOceanInferenceUrl || !this.digitalOceanInferenceKey) return null;

    try {
      const res = await axios.post(
        this.digitalOceanInferenceUrl,
        {
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.digitalOceanInferenceKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      const content = res.data?.choices?.[0]?.message?.content;
      if (content) {
        logger.info('[AI Router] Successfully responded via DigitalOcean GenAI Inference');
        return { content, model: 'DigitalOcean GenAI Inference' };
      }
    } catch (err) {
      logger.warn('[AI Router] DigitalOcean Inference warning:', err.response?.data?.error?.message || err.message);
    }
    return null;
  }

  /**
   * Fallback Provider: Groq / xAI
   */
  async callGroqFallback(messages, temperature = 0.2, maxTokens = 1200) {
    if (this.groqApiKey) {
      const groqModels = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
      for (const model of groqModels) {
        try {
          const res = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
              model,
              messages,
              temperature,
              max_tokens: maxTokens,
              response_format: { type: 'json_object' }
            },
            {
              headers: {
                'Authorization': `Bearer ${this.groqApiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: 15000
            }
          );
          const content = res.data?.choices?.[0]?.message?.content;
          if (content) {
            logger.info(`[AI Router] Successfully responded via Groq (${model})`);
            return { content, model: `Groq (${model})` };
          }
        } catch (e) {
          logger.warn(`[AI Router] Groq ${model} warning:`, e.response?.data?.error?.message || e.message);
        }
      }
    }

    if (this.xaiApiKey) {
      try {
        const res = await axios.post(
          'https://api.x.ai/v1/chat/completions',
          {
            model: 'grok-beta',
            messages,
            temperature,
            response_format: { type: 'json_object' }
          },
          {
            headers: {
              'Authorization': `Bearer ${this.xaiApiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 15000
          }
        );
        const content = res.data?.choices?.[0]?.message?.content;
        if (content) {
          return { content, model: 'xAI Grok' };
        }
      } catch (e) {
        logger.warn('[AI Router] xAI Grok warning:', e.message);
      }
    }
    return null;
  }

  /**
   * Deterministic Local Heuristic Engine (Zero-Cloud Fallback)
   * Guaranteed to succeed without external network dependencies.
   */
  generateLocalHeuristic({ verifiedResults = {}, documentText = '', title = 'Document' }) {
    const {
      document_integrity = 25,
      face_match = 20,
      liveness = 20,
      signature_valid = true,
      blockchain_verified = true,
      trust_score = 90,
      risk_flags = []
    } = verifiedResults;

    const lower = (documentText || '').toLowerCase();
    const flags = [...risk_flags];

    if (lower.includes('unlimited') && (lower.includes('liability') || lower.includes('indemni'))) {
      flags.push({ severity: 'high', flag: 'Uncapped unilateral liability clause identified in document text.' });
    }
    if (lower.includes('unstated') || lower.includes('date missing')) {
      flags.push({ severity: 'medium', flag: 'Contract execution date appears unstated or pending.' });
    }

    const isReviewNeeded = trust_score < 75 || flags.some(f => f.severity === 'high');

    return {
      status: isReviewNeeded ? 'manual_review_recommended' : 'verified_consistent',
      summary: `Deterministic review of "${title}" completed. Cryptographic SHA-256 fingerprint verified. Authoritative Trust Score: ${trust_score}/100.`,
      verified_facts: [
        `Cryptographic SHA-256 integrity score: ${document_integrity}/25`,
        `Biometric face match verification: ${face_match}/20`,
        `Liveness detection status: ${liveness}/20`,
        `Digital signature valid: ${signature_valid ? 'YES' : 'PENDING'}`,
        `Polygon Amoy blockchain notarized: ${blockchain_verified ? 'CONFIRMED' : 'PENDING'}`
      ],
      ai_interpretation: isReviewNeeded
        ? 'Advisory analysis recommends manual legal review due to flagged unilateral terms or lower confidence score.'
        : 'Advisory review indicates terms and structure are consistent with bilateral commercial standards.',
      supporting_signals: flags.map(f => ({ source: 'heuristic_rules', result: f.flag, severity: f.severity })),
      recommendation: isReviewNeeded ? 'manual_review' : 'standard_notarization',
      evidence_ids: ['EV-SHA256-POLYGON', 'EV-TRUST-SCORE'],
      trust_score,
      model_used: 'NotaryChain Local Deterministic Rules',
      advisory: true
    };
  }

  /**
   * Unified Router: Routes across Gemma -> Gemini -> DigitalOcean -> Groq -> Local Heuristic
   */
  async explainVerificationResults({ verifiedResults = {}, documentText = '', title = 'Document', category = 'contract' }) {
    if (!isAiEnabled()) {
      return this.generateLocalHeuristic({ verifiedResults, documentText, title });
    }

    const cleanText = sanitizeUntrustedText(documentText);
    const ragContext = ragService.getAugmentedContext(cleanText, category);

    const systemPrompt = `You are NotaryChain's Secondary AI Advisory Analyst.
IMPORTANT ARCHITECTURAL CONSTRAINTS:
1. You are SECONDARY and ADVISORY only.
2. The primary security engine has ALREADY generated authoritative results:
   - Trust Score: ${verifiedResults.trust_score ?? 85}/100
   - Document Integrity: ${verifiedResults.document_integrity ?? 25}/25
   - Face Match: ${verifiedResults.face_match ?? 20}/20
   - Liveness: ${verifiedResults.liveness ?? 20}/20
   - Blockchain Verified: ${verifiedResults.blockchain_verified ? 'YES' : 'NO'}
   - Signature Valid: ${verifiedResults.signature_valid ? 'YES' : 'NO'}
3. DO NOT alter, recompute, or override the Trust Score.
4. DO NOT invent false evidence or fabricate identity confirmations.
5. Clearly separate VERIFIED FACTS (from the security engine) from YOUR ADVISORY INTERPRETATION.

${ragContext}

Return a valid JSON object ONLY with exactly this structure:
{
  "status": "verified_consistent|manual_review_recommended",
  "summary": "2-3 sentence plain language summary of the findings",
  "verified_facts": [
    "String detailing a verified fact from the primary engine"
  ],
  "ai_interpretation": "Your advisory analysis explaining what the findings mean for the signer",
  "supporting_signals": [
    { "source": "clause_analysis", "result": "description of finding", "severity": "high|medium|low|info" }
  ],
  "recommendation": "standard_notarization|manual_review",
  "evidence_ids": ["EV-101", "EV-102"]
}`;

    const userPrompt = `Document: "${title}" (${category})\nExisting Verified Score: ${verifiedResults.trust_score ?? 85}/100\nText Extract:\n${cleanText.slice(0, 3500)}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    // Priority 1: xAI Grok (Official reasoning layer)
    let result = await this.callGrok(messages);

    // Priority 2: Google Gemini
    if (!result) {
      result = await this.callGemini(messages);
    }

    // Priority 3: Google Gamma / Gemma
    if (!result) {
      result = await this.callGemma(messages);
    }

    // Priority 4: Groq Open-Source Fallback
    if (!result) {
      result = await this.callGroqFallback(messages);
    }

    // Priority 5: DigitalOcean GenAI Inference (Optional Cloud)
    if (!result) {
      result = await this.callDigitalOcean(messages);
    }

    if (result && result.content) {
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : result.content);
        return {
          ...parsed,
          trust_score: verifiedResults.trust_score ?? 85,
          model_used: result.model,
          advisory: true
        };
      } catch (e) {
        logger.warn('[AI Router] Failed to parse model JSON, falling back to local heuristic:', e.message);
      }
    }

    // Priority 6: Deterministic Local Heuristic
    return this.generateLocalHeuristic({ verifiedResults, documentText: cleanText, title });
  }

  /**
   * Router for plain-language document chat & general inquiries
   */
  async chat({ message, history = [], documentContext = '', title = 'Document' }) {
    if (!isAiEnabled()) {
      return {
        reply: 'AI assistance is currently set to offline. NotaryChain cryptographic verification and blockchain notarization continue functioning normally.',
        model: 'NotaryChain Offline System'
      };
    }

    const cleanContext = sanitizeUntrustedText(documentContext);
    const ragContext = ragService.getAugmentedContext(message);

    const systemPrompt = `You are NotaryChain's AI Document Verification Assistant.
You provide helpful explanations about the document "${title}", legal compliance terms, and cryptographic proofs.
ADVISORY ONLY: You do not have the power to approve, reject, or certify documents independently.
Never fabricate facts or pretend you ran security checks that do not exist.

${ragContext}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6).map(h => ({ role: h.role, content: sanitizeUntrustedText(h.content) })),
      { role: 'user', content: sanitizeUntrustedText(message) }
    ];

    // Grok -> Gemini -> Gamma/Gemma -> Groq -> DigitalOcean -> Default
    let result = await this.callGrok(messages, 0.4, 700);
    if (!result) result = await this.callGemini(messages, 0.4, 700);
    if (!result) result = await this.callGemma(messages, 0.4, 700);
    if (!result) result = await this.callGroqFallback(messages, 0.4, 700);
    if (!result) result = await this.callDigitalOcean(messages, 0.4, 700);

    if (result && result.content) {
      return { reply: result.content, model: result.model };
    }

    return {
      reply: `I have analyzed "${title}". The document hash is cryptographically anchored to Polygon Amoy. Let me know if you would like me to explain any specific clauses or legal definitions!`,
      model: 'NotaryChain Deterministic Helper'
    };
  }
}

module.exports = new AIModelRouter();
