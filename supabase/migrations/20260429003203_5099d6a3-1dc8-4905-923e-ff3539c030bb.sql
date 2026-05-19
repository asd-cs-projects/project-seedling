CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'student');

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Tables first
CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text NOT NULL,
    student_id text, grade text, class text, gender text, age integer, subject text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role public.app_role NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE (user_id, role)
);

CREATE TABLE public.tests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    test_code text NOT NULL UNIQUE,
    title text NOT NULL,
    subject text NOT NULL,
    description text,
    duration_minutes integer DEFAULT 60,
    teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_grade text, target_section text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.passages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
    passage_code text NOT NULL,
    title text, content text NOT NULL,
    passage_type text DEFAULT 'text',
    media_url text,
    created_at timestamptz DEFAULT now(),
    UNIQUE (test_id, passage_code)
);

CREATE TABLE public.questions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
    passage_id uuid REFERENCES public.passages(id) ON DELETE SET NULL,
    question_type text DEFAULT 'mcq',
    difficulty text DEFAULT 'easy',
    question_text text NOT NULL,
    options jsonb,
    correct_answer text,
    marks integer DEFAULT 1,
    order_index integer DEFAULT 0,
    media_url text, media_type text,
    explanation text,
    option_explanations jsonb,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.test_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    answers jsonb DEFAULT '{}'::jsonb,
    current_question integer DEFAULT 0,
    time_remaining integer,
    marked_for_review jsonb DEFAULT '[]'::jsonb,
    difficulty_level text,
    practice_complete boolean DEFAULT false,
    started_at timestamptz DEFAULT now(),
    last_saved_at timestamptz DEFAULT now(),
    UNIQUE (test_id, student_id)
);

CREATE TABLE public.test_results (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    score integer, correct_answers integer, wrong_answers integer, total_questions integer,
    difficulty_level text, practice_score integer, time_spent integer,
    answers jsonb,
    is_retake boolean NOT NULL DEFAULT false,
    ai_strengths text[] DEFAULT '{}',
    ai_improvements text[] DEFAULT '{}',
    ai_topic_tags text[] DEFAULT '{}',
    ai_generated_at timestamptz,
    completed_at timestamptz DEFAULT now()
);

CREATE INDEX idx_test_results_test_id_is_retake ON public.test_results (test_id, is_retake);
CREATE INDEX idx_test_results_student_id_is_retake ON public.test_results (student_id, is_retake);
CREATE UNIQUE INDEX idx_test_results_unique_first_attempt ON public.test_results (test_id, student_id) WHERE is_retake = false;

CREATE TABLE public.test_class_summaries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id uuid NOT NULL UNIQUE REFERENCES public.tests(id) ON DELETE CASCADE,
  summary text NOT NULL,
  topic_heatmap jsonb DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.student_summaries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL,
  subject text NOT NULL DEFAULT 'All Subjects',
  summary text NOT NULL DEFAULT '',
  strengths jsonb,
  improvements jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject)
);

-- Functions referencing tables
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tests_updated_at BEFORE UPDATE ON public.tests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_test_class_summaries_updated_at BEFORE UPDATE ON public.test_class_summaries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_student_summaries_updated_at BEFORE UPDATE ON public.student_summaries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_class_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Teachers can view student profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'teacher'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can self-assign student role only" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND role = 'student'::public.app_role);
CREATE POLICY "Admins can manage all roles" ON public.user_roles USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated users can view active tests" ON public.tests FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Teachers can manage their own tests" ON public.tests USING (auth.uid() = teacher_id);

CREATE POLICY "Authenticated users can view passages for active tests" ON public.passages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.tests WHERE tests.id = passages.test_id AND tests.is_active = true));
CREATE POLICY "Teachers can manage passages for their tests" ON public.passages USING (EXISTS (SELECT 1 FROM public.tests WHERE tests.id = passages.test_id AND tests.teacher_id = auth.uid()));

CREATE POLICY "Teachers can manage questions for their tests" ON public.questions USING (EXISTS (SELECT 1 FROM public.tests WHERE tests.id = questions.test_id AND tests.teacher_id = auth.uid()));

CREATE POLICY "Students can manage their own sessions" ON public.test_sessions USING (auth.uid() = student_id);
CREATE POLICY "Teachers can view sessions for their tests" ON public.test_sessions FOR SELECT USING (EXISTS (SELECT 1 FROM public.tests WHERE tests.id = test_sessions.test_id AND tests.teacher_id = auth.uid()));
CREATE POLICY "Teachers can delete sessions for their tests" ON public.test_sessions FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.tests WHERE tests.id = test_sessions.test_id AND tests.teacher_id = auth.uid()));

CREATE POLICY "Students can view their own results" ON public.test_results FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Students can insert their own results" ON public.test_results FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Teachers can view results for their tests" ON public.test_results FOR SELECT USING (EXISTS (SELECT 1 FROM public.tests WHERE tests.id = test_results.test_id AND tests.teacher_id = auth.uid()));

CREATE POLICY "Teachers can manage class summaries" ON public.test_class_summaries FOR ALL USING (EXISTS (SELECT 1 FROM public.tests WHERE tests.id = test_class_summaries.test_id AND tests.teacher_id = auth.uid()));
CREATE POLICY "Students can view class summaries" ON public.test_class_summaries FOR SELECT USING (EXISTS (SELECT 1 FROM public.test_results WHERE test_results.test_id = test_class_summaries.test_id AND test_results.student_id = auth.uid()));

CREATE POLICY "Students can view own summary" ON public.student_summaries FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "Teachers can view student summaries" ON public.student_summaries FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Students can insert own summary" ON public.student_summaries FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY "Students can update own summary" ON public.student_summaries FOR UPDATE TO authenticated USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_assessment_questions(_test_id uuid)
RETURNS TABLE (id uuid, test_id uuid, passage_id uuid, question_type text, difficulty text, question_text text, options jsonb, marks integer, order_index integer, media_url text, media_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.id, q.test_id, q.passage_id, q.question_type, q.difficulty, q.question_text, q.options, q.marks, q.order_index, q.media_url, q.media_type
  FROM public.questions q JOIN public.tests t ON t.id = q.test_id
  WHERE q.test_id = _test_id AND t.is_active = true AND auth.uid() IS NOT NULL
  ORDER BY q.order_index;
$$;
GRANT EXECUTE ON FUNCTION public.get_assessment_questions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_review_questions(_test_id uuid)
RETURNS TABLE (id uuid, test_id uuid, passage_id uuid, question_type text, difficulty text, question_text text, options jsonb, correct_answer text, explanation text, option_explanations jsonb, marks integer, order_index integer, media_url text, media_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.id, q.test_id, q.passage_id, q.question_type, q.difficulty, q.question_text, q.options, q.correct_answer, q.explanation, q.option_explanations, q.marks, q.order_index, q.media_url, q.media_type
  FROM public.questions q
  WHERE q.test_id = _test_id AND auth.uid() IS NOT NULL
    AND (EXISTS (SELECT 1 FROM public.tests t WHERE t.id = q.test_id AND t.teacher_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.test_results r WHERE r.test_id = q.test_id AND r.student_id = auth.uid()))
  ORDER BY q.order_index;
$$;
GRANT EXECUTE ON FUNCTION public.get_review_questions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.score_submission(_test_id uuid, _difficulty text, _answers jsonb)
RETURNS TABLE (total_questions integer, correct_answers integer, wrong_answers integer, score integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total integer := 0; v_correct integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE upper(trim(coalesce(q.correct_answer, ''))) = upper(trim(coalesce(_answers ->> q.id::text, _answers ->> q.order_index::text, ''))) AND coalesce(q.correct_answer, '') <> '')
  INTO v_total, v_correct
  FROM public.questions q
  WHERE q.test_id = _test_id AND (_difficulty IS NULL OR q.difficulty = _difficulty);
  RETURN QUERY SELECT v_total, v_correct, GREATEST(v_total - v_correct, 0),
    CASE WHEN v_total > 0 THEN ROUND((v_correct::numeric / v_total) * 100)::integer ELSE 0 END;
END;
$$;
GRANT EXECUTE ON FUNCTION public.score_submission(uuid, text, jsonb) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.test_sessions;

INSERT INTO storage.buckets (id, name, public) VALUES ('test-files', 'test-files', false) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Teachers can upload to test-files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'test-files' AND public.has_role(auth.uid(), 'teacher'::public.app_role));
CREATE POLICY "Teachers can update their own test-files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'test-files' AND owner = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role));
CREATE POLICY "Teachers can delete their own test-files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'test-files' AND owner = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role));
CREATE POLICY "Teachers can read their own test files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'test-files' AND EXISTS (SELECT 1 FROM public.tests t WHERE t.teacher_id = auth.uid() AND position(t.id::text in name) > 0));
CREATE POLICY "Students can read files for tests they have access to" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'test-files' AND (EXISTS (SELECT 1 FROM public.test_results r WHERE r.student_id = auth.uid() AND position(r.test_id::text in name) > 0) OR EXISTS (SELECT 1 FROM public.test_sessions s WHERE s.student_id = auth.uid() AND position(s.test_id::text in name) > 0)));