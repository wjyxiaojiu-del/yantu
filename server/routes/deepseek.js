import OpenAI from 'openai';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

let client = null;

export function getDeepSeekClient() {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('请设置 DEEPSEEK_API_KEY 环境变量');
  }

  if (!client) {
    client = new OpenAI({
      apiKey: DEEPSEEK_API_KEY,
      baseURL: DEEPSEEK_BASE_URL,
    });
  }
  return client;
}

export async function chat(messages, options = {}) {
  const deepseek = getDeepSeekClient();

  const response = await deepseek.chat.completions.create({
    model: options.model || 'deepseek-chat',
    messages,
    max_tokens: options.maxTokens || 2048,
    temperature: options.temperature || 0.7,
    ...options,
  });

  return {
    content: response.choices[0].message.content,
    usage: response.usage,
  };
}

export async function chatWithSystem(systemPrompt, userMessage, options = {}) {
  return chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ], options);
}
