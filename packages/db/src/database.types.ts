// Archivo generado desde la base de Supabase (no editar a mano).
// Regenerar tras cada migración: `supabase gen types typescript --project-id <id>`
// o con la herramienta generate_typescript_types del conector de Supabase.

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      addon_stock: {
        Row: {
          addon_id: string
          branch_id: string
          quantity: number
        }
        Insert: {
          addon_id: string
          branch_id: string
          quantity: number
        }
        Update: {
          addon_id?: string
          branch_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "addon_stock_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addon_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      addons: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          price_clp: number
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price_clp?: number
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price_clp?: number
        }
        Relationships: [
          {
            foreignKeyName: "addons_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      allocations: {
        Row: {
          active: boolean
          booking_id: string
          booking_item_id: string
          business_id: string
          ends_at: string
          id: string
          professional_id: string | null
          resource_id: string
          starts_at: string
        }
        Insert: {
          active?: boolean
          booking_id: string
          booking_item_id: string
          business_id: string
          ends_at: string
          id?: string
          professional_id?: string | null
          resource_id: string
          starts_at: string
        }
        Update: {
          active?: boolean
          booking_id?: string
          booking_item_id?: string
          business_id?: string
          ends_at?: string
          id?: string
          professional_id?: string | null
          resource_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_booking_item_id_fkey"
            columns: ["booking_item_id"]
            isOneToOne: false
            referencedRelation: "booking_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          business_id: string | null
          created_at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          business_id?: string | null
          created_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          business_id?: string | null
          created_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      blocks: {
        Row: {
          branch_id: string | null
          business_id: string
          created_at: string
          ends_at: string
          id: string
          reason: string | null
          resource_id: string | null
          starts_at: string
        }
        Insert: {
          branch_id?: string | null
          business_id: string
          created_at?: string
          ends_at: string
          id?: string
          reason?: string | null
          resource_id?: string | null
          starts_at: string
        }
        Update: {
          branch_id?: string | null
          business_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          reason?: string | null
          resource_id?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_addons: {
        Row: {
          active: boolean
          addon_id: string
          addon_name: string
          booking_id: string
          branch_id: string
          business_id: string
          ends_at: string
          id: string
          quantity: number
          starts_at: string
          unit_price_clp: number
        }
        Insert: {
          active?: boolean
          addon_id: string
          addon_name: string
          booking_id: string
          branch_id: string
          business_id: string
          ends_at: string
          id?: string
          quantity: number
          starts_at: string
          unit_price_clp: number
        }
        Update: {
          active?: boolean
          addon_id?: string
          addon_name?: string
          booking_id?: string
          branch_id?: string
          business_id?: string
          ends_at?: string
          id?: string
          quantity?: number
          starts_at?: string
          unit_price_clp?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_addons_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_addons_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_items: {
        Row: {
          booking_id: string
          business_id: string
          duration_minutes: number
          ends_at: string
          id: string
          logistics_business_id: string | null
          modality: Database["public"]["Enums"]["booking_modality"]
          owner_business_id: string
          partnership_id: string | null
          position: number
          price_clp: number
          service_id: string
          service_name: string
          starts_at: string
        }
        Insert: {
          booking_id: string
          business_id: string
          duration_minutes: number
          ends_at: string
          id?: string
          logistics_business_id?: string | null
          modality?: Database["public"]["Enums"]["booking_modality"]
          owner_business_id: string
          partnership_id?: string | null
          position: number
          price_clp: number
          service_id: string
          service_name: string
          starts_at: string
        }
        Update: {
          booking_id?: string
          business_id?: string
          duration_minutes?: number
          ends_at?: string
          id?: string
          logistics_business_id?: string | null
          modality?: Database["public"]["Enums"]["booking_modality"]
          owner_business_id?: string
          partnership_id?: string | null
          position?: number
          price_clp?: number
          service_id?: string
          service_name?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_logistics_business_id_fkey"
            columns: ["logistics_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_owner_business_id_fkey"
            columns: ["owner_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_tokens: {
        Row: {
          booking_id: string
          created_at: string
          expires_at: string
          id: string
          notification_id: string | null
          purpose: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          expires_at: string
          id?: string
          notification_id?: string | null
          purpose: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          notification_id?: string | null
          purpose?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_tokens_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_tokens_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notification_log"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          branch_id: string
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          channel: Database["public"]["Enums"]["booking_channel"]
          created_at: string
          created_by_user_id: string | null
          customer_confirmed_at: string | null
          customer_id: string
          ends_at: string
          attendance_confirmed_at: string | null
          hold_expires_at: string | null
          reminder_sent_at: string | null
          id: string
          notes: string | null
          sold_by_user_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          total_clp: number
          updated_at: string
          visible_brand_business_id: string
        }
        Insert: {
          branch_id: string
          business_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          channel: Database["public"]["Enums"]["booking_channel"]
          created_at?: string
          created_by_user_id?: string | null
          customer_confirmed_at?: string | null
          customer_id: string
          ends_at: string
          attendance_confirmed_at?: string | null
          hold_expires_at?: string | null
          reminder_sent_at?: string | null
          id?: string
          notes?: string | null
          sold_by_user_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_clp: number
          updated_at?: string
          visible_brand_business_id: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          channel?: Database["public"]["Enums"]["booking_channel"]
          created_at?: string
          created_by_user_id?: string | null
          customer_confirmed_at?: string | null
          customer_id?: string
          ends_at?: string
          attendance_confirmed_at?: string | null
          hold_expires_at?: string | null
          reminder_sent_at?: string | null
          id?: string
          notes?: string | null
          sold_by_user_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_clp?: number
          updated_at?: string
          visible_brand_business_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_sold_by_user_id_fkey"
            columns: ["sold_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_visible_brand_business_id_fkey"
            columns: ["visible_brand_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_hours: {
        Row: {
          branch_id: string
          closes_at: string
          id: string
          opens_at: string
          weekday: number
        }
        Insert: {
          branch_id: string
          closes_at: string
          id?: string
          opens_at: string
          weekday: number
        }
        Update: {
          branch_id?: string
          closes_at?: string
          id?: string
          opens_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "branch_hours_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          active: boolean
          address: string | null
          business_id: string
          commune: string | null
          coverage_communes: string[]
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          business_id: string
          commune?: string | null
          coverage_communes?: string[]
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          address?: string | null
          business_id?: string
          commune?: string | null
          coverage_communes?: string[]
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_entitlements: {
        Row: {
          business_id: string
          enabled: boolean
          feature: string
          limit_value: number | null
          source: string
        }
        Insert: {
          business_id: string
          enabled?: boolean
          feature: string
          limit_value?: number | null
          source?: string
        }
        Update: {
          business_id?: string
          enabled?: boolean
          feature?: string
          limit_value?: number | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_entitlements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_subscriptions: {
        Row: {
          business_id: string
          plan_code: string
          started_at: string
          status: string
        }
        Insert: {
          business_id: string
          plan_code: string
          started_at?: string
          status?: string
        }
        Update: {
          business_id?: string
          plan_code?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_subscriptions_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
        ]
      }
      businesses: {
        Row: {
          booking_mode: Database["public"]["Enums"]["booking_mode"]
          cancellation_hours: number
          created_at: string
          email: string | null
          id: string
          industry_code: string
          max_advance_days: number
          min_advance_minutes: number
          name: string
          organization_id: string
          phone: string | null
          pending_hold_minutes: number
          public_booking_enabled: boolean
          confirmation_cutoff_hours: number
          public_confirmation_mode: string
          reminder_enabled: boolean
          reminder_hours_before: number
          slot_interval_minutes: number
          slug: string
          timezone: string
        }
        Insert: {
          booking_mode: Database["public"]["Enums"]["booking_mode"]
          cancellation_hours?: number
          created_at?: string
          email?: string | null
          id?: string
          industry_code: string
          max_advance_days?: number
          min_advance_minutes?: number
          name: string
          organization_id: string
          phone?: string | null
          pending_hold_minutes?: number
          public_booking_enabled?: boolean
          confirmation_cutoff_hours?: number
          public_confirmation_mode?: string
          reminder_enabled?: boolean
          reminder_hours_before?: number
          slot_interval_minutes?: number
          slug: string
          timezone?: string
        }
        Update: {
          booking_mode?: Database["public"]["Enums"]["booking_mode"]
          cancellation_hours?: number
          created_at?: string
          email?: string | null
          id?: string
          industry_code?: string
          max_advance_days?: number
          min_advance_minutes?: number
          name?: string
          organization_id?: string
          phone?: string | null
          pending_hold_minutes?: number
          public_booking_enabled?: boolean
          confirmation_cutoff_hours?: number
          public_confirmation_mode?: string
          reminder_enabled?: boolean
          reminder_hours_before?: number
          slot_interval_minutes?: number
          slug?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_industry_code_fkey"
            columns: ["industry_code"]
            isOneToOne: false
            referencedRelation: "industry_templates"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "businesses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          business_id: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          date: string
          name: string
        }
        Insert: {
          date: string
          name: string
        }
        Update: {
          date?: string
          name?: string
        }
        Relationships: []
      }
      industry_templates: {
        Row: {
          booking_mode: Database["public"]["Enums"]["booking_mode"]
          code: string
          config: Json
          name: string
          sort_order: number
        }
        Insert: {
          booking_mode: Database["public"]["Enums"]["booking_mode"]
          code: string
          config?: Json
          name: string
          sort_order?: number
        }
        Update: {
          booking_mode?: Database["public"]["Enums"]["booking_mode"]
          code?: string
          config?: Json
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      membership_branches: {
        Row: {
          branch_id: string
          membership_id: string
        }
        Insert: {
          branch_id: string
          membership_id: string
        }
        Update: {
          branch_id?: string
          membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_branches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_branches_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          business_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["membership_role"]
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["membership_role"]
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          booking_id: string | null
          business_id: string
          channel: string
          clicked_action: string | null
          clicked_at: string | null
          created_at: string
          error: string | null
          id: string
          kind: string
          recipient: string
          sent_at: string | null
          status: string
        }
        Insert: {
          booking_id?: string | null
          business_id: string
          channel: string
          clicked_action?: string | null
          clicked_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          recipient: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          booking_id?: string | null
          business_id?: string
          channel?: string
          clicked_action?: string | null
          clicked_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          recipient?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          enabled: boolean
          feature: string
          limit_value: number | null
          plan_code: string
        }
        Insert: {
          enabled?: boolean
          feature: string
          limit_value?: number | null
          plan_code: string
        }
        Update: {
          enabled?: boolean
          feature?: string
          limit_value?: number | null
          plan_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          description: string | null
          is_public: boolean
          name: string
        }
        Insert: {
          code: string
          description?: string | null
          is_public?: boolean
          name: string
        }
        Update: {
          code?: string
          description?: string | null
          is_public?: boolean
          name?: string
        }
        Relationships: []
      }
      professionals: {
        Row: {
          created_at: string
          created_by_business_id: string | null
          display_name: string
          email: string | null
          id: string
          phone: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_business_id?: string | null
          display_name: string
          email?: string | null
          id?: string
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_business_id?: string | null
          display_name?: string
          email?: string | null
          id?: string
          phone?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professionals_created_by_business_id_fkey"
            columns: ["created_by_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professionals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      resource_hours: {
        Row: {
          ends_at: string
          id: string
          resource_id: string
          starts_at: string
          weekday: number
        }
        Insert: {
          ends_at: string
          id?: string
          resource_id: string
          starts_at: string
          weekday: number
        }
        Update: {
          ends_at?: string
          id?: string
          resource_id?: string
          starts_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "resource_hours_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          active: boolean
          branch_id: string
          business_id: string
          created_at: string
          id: string
          is_logistics: boolean
          name: string
          professional_id: string | null
          skills: string[]
          type: Database["public"]["Enums"]["resource_type"]
        }
        Insert: {
          active?: boolean
          branch_id: string
          business_id: string
          created_at?: string
          id?: string
          is_logistics?: boolean
          name: string
          professional_id?: string | null
          skills?: string[]
          type: Database["public"]["Enums"]["resource_type"]
        }
        Update: {
          active?: boolean
          branch_id?: string
          business_id?: string
          created_at?: string
          id?: string
          is_logistics?: boolean
          name?: string
          professional_id?: string | null
          skills?: string[]
          type?: Database["public"]["Enums"]["resource_type"]
        }
        Relationships: [
          {
            foreignKeyName: "resources_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      service_resource_requirements: {
        Row: {
          id: string
          quantity: number
          required_skill: string | null
          resource_type: Database["public"]["Enums"]["resource_type"]
          service_id: string
        }
        Insert: {
          id?: string
          quantity?: number
          required_skill?: string | null
          resource_type: Database["public"]["Enums"]["resource_type"]
          service_id: string
        }
        Update: {
          id?: string
          quantity?: number
          required_skill?: string | null
          resource_type?: Database["public"]["Enums"]["resource_type"]
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_resource_requirements_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          booking_mode: Database["public"]["Enums"]["booking_mode"]
          buffer_after_minutes: number
          buffer_before_minutes: number
          business_id: string
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          name: string
          price_clp: number
        }
        Insert: {
          active?: boolean
          booking_mode: Database["public"]["Enums"]["booking_mode"]
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          business_id: string
          created_at?: string
          description?: string | null
          duration_minutes: number
          id?: string
          name: string
          price_clp?: number
        }
        Update: {
          active?: boolean
          booking_mode?: Database["public"]["Enums"]["booking_mode"]
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          business_id?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name?: string
          price_clp?: number
        }
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      app_add_member: {
        Args: {
          p_branch_ids?: string[]
          p_business_id: string
          p_email: string
          p_role: Database["public"]["Enums"]["membership_role"]
        }
        Returns: string
      }
      app_booking_context: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_from: string
          p_to: string
        }
        Returns: Json
      }
      app_create_booking: {
        Args: {
          p_addons?: Json
          p_branch_id: string
          p_business_id: string
          p_customer: Json
          p_items: Json
          p_notes?: string
        }
        Returns: string
      }
      app_create_booking_token: {
        Args: {
          p_booking_id: string
          p_expires_at: string
          p_notification_id?: string
          p_purpose: string
          p_token_hash: string
        }
        Returns: undefined
      }
      app_create_business: {
        Args: {
          p_branch_address?: string
          p_branch_commune?: string
          p_branch_name: string
          p_business_name: string
          p_industry_code: string
          p_timezone?: string
        }
        Returns: string
      }
      app_customer_cancel_booking: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      app_booking_email_data: { Args: { p_booking_id: string }; Returns: Json }
      app_claim_reminder: { Args: { p_booking_id: string }; Returns: boolean }
      app_expire_pending: { Args: never; Returns: number }
      app_reminder_candidates: {
        Args: { p_limit?: number; p_now?: string }
        Returns: Json
      }
      app_link_my_customers: { Args: never; Returns: number }
      app_my_bookings: { Args: never; Returns: Json }
      app_public_business: { Args: { p_slug: string }; Returns: Json }
      app_use_booking_token: { Args: { p_token_hash: string }; Returns: Json }
    }
    Enums: {
      booking_channel:
        | "public_link"
        | "reception"
        | "seller"
        | "partner"
        | "reseller"
      booking_modality: "own" | "full_service" | "equipment_loan"
      booking_mode:
        | "appointment"
        | "fixed_slot"
        | "capacity"
        | "rental"
        | "queue"
      booking_status:
        | "pending"
        | "confirmed"
        | "checked_in"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
      membership_role:
        | "owner"
        | "admin"
        | "branch_admin"
        | "receptionist"
        | "staff"
        | "seller"
      resource_type: "person" | "space" | "equipment"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      booking_channel: [
        "public_link",
        "reception",
        "seller",
        "partner",
        "reseller",
      ],
      booking_modality: ["own", "full_service", "equipment_loan"],
      booking_mode: [
        "appointment",
        "fixed_slot",
        "capacity",
        "rental",
        "queue",
      ],
      booking_status: [
        "pending",
        "confirmed",
        "checked_in",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
      ],
      membership_role: [
        "owner",
        "admin",
        "branch_admin",
        "receptionist",
        "staff",
        "seller",
      ],
      resource_type: ["person", "space", "equipment"],
    },
  },
} as const
