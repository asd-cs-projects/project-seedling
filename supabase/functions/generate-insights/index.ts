import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest'];
const DAILY_REGEN_HOURS = 24;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const normalizeStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];

type NormalizedHeatmapEntry = {
  level: string;
  evidence?: string;
  questionRefs?: string[];
};

const normalizeHeatmap = (value: unknown): Record<string, NormalizedHeatmapEntry> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, NormalizedHeatmapEntry>>((acc, [topic, rawEntry]) => {
    const normalizedTopic = String(topic ?? '').trim();
    if (!normalizedTopic) return acc;
    if (typeof rawEntry === 'string') {
      const level = rawEntry.trim();
      if (level) acc[normalizedTopic] = { level };
      return acc;
    }
    if (rawEntry && typeof rawEntry === 'object' && !Array.isArray(rawEntry)) {
      const entry = rawEntry as Record<string, unknown>;
      const level = String(entry.level ?? '').trim();
      if (!level) return acc;
      const evidence = String(entry.evidence ?? '').trim();
      const questionRefs = normalizeStringArray(entry.questionRefs);
      acc[normalizedTopic] = {
        level,
        ...(evidence ? { evidence } : {}),
        ...(questionRefs.length ? { questionRefs } : {}),
      };
    }
    return acc;
  }, {});
};

const normalizeAnswerValue = (value: unknown) => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized || undefined;
};

const answerKeysForQuestion = (question: Record<string, unknown>, index: number) => {
  const keys = [
    question.id,
    String(question.id ?? '').trim(),
    index,
    String(index),
    question.order_index,
    String(question.order_index ?? '').trim(),
  ];
  return Array.from(new Set(keys.filter((key) => key !== undefined && key !== null && String(key).trim() !== '')));
};

const extractAnswerAtIndex = (
  answers: unknown,
  index: number,
  question?: Record<string, unknown>,
) => {
  if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
    const record = answers as Record<string, unknown>;
    if (question) {
      for (const key of answerKeysForQuestion(question, index)) {
        const value = record[String(key)];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          return value;
        }
      }
    }
    return record[String(index)] ?? record[index as unknown as keyof typeof record];
  }
  if (Array.isArray(answers)) return answers[index];
  return undefined;
};

const computeQuestionPerformance = (
  questions: Array<Record<string, unknown>>,
  studentResults: Array<Record<string, unknown>>,
) =>
  questions.map((question, questionIndex) => {
    const correctAnswer = normalizeAnswerValue(question.correct_answer);
    const difficulty = String(question.difficulty ?? 'unknown').trim() || 'unknown';
    const questionText = String(question.question_text ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
    let correct = 0, incorrect = 0, skipped = 0;
    studentResults.forEach((result) => {
      const rawAnswer = extractAnswerAtIndex(result.answers, questionIndex, question);
      const normalizedAnswer = normalizeAnswerValue(rawAnswer);
      if (!normalizedAnswer) { skipped += 1; return; }
      if (correctAnswer && normalizedAnswer === correctAnswer) correct += 1;
      else incorrect += 1;
    });
    const attempts = correct + incorrect;
    const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
    return {
      questionId: String(question.id ?? questionIndex + 1),
      questionNumber: questionIndex + 1,
      difficulty, correct, incorrect, skipped, attempts, accuracy,
      correctAnswer: correctAnswer ?? '',
      questionText,
    };
  });

const buildClassPrompt = (
  testTitle: string,
  testSubject: string,
  studentResults: Array<Record<string, unknown>>,
  questions: Array<Record<string, unknown>>,
  difficultyLabel: string,
) => {
  const totalStudents = studentResults.length;
  const averageScore = totalStudents
    ? Math.round(studentResults.reduce((sum, r) => sum + Number(r.score ?? 0), 0) / totalStudents)
    : 0;
  const questionPerformance = computeQuestionPerformance(questions, studentResults);
  const strongestQuestions = questionPerformance.filter(i => i.attempts > 0).sort((a, b) => b.accuracy - a.accuracy).slice(0, 4)
    .map(i => `Q${i.questionNumber} ${i.accuracy}% (${i.correct}/${i.attempts}) ${i.questionText}`);
  const weakestQuestions = questionPerformance.filter(i => i.attempts > 0).sort((a, b) => a.accuracy - b.accuracy || b.incorrect - a.incorrect).slice(0, 5)
    .map(i => `Q${i.questionNumber} ${i.accuracy}% (${i.incorrect} wrong, ${i.skipped} skipped) ${i.questionText}`);
  const questionStats = questionPerformance.map(i =>
    `Q${i.questionNumber}|acc=${i.accuracy}%|correct=${i.correct}|wrong=${i.incorrect}|skipped=${i.skipped}|ans=${i.correctAnswer}|text=${i.questionText}`,
  );

  return `You are an expert instructional coach analyzing class performance for "${testTitle}" (${testSubject || 'General'}) — ${difficultyLabel} tier.
Use right/wrong/skip data to help a teacher understand mastery and what to reteach.

Return ONLY valid JSON:
{"summary":"...","strengths":["..."],"improvements":["..."],"topicHeatmap":{"Concept":{"level":"high|medium|low","evidence":"...","questionRefs":["Q1"]}}}

Rules:
- summary: 4 sentences. Cite the average, weakest pattern, strongest pattern, and what to reteach first.
- strengths: 3 items, reference concrete questions/concepts students mastered.
- improvements: 3 items, reference concrete weak questions plus what to reteach.
- topicHeatmap: 6-10 concepts. level=high(>=75%) | medium(45-74%) | low(<45%). Include evidence + questionRefs.

Class size: ${totalStudents}, Avg: ${averageScore}%
Strongest: ${strongestQuestions.join(' ; ') || 'n/a'}
Weakest: ${weakestQuestions.join(' ; ') || 'n/a'}

Questions:
${questionStats.join('\n')}`;
};

const buildStudentPrompt = (
  testTitle: string,
  testSubject: string,
  questions: Array<Record<string, unknown>>,
  answers: unknown,
  difficultyLabel: string,
) => {
  const compactQuestions = questions.map((question, index) => {
    const studentAnswer = extractAnswerAtIndex(answers, index, question);
    const normalizedStudentAnswer = String(studentAnswer ?? 'Not answered').trim() || 'Not answered';
    const correctAnswer = String(question.correct_answer ?? '').trim();
    const questionText = String(question.question_text ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
    const isCorrect = normalizedStudentAnswer.toUpperCase() === correctAnswer.toUpperCase();
    return `${index + 1}|correct=${isCorrect ? 'yes' : 'no'}|student=${normalizedStudentAnswer}|answer=${correctAnswer}|q=${questionText}`;
  });
  const correctCount = compactQuestions.filter(l => l.includes('|correct=yes|')).length;
  const totalQuestions = compactQuestions.length;
  const percent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  return `Analyze this student's ${difficultyLabel} tier performance for "${testTitle}" (${testSubject || 'General'}).
Return ONLY valid JSON: {"strengths":["..."],"improvements":["..."],"topicTags":["#Topic"]}
2-3 strengths, 2-3 improvements, 3-5 topic tags. Cite question numbers where relevant.
Score=${correctCount}/${totalQuestions} (${percent}%)
Responses:
${compactQuestions.join('\n')}`;
};

const buildExplanationsPrompt = (
  questions: Array<Record<string, unknown>>,
  subject: string,
  passageMap: Record<string, { code?: string; title?: string; content?: string }> = {},
) => {
  const list = questions.map((q, idx) => {
    const opts = Array.isArray(q.options) ? (q.options as unknown[]) : [];
    const optionLines = opts.slice(0, 4).map((opt, i) => `${String.fromCharCode(65 + i)}) ${String(opt)}`).join(' | ');
    const passageId = q.passage_id ? String(q.passage_id) : '';
    const passage = passageId && passageMap[passageId];
    const passageBlock = passage
      ? `\nPassage [${passage.code || ''}${passage.title ? ` — ${passage.title}` : ''}]:\n${(passage.content || '').slice(0, 1500)}`
      : '';
    return `Q${idx + 1} [id=${q.id}] correct=${q.correct_answer}${passageBlock}\nQuestion: ${q.question_text}\nOptions: ${optionLines}`;
  }).join('\n\n');

  return `You are a tutor. For each ${subject || 'general'} question below, write a clear Khan-Academy-style explanation.
When a passage is provided, your reasoning MUST cite the passage (paraphrase or quote a short phrase) to justify the correct answer.

Return ONLY valid JSON array, one entry per question, in order:
[{"id":"<question id>","explanation":"why the correct answer is right (2-3 sentences, reference the passage if any)","options":{"A":"why A is right or wrong","B":"...","C":"...","D":"..."}}]

Rules:
- Be concise but specific. Reference concept names and passage evidence when relevant.
- For the correct option, briefly confirm why it's right.
- For wrong options, explain the misconception or why it's incorrect.
- Use plain text, no markdown.

Questions:
${list}`;
};

const extractTextResponse = (parts: Array<Record<string, unknown>>) => {
  const visible = parts.filter(p => !p.thought).map(p => String(p.text ?? '')).join('').trim();
  if (visible) return visible;
  return parts.map(p => String(p.text ?? '')).join('').trim();
};

const extractJsonPayload = (rawText: string) => {
  const trimmed = rawText.trim();
  if (!trimmed) throw new HttpError(502, 'Gemini returned an empty response');
  const candidates = [
    trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1],
    trimmed.match(/```\s*([\s\S]*?)```/i)?.[1],
    trimmed,
  ].map(v => String(v ?? '').trim()).filter(Boolean);

  for (const c of candidates) {
    const candidate = c.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try { JSON.parse(candidate); return candidate; } catch {
      const matches = candidate.match(/[\{\[][\s\S]*[\}\]]/g) ?? [];
      for (const m of matches.reverse()) {
        try { JSON.parse(m); return m; } catch { continue; }
      }
    }
  }
  throw new HttpError(502, `Could not parse AI response: ${trimmed.slice(0, 300)}`);
};

const callGemini = async (prompt: string, geminiApiKey: string, maxTokens = 4096) => {
  const models = [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS];
  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  let lastErr = '';
  let lastStatus = 500;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        },
      );
      const rawBody = await response.text();
      if (response.ok) {
        try { return rawBody ? JSON.parse(rawBody) : null; } catch { return null; }
      }
      lastStatus = response.status;
      lastErr = rawBody.slice(0, 300);
      console.error(`Gemini ${model} attempt ${attempt + 1} failed (${response.status}):`, lastErr);
      // Retry on transient errors only
      if (response.status === 429 || response.status === 503 || response.status === 500) {
        if (attempt < 2) {
          const backoff = 800 * Math.pow(2, attempt) + Math.random() * 400;
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
        // Exhausted retries — try next model
        break;
      }
      // Non-retryable
      throw new HttpError(response.status, `Gemini error: ${lastErr}`);
    }
  }
  throw new HttpError(lastStatus, `Gemini failed across all models: ${lastErr}`);
};

const parseGeminiJson = (geminiResponse: unknown) => {
  const candidates = geminiResponse && typeof geminiResponse === 'object' && Array.isArray((geminiResponse as { candidates?: unknown[] }).candidates)
    ? ((geminiResponse as { candidates: Array<{ content?: { parts?: Array<Record<string, unknown>> } }> }).candidates ?? [])
    : [];
  const parts = Array.isArray(candidates[0]?.content?.parts) ? candidates[0].content.parts : [];
  const text = extractTextResponse(parts);
  return JSON.parse(extractJsonPayload(text));
};

const isWithin24h = (timestamp: string | null | undefined) => {
  if (!timestamp) return false;
  const t = new Date(timestamp).getTime();
  if (Number.isNaN(t)) return false;
  return (Date.now() - t) < DAILY_REGEN_HOURS * 60 * 60 * 1000;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) throw new HttpError(500, 'GEMINI_API_KEY not configured');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseKey || !supabaseAnonKey) throw new HttpError(500, 'Backend client configuration is missing');

    // ====== Authentication: require a valid JWT for ALL invocations ======
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new HttpError(401, 'Authentication required');
    }
    const jwt = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      throw new HttpError(401, 'Invalid or expired session');
    }
    const callerId = userData.user.id;

    const body = await req.json();
    const {
      mode = 'insights',
      resultId,
      testTitle = 'Test',
      testSubject = 'General',
      isClassSummary = false,
      testId,
      forceRegenerate = false,
      subject, // for student-subject-summary mode
    } = body ?? {};

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Helper: check if a user has a specific role
    const callerHasRole = async (role: 'teacher' | 'admin') => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', callerId)
        .eq('role', role)
        .maybeSingle();
      return !!data;
    };

    // ====== Authorization: caller must own the requested resource ======
    if (mode === 'student-subject-summary') {
      // caller must be the student themselves (the row will be keyed to caller id)
      // no extra check required — we always operate on callerId below.
    } else if (mode === 'teacher-student-summary') {
      // Only teachers/admins may generate summaries for other students.
      const isTeacher = (await callerHasRole('teacher')) || (await callerHasRole('admin'));
      if (!isTeacher) throw new HttpError(403, 'Only teachers can generate student summaries');
      if (!body?.studentId) throw new HttpError(400, 'studentId is required');
    } else if (mode === 'explanations' || isClassSummary) {
      if (!testId) throw new HttpError(400, 'testId is required');
      const { data: testRow, error: tErr } = await supabase
        .from('tests')
        .select('teacher_id')
        .eq('id', testId)
        .maybeSingle();
      if (tErr) throw tErr;
      if (!testRow || testRow.teacher_id !== callerId) {
        throw new HttpError(403, 'Not authorized for this test');
      }
    } else {
      // per-student insights mode: caller must own the result OR be the test's teacher
      if (!resultId) throw new HttpError(400, 'resultId is required for student insights');
      const { data: resultRow, error: rErr } = await supabase
        .from('test_results')
        .select('student_id, test_id')
        .eq('id', resultId)
        .maybeSingle();
      if (rErr) throw rErr;
      if (!resultRow) throw new HttpError(404, 'Result not found');
      if (resultRow.student_id !== callerId) {
        const { data: testRow } = await supabase
          .from('tests')
          .select('teacher_id')
          .eq('id', resultRow.test_id)
          .maybeSingle();
        if (!testRow || testRow.teacher_id !== callerId) {
          throw new HttpError(403, 'Not authorized for this result');
        }
      }
    }

    // ============ MODE: student per-subject summary ============
    if (mode === 'student-subject-summary') {
      const subjectName = String(subject ?? 'All Subjects').trim() || 'All Subjects';

      // Cache check (one regen per subject per day)
      const { data: existingRow } = await supabase
        .from('student_summaries')
        .select('summary, strengths, improvements, generated_at')
        .eq('student_id', callerId)
        .eq('subject', subjectName)
        .maybeSingle();

      if (existingRow?.summary && !forceRegenerate) {
        return jsonResponse({
          success: true, cached: true,
          insights: {
            summary: existingRow.summary,
            strengths: normalizeStringArray(existingRow.strengths),
            improvements: normalizeStringArray(existingRow.improvements),
          },
          generatedAt: existingRow.generated_at,
        });
      }
      if (existingRow?.summary && forceRegenerate && isWithin24h(existingRow.generated_at as string)) {
        throw new HttpError(429, 'You can refresh this summary once per day. Try again tomorrow.');
      }

      // Pull this student's first-attempt results, optionally filtered by subject
      let resQuery = supabase
        .from('test_results')
        .select('id, score, correct_answers, wrong_answers, total_questions, difficulty_level, ai_topic_tags, completed_at, tests!inner(title, subject)')
        .eq('student_id', callerId)
        .eq('is_retake', false)
        .order('completed_at', { ascending: false })
        .limit(40);
      if (subjectName !== 'All Subjects') {
        resQuery = resQuery.eq('tests.subject', subjectName);
      }
      const { data: resultsRows, error: resErr } = await resQuery;
      if (resErr) throw resErr;
      const results = resultsRows ?? [];

      if (results.length === 0) {
        throw new HttpError(400, `No completed ${subjectName} tests yet. Take a test first to generate a summary.`);
      }

      const totalTests = results.length;
      const avgScore = Math.round(results.reduce((s, r: any) => s + Number(r.score ?? 0), 0) / totalTests);
      const totalQ = results.reduce((s, r: any) => s + Number(r.total_questions ?? 0), 0);
      const totalCorrect = results.reduce((s, r: any) => s + Number(r.correct_answers ?? 0), 0);
      const overallAcc = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;

      // Aggregate topic tags across results for richer signal
      const tagFreq: Record<string, number> = {};
      results.forEach((r: any) => {
        normalizeStringArray(r.ai_topic_tags).forEach((t) => {
          const key = t.replace(/^#/, '').trim();
          if (key) tagFreq[key] = (tagFreq[key] || 0) + 1;
        });
      });
      const topTags = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]).slice(0, 12)
        .map(([t, n]) => `${t} (x${n})`);

      const perTest = results.slice(0, 20).map((r: any) => {
        const acc = r.total_questions > 0 ? Math.round(((r.correct_answers ?? 0) / r.total_questions) * 100) : 0;
        return `${(r.tests?.title || 'Test').slice(0, 40)} [${r.tests?.subject || '-'} | ${r.difficulty_level || '-'}] score=${r.score}% acc=${acc}% (${r.correct_answers}/${r.total_questions})`;
      });

      const subjectLabel = subjectName === 'All Subjects' ? 'across all subjects' : `in ${subjectName}`;
      const prompt = `You are a learning coach. Write a concise, specific student summary ${subjectLabel} for a student who has taken ${totalTests} test(s).

Return ONLY valid JSON:
{"summary":"3-4 sentences. State overall standing (avg ${avgScore}%, accuracy ${overallAcc}%), the clearest strengths, the clearest weaknesses, and a single concrete next step.","strengths":["3-5 specific strong topics or sub-skills, name the topic precisely (e.g. 'Linear equations: solving for x'), not generic phrases"],"improvements":["3-5 specific weak topics or sub-skills with what to practice (e.g. 'Reading inference: identifying author tone — practice with short editorials')"]}

Rules:
- Strengths and improvements MUST name concrete topics / sub-skills, not vague language like "did well" or "needs work".
- If a topic appears multiple times in tags, weight it accordingly.
- Cite frequency or scores when possible.

Stats: avgScore=${avgScore}%, overallAcc=${overallAcc}%, tests=${totalTests}
Top topic tags: ${topTags.join(' | ') || 'none yet'}
Per-test: 
${perTest.join('\n')}`;

      const resp = await callGemini(prompt, geminiApiKey, 2048);
      const parsed = parseGeminiJson(resp);
      const summary = String(parsed.summary ?? '').trim();
      const strengths = normalizeStringArray(parsed.strengths);
      const improvements = normalizeStringArray(parsed.improvements);

      if (!summary) throw new HttpError(502, 'AI did not return a summary');

      const { error: upErr } = await supabase
        .from('student_summaries')
        .upsert({
          student_id: callerId,
          subject: subjectName,
          summary,
          strengths,
          improvements,
          generated_at: new Date().toISOString(),
        }, { onConflict: 'student_id,subject' });
      if (upErr) throw upErr;

      return jsonResponse({
        success: true, cached: false,
        insights: { summary, strengths, improvements },
        generatedAt: new Date().toISOString(),
      });
    }

    // ============ MODE: teacher-generated student summary (across all subjects) ============
    if (mode === 'teacher-student-summary') {
      const targetStudentId = String(body.studentId);
      const subjectName = String(subject ?? 'All Subjects').trim() || 'All Subjects';

      const { data: existingRow } = await supabase
        .from('student_summaries')
        .select('summary, strengths, improvements, generated_at')
        .eq('student_id', targetStudentId)
        .eq('subject', subjectName)
        .maybeSingle();

      if (existingRow?.summary && !forceRegenerate) {
        return jsonResponse({
          success: true, cached: true,
          insights: {
            summary: existingRow.summary,
            strengths: normalizeStringArray(existingRow.strengths),
            improvements: normalizeStringArray(existingRow.improvements),
          },
          generatedAt: existingRow.generated_at,
        });
      }
      if (existingRow?.summary && forceRegenerate && isWithin24h(existingRow.generated_at as string)) {
        throw new HttpError(429, 'Summary was already regenerated today. Try again tomorrow.');
      }

      let resQuery = supabase
        .from('test_results')
        .select('id, score, correct_answers, wrong_answers, total_questions, difficulty_level, ai_topic_tags, completed_at, tests!inner(title, subject)')
        .eq('student_id', targetStudentId)
        .eq('is_retake', false)
        .order('completed_at', { ascending: false })
        .limit(40);
      if (subjectName !== 'All Subjects') {
        resQuery = resQuery.eq('tests.subject', subjectName);
      }
      const { data: resultsRows, error: resErr } = await resQuery;
      if (resErr) throw resErr;
      const results = resultsRows ?? [];

      if (results.length === 0) {
        throw new HttpError(400, `This student has no completed ${subjectName} tests yet.`);
      }

      const totalTests = results.length;
      const avgScore = Math.round(results.reduce((s, r: any) => s + Number(r.score ?? 0), 0) / totalTests);
      const totalQ = results.reduce((s, r: any) => s + Number(r.total_questions ?? 0), 0);
      const totalCorrect = results.reduce((s, r: any) => s + Number(r.correct_answers ?? 0), 0);
      const overallAcc = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;

      const tagFreq: Record<string, number> = {};
      results.forEach((r: any) => {
        normalizeStringArray(r.ai_topic_tags).forEach((t) => {
          const key = t.replace(/^#/, '').trim();
          if (key) tagFreq[key] = (tagFreq[key] || 0) + 1;
        });
      });
      const topTags = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]).slice(0, 12)
        .map(([t, n]) => `${t} (x${n})`);

      const perTest = results.slice(0, 20).map((r: any) => {
        const acc = r.total_questions > 0 ? Math.round(((r.correct_answers ?? 0) / r.total_questions) * 100) : 0;
        return `${(r.tests?.title || 'Test').slice(0, 40)} [${r.tests?.subject || '-'} | ${r.difficulty_level || '-'}] score=${r.score}% acc=${acc}% (${r.correct_answers}/${r.total_questions})`;
      });

      const subjectLabel = subjectName === 'All Subjects' ? 'across all subjects' : `in ${subjectName}`;
      const prompt = `You are an instructional coach writing a private summary for a TEACHER about one of their students ${subjectLabel}. The student has taken ${totalTests} test(s).

Return ONLY valid JSON:
{"summary":"4-5 sentences. Address the teacher (e.g., 'This student...'). State overall standing (avg ${avgScore}%, accuracy ${overallAcc}%), clearest strengths, clearest weaknesses, and one concrete intervention or focus area for the teacher to consider.","strengths":["3-5 specific strong topics or sub-skills, name precisely"],"improvements":["3-5 specific weak topics or sub-skills with what to reteach or practice"]}

Rules:
- Strengths/improvements MUST name concrete topics/sub-skills.
- Cite frequency or scores when possible.
- Tone: professional, helpful to a teacher.

Stats: avgScore=${avgScore}%, overallAcc=${overallAcc}%, tests=${totalTests}
Top topic tags: ${topTags.join(' | ') || 'none yet'}
Per-test:
${perTest.join('\n')}`;

      const resp = await callGemini(prompt, geminiApiKey, 2048);
      const parsed = parseGeminiJson(resp);
      const summary = String(parsed.summary ?? '').trim();
      const strengths = normalizeStringArray(parsed.strengths);
      const improvements = normalizeStringArray(parsed.improvements);

      if (!summary) throw new HttpError(502, 'AI did not return a summary');

      const { error: upErr } = await supabase
        .from('student_summaries')
        .upsert({
          student_id: targetStudentId,
          subject: subjectName,
          summary,
          strengths,
          improvements,
          generated_at: new Date().toISOString(),
        }, { onConflict: 'student_id,subject' });
      if (upErr) throw upErr;

      return jsonResponse({
        success: true, cached: false,
        insights: { summary, strengths, improvements },
        generatedAt: new Date().toISOString(),
      });
    }

    if (mode === 'explanations') {
      if (!testId) throw new HttpError(400, 'testId is required');
      const { data: questions, error: qErr } = await supabase
        .from('questions')
        .select('id, question_text, options, correct_answer, difficulty, explanation, passage_id')
        .eq('test_id', testId)
        .order('order_index');
      if (qErr) throw qErr;
      if (!questions || questions.length === 0) {
        return jsonResponse({ success: true, generated: 0 });
      }
      // Skip ones that already have explanations unless forced
      const pending = forceRegenerate ? questions : questions.filter(q => !q.explanation);
      if (pending.length === 0) {
        return jsonResponse({ success: true, generated: 0, cached: true });
      }

      // Fetch all passages for this test once so we can attach context to questions
      const { data: passagesData } = await supabase
        .from('passages')
        .select('id, passage_code, title, content')
        .eq('test_id', testId);
      const passageMap: Record<string, { code?: string; title?: string; content?: string }> = {};
      (passagesData ?? []).forEach((p) => {
        passageMap[p.id] = { code: p.passage_code ?? '', title: p.title ?? '', content: p.content ?? '' };
      });

      // Process in batches of 6 to keep prompts small with passage context
      const BATCH = 6;
      let generated = 0;
      for (let i = 0; i < pending.length; i += BATCH) {
        const batch = pending.slice(i, i + BATCH);
        const prompt = buildExplanationsPrompt(batch as Array<Record<string, unknown>>, testSubject, passageMap);
        try {
          const resp = await callGemini(prompt, geminiApiKey, 4096);
          const parsed = parseGeminiJson(resp);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              const id = String(item?.id ?? '').trim();
              const explanation = String(item?.explanation ?? '').trim();
              const options = item?.options && typeof item.options === 'object' ? item.options : null;
              if (!id || !explanation) continue;
              const { error } = await supabase
                .from('questions')
                .update({ explanation, option_explanations: options })
                .eq('id', id);
              if (!error) generated += 1;
            }
          }
        } catch (e) {
          console.error('Batch explanation failed:', e);
        }
      }
      return jsonResponse({ success: true, generated });
    }

    // ============ MODE: class summary ============
    if (isClassSummary) {
      if (!testId) throw new HttpError(400, 'testId is required for class summaries');

      const { data: existingSummary, error: lookupErr } = await supabase
        .from('test_class_summaries')
        .select('summary, topic_heatmap, generated_at')
        .eq('test_id', testId)
        .maybeSingle();
      if (lookupErr) throw lookupErr;

      // If cached and not forced, return. If forced but within 24h, deny.
      if (existingSummary?.summary) {
        if (!forceRegenerate) {
          return jsonResponse({
            success: true, cached: true,
            insights: {
              summary: String(existingSummary.summary).trim(),
              strengths: [], improvements: [],
              topicHeatmap: normalizeHeatmap(existingSummary.topic_heatmap),
            },
            generatedAt: existingSummary.generated_at,
          });
        }
        if (isWithin24h(existingSummary.generated_at as string)) {
          throw new HttpError(429, 'Summary was already regenerated today. Try again tomorrow.');
        }
      }

      // Fetch questions + results, scoped: build per-difficulty class summary using only relevant questions
      const { data: allQuestions, error: qErr } = await supabase
        .from('questions')
        .select('id, question_text, correct_answer, difficulty, order_index, options')
        .eq('test_id', testId)
        .neq('difficulty', 'practice')
        .order('order_index');
      if (qErr) throw qErr;

      const { data: allResults, error: rErr } = await supabase
        .from('test_results')
        .select('score, correct_answers, wrong_answers, total_questions, difficulty_level, answers')
        .eq('test_id', testId)
        .eq('is_retake', false);
      if (rErr) throw rErr;

      const questions = allQuestions ?? [];
      const studentResults = allResults ?? [];

      // Build per-tier blocks then aggregate; class summary covers all tiers but each result is matched to its difficulty's questions
      // For simplicity, send AI a flat list with per-question stats computed against the SAME-difficulty results only
      const byDiff: Record<string, { qs: typeof questions; res: typeof studentResults }> = {};
      questions.forEach(q => {
        const d = String(q.difficulty);
        if (!byDiff[d]) byDiff[d] = { qs: [], res: [] };
        byDiff[d].qs.push(q);
      });
      studentResults.forEach(r => {
        const d = String(r.difficulty_level ?? '');
        if (byDiff[d]) byDiff[d].res.push(r);
      });

      // Flatten with proper per-tier accuracy
      const allPerf: ReturnType<typeof computeQuestionPerformance> = [];
      Object.values(byDiff).forEach(({ qs, res }) => {
        const perf = computeQuestionPerformance(qs as Array<Record<string, unknown>>, res as Array<Record<string, unknown>>);
        allPerf.push(...perf);
      });

      // Build prompt manually now using allPerf
      const totalStudents = studentResults.length;
      const averageScore = totalStudents
        ? Math.round(studentResults.reduce((s, r) => s + Number(r.score ?? 0), 0) / totalStudents)
        : 0;
      const strongest = allPerf.filter(i => i.attempts > 0).sort((a, b) => b.accuracy - a.accuracy).slice(0, 4)
        .map(i => `Q${i.questionNumber}(${i.difficulty}) ${i.accuracy}% ${i.questionText}`);
      const weakest = allPerf.filter(i => i.attempts > 0).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5)
        .map(i => `Q${i.questionNumber}(${i.difficulty}) ${i.accuracy}% wrong=${i.incorrect} skip=${i.skipped} ${i.questionText}`);
      const stats = allPerf.map(i =>
        `Q${i.questionNumber}|diff=${i.difficulty}|acc=${i.accuracy}%|c=${i.correct}|w=${i.incorrect}|s=${i.skipped}|ans=${i.correctAnswer}|t=${i.questionText}`,
      );

      const prompt = `You are a teacher coach. Test "${testTitle}" (${testSubject || 'General'}). Per-question performance is computed only against students who saw that difficulty tier — counts are accurate.

Return ONLY valid JSON:
{"summary":"...","strengths":["..."],"improvements":["..."],"topicHeatmap":{"Concept":{"level":"high|medium|low","evidence":"...","questionRefs":["Q1"]}}}

Rules:
- summary: 4 sentences. Mention overall avg, strongest pattern, weakest pattern, top reteach priority. Cite Q numbers and difficulty tiers.
- strengths: 3 items. Reference concrete concepts/questions students mastered.
- improvements: 3 items. Reference weak questions and what to reteach.
- topicHeatmap: 6-10 concepts. level=high(>=75%) | medium(45-74%) | low(<45%). Include short evidence + questionRefs.

Class size: ${totalStudents}, Avg: ${averageScore}%
Strongest: ${strongest.join(' ; ') || 'n/a'}
Weakest: ${weakest.join(' ; ') || 'n/a'}

Per-question stats:
${stats.join('\n')}`;

      const resp = await callGemini(prompt, geminiApiKey, 4096);
      const parsed = parseGeminiJson(resp);
      const summary = String(parsed.summary ?? '').trim();
      const topicHeatmap = normalizeHeatmap(parsed.topicHeatmap);
      const strengths = normalizeStringArray(parsed.strengths);
      const improvements = normalizeStringArray(parsed.improvements);

      if (!summary && Object.keys(topicHeatmap).length === 0) {
        throw new HttpError(502, 'AI response did not include a class summary');
      }

      const { error: upErr } = await supabase
        .from('test_class_summaries')
        .upsert({
          test_id: testId,
          summary,
          topic_heatmap: topicHeatmap,
          generated_at: new Date().toISOString(),
        }, { onConflict: 'test_id' });
      if (upErr) throw upErr;

      return jsonResponse({
        success: true, cached: false,
        insights: { summary, strengths, improvements, topicHeatmap },
        generatedAt: new Date().toISOString(),
      });
    }

    // ============ MODE: per-student insights ============
    if (!resultId) throw new HttpError(400, 'resultId is required for student insights');

    const { data: existing, error: lookupErr } = await supabase
      .from('test_results')
      .select('ai_strengths, ai_improvements, ai_topic_tags, ai_generated_at, test_id, difficulty_level, answers')
      .eq('id', resultId)
      .maybeSingle();
    if (lookupErr) throw lookupErr;

    const hasCached = existing && [
      normalizeStringArray(existing.ai_strengths),
      normalizeStringArray(existing.ai_improvements),
      normalizeStringArray(existing.ai_topic_tags),
    ].some(arr => arr.length > 0);

    if (hasCached && !forceRegenerate) {
      return jsonResponse({
        success: true, cached: true,
        insights: {
          strengths: normalizeStringArray(existing?.ai_strengths),
          improvements: normalizeStringArray(existing?.ai_improvements),
          topicTags: normalizeStringArray(existing?.ai_topic_tags),
        },
        generatedAt: existing?.ai_generated_at ?? null,
      });
    }
    if (hasCached && forceRegenerate && isWithin24h(existing?.ai_generated_at as string | null)) {
      throw new HttpError(429, 'Insights were already regenerated today. Try again tomorrow.');
    }

    // Fetch only the questions matching this student's difficulty tier
    const studentTestId = existing?.test_id ?? body.testId;
    const studentDifficulty = existing?.difficulty_level ?? null;
    const studentAnswers = existing?.answers ?? body.answers;

    if (!studentTestId) throw new HttpError(400, 'Could not determine test for this result');

    let qQuery = supabase
      .from('questions')
      .select('id, question_text, correct_answer, difficulty, order_index')
      .eq('test_id', studentTestId)
      .neq('difficulty', 'practice')
      .order('order_index');
    if (studentDifficulty) qQuery = qQuery.eq('difficulty', studentDifficulty);
    const { data: questions, error: qErr } = await qQuery;
    if (qErr) throw qErr;

    const prompt = buildStudentPrompt(
      testTitle,
      testSubject,
      (questions ?? []) as Array<Record<string, unknown>>,
      studentAnswers,
      studentDifficulty || 'general',
    );

    const resp = await callGemini(prompt, geminiApiKey, 2048);
    const parsed = parseGeminiJson(resp);
    const strengths = normalizeStringArray(parsed.strengths);
    const improvements = normalizeStringArray(parsed.improvements);
    const topicTags = normalizeStringArray(parsed.topicTags);

    const { error: upErr } = await supabase
      .from('test_results')
      .update({
        ai_strengths: strengths,
        ai_improvements: improvements,
        ai_topic_tags: topicTags,
        ai_generated_at: new Date().toISOString(),
      })
      .eq('id', resultId);
    if (upErr) throw upErr;

    return jsonResponse({
      success: true, cached: false,
      insights: { strengths, improvements, topicTags },
      generatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('Error in generate-insights:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = error instanceof HttpError ? error.status : 500;
    return jsonResponse({ error: message }, status);
  }
});
