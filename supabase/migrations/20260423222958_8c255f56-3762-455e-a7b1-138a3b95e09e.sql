-- Replace the previous policies with patterns that match the actual
-- channel-name convention used in the client.

DROP POLICY IF EXISTS "Authenticated can read scoped test_session realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can write scoped test_session realtime" ON realtime.messages;

-- Topic shape: "test_session:<student_id>:<test_id>"
CREATE POLICY "Auth can read own/owned test_session topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'test_session:%'
  AND (
    -- Student is the topic's student
    split_part(realtime.topic(), ':', 2)::uuid = auth.uid()
    OR
    -- Or caller is the teacher of the test in the topic
    EXISTS (
      SELECT 1 FROM public.tests t
      WHERE t.id::text = split_part(realtime.topic(), ':', 3)
        AND t.teacher_id = auth.uid()
    )
  )
);

CREATE POLICY "Auth can write to own test_session topic"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE 'test_session:%'
  AND split_part(realtime.topic(), ':', 2)::uuid = auth.uid()
);
