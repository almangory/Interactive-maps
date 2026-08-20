import React, { useState, useMemo, useEffect } from 'react';
import { 
  History, 
  Search, 
  Filter, 
  User, 
  Calendar, 
  ArrowLeftRight, 
  FileSpreadsheet, 
  Layers, 
  MapPin, 
  CheckCircle2, 
  XCircle, 
  Sparkles, 
  RotateCcw, 
  Building2, 
  Clock, 
  Shield, 
  ChevronDown, 
  ChevronUp,
  FileText,
  Tag,
  Plus,
  Edit3,
  Map,
  Activity
} from 'lucide-react';
import { Project, User as UserType } from '../types';
import { getSupabaseClient } from '../utils/supabaseSetup';
import { useLanguage } from '../utils/i18n';

export interface FieldChange {
  fieldLabel: string;
  oldValue: string;
  newValue: string;
}

export interface ChangelogItem {
  id: string;
  projectId?: number | string;
  projectName: string;
  operationalNumber?: string;
  userName: string;
  userRole?: string;
  changeType: 'edit' | 'add' | 'map_update' | 'change_detected';
  timestamp: string;
  createdAtISO: string;
  summary: string;
  fieldChanges?: FieldChange[];
  mapDetails?: {
    totalLengthDiffKm?: number;
    addedPermitsCount?: number;
    removedPermitsCount?: number;
    yellowStageChangesCount?: number;
    summaryMessages?: string[];
  };
}

interface ChangelogTabProps {
  currentUser: UserType;
  projects: Project[];
  onSelectProject?: (proj: Project) => void;
}

export const ChangelogTab: React.FC<ChangelogTabProps> = ({
  currentUser,
  projects,
  onSelectProject
}) => {
  const { t, translateDynamic, formatNumber, isRtl, language } = useLanguage();
  const [changelogs, setChangelogs] = useState<ChangelogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedChangeType, setSelectedChangeType] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});

  // 1. جلب بيانات سجل التغييرات من قاعدة بيانات Supabase والذاكرة المحلية
  const fetchChangelogs = async () => {
    setLoading(true);
    const combinedLogs: ChangelogItem[] = [];

    // أ) جلب السجلات المحفوظة محلياً بـ localStorage
    try {
      const localLogsRaw = localStorage.getItem('water_maps_local_changelogs');
      if (localLogsRaw) {
        const parsed = JSON.parse(localLogsRaw);
        if (Array.isArray(parsed)) {
          combinedLogs.push(...parsed);
        }
      }
    } catch (e) {
      console.warn('Error reading local changelogs:', e);
    }

    // ب) جلب السجلات من Supabase table project_changelogs
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await (supabase.from('project_changelogs') as any)
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          data.forEach((row: any) => {
            const diffData = row.diff || {};
            const logItem: ChangelogItem = {
              id: row.id || `db-${Date.now()}-${Math.random()}`,
              projectId: row.project_id || diffData.projectId,
              projectName: row.project_name || diffData.projectName || 'مشروع شبكة',
              operationalNumber: diffData.operationalNumber || row.operational_number || '',
              userName: diffData.userName || row.user_name || 'المهندس الفني',
              userRole: diffData.userRole || 'عضو النظام',
              changeType: diffData.changeType || row.change_type || 'edit',
              timestamp: diffData.timestamp || (row.created_at ? new Date(row.created_at).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }) : 'سابقاً'),
              createdAtISO: row.created_at || diffData.createdAtISO || new Date().toISOString(),
              summary: diffData.summary || `تعديل في بيانات مشروع: ${row.project_name || ''}`,
              fieldChanges: diffData.fieldChanges || [],
              mapDetails: diffData.mapDetails || (diffData.diff ? {
                totalLengthDiffKm: diffData.diff.totalLengthDiffKm,
                addedPermitsCount: diffData.diff.addedPermits?.length || 0,
                removedPermitsCount: diffData.diff.removedPermits?.length || 0,
                yellowStageChangesCount: diffData.diff.yellowLineStageChanges?.length || 0,
                summaryMessages: diffData.diff.summaryMessages || []
              } : undefined)
            };
            combinedLogs.push(logItem);
          });
        }
      } catch (err) {
        console.warn('⚠️ Notice fetching project_changelogs (falling back to local memory):', err);
      }

      // جـ) تحويل الإشعارات المخزنة في notifications إلى سجلات إضافية للتغطية الشاملة
      try {
        const { data: notifData } = await (supabase.from('notifications') as any)
          .select('*')
          .order('created_at', { ascending: false });

        if (notifData && notifData.length > 0) {
          notifData.forEach((n: any) => {
            const msg = n.message || '';
            // استخراج اسم المهندس إن وُجد بالرسالة
            let engName = 'المهندس المسؤول';
            const matchName = msg.match(/قام المهندس\s+([^\s]+(?:\s+[^\s]+)*?)\s+بتعديل|قام المهندس\s+([^\s]+(?:\s+[^\s]+)*?)\s+بإضافة/);
            if (matchName) {
              engName = matchName[1] || matchName[2] || engName;
            }

            // التحقق مما إذا كان الإشعار متضمناً لتعديل ولم يُضف مسبقاً
            const isEditOrAdd = n.type === 'edit' || n.type === 'add' || n.type === 'change_detected';
            if (isEditOrAdd && msg) {
              const notifLogId = `notif-${n.id}`;
              const exists = combinedLogs.some(c => c.id === notifLogId || (c.createdAtISO === n.created_at && c.projectName === n.project_name));
              
              if (!exists) {
                combinedLogs.push({
                  id: notifLogId,
                  projectId: n.project_id,
                  projectName: n.project_name || 'مشروع شبكة',
                  operationalNumber: '',
                  userName: engName,
                  userRole: 'مهندس النظام',
                  changeType: n.type === 'add' ? 'add' : (n.type === 'change_detected' ? 'map_update' : 'edit'),
                  timestamp: n.created_at ? new Date(n.created_at).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }) : 'سابقاً',
                  createdAtISO: n.created_at || new Date().toISOString(),
                  summary: msg
                });
              }
            }
          });
        }
      } catch (err) {
        console.warn('⚠️ Notice converting notifications to changelogs:', err);
      }
    }

    // د) ترتيب وتفريد السجلات بحسب التاريخ التنازلي
    const uniqueLogsMap = new Map<string, ChangelogItem>();
    combinedLogs.forEach(item => {
      const key = `${item.projectName}_${item.createdAtISO}_${item.summary}`;
      if (!uniqueLogsMap.has(key)) {
        uniqueLogsMap.set(key, item);
      }
    });

    const sorted = Array.from(uniqueLogsMap.values()).sort((a: ChangelogItem, b: ChangelogItem) => {
      return new Date(b.createdAtISO).getTime() - new Date(a.createdAtISO).getTime();
    });

    setChangelogs(sorted);
    setLoading(false);
  };

  useEffect(() => {
    fetchChangelogs();
  }, [projects]);

  // قائمة المهندسين المتواجدين بالسجل للتصفية
  const availableUsers = useMemo(() => {
    const setUsers = new Set<string>();
    changelogs.forEach(c => {
      if (c.userName) setUsers.add(c.userName);
    });
    return Array.from(setUsers);
  }, [changelogs]);

  // 2. تصفية السجلات بحسب البحث والخيارات المحددة
  const filteredChangelogs = useMemo(() => {
    return changelogs.filter(log => {
      // أ) فلترة البحث في النص
      const query = searchTerm.toLowerCase().trim();
      const matchesSearch = !query ||
        log.projectName.toLowerCase().includes(query) ||
        (log.operationalNumber && log.operationalNumber.toLowerCase().includes(query)) ||
        log.userName.toLowerCase().includes(query) ||
        log.summary.toLowerCase().includes(query) ||
        (log.fieldChanges && log.fieldChanges.some(f => 
          f.fieldLabel.toLowerCase().includes(query) || 
          f.oldValue.toLowerCase().includes(query) || 
          f.newValue.toLowerCase().includes(query)
        ));

      // ب) فلترة المشروع
      const matchesProject = selectedProjectId === 'all' || String(log.projectId) === String(selectedProjectId) || log.projectName === selectedProjectId;

      // ج) فلترة نوع التعديل
      const matchesType = selectedChangeType === 'all' || log.changeType === selectedChangeType;

      // د) فلترة المهندس
      const matchesUser = selectedUser === 'all' || log.userName === selectedUser;

      return matchesSearch && matchesProject && matchesType && matchesUser;
    });
  }, [changelogs, searchTerm, selectedProjectId, selectedChangeType, selectedUser]);

  // إحصائيات سريعة للـ Header
  const stats = useMemo(() => {
    const totalLogs = filteredChangelogs.length;
    const uniqueProjectsCount = new Set(filteredChangelogs.map(c => c.projectName)).size;
    const uniqueUsersCount = new Set(filteredChangelogs.map(c => c.userName)).size;
    const latestLog = filteredChangelogs.length > 0 ? filteredChangelogs[0].timestamp : t('changelog.none', 'لا يوجد');

    return { totalLogs, uniqueProjectsCount, uniqueUsersCount, latestLog };
  }, [filteredChangelogs, t]);

  const toggleExpand = (id: string) => {
    setExpandedLogIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className={`space-y-6 font-sans ${isRtl ? 'dir-rtl text-right' : 'dir-ltr text-left'}`} dir={isRtl ? 'rtl' : 'ltr'} id="changelog-tab-root">
      
      {/* Top Banner Card */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-blue-600/30 rounded-2xl border border-blue-400/30 backdrop-blur-md">
                <History className="h-6 w-6 text-blue-400" />
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                {t('changelog.bannerTitle', 'سجل التغييرات والتحديثات التاريخية (Timeline Changelog)')}
              </h2>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              {t('changelog.bannerDesc', 'جدول زمني تفاعلي يوثق كافة التعديلات والإدراجات التي طرأت على بيانات الخرائط التشغيلية، مع عرض دقيق للمهندس المجرِي للتعديل، وقت الإجراء، والمقارنة المباشرة بين البيانات القديمة والجديدة.')}
            </p>
          </div>

          <button
            type="button"
            onClick={fetchChangelogs}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all border border-white/15 cursor-pointer shrink-0 self-start md:self-center"
          >
            <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('changelog.refreshNow', 'تحديث السجل فوراً')}</span>
          </button>
        </div>

        {/* Quick KPI Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800/80">
          <div className="bg-white/5 backdrop-blur-xs p-3 rounded-2xl border border-white/10">
            <span className="text-[10px] text-slate-400 font-bold block">{t('changelog.totalRecordedChanges', 'إجمالي التعديلات المسجلة')}</span>
            <span className="text-base font-black text-blue-400 mt-0.5 block">{formatNumber(stats.totalLogs)} {t('changelog.actionUnit', 'إجراء')}</span>
          </div>
          <div className="bg-white/5 backdrop-blur-xs p-3 rounded-2xl border border-white/10">
            <span className="text-[10px] text-slate-400 font-bold block">{t('changelog.modifiedProjects', 'المشاريع المعدلة')}</span>
            <span className="text-base font-black text-emerald-400 mt-0.5 block">{formatNumber(stats.uniqueProjectsCount)} {t('changelog.projectUnit', 'مشروع')}</span>
          </div>
          <div className="bg-white/5 backdrop-blur-xs p-3 rounded-2xl border border-white/10">
            <span className="text-[10px] text-slate-400 font-bold block">{t('changelog.contributingEngineers', 'المهندسين المساهمين')}</span>
            <span className="text-base font-black text-amber-400 mt-0.5 block">{formatNumber(stats.uniqueUsersCount)} {t('changelog.engineerUnit', 'مهندس')}</span>
          </div>
          <div className="bg-white/5 backdrop-blur-xs p-3 rounded-2xl border border-white/10">
            <span className="text-[10px] text-slate-400 font-bold block">{t('changelog.latestActivity', 'أحدث نشاط مسجل')}</span>
            <span className="text-xs font-extrabold text-cyan-300 mt-1 block truncate">{stats.latestLog}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          
          {/* Search Box */}
          <div className="md:col-span-5 relative">
            <Search className={`h-4 w-4 text-slate-400 absolute top-1/2 -translate-y-1/2 ${isRtl ? 'right-3.5' : 'left-3.5'}`} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('changelog.searchPlaceholder', 'ابحث باسم المشروع، رقم التشغيل، اسم المهندس، أو البيان المعدل...')}
              className={`w-full text-xs py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-slate-100 ${
                isRtl ? 'pr-10 pl-8' : 'pl-10 pr-8'
              }`}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className={`absolute top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold ${
                  isRtl ? 'left-3' : 'right-3'
                }`}
              >
                ✕
              </button>
            )}
          </div>

          {/* Project Filter */}
          <div className="md:col-span-3">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-slate-100 font-medium"
            >
              <option value="all">{t('changelog.allProjects', 'كل المشاريع')} ({formatNumber(projects.length)})</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Change Type Filter */}
          <div className="md:col-span-2">
            <select
              value={selectedChangeType}
              onChange={(e) => setSelectedChangeType(e.target.value)}
              className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-slate-100 font-medium"
            >
              <option value="all">{t('changelog.allActionTypes', 'جميع أنواع الإجراءات')}</option>
              <option value="edit">{t('changelog.editProjectData', '📝 تعديل بيانات المشروع')}</option>
              <option value="add">{t('changelog.addNewProject', '🚀 إضافة مشروع جديد')}</option>
              <option value="map_update">{t('changelog.updateMapLengths', '🗺️ تحديث الخريطة والأطوال')}</option>
            </select>
          </div>

          {/* User Filter */}
          <div className="md:col-span-2">
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-slate-100 font-medium"
            >
              <option value="all">{t('changelog.allEngineers', 'جميع المهندسين')}</option>
              {availableUsers.map((u, idx) => (
                <option key={idx} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

        </div>
      </div>

      {/* Main Timeline View */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
        
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-white">
              {t('changelog.timelineTitle', 'الجدول الزمني للعمليات')} ({formatNumber(filteredChangelogs.length)})
            </h3>
          </div>
          {(searchTerm || selectedProjectId !== 'all' || selectedChangeType !== 'all' || selectedUser !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedProjectId('all');
                setSelectedChangeType('all');
                setSelectedUser('all');
              }}
              className="text-[11px] text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
            >
              {t('changelog.resetFilters', 'إعادة ضبط الفلاتر')}
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs space-y-3">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="font-bold">{t('changelog.loading', 'جاري تحميل وثائق سجل التغييرات التاريخية...')}</p>
          </div>
        ) : filteredChangelogs.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs space-y-3">
            <History className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto stroke-1" />
            <p className="font-extrabold text-slate-600 dark:text-slate-300">{t('changelog.noRecords', 'لا توجد سجلات تعديل مطابقة للبحث أو الفلاتر المحددة')}</p>
            <p className="text-[11px] text-slate-400">{t('changelog.noRecordsDesc', 'حاول تغيير جملة البحث أو تحديد مشروع ومهندس آخر.')}</p>
          </div>
        ) : (
          <div className={`relative space-y-8 ${isRtl ? 'pr-4 sm:pr-6 border-r-2' : 'pl-4 sm:pl-6 border-l-2'} border-slate-200 dark:border-slate-800`}>
            {filteredChangelogs.map((log, index) => {
              const isExpanded = expandedLogIds[log.id] ?? (index === 0 || (log.fieldChanges && log.fieldChanges.length > 0));
              const projectObj = projects.find(p => p.name === log.projectName || String(p.id) === String(log.projectId));

              return (
                <div key={log.id} className="relative group">
                  
                  {/* Timeline Node Icon */}
                  <div className={`absolute top-1.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-white ring-4 ring-white dark:ring-slate-900 shadow-md z-10 transition-transform group-hover:scale-110 ${
                    isRtl ? '-right-[25px] sm:-right-[33px]' : '-left-[25px] sm:-left-[33px]'
                  } ${
                    log.changeType === 'add'
                      ? 'bg-emerald-600'
                      : log.changeType === 'map_update'
                      ? 'bg-purple-600'
                      : 'bg-blue-600'
                  }`}>
                    {log.changeType === 'add' ? (
                      <Plus className="h-4 w-4" />
                    ) : log.changeType === 'map_update' ? (
                      <Map className="h-4 w-4" />
                    ) : (
                      <Edit3 className="h-4 w-4" />
                    )}
                  </div>

                  {/* Log Card Container */}
                  <div className="bg-slate-50/70 dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-700/80 transition-all shadow-xs space-y-3">
                    
                    {/* Header Row: Engineer Info & Date */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-700/60 pb-3">
                      
                      {/* User / Engineer Badge */}
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-black text-xs flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-700">
                          <User className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                              {log.userName}
                            </span>
                            <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full font-bold">
                              {translateDynamic(log.userRole || '') || t('changelog.memberRole', 'عضو بوابة NWC')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Date & Time Badge */}
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-semibold bg-white dark:bg-slate-900 px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <Clock className="h-3.5 w-3.5 text-blue-500" />
                        <span>{log.timestamp}</span>
                      </div>
                    </div>

                    {/* Project & Action Badges */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Project Name */}
                        <div className="flex items-center gap-1.5 text-xs font-black text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-3 py-1 rounded-xl border border-blue-200 dark:border-blue-900">
                          <Building2 className="h-3.5 w-3.5" />
                          <span>{log.projectName}</span>
                        </div>

                        {log.operationalNumber && (
                          <span className="text-[10px] font-mono font-bold bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-xl">
                            {log.operationalNumber}
                          </span>
                        )}
                      </div>

                      {/* Change Type Label Badge */}
                      <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-xl flex items-center gap-1 border ${
                        log.changeType === 'add'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : log.changeType === 'map_update'
                          ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                          : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                      }`}>
                        {log.changeType === 'add' ? (
                          <>{t('changelog.addNewProject', '🚀 إضافة مشروع جديد')}</>
                        ) : log.changeType === 'map_update' ? (
                          <>{t('changelog.updateMapLengths', '🗺️ تحديث خريطة وأطوال')}</>
                        ) : (
                          <>{t('changelog.editProjectData', '📝 تعديل بيانات المشروع')}</>
                        )}
                      </span>
                    </div>

                    {/* Change Summary Text */}
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold leading-relaxed bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800">
                      {log.summary}
                    </p>

                    {/* Detailed Differences Comparison (Old vs New Data) */}
                    {((log.fieldChanges && log.fieldChanges.length > 0) || log.mapDetails) && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => toggleExpand(log.id)}
                          className="flex items-center gap-1.5 text-xs font-extrabold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer transition-colors"
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5" />
                          <span>
                            {isExpanded ? t('changelog.hideComparison', 'إخفاء المقارنة التفصيلية (القديمة ⬅️ الجديدة)') : t('changelog.showComparison', 'عرض المقارنة التفصيلية (القديمة ⬅️ الجديدة)')}
                          </span>
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>

                        {isExpanded && (
                          <div className="mt-3 space-y-3 animate-fadeIn">
                            {/* Metadata Field Changes Table */}
                            {log.fieldChanges && log.fieldChanges.length > 0 && (
                              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
                                <div className="bg-slate-100 dark:bg-slate-800 px-3.5 py-2 border-b border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                                  <span>{t('changelog.modifiedField', 'البيان المعدل')}</span>
                                  <span>{t('changelog.comparisonOldNew', 'مقارنة القيمة القديمة بالجديدة')}</span>
                                </div>
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {log.fieldChanges.map((change, fcIdx) => (
                                    <div key={fcIdx} className="p-3 text-xs grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                                      
                                      {/* Field Label */}
                                      <div className="md:col-span-4 font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                        <Tag className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                        <span>{translateDynamic(change.fieldLabel)}</span>
                                      </div>

                                      {/* Old vs New Comparison Box */}
                                      <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {/* Old Value */}
                                        <div className="bg-rose-50/80 dark:bg-rose-950/40 p-2 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 font-medium text-[11.5px] flex items-center gap-1.5 break-all">
                                          <XCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                                          <span className="line-through opacity-80">{translateDynamic(change.oldValue) || t('changelog.unspecified', 'غير محدد')}</span>
                                        </div>

                                        {/* New Value */}
                                        <div className="bg-emerald-50/80 dark:bg-emerald-950/40 p-2 rounded-lg border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 font-extrabold text-[11.5px] flex items-center gap-1.5 break-all">
                                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                          <span>{translateDynamic(change.newValue) || t('changelog.unspecified', 'غير محدد')}</span>
                                        </div>
                                      </div>

                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Map / KML Details */}
                            {log.mapDetails && (
                              <div className="bg-purple-50/60 dark:bg-purple-950/30 p-3.5 rounded-xl border border-purple-200 dark:border-purple-900/60 space-y-2 text-xs text-purple-900 dark:text-purple-200">
                                <div className="font-bold flex items-center gap-1.5">
                                  <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                  <span>{t('changelog.mapDetailsTitle', 'تفاصيل تغيرات الخريطة والأطوال (KML Map Analysis):')}</span>
                                </div>
                                {log.mapDetails.summaryMessages && log.mapDetails.summaryMessages.length > 0 ? (
                                  <ul className="list-disc list-inside space-y-1 font-semibold text-[11px]">
                                    {log.mapDetails.summaryMessages.map((msg, smIdx) => (
                                      <li key={smIdx}>{msg}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-[11px] font-medium">{t('changelog.mapDetailsSuccess', 'تم تحديث ملف الخريطة بنجاح ورصد الفروقات الميدانية.')}</p>
                                )}
                              </div>
                            )}

                          </div>
                        )}
                      </div>
                    )}

                    {/* Footer Actions */}
                    {projectObj && onSelectProject && (
                      <div className={`pt-2 flex ${isRtl ? 'justify-end' : 'justify-start'}`}>
                        <button
                          type="button"
                          onClick={() => onSelectProject(projectObj)}
                          className="text-[11px] text-blue-600 dark:text-blue-400 font-bold hover:underline flex items-center gap-1 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs cursor-pointer"
                        >
                          <span>{t('changelog.viewProjectMap', 'عرض خريطة هذا المشروع 📍')}</span>
                        </button>
                      </div>
                    )}

                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>

    </div>
  );
};
export default ChangelogTab;
