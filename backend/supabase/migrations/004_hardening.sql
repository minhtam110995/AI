-- Siết quyền theo cảnh báo bảo mật của Supabase (advisors)
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.admin_guard() from public, anon, authenticated;
alter function public.device_limit(text) set search_path = public;
