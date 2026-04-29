CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'teacher',
    'student'
);


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email));
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: passages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    passage_code text NOT NULL,
    title text,
    content text NOT NULL,
    passage_type text DEFAULT 'text'::text,
    media_url text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    full_name text NOT NULL,
    student_id text,
    grade text,
    class text,
    gender text,
    age integer,
    subject text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    passage_id uuid,
    question_type text DEFAULT 'mcq'::text,
    difficulty text DEFAULT 'easy'::text,
    question_text text NOT NULL,
    options jsonb,
    correct_answer text,
    marks integer DEFAULT 1,
    order_index integer DEFAULT 0,
    media_url text,
    media_type text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: test_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    student_id uuid NOT NULL,
    score integer,
    correct_answers integer,
    wrong_answers integer,
    total_questions integer,
    difficulty_level text,
    practice_score integer,
    time_spent integer,
    answers jsonb,
    completed_at timestamp with time zone DEFAULT now()
);


--
-- Name: test_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    student_id uuid NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb,
    current_question integer DEFAULT 0,
    time_remaining integer,
    marked_for_review jsonb DEFAULT '[]'::jsonb,
    difficulty_level text,
    practice_complete boolean DEFAULT false,
    started_at timestamp with time zone DEFAULT now(),
    last_saved_at timestamp with time zone DEFAULT now()
);


--
-- Name: tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_code text NOT NULL,
    title text NOT NULL,
    subject text NOT NULL,
    description text,
    duration_minutes integer DEFAULT 60,
    teacher_id uuid NOT NULL,
    target_grade text,
    target_section text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: passages passages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passages
    ADD CONSTRAINT passages_pkey PRIMARY KEY (id);


--
-- Name: passages passages_test_id_passage_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passages
    ADD CONSTRAINT passages_test_id_passage_code_key UNIQUE (test_id, passage_code);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);


--
-- Name: test_results test_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_results
    ADD CONSTRAINT test_results_pkey PRIMARY KEY (id);


--
-- Name: test_results test_results_test_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_results
    ADD CONSTRAINT test_results_test_id_student_id_key UNIQUE (test_id, student_id);


--
-- Name: test_sessions test_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_sessions
    ADD CONSTRAINT test_sessions_pkey PRIMARY KEY (id);


--
-- Name: test_sessions test_sessions_test_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_sessions
    ADD CONSTRAINT test_sessions_test_id_student_id_key UNIQUE (test_id, student_id);


--
-- Name: tests tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_pkey PRIMARY KEY (id);


--
-- Name: tests tests_test_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_test_code_key UNIQUE (test_code);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tests update_tests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tests_updated_at BEFORE UPDATE ON public.tests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: passages passages_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passages
    ADD CONSTRAINT passages_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: questions questions_passage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_passage_id_fkey FOREIGN KEY (passage_id) REFERENCES public.passages(id) ON DELETE SET NULL;


--
-- Name: questions questions_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;


--
-- Name: test_results test_results_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_results
    ADD CONSTRAINT test_results_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: test_results test_results_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_results
    ADD CONSTRAINT test_results_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;


--
-- Name: test_sessions test_sessions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_sessions
    ADD CONSTRAINT test_sessions_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: test_sessions test_sessions_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_sessions
    ADD CONSTRAINT test_sessions_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;


--
-- Name: tests tests_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles Admins can manage all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all roles" ON public.user_roles USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: test_results Students can insert their own results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can insert their own results" ON public.test_results FOR INSERT WITH CHECK ((auth.uid() = student_id));


--
-- Name: test_sessions Students can manage their own sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can manage their own sessions" ON public.test_sessions USING ((auth.uid() = student_id));


--
-- Name: tests Students can view active tests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view active tests" ON public.tests FOR SELECT USING ((is_active = true));


--
-- Name: passages Students can view passages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view passages" ON public.passages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tests
  WHERE ((tests.id = passages.test_id) AND (tests.is_active = true)))));


--
-- Name: questions Students can view questions for active tests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view questions for active tests" ON public.questions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tests
  WHERE ((tests.id = questions.test_id) AND (tests.is_active = true)))));


--
-- Name: test_results Students can view their own results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their own results" ON public.test_results FOR SELECT USING ((auth.uid() = student_id));


--
-- Name: passages Teachers can manage passages for their tests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can manage passages for their tests" ON public.passages USING ((EXISTS ( SELECT 1
   FROM public.tests
  WHERE ((tests.id = passages.test_id) AND (tests.teacher_id = auth.uid())))));


--
-- Name: questions Teachers can manage questions for their tests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can manage questions for their tests" ON public.questions USING ((EXISTS ( SELECT 1
   FROM public.tests
  WHERE ((tests.id = questions.test_id) AND (tests.teacher_id = auth.uid())))));


--
-- Name: tests Teachers can manage their own tests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can manage their own tests" ON public.tests USING ((auth.uid() = teacher_id));


--
-- Name: test_results Teachers can view results for their tests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view results for their tests" ON public.test_results FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tests
  WHERE ((tests.id = test_results.test_id) AND (tests.teacher_id = auth.uid())))));


--
-- Name: test_sessions Teachers can view sessions for their tests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view sessions for their tests" ON public.test_sessions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tests
  WHERE ((tests.id = test_sessions.test_id) AND (tests.teacher_id = auth.uid())))));


--
-- Name: profiles Teachers can view student profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view student profiles" ON public.profiles FOR SELECT USING ((public.has_role(auth.uid(), 'teacher'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_roles Users can insert their own role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own role" ON public.user_roles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: passages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.passages ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

--
-- Name: test_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;

--
-- Name: test_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: tests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


