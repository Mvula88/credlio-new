-- Phone-country cross-check on borrowers
--
-- WHY: the IP geolocation at signup is the foundation of country isolation,
-- but a borrower on a VPN can spoof their IP. Their PHONE number — the
-- E.164 prefix — is a second independent signal. A Namibian phone starts
-- +264; a SA phone starts +27. If a borrower's account country is NA but
-- their phone is +27, that's a yellow flag worth admin review and worth
-- showing the lender before they engage.
--
-- This migration adds:
--   - A SQL function country_from_e164(phone) that maps the E.164 prefix
--     to an ISO-2 country code. Africa-complete, plus a few global codes.
--   - Two columns on `borrowers`: `phone_country_code` (parsed) and
--     `phone_country_mismatch` (boolean).
--   - A trigger that populates both on every phone_e164 insert/update.
--   - A backfill for existing rows.

BEGIN;

-- 1. Mapping function. Longest-match by stripping the leading '+' and
-- comparing prefixes. Returns NULL for unknown codes so the trigger can
-- avoid false-flagging numbers from countries we don't have in the table.
CREATE OR REPLACE FUNCTION public.country_from_e164(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits TEXT;
BEGIN
  IF p_phone IS NULL THEN RETURN NULL; END IF;

  -- Strip leading '+', spaces, dashes; keep digits only.
  v_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF v_digits = '' THEN RETURN NULL; END IF;

  -- 3-digit prefixes first (most specific), then 2-digit, then 1-digit.
  -- Africa-complete; common global codes for diaspora signups.
  RETURN CASE
    -- Africa, 3-digit
    WHEN v_digits LIKE '211%' THEN 'SS'  -- South Sudan
    WHEN v_digits LIKE '212%' THEN 'MA'  -- Morocco
    WHEN v_digits LIKE '213%' THEN 'DZ'  -- Algeria
    WHEN v_digits LIKE '216%' THEN 'TN'  -- Tunisia
    WHEN v_digits LIKE '218%' THEN 'LY'  -- Libya
    WHEN v_digits LIKE '220%' THEN 'GM'  -- Gambia
    WHEN v_digits LIKE '221%' THEN 'SN'  -- Senegal
    WHEN v_digits LIKE '222%' THEN 'MR'  -- Mauritania
    WHEN v_digits LIKE '223%' THEN 'ML'  -- Mali
    WHEN v_digits LIKE '224%' THEN 'GN'  -- Guinea
    WHEN v_digits LIKE '225%' THEN 'CI'  -- Côte d'Ivoire
    WHEN v_digits LIKE '226%' THEN 'BF'  -- Burkina Faso
    WHEN v_digits LIKE '227%' THEN 'NE'  -- Niger
    WHEN v_digits LIKE '228%' THEN 'TG'  -- Togo
    WHEN v_digits LIKE '229%' THEN 'BJ'  -- Benin
    WHEN v_digits LIKE '230%' THEN 'MU'  -- Mauritius
    WHEN v_digits LIKE '231%' THEN 'LR'  -- Liberia
    WHEN v_digits LIKE '232%' THEN 'SL'  -- Sierra Leone
    WHEN v_digits LIKE '233%' THEN 'GH'  -- Ghana
    WHEN v_digits LIKE '234%' THEN 'NG'  -- Nigeria
    WHEN v_digits LIKE '235%' THEN 'TD'  -- Chad
    WHEN v_digits LIKE '236%' THEN 'CF'  -- Central African Republic
    WHEN v_digits LIKE '237%' THEN 'CM'  -- Cameroon
    WHEN v_digits LIKE '238%' THEN 'CV'  -- Cape Verde
    WHEN v_digits LIKE '239%' THEN 'ST'  -- São Tomé and Príncipe
    WHEN v_digits LIKE '240%' THEN 'GQ'  -- Equatorial Guinea
    WHEN v_digits LIKE '241%' THEN 'GA'  -- Gabon
    WHEN v_digits LIKE '242%' THEN 'CG'  -- Congo
    WHEN v_digits LIKE '243%' THEN 'CD'  -- DR Congo
    WHEN v_digits LIKE '244%' THEN 'AO'  -- Angola
    WHEN v_digits LIKE '245%' THEN 'GW'  -- Guinea-Bissau
    WHEN v_digits LIKE '248%' THEN 'SC'  -- Seychelles
    WHEN v_digits LIKE '249%' THEN 'SD'  -- Sudan
    WHEN v_digits LIKE '250%' THEN 'RW'  -- Rwanda
    WHEN v_digits LIKE '251%' THEN 'ET'  -- Ethiopia
    WHEN v_digits LIKE '252%' THEN 'SO'  -- Somalia
    WHEN v_digits LIKE '253%' THEN 'DJ'  -- Djibouti
    WHEN v_digits LIKE '254%' THEN 'KE'  -- Kenya
    WHEN v_digits LIKE '255%' THEN 'TZ'  -- Tanzania
    WHEN v_digits LIKE '256%' THEN 'UG'  -- Uganda
    WHEN v_digits LIKE '257%' THEN 'BI'  -- Burundi
    WHEN v_digits LIKE '258%' THEN 'MZ'  -- Mozambique
    WHEN v_digits LIKE '260%' THEN 'ZM'  -- Zambia
    WHEN v_digits LIKE '261%' THEN 'MG'  -- Madagascar
    WHEN v_digits LIKE '263%' THEN 'ZW'  -- Zimbabwe
    WHEN v_digits LIKE '264%' THEN 'NA'  -- Namibia
    WHEN v_digits LIKE '265%' THEN 'MW'  -- Malawi
    WHEN v_digits LIKE '266%' THEN 'LS'  -- Lesotho
    WHEN v_digits LIKE '267%' THEN 'BW'  -- Botswana
    WHEN v_digits LIKE '268%' THEN 'SZ'  -- Eswatini
    WHEN v_digits LIKE '269%' THEN 'KM'  -- Comoros
    WHEN v_digits LIKE '291%' THEN 'ER'  -- Eritrea
    -- 2-digit Africa
    WHEN v_digits LIKE '20%' THEN 'EG'   -- Egypt
    WHEN v_digits LIKE '27%' THEN 'ZA'   -- South Africa
    -- A few global ones (diaspora signups)
    WHEN v_digits LIKE '44%' THEN 'GB'   -- UK
    WHEN v_digits LIKE '49%' THEN 'DE'   -- Germany
    WHEN v_digits LIKE '33%' THEN 'FR'   -- France
    WHEN v_digits LIKE '91%' THEN 'IN'   -- India
    WHEN v_digits LIKE '86%' THEN 'CN'   -- China
    WHEN v_digits LIKE '61%' THEN 'AU'   -- Australia
    -- 1-digit very last (US/Canada share +1)
    WHEN v_digits LIKE '1%' THEN 'US'
    ELSE NULL
  END;
END;
$$;

COMMENT ON FUNCTION public.country_from_e164 IS
  'Maps an E.164 phone number to its ISO-2 country code. Africa-complete; returns NULL for prefixes we do not recognize so the mismatch trigger never false-flags an unrecognized country.';

-- 2. New columns on borrowers.
ALTER TABLE public.borrowers
  ADD COLUMN IF NOT EXISTS phone_country_code TEXT,
  ADD COLUMN IF NOT EXISTS phone_country_mismatch BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_borrowers_phone_country_mismatch
  ON public.borrowers(phone_country_mismatch)
  WHERE phone_country_mismatch = TRUE;

COMMENT ON COLUMN public.borrowers.phone_country_code IS
  'ISO-2 country code parsed from phone_e164 via country_from_e164(). Set automatically by the borrower_phone_country_check trigger.';
COMMENT ON COLUMN public.borrowers.phone_country_mismatch IS
  'TRUE when phone_country_code != country_code (and both are non-null). Indicates the phone number is registered to a country different from the borrower account country — a yellow flag for VPN-spoofed signups.';

-- 3. Trigger that keeps both fields in sync with phone_e164.
CREATE OR REPLACE FUNCTION public.borrower_phone_country_check()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_phone_country TEXT;
BEGIN
  v_phone_country := public.country_from_e164(NEW.phone_e164);

  NEW.phone_country_code := v_phone_country;

  -- Only flag mismatch when we recognise the phone country. Unknown phone
  -- codes don't false-flag (e.g. a Mauritian number in 2030 we haven't
  -- added yet shouldn't auto-fail Namibian borrowers).
  NEW.phone_country_mismatch := (
    v_phone_country IS NOT NULL
    AND NEW.country_code IS NOT NULL
    AND v_phone_country <> NEW.country_code
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS borrowers_phone_country_check_trg ON public.borrowers;
CREATE TRIGGER borrowers_phone_country_check_trg
  BEFORE INSERT OR UPDATE OF phone_e164, country_code ON public.borrowers
  FOR EACH ROW
  EXECUTE FUNCTION public.borrower_phone_country_check();

-- 4. Backfill existing rows. Forces the trigger to fire on every existing
-- borrower so phone_country_code and phone_country_mismatch are populated
-- without us re-reading every phone number ourselves.
UPDATE public.borrowers SET phone_e164 = phone_e164 WHERE phone_e164 IS NOT NULL;

COMMIT;
