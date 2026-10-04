require('dotenv').config({ path: './.env' });
const axios = require('axios');
const key = process.env.GEMINI_API_KEY;

const build = (label) => ({
  label,
  request: axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${key}`, {
    contents: [{ role: 'user', parts: [{ text: `Respond with exactly: ${label}` }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 200 }
  }, { timeout: 30000, headers: { 'Content-Type': 'application/json' } })
});

(async () => {
  const calls = [build('REQUEST_1'), build('REQUEST_2'), build('REQUEST_3')];
  const results = await Promise.allSettled(calls.map(c => c.request));
  for (const [i, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      const c = result.value.data?.candidates?.[0];
      const text = (c?.content?.parts || []).map((p) => p.text || '').join('');
      console.log('INDEX=' + i + ' status=' + result.value.status + ' finishReason=' + (c?.finishReason || 'UNKNOWN') + ' text=' + text);
    } else {
      console.log('INDEX=' + i + ' error=' + (result.reason.response?.status || 'NO_STATUS') + ' message=' + (result.reason.response?.data?.error?.message || result.reason.message));
    }
  }
})();
