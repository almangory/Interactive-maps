import React, { useState, useEffect } from 'react';
import { User, Project } from '../types';
import { useLanguage } from '../utils/i18n';
import { getSupabaseClient } from '../utils/supabaseSetup';
import { 
  Bell, 
  Sliders, 
  ShieldCheck, 
  CheckCircle2, 
  Sparkles, 
  FolderPlus, 
  Layers, 
  FileEdit, 
  Star, 
  Monitor, 
  Filter, 
  RotateCcw,
  Check,
  AlertCircle,
  Clock,
  RefreshCw,
  Crown,
  Send,
  Database,
  StopCircle
} from 'lucide-react';
import {
  ScheduleAutoAnalysisConfig,
  getScheduleAutoAnalysisConfig,
  saveScheduleAutoAnalysisConfig,
  runSequentialDailyAutoAnalysis,
  stopDailyAutoAnalysis,
  getSaudiCurrentHourAndDate,
  subscribeAutoAnalysisProgress,
  AutoAnalysisProgress
} from '../utils/dailyAutoAnalysisService';

export interface NotificationSettings {
  allowNewProjects: boolean;
  allowMapChanges: boolean;
  allowProjectEdits: boolean;
  onlyFavoriteProjects: boolean;
  allowNativePush: boolean;
  filterByScope: boolean;
  filterByRegion: boolean;
}

export const DEFAULT_NOTIF_SETTINGS: NotificationSettings = {
  allowNewProjects: true,
  allowMapChanges: true,
  allowProjectEdits: true,
  onlyFavoriteProjects: false,
  allowNativePush: true,
  filterByScope: true,
  filterByRegion: true,
};

interface NotificationSettingsPageProps {
  currentUser: User;
  projects: Project[];
  onShowNotification?: (msg: string) => void;
  onSendTestNativeNotification?: (title: string, body: string) => void;
}

export function NotificationSettingsPage({
  currentUser,
  projects,
  onShowNotification,
  onSendTestNativeNotification
}: NotificationSettingsPageProps) {
  const { t, translateDynamic, isRtl, language } = useLanguage();
  const storageKey = `water_maps_notif_settings_${currentUser.id}`;

  const [settings, setSettings] = useState<NotificationSettings>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? { ...DEFAULT_NOTIF_SETTINGS, ...JSON.parse(saved) } : DEFAULT_NOTIF_SETTINGS;
    } catch (e) {
      return DEFAULT_NOTIF_SETTINGS;
    }
  });

  const [savedSuccess, setSavedSuccess] = useState(false);

  // Admin Schedule Configuration
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleAutoAnalysisConfig>(getScheduleAutoAnalysisConfig);
  const [autoProgress, setAutoProgress] = useState<AutoAnalysisProgress>({
    isRunning: false,
    totalProjects: 0,
    completedProjects: 0,
    changesFoundCount: 0
  });

  useEffect(() => {
    return subscribeAutoAnalysisProgress((p) => setAutoProgress(p));
  }, []);

  const handleUpdateScheduleConfig = (newCfg: ScheduleAutoAnalysisConfig) => {
    setScheduleConfig(newCfg);
    saveScheduleAutoAnalysisConfig(newCfg);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
    if (onShowNotification) {
      onShowNotification(language === 'en' ? 'Scheduled analysis timing and frequency updated successfully' : 'تم تحديث جدول وموعد الفحص المجدول للتقرير اليومي بنجاح');
    }
  };

  const handleManualBatchTrigger = () => {
    if (autoProgress.isRunning) return;
    runSequentialDailyAutoAnalysis(projects, { forceRun: true }).then(res => {
      if (onShowNotification) {
        if (res.wasCancelled) {
          onShowNotification(language === 'en' ? `🛑 Analysis halted at user request after scanning ${res.processed} projects.` : `🛑 تم إيقاف الفحص بطلب منك بعد معالجة ${res.processed} مشروع.`);
        } else {
          onShowNotification(language === 'en' ? `📊 Completed batch analysis: ${res.processed} projects scanned, ${res.changesFound} changes detected.` : `📊 اكتمل الفحص الشامل للمشاريع (تحت بند جاري): تم معالجة ${res.processed} مشروع ورصد ${res.changesFound} تغييرات.`);
        }
      }
    });
  };

  const [isSendingTestNotif, setIsSendingTestNotif] = useState(false);

  const handleSendBroadcastTestNotif = async () => {
    setIsSendingTestNotif(true);
    const supabase = getSupabaseClient();
    const testMsg = language === 'en'
      ? `📢 General test broadcast from (${currentUser.name}): Project change notification pipeline operational for all engineers.`
      : `📢 إشعار تجريبي عام من المهندس (${currentUser.name}): تم التأكد من إتاحة استلام التغيرات لجميع مهندسي ومدراء النظام بنجاح!`;
    
    try {
      if (supabase) {
        await supabase.from('notifications').insert([{
          user_id: 'all',
          project_id: projects[0]?.id || 1,
          project_name: projects[0]?.name || (language === 'en' ? 'General Project' : 'مشروع عام'),
          type: 'change_detected',
          message: testMsg,
          created_at: new Date().toISOString()
        }]);
      }
      
      if (onSendTestNativeNotification) {
        onSendTestNativeNotification(language === 'en' ? 'Broadcast Notification Test 🔔' : 'تجربة الإشعارات العامة 🔔', testMsg);
      }
      
      if (onShowNotification) {
        onShowNotification(language === 'en' ? '🚀 Public test broadcast sent to all users!' : '🚀 تم بث الإشعار التجريبي العام لجميع المستخدمين بنجاح!');
      }
    } catch (err: any) {
      console.error('Test broadcast notification error:', err);
    } finally {
      setIsSendingTestNotif(false);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save notification settings:', e);
    }
  }, [settings, storageKey]);

  const handleToggle = (key: keyof NotificationSettings) => {
    setSettings(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      return updated;
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
    if (onShowNotification) {
      onShowNotification(language === 'en' ? 'Notification preferences updated successfully' : 'تم إحداث تغييرات على إعدادات التنبيهات بنجاح');
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_NOTIF_SETTINGS);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
    if (onShowNotification) {
      onShowNotification(language === 'en' ? 'Notification settings reset to defaults' : 'تم إعادة ضبط الإعدادات للوضع الافتراضي');
    }
  };

  const handleTestNotification = () => {
    if (onSendTestNativeNotification) {
      onSendTestNativeNotification(
        language === 'en' ? 'Notification Test 🔔' : 'تجربة التنبيهات 🔔', 
        language === 'en' ? 'This is a test notification to verify your alert settings.' : 'هذا تنبيه تجريبي للتأكد من إعدادات الإشعارات الخاصة بك.'
      );
    }
    if (onShowNotification) {
      onShowNotification(language === 'en' ? 'Test notification sent successfully 🔔' : 'تم إرسال إشعار تجريبي بنجاح 🔔');
    }
  };

  const favoriteProjectsCount = projects.filter(p => p.isFavorite).length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto" id="notification-settings-page" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 transform translate-x-8 -translate-y-8 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-blue-600/30 border border-blue-400/30 rounded-2xl text-blue-400 shrink-0">
              <Sliders className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>{t('notifSettings.title')}</span>
                <span className="bg-blue-500/20 text-blue-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-blue-400/30">
                  {language === 'en' ? 'Custom Filter' : 'تصفية مخصصة'}
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-1 font-medium">
                {t('notifSettings.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
              <span>{t('notifSettings.restoreDefaults')}</span>
            </button>
            <button
              type="button"
              onClick={handleTestNotification}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 border-0"
            >
              <Bell className="h-3.5 w-3.5" />
              <span>{t('notifSettings.testNotification')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Success Save Banner */}
      {savedSuccess && (
        <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>{language === 'en' ? 'Preferences saved and applied immediately.' : 'تم حفظ التفضيلات الجديدة تلقائياً وستطبق على جميع الإشعارات فوراً.'}</span>
          </div>
          <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded font-mono">{language === 'en' ? 'Auto-Saved' : 'حفظ تلقائي'}</span>
        </div>
      )}

      {/* Grid of Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Category 1: Types of Notifications */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{t('notifSettings.eventTypes')}</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{t('notifSettings.eventTypesDesc')}</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Toggle 1: New Projects */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/60 dark:border-slate-800 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
                  <FolderPlus className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{t('notifSettings.allowNewProjects')}</div>
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400">{t('notifSettings.allowNewProjectsDesc')}</div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mx-2">
                <input
                  type="checkbox"
                  checked={settings.allowNewProjects}
                  onChange={() => handleToggle('allowNewProjects')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Toggle 2: Map Changes Detected */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/60 dark:border-slate-800 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span>{t('notifSettings.allowMapChanges')}</span>
                    <span className="bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 text-[9px] font-black px-1.5 py-0.2 rounded">{language === 'en' ? 'Recommended' : 'موصى به'}</span>
                  </div>
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400">{t('notifSettings.allowMapChangesDesc')}</div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mx-2">
                <input
                  type="checkbox"
                  checked={settings.allowMapChanges}
                  onChange={() => handleToggle('allowMapChanges')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Toggle 3: Project Edits */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/60 dark:border-slate-800 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
                  <FileEdit className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{t('notifSettings.allowProjectEdits')}</div>
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400">{t('notifSettings.allowProjectEditsDesc')}</div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mx-2">
                <input
                  type="checkbox"
                  checked={settings.allowProjectEdits}
                  onChange={() => handleToggle('allowProjectEdits')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>

          </div>
        </div>

        {/* Category 2: Behavior & Desktop Popups */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="p-2.5 bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 rounded-xl">
              <Monitor className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{t('notifSettings.behavior')}</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{t('notifSettings.behaviorDesc')}</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Toggle 4: Native Desktop Push Notifications */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/60 dark:border-slate-800 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-xl shrink-0">
                  <Monitor className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span>{t('notifSettings.allowNativePush')}</span>
                    {!settings.allowNativePush && (
                      <span className="bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 text-[9px] font-black px-1.5 py-0.2 rounded">
                        {language === 'en' ? 'Disabled' : 'متوقفة'}
                      </span>
                    )}
                  </div>
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400">{t('notifSettings.allowNativePushDesc')}</div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mx-2">
                <input
                  type="checkbox"
                  checked={settings.allowNativePush}
                  onChange={() => handleToggle('allowNativePush')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Toggle 5: Favorite Projects Only */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/60 dark:border-slate-800 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-amber-100 dark:bg-amber-950/60 text-amber-500 rounded-xl shrink-0">
                  <Star className="h-4 w-4 fill-amber-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <span>{t('notifSettings.onlyFavoriteProjects')}</span>
                    <span className="text-[10px] text-slate-400 font-mono">({favoriteProjectsCount} {language === 'en' ? 'selected' : 'محدد'})</span>
                  </div>
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400">{t('notifSettings.onlyFavoriteProjectsDesc')}</div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mx-2">
                <input
                  type="checkbox"
                  checked={settings.onlyFavoriteProjects}
                  onChange={() => handleToggle('onlyFavoriteProjects')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Toggle 6 & 7: Region and Scope Filtering */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => handleToggle('filterByRegion')}
                className={`p-3 rounded-2xl border ${isRtl ? 'text-right' : 'text-left'} transition-all cursor-pointer flex items-center justify-between ${
                  settings.filterByRegion 
                    ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300' 
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500'
                }`}
              >
                <div>
                  <div className="text-[11px] font-extrabold flex items-center gap-1">
                    <Filter className="h-3 w-3" />
                    <span>{t('notifSettings.filterByRegion')}</span>
                  </div>
                  <div className="text-[9.5px] text-slate-400 font-medium">{language === 'en' ? 'Geographic' : 'تصفية جغرافية'}</div>
                </div>
                {settings.filterByRegion ? <Check className="h-4 w-4 text-blue-600" /> : <span className="text-[10px]">{language === 'en' ? 'Off' : 'إيقاف'}</span>}
              </button>

              <button
                type="button"
                onClick={() => handleToggle('filterByScope')}
                className={`p-3 rounded-2xl border ${isRtl ? 'text-right' : 'text-left'} transition-all cursor-pointer flex items-center justify-between ${
                  settings.filterByScope 
                    ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300' 
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500'
                }`}
              >
                <div>
                  <div className="text-[11px] font-extrabold flex items-center gap-1">
                    <Filter className="h-3 w-3" />
                    <span>{t('notifSettings.filterByScope')}</span>
                  </div>
                  <div className="text-[9.5px] text-slate-400 font-medium">{language === 'en' ? 'Scope' : 'تصفية القطاع'}</div>
                </div>
                {settings.filterByScope ? <Check className="h-4 w-4 text-blue-600" /> : <span className="text-[10px]">{language === 'en' ? 'Off' : 'إيقاف'}</span>}
              </button>
            </div>

          </div>
        </div>

      </div>

      {/* Category 3: Admin Scheduled Auto Analysis Management (Only for Admin) */}
      {currentUser.role === 'admin' && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 border border-indigo-800/60 shadow-xl text-white space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-800/40 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-500/30 shrink-0">
                <Crown className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <span>{t('notifSettings.adminAutoAnalysis')}</span>
                  <span className="bg-amber-400/20 text-amber-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-400/30">
                    {language === 'en' ? 'Admin Only' : 'خاص بمدير النظام'}
                  </span>
                </h3>
                <p className="text-[11px] text-indigo-200/80 font-medium mt-0.5">
                  {t('notifSettings.adminAutoAnalysisDesc')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleManualBatchTrigger}
                disabled={autoProgress.isRunning}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 border-0"
              >
                <RefreshCw className={`h-3.5 w-3.5 text-cyan-300 ${autoProgress.isRunning ? 'animate-spin' : ''}`} />
                <span>{autoProgress.isRunning ? (language === 'en' ? 'Analyzing...' : 'جاري الفحص الآن...') : (language === 'en' ? 'Analyze Ongoing Projects 🚀' : 'تحليل المشاريع (تحت بند جاري) 🚀')}</span>
              </button>

              {autoProgress.isRunning && (
                <button
                  type="button"
                  onClick={stopDailyAutoAnalysis}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 animate-pulse border-0"
                  title={language === 'en' ? 'Stop Daily Analysis' : 'إيقاف التقرير والفحص اليومي'}
                >
                  <StopCircle className="h-3.5 w-3.5 text-white" />
                  <span>{language === 'en' ? 'Stop 🛑' : 'إيقاف الفحص 🛑'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Toggle Scheduled Analysis */}
            <div className="flex items-center justify-between p-4 bg-slate-800/60 rounded-2xl border border-indigo-800/40">
              <div>
                <div className="text-xs font-bold text-indigo-100 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-cyan-400" />
                  <span>{language === 'en' ? 'Enable Scheduled Daily Auto-Update' : 'تفعيل التحديث اليومي التلقائي المجدول'}</span>
                </div>
                <div className="text-[10.5px] text-slate-300 mt-0.5">
                  {language === 'en' ? '(Disabled by default for server optimization - manual trigger recommended)' : '(معطل افتراضياً لحفظ استهلاك خوادم Vercel - يوصى بالتشغيل اليدوي فقط)'}
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mx-2">
                <input
                  type="checkbox"
                  checked={scheduleConfig.autoScheduledEnabled}
                  onChange={(e) => handleUpdateScheduleConfig({ ...scheduleConfig, autoScheduledEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {/* Select Scheduled Hour KSA */}
            <div className="p-4 bg-slate-800/60 rounded-2xl border border-indigo-800/40 space-y-2">
              <label className="text-xs font-bold text-indigo-100 block">
                {language === 'en' ? 'Preferred Scheduled Hour (Saudi Arabia AST 🇸🇦):' : 'تحديد وقت التحديث المفضل (توقيت المملكة العربية السعودية 🇸🇦):'}
              </label>
              <select
                value={scheduleConfig.scheduledHourKSA}
                onChange={(e) => handleUpdateScheduleConfig({ ...scheduleConfig, scheduledHourKSA: Number(e.target.value) })}
                className="w-full bg-slate-900 text-cyan-300 text-xs font-bold p-2.5 rounded-xl border border-indigo-700/60 focus:outline-none focus:border-cyan-400 cursor-pointer"
              >
                <option value={1}>{language === 'en' ? '01:00 AM AST (Midnight)' : '01:00 صباحاً AST (منتصف الليل)'}</option>
                <option value={2}>{language === 'en' ? '02:00 AM AST (Late Night - Recommended)' : '02:00 صباحاً AST (وقت متأخر - موصى به)'}</option>
                <option value={3}>{language === 'en' ? '03:00 AM AST (Very Late Night - Default)' : '03:00 صباحاً AST (وقت متأخر جداً - افتراضي)'}</option>
                <option value={4}>{language === 'en' ? '04:00 AM AST (Pre-Dawn)' : '04:00 صباحاً AST (قبل الفجر)'}</option>
                <option value={5}>{language === 'en' ? '05:00 AM AST (Dawn)' : '05:00 صباحاً AST (الفجر)'}</option>
                <option value={23}>{language === 'en' ? '11:00 PM AST (Pre-Midnight)' : '11:00 مساءً AST (قبل منتصف الليل)'}</option>
              </select>
            </div>
          </div>

          <div className="text-[11px] bg-indigo-950/80 p-3 rounded-xl border border-indigo-800/40 text-indigo-200 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>
              📌 {language === 'en' ? 'Current Saudi Time: ' : 'الساعة الحالية بتوقيت السعودية: '}
              <strong className="text-amber-300 font-mono">
                {getSaudiCurrentHourAndDate().saudiTime.toLocaleTimeString(language === 'en' ? 'en-US' : 'ar-SA', { hour: '2-digit', minute: '2-digit' })}
              </strong>
            </span>
            <span className="text-slate-400 text-[10px]">
              {language === 'en' ? 'Last local run: ' : 'آخر تشغيل محلي: '}
              {localStorage.getItem('water_maps_last_daily_auto_run_date') || (language === 'en' ? 'Not run yet today' : 'لم يتم بعد اليوم')}
            </span>
          </div>
        </div>
      )}

      {/* Footer Info Box */}
      <div className="bg-slate-50 dark:bg-slate-900/60 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 flex items-start gap-3.5">
        <AlertCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
          <p className="font-bold text-slate-800 dark:text-slate-200">
            {language === 'en' ? 'Notification Management Policy:' : 'ملاحظة تنظيمية حول إدارة الإشعارات:'}
          </p>
          <p className="leading-relaxed">
            {language === 'en'
              ? `These settings are applied directly to your account (${currentUser.name}). You can customize your preferences anytime to minimize popups or filter specifically for daily map alterations.`
              : `يتم تطبيق هذه الإعدادات مباشرة على جهازك وحسابك (${currentUser.name}). بإمكانك تعديل التفضيلات في أي وقت لتقليل القوائم المنبثقة أو جعلها مقتصرة فقط على التغيرات اليومية للخرائط أو المشاريع المضافة حديثاً.`}
          </p>
        </div>
      </div>
    </div>
  );
}
