ALTER TABLE public.notice_fields
  ADD COLUMN channel text NOT NULL DEFAULT 'phone'
  CONSTRAINT notice_fields_channel_check CHECK (channel IN ('phone','landing'));

DROP INDEX IF EXISTS public.notice_fields_company_global_key_idx;
DROP INDEX IF EXISTS public.notice_fields_landing_key_idx;

INSERT INTO public.notice_fields (
  company_id, landing_id, field_key, label, field_type, options,
  required, visible_in_form, visible_in_table, position, channel
)
SELECT
  company_id, landing_id, field_key, label, field_type, options,
  required, visible_in_form, visible_in_table, position, 'landing'
FROM public.notice_fields
WHERE channel = 'phone';

CREATE UNIQUE INDEX notice_fields_company_global_key_idx
  ON public.notice_fields (company_id, channel, field_key)
  WHERE landing_id IS NULL;

CREATE UNIQUE INDEX notice_fields_landing_key_idx
  ON public.notice_fields (landing_id, channel, field_key)
  WHERE landing_id IS NOT NULL;