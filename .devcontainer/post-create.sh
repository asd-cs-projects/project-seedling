#!/usr/bin/env bash
# Codespaces / Devcontainer bootstrap for self-hosting on Supabase project
# bwehlqgjebghfnbrlpgd. Idempotent — safe to re-run.
set -euo pipefail

echo "▶ Installing Supabase CLI..."
if ! command -v supabase >/dev/null 2>&1; then
  curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz \
    | sudo tar -xz -C /usr/local/bin supabase
fi
supabase --version

echo "▶ Installing Deno (for edge function local dev)..."
if ! command -v deno >/dev/null 2>&1; then
  curl -fsSL https://deno.land/install.sh | sh -s -- -y
  echo 'export DENO_INSTALL="$HOME/.deno"' >> ~/.bashrc
  echo 'export PATH="$DENO_INSTALL/bin:$PATH"' >> ~/.bashrc
fi

echo "▶ Installing npm dependencies..."
npm install --no-audit --no-fund

echo "▶ Creating .env.local from template (if missing)..."
if [ ! -f .env.local ]; then
  cat > .env.local <<EOF
# Frontend env — points the Vite app at your self-hosted Supabase project.
VITE_SUPABASE_URL="https://bwehlqgjebghfnbrlpgd.supabase.co"
VITE_SUPABASE_PROJECT_ID="bwehlqgjebghfnbrlpgd"
# Paste your anon/publishable key from: Supabase Dashboard → Project Settings → API
VITE_SUPABASE_PUBLISHABLE_KEY=""
EOF
  echo "  ⚠  Edit .env.local and paste your anon key before running 'npm run dev'."
fi

cat <<'EOF'

✅ Codespace ready.

Next steps:
  1. Edit .env.local and paste VITE_SUPABASE_PUBLISHABLE_KEY (anon key from Supabase dashboard).
  2. Run:   bash scripts/setup-supabase.sh
     This links the CLI, pushes migrations, deploys all edge functions, and sets secrets.
  3. Run:   npm run dev
     Opens Vite on port 5173 (Codespaces auto-forwards it).

See SELF_HOSTING.md for the full guide.
EOF
