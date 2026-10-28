-- Thanh toán chuyển khoản vào tài khoản cá nhân (SePay): lưu nội dung chuyển khoản và mã giao dịch ngân hàng.
alter table public.payments add column if not exists transfer_content text;
alter table public.payments add column if not exists bank_ref text;
create unique index if not exists payments_bank_ref_idx on public.payments (bank_ref) where bank_ref is not null;
