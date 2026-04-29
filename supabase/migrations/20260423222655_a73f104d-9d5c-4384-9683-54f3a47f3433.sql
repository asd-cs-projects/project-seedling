-- ============================================================
-- 1) QUESTIONS — restrict student SELECT, add SECURITY DEFINER RPCs
-- ============================================================

-- Drop the existing student-facing policy on questions. Teachers keep
-- their existing "Teachers can manage questions for their tests" policy.
DROP POLICY IF EXISTS "Students can view questions for active tests" ON public.questions;

-- RPC: get questions for an active test WITHOUT correct_answer or explanations.
-- Used by AssessmentInterface during a test in progress.
CREATE OR REPLACE FUNCTION public.get_assessment_questions(_test_id uuid)
RETURNS TABLE (
  id uuid,
  test_id uuid,
  passage_id uuid,
  question_type text,
  difficulty text,
  question_text text,
  options jsonb,
  marks integer,
  order_index integer,
  media_url text,
  media_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.test_id, q.passage_id, q.question_type, q.difficulty,
         q.question_text, q.options, q.marks, q.order_index,
         q.media_url, q.media_type
  FROM public.questions q
  JOIN public.tests t ON t.id = q.test_id
  WHERE q.test_id = _test_id
    AND t.is_active = true
    AND auth.uid() IS NOT NULL
  ORDER BY q.order_index;
$$;

GRANT EXECUTE ON FUNCTION public.get_assessment_questions(uuid) TO authenticated;

-- RPC: get questions WITH correct_answer + explanations, but only for a
-- test the caller has already completed (i.e. has a row in test_results),
-- or is the teacher who owns the test. Used on the post-submission review
-- screen.
CREATE OR REPLACE FUNCTION public.get_review_questions(_test_id uuid)
RETURNS TABLE (
  id uuid,
  test_id uuid,
  passage_id uuid,
  question_type text,
  difficulty text,
  question_text text,
  options jsonb,
  correct_answer text,
  explanation text,
  option_explanations jsonb,
  marks integer,
  order_index integer,
  media_url text,
  media_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.test_id, q.passage_id, q.question_type, q.difficulty,
         q.question_text, q.options, q.correct_answer, q.explanation,
         q.option_explanations, q.marks, q.order_index, q.media_url, q.media_type
  FROM public.questions q
  WHERE q.test_id = _test_id
    AND auth.uid() IS NOT NULL
    AND (
      -- Teacher owns the test
      EXISTS (SELECT 1 FROM public.tests t WHERE t.id = q.test_id AND t.teacher_id = auth.uid())
      OR
      -- Student has at least one completed result for this test
      EXISTS (SELECT 1 FROM public.test_results r WHERE r.test_id = q.test_id AND r.student_id = auth.uid())
    )
  ORDER BY q.order_index;
$$;

GRANT EXECUTE ON FUNCTION public.get_review_questions(uuid) TO authenticated;

-- RPC: server-side scoring. Accepts the student's answers map keyed by
-- question id (or order_index) and returns score breakdown computed
-- against correct_answer in the database. Caller cannot read correct_answer
-- directly. Returns counts only.
CREATE OR REPLACE FUNCTION public.score_submission(
  _test_id uuid,
  _difficulty text,
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
                 upper(trim(coalesce(
                   _answers ->> q.id::text,
                   _answers ->> q.order_index::text,
                   ''
                 )))
             AND coalesce(q.correct_answer, '') <> ''
         )
  INTO v_total, v_correct
  FROM public.questions q
  WHERE q.test_id = _test_id
    AND (_difficulty IS NULL OR q.difficulty = _difficulty);

  RETURN QUERY SELECT
    v_total,
    v_correct,
    GREATEST(v_total - v_correct, 0),
    CASE WHEN v_total > 0 THEN ROUND((v_correct::numeric / v_total) * 100)::integer ELSE 0 END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.score_submission(uuid, text, jsonb) TO authenticated;

-- ============================================================
-- 2) REALTIME AUTHORIZATION on test_sessions channels
-- Topics convention: "test_sessions:<student_id>" (per-student) used by
-- both the student's own subscription and the teacher's monitor.
-- The teacher monitor subscribes to multiple per-student topics for sessions
-- of tests they own.
-- ============================================================

-- Enable RLS on realtime.messages if not already
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to subscribe to a test_sessions topic only if:
--   * the topic's student_id matches their own user id, OR
--   * they are a teacher of any test that has a session for that student.
DROP POLICY IF EXISTS "Authenticated can read scoped test_session realtime" ON realtime.messages;
CREATE POLICY "Authenticated can read scoped test_session realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Only restrict our scoped topics; leave other topics to default deny
  CASE
    WHEN realtime.topic() LIKE 'test_sessions:%' THEN
      (split_part(realtime.topic(), ':', 2)::uuid = auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.test_sessions s
        JOIN public.tests t ON t.id = s.test_id
        WHERE s.student_id::text = split_part(realtime.topic(), ':', 2)
          AND t.teacher_id = auth.uid()
      )
    ELSE false
  END
);

-- Same logic for sending broadcasts/presence on these topics
DROP POLICY IF EXISTS "Authenticated can write scoped test_session realtime" ON realtime.messages;
CREATE POLICY "Authenticated can write scoped test_session realtime"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  CASE
    WHEN realtime.topic() LIKE 'test_sessions:%' THEN
      (split_part(realtime.topic(), ':', 2)::uuid = auth.uid())
    ELSE false
  END
);

-- ============================================================
-- 3) STORAGE — make test-files bucket private
-- (Reads now require an authenticated user; uploads/updates/deletes already
-- restricted to teachers in a previous migration. Direct public URLs no
-- longer work; the app must use createSignedUrl().)
-- ============================================================
UPDATE storage.buckets SET public = false WHERE id = 'test-files';
