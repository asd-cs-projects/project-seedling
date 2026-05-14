# Self-Hosting Deployment Guide

This app is fully portable: **own Supabase project + Vercel frontend + OpenRouter for AI**.
No Lovable Cloud or Lovable AI Gateway is required at runtime.

---

## 1. Prerequisites

- A [Supabase](https://supabase.com) account (free tier works)
- A [Vercel](https://vercel.com) account
- An [OpenRouter](https://openrouter.ai/keys) account (one API key, any model)
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed locally
- [Node.js 18+](https://nodejs.org) and `npm` (or `bun`)

---

## 2. Create your own Supabase project

1. Go to https://supabase.com/dashboard → **New Project**.
2. Note these values from **Project Settings → API**:
   - **Project URL** (e.g. `https://xxxx.supabase.co`)
   - **Project Ref / ID** (e.g. `xxxx`)
   - **anon / publishable key**
   - **service_role key** (keep secret — server only)

---

## 3. Run database migrations

From the project root:

```bash
# Link the CLI to your new project (you'll be prompted for the DB password)
supabase link --project-ref <YOUR_PROJECT_REF>

# Push every migration in supabase/migrations/ to your DB
supabase db push
```

This creates all tables, RLS policies, the `app_role` enum, the `handle_new_user` trigger, RPC functions (`get_assessment_questions`, `get_review_questions`, `score_submission`, `has_role`), and the `test-files` storage bucket.

---

## 4. Configure Auth

In the Supabase Dashboard → **Authentication → Providers**:

- **Email**: enable. Toggle **Confirm email = OFF** if you want immediate login (matches current behavior).
- **Google** (optional but recommended): enable and paste your Google OAuth client ID/secret.

In **Authentication → URL Configuration**:

- **Site URL**: your Vercel URL (e.g. `https://your-app.vercel.app`)
- **Redirect URLs**: add `https://your-app.vercel.app/**` and `http://localhost:5173/**` (for local dev)

---

## 5. Deploy Edge Functions

```bash
supabase functions deploy generate-insights
supabase functions deploy parse-questions
supabase functions deploy pdf-ocr
supabase functions deploy verify-admin-id
```

All four functions run on Deno and have no Lovable-specific dependencies.

---

## 6. Set Edge Function secrets

This app uses **OpenRouter** for all AI calls (PDF OCR, question parsing, AI insights, chat). You pick the model.

In the Supabase Dashboard → **Edge Functions → Secrets** (or `supabase secrets set`):

| Secret | Value | Where to get it |
|---|---|---|
| `OPENROUTER_API_KEY` | `sk-or-v1-…` | https://openrouter.ai/keys |
| `OPENROUTER_MODEL` | **Recommended (100% free):** `google/gemini-2.0-flash-exp:free`. Other free options: `meta-llama/llama-3.2-11b-vision-instruct:free`, `qwen/qwen-2.5-vl-72b-instruct:free`. | Pick any model with the `:free` suffix at https://openrouter.ai/models?max_price=0. Free models support PDF input natively (no paid `mistral-ocr` plugin needed). Free tier = 20 req/min, 200 req/day per account ($10 lifetime credit raises it to 1000/day). |
| `ADMIN_SECRET_ID` | any string you choose | Used to gate admin signups. Pick a strong random value. |

> **Note:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are **auto-injected** by Supabase into every edge function — you do **not** need to set them manually.

CLI alternative:

```bash
supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
supabase secrets set OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free
supabase secrets set ADMIN_SECRET_ID=your-strong-random-string
```

To **edit** a secret later (e.g. switch models), run `supabase secrets set NAME=newvalue` again, or update it in the Dashboard. No redeploy needed — edge functions pick up the new value on next invocation.

If you also deploy the `api/chat.ts` Vercel serverless route, set the same `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in **Vercel → Settings → Environment Variables**.

---

## 7. Deploy the frontend to Vercel

1. Push this repo to GitHub.
2. On Vercel: **New Project** → import the repo.
3. Framework preset: **Vite**.
4. Add the following **Environment Variables** (Production + Preview + Development):

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<your-project-ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the `anon` / publishable key from Supabase |
| `VITE_SUPABASE_PROJECT_ID` | your project ref (e.g. `xxxx`) |

5. Click **Deploy**.

To **edit** these later: Vercel Dashboard → Project → **Settings → Environment Variables** → edit → **Redeploy**.

---

## 8. Storage bucket

The migrations already create a private `test-files` bucket with RLS policies. No manual action needed.

---

## 9. Verify everything works

1. Open your Vercel URL.
2. Sign up as a teacher → confirm auto-login works.
3. Create a test → upload a PDF → verifies `pdf-ocr` + `parse-questions` (uses OpenRouter).
4. As a student, take the test → check results.
5. As a teacher, open a student's detail page → click "Generate AI Summary" → verifies `generate-insights` (uses OpenRouter).

---

## Summary: every env var, where it lives, how to edit it

### Backend (Supabase Edge Function Secrets)
| Variable | Editable how |
|---|---|
| `OPENROUTER_API_KEY` | Supabase Dashboard → Edge Functions → Secrets, **or** `supabase secrets set OPENROUTER_API_KEY=...` |
| `OPENROUTER_MODEL` | same — set to any OpenRouter model slug (e.g. `openai/gpt-4o-mini`) |
| `ADMIN_SECRET_ID` | same as above |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | auto-injected, do not edit |

### Frontend (Vercel Environment Variables)
| Variable | Editable how |
|---|---|
| `VITE_SUPABASE_URL` | Vercel → Settings → Environment Variables → redeploy |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same |
| `VITE_SUPABASE_PROJECT_ID` | same |
| `OPENROUTER_API_KEY` (only if using `api/chat.ts`) | same |
| `OPENROUTER_MODEL` (only if using `api/chat.ts`) | same |

### Local development
Create a local `.env` file (gitignored) with the three `VITE_*` vars pointing at your Supabase project, then run `npm run dev`.

---

## Troubleshooting

- **"OPENROUTER_API_KEY not configured"** in edge function logs → set the secret in Supabase Dashboard → Edge Functions → Secrets.
- **AI calls return 429** → you've hit the free-tier rate limit (20 req/min, ~200/day). Wait a minute, or add $10 of credits to OpenRouter to lift the daily cap to 1000. Never switch to a paid model unless you want to spend money.
- **PDF OCR returns garbage / empty** → the chosen `OPENROUTER_MODEL` doesn't support PDF input well. Use `google/gemini-2.0-flash-exp:free` (best free option for PDFs) or `qwen/qwen-2.5-vl-72b-instruct:free`.
- **Auth redirects to wrong URL** → fix Site URL / Redirect URLs in Supabase Auth settings.
- **CORS errors** → confirm edge functions deployed successfully (`supabase functions list`).
- **Edge function 401** → make sure the frontend is sending the Supabase JWT in the `Authorization: Bearer <token>` header (the SDK does this automatically when the user is logged in).
