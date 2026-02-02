// ======================================================
// File: llm.js
// Purpose: Unified LLM API handler with Cloudflare Gateway
// Supports: Groq, OpenAI, Gemini
// ======================================================


import OpenAI from 'openai';

/**
@param {Object} config
@param {string} config.model - The model to use (e.g., "groq", "openai", "gemini").
@param {number} config.temperature - The sampling temperature to use (default: 0.7).
@param {number} config.maxOutputTokens - The maximum number of tokens to generate (default: 1024).
@param {boolean} config.verbose - Whether to enable verbose logging (default: false).
@param {Object} config.api_keys - API keys for different providers. {groq, openai, gemini}
@param {Object} config.cloudflare - Cloudflare Gateway configuration. {accountId, gatewayId, cfAIGToken}
**/

export class ChatLLM {
  constructor(config = {}) {
    this.model = config.model;
    this.temperature = config.temperature || 0.7;
    this.maxOutputTokens = config.maxOutputTokens || 1024;
    this.verbose = config.verbose || false;
    this.groqAPIKey = config.api_keys?.groq || null;
    this.openaiAPIKey = config.api_keys?.openai || null;
    this.geminiAPIKey = config.api_keys?.gemini || null;
    this.accountId = config.cloudflare?.accountId || null;
    this.gatewayId = config.cloudflare?.gatewayId || null;
    this.cfAIGToken = config.cloudflare?.cfAIGToken || null;
    this._lastRawData = null; // store last raw response for debugging
  }

  estimateTokens(str = '') {
    return Math.ceil((str || '').length / 4);
  }

  // ======================================================
  // 🔹 Entry Point
  // ======================================================
  async chat(userInput, options = {}) {
    const messages = [
      { role: 'system', content: userInput.system || '' },
      { role: 'user', content: userInput.user || '' },
    ];

    if (this.verbose || options.verbose) {
      console.log('\n================ LLM REQUEST ================');
      console.log(JSON.stringify({ model: this.model, messages }, null, 2));
      console.log('=============================================\n');
    }

    // Choose target model provider
    const provider = this._detectProvider(this.model);

    try {
      switch (provider) {
        case 'groq':
          return await this._callGroq(messages, options);
        case 'openai':
          return await this._callOpenAI(messages, options);
        case 'gemini':
          return await this._callGemini(messages, options);
        default:
          throw new Error('Unknown model provider');
      }
    } catch (err) {
      console.error('ChatLLM.chat error:', err);
      return { text: '', tokensUsed: 0, error: err.message };
    }
  }

  _detectProvider(model) {
    if (model?.includes('llama') || model?.includes('mixtral')) return 'groq';
    if (model?.includes('gpt')) return 'openai';
    if (model?.includes('gemini')) return 'gemini';
    return 'openai';
  }

  // ======================================================
  // 🔹 Cloudflare Gateway Handler
  // ======================================================
  async _callCloudflareGateway(provider, messages, model) {
    if (!this.accountId || !this.gatewayId || !this.cfAIGToken) {
      throw new Error('Missing Cloudflare Gateway configuration');
    }

    const url = `https://gateway.ai.cloudflare.com/v1/${this.accountId}/${this.gatewayId}/compat/chat/completions`;

    const body = {
      model: `${provider}/${model}`,
      temperature: this.temperature,
      max_tokens: this.maxOutputTokens,
      messages: messages,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'cf-aig-authorization': `Bearer ${this.cfAIGToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`CFAIG API error: ${res.status} - ${errText}`);
    }

    const data = await res.json().catch((e) => {
      throw new Error(`Failed to parse CFAIG JSON: ${e.message}`);
    });

    const text = data?.choices?.[0]?.message?.content || '';
    const usage = data?.usage || {};
    // 🔧 Strip everything outside the first {...} block if JSON-like content exists
    const output = this._extractJSON(text);

    if (this.verbose) {
      console.log(
        `\n================ GATEWAY RESPONSE (${model}) ================`
      );
      console.log(JSON.stringify(data, null, 2));
      console.log('=====================================================\n');
    }

    return { text: output, usage, raw: data };
  }

  // ======================================================
  // 🔹 Groq (Llama / Mixtral)
  // ======================================================
  async _callGroq(messages, options) {
    const model = this.model || 'llama3-8b-8192';

    // Prefer Cloudflare Gateway
    if (this.cfAIGToken) {
      return await this._callCloudflareGateway('groq', messages, model);
    }

    // Fallback: Direct Groq API
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.groqAPIKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: this.temperature,
      }),
    });

    const data = await res.json().catch((e) => {
      throw new Error(`Failed to parse Groq JSON: ${e.message}`);
    });

    const text = data?.choices?.[0]?.message?.content || '';
    const usage = data?.usage || {};
    // 🔧 Strip everything outside the first {...} block if JSON-like content exists
    const output = this._extractJSON(text);

    if (this.verbose) {
      console.log(`\n================ RESPONSE (${model}) ================`);
      console.log(JSON.stringify(data, null, 2));
      console.log('=====================================================\n');
    }

    return { text: output, usage, raw: data };
  }

  // ======================================================
  // 🔹 OpenAI (GPT Models)
  // ======================================================
  async _callOpenAI(messages, options) {
    const model = this.model || 'gpt-4o-mini';

    // Prefer Cloudflare Gateway
    if (this.cfAIGToken) {
      return await this._callCloudflareGateway('openai', messages, model);
    }

    // Fallback: Direct OpenAI API
    const client = new OpenAI({ apiKey: this.openaiAPIKey });
    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: this.temperature,
    });

    const text = completion.choices[0].message.content.trim();
    const usage = completion.usage || {};

    if (this.verbose) {
      console.log(`\n================ RESPONSE (${model}) ================`);
      console.log(JSON.stringify(json, null, 2));
      console.log('=====================================================\n');
    }

    return { text, usage, raw: completion };
  }

  // ======================================================
  // 🔹 Gemini (Google AI Studio)
  // ======================================================
  async _callGemini(messages, options) {
    const model = this.model || 'gemini-2.0-flash';

    // Prefer Cloudflare Gateway
    if (this.cfAIGToken) {
      return await this._callCloudflareGateway(
        'google-ai-studio',
        messages,
        model
      );
    }

    // Fallback: Direct Gemini API
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      `${model}:generateContent?key=${this.geminiAPIKey}`;

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: messages.map((m) => m.content).join('\n') }],
        },
      ],
      generationConfig: { temperature: this.temperature },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini API error: ${res.status} - ${errText}`);
    }

    const data = await res.json().catch((e) => {
      throw new Error(`Failed to parse Gemini JSON: ${e.message}`);
    });

    this._lastRawData = data;

    if (this.verbose || options.verbose) {
      console.log(
        '\n================ VERBOSE: LLM RESPONSE (GEMINI) ================'
      );
      console.log(JSON.stringify(data, null, 2));
      console.log(
        '===============================================================\n'
      );
    }

    // Extract and clean the model's text output
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 🔧 Strip everything outside the first {...} block if JSON-like content exists
    const output = this._extractJSON(text);

    const usage = data?.usageMetadata || {};
    return { text: output, usage, raw: data };
  }

  // ======================================================
  // 🧹 Clean JSON Extraction Utility
  // ======================================================
  _extractJSON(text) {
    if (!text) throw new Error('Empty response text');

    // 1️⃣ Remove code fences and unwanted markdown
    const match = text.match(/{[\s\S]*}/);
    if (match) {
      text = match[0].trim();
      return text;
    }
  }
}
