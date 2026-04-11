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
          avatar_url: string | null
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
          avatar_url?: string | null
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
          avatar_url?: string | null
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
      posts_views: {
        Row: {
          id: string
          post_id: string
          user_id: string | null
          viewed_at: string
        }
        Insert: {
          id?: string
          post_id: string
          user_id?: string | null
          viewed_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          user_id?: string | null
          viewed_at?: string
        }
        Relationships: []
      }
      post_likes: {
        Row: {
          id: string
          post_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          post_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      posts_stats: {
        Row: {
          post_id: string
          view_count: number
          like_count: number
          updated_at: string
        }
        Insert: {
          post_id: string
          view_count?: number
          like_count?: number
          updated_at?: string
        }
        Update: {
          post_id?: string
          view_count?: number
          like_count?: number
          updated_at?: string
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
      conversations: {
        Row: {
          id: string
          participant1_id: string
          participant2_id: string
          last_message_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          participant1_id: string
          participant2_id: string
          last_message_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          participant1_id?: string
          participant2_id?: string
          last_message_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          content: string | null
          media_urls: Json
          is_read: boolean
          like_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          content?: string | null
          media_urls?: Json
          is_read?: boolean
          like_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_id?: string
          content?: string | null
          media_urls?: Json
          is_read?: boolean
          like_count?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          id: string
          name: string
          invite_code: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          invite_code: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          invite_code?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          id: string
          group_id: string
          user_id: string
          is_admin: boolean
          is_moderator: boolean
          joined_at: string
        }
        Insert: {
          id?: string
          group_id: string
          user_id: string
          is_admin?: boolean
          is_moderator?: boolean
          joined_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          user_id?: string
          is_admin?: boolean
          is_moderator?: boolean
          joined_at?: string
        }
        Relationships: []
      }
      group_messages: {
        Row: {
          id: string
          group_id: string
          sender_id: string
          content: string | null
          media_urls: Json
          like_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          group_id: string
          sender_id: string
          content?: string | null
          media_urls?: Json
          like_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          sender_id?: string
          content?: string | null
          media_urls?: Json
          like_count?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      group_banned_users: {
        Row: {
          id: string
          group_id: string
          user_id: string
          banned_by: string
          reason: string | null
          banned_at: string
        }
        Insert: {
          id?: string
          group_id: string
          user_id: string
          banned_by: string
          reason?: string | null
          banned_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          user_id?: string
          banned_by?: string
          reason?: string | null
          banned_at?: string
        }
        Relationships: []
      }
      message_likes: {
        Row: {
          id: string
          message_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      group_message_likes: {
        Row: {
          id: string
          message_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          user_id?: string
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
      increment_post_views: {
        Args: {
          post_id_param: string
        }
        Returns: void
      }
      toggle_post_like: {
        Args: {
          post_id_param: string
          user_id_param: string
        }
        Returns: {
          liked: boolean
          like_count: number
        }
      }
      get_post_stats: {
        Args: {
          post_id_param: string
        }
        Returns: {
          view_count: number
          like_count: number
        }
      }
      get_or_create_conversation: {
        Args: {
          user1_id: string
          user2_id: string
        }
        Returns: string
      }
      mark_messages_as_read: {
        Args: {
          conv_id: string
          reader_id: string
        }
        Returns: void
      }
      search_users_by_username: {
        Args: {
          search_query: string
        }
        Returns: {
          id: string
          username: string
          is_admin: boolean
        }[]
      }
      join_group_by_code: {
        Args: {
          code: string
          joining_user_id: string
        }
        Returns: {
          success: boolean
          group_id?: string
          error?: string
        }
      }
      leave_group: {
        Args: {
          leaving_group_id: string
          leaving_user_id: string
        }
        Returns: {
          success: boolean
          error?: string
        }
      }
      generate_invite_code: {
        Args: Record<string, never>
        Returns: string
      }
      promote_to_moderator: {
        Args: {
          target_group_id: string
          target_user_id: string
        }
        Returns: {
          success: boolean
          error?: string
        }
      }
      demote_from_moderator: {
        Args: {
          target_group_id: string
          target_user_id: string
        }
        Returns: {
          success: boolean
          error?: string
        }
      }
      kick_user_from_group: {
        Args: {
          target_group_id: string
          target_user_id: string
          kicker_user_id: string
        }
        Returns: {
          success: boolean
          error?: string
        }
      }
      unban_user_from_group: {
        Args: {
          target_group_id: string
          target_user_id: string
        }
        Returns: {
          success: boolean
          error?: string
        }
      }
      delete_group_message: {
        Args: {
          message_id: string
          deleter_user_id: string
        }
        Returns: {
          success: boolean
          error?: string
        }
      }
      delete_private_message: {
        Args: {
          message_id: string
          deleter_user_id: string
        }
        Returns: {
          success: boolean
          error?: string
        }
      }
      toggle_message_like: {
        Args: {
          message_id_param: string
          user_id_param: string
        }
        Returns: {
          liked: boolean
          like_count: number
        }
      }
      toggle_group_message_like: {
        Args: {
          message_id_param: string
          user_id_param: string
        }
        Returns: {
          liked: boolean
          like_count: number
        }
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
