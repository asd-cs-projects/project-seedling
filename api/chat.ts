import type { VercelRequest, VercelResponse } from '@vercel/node';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
    if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured on server' });

    const { messages, systemPrompt } = req.body ?? {};
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const orMessages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) orMessages.push({ role: 'system', content: String(systemPrompt) });
    for (const m of messages) {
      orMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content ?? '') });
    }

    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: orMessages,
        temperature: 0.7,
        max_tokens: 8192,
      }),
    });

    if (!r.ok) {
      const errorText = await r.text();
      return res.status(r.status).json({ error: `OpenRouter error: ${errorText}` });
    }

    const data = await r.json();
    const text: string = data.choices?.[0]?.message?.content ?? '';

    return res.status(200).json({
      choices: [{ message: { role: 'assistant', content: text } }],
    });
  } catch (error) {
    console.error('OpenRouter API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: errorMessage });
  }
}
