-- schema.sql — ตารางฐานข้อมูลสำหรับระบบจัดตารางสอนอัตโนมัติ
-- วิธีใช้: Supabase Dashboard > SQL Editor > New query > วางทั้งไฟล์ > Run

create extension if not exists pgcrypto;

-- ชุดข้อมูลที่ยืนยันการนำเข้าแล้ว (ครู ห้อง วิชา กลุ่มเรียน การมอบหมายสอน)
create table if not exists public.datasets (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  sources     jsonb not null default '[]'::jsonb,   -- รายชื่อไฟล์ที่นำเข้า
  counts      jsonb,                                -- จำนวนรายการแต่ละตาราง
  payload     jsonb not null,                       -- ข้อมูลที่ผ่านการตรวจแล้ว
  created_at  timestamptz not null default now()
);

-- รอบรันการจัดตาราง
create table if not exists public.runs (
  id            uuid primary key default gen_random_uuid(),
  dataset_id    uuid references public.datasets(id) on delete set null,
  status        text not null check (status in ('running', 'completed', 'cancelled', 'failed')),
  confirmed     boolean not null default false,
  confirmed_at  timestamptz,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  duration_ms   integer,
  settings      jsonb,
  stats         jsonb,      -- สรุปจำนวนคาบ คาบชน อัตราการใช้ห้อง ฯลฯ
  result        jsonb,      -- รายการคาบที่จัดได้และที่จัดไม่ได้
  error         text,
  sources       jsonb not null default '[]'::jsonb,
  counts        jsonb
);

create index if not exists runs_started_at_idx on public.runs (started_at desc);
create index if not exists runs_dataset_idx on public.runs (dataset_id);

-- Row Level Security
-- นโยบายด้านล่างอนุญาตให้ทุกคนที่มีลิงก์เว็บ อ่าน/เพิ่ม/แก้ไขข้อมูลได้ (เหมาะกับการสาธิตและการใช้งานภายใน)
-- ถ้าต้องการจำกัดเฉพาะผู้ใช้ที่ล็อกอิน ให้เปลี่ยน "to anon, authenticated" เป็น "to authenticated"
alter table public.datasets enable row level security;
alter table public.runs enable row level security;

drop policy if exists "datasets read" on public.datasets;
drop policy if exists "datasets insert" on public.datasets;
drop policy if exists "datasets update" on public.datasets;
create policy "datasets read"   on public.datasets for select to anon, authenticated using (true);
create policy "datasets insert" on public.datasets for insert to anon, authenticated with check (true);
create policy "datasets update" on public.datasets for update to anon, authenticated using (true) with check (true);

drop policy if exists "runs read" on public.runs;
drop policy if exists "runs insert" on public.runs;
drop policy if exists "runs update" on public.runs;
create policy "runs read"   on public.runs for select to anon, authenticated using (true);
create policy "runs insert" on public.runs for insert to anon, authenticated with check (true);
create policy "runs update" on public.runs for update to anon, authenticated using (true) with check (true);

-- ไม่เปิดสิทธิ์ลบผ่านเว็บ เพื่อเก็บประวัติรอบรันไว้เป็นหลักฐาน
grant select, insert, update on public.datasets to anon, authenticated;
grant select, insert, update on public.runs to anon, authenticated;
