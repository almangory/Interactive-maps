/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ProjectDiffResult, HistoricalReport, ProjectChangelogRecord } from '../types';
import { 
  X, 
  Sparkles, 
  Clock, 
  Calendar, 
  Ruler, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRightLeft, 
  HardHat, 
  FileCode, 
  Copy, 
  Check, 
  Database, 
  History,
  TrendingUp,
  TrendingDown,
  Layers,
  Award,
  AlertTriangle,
  MapPin,
  ExternalLink,
  Navigation
} from 'lucide-react';
import { FeatureDetailsModal, FeatureDetailData } from './FeatureDetailsModal';
import { groupYellowLineChangesByPermit } from '../utils/diffEngine';
import { cleanStage } from '../utils/myMapsKmlParser';
import { 
  SUPABASE_SQL_SCHEMA, 
  SUPABASE_EDGE_FUNCTION_CODE, 
  ReportHistoryStore,
  getSupabaseConfig,
  saveSupabaseConfig,
  getSupabaseClient
} from '../utils/supabaseSetup';

interface ProjectDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  diffResult: ProjectDiffResult | null;
  projectId: number;
  projectName: string;
  isAdmin?: boolean;
}

export function ProjectDiffModal({
  isOpen,
  onClose,
  diffResult,
  projectId,
  projectName,
  isAdmin = false
}: ProjectDiffModalProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'yellowLines' | 'permits' | 'lengths' | 'history' | 'sql'>('summary');
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [copiedEdge, setCopiedEdge] = useState<boolean>(false);
  const [selectedFeatureForModal, setSelectedFeatureForModal] = useState<FeatureDetailData | null>(null);

  // Supabase Configuration States
  const currentConfig = getSupabaseConfig();
  const [sbUrl, setSbUrl] = useState<string>(currentConfig.url);
  const [sbKey, setSbKey] = useState<string>(currentConfig.anonKey);
  const [connectionStatus, setConnectionStatus] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message?: string }>({ status: 'idle' });

  const [historyList, setHistoryList] = useState<HistoricalReport[]>([]);
  const [changelogList, setChangelogList] = useState<ProjectChangelogRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && projectId) {
      let isMounted = true;
      setIsLoadingHistory(true);
      Promise.all([
        ReportHistoryStore.getHistoricalReports(projectId, projectName),
        ReportHistoryStore.getChangelogs(projectId, projectName)
      ]).then(([reports, logs]) => {
        if (isMounted) {
          setHistoryList(reports);
          setChangelogList(logs);
          setIsLoadingHistory(false);
        }
      }).catch((err) => {
        console.error('Error fetching history:', err);
        if (isMounted) setIsLoadingHistory(false);
      });

      return () => { isMounted = false; };
    }
  }, [isOpen, projectId, projectName]);

  useEffect(() => {
    if (!isAdmin && activeTab === 'sql') {
      setActiveTab('summary');
    }
  }, [isAdmin, activeTab]);

  const handleSaveAndTestSupabase = async () => {
    if (!sbUrl || !sbKey) {
      setConnectionStatus({ status: 'error', message: 'يرجى إدخال رابط المشورع (URL) والمفتاح المؤهل (Anon Key)' });
      return;
    }

    saveSupabaseConfig(sbUrl, sbKey);
    setConnectionStatus({ status: 'testing', message: 'جاري فحص الاتصال بقاعدة بيانات Supabase...' });

    try {
      const client = getSupabaseClient();
      if (!client) {
        setConnectionStatus({ status: 'error', message: 'تعذر إنشاء عميل Supabase. يرجى التحقق من صياغة الرابط.' });
        return;
      }

      // Test query to project_reports table
      const { data, error } = await client.from('project_reports').select('id').limit(1);

      if (error) {
        if (error.code === '42P01') {
          setConnectionStatus({ 
            status: 'error', 
            message: 'تم الاتصال بـ Supabase بنجاح ولكن جدول (project_reports) غير موجود! يرجى تشغيل استعلام SQL الموجود أدناه في محرر SQL في Supabase.' 
          });
        } else {
          setConnectionStatus({ status: 'error', message: `خطأ في الاتصال: ${error.message}` });
        }
      } else {
        setConnectionStatus({ status: 'success', message: '✨ تم الاتصال بنجاح بقاعدة بيانات Supabase! الجدول جاهز لتسجيل التقارير والتغيرات.' });
      }
    } catch (err: any) {
      setConnectionStatus({ status: 'error', message: `تعذر الاتصال: ${err?.message || 'خطأ في الشبكة'}` });
    }
  };

  if (!isOpen || !diffResult) return null;

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleCopyEdge = () => {
    navigator.clipboard.writeText(SUPABASE_EDGE_FUNCTION_CODE);
    setCopiedEdge(true);
    setTimeout(() => setCopiedEdge(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl overflow-hidden my-auto flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 p-6 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600/30 rounded-2xl border border-blue-400/30">
              <ArrowRightLeft className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white">
                  نافذة مقارنة التغيرات والتقرير التاريخي للمشروع
                </h2>
                {diffResult.hasChanges ? (
                  <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold rounded-full flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    تغيرات جديدة مقتفية
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded-full flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    مطابق للتقرير السابق
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-1 flex items-center gap-3">
                <span>المشروع: <strong className="text-white">{projectName}</strong></span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-blue-400" />
                  تاريخ التحليل الحالي: {diffResult.currentReportDate}
                </span>
                <span>•</span>
                <span className="text-slate-400">المرجع السابق: {diffResult.previousReportDate}</span>
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-2.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer border border-slate-700"
            title="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Top Metric KPI Highlights Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">فرق الأطوال الكلية</p>
              <p className="text-lg font-black text-slate-900 dark:text-white font-mono mt-0.5 dir-ltr text-right">
                {diffResult.totalLengthDiffMeters > 0 ? `+${diffResult.totalLengthDiffMeters}` : diffResult.totalLengthDiffMeters} م
              </p>
            </div>
            <div className={`p-2.5 rounded-xl ${diffResult.totalLengthDiffMeters >= 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'}`}>
              <Ruler className="h-5 w-5" />
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">تحديث مرحلة الحفرية (جاري العمل)</p>
              <p className="text-lg font-black text-amber-600 dark:text-amber-400 font-mono mt-0.5">
                {diffResult.yellowLineStageChanges.length} قطاع
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <HardHat className="h-5 w-5" />
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">الفسوح والترخيص المضافة</p>
              <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                +{diffResult.addedPermits.length} رخصة
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Award className="h-5 w-5" />
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">إجمالي التقارير التاريخية</p>
              <p className="text-lg font-black text-indigo-600 dark:text-indigo-400 font-mono mt-0.5">
                {historyList.length} تقارير
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              <History className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Tabs Header Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/70 px-4 pt-3 gap-2 overflow-x-auto shrink-0 scrollbar-none">
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer border-t border-x ${activeTab === 'summary' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-slate-200 dark:border-slate-800 shadow-sm' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
          >
            <Sparkles className="h-4 w-4" />
            <span>ملخص التغيرات</span>
          </button>

          <button
            onClick={() => setActiveTab('yellowLines')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer border-t border-x ${activeTab === 'yellowLines' ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 border-slate-200 dark:border-slate-800 shadow-sm' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
          >
            <HardHat className="h-4 w-4" />
            <span>مراحل الحفرية (جاري العمل)</span>
            {diffResult.yellowLineStageChanges.length > 0 && (
              <span className="px-1.5 py-0.5 bg-amber-500 text-slate-950 text-[10px] font-black rounded-full">
                {diffResult.yellowLineStageChanges.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('permits')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer border-t border-x ${activeTab === 'permits' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 border-slate-200 dark:border-slate-800 shadow-sm' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
          >
            <Award className="h-4 w-4" />
            <span>الفسوح والترخيص</span>
            {diffResult.addedPermits.length > 0 && (
              <span className="px-1.5 py-0.5 bg-emerald-500 text-white text-[10px] font-black rounded-full">
                {diffResult.addedPermits.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('lengths')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer border-t border-x ${activeTab === 'lengths' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 border-slate-200 dark:border-slate-800 shadow-sm' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
          >
            <Ruler className="h-4 w-4" />
            <span>فروقات الأطوال والشبكات</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer border-t border-x ${activeTab === 'history' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-slate-200 dark:border-slate-800 shadow-sm' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
          >
            <History className="h-4 w-4" />
            <span>الأرشيف التاريخي ({historyList.length})</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setActiveTab('sql')}
              className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer border-t border-x ${activeTab === 'sql' ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 border-slate-200 dark:border-slate-800 shadow-sm' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
            >
              <Database className="h-4 w-4" />
              <span>استعلامات Supabase & Cron</span>
            </button>
          )}
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto grow space-y-6 bg-white dark:bg-slate-900">
          
          {/* TAB 1: SUMMARY */}
          {activeTab === 'summary' && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-950 dark:text-blue-200 leading-relaxed">
                  <p className="font-bold text-sm mb-1">نتيجة فحص الفروقات التلقائية (Diff Check):</p>
                  يتم مقارنة كل خريطة مستخرجة حديثاً بآخر تقرير محفوظ للمشروع باليوم والتاريخ. يتضمن الفحص أطوال الخطوط، الفسوح والترخيص، ومراحل الحفرية لقطاعات العمل الجاري.
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span>قائمة التغيرات والملخص التنفيذي:</span>
                </h3>

                <div className="space-y-2">
                  {diffResult.summaryMessages.map((msg, idx) => (
                    <div 
                      key={idx}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-3 text-xs font-medium text-slate-800 dark:text-slate-200"
                    >
                      <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
                      <span>{msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: YELLOW LINES STAGE */}
          {activeTab === 'yellowLines' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex items-start gap-3">
                <HardHat className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-950 dark:text-amber-200 leading-relaxed">
                  <p className="font-bold text-sm mb-0.5">تعقب مراحل الحفرية لقطاعات جاري العمل:</p>
                  يستخرج النظام بيان <code className="bg-amber-200/60 dark:bg-amber-900/80 px-1 py-0.5 rounded font-mono">Stage</code> من بيانات الخريطة ويرصد تغير حالة القطاع (مثل: وضع الصبات، التمديد، الدفان، أو السفلتة).
                </div>
              </div>

              {diffResult.yellowLineStageChanges.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">لم يتغير وضع أي قطاع حفرية للخطوط الصفراء في هذا التحليل</p>
                  جميع مراحل الحفرية لقطاعات الخطوط مطابقة للتقرير السابق.
                </div>
              ) : (
                <div className="space-y-4">
                  {groupYellowLineChangesByPermit(diffResult.yellowLineStageChanges).map((group, groupIdx) => (
                    <div 
                      key={groupIdx}
                      className={`p-4 rounded-3xl border-2 shadow-sm space-y-3 relative overflow-hidden transition-all ${
                        group.hasPermit 
                          ? 'bg-amber-50/40 dark:bg-slate-800/90 border-amber-300 dark:border-amber-700/80' 
                          : 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800/80'
                      }`}
                    >
                      {/* Permit Box Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-700/80 pb-3">
                        <div className="flex items-center gap-2.5">
                          {group.hasPermit ? (
                            <div className="p-2 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded-xl border border-amber-400/40">
                              <FileText className="h-5 w-5" />
                            </div>
                          ) : (
                            <div className="p-2 bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-400/40 animate-pulse">
                              <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                            </div>
                          )}

                          <div>
                            {group.hasPermit ? (
                              <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                                <span>مربع الفسح / الرخصة:</span>
                                <span className="font-mono bg-amber-200/80 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 px-2.5 py-0.5 rounded-lg border border-amber-300 dark:border-amber-700">
                                  {group.permitNo}
                                </span>
                              </h4>
                            ) : (
                              <div>
                                <h4 className="text-sm font-black text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                                  <span>⚠️ الأعمال جارية ولا يوجد رقم فسح للقطاع أو العنصر</span>
                                </h4>
                                <p className="text-[11px] font-medium text-rose-600 dark:text-rose-300 mt-0.5">
                                  القطاعات التالية يجرى تنفيذها حالياً بدون تسجيل رقم تصريح/فسح رسمي في بيانات الخريطة.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        <span className={`text-[11px] font-extrabold px-3 py-1 rounded-full border self-start sm:self-center shrink-0 ${
                          group.hasPermit 
                            ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-amber-300 dark:border-amber-800' 
                            : 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200 border-rose-300 dark:border-rose-800'
                        }`}>
                          {group.changes.length} {group.changes.length === 1 ? 'عنصر/قطاع متأثر' : 'عناصر/قطاعات متأثرة'}
                        </span>
                      </div>

                      {/* Detail list of items/elements inside this permit box */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        {group.changes.map((yc, idx) => (
                          <div 
                            key={idx}
                            className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs space-y-2 relative"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-black font-mono text-[11px] text-amber-800 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/80 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-800/60">
                                قطاع: {yc.segmentId || `عنصر #${idx + 1}`}
                              </span>
                              {!group.hasPermit && (
                                <span className="text-[10px] font-black text-rose-600 dark:text-rose-400 bg-rose-100/80 dark:bg-rose-950/80 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800">
                                  بدون رقم فسح
                                </span>
                              )}
                            </div>

                            <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                              {yc.featureName}
                            </p>

                            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-[11.5px] space-y-1">
                              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                                <span>بيان Stage السابق:</span>
                                <span className="line-through text-rose-500 font-bold">{yc.previousStage === 'قطاع جديد' ? 'قطاع جديد' : cleanStage(yc.previousStage)}</span>
                              </div>
                              <div className="flex items-center justify-between text-slate-900 dark:text-slate-100 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                                <span className="font-bold text-amber-800 dark:text-amber-300">بيان Stage الحالي:</span>
                                <span className="font-black text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded border border-amber-300/60 dark:border-amber-800">
                                  {cleanStage(yc.newStage)}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                              <div className="text-[10.5px] text-slate-500 dark:text-slate-400 font-mono text-left">
                                طول العنصر: {yc.lengthMeters.toLocaleString()} متر
                              </div>
                              <button
                                onClick={() => setSelectedFeatureForModal({
                                  name: yc.featureName,
                                  segmentId: yc.segmentId,
                                  permitNo: yc.permitNo,
                                  stage: cleanStage(yc.newStage),
                                  lengthMeters: yc.lengthMeters,
                                  colorHex: yc.colorHex,
                                  streetName: yc.streetName,
                                  district: yc.district,
                                  innerDiameter: yc.innerDiameter,
                                  zone: yc.zone,
                                  drillingType: yc.drillingType,
                                  contractor: yc.contractor,
                                  kmlProjectName: yc.kmlProjectName,
                                  kmlProjectId: yc.kmlProjectId,
                                  centerLat: yc.centerLat,
                                  centerLng: yc.centerLng,
                                  googleMapsUrl: yc.googleMapsUrl
                                })}
                                className="px-2 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10.5px] font-bold rounded-lg border border-blue-200 dark:border-blue-800 transition-all flex items-center gap-1 cursor-pointer"
                              >
                                <MapPin className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                <span>📍 الموقع بالخريطة</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PERMITS */}
          {activeTab === 'permits' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-start gap-3">
                <Award className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-950 dark:text-emerald-200 leading-relaxed">
                  <p className="font-bold text-sm mb-0.5">رصد الفسوح ورخص الحفر الجديدة:</p>
                  يكتشف النظام التراخيص والفسوح الجديدة التي تم إدراجها حديثاً في بيانات الخريطة مقارنة بالتقرير التأسيسي أو التقرير السابق.
                </div>
              </div>

              {diffResult.addedPermits.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">لا توجد فسوح جديدة مضافة في هذا التحليل</p>
                  أرقام الفسوح والتراخيص مطابقة للسجل السابق.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">رقم الفسح / الرخصة</th>
                        <th className="p-3">حالة الإضافة</th>
                        <th className="p-3">رمز القطاع (Segment ID)</th>
                        <th className="p-3">فئة التنفيذ</th>
                        <th className="p-3 text-center">موقع الفسح على الخريطة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {diffResult.addedPermits.map((ap, idx) => {
                        let mapUrl = ap.googleMapsUrl;
                        if (!mapUrl && ap.centerLat !== undefined && ap.centerLng !== undefined) {
                          mapUrl = `https://www.google.com/maps?q=${ap.centerLat},${ap.centerLng}`;
                        }
                        return (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="p-3 font-mono text-slate-400">{idx + 1}</td>
                            <td className="p-3 font-black font-mono text-emerald-600 dark:text-emerald-400">
                              {ap.permitNo}
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 rounded font-bold">
                                تم إضافة فسح جديد ✨
                              </span>
                            </td>
                            <td className="p-3 font-mono text-slate-700 dark:text-slate-300">
                              {ap.segmentId || '-'}
                            </td>
                            <td className="p-3 text-slate-600 dark:text-slate-400">
                              {ap.category || 'عام'}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => setSelectedFeatureForModal({
                                    id: `permit-${idx}`,
                                    name: ap.featureName || `رخصة/فسح رقم: ${ap.permitNo}`,
                                    segmentId: ap.segmentId,
                                    permitNo: ap.permitNo,
                                    stage: ap.stage,
                                    lengthMeters: ap.lengthMeters,
                                    colorHex: ap.colorHex,
                                    streetName: ap.streetName,
                                    district: ap.district,
                                    innerDiameter: ap.innerDiameter,
                                    zone: ap.zone,
                                    drillingType: ap.drillingType,
                                    contractor: ap.contractor,
                                    kmlProjectName: ap.kmlProjectName,
                                    kmlProjectId: ap.kmlProjectId,
                                    centerLat: ap.centerLat,
                                    centerLng: ap.centerLng,
                                    googleMapsUrl: mapUrl,
                                    description: ap.description
                                  })}
                                  className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 text-[11px] font-bold rounded-lg border border-blue-200 dark:border-blue-800 transition-all flex items-center gap-1 cursor-pointer"
                                  title="عرض التراخيص والتفاصيل في خريطة تفاعلية"
                                >
                                  <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                  <span>📍 موقع الفسح</span>
                                </button>
                                {mapUrl && (
                                  <a
                                    href={mapUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold rounded-lg border border-emerald-200 dark:border-emerald-800 transition-all flex items-center gap-1 cursor-pointer"
                                    title="فتح الموقع مباشرة على خرائط Google Maps"
                                  >
                                    <ExternalLink className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                    <span>Google Maps</span>
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: LENGTHS */}
          {activeTab === 'lengths' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/50 flex items-start gap-3">
                <Ruler className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-xs text-indigo-950 dark:text-indigo-200 leading-relaxed">
                  <p className="font-bold text-sm mb-0.5">تفاصيل فروق الأطوال المحسوبة بـ @turf/length حسب الفئات:</p>
                  جدول توضيحي للفروقات بين التقرير الحالي والتقرير السابق لكل كود لون وحالة تنفيذ.
                </div>
              </div>

              {diffResult.lengthChanges.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">أطوال الشبكة مطابقة بالكامل للتقرير السابق</p>
                  لم يطرأ أي فارق بالأطوال في أي من فئات التنفيذ.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold">
                      <tr>
                        <th className="p-3">فئة التنفيذ</th>
                        <th className="p-3">الطول السابق (كم)</th>
                        <th className="p-3">الطول الحالي (كم)</th>
                        <th className="p-3">الفارق (متر)</th>
                        <th className="p-3">نسبة التغير</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                      {diffResult.lengthChanges.map((lc, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="p-3 font-bold font-sans text-slate-900 dark:text-white">{lc.label}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-400">{lc.oldKm} كم</td>
                          <td className="p-3 text-slate-900 dark:text-slate-100 font-bold">{lc.newKm} كم</td>
                          <td className={`p-3 font-bold ${lc.diffMeters > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {lc.diffMeters > 0 ? `+${lc.diffMeters.toLocaleString()}` : lc.diffMeters.toLocaleString()} م
                          </td>
                          <td className="p-3 font-bold dir-ltr text-right">
                            {lc.percentChange > 0 ? `+${lc.percentChange}%` : `${lc.percentChange}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <History className="h-4 w-4 text-blue-600" />
                  <span>السجل التاريخي للتقارير اليومية المحفوظة للمشروع</span>
                </h3>
                <span className="text-xs text-slate-500 font-mono">
                  {historyList.length} تقارير موثقة
                </span>
              </div>

              {isLoadingHistory ? (
                <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-slate-500 text-xs flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span>جاري جلب التقارير التاريخية من قاعدة بيانات Supabase...</span>
                </div>
              ) : historyList.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-slate-50 text-slate-500 text-xs">
                  لا توجد تقارير أرشفة تاريخية مسجلة بعد لهذا المشروع.
                </div>
              ) : (
                <div className="space-y-3">
                  {historyList.map((rep, idx) => (
                    <div 
                      key={rep.id || idx}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 text-[10px] font-black rounded font-mono">
                            تقرير #{historyList.length - idx}
                          </span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            تاريخ الإصدار: {rep.parsedAt}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          إجمالي أطوال الخطوط: <strong className="text-slate-900 dark:text-slate-100 font-mono">{rep.analysisResult.totalLengthKm} كم</strong> ({rep.analysisResult.totalLengthMeters.toLocaleString()} متر) • عدد الخطوط: {rep.analysisResult.totalFeaturesCount}
                        </p>
                      </div>

                      <div className="text-left">
                        <span className="text-[11px] text-slate-400 font-mono block">
                          تاريخ التسجيل: {new Date(rep.createdAt).toLocaleDateString('ar-SA')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: SUPABASE & CRON SQL */}
          {activeTab === 'sql' && (
            <div className="space-y-5">
              {/* Credentials Configuration Form */}
              <div className="p-5 rounded-2xl bg-slate-900 text-white border border-slate-800 space-y-4 shadow-md">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-cyan-400" />
                    <h3 className="font-bold text-sm text-white">إعدادات الاتصال بقاعدة بيانات Supabase</h3>
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${sbUrl && sbKey ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                    {sbUrl && sbKey ? 'تم إدخال البيانات' : 'يرجى إدخال البيانات'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-slate-300">رابط المشروع (SUPABASE_URL):</label>
                    <input 
                      type="text" 
                      value={sbUrl}
                      onChange={(e) => setSbUrl(e.target.value)}
                      placeholder="https://xyzcompany.supabase.co"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-cyan-300 font-mono focus:outline-none focus:border-cyan-500 dir-ltr text-left"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-slate-300">المفتاح المؤهل (SUPABASE_ANON_KEY):</label>
                    <input 
                      type="password" 
                      value={sbKey}
                      onChange={(e) => setSbKey(e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR..."
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-cyan-300 font-mono focus:outline-none focus:border-cyan-500 dir-ltr text-left"
                    />
                  </div>
                </div>

                {connectionStatus.message && (
                  <div className={`p-3 rounded-xl text-xs font-medium ${
                    connectionStatus.status === 'success' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800' :
                    connectionStatus.status === 'error' ? 'bg-rose-950/80 text-rose-300 border border-rose-800' :
                    'bg-blue-950/80 text-blue-300 border border-blue-800'
                  }`}>
                    {connectionStatus.message}
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleSaveAndTestSupabase}
                    disabled={connectionStatus.status === 'testing'}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md flex items-center gap-2"
                  >
                    <Database className="h-4 w-4" />
                    <span>{connectionStatus.status === 'testing' ? 'جاري الفحص...' : 'حفظ واختبار الاتصال بـ Supabase'}</span>
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-900/50 flex items-start gap-3">
                <Database className="h-5 w-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                <div className="text-xs text-cyan-950 dark:text-cyan-200 leading-relaxed">
                  <p className="font-bold text-sm mb-0.5">استعلامات Supabase وإعداد المراقبة اليومية التلقائية (Cron Job):</p>
                  يمكنك نسخ استعلامات DDL هذه ولصقها مباشرة في محرر SQL في Supabase لإنشاء الجداول وسياسات الأمان وتفعيل الفحص اليومي التلقائي.
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <FileCode className="h-4 w-4 text-cyan-600" />
                    <span>1. استعلام إنشاء الجداول في Supabase (SQL Queries):</span>
                  </h4>
                  <button
                    onClick={handleCopySql}
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    {copiedSql ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedSql ? 'تم نسخ SQL' : 'نسخ استعلامات SQL'}</span>
                  </button>
                </div>

                <pre className="p-4 rounded-2xl bg-slate-950 text-cyan-300 font-mono text-[11px] leading-relaxed overflow-x-auto border border-slate-800 dir-ltr text-left">
                  {SUPABASE_SQL_SCHEMA}
                </pre>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <FileCode className="h-4 w-4 text-cyan-600" />
                    <span>2. كود Supabase Edge Function والـ Cron Job اليومي (Daily Task):</span>
                  </h4>
                  <button
                    onClick={handleCopyEdge}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    {copiedEdge ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedEdge ? 'تم النسخ' : 'نسخ كود Edge Function'}</span>
                  </button>
                </div>

                <pre className="p-4 rounded-2xl bg-slate-950 text-indigo-300 font-mono text-[11px] leading-relaxed overflow-x-auto border border-slate-800 dir-ltr text-left">
                  {SUPABASE_EDGE_FUNCTION_CODE}
                </pre>
              </div>
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="p-4 bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            تم حفظ نتيجة هذا التقرير والتغيرات تلقائياً في السجل التاريخي.
          </p>

          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs rounded-xl shadow transition-all cursor-pointer"
          >
            إغلاق النافذة
          </button>
        </div>

      </div>

      {/* Feature Balloon Details & Leaflet Map Modal */}
      {selectedFeatureForModal && (
        <FeatureDetailsModal
          feature={selectedFeatureForModal}
          onClose={() => setSelectedFeatureForModal(null)}
        />
      )}
    </div>
  );
}
