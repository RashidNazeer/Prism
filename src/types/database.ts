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
      applications: {
        Row: {
          created_at: string
          id: string
          niche: string
          niche_other: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["application_status"]
          tiktok_handle: string
          updated_at: string
          user_id: string
          video_links: string
          worked_with_wurx: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          niche: string
          niche_other?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          tiktok_handle: string
          updated_at?: string
          user_id: string
          video_links: string
          worked_with_wurx: boolean
        }
        Update: {
          created_at?: string
          id?: string
          niche?: string
          niche_other?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          tiktok_handle?: string
          updated_at?: string
          user_id?: string
          video_links?: string
          worked_with_wurx?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "creator_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "creator_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          created_at: string
          detail: Json
          id: number
          subject_id: string | null
          subject_type: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          detail?: Json
          id?: never
          subject_id?: string | null
          subject_type: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          detail?: Json
          id?: never
          subject_id?: string | null
          subject_type?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "creator_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "creator_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_commercials: {
        Row: {
          brand_id: string
          budget_allocated: number | null
          budget_used: number
          budget_used_percent: number | null
          client_name: string | null
          created_at: string
          currency: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          budget_allocated?: number | null
          budget_used?: number
          budget_used_percent?: number | null
          client_name?: string | null
          created_at?: string
          currency?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          budget_allocated?: number | null
          budget_used?: number
          budget_used_percent?: number | null
          client_name?: string | null
          created_at?: string
          currency?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_commercials_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_products: {
        Row: {
          badge_title: string | null
          brand_id: string
          commission_rate: number | null
          created_at: string
          created_by: string | null
          currency: string
          external_product_id: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price: number | null
          updated_at: string
        }
        Insert: {
          badge_title?: string | null
          brand_id: string
          commission_rate?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          external_product_id: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price?: number | null
          updated_at?: string
        }
        Update: {
          badge_title?: string | null
          brand_id?: string
          commission_rate?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          external_product_id?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "creator_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          slug: string
          store_id: string
          tagline: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          slug: string
          store_id: string
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          store_id?: string
          tagline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "creator_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brands_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_submissions: {
        Row: {
          ad_authorized: boolean
          ad_code: string
          application_id: string
          brand_id: string
          created_at: string
          creator_handle: string | null
          creator_id: string
          creator_name: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          embed_id: string | null
          id: string
          offer_id: string
          status: Database["public"]["Enums"]["content_status"]
          thumbnail_url: string | null
          updated_at: string
          video_author: string | null
          video_title: string | null
          video_url: string
        }
        Insert: {
          ad_authorized?: boolean
          ad_code: string
          application_id: string
          brand_id: string
          created_at?: string
          creator_handle?: string | null
          creator_id: string
          creator_name?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          embed_id?: string | null
          id?: string
          offer_id: string
          status?: Database["public"]["Enums"]["content_status"]
          thumbnail_url?: string | null
          updated_at?: string
          video_author?: string | null
          video_title?: string | null
          video_url: string
        }
        Update: {
          ad_authorized?: boolean
          ad_code?: string
          application_id?: string
          brand_id?: string
          created_at?: string
          creator_handle?: string | null
          creator_id?: string
          creator_name?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          embed_id?: string | null
          id?: string
          offer_id?: string
          status?: Database["public"]["Enums"]["content_status"]
          thumbnail_url?: string | null
          updated_at?: string
          video_author?: string | null
          video_title?: string | null
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_submissions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_progress"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "content_submissions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "offer_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_submissions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_submissions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_submissions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_submissions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "creator_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_submissions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_submissions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_applications: {
        Row: {
          brand_id: string
          committed_amount: number | null
          committed_video_count: number | null
          created_at: string
          creator_email: string | null
          creator_handle: string | null
          creator_id: string
          creator_name: string | null
          currency: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          note: string | null
          offer_id: string
          stage: Database["public"]["Enums"]["offer_stage"] | null
          stage_updated_at: string | null
          status: Database["public"]["Enums"]["offer_application_status"]
          updated_at: string
        }
        Insert: {
          brand_id: string
          committed_amount?: number | null
          committed_video_count?: number | null
          created_at?: string
          creator_email?: string | null
          creator_handle?: string | null
          creator_id: string
          creator_name?: string | null
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          note?: string | null
          offer_id: string
          stage?: Database["public"]["Enums"]["offer_stage"] | null
          stage_updated_at?: string | null
          status?: Database["public"]["Enums"]["offer_application_status"]
          updated_at?: string
        }
        Update: {
          brand_id?: string
          committed_amount?: number | null
          committed_video_count?: number | null
          created_at?: string
          creator_email?: string | null
          creator_handle?: string | null
          creator_id?: string
          creator_name?: string | null
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          note?: string | null
          offer_id?: string
          stage?: Database["public"]["Enums"]["offer_stage"] | null
          stage_updated_at?: string | null
          status?: Database["public"]["Enums"]["offer_application_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_applications_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_applications_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_applications_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_applications_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "creator_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_applications_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_applications_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_stage_events: {
        Row: {
          actor_id: string | null
          application_id: string
          created_at: string
          creator_id: string
          from_stage: Database["public"]["Enums"]["offer_stage"] | null
          id: number
          note: string | null
          to_stage: Database["public"]["Enums"]["offer_stage"]
        }
        Insert: {
          actor_id?: string | null
          application_id: string
          created_at?: string
          creator_id: string
          from_stage?: Database["public"]["Enums"]["offer_stage"] | null
          id?: never
          note?: string | null
          to_stage: Database["public"]["Enums"]["offer_stage"]
        }
        Update: {
          actor_id?: string | null
          application_id?: string
          created_at?: string
          creator_id?: string
          from_stage?: Database["public"]["Enums"]["offer_stage"] | null
          id?: never
          note?: string | null
          to_stage?: Database["public"]["Enums"]["offer_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "offer_stage_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "creator_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_stage_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_stage_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_progress"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "offer_stage_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "offer_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_stage_events_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_stage_events_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          badge_title: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          needs_application: boolean
          reward_amount: number | null
          status: Database["public"]["Enums"]["offer_status"]
          title: string
          updated_at: string
          video_count: number | null
        }
        Insert: {
          badge_title?: string | null
          brand_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          needs_application?: boolean
          reward_amount?: number | null
          status?: Database["public"]["Enums"]["offer_status"]
          title: string
          updated_at?: string
          video_count?: number | null
        }
        Update: {
          badge_title?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          needs_application?: boolean
          reward_amount?: number | null
          status?: Database["public"]["Enums"]["offer_status"]
          title?: string
          updated_at?: string
          video_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "creator_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approval_celebrated_at: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          tier: Database["public"]["Enums"]["creator_tier"] | null
          updated_at: string
          welcomed_at: string | null
        }
        Insert: {
          approval_celebrated_at?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          tier?: Database["public"]["Enums"]["creator_tier"] | null
          updated_at?: string
          welcomed_at?: string | null
        }
        Update: {
          approval_celebrated_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          tier?: Database["public"]["Enums"]["creator_tier"] | null
          updated_at?: string
          welcomed_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      brand_content_totals: {
        Row: {
          brand_id: string | null
          creators: number | null
          jobs: number | null
          last_posted_at: string | null
          status: Database["public"]["Enums"]["content_status"] | null
          videos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_submissions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_creator_roster: {
        Row: {
          brand_id: string | null
          committed: number | null
          committed_currency: string | null
          creator_email: string | null
          creator_handle: string | null
          creator_id: string | null
          creator_name: string | null
          currency_count: number | null
          due: number | null
          first_asked_at: string | null
          jobs: number | null
          jobs_approved: number | null
          jobs_due: number | null
          jobs_paid: number | null
          jobs_pending: number | null
          jobs_rejected: number | null
          jobs_working: number | null
          last_decided_at: string | null
          last_moved_at: string | null
          last_posted_at: string | null
          paid: number | null
          videos_approved: number | null
          videos_needs_another_take: number | null
          videos_posted: number | null
          videos_promised: number | null
          videos_waiting: number | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_applications_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_applications_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_applications_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_stage_totals: {
        Row: {
          brand_id: string | null
          committed: number | null
          currency: string | null
          jobs: number | null
          stage: Database["public"]["Enums"]["offer_stage"] | null
          videos_promised: number | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_applications_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_directory: {
        Row: {
          application_id: string | null
          application_status:
            | Database["public"]["Enums"]["application_status"]
            | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string | null
          is_active: boolean | null
          niche: string | null
          reviewed_at: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          tier: Database["public"]["Enums"]["creator_tier"] | null
          tiktok_handle: string | null
        }
        Relationships: []
      }
      job_progress: {
        Row: {
          application_id: string | null
          approved: number | null
          brand_id: string | null
          creator_id: string | null
          needs_another_take: number | null
          offer_id: string | null
          posted: number | null
          required: number | null
          waiting: number | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_applications_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_applications_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_applications_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_applications_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_for_offer: {
        Args: { p_actor_id: string; p_note?: string; p_offer_id: string }
        Returns: Json
      }
      assert_active_creator: {
        Args: { p_actor_id: string }
        Returns: {
          approval_celebrated_at: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          tier: Database["public"]["Enums"]["creator_tier"] | null
          updated_at: string
          welcomed_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_active_staff: {
        Args: { p_actor_id: string }
        Returns: {
          approval_celebrated_at: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          tier: Database["public"]["Enums"]["creator_tier"] | null
          updated_at: string
          welcomed_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      delete_content: {
        Args: { p_actor_id: string; p_content_id: string }
        Returns: Json
      }
      delete_offer: {
        Args: { p_actor_id: string; p_offer_id: string }
        Returns: Json
      }
      delete_product: {
        Args: { p_actor_id: string; p_product_id: string }
        Returns: Json
      }
      is_approved_creator: { Args: never; Returns: boolean }
      is_service_role: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      job_is_filmed: { Args: { p_application_id: string }; Returns: boolean }
      jwt_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      refresh_content_preview: {
        Args: {
          p_actor_id: string
          p_content_id: string
          p_embed_id?: string
          p_thumbnail_url: string
          p_video_author?: string
          p_video_title?: string
        }
        Returns: Json
      }
      review_application: {
        Args: {
          p_actor_id: string
          p_application_id: string
          p_decision: Database["public"]["Enums"]["application_status"]
          p_note?: string
          p_tier?: Database["public"]["Enums"]["creator_tier"]
        }
        Returns: Json
      }
      review_content: {
        Args: {
          p_actor_id: string
          p_content_id: string
          p_note?: string
          p_status: Database["public"]["Enums"]["content_status"]
        }
        Returns: Json
      }
      review_offer_application: {
        Args: {
          p_actor_id: string
          p_application_id: string
          p_decision: Database["public"]["Enums"]["offer_application_status"]
          p_note?: string
          p_stage?: Database["public"]["Enums"]["offer_stage"]
        }
        Returns: Json
      }
      save_brand: {
        Args: {
          p_actor_id: string
          p_brand_id?: string
          p_budget?: number
          p_client_name?: string
          p_currency?: string
          p_is_active?: boolean
          p_name: string
          p_store_id: string
        }
        Returns: Json
      }
      save_brand_about: {
        Args: {
          p_actor_id: string
          p_brand_id: string
          p_description?: string
          p_logo_url?: string
          p_tagline?: string
        }
        Returns: Json
      }
      save_offer: {
        Args: {
          p_actor_id: string
          p_badge_title?: string
          p_brand_id: string
          p_currency?: string
          p_description?: string
          p_needs_application?: boolean
          p_offer_id?: string
          p_reward_amount: number
          p_status?: Database["public"]["Enums"]["offer_status"]
          p_title: string
          p_video_count: number
        }
        Returns: Json
      }
      save_product: {
        Args: {
          p_actor_id: string
          p_badge_title?: string
          p_brand_id: string
          p_commission_rate?: number
          p_currency?: string
          p_external_product_id: string
          p_image_url?: string
          p_is_active?: boolean
          p_name: string
          p_price?: number
          p_product_id?: string
        }
        Returns: Json
      }
      set_offer_stage: {
        Args: {
          p_actor_id: string
          p_application_id: string
          p_note?: string
          p_stage: Database["public"]["Enums"]["offer_stage"]
        }
        Returns: Json
      }
      stage_is_before_content_done: {
        Args: { p_stage: Database["public"]["Enums"]["offer_stage"] }
        Returns: boolean
      }
      submit_content: {
        Args: {
          p_actor_id: string
          p_ad_authorized?: boolean
          p_ad_code: string
          p_application_id: string
          p_embed_id?: string
          p_thumbnail_url?: string
          p_video_author?: string
          p_video_title?: string
          p_video_url: string
        }
        Returns: Json
      }
      update_content: {
        Args: {
          p_actor_id: string
          p_ad_authorized?: boolean
          p_ad_code: string
          p_content_id: string
          p_embed_id?: string
          p_thumbnail_url?: string
          p_video_author?: string
          p_video_title?: string
          p_video_url: string
        }
        Returns: Json
      }
      withdraw_offer_application: {
        Args: { p_actor_id: string; p_application_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "applicant"
        | "creator"
        | "creative_strategist"
        | "ops"
        | "admin"
      application_status: "pending" | "approved" | "rejected"
      content_status: "submitted" | "approved" | "needs_another_take"
      creator_tier: "creator" | "rising" | "pro" | "elite"
      offer_application_status:
        | "pending"
        | "approved"
        | "rejected"
        | "withdrawn"
      offer_stage:
        | "pending_request"
        | "sample_requested"
        | "sample_shipped"
        | "content_pending"
        | "content_completed"
        | "payment_pending"
        | "paid"
      offer_status: "active" | "inactive"
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
      app_role: ["applicant", "creator", "creative_strategist", "ops", "admin"],
      application_status: ["pending", "approved", "rejected"],
      content_status: ["submitted", "approved", "needs_another_take"],
      creator_tier: ["creator", "rising", "pro", "elite"],
      offer_application_status: [
        "pending",
        "approved",
        "rejected",
        "withdrawn",
      ],
      offer_stage: [
        "pending_request",
        "sample_requested",
        "sample_shipped",
        "content_pending",
        "content_completed",
        "payment_pending",
        "paid",
      ],
      offer_status: ["active", "inactive"],
    },
  },
} as const
