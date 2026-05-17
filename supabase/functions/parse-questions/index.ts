import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    const model = Deno.env.get('OPENROUTER_MODEL') || 'google/gemini-2.0-flash-exp:free';
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OPENROUTER_API_KEY not configured on server.' }),
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
- If a question has [BELONGS_TO_PASSAGE: Title], set passage_id as a slug of the title (e.g. "passage-a-water-cycle"), passage_title and passage_text (only on the FIRST question of that passage).
- For [TABLE_IMAGE_N: desc] near a question, set table_description.
- For [IMAGE_N: desc] near a question, set image_description.
- correct_answer must be A/B/C/D. Default marks=1.`;

    const passageInfo = passages.length > 0
      ? `\n\nDetected ${passages.length} passages:\n${passages.map((p: any) => `- "${p.title}"`).join('\n')}`
      : '';

    let response: Response | null = null;
    let lastErrorText = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Parse the OCR text and extract MCQs with proper passage linking.${passageInfo}\n\nOCR Text:\n${extractedText}` },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          // Tightened from 32k → 8k; large PDFs of MCQs comfortably fit and lower
          // max_tokens makes the model return faster (no speculative buffer).
          max_tokens: 8000,
        }),
      });

      if (r.ok) { response = r; break; }
      lastErrorText = await r.text();
      console.error(`OpenRouter attempt ${attempt + 1} failed (${r.status}):`, lastErrorText.substring(0, 200));
      if (r.status === 429 || r.status === 503 || r.status === 500) {
        if (attempt < 2) {
          await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt) + Math.random() * 500));
          continue;
        }
      }
      throw new Error(`OpenRouter API error: ${r.status} - ${lastErrorText}`);
    }

    if (!response) {
      return new Response(
        JSON.stringify({ error: 'AI service is temporarily overloaded. Please try again in a minute.', details: lastErrorText.substring(0, 300) }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';

    let parsed: { questions: ParsedQuestion[] };
    try {
      const cleaned = content.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Content:', content);
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

    console.log(`Parsed ${validQuestions.length} questions. Passages linked: ${validQuestions.filter(q => q.passage_id).length}`);

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
