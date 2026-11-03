ALTER TABLE public.company_integrations
  DROP CONSTRAINT company_integrations_kind_check;

ALTER TABLE public.company_integrations
  ADD CONSTRAINT company_integrations_kind_check
  CHECK (kind IN ('telegram', 'email', 'whatsapp'));