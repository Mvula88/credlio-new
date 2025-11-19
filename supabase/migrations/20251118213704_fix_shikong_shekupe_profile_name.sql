-- Fix profile and borrower name from "Mvula Ismael" to "Shikong Shekupe"
-- This user has multiple roles (admin, borrower, lender) - only updating the name

-- Update the profile name
UPDATE public.profiles
SET full_name = 'Shikong Shekupe'
WHERE user_id = 'd122d015-70d3-42db-8a69-87554ad1e33a';

-- Update the borrower record name
UPDATE public.borrowers
SET full_name = 'Shikong Shekupe'
WHERE id = '06a9e365-6432-40f9-a9a3-b2f77a4301a5';
