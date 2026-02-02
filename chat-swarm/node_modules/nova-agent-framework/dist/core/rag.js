// ===============================
// File: rag.js (AutoRAG invocation, env-safe)
// ===============================

import { ChatLLM } from './llm.js';
import { parseRAW } from './parser.js';

/**
 * Chooses the most relevant AutoRAG pipeline for a given query
 * using an LLM-based routing approach.
 *
 * @param {Object} opts - Options object.
 * @param {string} opts.query - User query text to analyze.
 * @param {Object} opts.pipelines - Available pipelines, keyed by name.
 * @param {Object} opts.llmConfig - LLM configuration to initialize ChatLLM.
 * @returns {Promise<string>} The key of the chosen pipeline.
 */
async function choosePipeline({ query, pipelines, llmConfig }) {
  console.log('LLM config for SRS routing:', llmConfig);
  const llm = new ChatLLM(llmConfig);

  // Construct a list of available pipelines in human-readable format.
  const list = Object.entries(pipelines)
    .map(([key, val]) => `${key}: ${val.description}`)
    .join('\n');

  // Prompt setup for the LLM: instruct it to pick a pipeline key only.
  const systemPrompt =
    'You are a router that selects the most relevant AutoRAG pipeline to answer the user. ' +
    'Return ONLY the pipeline key from the list (no explanation).';

  // Include the pipelines and user query in the LLM request.
  const userPrompt = `Available pipelines:\n${list}\n\nUser query: "${query}"\n\nRespond with one pipeline key.`;

  // Invoke LLM chat model
  const res = await llm.chat({ system: systemPrompt, user: userPrompt });
  console.log('[SRS] Pipeline choice LLM response:', res);

  // -------------------
  // LLM response parsing
  // -------------------
  const output = await parseRAW(res.raw);
  console.log(`[SRS] LLM raw output parsed to: "${output}"`);

  // Defensive async function that loops over pipelines (Cuz gemini wraps res in markdown)
  // to find a key that matches part of the LLM output.
  // Could be simplified into a direct `.find()` loop.
  const choice = async () => {
    for (const [key] of Object.entries(pipelines)) {
      const match = key.toLowerCase();
      if (output.toLowerCase().includes(match)) {
        return key;
      }
    }
    return null;
  };

  const chosen = await choice();
  console.log(
    `[SRS] LLM chose pipeline key: "${output}", matched to: "${chosen}"`
  );

  if (chosen) {
    return chosen;
  } else {
    throw new Error(
      `[SRS] Could not match LLM output to any pipeline key: "${output}"`
    );
  }
}

/**
 * Queries a specific AutoRAG pipeline binding within the Cloudflare environment.
 *
 * @param {string} binding - The binding name registered in env.AI (e.g., "solar-install").
 * @param {string} query - User query to be searched in AutoRAG.
 * @param {Object} env - Cloudflare Worker environment (must include AI bindings).
 * @returns {Promise<string>} The response text from AutoRAG.
 */

async function queryAutoRAG(binding, query, env) {
  // Validate Cloudflare AI binding existence.
  if (!env?.AI) {
    throw new Error(
      '[RAG] env.AI is missing — did you pass env from Worker fetch?'
    );
  }

  if (typeof env.AI.autorag !== 'function') {
    throw new Error(
      '[RAG] env.AI.autorag is not available — check wrangler.toml bindings.'
    );
  }

  console.log(`[SRS] Querying AutoRAG pipeline binding: ${binding}`);
  console.log(`[SRS] Query: ${query}`);

  // Send query to AutoRAG binding.
  const res = await env.AI.autorag(binding).aiSearch({ query });

  console.log(`[SRS] AutoRAG raw response:`, res);

  // Return the AI response text, or fallback if undefined.
  return res?.response || 'No answer from AutoRAG';
}

/**
 * High-level orchestrator function:
 *  - Selects an appropriate pipeline using LLM (via choosePipeline)
 *  - Queries the chosen pipeline using Cloudflare AutoRAG
 *
 * @param {Object} opts - Main execution options.
 * @param {string} opts.query - The user query text.
 * @param {Object} opts.pipelines - Map of pipelines { key: { binding, description } }.
 * @param {Object} opts.llmConfig - Configuration object for ChatLLM.
 * @param {Object} opts.env - Cloudflare Worker environment with AI bindings.
 * @returns {Promise<{ chosenPipeline: string, answer: string }>} The pipeline key and resulting answer.
 */
export async function srs(config = {}) {
  console.log('Config OBJ:', config);
  const { query, pipelines, llmConfig, env } = config;

  // Step 1: Choose pipeline key using LLM router.
  const pipelineKey = await choosePipeline({ query, llmConfig, pipelines });
  const pipeline = pipelines[pipelineKey];

  console.log(
    `[SRS] Router chose pipeline: ${pipelineKey} → binding: ${pipeline.binding}`
  );

  // Step 2: Query AutoRAG pipeline.
  const answer = await queryAutoRAG(pipeline.binding, query, env);

  // Return combined result.
  return { chosenPipeline: pipelineKey, answer };
}
