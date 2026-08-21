/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Project, ProjectChangelogRecord, ProjectDiffResult } from '../types';
import { getDatabaseClient } from '../utils/reportsStore';
import * as XLSX from 'xlsx';
import { 
  X, 
  FileSpreadsheet, 
  Sparkles, 
  Calendar, 
  TrendingUp, 
  HardHat, 
  Award, 
  Ruler, 
  Search, 
  Layers, 
  CheckCircle2, 
  Filter, 
  Download, 
  ArrowRightLeft,
  Building2,
  RefreshCw,
  Eye
} from 'lucide-react';

interface ExecutiveChangesSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  onOpenProjectDiff?: (diff: ProjectDiffResult, project: Project) => void;
}

export function ExecutiveChangesSummaryModal({
  isOpen,
  onClose,
  projects,
  onOpenProjectDiff
}: ExecutiveChangesSummaryModalProps) {
  const [changelogs, setChangelogs] = useState<ProjectChangelogRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | '7days' | '30days'>('7days');

  // Load changelogs from database
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);

    const fetchAllChangelogs = async () => {
      try {
        const db = getDatabaseClient();
        if (db) {
          const { data, error } = await (db.from('project_changelogs') as any)
            .select('id, project_id, project_name, report_id, previous_report_id, diff, created_at')
            .order('created_at', { ascending: false })
            .limit(100);

          if (!error && data && isMounted) {
            const mapped: ProjectChangelogRecord[] = data.map((d: any) => {
              let diff = d.diff;
              if (typeof diff === 'string') {
                try { diff = JSON.parse(diff); } catch (e) { diff = {}; }
              }
              return {
                id: String(d.id),
                projectId: Number(d.project_id),
                projectName: d.project_name || '',
                reportId: String(d.report_id || ''),
                previousReportId: d.previous_report_id ? String(d.previous_report_id) : null,
                diff: diff || {},
                createdAt: d.created_at || new Date().toISOString()
              };
            });
            setChangelogs(mapped);
          }
        }
      } catch (err) {
        console.warn('Error fetching executive changelogs:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchAllChangelogs();

    return () => { isMounted = false; };
  }, [isOpen]);

  // Aggregate project data with latest diff
  const aggregatedProjectChanges = useMemo(() => {
    const now = Date.now();
    const map = new Map<number, {
      project: Project;
      latestChangelog: ProjectChangelogRecord;
      diff: ProjectDiffResult;
      stageChangesCount: number;
      addedPermitsCount: number;
      lengthDiffMeters: number;
      hasChanges: boolean;
      reportDate: string;
    }>();

    changelogs.forEach(cl => {
      const pId = cl.projectId;
      const clTime = new Date(cl.createdAt).getTime();

      // Time filter check
      if (timeFilter === '7days' && (now - clTime > 7 * 24 * 3600 * 1000)) return;
      if (timeFilter === '30days' && (now - clTime > 30 * 24 * 3600 * 1000)) return;

      if (!map.has(pId)) {
        const proj = projects.find(p => p.id === pId) || ({
          id: pId,
          name: cl.projectName || `مشروع #${pId}`,
          contractor: 'غير محدد',
          region: 'غير محدد',
          scope: 'مياه'
        } as Project);

        const diff: ProjectDiffResult = cl.diff || {};
        const stageChangesCount = (diff.yellowLineStageChanges || []).length;
        const addedPermitsCount = (diff.addedPermits || []).length;
        const lengthDiffMeters = diff.totalLengthDiffMeters || diff.lengthDiffMeters || 0;
        const hasChanges = Boolean(diff.hasChanges || stageChangesCount > 0 || addedPermitsCount > 0 || Math.abs(lengthDiffMeters) > 0.1);

        map.set(pId, {
          project: proj,
          latestChangelog: cl,
          diff,
          stageChangesCount,
          addedPermitsCount,
          lengthDiffMeters,
          hasChanges,
          reportDate: cl.createdAt ? new Date(cl.createdAt).toLocaleDateString('ar-SA') : '-'
        });
      }
    });

    let list = Array.from(map.values());

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(item => 
        item.project.name.toLowerCase().includes(q) ||
        (item.project.contractor || '').toLowerCase().includes(q) ||
        (item.project.po || '').toLowerCase().includes(q)
      );
    }

    // Scope filter
    if (scopeFilter !== 'all') {
      list = list.filter(item => (item.project.scope || '').includes(scopeFilter));
    }

    // Region filter
    if (regionFilter !== 'all') {
      list = list.filter(item => (item.project.region || '').includes(regionFilter));
    }

    return list;
  }, [changelogs, projects, searchQuery, scopeFilter, regionFilter, timeFilter]);

  // Overall KPIs
  const kpis = useMemo(() => {
    const totalWithChanges = aggregatedProjectChanges.filter(p => p.hasChanges).length;
    let totalStageUpdates = 0;
    let totalNewPermits = 0;
    let totalLengthDiffMeters = 0;

    aggregatedProjectChanges.forEach(p => {
      totalStageUpdates += p.stageChangesCount;
      totalNewPermits += p.addedPermitsCount;
      totalLengthDiffMeters += p.lengthDiffMeters;
    });

    return {
      totalAnalyzed: aggregatedProjectChanges.length,
      totalWithChanges,
      totalStageUpdates,
      totalNewPermits,
      totalLengthDiffMeters: Math.round(totalLengthDiffMeters),
      totalLengthDiffKm: (totalLengthDiffMeters / 1000).toFixed(3)
    };
  }, [aggregatedProjectChanges]);

  // Export Executive Excel Summary
  const handleExportExcel = () => {
    if (aggregatedProjectChanges.length === 0) return;

    const rows = aggregatedProjectChanges.map((item, idx) => ({
      'م': idx + 1,
      'اسم المشروع': item.project.name,
      'رقم PO': item.project.po || '-',
      'المقاول': item.project.contractor || '-',
      'المنطقة': item.project.region || '-',
      'مجال المشروع': item.project.scope || '-',
      'حالة التغيرات': item.hasChanges ? 'تم رصد تغيرات جديدة 🚨' : 'مطابق للسابق ✅',
      'تحديثات مرحلة الحفرية (جاري)': item.stageChangesCount,
      'الفسوحات الجديدة المضافة': item.addedPermitsCount,
      'فرق الأطوال (متر)': item.lengthDiffMeters,
      'فرق الأطوال (كم)': (item.lengthDiffMeters / 1000).toFixed(3),
      'تاريخ آخر تقرير': item.reportDate
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقرير التغيرات المجمع");
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `تقرير_التغيرات_المجمع_للمشاريع_${dateStr}.xlsx`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-6xl overflow-hidden my-auto flex flex-col max-h-[92vh] text-right" dir="rtl">
        
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 p-6 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-blue-600/30 rounded-2xl border border-blue-400/30 text-blue-400">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-tight text-white">
                  تقرير التغيرات المجمع وحصر الفروقات الأسبوعية للمشاريع 📑
                </h2>
                <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold rounded-full flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  متابعة تنفيذية
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                لوحة قيادية مجمعة لتتبع تحديثات مراحل الحفر والفسوحات الجديدة وفروق الأطوال لجميع مشاريع المحفظة.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 border border-emerald-400/30"
              title="تصدير جدول التغيرات بالكامل إلى ملف Excel"
            >
              <Download className="h-4 w-4" />
              <span>تصدير Excel 📊</span>
            </button>

            <button
              onClick={onClose}
              className="p-2.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer border border-slate-700 shrink-0"
              title="إغلاق النافذة"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Top KPI Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">مشاريع بتغيرات جديدة</p>
              <p className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono mt-0.5">
                {kpis.totalWithChanges} <span className="text-xs text-slate-400 font-sans font-normal">من أصل {kpis.totalAnalyzed}</span>
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">تحديثات مراحل الحفر (جاري)</p>
              <p className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono mt-0.5">
                {kpis.totalStageUpdates} <span className="text-xs text-slate-400 font-sans font-normal">قطاع</span>
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <HardHat className="h-5 w-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">الفسوحات الجديدة المضافة</p>
              <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                +{kpis.totalNewPermits} <span className="text-xs text-slate-400 font-sans font-normal">رخصة</span>
              </p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <Award className="h-5 w-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">صافي فرق الأطوال</p>
              <p className="text-xl font-black text-blue-600 dark:text-blue-400 font-mono mt-0.5 dir-ltr text-right">
                {kpis.totalLengthDiffMeters > 0 ? `+${kpis.totalLengthDiffMeters}` : kpis.totalLengthDiffMeters} م
              </p>
            </div>
            <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Ruler className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالمشروع أو المقاول أو PO..."
              className="w-full text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 pr-8 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          </div>

          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as any)}
            className="w-full text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="7days">📅 آخر 7 أيام (أسبوعي)</option>
            <option value="30days">📅 آخر 30 يوماً (شهري)</option>
            <option value="all">📅 كافة السجلات التاريخية</option>
          </select>

          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="w-full text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">جميع المجالات (مياه وصرف)</option>
            <option value="مياه">شبكات المياه 💧</option>
            <option value="صرف">شبكات الصرف الصحي 🌊</option>
          </select>

          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="w-full text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">جميع المناطق والقطاعات</option>
            <option value="الرياض">مدينة الرياض</option>
            <option value="الشمالية">المحافظات الشمالية</option>
            <option value="الجنوبية">المحافظات الجنوبية</option>
            <option value="الغربية">المحافظات الغربية</option>
            <option value="الشرقية">القطاع الشرقي</option>
          </select>
        </div>

        {/* Content Table Area */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span>جاري تجميع تقرير التغيرات من قاعدة البيانات...</span>
            </div>
          ) : aggregatedProjectChanges.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
              لا توجد تقارير تغيرات مطابقة للفترة والفلترة المحددة.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3.5">المشروع والمقاول</th>
                    <th className="p-3.5">المنطقة والمجال</th>
                    <th className="p-3.5 text-center">حالة التغيرات</th>
                    <th className="p-3.5 text-center">مراحل الحفر (Stage)</th>
                    <th className="p-3.5 text-center">الفسوح المضافة</th>
                    <th className="p-3.5 text-center">فارق الأطوال</th>
                    <th className="p-3.5">تاريخ التقرير</th>
                    <th className="p-3.5 text-center">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {aggregatedProjectChanges.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                      <td className="p-3.5">
                        <p className="font-bold text-slate-900 dark:text-white text-xs">{item.project.name}</p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          <span>المقاول: {item.project.contractor || '-'}</span>
                          {item.project.po && (
                            <>
                              <span>•</span>
                              <span className="font-mono">PO: {item.project.po}</span>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="p-3.5">
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[11px] font-bold text-slate-700 dark:text-slate-300 block w-fit mb-1">
                          {item.project.region || '-'}
                        </span>
                        <span className="text-[11px] text-slate-500 font-semibold">{item.project.scope || '-'}</span>
                      </td>

                      <td className="p-3.5 text-center">
                        {item.hasChanges ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold text-[11px] rounded-full border border-amber-300 dark:border-amber-800 shadow-3xs">
                            <Sparkles className="h-3 w-3" />
                            <span>تغيرات مرصودة</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold text-[11px] rounded-full border border-emerald-300 dark:border-emerald-800">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>مطابق</span>
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-center font-mono font-bold">
                        {item.stageChangesCount > 0 ? (
                          <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-md border border-amber-200 dark:border-amber-800">
                            {item.stageChangesCount} قطاع
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="p-3.5 text-center font-mono font-bold">
                        {item.addedPermitsCount > 0 ? (
                          <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-md border border-emerald-200 dark:border-emerald-800">
                            +{item.addedPermitsCount} رخصة
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="p-3.5 text-center font-mono font-bold">
                        {Math.abs(item.lengthDiffMeters) > 0.1 ? (
                          <span className={item.lengthDiffMeters > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                            {item.lengthDiffMeters > 0 ? `+${item.lengthDiffMeters}` : item.lengthDiffMeters} م
                          </span>
                        ) : (
                          <span className="text-slate-400">0 م</span>
                        )}
                      </td>

                      <td className="p-3.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {item.reportDate}
                      </td>

                      <td className="p-3.5 text-center">
                        {onOpenProjectDiff && (
                          <button
                            type="button"
                            onClick={() => onOpenProjectDiff(item.diff, item.project)}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/80 text-blue-700 dark:text-blue-300 font-bold text-xs rounded-xl border border-blue-200 dark:border-blue-800 transition-all flex items-center justify-center gap-1 cursor-pointer mx-auto"
                            title="فتح نافذة المقارنة التفصيلية للمشروع"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>عرض المقارنة</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            تم استخراج التقرير التنفيذي المجمع بالاعتماد على قاعدة البيانات المعتمدة لشركة المياه الوطنية.
          </p>

          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs rounded-xl shadow transition-all cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
}
