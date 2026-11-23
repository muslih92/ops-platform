-- Keep the organisation name generic until it is officially approved.
-- Clears only the old default; a name an admin typed in Settings is left as is.
select set_config('app.reason', 'إزالة اسم الجهة الافتراضي حتى اعتماده', true);
update system_settings set value = '""'::jsonb, updated_at = now()
 where key = 'org_name' and value = '"إدارة تشغيل أنظمة نقل المياه"'::jsonb;
