import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.1-flash-lite';

interface ParsedQuestion {
  question_text: string;
  options: string[];
  correct_answer: string;
  marks: number;
  image_description?: string;
  table_description?: string;
  passage_title?: string;
  passage_text?: string;
  passage_id?: string;
}

async function callGemini(apiKey: string, prompt: string, maxOutputTokens = 8192) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens,
      responseMimeType: 'application/json',
    },
  };

  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const data = await r.json();
      return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') ?? '';
    }
    lastErr = await r.text();
    console.error(`Gemini attempt ${attempt + 1} failed (${r.status}):`, lastErr.substring(0, 200));
    if (r.status === 429 || r.status === 503 || r.status === 500) {
      if (attempt < 2) {
        await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt) + Math.random() * 500));
        continue;
      }
    }
    throw new Error(`Gemini API error: ${r.status} - ${lastErr}`);
  }
  throw new Error(`Gemini failed: ${lastErr}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { extractedText, difficulty, images = [], tables = [], passages = [] } = await req.json();

    if (!extractedText) {
      return new Response(
        JSON.stringify({ error: 'No text provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured on server.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are an expert at parsing educational MCQ questions from OCR text. Link questions to passages.

Return JSON ONLY in this exact format:
{
  "questions": [
    {
      "question_text": "...",
      "options": ["A","B","C","D"],
      "correct_answer": "A",
      "marks": 1,
      "image_description": null,
      "table_description": null,
      "passage_id": null,
      "passage_title": null,
      "passage_text": null
    }
  ]
}

Rules:
- If a question has [BELONGS_TO_PASSAGE: Title], set passage_id as a slug of the title, plus passage_title and passage_text (only on the FIRST question of that passage).
- For [TABLE_IMAGE_N: desc] near a question, set table_description.
- For [IMAGE_N: desc] near a question, set image_description.
- correct_answer must be A/B/C/D. Default marks=1.`;

    const passageInfo = passages.length > 0
      ? `\n\nDetected ${passages.length} passages:\n${passages.map((p: any) => `- "${p.title}"`).join('\n')}`
      : '';

    const fullPrompt = `${systemPrompt}\n\nParse the OCR text and extract MCQs with proper passage linking.${passageInfo}\n\nOCR Text:\n${extractedText}`;

    const content = await callGemini(apiKey, fullPrompt, 8192);

    let parsed: { questions: ParsedQuestion[] };
    try {
      const cleaned = content.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Content:', content.substring(0, 500));
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response', rawContent: content.substring(0, 500) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validQuestions = (parsed.questions || []).filter((q: ParsedQuestion) =>
      q.question_text && Array.isArray(q.options) && q.options.length >= 2 && q.correct_answer
    ).map((q: ParsedQuestion, index: number) => {
      const limitedOptions = q.options.slice(0, 4);
      const validAnswer = q.correct_answer.toUpperCase().charAt(0);
      const correctedAnswer = ['A','B','C','D'].includes(validAnswer) ? validAnswer : 'A';
      return {
        ...q,
        options: limitedOptions,
        difficulty: difficulty || 'easy',
        order_index: index,
        marks: q.marks || 1,
        correct_answer: correctedAnswer,
        image_description: q.image_description || null,
        table_description: q.table_description || null,
        passage_id: q.passage_id || null,
        passage_title: q.passage_title || null,
        passage_text: q.passage_text || null,
      };
    });

    console.log(`Parsed ${validQuestions.length} questions via ${GEMINI_MODEL}. Passages linked: ${validQuestions.filter(q => q.passage_id).length}`);

    return new Response(
      JSON.stringify({
        questions: validQuestions,
        totalFound: validQuestions.length,
        imagesDetected: images.length,
        tablesDetected: tables.length,
        passagesDetected: passages.length,
        success: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Parse questions error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to parse questions';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
