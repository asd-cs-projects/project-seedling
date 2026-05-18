#!/usr/bin/env bash
# One-shot setup for self-hosting on Supabase project bwehlqgjebghfnbrlpgd.
# - Links the CLI to your project
# - Pushes every migration in supabase/migrations/
# - Deploys all 4 edge functions
# - Prompts for and sets the 3 required secrets (OPENROUTER_API_KEY,
#   OPENROUTER_MODEL, ADMIN_SECRET_ID)
#
# Safe to re-run. Skips steps that are already done.
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-bwehlqgjebghfnbrlpgd}"
FUNCTIONS=(generate-insights parse-questions pdf-ocr verify-admin-id)

command -v supabase >/dev/null || { echo "Supabase CLI not found. Run .devcontainer/post-create.sh first."; exit 1; }

echo "▶ Logging into Supabase (browser/device flow)..."
supabase login || true

echo "▶ Linking project ref ${PROJECT_REF} (you'll be prompted for the DB password)..."
supabase link --project-ref "${PROJECT_REF}"

echo "▶ Pushing database migrations..."
supabase db push

echo "▶ Deploying edge functions..."
for fn in "${FUNCTIONS[@]}"; do
  echo "  • ${fn}"
  supabase functions deploy "${fn}" --project-ref "${PROJECT_REF}"
done

echo
echo "▶ Setting edge function secrets."
echo "  Get your OpenRouter key at https://openrouter.ai/keys"
read -rp "  OPENROUTER_API_KEY (leave blank to skip): " OR_KEY
read -rp "  OPENROUTER_MODEL [google/gemini-2.0-flash-exp:free]: " OR_MODEL
OR_MODEL="${OR_MODEL:-google/gemini-2.0-flash-exp:free}"
read -rp "  ADMIN_SECRET_ID (random string to gate admin signup): " ADMIN_ID

ARGS=()
[ -n "$OR_KEY" ]   && ARGS+=("OPENROUTER_API_KEY=$OR_KEY")
ARGS+=("OPENROUTER_MODEL=$OR_MODEL")
[ -n "$ADMIN_ID" ] && ARGS+=("ADMIN_SECRET_ID=$ADMIN_ID")

if [ ${#ARGS[@]} -gt 0 ]; then
  supabase secrets set --project-ref "${PROJECT_REF}" "${ARGS[@]}"
fi

cat <<EOF

✅ Done.

Verify in the Supabase dashboard:
  • Database tables created: https://supabase.com/dashboard/project/${PROJECT_REF}/editor
  • Functions deployed:      https://supabase.com/dashboard/project/${PROJECT_REF}/functions
  • Secrets set:             https://supabase.com/dashboard/project/${PROJECT_REF}/settings/functions

Then run:   npm run dev
EOF
