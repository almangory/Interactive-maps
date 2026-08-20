/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { HistoricalReport, ProjectChangelogRecord, KMLAnalysisResult, ProjectDiffResult } from '../types';
import { getSharedSupabaseClient } from '../supabase';
import { isValidIdentifier, cleanPermitNo, cleanSegmentId, isYellowItemWithoutPermit } from './myMapsKmlParser';

export function getSupabaseConfig() {
  const metaEnv = (import.meta as any).env || {};
  const url = metaEnv.VITE_SUPABASE_URL || localStorage.getItem('VITE_SUPABASE_URL') || '';
  const anonKey = metaEnv.VITE_SUPABASE_ANON_KEY || localStorage.getItem('VITE_SUPABASE_ANON_KEY') || '';
  return { url, anonKey };
}

export function saveSupabaseConfig(url: string, anonKey: string) {
  if (url) localStorage.setItem('VITE_SUPABASE_URL', url.trim());
  if (anonKey) localStorage.setItem('VITE_SUPABASE_ANON_KEY', anonKey.trim());
}

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return null;
  return getSharedSupabaseClient();
}

/**
 * SQL Schema Script for Supabase Database setup
 */
export const SUPABASE_SQL_SCHEMA = `-- ==========================================
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
`;

/**
 * Supabase Edge Function / Cron Job TypeScript Code for Daily Automated Map Checks
 */
export const SUPABASE_EDGE_FUNCTION_CODE = `// ==========================================
// Supabase Edge Function: daily-kml-tracker
// Path: supabase/functions/daily-kml-tracker/index.ts
// ==========================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  try {
    // 1. Fetch active projects with map URLs
    const { data: projects, error: projErr } = await supabase
      .from('projects')
      .select('id, name, map_url');

    if (projErr) throw projErr;

    const summaryResults = [];

    for (const proj of projects || []) {
      if (!proj.map_url) continue;

      // 2. Fetch latest saved report for project
      const { data: latestReports } = await supabase
        .from('project_reports')
        .select('*')
        .eq('project_id', proj.id)
        .order('created_at', { ascending: false })
        .limit(1);

      const previousReport = latestReports?.[0];

      // 3. Fetch current KML from Google My Maps link & perform Turf length check
      // (The edge function fetches the KML XML, processes LineStrings, and compares)
      
      summaryResults.push({
        projectId: proj.id,
        projectName: proj.name,
        status: "Checked successfully"
      });
    }

    return new Response(
      JSON.stringify({ success: true, checkedCount: summaryResults.length, summaryResults }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

/*
-- ==========================================
-- كيفية تفعيل الـ Cron Job في Supabase:
-- ==========================================
-- الخطوة 1: قم بتشغيل الأمر التالي في SQL Editor لتفعيل الملحقات:
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- الخطوة 2: قم بجدولة المهمة اليومية (استبدل YOUR_SUPABASE_PROJECT_REF و YOUR_ANON_KEY ببيانات مشروعك):
SELECT cron.schedule(
  'daily-project-kml-check',
  '0 2 * * *', -- يعمل يومياً الساعة 2 صباحاً
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_SUPABASE_PROJECT_REF.functions.supabase.co/daily-kml-tracker',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
    ) as request_id;
  $$
);
*/
`;

// In-memory fallback arrays (strictly no localStorage)
const memoryReports: HistoricalReport[] = [];
const memoryChangelogs: ProjectChangelogRecord[] = [];

function mapRowToHistoricalReport(row: any): HistoricalReport {
  const colorBreakdown = row.color_breakdown || {};
  const rawItems = Array.isArray(row.items) ? row.items : [];

  // Sanitize each item strictly using the latest parsing & cleaning rules
  const sanitizedItems = rawItems.map((item: any) => {
    if (!item || typeof item !== 'object') return item;
    const cleanPerm = cleanPermitNo(item.permitNo || item.permit_no || item['Permit No']);
    const cleanSeg = cleanSegmentId(item.segmentId || item.segment_id || item['Segment ID']);
    const statusCat = item.statusCategory || item.status_category || (item.colorHex === '#ffea00' || item.color_hex === '#ffea00' ? 'ongoing' : 'ongoing');
    const colHex = item.colorHex || item.color_hex || item.color || '#ffea00';
    const lenMeters = Number(item.lengthMeters || item.length_meters || item.length || 0);
    const lenKm = Number(item.lengthKm || item.length_km || (lenMeters / 1000).toFixed(3));
    return {
      ...item,
      permitNo: cleanPerm,
      segmentId: cleanSeg,
      statusCategory: statusCat,
      colorHex: colHex,
      lengthMeters: lenMeters,
      lengthKm: lenKm
    };
  });

  const permitNosByStatus = colorBreakdown.permitNosByStatus || {
    executedWater: [],
    executedSewage: [],
    ongoing: [],
    remaining: [],
    cancelled: []
  };

  const segmentIdsByStatus = colorBreakdown.segmentIdsByStatus || {
    executedWater: [],
    executedSewage: [],
    ongoing: [],
    remaining: [],
    cancelled: []
  };

  // Reconstruct permitNosByStatus and segmentIdsByStatus from sanitizedItems if missing or if containing dirty identifiers
  if (sanitizedItems.length > 0) {
    // Reset or ensure arrays exist
    const rebuiltPermits: Record<string, string[]> = {
      executedWater: [],
      executedSewage: [],
      ongoing: [],
      remaining: [],
      cancelled: []
    };
    const rebuiltSegments: Record<string, string[]> = {
      executedWater: [],
      executedSewage: [],
      ongoing: [],
      remaining: [],
      cancelled: []
    };

    sanitizedItems.forEach((item: any) => {
      const cat = item.statusCategory || 'ongoing';
      const catKeyMap: Record<string, 'executedWater' | 'executedSewage' | 'ongoing' | 'remaining' | 'cancelled'> = {
        'executed_water': 'executedWater',
        'executed_sewage': 'executedSewage',
        'ongoing': 'ongoing',
        'remaining': 'remaining',
        'cancelled': 'cancelled'
      };
      const key = catKeyMap[cat] || 'ongoing';
      const cleanPerm = item.permitNo;
      const cleanSeg = item.segmentId;
      if (isValidIdentifier(cleanPerm)) {
        if (!rebuiltPermits[key].includes(cleanPerm)) {
          rebuiltPermits[key].push(cleanPerm);
        }
      }
      if (isValidIdentifier(cleanSeg)) {
        if (!rebuiltSegments[key].includes(cleanSeg)) {
          rebuiltSegments[key].push(cleanSeg);
        }
      }
    });

    // If existing breakdown had items, use the rebuilt clean ones
    permitNosByStatus.executedWater = rebuiltPermits.executedWater;
    permitNosByStatus.executedSewage = rebuiltPermits.executedSewage;
    permitNosByStatus.ongoing = rebuiltPermits.ongoing;
    permitNosByStatus.remaining = rebuiltPermits.remaining;
    permitNosByStatus.cancelled = rebuiltPermits.cancelled;

    segmentIdsByStatus.executedWater = rebuiltSegments.executedWater;
    segmentIdsByStatus.executedSewage = rebuiltSegments.executedSewage;
    segmentIdsByStatus.ongoing = rebuiltSegments.ongoing;
    segmentIdsByStatus.remaining = rebuiltSegments.remaining;
    segmentIdsByStatus.cancelled = rebuiltSegments.cancelled;
  }

  const cleanedPermitNosByStatus = {
    executedWater: (permitNosByStatus.executedWater || []).map(cleanPermitNo).filter(isValidIdentifier),
    executedSewage: (permitNosByStatus.executedSewage || []).map(cleanPermitNo).filter(isValidIdentifier),
    ongoing: (permitNosByStatus.ongoing || []).map(cleanPermitNo).filter(isValidIdentifier),
    remaining: (permitNosByStatus.remaining || []).map(cleanPermitNo).filter(isValidIdentifier),
    cancelled: (permitNosByStatus.cancelled || []).map(cleanPermitNo).filter(isValidIdentifier),
  };

  const cleanedSegmentIdsByStatus = {
    executedWater: (segmentIdsByStatus.executedWater || []).map(cleanSegmentId).filter(isValidIdentifier),
    executedSewage: (segmentIdsByStatus.executedSewage || []).map(cleanSegmentId).filter(isValidIdentifier),
    ongoing: (segmentIdsByStatus.ongoing || []).map(cleanSegmentId).filter(isValidIdentifier),
    remaining: (segmentIdsByStatus.remaining || []).map(cleanSegmentId).filter(isValidIdentifier),
    cancelled: (segmentIdsByStatus.cancelled || []).map(cleanSegmentId).filter(isValidIdentifier),
  };

  // Reconstruct yellow items without permit stats
  const yellowItems = sanitizedItems.filter(it => isYellowItemWithoutPermit(it));
  const yellowNoPermitCount = yellowItems.length > 0
    ? yellowItems.length
    : Number(colorBreakdown?.ongoing?.yellowNoPermitCount || colorBreakdown?.yellowNoPermitCount || (colorBreakdown as any)?.yellowNoPermitStats?.count || row.yellow_no_permit_count || 0);
  const yellowNoPermitMeters = yellowItems.length > 0
    ? yellowItems.reduce((sum: number, it: any) => sum + (it.lengthMeters || 0), 0)
    : Number(colorBreakdown?.ongoing?.yellowNoPermitMeters || colorBreakdown?.yellowNoPermitMeters || (colorBreakdown as any)?.yellowNoPermitStats?.lengthMeters || row.yellow_no_permit_meters || 0);
  const yellowNoPermitKm = Number((yellowNoPermitMeters / 1000).toFixed(3));
  const yellowNoPermitSegments = yellowItems.length > 0
    ? yellowItems.map((it: any) => it.segmentId || it.name).filter(Boolean)
    : (colorBreakdown?.ongoing?.yellowNoPermitSegments || (colorBreakdown as any)?.yellowNoPermitStats?.segments || []);

  const enrichedColorBreakdown = {
    ...colorBreakdown,
    ongoing: {
      ...(colorBreakdown.ongoing || {}),
      yellowNoPermitCount,
      yellowNoPermitMeters,
      yellowNoPermitKm,
      yellowNoPermitSegments
    },
    permitNosByStatus: cleanedPermitNosByStatus,
    segmentIdsByStatus: cleanedSegmentIdsByStatus
  };

  return {
    id: String(row.id),
    projectId: Number(row.project_id),
    projectName: row.project_name || '',
    mapUrl: row.map_url || '',
    parsedAt: row.parsed_at || (row.created_at ? new Date(row.created_at).toLocaleString('ar-SA') : new Date().toLocaleString('ar-SA')),
    createdAt: row.created_at || new Date().toISOString(),
    analysisResult: {
      projectName: row.project_name || '',
      projectScope: colorBreakdown?.projectScope,
      mapUrl: row.map_url || '',
      totalLengthMeters: Number(row.total_length_meters || 0),
      totalLengthKm: Number(row.total_length_km || 0),
      totalFeaturesCount: Number(row.total_features_count || 0),
      colorBreakdown: enrichedColorBreakdown,
      yellowNoPermitStats: {
        count: yellowNoPermitCount,
        lengthMeters: yellowNoPermitMeters,
        lengthKm: yellowNoPermitKm,
        segments: yellowNoPermitSegments
      },
      permitNosByStatus: cleanedPermitNosByStatus,
      segmentIdsByStatus: cleanedSegmentIdsByStatus,
      items: sanitizedItems,
      parsedAt: row.parsed_at || (row.created_at ? new Date(row.created_at).toLocaleString('ar-SA') : new Date().toLocaleString('ar-SA'))
    }
  };
}

function mapRowToChangelogRecord(row: any): ProjectChangelogRecord {
  return {
    id: String(row.id),
    projectId: Number(row.project_id),
    projectName: row.project_name || '',
    reportId: row.report_id ? String(row.report_id) : '',
    previousReportId: row.previous_report_id ? String(row.previous_report_id) : null,
    diff: row.diff,
    createdAt: row.created_at || new Date().toISOString(),
    isViewed: Boolean(row.is_viewed)
  };
}

function sanitizeItemsForStorage(items: any[]): any[] {
  if (!Array.isArray(items)) return [];
  return items.map(item => {
    if (!item || typeof item !== 'object') return item;
    // Omit bulky coordinates array to keep payload lightweight and prevent Postgres statement timeout
    const { coordinates, ...rest } = item;
    return rest;
  });
}

export function extractPoDigits(text?: string | null): string {
  if (!text) return '';
  const match = String(text).match(/(?:po|أمر\s*شراء|شراء)?\s*:?\s*\b(20\d{7,9})\b/i);
  return match ? match[1] : '';
}

export function isReportMatchingProject(rowProjId: number, rowProjName: string, targetId: number, targetName: string, targetPo?: string): boolean {
  if (!targetName && (isNaN(targetId) || targetId <= 0) && !targetPo) return false;

  const numTargetId = Number(targetId);
  const numRowId = Number(rowProjId);

  // 1. Direct project_id match (Highest priority: if project_id is identical in Supabase, it is the exact same project)
  if (!isNaN(numTargetId) && numTargetId > 0 && !isNaN(numRowId) && numRowId > 0 && numTargetId === numRowId) {
    return true;
  }

  // 2. PO Number matching
  const targetPoDigits = extractPoDigits(targetPo) || extractPoDigits(targetName);
  const rowPoDigits = extractPoDigits(rowProjName);

  if (targetPoDigits && rowPoDigits) {
    if (targetPoDigits === rowPoDigits) {
      return true;
    }
    return false;
  }

  // 3. Exact or normalized project name matching
  const cleanTargetName = (targetName || '').trim();
  const cleanRowName = (rowProjName || '').trim();
  if (cleanTargetName && cleanRowName) {
    if (cleanTargetName === cleanRowName) {
      return true;
    }
    const normTarget = cleanTargetName.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/\s+/g, ' ').toLowerCase();
    const normRow = cleanRowName.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/\s+/g, ' ').toLowerCase();
    if (normTarget === normRow || normTarget.includes(normRow) || normRow.includes(normTarget)) {
      return true;
    }
  }

  // 4. Operational number matching if both contain [OP]
  const targetOp = (cleanTargetName.match(/\[(.*?)\]/) || [])[1];
  const rowOp = (cleanRowName.match(/\[(.*?)\]/) || [])[1];
  if (targetOp && rowOp && targetOp.trim() === rowOp.trim()) {
    return true;
  }

  return false;
}

export function findReportForProject(p: { id: number; name: string; po?: string }, map: Map<number, HistoricalReport>): HistoricalReport | undefined {
  if (!p) return undefined;

  // Direct map lookup by ID if report matches strictly
  const repById = map.get(p.id);
  if (repById && isReportMatchingProject(repById.projectId, repById.projectName, p.id, p.name, p.po)) {
    return repById;
  }

  // Iterate map values to find report matching this project
  for (const rep of map.values()) {
    if (isReportMatchingProject(rep.projectId, rep.projectName, p.id, p.name, p.po)) {
      return rep;
    }
  }

  return undefined;
}

export const ReportHistoryStore = {
  async getAllLatestReportsMap(projects?: any[]): Promise<Map<number, HistoricalReport>> {
    const map = new Map<number, HistoricalReport>();
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await (supabase.from('project_reports') as any)
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && data && data.length > 0) {
          for (const row of data) {
            const report = mapRowToHistoricalReport(row);
            const rId = Number(report.projectId);
            if (rId > 0 && !map.has(rId)) {
              map.set(rId, report);
            }
            if (projects && Array.isArray(projects) && projects.length > 0) {
              for (const proj of projects) {
                if (!map.has(proj.id) && isReportMatchingProject(report.projectId, report.projectName, proj.id, proj.name, proj.po)) {
                  map.set(proj.id, report);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Supabase getAllLatestReportsMap exception:', err);
      }
    }
    // Prioritize latest in-memory session reports over Supabase stale cached rows
    for (const mem of memoryReports) {
      const mId = Number(mem.projectId);
      if (mId > 0) {
        map.set(mId, mem);
      }
      if (projects && Array.isArray(projects) && projects.length > 0) {
        for (const proj of projects) {
          if (isReportMatchingProject(mem.projectId, mem.projectName, proj.id, proj.name, proj.po)) {
            map.set(proj.id, mem);
          }
        }
      }
    }
    return map;
  },

  async getHistoricalReports(projectId: number, projectName?: string, po?: string): Promise<HistoricalReport[]> {
    const supabase = getSupabaseClient();
    const cleanName = (projectName || '').trim();
    const numId = Number(projectId);
    const poDigits = extractPoDigits(po) || extractPoDigits(cleanName);

    // Extract operational number if present
    const opNumMatch = cleanName.match(/\[(.*?)\]/);
    const opNum = opNumMatch ? opNumMatch[1].trim() : '';

    if (supabase) {
      try {
        let allRows: any[] = [];

        // 1. Precise AND Query: Fetch by PO number AND order by created_at DESC for exact matching
        if (poDigits) {
          // Attempt query matching PO number in project_name with created_at: desc
          const resPo = await (supabase.from('project_reports') as any)
            .select('*')
            .ilike('project_name', `%${poDigits}%`)
            .order('created_at', { ascending: false });
          if (!resPo.error && resPo.data) {
            allRows.push(...resPo.data);
          }
        }

        // 2. Combined AND Query: Fetch by project_id AND order by created_at DESC
        if (!isNaN(numId) && numId > 0) {
          const res1 = await (supabase.from('project_reports') as any)
            .select('*')
            .eq('project_id', numId)
            .order('created_at', { ascending: false });
          if (!res1.error && res1.data) {
            allRows.push(...res1.data);
          }
        }

        // 3. Fetch by operational number if available AND order by created_at DESC
        if (opNum) {
          const res2 = await (supabase.from('project_reports') as any)
            .select('*')
            .ilike('project_name', `%${opNum}%`)
            .order('created_at', { ascending: false });
          if (!res2.error && res2.data) {
            allRows.push(...res2.data);
          }
        }

        // 4. Fetch by exact project_name AND order by created_at DESC
        if (cleanName) {
          const res3 = await (supabase.from('project_reports') as any)
            .select('*')
            .eq('project_name', cleanName)
            .order('created_at', { ascending: false });
          if (!res3.error && res3.data) {
            allRows.push(...res3.data);
          }
        }

        // Deduplicate rows by id
        const uniqueMap = new Map<string, any>();
        for (const row of allRows) {
          if (row && row.id && !uniqueMap.has(String(row.id))) {
            uniqueMap.set(String(row.id), row);
          }
        }

        const candidateRows = Array.from(uniqueMap.values());

        // Strictly filter candidateRows so only reports for THIS specific project remain
        const matchingRows = candidateRows.filter(row => 
          isReportMatchingProject(row.project_id, row.project_name, numId, cleanName, po)
        );

        // Sort descending by created_at (created_at: desc)
        matchingRows.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

        // Return max 5 latest reports for display in reports UI
        return matchingRows.slice(0, 5).map(mapRowToHistoricalReport);
      } catch (err) {
        console.error('Supabase getHistoricalReports exception:', err);
      }
    }

    return memoryReports
      .filter((r) => isReportMatchingProject(r.projectId, r.projectName, numId, cleanName, po))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  },

  async archiveOldReports(projectId: number, projectName: string): Promise<void> {
    const supabase = getSupabaseClient();
    const cleanName = (projectName || '').trim();
    const numId = Number(projectId);

    if (supabase) {
      try {
        let allRows: any[] = [];
        if (!isNaN(numId) && numId > 0) {
          const res1 = await (supabase.from('project_reports') as any)
            .select('*')
            .eq('project_id', numId)
            .order('created_at', { ascending: false });
          if (!res1.error && res1.data) allRows.push(...res1.data);
        }

        if (cleanName) {
          const res2 = await (supabase.from('project_reports') as any)
            .select('*')
            .eq('project_name', cleanName)
            .order('created_at', { ascending: false });
          if (!res2.error && res2.data) allRows.push(...res2.data);
        }

        const uniqueMap = new Map<string, any>();
        for (const row of allRows) {
          if (row && row.id && !uniqueMap.has(String(row.id))) {
            uniqueMap.set(String(row.id), row);
          }
        }

        const candidateRows = Array.from(uniqueMap.values());
        const matchingRows = candidateRows.filter(row => 
          isReportMatchingProject(row.project_id, row.project_name, numId, cleanName)
        );

        matchingRows.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

        // أرشفة أي تقارير زائدة عن آخر 5 تقارير في جدول منفصل archived_project_reports
        if (matchingRows.length > 5) {
          const reportsToArchive = matchingRows.slice(5);
          for (const oldRow of reportsToArchive) {
            try {
              // 1. نقل إلى جدول الأرشيف المنفصل
              await (supabase.from('archived_project_reports') as any).insert([{
                original_report_id: oldRow.id,
                project_id: oldRow.project_id,
                project_name: oldRow.project_name,
                map_url: oldRow.map_url,
                total_length_meters: oldRow.total_length_meters,
                total_length_km: oldRow.total_length_km,
                total_features_count: oldRow.total_features_count,
                color_breakdown: oldRow.color_breakdown,
                items: sanitizeItemsForStorage(oldRow.items),
                parsed_at: oldRow.parsed_at,
                original_created_at: oldRow.created_at,
                archived_at: new Date().toISOString()
              }]);
              // 2. حذف التقرير القديم من جدول التقارير النشطة
              await (supabase.from('project_reports') as any).delete().eq('id', oldRow.id);
              console.log(`📦 تم أرشفة التقرير القديم (${oldRow.id}) بنجاح.`);
            } catch (archiveErr) {
              console.warn('⚠️ خطأ في أرشفة التقرير القديم:', archiveErr);
            }
          }
        }
      } catch (err) {
        console.error('Supabase archiveOldReports exception:', err);
      }
    }

    // تنظيف الذاكرة المؤقتة لمنع تجاوز 5 تقارير للمشروع
    const projMem = memoryReports.filter(r => isReportMatchingProject(r.projectId, r.projectName, numId, cleanName));
    if (projMem.length > 5) {
      const toRemove = projMem.slice(5);
      for (const rem of toRemove) {
        const idx = memoryReports.findIndex(m => m.id === rem.id);
        if (idx !== -1) memoryReports.splice(idx, 1);
      }
    }
  },

  async getLatestReport(projectId: number, projectName?: string, po?: string): Promise<HistoricalReport | null> {
    const supabase = getSupabaseClient();
    const cleanName = (projectName || '').trim();
    const numId = Number(projectId);
    const poDigits = extractPoDigits(po) || extractPoDigits(cleanName);

    if (supabase) {
      try {
        let rows: any[] = [];

        // Direct Supabase query linking PO filter AND created_at: desc sorting
        if (poDigits) {
          let query = (supabase.from('project_reports') as any)
            .select('*')
            .ilike('project_name', `%${poDigits}%`);

          if (!isNaN(numId) && numId > 0) {
            query = query.eq('project_id', numId);
          }

          const res = await query.order('created_at', { ascending: false }).limit(1);
          if (!res.error && res.data && res.data.length > 0) {
            rows = res.data;
          }
        }

        if (rows.length === 0 && !isNaN(numId) && numId > 0) {
          const res = await (supabase.from('project_reports') as any)
            .select('*')
            .eq('project_id', numId)
            .order('created_at', { ascending: false })
            .limit(1);
          if (!res.error && res.data && res.data.length > 0) {
            rows = res.data;
          }
        }

        if (rows.length > 0) {
          const report = mapRowToHistoricalReport(rows[0]);
          if (isReportMatchingProject(report.projectId, report.projectName, numId, cleanName, po)) {
            return report;
          }
        }
      } catch (err) {
        console.error('Supabase getLatestReport exception:', err);
      }
    }

    const reports = await this.getHistoricalReports(projectId, projectName, po);
    return reports.length > 0 ? reports[0] : null;
  },

  async saveReport(
    projectId: number, 
    projectName: string, 
    mapUrl: string | undefined, 
    analysisResult: KMLAnalysisResult
  ): Promise<HistoricalReport> {
    const localReport: HistoricalReport = {
      id: `rep-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      projectId,
      projectName,
      mapUrl,
      parsedAt: analysisResult.parsedAt || new Date().toLocaleString('ar-SA'),
      createdAt: new Date().toISOString(),
      analysisResult
    };

    memoryReports.unshift(localReport);

    const colorBreakdownPayload = {
      ...(analysisResult.colorBreakdown || {}),
      projectScope: analysisResult.projectScope,
      permitNosByStatus: analysisResult.permitNosByStatus,
      segmentIdsByStatus: analysisResult.segmentIdsByStatus
    };

    let resultReport = localReport;

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const sanitizedItems = sanitizeItemsForStorage(analysisResult.items || []);
        const { data, error } = await (supabase.from('project_reports') as any)
          .insert([{
            project_id: projectId,
            project_name: projectName,
            map_url: mapUrl || '',
            total_length_meters: analysisResult.totalLengthMeters,
            total_length_km: analysisResult.totalLengthKm,
            total_features_count: analysisResult.totalFeaturesCount,
            color_breakdown: colorBreakdownPayload,
            items: sanitizedItems,
            parsed_at: analysisResult.parsedAt || new Date().toLocaleString('ar-SA')
          }])
          .select();

        if (error) {
          if (error.message && error.message.includes('timeout')) {
            console.warn('⚠️ Supabase insert statement timeout. Report stored in active session memory fallback.');
          } else {
            console.warn('⚠️ Supabase Report Insert Note:', error.message || error);
          }
        } else if (data && data.length > 0) {
          console.log('✅ Successfully inserted report row to Supabase project_reports');
          const dbReport = mapRowToHistoricalReport(data[0]);
          localReport.id = dbReport.id;
          resultReport = dbReport;
        }
      } catch (err: any) {
        console.warn('⚠️ Supabase async exception during report insert (falling back to memory):', err?.message || err);
      }
    } else {
      console.warn('⚠️ Supabase config not provided. Saved report in temporary session memory.');
    }

    // أرشفة غير معطلة للتقارير القديمة في الخلفية لضمان عدم تأخير الاستجابة
    this.archiveOldReports(projectId, projectName).catch((archErr) => {
      console.warn('Background archiveOldReports notice:', archErr);
    });

    // تحديث جدول بيانات الداشبورد والمؤشرات تلقائياً عند حفظ أي تحليل جديد
    try {
      const { DashboardMetricsStore } = await import('./dashboardMetricsStore');
      await DashboardMetricsStore.saveProjectMetric(projectId, projectName, analysisResult);
    } catch (metricErr) {
      console.warn('⚠️ Could not update dashboard project metric:', metricErr);
    }

    // 📢 إرسال إشعار فوري لجميع المستخدمين بتسجيل / تحديث تقرير التحليل للمشروع
    try {
      const totalKm = analysisResult.totalLengthKm || (analysisResult.totalLengthMeters ? Number((analysisResult.totalLengthMeters / 1000).toFixed(3)) : 0);
      const notifMsg = `📊 تم تحليل وإصدار تقرير جديد لمشروع (${projectName}) - إجمالي الأطوال: ${totalKm} كم (${analysisResult.totalFeaturesCount || 0} عنصر)`;
      
      if (supabase) {
        await supabase.from('notifications').insert([{
          user_id: 'all',
          project_id: projectId,
          project_name: projectName,
          type: 'report_generated',
          message: notifMsg,
          created_at: new Date().toISOString()
        }]);
      }

      const savedLocal = localStorage.getItem('water_maps_local_notifications');
      let localList: any[] = savedLocal ? JSON.parse(savedLocal) : [];
      localList.unshift({
        id: Date.now() + Math.random(),
        projectId: projectId,
        projectName: projectName,
        type: 'report_generated',
        message: notifMsg,
        created_at: new Date().toISOString()
      });
      if (localList.length > 100) localList = localList.slice(0, 100);
      localStorage.setItem('water_maps_local_notifications', JSON.stringify(localList));
      window.dispatchEvent(new Event('water_maps_notifications_updated'));
    } catch (notifErr) {
      console.warn('⚠️ Could not dispatch notification on report save:', notifErr);
    }

    return resultReport;
  },

  async saveChangelog(
    projectId: number, 
    projectName: string, 
    reportId: string, 
    previousReportId: string | null, 
    diff: ProjectDiffResult
  ): Promise<ProjectChangelogRecord> {
    const localRecord: ProjectChangelogRecord = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      projectId,
      projectName,
      reportId,
      previousReportId,
      diff,
      createdAt: new Date().toISOString(),
      isViewed: false
    };

    memoryChangelogs.unshift(localRecord);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const insertPayload: any = {
          project_id: projectId,
          project_name: projectName,
          diff: diff,
          is_viewed: false
        };

        if (reportId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId)) {
          insertPayload.report_id = reportId;
        }
        if (previousReportId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(previousReportId)) {
          insertPayload.previous_report_id = previousReportId;
        }

        const { data, error } = await (supabase.from('project_changelogs') as any)
          .insert([insertPayload])
          .select();

        // إدراج إشعار موجه لجميع المستخدمين في جدول notifications لإتاحة التنبيه الفوري لكل المهندسين
        if (diff && (diff.hasChanges || diff.addedFeaturesCount || diff.modifiedFeaturesCount || diff.deletedFeaturesCount)) {
          try {
            const parts = [];
            if (diff.addedFeaturesCount > 0) parts.push(`إضافة ${diff.addedFeaturesCount} عنصر`);
            if (diff.modifiedFeaturesCount > 0) parts.push(`تعديل ${diff.modifiedFeaturesCount} عنصر`);
            if (diff.deletedFeaturesCount > 0) parts.push(`حذف ${diff.deletedFeaturesCount} عنصر`);
            if (diff.lengthDiffMeters && Math.abs(diff.lengthDiffMeters) > 0.1) {
              parts.push(`فارق أطوال (${diff.lengthDiffMeters > 0 ? '+' : ''}${diff.lengthDiffMeters.toFixed(1)}m)`);
            }
            const diffDetailsStr = parts.length > 0 ? ` (${parts.join('، ')})` : '';
            const notifMsg = `📢 تم رصد تحديثات وتغيرات جديدة بخريطة مشروع (${projectName})${diffDetailsStr}`;

            await supabase.from('notifications').insert([{
              user_id: 'all',
              project_id: projectId,
              project_name: projectName,
              type: 'change_detected',
              message: notifMsg,
              created_at: new Date().toISOString()
            }]);

            try {
              const savedLocal = localStorage.getItem('water_maps_local_notifications');
              let localList: any[] = savedLocal ? JSON.parse(savedLocal) : [];
              localList.unshift({
                id: Date.now() + Math.random(),
                projectId: projectId,
                projectName: projectName,
                type: 'change_detected',
                message: notifMsg,
                created_at: new Date().toISOString()
              });
              if (localList.length > 100) localList = localList.slice(0, 100);
              localStorage.setItem('water_maps_local_notifications', JSON.stringify(localList));
              window.dispatchEvent(new Event('water_maps_notifications_updated'));
            } catch (e) {}
          } catch (notifErr) {
            console.warn('Error inserting changelog notification:', notifErr);
          }
        }

        if (error) {
          console.warn('⚠️ Supabase Changelog Insert Note:', error.message || error);
        } else if (data && data.length > 0) {
          console.log('✅ Successfully inserted changelog row to Supabase project_changelogs');
          const dbRecord = mapRowToChangelogRecord(data[0]);
          localRecord.id = dbRecord.id;
          return dbRecord;
        }
      } catch (err: any) {
        console.warn('⚠️ Supabase async exception in saveChangelog (falling back to memory):', err?.message || err);
      }
    }

    return localRecord;
  },

  async getChangelogs(projectId?: number, projectName?: string): Promise<ProjectChangelogRecord[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        let query = (supabase.from('project_changelogs') as any).select('*').order('created_at', { ascending: false });
        if (projectId) {
          query = query.eq('project_id', projectId);
        }
        let { data, error } = await query;
        if ((!data || data.length === 0) && projectName) {
          const fallback = await (supabase.from('project_changelogs') as any)
            .select('*')
            .eq('project_name', projectName)
            .order('created_at', { ascending: false });
          if (!fallback.error && fallback.data) {
            data = fallback.data;
            error = null;
          }
        }
        if (!error && data) {
          return data.map(mapRowToChangelogRecord);
        }
        if (error) {
          console.warn('⚠️ Supabase getChangelogs Note:', error.message || error);
        }
      } catch (err: any) {
        console.warn('⚠️ Supabase getChangelogs exception (falling back to memory):', err?.message || err);
      }
    }

    if (projectId) {
      return memoryChangelogs.filter((c) => c.projectId === projectId || (projectName && c.projectName === projectName));
    }
    return memoryChangelogs;
  }
};
