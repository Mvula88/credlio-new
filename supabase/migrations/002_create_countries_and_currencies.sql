-- Countries table with 12 African countries
CREATE TABLE IF NOT EXISTS public.countries (
  code TEXT PRIMARY KEY CHECK (char_length(code) = 2),
  name TEXT NOT NULL,
  phone_prefix TEXT NOT NULL,
  id_regex TEXT, -- For ID validation patterns
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert 12 countries
INSERT INTO public.countries (code, name, phone_prefix, id_regex) VALUES
  ('NG', 'Nigeria', '+234', '[0-9]{11}'),
  ('KE', 'Kenya', '+254', '[0-9]{8}'),
  ('ZA', 'South Africa', '+27', '[0-9]{13}'),
  ('GH', 'Ghana', '+233', '[A-Z]{3}-[0-9]{7}-[0-9]'),
  ('TZ', 'Tanzania', '+255', '[0-9]{20}'),
  ('UG', 'Uganda', '+256', '[A-Z]{2}[0-9]{7}[A-Z]'),
  ('NA', 'Namibia', '+264', '[0-9]{11}'),
  ('ZM', 'Zambia', '+260', '[0-9]{6}/[0-9]{2}/[0-9]'),
  ('MW', 'Malawi', '+265', '[A-Z][0-9]{8}'),
  ('RW', 'Rwanda', '+250', '[0-9]{16}'),
  ('CM', 'Cameroon', '+237', '[0-9]{9}'),
  ('CI', 'Ivory Coast', '+225', '[0-9]{10}')
ON CONFLICT (code) DO NOTHING;

-- Country-specific currency configurations
CREATE TABLE IF NOT EXISTS public.country_currency_allowed (
  country_code TEXT NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  currency_code TEXT NOT NULL,
  currency_symbol TEXT NOT NULL,
  minor_units INT NOT NULL CHECK (minor_units BETWEEN 0 AND 3),
  is_default BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (country_code, currency_code)
);

-- Seed local currencies with proper minor units
INSERT INTO public.country_currency_allowed (country_code, currency_code, currency_symbol, minor_units) VALUES
  ('NG', 'NGN', '₦', 2),     -- Nigerian Naira
  ('KE', 'KES', 'KSh', 2),    -- Kenyan Shilling
  ('ZA', 'ZAR', 'R', 2),      -- South African Rand
  ('GH', 'GHS', '₵', 2),      -- Ghanaian Cedi
  ('TZ', 'TZS', 'TSh', 2),    -- Tanzanian Shilling
  ('UG', 'UGX', 'USh', 0),    -- Ugandan Shilling (no decimals)
  ('NA', 'NAD', 'N$', 2),     -- Namibian Dollar
  ('ZM', 'ZMW', 'K', 2),      -- Zambian Kwacha
  ('MW', 'MWK', 'MK', 2),     -- Malawian Kwacha
  ('RW', 'RWF', 'RF', 0),     -- Rwandan Franc (no decimals)
  ('CM', 'XAF', 'FCFA', 0),   -- Central African CFA franc (no decimals)
  ('CI', 'XOF', 'CFA', 0)     -- West African CFA franc (no decimals)
ON CONFLICT DO NOTHING;

-- Country-specific policies (grace periods, holidays, etc.)
CREATE TABLE IF NOT EXISTS public.country_policies (
  country_code TEXT PRIMARY KEY REFERENCES public.countries(code),
  grace_hours INT NOT NULL DEFAULT 48,
  max_loan_amount_minor BIGINT,
  min_loan_amount_minor BIGINT,
  max_apr_bps INT DEFAULT 36000, -- 360% APR max
  min_credit_score INT DEFAULT 300,
  max_credit_score INT DEFAULT 850,
  default_credit_score INT DEFAULT 600,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default policies for each country
INSERT INTO public.country_policies (country_code, grace_hours, max_loan_amount_minor, min_loan_amount_minor) 
SELECT code, 48, 100000000, 10000 FROM public.countries
ON CONFLICT DO NOTHING;