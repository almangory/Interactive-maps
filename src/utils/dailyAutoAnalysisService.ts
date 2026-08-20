import { Project } from '../types';
import { handleLoadMyMapsLink } from './myMapsKmlParser';
import { compareKMLAnalyses } from './diffEngine';
import { ReportHistoryStore, getSupabaseClient } from './supabaseSetup';

export interface AutoAnalysisProgress {
  isRunning: boolean;
  totalProjects: number;
  completedProjects: number;
  currentProjectName?: string;
  changesFoundCount: number;
  lastRunDate?: string;
}

export interface ScheduleAutoAnalysisConfig {
  autoScheduledEnabled: boolean;
  scheduledHourKSA: number; // e.g. 3 = 03:00 AM Saudi Arabia Time
}

export const DEFAULT_SCHEDULE_CONFIG: ScheduleAutoAnalysisConfig = {
  autoScheduledEnabled: false, // Default is OFF to conserve Edge Requests and server resources
  scheduledHourKSA: 3 // 03:00 AM Saudi Arabia Time
};

export const getScheduleAutoAnalysisConfig = (): ScheduleAutoAnalysisConfig => {
  try {
    const saved = localStorage.getItem('water_maps_auto_analysis_schedule_config');
    return saved ? { ...DEFAULT_SCHEDULE_CONFIG, ...JSON.parse(saved) } : DEFAULT_SCHEDULE_CONFIG;
  } catch (e) {
    return DEFAULT_SCHEDULE_CONFIG;
  }
};

export const saveScheduleAutoAnalysisConfig = (config: ScheduleAutoAnalysisConfig) => {
  try {
    localStorage.setItem('water_maps_auto_analysis_schedule_config', JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save auto analysis schedule config:', e);
  }
};

export const getSaudiCurrentHourAndDate = () => {
  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const saudiTime = new Date(utcMs + (3 * 3600000));
  const hour = saudiTime.getHours();
  const dateStr = saudiTime.toISOString().split('T')[0];
  return { hour, dateStr, saudiTime };
};

type ProgressCallback = (progress: AutoAnalysisProgress) => void;

let isAnalysisRunning = false;
let cancelRequested = false;
let currentProgress: AutoAnalysisProgress = {
  isRunning: false,
  totalProjects: 0,
  completedProjects: 0,
  changesFoundCount: 0
};

export function stopDailyAutoAnalysis() {
  if (isAnalysisRunning) {
    cancelRequested = true;
    currentProgress.currentProjectName = 'جاري إيقاف الفحص...';
    notifyListeners();
  }
}

const listeners: Set<ProgressCallback> = new Set();

export function subscribeAutoAnalysisProgress(cb: ProgressCallback) {
  listeners.add(cb);
  cb({ ...currentProgress });
  return () => {
    listeners.delete(cb);
  };
}

function notifyListeners() {
  listeners.forEach(cb => cb({ ...currentProgress }));
}

/**
 * Runs sequential auto analysis for all projects in background.
 * Checks if a project report has already been created today (or if forced).
 * Analyzes projects ONE BY ONE with a non-blocking pause between each project to prevent UI lag.
 */
export async function runSequentialDailyAutoAnalysis(
  projects: Project[],
  options: { forceRun?: boolean; onNotificationCreated?: (notif: any) => void } = {}
): Promise<{ processed: number; changesFound: number; wasCancelled?: boolean }> {
  // If not forced by Admin click, check if auto analysis is explicitly enabled
  if (!options.forceRun) {
    const config = getScheduleAutoAnalysisConfig();
    if (!config.autoScheduledEnabled) {
      console.log('🛑 Daily auto-analysis is disabled by Admin policy to conserve bandwidth and Edge Requests.');
      return { processed: 0, changesFound: 0 };
    }
  }

  if (isAnalysisRunning) {
    console.log('🔄 Daily auto-analysis is already running in background.');
    return { processed: 0, changesFound: 0 };
  }

  const todayDateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const lastRunKey = 'water_maps_last_daily_auto_run_date';

  // تصفية المشاريع بححيث يتم تحليل المشاريع التي تحتوي رابط خريطة ومصنفة ضمن بند (جاري) فقط
  const eligibleProjects = projects.filter(p => {
    const hasMapUrl = p.mapUrl && p.mapUrl.trim().length > 10;
    const isOngoingStatus = (p.status || '').trim() === 'جاري';
    return hasMapUrl && isOngoingStatus;
  });
  if (eligibleProjects.length === 0) {
    return { processed: 0, changesFound: 0 };
  }

  isAnalysisRunning = true;
  cancelRequested = false;
  currentProgress = {
    isRunning: true,
    totalProjects: eligibleProjects.length,
    completedProjects: 0,
    changesFoundCount: 0,
    lastRunDate: todayDateStr
  };
  notifyListeners();

  let processedCount = 0;
  let changesCount = 0;

  const supabase = getSupabaseClient();

  for (const proj of eligibleProjects) {
    if (cancelRequested) {
      console.log('🛑 Auto analysis loop cancelled by user.');
      break;
    }

    currentProgress.currentProjectName = proj.name;
    notifyListeners();

    try {
      // Check if a report for this project was already saved TODAY
      const latestReport = await ReportHistoryStore.getLatestReport(proj.id, proj.name, proj.po);
      
      let wasReportDoneToday = false;
      if (latestReport && latestReport.createdAt) {
        const reportDate = new Date(latestReport.createdAt).toISOString().split('T')[0];
        if (reportDate === todayDateStr && !options.forceRun) {
          wasReportDoneToday = true;
        }
      }

      // If report wasn't done today OR forceRun is true:
      if (!wasReportDoneToday || options.forceRun) {
        // 1. Fetch & parse KML / synthetic data
        const newAnalysis = await handleLoadMyMapsLink(proj.mapUrl!, proj.name, proj.scope);

        // 2. Compare against previous report (if any)
        const diff = compareKMLAnalyses(
          latestReport ? latestReport.analysisResult : null,
          newAnalysis,
          proj.id,
          proj.name,
          proj.scope
        );

        // 3. Save report & changelog in Supabase / memory
        const savedReport = await ReportHistoryStore.saveReport(
          proj.id,
          proj.name,
          proj.mapUrl,
          newAnalysis
        );

        await ReportHistoryStore.saveChangelog(
          proj.id,
          proj.name,
          savedReport.id,
          latestReport ? latestReport.id : null,
          diff
        );

        // 4. If changes are found, insert notification into Supabase & notify local state
        if (diff.hasChanges) {
          changesCount++;
          currentProgress.changesFoundCount++;

          let diffDetailsStr = '';
          if (diff.addedFeaturesCount > 0 || diff.modifiedFeaturesCount > 0 || diff.deletedFeaturesCount > 0) {
            const parts = [];
            if (diff.addedFeaturesCount > 0) parts.push(`إضافة ${diff.addedFeaturesCount} عنصر`);
            if (diff.modifiedFeaturesCount > 0) parts.push(`تعديل ${diff.modifiedFeaturesCount} عنصر`);
            if (diff.deletedFeaturesCount > 0) parts.push(`حذف ${diff.deletedFeaturesCount} عنصر`);
            if (Math.abs(diff.lengthDiffMeters) > 0.1) {
              parts.push(`فارق أطوال (${diff.lengthDiffMeters > 0 ? '+' : ''}${diff.lengthDiffMeters.toFixed(1)}m)`);
            }
            diffDetailsStr = ` (${parts.join('، ')})`;
          }

          const notifMsg = `📢 تم رصد تحديثات وتغيرات جديدة بخريطة مشروع (${proj.name})${diffDetailsStr}`;

          const notifPayload = {
            user_id: 'all',
            project_id: proj.id,
            project_name: proj.name,
            type: 'change_detected',
            message: notifMsg,
            region: proj.region || '',
            scope: proj.scope || '',
            created_at: new Date().toISOString()
          };

          let createdObj: any = {
            id: Date.now() + Math.random(),
            projectId: proj.id,
            projectName: proj.name,
            type: 'change_detected',
            message: notifMsg,
            region: proj.region || '',
            scope: proj.scope || '',
            read: false,
            timestamp: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
            created_at: new Date().toISOString()
          };

          if (supabase) {
            try {
              const { data: insertedNotifs } = await supabase
                .from('notifications')
                .insert([notifPayload])
                .select();

              if (insertedNotifs && insertedNotifs.length > 0) {
                createdObj = {
                  id: insertedNotifs[0].id,
                  projectId: insertedNotifs[0].project_id,
                  projectName: insertedNotifs[0].project_name,
                  type: insertedNotifs[0].type || 'change_detected',
                  message: insertedNotifs[0].message,
                  region: insertedNotifs[0].region,
                  scope: insertedNotifs[0].scope,
                  read: false,
                  timestamp: new Date(insertedNotifs[0].created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
                  created_at: insertedNotifs[0].created_at
                };
              }
            } catch (notifErr) {
              console.error('Failed to insert notification into Supabase:', notifErr);
            }
          }

          // Save notification locally and trigger window update event
          try {
            const savedLocal = localStorage.getItem('water_maps_local_notifications');
            let localList: any[] = savedLocal ? JSON.parse(savedLocal) : [];
            localList.unshift(createdObj);
            // keep up to 100
            if (localList.length > 100) localList = localList.slice(0, 100);
            localStorage.setItem('water_maps_local_notifications', JSON.stringify(localList));
            window.dispatchEvent(new Event('water_maps_notifications_updated'));
          } catch (e) {}

          if (options.onNotificationCreated) {
            options.onNotificationCreated(createdObj);
          }
        }
        processedCount++;
      }
    } catch (err) {
      console.error(`Error in daily auto analysis for project ${proj.name}:`, err);
    }

    currentProgress.completedProjects++;
    notifyListeners();

    if (cancelRequested) break;

    // Delay 400ms between projects to yield event loop and avoid freezing UI
    await new Promise(resolve => setTimeout(resolve, 400));
    if (cancelRequested) break;
  }

  const wasCancelled = cancelRequested;
  if (!wasCancelled) {
    localStorage.setItem(lastRunKey, todayDateStr);
  }

  cancelRequested = false;
  isAnalysisRunning = false;
  currentProgress.isRunning = false;
  currentProgress.currentProjectName = undefined;
  notifyListeners();

  return { processed: processedCount, changesFound: changesCount, wasCancelled };
}
