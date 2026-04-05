// Instruct mode templates for text-completion style formatting.
// When instruct mode is enabled, the chat messages are concatenated into
// a single prompt string with role-specific prefixes/suffixes.

export interface InstructTemplate {
  id: string;
  name: string;
  description: string;
  systemPrefix: string;
  systemSuffix: string;
  userPrefix: string;
  userSuffix: string;
  assistantPrefix: string;
  assistantSuffix: string;
  /** Appended to the final prompt to signal the assistant should respond. */
  assistantTrailingPrefix: string;
  stopStrings: string[];
  includeNames: boolean;
}

export const INSTRUCT_TEMPLATES: InstructTemplate[] = [
  {
    id: 'alpaca',
    name: 'Alpaca',
    description: 'Classic Alpaca instruction format',
    systemPrefix: '',
    systemSuffix: '\n\n',
    userPrefix: '### Instruction:\n',
    userSuffix: '\n\n',
    assistantPrefix: '### Response:\n',
    assistantSuffix: '\n\n',
    assistantTrailingPrefix: '### Response:\n',
    stopStrings: ['### Instruction:', '### Response:'],
    includeNames: false,
  },
  {
    id: 'chatml',
    name: 'ChatML',
    description: 'OpenAI ChatML — used by many recent models',
    systemPrefix: '<|im_start|>system\n',
    systemSuffix: '<|im_end|>\n',
    userPrefix: '<|im_start|>user\n',
    userSuffix: '<|im_end|>\n',
    assistantPrefix: '<|im_start|>assistant\n',
    assistantSuffix: '<|im_end|>\n',
    assistantTrailingPrefix: '<|im_start|>assistant\n',
    stopStrings: ['<|im_end|>', '<|im_start|>'],
    includeNames: false,
  },
  {
    id: 'llama3',
    name: 'Llama 3',
    description: 'Llama 3 / 3.1 instruct format',
    systemPrefix:
      '<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n',
    systemSuffix: '<|eot_id|>',
    userPrefix: '<|start_header_id|>user<|end_header_id|>\n\n',
    userSuffix: '<|eot_id|>',
    assistantPrefix: '<|start_header_id|>assistant<|end_header_id|>\n\n',
    assistantSuffix: '<|eot_id|>',
    assistantTrailingPrefix:
      '<|start_header_id|>assistant<|end_header_id|>\n\n',
    stopStrings: ['<|eot_id|>', '<|end_of_text|>'],
    includeNames: false,
  },
  {
    id: 'mistral',
    name: 'Mistral',
    description: 'Mistral v2/v3 [INST]/[/INST] format',
    systemPrefix: '[INST] ',
    systemSuffix: ' [/INST]',
    userPrefix: '[INST] ',
    userSuffix: ' [/INST]',
    assistantPrefix: '',
    assistantSuffix: '</s>',
    assistantTrailingPrefix: '',
    stopStrings: ['</s>', '[INST]'],
    includeNames: false,
  },
  {
    id: 'vicuna',
    name: 'Vicuna',
    description: 'Vicuna 1.1 style',
    systemPrefix: '',
    systemSuffix: '\n\n',
    userPrefix: 'USER: ',
    userSuffix: '\n',
    assistantPrefix: 'ASSISTANT: ',
    assistantSuffix: '\n',
    assistantTrailingPrefix: 'ASSISTANT: ',
    stopStrings: ['USER:', 'ASSISTANT:'],
    includeNames: false,
  },
  {
    id: 'metharme',
    name: 'Metharme / Pygmalion',
    description: 'Metharme / Pygmalion instruct format',
    systemPrefix: '<|system|>',
    systemSuffix: '',
    userPrefix: '<|user|>',
    userSuffix: '',
    assistantPrefix: '<|model|>',
    assistantSuffix: '',
    assistantTrailingPrefix: '<|model|>',
    stopStrings: ['<|user|>', '<|system|>', '<|model|>'],
    includeNames: false,
  },
  {
    id: 'raw',
    name: 'Raw (Name: text)',
    description: 'Simple name-prefixed completion style',
    systemPrefix: '',
    systemSuffix: '\n\n',
    userPrefix: '',
    userSuffix: '\n',
    assistantPrefix: '',
    assistantSuffix: '\n',
    assistantTrailingPrefix: '',
    stopStrings: [],
    includeNames: true,
  },
];

export function getInstructTemplate(id: string): InstructTemplate | undefined {
  return INSTRUCT_TEMPLATES.find((t) => t.id === id);
}

/**
 * Format chat messages into a single prompt string using the given template.
 * The resulting string ends with the assistant's trailing prefix so the
 * model can continue generating the response.
 */
export function formatInstructPrompt(
  messages: { role: 'system' | 'user' | 'assistant'; content: string; name?: string }[],
  template: InstructTemplate
): string {
  let out = '';
  for (const msg of messages) {
    const name = template.includeNames && msg.name ? `${msg.name}: ` : '';
    if (msg.role === 'system') {
      out += `${template.systemPrefix}${name}${msg.content}${template.systemSuffix}`;
    } else if (msg.role === 'user') {
      out += `${template.userPrefix}${name}${msg.content}${template.userSuffix}`;
    } else if (msg.role === 'assistant') {
      out += `${template.assistantPrefix}${name}${msg.content}${template.assistantSuffix}`;
    }
  }
  out += template.assistantTrailingPrefix;
  return out;
}
