alter table public.company_members
  add column avatar_data text,
  add column avatar_icon text,
  add constraint company_members_avatar_icon_check
    check (avatar_icon is null or avatar_icon in ('user','tool','wrench','case','star','office')),
  add constraint company_members_avatar_data_check
    check (avatar_data is null or (length(avatar_data) <= 300000 and avatar_data ~ '^data:image/(webp|jpeg);base64,[A-Za-z0-9+/=]+$'));
