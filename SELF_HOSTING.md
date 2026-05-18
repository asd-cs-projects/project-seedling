# Self-Hosting on Your Own Supabase Project

This guide gets the app running against **your** Supabase project
(`bwehlqgjebghfnbrlpgd.supabase.co`) instead of Lovable Cloud, with the
fastest possible setup via **GitHub Codespaces**.

> The Lovable preview will keep using Lovable Cloud — that can't be changed.
> Your self-hosted copy lives outside Lovable (Codespaces / local / Vercel).

---

## TL;DR (Codespaces, 5 minutes)

1. **Push this repo to GitHub** (Lovable → Plus (+) menu → GitHub → Connect).
2. On GitHub: **Code → Codespaces → Create codespace on main**.
3. Wait ~2 min for `.devcontainer/post-create.sh` to install Supabase CLI, Deno, and npm deps.
4. Open `.env.local` and paste your **anon key** (Supabase Dashboard → Project Settings → API).
5. In the Codespace terminal:
   ```bash
   bash scripts/setup-supabase.sh
   ```
   This logs you in, links project `bwehlqgjebghfnbrlpgd`, pushes all migrations,
   deploys all 4 edge functions, and sets the required secrets interactively.
6. ```bash
   npm run dev
   ```
   Codespaces auto-forwards port 5173 and opens the app in your browser.

That's it. The next sections cover what's happening and how to verify it.

---

## What's included

| File | Purpose |
|---|---|
| `.devcontainer/devcontainer.json` | Codespaces config — Node 20, GitHub CLI, Tailwind/Deno/Supabase VS Code extensions, port forwarding for 5173 / 54321 / 54323. |
| `.devcontainer/post-create.sh` | Installs Supabase CLI + Deno, runs `npm install`, scaffolds `.env.local`. |
| `scripts/setup-supabase.sh` | One-shot link → migrate → deploy functions → set secrets. Idempotent. |
| `.env.local` | Frontend env vars pointing at your Supabase project. **Gitignored.** |

---

## Prerequisites

- A Supabase project at `https://bwehlqgjebghfnbrlpgd.supabase.co` (already created).
- Database password for that project (Dashboard → Project Settings → Database).
- An OpenRouter API key (free tier works): https://openrouter.ai/keys
- A GitHub account with Codespaces enabled (free tier gives 60 hr/month).

---

## Step-by-step (manual / local equivalent)

If you're not using Codespaces, do these manually on any machine with Node 20+ and the Supabase CLI:

### 1. Install Supabase CLI
```bash
curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz \
  | sudo tar -xz -C /usr/local/bin supabase
```
(macOS: `brew install supabase/tap/supabase`)

### 2. Link to your project
```bash
supabase login
supabase link --project-ref bwehlqgjebghfnbrlpgd
```

### 3. Push the database schema
```bash
supabase db push
```
This applies every file in `supabase/migrations/` (tables, RLS policies, RPC
functions like `get_assessment_questions` / `score_submission`, the
`handle_new_user` trigger, the `test-files` storage bucket, and realtime
publications).

### 4. Deploy edge functions
```bash
supabase functions deploy generate-insights
supabase functions deploy parse-questions
supabase functions deploy pdf-ocr
supabase functions deploy verify-admin-id
```

### 5. Set edge function secrets
```bash
supabase secrets set \
  OPENROUTER_API_KEY=sk-or-v1-... \
  OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free \
  ADMIN_SECRET_ID=$(openssl rand -hex 24)
```

> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
> auto-injected — never set those yourself.

### 6. Configure frontend env
Create `.env.local` in the project root:
```env
VITE_SUPABASE_URL="https://bwehlqgjebghfnbrlpgd.supabase.co"
VITE_SUPABASE_PROJECT_ID="bwehlqgjebghfnbrlpgd"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGc...your-anon-key..."
```

### 7. Run it
```bash
npm install
npm run dev
```

---

## Auth setup (one-time, in Supabase Dashboard)

**Authentication → Providers → Email**
- Enable. Toggle **Confirm email = OFF** if you want instant login.

**Authentication → Providers → Google** (optional)
- Enable, paste OAuth client ID/secret.

**Authentication → URL Configuration**
- **Site URL**: your production URL (e.g. `https://your-app.vercel.app`)
- **Redirect URLs**: add both:
  - `https://your-app.vercel.app/**`
  - `http://localhost:5173/**`
  - For Codespaces, also add: `https://*.app.github.dev/**`

---

## Verifying everything works

After `npm run dev`:

1. Sign up as a **teacher** (use your `ADMIN_SECRET_ID` if prompted).
2. Create a test → upload a PDF.
   - This calls `pdf-ocr` then `parse-questions`. Watch logs:
     `supabase functions logs pdf-ocr --project-ref bwehlqgjebghfnbrlpgd`
3. Sign up as a **student** in another browser → take the test.
4. Back as teacher → open the student's result → **Generate AI Summary**.
   - This calls `generate-insights`.

If any AI call returns 429: you've hit OpenRouter's free-tier rate limit
(20 req/min, ~200/day). Wait or top up $10 to lift the daily cap to 1000.

---

## Production deploy (Vercel)

1. Push to GitHub (the Codespace is already a clone — `git push`).
2. Vercel → New Project → import repo → framework **Vite**.
3. Add env vars (same three as `.env.local`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PROJECT_ID`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Deploy.

If you also use `api/chat.ts`, add `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`
in Vercel env vars too.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `supabase link` asks for DB password | Get it from Dashboard → Project Settings → Database → Connection string. |
| Edge function returns 500 "OPENROUTER_API_KEY not configured" | Re-run `supabase secrets set OPENROUTER_API_KEY=...`. No redeploy needed. |
| Login works locally but not on Vercel | Add the Vercel URL to Auth → URL Configuration → Redirect URLs. |
| PDF OCR returns garbage | Confirm `OPENROUTER_MODEL` is a vision-capable free model: `google/gemini-2.0-flash-exp:free`. |
| `supabase db push` fails on a migration | A migration may already be applied. Run `supabase migration repair --status applied <timestamp>` for the offending file, then retry. |
| Codespaces port 5173 doesn't auto-open | Click the **Ports** tab → globe icon next to 5173. |

---

## Updating later

When new migrations or function changes land in this repo:
```bash
git pull
supabase db push
supabase functions deploy generate-insights parse-questions pdf-ocr verify-admin-id
```
Frontend changes auto-deploy on Vercel via the GitHub integration.
