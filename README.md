# ASD Benchmark Portal — Documentation

Developed by Hridansh Kumar, Abdul Rahman Riaz Ahamed, Adityansu Pattanaik and Rishabh Agarwal.

## 1. Overview

ASD Benchmark Portal is a school assessment platform with two roles:

- **Students** sign in with an ASD ID (`ASD-XXXXXXX`), take adaptive MCQ tests, and review AI-generated feedback on their performance.
- **Teachers** create tests, upload PDFs of questions (auto-parsed), monitor live sessions, view per-student analytics, and read AI-generated class summaries.

Tech stack: React 18 + Vite + TypeScript + Tailwind + shadcn/ui on the frontend; Supabase (Postgres, Auth, Storage, Edge Functions) on the backend; Gemini and OpenRouter LLMs for AI.

## 2. Authentication & Roles

- Auth uses Supabase Email/Password under the hood, but the "email" is a synthetic value derived from the ASD ID (`src/lib/asdId.ts`).
- A Postgres trigger (`handle_new_user`) inserts a row into `profiles` and assigns a role into `user_roles` from signup metadata.
- Teacher signup additionally requires an Admin ID validated server-side by the `verify-admin-id` edge function (compares against the `ADMIN_SECRET_ID` secret).
- Role checks in RLS go through the security-definer `has_role(uuid, app_role)` function to avoid recursive policies.

Student profile data (collected on signup):
- Full Name — auto-normalized to Proper Case.
- Grade — dropdown 1–12.
- Section — dropdown A–Z (stored as a single uppercase letter).
- Gender, Age.

## 3. Database Schema (public)

| Table | Purpose |
|-------|---------|
| `profiles` | Per-user profile (name, grade, section, etc.). |
| `user_roles` | Role assignments (`student`, `teacher`, `admin`). |
| `tests` | Test metadata (title, subject, duration, target grade/section, adaptive flag, groups_per_student). |
| `passages` | Reading passages / media attached to a test. |
| `questions` | MCQs, difficulty tier, options, correct answer, optional media, explanations. |
| `test_sessions` | In-progress test state (answers, current question, time remaining). |
| `test_results` | Submitted results (score, correct/wrong, AI tags). |
| `student_summaries` | AI per-student summary, strengths, improvements. |
| `test_class_summaries` | AI class-level summary + topic heatmap per test. |

Key DB functions: `get_assessment_questions` (RLS-safe read for students taking a test), `get_review_questions` (post-attempt review with answers/explanations), `score_submission` / `score_full_submission` (server-side authoritative scoring).

## 4. Test Lifecycle

1. **Create** — Teacher uses the Create Test Wizard (`src/components/teacher/CreateTestWizard.tsx`). Basic info → questions. Duration is a free-form numeric field; empty + Enter defaults to 30 minutes.
2. **Add questions** — manually via QuestionBuilder, or by uploading a PDF (see AI section below).
3. **Adaptive mode** — when enabled, the test moves the student up/down a difficulty tier after each group. `groups_per_student` is a dropdown 1–5.
4. **Take test** — Student opens via `AssessmentInterface`. Sessions persist server-side so refresh/disconnect is safe.
5. **Score** — Submission is scored server-side by `score_*` functions (RLS + security definer).
6. **Review** — Student sees results + question-by-question review with AI explanations.

## 5. AI — What is used where

The portal uses two AI providers, accessed only from edge functions (keys live in Supabase secrets, never the browser).

### Google Gemini (`GEMINI_API_KEY`)
Used inside `supabase/functions/pdf-ocr/`:
- The teacher uploads a PDF of questions.
- The frontend signs a short-lived URL to the file in the `test-files` bucket and posts it to the `pdf-ocr` edge function.
- The edge function calls **Gemini multimodal** to OCR the PDF, returning structured text plus any embedded images.

### OpenRouter (`OPENROUTER_API_KEY`, model from `OPENROUTER_MODEL`)
Used inside:

- **`supabase/functions/parse-questions/`** — Takes the OCR'd text + images from `pdf-ocr` and asks the LLM to produce a clean JSON array of MCQs (`question_text`, `options`, `correct_answer`, `marks`, optional `media_url`/`media_type`). The teacher then assigns a difficulty tier per question and saves them.

- **`supabase/functions/generate-insights/`** — Multi-mode AI helper:
  - `explanations` mode — generates Khan-style per-option explanations for every question in a test. Fired in the background after questions are saved.
  - `student_summary` mode — given a student's results across one subject, produces a short narrative summary plus arrays of `strengths` and `improvements`, persisted to `student_summaries` and surfaced in the Student Dashboard / Results pages.
  - `class_summary` mode — given a test's aggregated results, produces a class-level summary + topic heatmap persisted to `test_class_summaries` and surfaced in the Teacher Dashboard's test results view.

### Where AI surfaces in the UI
- **Teacher Create Test Wizard** — "Import from PDF" button → Gemini OCR + OpenRouter question parsing.
- **Student Results page (`AIInsights.tsx`)** — narrative summary, strengths, improvements.
- **Question Review** — per-option explanations generated in the background.
- **Teacher Test Results page** — class summary + topic heatmap.

### Safety / privacy notes
- API keys are never exposed to the browser; only edge functions read them via `Deno.env.get(...)`.
- All AI writes go through RLS-protected tables; the edge function uses the service role only for scoped writes and never returns the service token.
- The model used is configurable through the `OPENROUTER_MODEL` secret.

## 6. Frontend structure

```
src/
  components/
    auth/         LoginPage, ProtectedRoute
    landing/      LandingPage
    dashboard/    NewStudentDashboard, NewTeacherDashboard
    assessment/   AssessmentInterface (test-taking UI)
    teacher/      CreateTestWizard, TestEditor, QuestionBuilder, PassageManager,
                  LiveSessionsMonitor, TestResultsPage, StudentDetailPage, PDFUploader
    results/      StudentResultDetail, AIInsights, QuestionReview
    ui/           shadcn primitives + InfoButton (the little "i" popover)
  contexts/       AuthContext
  hooks/          useFileUpload, usePassages, useQuestions, use-toast, use-mobile
  lib/            asdId, properCase, pdfReport, chartCapture, difficulty, utils
  integrations/supabase/  client, types (auto-generated)
supabase/
  config.toml
  functions/      pdf-ocr, parse-questions, generate-insights, verify-admin-id
```

## 7. UI conventions

- All colors come from the design tokens in `src/index.css` + `tailwind.config.ts` — no raw hex/Tailwind color names in components.
- The "i" button in the bottom-right of the landing page and both dashboards opens a popover with project credits.
- Names entered at signup are normalized to Proper Case (`src/lib/properCase.ts`).
- Sections are stored as a single uppercase letter; grade as a number string ("1".."12").

## 8. Secrets (set in Supabase)

| Secret | Used by |
|--------|---------|
| `GEMINI_API_KEY` | `pdf-ocr` |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | `parse-questions`, `generate-insights` |
| `ADMIN_SECRET_ID` | `verify-admin-id` (teacher signup gate) |
| `SUPABASE_SERVICE_ROLE_KEY` | edge functions only |

## 9. Local dev

```bash
bun install
bun run dev
```

Environment variables for the frontend (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`) are auto-populated from the connected Supabase project. Edge functions deploy automatically on save.
