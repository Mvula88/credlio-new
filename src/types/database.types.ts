export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      countries: {
        Row: {
          code: string
          name: string
          phone_prefix: string
          id_regex: string | null
          created_at: string
        }
        Insert: {
          code: string
          name: string
          phone_prefix: string
          id_regex?: string | null
          created_at?: string
        }
        Update: {
          code?: string
          name?: string
          phone_prefix?: string
          id_regex?: string | null
          created_at?: string
        }
      }
      country_currency_allowed: {
        Row: {
          country_code: string
          currency_code: string
          currency_symbol: string
          minor_units: number
          is_default: boolean
        }
        Insert: {
          country_code: string
          currency_code: string
          currency_symbol: string
          minor_units: number
          is_default?: boolean
        }
        Update: {
          country_code?: string
          currency_code?: string
          currency_symbol?: string
          minor_units?: number
          is_default?: boolean
        }
      }
      profiles: {
        Row: {
          user_id: string
          full_name: string
          app_role: 'borrower' | 'lender' | 'admin'
          country_code: string
          phone_e164: string | null
          date_of_birth: string | null
          consent_timestamp: string | null
          consent_ip_hash: string | null
          onboarding_completed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          full_name: string
          app_role: 'borrower' | 'lender' | 'admin'
          country_code: string
          phone_e164?: string | null
          date_of_birth?: string | null
          consent_timestamp?: string | null
          consent_ip_hash?: string | null
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          full_name?: string
          app_role?: 'borrower' | 'lender' | 'admin'
          country_code?: string
          phone_e164?: string | null
          date_of_birth?: string | null
          consent_timestamp?: string | null
          consent_ip_hash?: string | null
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      borrowers: {
        Row: {
          id: string
          country_code: string
          full_name: string
          national_id_hash: string
          phone_e164: string
          date_of_birth: string
          created_by_lender: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          country_code: string
          full_name: string
          national_id_hash: string
          phone_e164: string
          date_of_birth: string
          created_by_lender?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          country_code?: string
          full_name?: string
          national_id_hash?: string
          phone_e164?: string
          date_of_birth?: string
          created_by_lender?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      borrower_scores: {
        Row: {
          borrower_id: string
          score: number
          score_factors: Json
          last_calculated_at: string
          updated_at: string
        }
        Insert: {
          borrower_id: string
          score?: number
          score_factors?: Json
          last_calculated_at?: string
          updated_at?: string
        }
        Update: {
          borrower_id?: string
          score?: number
          score_factors?: Json
          last_calculated_at?: string
          updated_at?: string
        }
      }
      loans: {
        Row: {
          id: string
          borrower_id: string
          lender_id: string
          request_id: string | null
          country_code: string
          currency: string
          principal_minor: number
          apr_bps: number
          term_months: number
          start_date: string
          end_date: string
          status: 'active' | 'completed' | 'defaulted' | 'written_off'
          disbursed_at: string | null
          completed_at: string | null
          defaulted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          borrower_id: string
          lender_id: string
          request_id?: string | null
          country_code: string
          currency: string
          principal_minor: number
          apr_bps: number
          term_months: number
          start_date: string
          end_date: string
          status?: 'active' | 'completed' | 'defaulted' | 'written_off'
          disbursed_at?: string | null
          completed_at?: string | null
          defaulted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          borrower_id?: string
          lender_id?: string
          request_id?: string | null
          country_code?: string
          currency?: string
          principal_minor?: number
          apr_bps?: number
          term_months?: number
          start_date?: string
          end_date?: string
          status?: 'active' | 'completed' | 'defaulted' | 'written_off'
          disbursed_at?: string | null
          completed_at?: string | null
          defaulted_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      loan_requests: {
        Row: {
          id: string
          borrower_id: string
          borrower_user_id: string
          country_code: string
          currency: string
          amount_minor: number
          purpose: string
          description: string | null
          term_months: number
          max_apr_bps: number | null
          status: 'open' | 'accepted' | 'closed' | 'cancelled'
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          borrower_id: string
          borrower_user_id: string
          country_code: string
          currency: string
          amount_minor: number
          purpose: string
          description?: string | null
          term_months: number
          max_apr_bps?: number | null
          status?: 'open' | 'accepted' | 'closed' | 'cancelled'
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          borrower_id?: string
          borrower_user_id?: string
          country_code?: string
          currency?: string
          amount_minor?: number
          purpose?: string
          description?: string | null
          term_months?: number
          max_apr_bps?: number | null
          status?: 'open' | 'accepted' | 'closed' | 'cancelled'
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      loan_offers: {
        Row: {
          id: string
          request_id: string
          lender_id: string
          amount_minor: number
          apr_bps: number
          term_months: number
          fees_minor: number
          conditions: string | null
          status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired'
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          request_id: string
          lender_id: string
          amount_minor: number
          apr_bps: number
          term_months: number
          fees_minor?: number
          conditions?: string | null
          status?: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired'
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          request_id?: string
          lender_id?: string
          amount_minor?: number
          apr_bps?: number
          term_months?: number
          fees_minor?: number
          conditions?: string | null
          status?: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired'
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      risk_flags: {
        Row: {
          id: string
          borrower_id: string
          country_code: string
          origin: 'LENDER_REPORTED' | 'SYSTEM_AUTO'
          type: 'LATE_1_7' | 'LATE_8_30' | 'LATE_31_60' | 'DEFAULT' | 'CLEARED'
          reason: string | null
          amount_at_issue_minor: number | null
          proof_sha256: string | null
          created_by: string | null
          created_at: string
          resolved_at: string | null
          resolved_by: string | null
          resolution_reason: string | null
          expires_at: string | null
        }
        Insert: {
          id?: string
          borrower_id: string
          country_code: string
          origin: 'LENDER_REPORTED' | 'SYSTEM_AUTO'
          type: 'LATE_1_7' | 'LATE_8_30' | 'LATE_31_60' | 'DEFAULT' | 'CLEARED'
          reason?: string | null
          amount_at_issue_minor?: number | null
          proof_sha256?: string | null
          created_by?: string | null
          created_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolution_reason?: string | null
          expires_at?: string | null
        }
        Update: {
          id?: string
          borrower_id?: string
          country_code?: string
          origin?: 'LENDER_REPORTED' | 'SYSTEM_AUTO'
          type?: 'LATE_1_7' | 'LATE_8_30' | 'LATE_31_60' | 'DEFAULT' | 'CLEARED'
          reason?: string | null
          amount_at_issue_minor?: number | null
          proof_sha256?: string | null
          created_by?: string | null
          created_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolution_reason?: string | null
          expires_at?: string | null
        }
      }
      subscriptions: {
        Row: {
          user_id: string
          tier: 'PRO' | 'PRO_PLUS'
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          stripe_price_id: string | null
          current_period_start: string | null
          current_period_end: string | null
          cancel_at_period_end: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          tier?: 'PRO' | 'PRO_PLUS'
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          tier?: 'PRO' | 'PRO_PLUS'
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      v_borrower_directory: {
        Row: {
          borrower_id: string
          country_code: string
          full_name: string
          phone_e164: string
          created_at: string
          score: number | null
          lender_reported_open: number
          system_auto_open: number
          total_listings_open: number
          listed_by_n_lenders: number
          latest_loan_status: string | null
          total_loans_count: number
        }
      }
    }
    Functions: {
      hash_national_id: {
        Args: { raw_id: string }
        Returns: string
      }
      register_borrower: {
        Args: {
          p_full_name: string
          p_national_id: string
          p_phone_e164: string
          p_date_of_birth: string
          p_country_code: string
        }
        Returns: string
      }
      search_borrowers: {
        Args: {
          p_national_id?: string | null
          p_phone?: string | null
          p_name?: string | null
        }
        Returns: Array<{
          borrower_id: string
          full_name: string
          phone_e164: string
          score: number
          risk_level: string
          listed_by_n_lenders: number
        }>
      }
      accept_offer: {
        Args: { p_offer_id: string }
        Returns: string
      }
      record_repayment: {
        Args: {
          p_schedule_id: string
          p_paid_at: string
          p_amount_minor: number
          p_method: 'cash' | 'bank_transfer' | 'mobile_money' | 'other'
          p_reference?: string | null
          p_evidence_url?: string | null
        }
        Returns: string
      }
      list_borrower_as_risky: {
        Args: {
          p_borrower_id: string
          p_type: 'LATE_1_7' | 'LATE_8_30' | 'LATE_31_60' | 'DEFAULT' | 'CLEARED'
          p_reason: string
          p_amount_minor: number
          p_proof_hash: string
        }
        Returns: string
      }
      resolve_risk_flag: {
        Args: {
          p_flag_id: string
          p_reason: string
        }
        Returns: void
      }
      link_borrower_user: {
        Args: {
          p_national_id: string
          p_phone: string
          p_date_of_birth: string
        }
        Returns: string
      }
      refresh_risks_and_scores: {
        Args: { p_grace_hours?: number }
        Returns: Json
      }
      jwt_uid: {
        Args: Record<string, never>
        Returns: string
      }
      jwt_role: {
        Args: Record<string, never>
        Returns: 'borrower' | 'lender' | 'admin'
      }
      jwt_country: {
        Args: Record<string, never>
        Returns: string
      }
      jwt_tier: {
        Args: Record<string, never>
        Returns: 'PRO' | 'PRO_PLUS'
      }
    }
    Enums: {
      app_role: 'borrower' | 'lender' | 'admin'
      request_status: 'open' | 'accepted' | 'closed' | 'cancelled'
      offer_status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired'
      loan_status: 'active' | 'completed' | 'defaulted' | 'written_off'
      payment_method: 'cash' | 'bank_transfer' | 'mobile_money' | 'other'
      risk_origin: 'LENDER_REPORTED' | 'SYSTEM_AUTO'
      risk_type: 'LATE_1_7' | 'LATE_8_30' | 'LATE_31_60' | 'DEFAULT' | 'CLEARED'
      sub_tier: 'PRO' | 'PRO_PLUS'
      reporting_status: 'on_time' | 'late' | 'missed'
      dispute_status: 'open' | 'under_review' | 'resolved_upheld' | 'resolved_reversed'
      audit_action: 'create' | 'update' | 'delete' | 'view' | 'search' | 'list_risk' | 'resolve_risk'
    }
  }
}