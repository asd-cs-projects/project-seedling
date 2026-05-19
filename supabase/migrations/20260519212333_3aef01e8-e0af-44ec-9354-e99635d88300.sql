-- Normalize profile classes to a single uppercase letter (A-Z)
UPDATE public.profiles
SET class = UPPER(SUBSTRING(regexp_replace(class, '[^A-Za-z]', '', 'g') FROM 1 FOR 1))
WHERE class IS NOT NULL AND class <> '';

-- Normalize tests.target_section from "Section X" / mixed case to single uppercase letter
UPDATE public.tests
SET target_section = UPPER(SUBSTRING(regexp_replace(target_section, '[^A-Za-z]', '', 'g') FROM 1 FOR 1))
WHERE target_section IS NOT NULL AND target_section <> ''
  AND regexp_replace(target_section, '[^A-Za-z]', '', 'g') <> '';

-- Normalize tests.target_grade from "Grade N" to just the number to match profiles.grade
UPDATE public.tests
SET target_grade = regexp_replace(target_grade, '[^0-9]', '', 'g')
WHERE target_grade IS NOT NULL AND target_grade <> ''
  AND regexp_replace(target_grade, '[^0-9]', '', 'g') <> '';