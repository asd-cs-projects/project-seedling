# Migrate to your own Supabase project (`bwehlqgjebghfnbrlpgd`) + switch model

## Important upfront

**1. I cannot perform the migration from inside Lovable.** Lovable Cloud is locked to the managed project (`wgfcrabwubcirrxjtbtr`). The migration to `bwehlqgjebghfnbrlpgd` is a one-time manual step you run locally with the Supabase CLI. After that, this Lovable project will keep editing code, but the backend (DB, edge functions, secrets, auth users) lives 100% in your own Supabase account.

**2. Nemotron breaks PDF upload.** `nvidia/nemotron-3-super-120b-a12b:free` is text-only. The `pdf-ocr` edge function will fail on any PDF that doesn't have a clean text layer, and even text PDFs may fail because Nemotron doesn't accept the `file` content type. You confirmed you want this anyway.

---

## What I'll do inside Lovable (automated)

### A. Switch the model
- Update the `OPENROUTER_MODEL` secret on the current Lovable Cloud backend to `nvidia/nemotron-3-super-120b-a12b:free` so the app keeps working while you migrate.
- Update `api/chat.ts` default fallback and `DEPLOYMENT.md` references from `google/gemini-2.0-flash-exp:free` → `nvidia/nemotron-3-super-120b-a12b:free`.
- Edge function code already reads from `OPENROUTER_MODEL` env, so no function code changes needed for the swap.

### B. Prep the codebase for self-hosting
- Verify all 4 edge functions (`pdf-ocr`, `parse-questions`, `generate-insights`, `verify-admin-id`) have no Lovable-specific imports — they don't, they're pure Deno + OpenRouter.
- Confirm `supabase/migrations/` contains every migration (it does — schema, RLS, storage bucket, RPCs, `handle_new_user` trigger, `REPLICA IDENTITY FULL` for realtime).
- Update `DEPLOYMENT.md` with the exact commands for your project ref `bwehlqgjebghfnbrlpgd`.

---

## What you do locally (one-time, ~10 minutes)

### Step 1 — Get the code
Download the project as a ZIP from Lovable (Code Editor → Download codebase) OR connect to GitHub and clone it.

### Step 2 — Install Supabase CLI
```bash
npm install -g supabase
```

### Step 3 — Link to YOUR project
```bash
cd <project-folder>
supabase login
supabase link --project-ref bwehlqgjebghfnbrlpgd
```
(It will prompt for your DB password — find/set it in Supabase Dashboard → Project Settings → Database.)

### Step 4 — Push DB schema (creates all tables, RLS, RPCs, bucket)
```bash
supabase db push
```

### Step 5 — Deploy edge functions
```bash
supabase functions deploy pdf-ocr --no-verify-jwt
supabase functions deploy parse-questions --no-verify-jwt
supabase functions deploy generate-insights --no-verify-jwt
supabase functions deploy verify-admin-id --no-verify-jwt
```

### Step 6 — Add secrets to YOUR Supabase
In Supabase Dashboard (`bwehlqgjebghfnbrlpgd`) → **Edge Functions → Secrets**, add:
| Name | Value |
|---|---|
| `OPENROUTER_API_KEY` | your OpenRouter key (sk-or-v1-…) |
| `OPENROUTER_MODEL` | `nvidia/nemotron-3-super-120b-a12b:free` |
| `ADMIN_SECRET_ID` | your chosen admin signup secret |

(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are auto-injected — don't add them.)

### Step 7 — Configure Auth
Supabase Dashboard → **Authentication → Providers**: enable Email (Confirm email OFF if you want immediate login). **URL Configuration → Site URL**: set to your deployed frontend URL; add `http://localhost:5173/**` to Redirect URLs.

### Step 8 — Point the frontend at your project
Two options:
- **Local dev / Vercel**: set env vars `VITE_SUPABASE_URL=https://bwehlqgjebghfnbrlpgd.supabase.co`, `VITE_SUPABASE_PUBLISHABLE_KEY=<your anon key>`, `VITE_SUPABASE_PROJECT_ID=bwehlqgjebghfnbrlpgd`.
- **Keep editing in Lovable**: Lovable's preview will still hit `wgfcrabwubcirrxjtbtr` because `.env` is auto-managed. You'd run/host the production app elsewhere (Vercel, etc.) with the env vars above. The Lovable preview becomes a dev sandbox; your real users hit your Supabase project.

---

## Trade-offs you should know

- **Existing data won't transfer.** Any teacher/student accounts and tests created on the Lovable Cloud backend stay there. Users need to sign up again on the new backend.
- **Lovable preview keeps using `wgfcrabwubcirrxjtbtr`.** I can't repoint the preview to your external Supabase — `src/integrations/supabase/client.ts` and `.env` are auto-generated from Lovable Cloud.
- **PDF upload will be broken** after the model swap. To restore it later, set `OPENROUTER_MODEL` back to `google/gemini-2.0-flash-exp:free` (or any free vision model) — no code changes needed.

---

## Technical changes I'll make in this project

- `secrets--update_secret` on `OPENROUTER_MODEL` → `nvidia/nemotron-3-super-120b-a12b:free`
- Edit `api/chat.ts` line 9: default fallback model string
- Edit `DEPLOYMENT.md`: replace model recommendations, add your project ref `bwehlqgjebghfnbrlpgd` to the link command, add a "Nemotron is text-only" warning

Approve to proceed.