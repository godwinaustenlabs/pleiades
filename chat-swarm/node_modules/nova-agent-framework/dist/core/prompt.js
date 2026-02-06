// ===============================
// File: prompt.js
// Purpose: Constructs the System Prompt
// ===============================

export class PromptBuilder {
  constructor(config = {}) {
    this.systemPrompt = config.systemPrompt || 'You are a helpful AI assistant.';
  }

  /**
   * Builds the System Message.
   * @returns {Object} { system: string }
   */
  async build() {
    // You can inject generic rules here
    const baseSystem = `
${this.systemPrompt}

You have access to tools. 
- If the user asks a question requiring external info or memory, call the appropriate tool.
- If you call a tool, you do not need to explain that you are calling it, just do it.
- Once the tool returns data, synthesize a helpful response for the user.
`.trim();

    return { system: baseSystem };
  }
}