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
      app_config: {
        Row: {
          created_at: string
          key: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          value?: string
        }
        Relationships: []
      }
      book_dossiers: {
        Row: {
          author: string
          book_id: string
          created_at: string
          dossier: Json
          extended_at: string | null
          extension_count: number
          generated_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          author: string
          book_id: string
          created_at?: string
          dossier: Json
          extended_at?: string | null
          extension_count?: number
          generated_at?: string
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          author?: string
          book_id?: string
          created_at?: string
          dossier?: Json
          extended_at?: string | null
          extension_count?: number
          generated_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      books: {
        Row: {
          added_at: string
          ai_tags: string[]
          author: string
          changed_how_i_think: boolean | null
          connections: Json
          cover_source: string | null
          cover_url: string | null
          created_at: string
          foil_style: string | null
          format: string
          goodreads_id: string | null
          how_i_found: string | null
          id: string
          instances: Json
          is_fiction: boolean | null
          isbn: string | null
          language: string | null
          last_opened_at: string | null
          original_language: string | null
          pages: number | null
          spine_color: string | null
          spine_generated_at: string | null
          spine_height: number | null
          spine_texture: string | null
          spine_url: string | null
          spine_width: number | null
          status: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
          year: number | null
        }
        Insert: {
          added_at?: string
          ai_tags?: string[]
          author: string
          changed_how_i_think?: boolean | null
          connections?: Json
          cover_source?: string | null
          cover_url?: string | null
          created_at?: string
          foil_style?: string | null
          format?: string
          goodreads_id?: string | null
          how_i_found?: string | null
          id?: string
          instances?: Json
          is_fiction?: boolean | null
          isbn?: string | null
          language?: string | null
          last_opened_at?: string | null
          original_language?: string | null
          pages?: number | null
          spine_color?: string | null
          spine_generated_at?: string | null
          spine_height?: number | null
          spine_texture?: string | null
          spine_url?: string | null
          spine_width?: number | null
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
          year?: number | null
        }
        Update: {
          added_at?: string
          ai_tags?: string[]
          author?: string
          changed_how_i_think?: boolean | null
          connections?: Json
          cover_source?: string | null
          cover_url?: string | null
          created_at?: string
          foil_style?: string | null
          format?: string
          goodreads_id?: string | null
          how_i_found?: string | null
          id?: string
          instances?: Json
          is_fiction?: boolean | null
          isbn?: string | null
          language?: string | null
          last_opened_at?: string | null
          original_language?: string | null
          pages?: number | null
          spine_color?: string | null
          spine_generated_at?: string | null
          spine_height?: number | null
          spine_texture?: string | null
          spine_url?: string | null
          spine_width?: number | null
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          year?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          goodreads_last_synced_at: string | null
          goodreads_sync_enabled: boolean
          goodreads_url: string | null
          goodreads_user_id: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          goodreads_last_synced_at?: string | null
          goodreads_sync_enabled?: boolean
          goodreads_url?: string | null
          goodreads_user_id?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          goodreads_last_synced_at?: string | null
          goodreads_sync_enabled?: boolean
          goodreads_url?: string | null
          goodreads_user_id?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
