// Tipos de la base de datos (equivalentes a `supabase gen types typescript`).
// Si cambias el esquema, puedes regenerarlos con:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type AppointmentStatus = 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export type Database = {
  public: {
    Tables: {
      business_settings: {
        Row: {
          id: number;
          name: string;
          timezone: string;
          currency: string;
          slot_interval_minutes: number;
          booking_window_days: number;
          phone: string | null;
          address: string | null;
        };
        Insert: {
          id?: number;
          name?: string;
          timezone?: string;
          currency?: string;
          slot_interval_minutes?: number;
          booking_window_days?: number;
          phone?: string | null;
          address?: string | null;
        };
        Update: {
          id?: number;
          name?: string;
          timezone?: string;
          currency?: string;
          slot_interval_minutes?: number;
          booking_window_days?: number;
          phone?: string | null;
          address?: string | null;
        };
        Relationships: [];
      };
      admins: {
        Row: { user_id: string; created_at: string };
        Insert: { user_id: string; created_at?: string };
        Update: { user_id?: string; created_at?: string };
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          duration_minutes: number;
          price: number;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          duration_minutes: number;
          price?: number;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          duration_minutes?: number;
          price?: number;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      staff: {
        Row: { id: string; name: string; role: string | null; active: boolean; created_at: string };
        Insert: { id?: string; name: string; role?: string | null; active?: boolean; created_at?: string };
        Update: { id?: string; name?: string; role?: string | null; active?: boolean; created_at?: string };
        Relationships: [];
      };
      staff_services: {
        Row: { staff_id: string; service_id: string };
        Insert: { staff_id: string; service_id: string };
        Update: { staff_id?: string; service_id?: string };
        Relationships: [
          {
            foreignKeyName: 'staff_services_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_services_service_id_fkey';
            columns: ['service_id'];
            isOneToOne: false;
            referencedRelation: 'services';
            referencedColumns: ['id'];
          },
        ];
      };
      working_hours: {
        Row: { id: string; staff_id: string; weekday: number; start_time: string; end_time: string };
        Insert: { id?: string; staff_id: string; weekday: number; start_time: string; end_time: string };
        Update: { id?: string; staff_id?: string; weekday?: number; start_time?: string; end_time?: string };
        Relationships: [
          {
            foreignKeyName: 'working_hours_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff';
            referencedColumns: ['id'];
          },
        ];
      };
      time_off: {
        Row: { id: string; staff_id: string; starts_at: string; ends_at: string; reason: string | null };
        Insert: { id?: string; staff_id: string; starts_at: string; ends_at: string; reason?: string | null };
        Update: { id?: string; staff_id?: string; starts_at?: string; ends_at?: string; reason?: string | null };
        Relationships: [
          {
            foreignKeyName: 'time_off_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff';
            referencedColumns: ['id'];
          },
        ];
      };
      appointments: {
        Row: {
          id: string;
          staff_id: string;
          service_id: string;
          customer_name: string;
          customer_phone: string;
          customer_email: string | null;
          notes: string | null;
          starts_at: string;
          ends_at: string;
          status: AppointmentStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          staff_id: string;
          service_id: string;
          customer_name: string;
          customer_phone: string;
          customer_email?: string | null;
          notes?: string | null;
          starts_at: string;
          ends_at: string;
          status?: AppointmentStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          staff_id?: string;
          service_id?: string;
          customer_name?: string;
          customer_phone?: string;
          customer_email?: string | null;
          notes?: string | null;
          starts_at?: string;
          ends_at?: string;
          status?: AppointmentStatus;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      get_available_slots: {
        Args: { p_service_id: string; p_date: string; p_staff_id?: string | null };
        Returns: { slot_start: string; staff_id: string }[];
      };
      book_appointment: {
        Args: {
          p_service_id: string;
          p_staff_id: string;
          p_starts_at: string;
          p_customer_name: string;
          p_customer_phone: string;
          p_customer_email?: string | null;
          p_notes?: string | null;
        };
        Returns: string;
      };
      get_agenda: {
        Args: { p_date: string };
        Returns: {
          id: string;
          starts_at: string;
          ends_at: string;
          status: AppointmentStatus;
          customer_name: string;
          customer_phone: string;
          customer_email: string | null;
          notes: string | null;
          staff_id: string;
          staff_name: string;
          service_id: string;
          service_name: string;
          price: number;
        }[];
      };
    };
    Enums: { appointment_status: AppointmentStatus };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicTables = Database['public']['Tables'];
export type Row<T extends keyof PublicTables> = PublicTables[T]['Row'];

export type BusinessSettings = Row<'business_settings'>;
export type Service = Row<'services'>;
export type Staff = Row<'staff'>;
export type WorkingHours = Row<'working_hours'>;
export type TimeOff = Row<'time_off'>;
export type Appointment = Row<'appointments'>;
export type AgendaItem = Database['public']['Functions']['get_agenda']['Returns'][number];
export type Slot = Database['public']['Functions']['get_available_slots']['Returns'][number];
