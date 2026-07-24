-- Paylaşılan auth hesabı silinince tüm uygulama verilerinin temizlenmesi için
-- borc_* ve hediye_* tablolarındaki user_id FK'larını CASCADE'e çevir.
-- (brkt_data, bd_*, user_data zaten CASCADE idi.)
alter table public.borc_ayarlar drop constraint borc_ayarlar_user_id_fkey,
  add constraint borc_ayarlar_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.borc_people drop constraint borc_people_user_id_fkey,
  add constraint borc_people_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.borc_debts drop constraint borc_debts_user_id_fkey,
  add constraint borc_debts_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.borc_payments drop constraint borc_payments_user_id_fkey,
  add constraint borc_payments_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.hediye_persons drop constraint hediye_persons_user_id_fkey,
  add constraint hediye_persons_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.hediye_records drop constraint hediye_records_user_id_fkey,
  add constraint hediye_records_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
-- hediye_records -> hediye_persons person_id FK'sini de CASCADE yap
alter table public.hediye_records drop constraint hediye_records_person_id_fkey,
  add constraint hediye_records_person_id_fkey foreign key (person_id) references public.hediye_persons(id) on delete cascade;
