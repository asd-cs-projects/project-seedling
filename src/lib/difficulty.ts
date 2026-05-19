// Centralised difficulty tier config for the 5-tier system.
// Order matters — used by adaptive logic (low → high).
export const DIFFICULTY_TIERS = [
  { value: 'practice', label: 'Practice' },
  { value: 'basic', label: 'Basic' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
] as const;

export type DifficultyTier = typeof DIFFICULTY_TIERS[number]['value'];

export const NON_PRACTICE_TIERS: DifficultyTier[] = ['basic', 'easy', 'medium', 'hard'];

export const getDifficultyColor = (diff: string) => {
  switch (diff) {
    case 'practice': return 'bg-accent/20 text-accent-foreground';
    case 'basic':    return 'bg-primary/15 text-primary';
    case 'easy':     return 'bg-success/20 text-success';
    case 'medium':   return 'bg-warning/20 text-warning-foreground';
    case 'hard':     return 'bg-destructive/20 text-destructive';
    default:         return 'bg-muted text-muted-foreground';
  }
};

/**
 * Map a 0–100 practice score to the student's ENTRY module tier.
 * Practice itself is never a real module; entry tier is one of basic/easy/medium/hard.
 *   80–100% → hard
 *   50–80%  → medium
 *   20–50%  → easy
 *   0–20%   → basic
 */
export const scoreToTier = (score: number): DifficultyTier => {
  if (score >= 80) return 'hard';
  if (score >= 50) return 'medium';
  if (score >= 20) return 'easy';
  return 'basic';
};

/**
 * Adaptive shift between modules based on the just-finished module score.
 *   80–100% → +2
 *   50–80%  → +1
 *   20–50%  → -1
 *   0–20%   → -2
 * Clamped to [basic, hard] (never returns 'practice').
 */
export const shiftTier = (current: DifficultyTier, score: number): DifficultyTier => {
  const ladder: DifficultyTier[] = ['basic', 'easy', 'medium', 'hard'];
  let delta = 0;
  if (score >= 80) delta = 2;
  else if (score >= 50) delta = 1;
  else if (score >= 20) delta = -1;
  else delta = -2;
  const idx = ladder.indexOf(current);
  if (idx < 0) return 'easy';
  return ladder[Math.max(0, Math.min(ladder.length - 1, idx + delta))];
};
