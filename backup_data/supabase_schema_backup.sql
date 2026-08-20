-- ==========================================
-- 0. تفعيل ملحقات الجدول الزمني والشبكة في PostgreSQL (مطلوبة للـ Cron)
-- ==========================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ==========================================
-- 1. جدول حفظ التقارير اليومية والتاريخية للمشاريع
-- ==========================================
CREATE TABLE IF NOT EXISTS public.project_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INT NOT NULL,
  project_name TEXT NOT NULL,
  map_url TEXT,
  total_length_meters NUMERIC NOT NULL,
  total_length_km NUMERIC NOT NULL,
  total_features_count INT NOT NULL,
  color_breakdown JSONB NOT NULL,
  items JSONB NOT NULL,
  parsed_at TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_reports_proj_id ON public.project_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_project_reports_created_at ON public.project_reports(created_at DESC);

-- ==========================================
-- 1b. جدول أرشفة التقارير القديمة للمشاريع
-- ==========================================
CREATE TABLE IF NOT EXISTS public.archived_project_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_report_id UUID,
  project_id INT NOT NULL,
  project_name TEXT NOT NULL,
  map_url TEXT,
  total_length_meters NUMERIC NOT NULL,
  total_length_km NUMERIC NOT NULL,
  total_features_count INT NOT NULL,
  color_breakdown JSONB NOT NULL,
  items JSONB NOT NULL,
  parsed_at TEXT NOT NULL,
  original_created_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archived_reports_proj_id ON public.archived_project_reports(project_id);

-- ==========================================
-- 2. جدول سجل التغيرات والمقارنة التاريخية (Changelog)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.project_changelogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INT NOT NULL,
  project_name TEXT NOT NULL,
  report_id UUID REFERENCES public.project_reports(id) ON DELETE CASCADE,
  previous_report_id UUID REFERENCES public.project_reports(id) ON DELETE SET NULL,
  diff JSONB NOT NULL,
  is_viewed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_changelogs_proj_id ON public.project_changelogs(project_id);

-- ==========================================
-- 3. جدول الإشعارات والتنبيهات العامة لجميع المستخدمين
-- ==========================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  project_id INT,
  project_name TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  region TEXT,
  scope TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_proj_id ON public.notifications(project_id);

-- ==========================================
-- 5. جدول بيانات الداشبورد والمؤشرات المحسوبة لكل مشروع (dashboard_project_metrics)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.dashboard_project_metrics (
  project_id INT PRIMARY KEY,
  project_name TEXT NOT NULL,
  total_length_meters NUMERIC NOT NULL DEFAULT 0,
  total_length_km NUMERIC NOT NULL DEFAULT 0,
  executed_water_meters NUMERIC NOT NULL DEFAULT 0,
  executed_sewage_meters NUMERIC NOT NULL DEFAULT 0,
  ongoing_meters NUMERIC NOT NULL DEFAULT 0,
  remaining_meters NUMERIC NOT NULL DEFAULT 0,
  cancelled_meters NUMERIC NOT NULL DEFAULT 0,
  permits_count INT NOT NULL DEFAULT 0,
  unique_segments_count INT NOT NULL DEFAULT 0,
  total_segments_count INT NOT NULL DEFAULT 0,
  permits_list JSONB DEFAULT '[]'::jsonb,
  segments_list JSONB DEFAULT '[]'::jsonb,
  yellow_no_permit_count INT NOT NULL DEFAULT 0,
  yellow_no_permit_meters NUMERIC NOT NULL DEFAULT 0,
  yellow_no_permit_km NUMERIC NOT NULL DEFAULT 0,
  yellow_no_permit_segments JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- تحديث وإضافة الأعمدة في حال كان الجدول منشأ مسبقاً
ALTER TABLE public.dashboard_project_metrics 
  ADD COLUMN IF NOT EXISTS yellow_no_permit_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yellow_no_permit_meters NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yellow_no_permit_km NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yellow_no_permit_segments JSONB DEFAULT '[]'::jsonb;

-- ==========================================
-- 6. تفعيل سياسات الأمان Row Level Security (RLS)
-- ==========================================
ALTER TABLE public.project_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archived_project_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_changelogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_project_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access for all authenticated users" ON public.project_reports;
DROP POLICY IF EXISTS "Allow insert access for all authenticated users" ON public.project_reports;
DROP POLICY IF EXISTS "Allow read access for all users" ON public.project_reports;
DROP POLICY IF EXISTS "Allow insert access for all users" ON public.project_reports;

CREATE POLICY "Allow read access for all users" 
ON public.project_reports FOR SELECT USING (true);

CREATE POLICY "Allow insert access for all users" 
ON public.project_reports FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access for archived reports" ON public.archived_project_reports;
DROP POLICY IF EXISTS "Allow insert access for archived reports" ON public.archived_project_reports;

CREATE POLICY "Allow read access for archived reports" 
ON public.archived_project_reports FOR SELECT USING (true);

CREATE POLICY "Allow insert access for archived reports" 
ON public.archived_project_reports FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access for changelogs" ON public.project_changelogs;
DROP POLICY IF EXISTS "Allow insert access for changelogs" ON public.project_changelogs;

CREATE POLICY "Allow read access for changelogs" 
ON public.project_changelogs FOR SELECT USING (true);

CREATE POLICY "Allow insert access for changelogs" 
ON public.project_changelogs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access for notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow insert access for notifications" ON public.notifications;

CREATE POLICY "Allow read access for notifications" 
ON public.notifications FOR SELECT USING (true);

CREATE POLICY "Allow insert access for notifications" 
ON public.notifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access for dashboard metrics" ON public.dashboard_project_metrics;
CREATE POLICY "Allow all access for dashboard metrics" 
ON public.dashboard_project_metrics FOR ALL USING (true);
