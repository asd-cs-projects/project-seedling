-- Score across ALL non-practice questions the student actually attempted.
CREATE OR REPLACE FUNCTION public.score_full_submission(
  _test_id uuid,
  _answers jsonb
)
RETURNS TABLE (
  total_questions integer,
  correct_answers integer,
  wrong_answers integer,
  score integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer := 0;
  v_correct integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT COUNT(*),
         COUNT(*) FILTER (
           WHERE upper(trim(coalesce(q.correct_answer, ''))) =
                 upper(trim(coalesce(_answers ->> q.id::text, '')))
             AND coalesce(q.correct_answer, '') <> ''
         )
  INTO v_total, v_correct
  FROM public.questions q
  WHERE q.test_id = _test_id
    AND q.difficulty <> 'practice'
    AND _answers ? q.id::text;

  RETURN QUERY SELECT
    v_total,
    v_correct,
    GREATEST(v_total - v_correct, 0),
    CASE WHEN v_total > 0 THEN ROUND((v_correct::numeric / v_total) * 100)::integer ELSE 0 END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.score_full_submission(uuid, jsonb) TO authenticated;
