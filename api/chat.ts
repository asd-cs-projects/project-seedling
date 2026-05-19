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
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });

    const { messages, systemPrompt } = req.body ?? {};
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Map to Gemini "contents" format. Gemini uses roles: "user" | "model".
    const contents = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content ?? '') }],
    }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
    };
    if (systemPrompt) {
      body.systemInstruction = { role: 'system', parts: [{ text: String(systemPrompt) }] };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const errorText = await r.text();
      return res.status(r.status).json({ error: `Gemini error: ${errorText}` });
    }

    const data = await r.json();
    const text: string =
      data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') ?? '';

    return res.status(200).json({
      choices: [{ message: { role: 'assistant', content: text } }],
    });
  } catch (error) {
    console.error('Gemini API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: errorMessage });
  }
}
