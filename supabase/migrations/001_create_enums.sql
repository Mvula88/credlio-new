-- Create all enums for the application
CREATE TYPE app_role AS ENUM ('borrower', 'lender', 'admin');
CREATE TYPE request_status AS ENUM ('open', 'accepted', 'closed', 'cancelled');
CREATE TYPE offer_status AS ENUM ('pending', 'accepted', 'declined', 'withdrawn', 'expired');
CREATE TYPE loan_status AS ENUM ('active', 'completed', 'defaulted', 'written_off');
CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'mobile_money', 'other');
CREATE TYPE risk_origin AS ENUM ('LENDER_REPORTED', 'SYSTEM_AUTO');
CREATE TYPE risk_type AS ENUM ('LATE_1_7', 'LATE_8_30', 'LATE_31_60', 'DEFAULT', 'CLEARED');
CREATE TYPE sub_tier AS ENUM ('PRO', 'PRO_PLUS');
CREATE TYPE reporting_status AS ENUM ('on_time', 'late', 'missed');
CREATE TYPE dispute_status AS ENUM ('open', 'under_review', 'resolved_upheld', 'resolved_reversed');
CREATE TYPE audit_action AS ENUM ('create', 'update', 'delete', 'view', 'search', 'list_risk', 'resolve_risk');