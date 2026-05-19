
-- Add explanation column to questions for Khan-style answer explanations
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS explanation text,
  ADD COLUMN IF NOT EXISTS option_explanations jsonb;

-- Class summary already has generated_at; ensure index for daily lookup is fine (no change needed)

-- Add per-student summary timestamp on test_results for daily regen lockout
ALTER TABLE public.test_results
  ADD COLUMN IF NOT EXISTS ai_generated_at timestamptz;
