export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      posts: {
        Row: {
          id: string
          title: string
          content_type: 'text' | 'audio' | 'video' | 'photo' | 'file'
          content: string
          transcript: string | null
          content_types: string[]
          description: string | null
          has_description: boolean
          media_urls: Json
          allow_comments: boolean
          created_at: string
          updated_at: string
          author_id: string | null
        }
        Insert: {
          id?: string
          title: string
          content_type?: 'text' | 'audio' | 'video' | 'photo' | 'file'
          content?: string
          transcript?: string | null
          content_types?: string[]
          description?: string | null
          has_description?: boolean
          media_urls?: Json
          allow_comments?: boolean
          created_at?: string
          updated_at?: string
          author_id?: string | null
        }
        Update: {
          id?: string
          title?: string
          content_type?: 'text' | 'audio' | 'video' | 'photo' | 'file'
          content?: string
          transcript?: string | null
          content_types?: string[]
          description?: string | null
          has_description?: boolean
          media_urls?: Json
          allow_comments?: boolean
          created_at?: string
          updated_at?: string
          author_id?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          id: string
          username: string
          email: string | null
          is_admin: boolean
          approval_status: 'pending' | 'approved' | 'rejected'
          approved_by: string | null
          approval_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          email?: string | null
          is_admin?: boolean
          approval_status?: 'pending' | 'approved' | 'rejected'
          approved_by?: string | null
          approval_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          email?: string | null
          is_admin?: boolean
          approval_status?: 'pending' | 'approved' | 'rejected'
          approved_by?: string | null
          approval_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      rejected_registrations: {
        Row: {
          id: string
          username: string
          email: string
          rejected_at: string
          rejected_by: string | null
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          username: string
          email: string
          rejected_at?: string
          rejected_by?: string | null
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          username?: string
          email?: string
          rejected_at?: string
          rejected_by?: string | null
          expires_at?: string
          created_at?: string
        }
        Relationships: []
      }
      annotations: {
        Row: {
          id: string
          term: string
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          term: string
          content?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          term?: string
          content?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      post_annotations: {
        Row: {
          id: string
          post_id: string
          annotation_id: string
          position_start: number | null
          position_end: number | null
          created_at: string
        }
        Insert: {
          id?: string
          post_id: string
          annotation_id: string
          position_start?: number | null
          position_end?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          annotation_id?: string
          position_start?: number | null
          position_end?: number | null
          created_at?: string
        }
        Relationships: []
      }
      hashtags: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
        }
        Relationships: []
      }
      post_hashtags: {
        Row: {
          post_id: string
          hashtag_id: string
        }
        Insert: {
          post_id: string
          hashtag_id: string
        }
        Update: {
          post_id?: string
          hashtag_id?: string
        }
        Relationships: []
      }
      persons: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
        }
        Relationships: []
      }
      post_persons: {
        Row: {
          post_id: string
          person_id: string
        }
        Insert: {
          post_id: string
          person_id: string
        }
        Update: {
          post_id?: string
          person_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          id: string
          post_id: string
          user_id: string
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          post_id: string
          user_id: string
          content: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          user_id?: string
          content?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_moderation: {
        Row: {
          id: string
          user_id: string
          moderated_by: string | null
          moderation_type: 'mute_1h' | 'mute_6h' | 'mute_24h' | 'ban'
          reason: string | null
          expires_at: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          moderated_by?: string | null
          moderation_type: 'mute_1h' | 'mute_6h' | 'mute_24h' | 'ban'
          reason?: string | null
          expires_at?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          moderated_by?: string | null
          moderation_type?: 'mute_1h' | 'mute_6h' | 'mute_24h' | 'ban'
          reason?: string | null
          expires_at?: string | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_registration_blocked: {
        Args: {
          check_username: string
          check_email: string
        }
        Returns: boolean
      }
      is_banned: {
        Args: {
          check_username: string | null
          check_email: string | null
        }
        Returns: boolean
      }
      approve_user: {
        Args: {
          user_id: string
        }
        Returns: void
      }
      reject_user: {
        Args: {
          user_id: string
          block_username: string
          block_email: string
        }
        Returns: void
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
