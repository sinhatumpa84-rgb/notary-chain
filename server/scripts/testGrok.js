const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const key = process.env.XAI_API_KEY;
console.log('Key exists:', !!key, 'length:', key ? key.length : 0);

async function testGrok() {
  const models = ['grok-2-latest', 'grok-2-1212', 'grok-beta'];
  for (const model of models) {
    try {
      console.log(`Testing model: ${model}...`);
      const res = await axios.post('https://api.x.ai/v1/chat/completions', {
        model,
        messages: [{ role: 'user', content: 'Return a JSON object: {"status": "success", "engine": "grok"}' }],
        response_format: { type: 'json_object' }
      }, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      console.log(`Success with ${model}:`, res.data.choices[0].message.content);
      return;
    } catch (err) {
      console.error(`Failed with ${model}:`, err.response?.status, err.response?.data || err.message);
    }
  }
}

testGrok();
