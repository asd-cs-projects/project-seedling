import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, mimeType = 'application/pdf', extractImages = false } = await req.json();

    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ error: 'No PDF data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use environment variable for API key (set in Vercel dashboard)
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Gemini API key not configured on server.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Enhanced prompt for better passage and table extraction
    const extractionPrompt = `You are an expert OCR system specialized in educational content extraction. Extract ALL content from this PDF with maximum accuracy.

CRITICAL INSTRUCTIONS:

1. PASSAGES & READING COMPREHENSION:
   - Identify reading passages clearly with [PASSAGE_START: Title] and [PASSAGE_END]
   - Keep passages separate from questions
   - Mark which questions belong to which passage using [BELONGS_TO_PASSAGE: Title]
   - Format: [PASSAGE_START: Passage A - The Water Cycle]
             (full passage text here)
             [PASSAGE_END]

2. TABLES - CRITICAL:
   - For ANY table, diagram with structured data, or complex visual layout:
   - Mark with [TABLE_IMAGE_N: description of what the table shows]
   - Do NOT try to recreate tables with text/markdown - they will be rendered as images
   - Include a brief description of what data the table contains
   - Example: [TABLE_IMAGE_1: A table showing population growth from 1950-2020 with columns for Year, Population, and Growth Rate]

3. IMAGES & FIGURES:
   - For each image/figure/diagram: [IMAGE_N: detailed description]
   - Number all images sequentially
   - Place markers exactly where they appear in the document
   - If an image is part of a question, place marker right after the question text

4. QUESTIONS:
   - Preserve question numbers exactly
   - Keep options (A, B, C, D) clearly formatted
   - Mark correct answers if visible (with ✓, *, or "correct")
   - If questions refer to a passage, mark it: [BELONGS_TO_PASSAGE: Title]

5. FORMATTING:
   - Use "--- Page N ---" for page breaks
   - Preserve mathematical formulas as best as possible
   - Mark unclear text with [unclear]

Return the extracted text with all markers properly embedded.`;

    // Use Google's Generative AI API directly with Gemini 2.5 Flash Lite (fast vision OCR)
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=' + apiKey, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: extractionPrompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: pdfBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 16000,
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    // Gemini API response format: candidates[0].content.parts[0].text
    const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse out images, tables, and passages
    const images: string[] = [];
    const tables: string[] = [];
    const passages: { title: string; text: string }[] = [];

    // Extract image descriptions
    const imageMatches = extractedText.matchAll(/\[IMAGE_(\d+):\s*([^\]]+)\]/g);
    for (const match of imageMatches) {
      images.push(match[2].trim());
    }

    // Extract table descriptions (these should be rendered as images)
    const tableMatches = extractedText.matchAll(/\[TABLE_IMAGE_(\d+):\s*([^\]]+)\]/g);
    for (const match of tableMatches) {
      tables.push(match[2].trim());
    }

    // Extract passages
    const passageMatches = extractedText.matchAll(/\[PASSAGE_START:\s*([^\]]+)\]([\s\S]*?)\[PASSAGE_END\]/g);
    for (const match of passageMatches) {
      passages.push({
        title: match[1].trim(),
        text: match[2].trim()
      });
    }

    console.log(`OCR completed. Text length: ${extractedText.length}, Images: ${images.length}, Tables: ${tables.length}, Passages: ${passages.length}`);

    return new Response(
      JSON.stringify({ 
        text: extractedText,
        images: images,
        tables: tables,
        passages: passages,
        imageCount: images.length,
        tableCount: tables.length,
        passageCount: passages.length,
        success: true 
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
