export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      passages: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          media_url: string | null
          module_name: string | null
          passage_code: string
          passage_type: string | null
          test_id: string
          title: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          media_url?: string | null
          module_name?: string | null
          passage_code: string
          passage_type?: string | null
          test_id: string
          title?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          media_url?: string | null
          module_name?: string | null
          passage_code?: string
          passage_type?: string | null
          test_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "passages_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age: number | null
          class: string | null
          created_at: string | null
          full_name: string
          gender: string | null
          grade: string | null
          id: string
          student_id: string | null
          subject: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          age?: number | null
          class?: string | null
          created_at?: string | null
          full_name: string
          gender?: string | null
          grade?: string | null
          id?: string
          student_id?: string | null
          subject?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          age?: number | null
          class?: string | null
          created_at?: string | null
          full_name?: string
          gender?: string | null
          grade?: string | null
          id?: string
          student_id?: string | null
          subject?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          correct_answer: string | null
          created_at: string | null
          difficulty: string | null
          explanation: string | null
          id: string
          marks: number | null
          media_type: string | null
          media_url: string | null
          option_explanations: Json | null
          options: Json | null
          order_index: number | null
          passage_id: string | null
          question_text: string
          question_type: string | null
          test_id: string
        }
        Insert: {
          correct_answer?: string | null
          created_at?: string | null
          difficulty?: string | null
          explanation?: string | null
          id?: string
          marks?: number | null
          media_type?: string | null
          media_url?: string | null
          option_explanations?: Json | null
          options?: Json | null
          order_index?: number | null
          passage_id?: string | null
          question_text: string
          question_type?: string | null
          test_id: string
        }
        Update: {
          correct_answer?: string | null
          created_at?: string | null
          difficulty?: string | null
          explanation?: string | null
          id?: string
          marks?: number | null
          media_type?: string | null
          media_url?: string | null
          option_explanations?: Json | null
          options?: Json | null
          order_index?: number | null
          passage_id?: string | null
          question_text?: string
          question_type?: string | null
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_passage_id_fkey"
            columns: ["passage_id"]
            isOneToOne: false
            referencedRelation: "passages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      student_summaries: {
        Row: {
          created_at: string
          generated_at: string
          id: string
          improvements: Json | null
          strengths: Json | null
          student_id: string
          subject: string
          summary: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          generated_at?: string
          id?: string
          improvements?: Json | null
          strengths?: Json | null
          student_id: string
          subject?: string
          summary?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          generated_at?: string
          id?: string
          improvements?: Json | null
          strengths?: Json | null
          student_id?: string
          subject?: string
          summary?: string
          updated_at?: string
        }
        Relationships: []
      }
      test_class_summaries: {
        Row: {
          generated_at: string
          id: string
          summary: string
          test_id: string
          topic_heatmap: Json | null
          updated_at: string
        }
        Insert: {
          generated_at?: string
          id?: string
          summary: string
          test_id: string
          topic_heatmap?: Json | null
          updated_at?: string
        }
        Update: {
          generated_at?: string
          id?: string
          summary?: string
          test_id?: string
          topic_heatmap?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_class_summaries_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: true
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      test_results: {
        Row: {
          ai_generated_at: string | null
          ai_improvements: string[] | null
          ai_strengths: string[] | null
          ai_topic_tags: string[] | null
          answers: Json | null
          completed_at: string | null
          correct_answers: number | null
          difficulty_level: string | null
          id: string
          is_retake: boolean
          practice_score: number | null
          score: number | null
          status: string
          student_id: string
          test_id: string
          time_spent: number | null
          total_questions: number | null
          wrong_answers: number | null
        }
        Insert: {
          ai_generated_at?: string | null
          ai_improvements?: string[] | null
          ai_strengths?: string[] | null
          ai_topic_tags?: string[] | null
          answers?: Json | null
          completed_at?: string | null
          correct_answers?: number | null
          difficulty_level?: string | null
          id?: string
          is_retake?: boolean
          practice_score?: number | null
          score?: number | null
          status?: string
          student_id: string
          test_id: string
          time_spent?: number | null
          total_questions?: number | null
          wrong_answers?: number | null
        }
        Update: {
          ai_generated_at?: string | null
          ai_improvements?: string[] | null
          ai_strengths?: string[] | null
          ai_topic_tags?: string[] | null
          answers?: Json | null
          completed_at?: string | null
          correct_answers?: number | null
          difficulty_level?: string | null
          id?: string
          is_retake?: boolean
          practice_score?: number | null
          score?: number | null
          status?: string
          student_id?: string
          test_id?: string
          time_spent?: number | null
          total_questions?: number | null
          wrong_answers?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "test_results_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      test_sessions: {
        Row: {
          answers: Json | null
          current_question: number | null
          difficulty_level: string | null
          id: string
          last_saved_at: string | null
          marked_for_review: Json | null
          practice_complete: boolean | null
          started_at: string | null
          student_id: string
          test_id: string
          time_remaining: number | null
        }
        Insert: {
          answers?: Json | null
          current_question?: number | null
          difficulty_level?: string | null
          id?: string
          last_saved_at?: string | null
          marked_for_review?: Json | null
          practice_complete?: boolean | null
          started_at?: string | null
          student_id: string
          test_id: string
          time_remaining?: number | null
        }
        Update: {
          answers?: Json | null
          current_question?: number | null
          difficulty_level?: string | null
          id?: string
          last_saved_at?: string | null
          marked_for_review?: Json | null
          practice_complete?: boolean | null
          started_at?: string | null
          student_id?: string
          test_id?: string
          time_remaining?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "test_sessions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      tests: {
        Row: {
          adaptive_mode: boolean
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          groups_per_student: number | null
          id: string
          is_active: boolean | null
          subject: string
          target_grade: string | null
          target_section: string | null
          teacher_id: string
          test_code: string
          title: string
          updated_at: string | null
        }
        Insert: {
          adaptive_mode?: boolean
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          groups_per_student?: number | null
          id?: string
          is_active?: boolean | null
          subject: string
          target_grade?: string | null
          target_section?: string | null
          teacher_id: string
          test_code: string
          title: string
          updated_at?: string | null
        }
        Update: {
          adaptive_mode?: boolean
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          groups_per_student?: number | null
          id?: string
          is_active?: boolean | null
          subject?: string
          target_grade?: string | null
          target_section?: string | null
          teacher_id?: string
          test_code?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_assessment_questions: {
        Args: { _test_id: string }
        Returns: {
          difficulty: string
          id: string
          marks: number
          media_type: string
          media_url: string
          options: Json
          order_index: number
          passage_id: string
          question_text: string
          question_type: string
          test_id: string
        }[]
      }
      get_review_questions: {
        Args: { _test_id: string }
        Returns: {
          correct_answer: string
          difficulty: string
          explanation: string
          id: string
          marks: number
          media_type: string
          media_url: string
          option_explanations: Json
          options: Json
          order_index: number
          passage_id: string
          question_text: string
          question_type: string
          test_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      score_submission: {
        Args: { _answers: Json; _difficulty: string; _test_id: string }
        Returns: {
          correct_answers: number
          score: number
          total_questions: number
          wrong_answers: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "teacher" | "student"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "teacher", "student"],
    },
  },
} as const
