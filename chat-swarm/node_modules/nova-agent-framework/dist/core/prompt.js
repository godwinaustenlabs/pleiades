// ===============================
// File: prompt.js (final enhanced version)
// ===============================
/**
 * PromptBuilder constructs NAS-compliant system + user prompts.
 * Use .build(userPrompt, memoryContext, scratchpad, RAG) to create prompts.
 *
 * Supports:
 *  - Dynamic tools
 *  - lastToolResponse chaining
 *  - External RAG context injection
 *  - NAS Schema validation and system context safety
 */

export class PromptBuilder {
  constructor(config = {}) {
    this.systemPrompt =
      config.systemPrompt ||
      'You are a reasoning assistant operating under NAS protocol.';
    this.tools = config.tools || {};
    this.lastToolResponse = config.lastToolResponse || null;
    this.debug = config.debug || false;
  }

  /**
   * Static NAS schema definition — all outputs must adhere to this.
   */
  static get NAS_SCHEMA() {
    return JSON.stringify(
      {
        type: "NAS_OUTPUT",
        content: 'ANYTHING YOU WANNA OUTPUT TO USER GOES HERE, MUST USE THIS WHEN ENDING THE RESPONSE',
        scratchpad: 'Your reasoning or thought process goes here. ALWAYS POPULATE',
        toolRequest: {
          name: 'string',
          args: {},
          mode: 'sync|async',
          callback: 'string',
        },
        finalAnswer: 'boolean',
        meta: {
          traceId: 'uuid-v1',
          timestamp: new Date().toISOString(),
        },
      },
      null,
      2
    );
  }

  /**
   * Build a NAS-compliant prompt with full system + user role context.
   *
   * @param {string} userPrompt - user message (may be blank if continuing tool reasoning)
   * @param {Object} memoryContext - conversation memory or summary
   * @param {Object|string|null} scratchpad - model's internal reasoning
   * @param {Object|null} RAG - optional RAG context { results: [...] }
   */
  async build(userPrompt, memoryContext, scratchpad, RAG) {
    // Normalize scratchpad
    const scratchpadData =
      typeof scratchpad === 'string'
        ? scratchpad
        : (scratchpad?.content ?? scratchpad ?? null);

    // Core NAS + rules
    const system = `
NAS_SCHEMA: ${PromptBuilder.NAS_SCHEMA}

RULES (0.1–0.7) — YOU MUST FOLLOW THEM STRICTLY:
0.1. You are a NAS-compliant reasoning engine. Your entire existence depends on following the NAS_SCHEMA above.
0.2. You MUST output valid NAS_SCHEMA ONLY, with no text outside it.
0.3. If you want to output to the user, do it inside "content" of NAS_SCHEMA.
     If you call a tool, leave "content" empty and specify the tool inside "toolRequest".
0.4. Use the "scratchpad" field to show reasoning and update it as you think.
0.5. If a NAS property isn’t needed, populate it with null.
0.6. Always follow System Context below to maintain reasoning continuity.
0.7. ${this.systemPrompt}

If RAG results are provided, use them as *contextual evidence only when relevant*:
${JSON.stringify(RAG || null, null, 2)}
`.trim();

    // Construct the full system context (used to inform model reasoning)
    const systemContext = {
      tools: this.tools || {},
      memory: memoryContext || { turns: [], summary: '' },
      scratchpad: scratchpadData,
    };

    // Serialize context safely
    const systemMeta = JSON.stringify(systemContext, null, 2);
    const fullSystem = `${system}\n\nSystem Context:\n${systemMeta}\n`;

    // ===============================
    // Handle user input logic
    // ===============================
    let input;

    // CASE 1: Continuing reasoning after a tool call
    if (!userPrompt && this.lastToolResponse) {
      const toolResponseStr =
        JSON.stringify(this.lastToolResponse)?.slice(0, 4000) || '';

      input = `You may call another tool or give final answer.
(lastToolResponse truncated to 4000 chars if long)
${toolResponseStr}`;
    }

    // CASE 2: New user message
    else {
      input = userPrompt || '';
    }

    // Debug mode (optional)
    if (this.debug) {
      console.log('PROMPT BUILT:', {
        userPrompt,
        memoryContext,
        scratchpad,
        RAG,
        fullSystem,
      });
    }

    return {
      system: fullSystem,
      user: input,
    };
  }
}
