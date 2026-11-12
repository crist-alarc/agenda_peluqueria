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
          price: number
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price?: number
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price?: number
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
      billing_entities: {
        Row: {
          active: boolean
          country: string
          created_at: string
          id: string
          name: string
          tax_id: string | null
        }
        Insert: {
          active?: boolean
          country: string
          created_at?: string
          id?: string
          name: string
          tax_id?: string | null
        }
        Update: {
          active?: boolean
          country?: string
          created_at?: string
          id?: string
          name?: string
          tax_id?: string | null
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
          unit_price: number
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
          unit_price: number
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
          unit_price?: number
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
      booking_item_shares: {
        Row: {
          booking_item_id: string
          business_id: string
          minutes: number | null
          professional_id: string
          share_bp: number
        }
        Insert: {
          booking_item_id: string
          business_id: string
          minutes?: number | null
          professional_id: string
          share_bp: number
        }
        Update: {
          booking_item_id?: string
          business_id?: string
          minutes?: number | null
          professional_id?: string
          share_bp?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_item_shares_booking_item_id_fkey"
            columns: ["booking_item_id"]
            isOneToOne: false
            referencedRelation: "booking_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_item_shares_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_item_shares_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
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
          price: number
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
          price: number
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
          price?: number
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
          attendance_confirmed_at: string | null
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
          hold_expires_at: string | null
          id: string
          notes: string | null
          reminder_sent_at: string | null
          sold_by_user_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          total: number
          updated_at: string
          visible_brand_business_id: string
        }
        Insert: {
          attendance_confirmed_at?: string | null
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
          hold_expires_at?: string | null
          id?: string
          notes?: string | null
          reminder_sent_at?: string | null
          sold_by_user_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          total: number
          updated_at?: string
          visible_brand_business_id: string
        }
        Update: {
          attendance_confirmed_at?: string | null
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
          hold_expires_at?: string | null
          id?: string
          notes?: string | null
          reminder_sent_at?: string | null
          sold_by_user_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total?: number
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
          created_at: string
          delivery_fee: number
          delivery_mode: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          business_id: string
          commune?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_mode?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          address?: string | null
          business_id?: string
          commune?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_mode?: string
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
      business_feature_overrides: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          enabled: boolean
          ended_at: string | null
          expires_at: string | null
          feature: string
          id: string
          limit_value: number | null
          note: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          enabled: boolean
          ended_at?: string | null
          expires_at?: string | null
          feature: string
          id?: string
          limit_value?: number | null
          note: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          ended_at?: string | null
          expires_at?: string | null
          feature?: string
          id?: string
          limit_value?: number | null
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_feature_overrides_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_feature_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_subscriptions: {
        Row: {
          billing_entity_id: string | null
          business_id: string
          currency: string
          plan_code: string
          plan_version_id: string
          started_at: string
          status: string
        }
        Insert: {
          billing_entity_id?: string | null
          business_id: string
          currency: string
          plan_code: string
          plan_version_id: string
          started_at?: string
          status?: string
        }
        Update: {
          billing_entity_id?: string | null
          business_id?: string
          currency?: string
          plan_code?: string
          plan_version_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_subscriptions_billing_entity_id_fkey"
            columns: ["billing_entity_id"]
            isOneToOne: false
            referencedRelation: "billing_entities"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "business_subscriptions_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          booking_mode: Database["public"]["Enums"]["booking_mode"]
          cancellation_hours: number
          confirmation_cutoff_hours: number
          country: string
          created_at: string
          currency: string
          email: string | null
          id: string
          industry_code: string
          max_advance_days: number
          min_advance_minutes: number
          name: string
          organization_id: string
          pending_hold_minutes: number
          phone: string | null
          public_booking_enabled: boolean
          public_confirmation_mode: string
          reminder_enabled: boolean
          reminder_hours_before: number
          settlement_period: string
          show_public_prices: boolean
          slot_interval_minutes: number
          slug: string
          suspended_at: string | null
          suspension_reason: string | null
          timezone: string
        }
        Insert: {
          booking_mode: Database["public"]["Enums"]["booking_mode"]
          cancellation_hours?: number
          confirmation_cutoff_hours?: number
          country?: string
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          industry_code: string
          max_advance_days?: number
          min_advance_minutes?: number
          name: string
          organization_id: string
          pending_hold_minutes?: number
          phone?: string | null
          public_booking_enabled?: boolean
          public_confirmation_mode?: string
          reminder_enabled?: boolean
          reminder_hours_before?: number
          settlement_period?: string
          show_public_prices?: boolean
          slot_interval_minutes?: number
          slug: string
          suspended_at?: string | null
          suspension_reason?: string | null
          timezone?: string
        }
        Update: {
          booking_mode?: Database["public"]["Enums"]["booking_mode"]
          cancellation_hours?: number
          confirmation_cutoff_hours?: number
          country?: string
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          industry_code?: string
          max_advance_days?: number
          min_advance_minutes?: number
          name?: string
          organization_id?: string
          pending_hold_minutes?: number
          phone?: string | null
          public_booking_enabled?: boolean
          public_confirmation_mode?: string
          reminder_enabled?: boolean
          reminder_hours_before?: number
          settlement_period?: string
          show_public_prices?: boolean
          slot_interval_minutes?: number
          slug?: string
          suspended_at?: string | null
          suspension_reason?: string | null
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
      commission_entries: {
        Row: {
          addon_base_amount: number
          amount: number
          base_amount: number
          booking_id: string | null
          booking_item_id: string | null
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          note: string | null
          occurred_at: string
          professional_id: string
          rule_id: string | null
          rule_kind: string | null
          rule_value: number | null
          settlement_id: string | null
          share_bp: number | null
        }
        Insert: {
          addon_base_amount?: number
          amount: number
          base_amount?: number
          booking_id?: string | null
          booking_item_id?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          note?: string | null
          occurred_at: string
          professional_id: string
          rule_id?: string | null
          rule_kind?: string | null
          rule_value?: number | null
          settlement_id?: string | null
          share_bp?: number | null
        }
        Update: {
          addon_base_amount?: number
          amount?: number
          base_amount?: number
          booking_id?: string | null
          booking_item_id?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          occurred_at?: string
          professional_id?: string
          rule_id?: string | null
          rule_kind?: string | null
          rule_value?: number | null
          settlement_id?: string | null
          share_bp?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_entries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_booking_item_id_fkey"
            columns: ["booking_item_id"]
            isOneToOne: false
            referencedRelation: "booking_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          id: string
          include_addons: boolean
          kind: string
          professional_id: string | null
          service_id: string | null
          value: number
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          id?: string
          include_addons?: boolean
          kind: string
          professional_id?: string | null
          service_id?: string | null
          value: number
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          id?: string
          include_addons?: boolean
          kind?: string
          professional_id?: string | null
          service_id?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
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
      delivery_zones: {
        Row: {
          active: boolean
          branch_id: string
          business_id: string
          created_at: string
          fee: number
          id: string
          name: string
          position: number
        }
        Insert: {
          active?: boolean
          branch_id: string
          business_id: string
          created_at?: string
          fee?: number
          id?: string
          name: string
          position?: number
        }
        Update: {
          active?: boolean
          branch_id?: string
          business_id?: string
          created_at?: string
          fee?: number
          id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_zones_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
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
          can_approve_support: boolean
          created_at: string
          id: string
          role: Database["public"]["Enums"]["membership_role"]
          user_id: string
        }
        Insert: {
          business_id: string
          can_approve_support?: boolean
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["membership_role"]
          user_id: string
        }
        Update: {
          business_id?: string
          can_approve_support?: boolean
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
      plan_versions: {
        Row: {
          created_at: string
          created_by: string | null
          features: Json
          id: string
          note: string | null
          plan_code: string
          prices: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          features: Json
          id?: string
          note?: string | null
          plan_code: string
          prices?: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          features?: Json
          id?: string
          note?: string | null
          plan_code?: string
          prices?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_versions_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          code: string
          current_version_id: string | null
          description: string | null
          is_public: boolean
          name: string
          offered_countries: string[]
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          current_version_id?: string | null
          description?: string | null
          is_public?: boolean
          name: string
          offered_countries?: string[]
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          current_version_id?: string | null
          description?: string | null
          is_public?: boolean
          name?: string
          offered_countries?: string[]
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "plans_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          max_events_per_day: number | null
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
          max_events_per_day?: number | null
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
          max_events_per_day?: number | null
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
      service_commission_roles: {
        Row: {
          business_id: string
          id: string
          label: string
          position: number
          required_skill: string | null
          service_id: string
          share_bp: number
        }
        Insert: {
          business_id: string
          id?: string
          label: string
          position?: number
          required_skill?: string | null
          service_id: string
          share_bp: number
        }
        Update: {
          business_id?: string
          id?: string
          label?: string
          position?: number
          required_skill?: string | null
          service_id?: string
          share_bp?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_commission_roles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_commission_roles_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_photos: {
        Row: {
          business_id: string
          created_at: string
          id: string
          path: string
          position: number
          service_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          path: string
          position?: number
          service_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          path?: string
          position?: number
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_photos_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_photos_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
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
          details: Json
          duration_minutes: number
          full_day: boolean
          id: string
          name: string
          price: number
        }
        Insert: {
          active?: boolean
          booking_mode: Database["public"]["Enums"]["booking_mode"]
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          business_id: string
          created_at?: string
          description?: string | null
          details?: Json
          duration_minutes: number
          full_day?: boolean
          id?: string
          name: string
          price?: number
        }
        Update: {
          active?: boolean
          booking_mode?: Database["public"]["Enums"]["booking_mode"]
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          business_id?: string
          created_at?: string
          description?: string | null
          details?: Json
          duration_minutes?: number
          full_day?: boolean
          id?: string
          name?: string
          price?: number
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
      settlements: {
        Row: {
          business_id: string
          closed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          paid_at: string | null
          period_end: string
          period_start: string
          status: string
          total: number
        }
        Insert: {
          business_id: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: string
          total?: number
        }
        Update: {
          business_id?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "settlements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_periods: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          currency: string
          ends_on: string | null
          id: string
          kind: string
          monthly_net: number | null
          note: string | null
          plan_version_id: string | null
          starts_on: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          currency: string
          ends_on?: string | null
          id?: string
          kind: string
          monthly_net?: number | null
          note?: string | null
          plan_version_id?: string | null
          starts_on: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          ends_on?: string | null
          id?: string
          kind?: string
          monthly_net?: number | null
          note?: string | null
          plan_version_id?: string | null
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_periods_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_periods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_periods_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      support_access_log: {
        Row: {
          admin_user_id: string
          business_id: string
          id: number
          request_id: string
          viewed_at: string
        }
        Insert: {
          admin_user_id: string
          business_id: string
          id?: never
          request_id: string
          viewed_at?: string
        }
        Update: {
          admin_user_id?: string
          business_id?: string
          id?: never
          request_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_access_log_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_access_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_access_log_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "support_access_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      support_access_requests: {
        Row: {
          business_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          expires_at: string | null
          id: string
          reason: string
          requested_by: string
          requested_hours: number
          requester_email: string
          requester_name: string
          status: string
        }
        Insert: {
          business_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string | null
          id?: string
          reason: string
          requested_by: string
          requested_hours: number
          requester_email: string
          requester_name: string
          status?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string | null
          id?: string
          reason?: string
          requested_by?: string
          requested_hours?: number
          requester_email?: string
          requester_name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_access_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_access_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_access_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rules: {
        Row: {
          active: boolean
          billing_entity_id: string
          client_country: string | null
          created_at: string
          currency: string
          document_type: string
          id: string
          tax_rate_bp: number
        }
        Insert: {
          active?: boolean
          billing_entity_id: string
          client_country?: string | null
          created_at?: string
          currency: string
          document_type: string
          id?: string
          tax_rate_bp: number
        }
        Update: {
          active?: boolean
          billing_entity_id?: string
          client_country?: string | null
          created_at?: string
          currency?: string
          document_type?: string
          id?: string
          tax_rate_bp?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_rules_billing_entity_id_fkey"
            columns: ["billing_entity_id"]
            isOneToOne: false
            referencedRelation: "billing_entities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      app_add_commission_adjustment: {
        Args: {
          p_amount: number
          p_business_id: string
          p_note: string
          p_professional_id: string
        }
        Returns: string
      }
      app_add_member: {
        Args: {
          p_branch_ids?: string[]
          p_business_id: string
          p_email: string
          p_role: Database["public"]["Enums"]["membership_role"]
        }
        Returns: string
      }
      app_admin_add_override: {
        Args: {
          p_business_id: string
          p_enabled: boolean
          p_expires_at: string
          p_feature: string
          p_limit: number
          p_note: string
        }
        Returns: string
      }
      app_admin_billing_setup: { Args: never; Returns: Json }
      app_admin_business_plan: {
        Args: { p_business_id: string }
        Returns: Json
      }
      app_admin_cancel_support: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      app_admin_change_plan: {
        Args: { p_business_id: string; p_note?: string; p_plan_code: string }
        Returns: undefined
      }
      app_admin_clients: { Args: { p_organization_id?: string }; Returns: Json }
      app_admin_end_override: {
        Args: { p_override_id: string }
        Returns: undefined
      }
      app_admin_migrate_plan_version: {
        Args: { p_from_version_id: string; p_note?: string }
        Returns: number
      }
      app_admin_plans: { Args: never; Returns: Json }
      app_admin_reactivate: {
        Args: { p_business_id: string; p_note?: string }
        Returns: undefined
      }
      app_admin_request_support: {
        Args: { p_business_id: string; p_hours: number; p_reason: string }
        Returns: string
      }
      app_admin_save_billing_entity: {
        Args: {
          p_active: boolean
          p_id: string
          p_name: string
          p_tax_id: string
        }
        Returns: undefined
      }
      app_admin_save_plan: {
        Args: {
          p_active: boolean
          p_code: string
          p_description: string
          p_features: Json
          p_is_public: boolean
          p_name: string
          p_note?: string
          p_offered_countries: string[]
          p_prices: Json
        }
        Returns: string
      }
      app_admin_save_tax_rule: {
        Args: {
          p_active: boolean
          p_currency: string
          p_document_type: string
          p_id: string
          p_tax_rate_bp: number
        }
        Returns: undefined
      }
      app_admin_support_snapshot: {
        Args: { p_business_id: string }
        Returns: Json
      }
      app_admin_suspend: {
        Args: { p_business_id: string; p_reason: string }
        Returns: undefined
      }
      app_booking_commission_data: {
        Args: { p_booking_id: string }
        Returns: Json
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
      app_booking_email_data: { Args: { p_booking_id: string }; Returns: Json }
      app_bookings_missing_commissions: {
        Args: { p_business_id: string; p_to: string }
        Returns: string[]
      }
      app_claim_reminder: { Args: { p_booking_id: string }; Returns: boolean }
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
          p_plan_code?: string
          p_timezone?: string
        }
        Returns: string
      }
      app_create_settlement: {
        Args: { p_business_id: string; p_end: string; p_start: string }
        Returns: string
      }
      app_customer_cancel_booking: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      app_decide_support_request: {
        Args: { p_approve: boolean; p_hours?: number; p_request_id: string }
        Returns: undefined
      }
      app_expire_pending: { Args: never; Returns: number }
      app_link_my_customers: { Args: never; Returns: number }
      app_my_bookings: { Args: never; Returns: Json }
      app_my_plan: { Args: { p_business_id: string }; Returns: Json }
      app_public_business: { Args: { p_slug: string }; Returns: Json }
      app_public_plans: { Args: { p_country?: string }; Returns: Json }
      app_reminder_candidates: {
        Args: { p_limit?: number; p_now?: string }
        Returns: Json
      }
      app_replace_booking_commissions: {
        Args: { p_booking_id: string; p_lines: Json }
        Returns: number
      }
      app_revoke_support_access: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      app_set_item_shares: {
        Args: { p_booking_item_id: string; p_shares: Json }
        Returns: undefined
      }
      app_set_service_recipe: {
        Args: { p_roles: Json; p_service_id: string }
        Returns: undefined
      }
      app_set_settlement_status: {
        Args: { p_settlement_id: string; p_status: string }
        Returns: undefined
      }
      app_set_support_approver: {
        Args: { p_membership_id: string; p_value: boolean }
        Returns: undefined
      }
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
