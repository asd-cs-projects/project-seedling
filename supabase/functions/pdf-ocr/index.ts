import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, pdfUrl, mimeType = 'application/pdf' } = await req.json();

    if (!pdfBase64 && !pdfUrl) {
      return new Response(
        JSON.stringify({ error: 'No PDF data provided (need pdfUrl or pdfBase64)' }),
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

    const extractionPrompt = `You are an expert OCR system specialized in educational content extraction. Extract ALL content from this PDF with maximum accuracy.

CRITICAL INSTRUCTIONS:

1. PASSAGES & READING COMPREHENSION:
   - Identify reading passages clearly with [PASSAGE_START: Title] and [PASSAGE_END]
   - Keep passages separate from questions
   - Mark which questions belong to which passage using [BELONGS_TO_PASSAGE: Title]

2. TABLES - CRITICAL:
   - For ANY table, mark with [TABLE_IMAGE_N: description of what the table shows]
   - Do NOT recreate tables with text/markdown.

3. IMAGES & FIGURES:
   - For each image/figure/diagram: [IMAGE_N: detailed description]

4. QUESTIONS:
   - Preserve question numbers, options (A,B,C,D), correct answers if visible.
   - If question refers to a passage: [BELONGS_TO_PASSAGE: Title]

5. FORMATTING:
   - Use "--- Page N ---" for page breaks.
   - Mark unclear text with [unclear].

Return only the extracted text with markers embedded.`;

    // Prefer a direct URL (OpenRouter fetches it server-side, no client upload needed
    // and no huge JSON payload through the edge function). Falls back to inline base64.
    const dataUrl = pdfUrl ?? `data:${mimeType};base64,${pdfBase64}`;

    const callOpenRouter = async (engine: 'pdf-text' | 'native') => {
      const body: Record<string, unknown> = {
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: extractionPrompt },
              {
                type: 'file',
                file: {
                  filename: 'document.pdf',
                  file_data: dataUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 8000,
        temperature: 0.1,
      };
      // 'pdf-text' = OpenRouter's free text-extraction plugin (no model file support needed).
      // 'native' = let the model itself ingest the PDF (free if you use a free model like
      // google/gemini-2.0-flash-exp:free which handles PDFs natively). Zero cost either way.
      if (engine === 'pdf-text') {
        body.plugins = [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }];
      }
      return await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    };

    // Try the free pdf-text engine first (works for any PDF with a real text layer).
    // Fallback: hand the PDF straight to the model (free as long as OPENROUTER_MODEL is a free model).
    let response = await callOpenRouter('pdf-text');
    if (!response.ok) {
      const firstErr = await response.text();
      console.warn('pdf-text engine failed, falling back to native model parsing:', firstErr);
      response = await callOpenRouter('native');
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', errorText);
      throw new Error(
        `PDF parsing failed. If this is a scanned/image PDF, set OPENROUTER_MODEL to a free vision model like 'google/gemini-2.0-flash-exp:free'. Details: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();
    const extractedText: string = data.choices?.[0]?.message?.content ?? '';

    const images: string[] = [];
    const tables: string[] = [];
    const passages: { title: string; text: string }[] = [];

    for (const m of extractedText.matchAll(/\[IMAGE_(\d+):\s*([^\]]+)\]/g)) images.push(m[2].trim());
    for (const m of extractedText.matchAll(/\[TABLE_IMAGE_(\d+):\s*([^\]]+)\]/g)) tables.push(m[2].trim());
    for (const m of extractedText.matchAll(/\[PASSAGE_START:\s*([^\]]+)\]([\s\S]*?)\[PASSAGE_END\]/g)) {
      passages.push({ title: m[1].trim(), text: m[2].trim() });
    }

    console.log(`OCR completed. text=${extractedText.length} images=${images.length} tables=${tables.length} passages=${passages.length}`);

    return new Response(
      JSON.stringify({
        text: extractedText,
        images, tables, passages,
        imageCount: images.length,
        tableCount: tables.length,
        passageCount: passages.length,
        success: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('PDF OCR error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process PDF';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
