require('dotenv').config({ path: './.env' });
const axios = require('axios');
const key = process.env.GEMINI_API_KEY;

const payloads = [
  { name: 'basic', text: 'Reply with exactly: HELLO_GEMINI' },
  { name: 'document', text: 'A digital document has a valid digital signature, an unchanged SHA-256 hash, and a complete audit trail.\n\nGive a short assessment of what these signals indicate about document integrity.\nDo not claim that they prove the document is legally valid.' },
  { name: 'longer', text: 'Explain the difference between:\n1. document integrity,\n2. identity verification,\n3. digital signature verification,\n4. liveness verification,\n5. blockchain timestamping.\n\nKeep the explanation concise and technically accurate.' },
  { name: 'structured', text: 'Return a JSON object with exactly these fields:\n{\n  "document_type": "contract",\n  "risk_level": "low",\n  "summary": "short summary"\n}\n\nReturn valid JSON only.' }
];

(async () => {
  for (const p of payloads) {
    try {
      const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${key}`, {
        contents: [{ role: 'user', parts: [{ text: p.text }] }],
        generationConfig: p.name === 'structured' ? { temperature: 0.2, maxOutputTokens: 700, responseMimeType: 'application/json' } : { temperature: 0.3, maxOutputTokens: 700 }
      }, { timeout: 30000, headers: { 'Content-Type': 'application/json' } });
      const candidate = res.data?.candidates?.[0];
      const text = candidate?.content?.parts?.map((x) => x.text || '').join('') || '';
      const finishReason = candidate?.finishReason || 'UNKNOWN';
      const safety = candidate?.safetyRatings || [];
      console.log('CASE=' + p.name);
      console.log('status=' + res.status);
      console.log('finishReason=' + finishReason);
      console.log('textLength=' + text.length);
      console.log('textPreview=' + (text ? text.slice(0, 140).replace(/\n/g, ' ') : 'EMPTY'));
      console.log('safety=' + (safety.length ? safety.map((s) => s.category + ':' + s.probability).join(' | ') : 'NONE'));
      console.log('---');
    } catch (err) {
      console.log('CASE=' + p.name);
      console.log('errorStatus=' + (err.response?.status || 'NO_STATUS'));
      console.log('errorMessage=' + (err.response?.data?.error?.message || err.message || 'NO_MESSAGE'));
      console.log('---');
    }
  }
})();
