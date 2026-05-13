import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import { getStoredAnswer } from '@/lib/utils';
import sckoolLogo from '@/assets/sckool-logo.jpeg';

/** Brand palette (RGB tuples to match jsPDF API). */
export const BRAND = {
  primary: [37, 99, 235] as [number, number, number],     // blue-600
  ink: [17, 24, 39] as [number, number, number],          // gray-900
  muted: [107, 114, 128] as [number, number, number],     // gray-500
  border: [229, 231, 235] as [number, number, number],    // gray-200
  surface: [249, 250, 251] as [number, number, number],   // gray-50
  success: [22, 163, 74] as [number, number, number],     // green-600
  danger: [220, 38, 38] as [number, number, number],      // red-600
  warning: [217, 119, 6] as [number, number, number],     // amber-600
};

export const PAGE = {
  width: 210,
  height: 297,
  margin: 15,
  contentWidth: 180,
  footerY: 285,
};

export const loadImageAsBase64 = (src: string): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg'));
    };
    img.onerror = () => resolve('');
    img.src = src;
  });

const setColor = (
  doc: jsPDF,
  kind: 'fill' | 'text' | 'draw',
  color: [number, number, number],
) => {
  if (kind === 'fill') doc.setFillColor(color[0], color[1], color[2]);
  if (kind === 'text') doc.setTextColor(color[0], color[1], color[2]);
  if (kind === 'draw') doc.setDrawColor(color[0], color[1], color[2]);
};

/** Draws the branded header on the current page. Returns the Y where content can begin. */
export const drawHeader = (doc: jsPDF, logoBase64: string, title: string, subtitle?: string) => {
  if (logoBase64) {
    doc.addImage(logoBase64, 'JPEG', PAGE.margin, 10, 18, 18);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setColor(doc, 'text', BRAND.ink);
  doc.text(title, PAGE.margin + 22, 18);
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    setColor(doc, 'text', BRAND.muted);
    doc.text(subtitle, PAGE.margin + 22, 25);
  }
  setColor(doc, 'draw', BRAND.primary);
  doc.setLineWidth(0.6);
  doc.line(PAGE.margin, 32, PAGE.width - PAGE.margin, 32);
  return 40;
};

export const drawWatermark = (doc: jsPDF, logoBase64: string) => {
  if (!logoBase64) return;
  doc.setGState(new (doc as any).GState({ opacity: 0.05 }));
  doc.addImage(logoBase64, 'JPEG', 60, 110, 90, 90);
  doc.setGState(new (doc as any).GState({ opacity: 1 }));
};

export const drawFooter = (doc: jsPDF, page: number, totalPages: number) => {
  setColor(doc, 'draw', BRAND.border);
  doc.setLineWidth(0.3);
  doc.line(PAGE.margin, PAGE.footerY - 4, PAGE.width - PAGE.margin, PAGE.footerY - 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setColor(doc, 'text', BRAND.muted);
  doc.text(
    `ASD Benchmark Portal  •  Generated ${new Date().toLocaleString()}`,
    PAGE.margin,
    PAGE.footerY,
  );
  doc.text(`Page ${page} of ${totalPages}`, PAGE.width - PAGE.margin, PAGE.footerY, {
    align: 'right',
  });
};

/** Ensures we still have room before drawing — pushes a new page when needed. */
export const ensureSpace = (
  doc: jsPDF,
  y: number,
  needed: number,
  logoBase64: string,
  onNewPage?: (y: number) => number,
) => {
  if (y + needed <= PAGE.footerY - 8) return y;
  doc.addPage();
  drawWatermark(doc, logoBase64);
  let next = 20;
  if (onNewPage) next = onNewPage(next);
  return next;
};

interface QuestionRow {
  id: string;
  question_text: string;
  options: string[];
  correct_answer: string;
  difficulty: string | null;
  order_index: number | null;
  passage_id?: string | null;
}

interface PassageRow {
  id: string;
  passage_code: string;
  title: string | null;
  content: string;
}

export interface FetchedQA {
  questions: QuestionRow[];
  passages: Record<string, PassageRow>;
}

/** Fetches questions + passages for a test, optionally filtered by difficulty.
 * Uses get_review_questions RPC so that students (PDF download from their own
 * results page) can only see correct_answer for tests they've completed. The
 * RPC also works for the test's teacher.
 */
export const fetchQuestionsForReport = async (
  testId: string,
  difficulty?: string | null,
): Promise<FetchedQA> => {
  const [{ data: questionsRaw }, { data: passagesData }] = await Promise.all([
    (supabase as any).rpc('get_review_questions', { _test_id: testId }),
    supabase.from('passages').select('*').eq('test_id', testId),
  ]);

  const passages: Record<string, PassageRow> = {};
  passagesData?.forEach((p) => {
    passages[p.id] = p as PassageRow;
  });

  let filtered = ((questionsRaw as any[]) || []).filter((q) => q.difficulty !== 'practice');
  if (difficulty) filtered = filtered.filter((q) => q.difficulty === difficulty);

  const questions: QuestionRow[] = filtered.map((q: any) => ({
    id: q.id,
    question_text: q.question_text,
    options: Array.isArray(q.options) ? (q.options as string[]) : [],
    correct_answer: (q.correct_answer || '').toUpperCase(),
    difficulty: q.difficulty,
    order_index: q.order_index,
    passage_id: q.passage_id,
  }));

  return { questions, passages };
};

/**
 * Renders a detailed Q-by-Q answer review onto the PDF starting at y.
 * Each question shows: question text, all 4 options, the student's pick, the correct pick.
 */
export const renderAnswerReview = (
  doc: jsPDF,
  startY: number,
  qa: FetchedQA,
  answers: unknown,
  logoBase64: string,
) => {
  let y = startY;

  // Section header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setColor(doc, 'text', BRAND.ink);
  doc.text('Question-by-Question Review', PAGE.margin, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setColor(doc, 'text', BRAND.muted);
  doc.text(
    `${qa.questions.length} questions • ✓ correct  ✗ incorrect  — not answered`,
    PAGE.margin,
    y,
  );
  y += 6;

  qa.questions.forEach((q, idx) => {
    const studentAnswer = getStoredAnswer(answers, q, idx);
    const isCorrect = studentAnswer && studentAnswer === q.correct_answer;
    const noAnswer = !studentAnswer;

    // Pre-measure the question card so we can page-break before drawing.
    const wrappedQuestion = doc.splitTextToSize(
      q.question_text || '(no text)',
      PAGE.contentWidth - 18,
    );
    const optionsCount = Math.min(q.options.length, 4);
    const cardHeight = 16 + wrappedQuestion.length * 4.5 + optionsCount * 6 + 10;

    y = ensureSpace(doc, y, cardHeight + 4, logoBase64);

    // Card background
    setColor(doc, 'fill', BRAND.surface);
    doc.roundedRect(PAGE.margin, y, PAGE.contentWidth, cardHeight, 2, 2, 'F');

    // Status accent bar
    const accent = noAnswer ? BRAND.muted : isCorrect ? BRAND.success : BRAND.danger;
    setColor(doc, 'fill', accent);
    doc.rect(PAGE.margin, y, 1.5, cardHeight, 'F');

    // Q number + status pill
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setColor(doc, 'text', BRAND.ink);
    doc.text(`Q${idx + 1}.`, PAGE.margin + 6, y + 7);

    const statusLabel = noAnswer ? 'NOT ANSWERED' : isCorrect ? 'CORRECT' : 'INCORRECT';
    setColor(doc, 'fill', accent);
    doc.roundedRect(PAGE.width - PAGE.margin - 32, y + 3, 28, 6, 1.5, 1.5, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(statusLabel, PAGE.width - PAGE.margin - 18, y + 7.2, { align: 'center' });

    // Question text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    setColor(doc, 'text', BRAND.ink);
    doc.text(wrappedQuestion, PAGE.margin + 6, y + 13);

    // Options
    let optY = y + 13 + wrappedQuestion.length * 4.5 + 2;
    for (let i = 0; i < optionsCount; i++) {
      const letter = String.fromCharCode(65 + i);
      const optText = String(q.options[i] ?? '').trim();
      const isStudentPick = studentAnswer === letter;
      const isRight = q.correct_answer === letter;

      let bg: [number, number, number] | null = null;
      let fg: [number, number, number] = BRAND.ink;
      let prefix = `${letter}.`;

      if (isRight) {
        bg = [220, 252, 231]; // green-100
        fg = BRAND.success;
        prefix = `✓ ${letter}.`;
      }
      if (isStudentPick && !isRight) {
        bg = [254, 226, 226]; // red-100
        fg = BRAND.danger;
        prefix = `✗ ${letter}.`;
      }

      if (bg) {
        setColor(doc, 'fill', bg);
        doc.roundedRect(PAGE.margin + 6, optY - 3.5, PAGE.contentWidth - 12, 5, 1, 1, 'F');
      }

      setColor(doc, 'text', fg);
      doc.setFont('helvetica', isRight || isStudentPick ? 'bold' : 'normal');
      doc.setFontSize(9);
      const optLines = doc.splitTextToSize(`${prefix} ${optText}`, PAGE.contentWidth - 16);
      doc.text(optLines[0] ?? '', PAGE.margin + 9, optY);
      optY += 6;
    }

    // Footer line: student pick vs correct
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setColor(doc, 'text', BRAND.muted);
    const summary = noAnswer
      ? `Student answer: — (skipped)   |   Correct answer: ${q.correct_answer}`
      : `Student answer: ${studentAnswer}   |   Correct answer: ${q.correct_answer}`;
    doc.text(summary, PAGE.margin + 6, y + cardHeight - 3);

    y += cardHeight + 4;
  });

  return y;
};
