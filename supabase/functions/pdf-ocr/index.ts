import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.1-flash-lite';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

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

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured on server.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get PDF bytes as base64
    let base64Data = pdfBase64 as string | undefined;
    if (!base64Data && pdfUrl) {
      const r = await fetch(pdfUrl);
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Failed to download PDF (${r.status}): ${t.substring(0, 200)}`);
      }
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length === 0) throw new Error('Downloaded PDF is empty');
      base64Data = bytesToBase64(buf);
    }

    const extractionPrompt = `You are an expert OCR system specialized in educational content extraction. Extract ALL content from this PDF with maximum accuracy.

CRITICAL INSTRUCTIONS:

1. PASSAGES & READING COMPREHENSION:
   - Mark passages with [PASSAGE_START: Title] and [PASSAGE_END]
   - Mark which questions belong to which passage using [BELONGS_TO_PASSAGE: Title]

2. TABLES:
   - For any table, mark with [TABLE_IMAGE_N: description of what the table shows]
   - Do NOT recreate tables with text/markdown.

3. IMAGES & FIGURES:
   - For each image/figure/diagram: [IMAGE_N: detailed description]

4. QUESTIONS:
   - Preserve question numbers, options (A,B,C,D), correct answers if visible.

5. FORMATTING:
   - Use "--- Page N ---" for page breaks.
   - Mark unclear text with [unclear].

Return only the extracted text with markers embedded.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: extractionPrompt },
            { inlineData: { mimeType, data: base64Data } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 16384,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini PDF OCR failed:', errText.substring(0, 500));
      throw new Error(`Gemini API error ${response.status}: ${errText.substring(0, 400)}`);
    }

    const data = await response.json();
    const extractedText: string =
      data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('\n') ?? '';

    if (!extractedText.trim()) {
      throw new Error('Gemini returned empty extraction. The PDF may be unreadable or blocked.');
    }

    const images: string[] = [];
    const tables: string[] = [];
    const passages: { title: string; text: string }[] = [];

    for (const m of extractedText.matchAll(/\[IMAGE_(\d+):\s*([^\]]+)\]/g)) images.push(m[2].trim());
    for (const m of extractedText.matchAll(/\[TABLE_IMAGE_(\d+):\s*([^\]]+)\]/g)) tables.push(m[2].trim());
    for (const m of extractedText.matchAll(/\[PASSAGE_START:\s*([^\]]+)\]([\s\S]*?)\[PASSAGE_END\]/g)) {
      passages.push({ title: m[1].trim(), text: m[2].trim() });
    }

    console.log(`OCR completed via ${GEMINI_MODEL}. text=${extractedText.length} images=${images.length} tables=${tables.length} passages=${passages.length}`);

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
