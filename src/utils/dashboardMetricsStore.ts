/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { KMLAnalysisResult, Project, HistoricalReport } from '../types';
import { getDatabaseClient, findReportForProject, isReportMatchingProject } from './reportsStore';
import { isValidIdentifier, isYellowItemWithoutPermit, isRedItemWithoutSegmentId, cleanSegmentId, cleanPermitNo } from './myMapsKmlParser';

export interface DashboardProjectMetric {
  projectId: number;
  projectName: string;
  totalLengthMeters: number;
  totalLengthKm: number;
  executedWaterMeters: number;
  executedSewageMeters: number;
  ongoingMeters: number;
  remainingMeters: number;
  cancelledMeters: number;
  permitsCount: number;
  uniqueSegmentsCount: number;
  totalSegmentsCount: number;
  permitsList: string[];
  segmentsList: string[];
  yellowNoPermitCount?: number;
  yellowNoPermitMeters?: number;
  yellowNoPermitKm?: number;
  yellowNoPermitSegments?: string[];
  redNoSegmentCount?: number;
  redNoSegmentMeters?: number;
  redNoSegmentKm?: number;
  redNoSegmentFeatures?: string[];
  updatedAt: string;
}

const LOCAL_STORAGE_KEY = 'dashboard_project_metrics_v1';
const memoryMetricsMap = new Map<number, DashboardProjectMetric>();

function loadLocalStorageMetrics(): Map<number, DashboardProjectMetric> {
  const map = new Map<number, DashboardProjectMetric>();
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((item: DashboardProjectMetric) => {
          if (item && item.projectId) {
            map.set(Number(item.projectId), item);
          }
        });
      }
    }
  } catch (err) {
    console.warn('Error reading dashboard metrics from localStorage:', err);
  }
  return map;
}

function saveLocalStorageMetrics(map: Map<number, DashboardProjectMetric>) {
  try {
    const arr = Array.from(map.values());
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(arr));
  } catch (err) {
    console.warn('Error saving dashboard metrics to localStorage:', err);
  }
}

export function computeMetricFromAnalysis(
  projectId: number,
  projectName: string,
  analysis: KMLAnalysisResult
): DashboardProjectMetric {
  let totalMeters = analysis.totalLengthMeters || 0;
  if (totalMeters === 0 && analysis.items && analysis.items.length > 0) {
    totalMeters = analysis.items.reduce((sum, item) => sum + (item.lengthMeters || 0), 0);
  }

  const cb = analysis.colorBreakdown as any || {};

  let execWaterM = cb.executed_water?.totalLengthMeters || cb.executedWater?.totalLengthMeters || 0;
  let execSewageM = cb.executed_sewage?.totalLengthMeters || cb.executedSewage?.totalLengthMeters || 0;
  let ongoingM = cb.ongoing?.totalLengthMeters || 0;
  let remainingM = cb.remaining?.totalLengthMeters || 0;
  let cancelledM = cb.cancelled?.totalLengthMeters || 0;

  // Fallback to summing items if colorBreakdown totals are 0
  if (execWaterM === 0 && execSewageM === 0 && ongoingM === 0 && remainingM === 0 && cancelledM === 0 && analysis.items && analysis.items.length > 0) {
    analysis.items.forEach(it => {
      const cat = it.statusCategory || 'ongoing';
      const m = it.lengthMeters || 0;
      if (cat === 'executed_water') execWaterM += m;
      else if (cat === 'executed_sewage') execSewageM += m;
      else if (cat === 'ongoing') ongoingM += m;
      else if (cat === 'remaining') remainingM += m;
      else if (cat === 'cancelled') cancelledM += m;
    });
  }

  const permitSet = new Set<string>();
  const segmentSet = new Set<string>();
  let itemCount = 0;
  let yellowNoPermitCount = 0;
  let yellowNoPermitMeters = 0;
  const yellowNoPermitSegments: string[] = [];

  let redNoSegmentCount = 0;
  let redNoSegmentMeters = 0;
  const redNoSegmentFeatures: string[] = [];

  if (analysis.items && Array.isArray(analysis.items) && analysis.items.length > 0) {
    analysis.items.forEach(item => {
      if (isYellowItemWithoutPermit(item)) {
        yellowNoPermitCount++;
        yellowNoPermitMeters += (item.lengthMeters || (item as any)['length_meters'] || (item as any)['length'] || 0);
        const sId = item.segmentId || (item as any)['segmentId'] || (item as any)['Segment ID'] || (item as any)['segment_id'];
        const cleanS = cleanSegmentId(sId);
        if (isValidIdentifier(cleanS)) {
          yellowNoPermitSegments.push(cleanS);
        } else {
          yellowNoPermitSegments.push(item.name || `قطاع جاري ${yellowNoPermitCount}`);
        }
      }

      if (isRedItemWithoutSegmentId(item)) {
        redNoSegmentCount++;
        redNoSegmentMeters += (item.lengthMeters || (item as any)['length_meters'] || (item as any)['length'] || 0);
        redNoSegmentFeatures.push(item.name || (item as any)['id'] || `قطاع متبقي ${redNoSegmentCount}`);
      }

      const pNo = item.permitNo || (item as any)['permitNo'] || (item as any)['Permit No'] || (item as any)['permit_no'];
      const cleanedPermit = cleanPermitNo(pNo);
      if (isValidIdentifier(cleanedPermit)) {
        permitSet.add(cleanedPermit);
      }

      const sId = item.segmentId || (item as any)['segmentId'] || (item as any)['Segment ID'] || (item as any)['segment_id'];
      const cleanedSegment = cleanSegmentId(sId);
      if (isValidIdentifier(cleanedSegment)) {
        segmentSet.add(cleanedSegment);
      }
      itemCount++;
    });
  }

  // Also check permitNosByStatus and segmentIdsByStatus
  const pNosByStatus = cb.permitNosByStatus || analysis.permitNosByStatus;
  if (pNosByStatus && typeof pNosByStatus === 'object') {
    Object.values(pNosByStatus).forEach((arr: any) => {
      if (Array.isArray(arr)) {
        arr.forEach((pNo: any) => {
          const cleanedPermit = cleanPermitNo(pNo);
          if (isValidIdentifier(cleanedPermit)) {
            permitSet.add(cleanedPermit);
          }
        });
      }
    });
  }

  // Fallback to extract yellowNoPermit metrics if items array is absent
  if (yellowNoPermitCount === 0) {
    const cbOngoing = cb.ongoing || (cb as any)['ongoing'];
    const ynStats = analysis.yellowNoPermitStats || cbOngoing?.yellowNoPermitStats;
    if (ynStats && ynStats.count > 0) {
      yellowNoPermitCount = ynStats.count;
      yellowNoPermitMeters = ynStats.lengthMeters || 0;
      if (Array.isArray(ynStats.segments)) {
        yellowNoPermitSegments.push(...ynStats.segments);
      }
    } else if (cbOngoing && cbOngoing.yellowNoPermitCount > 0) {
      yellowNoPermitCount = cbOngoing.yellowNoPermitCount;
      yellowNoPermitMeters = cbOngoing.yellowNoPermitMeters || 0;
      if (Array.isArray(cbOngoing.yellowNoPermitSegments)) {
        yellowNoPermitSegments.push(...cbOngoing.yellowNoPermitSegments);
      }
    }
  }

  // Fallback to extract redNoSegment metrics if items array is absent
  if (redNoSegmentCount === 0) {
    const cbRemaining = cb.remaining || (cb as any)['remaining'];
    const rnStats = analysis.redNoSegmentStats || cbRemaining?.redNoSegmentStats;
    if (rnStats && rnStats.count > 0) {
      redNoSegmentCount = rnStats.count;
      redNoSegmentMeters = rnStats.lengthMeters || 0;
      if (Array.isArray(rnStats.features)) {
        redNoSegmentFeatures.push(...rnStats.features);
      }
    } else if (cbRemaining && cbRemaining.redNoSegmentCount > 0) {
      redNoSegmentCount = cbRemaining.redNoSegmentCount;
      redNoSegmentMeters = cbRemaining.redNoSegmentMeters || 0;
      if (Array.isArray(cbRemaining.redNoSegmentFeatures)) {
        redNoSegmentFeatures.push(...cbRemaining.redNoSegmentFeatures);
      }
    }
  }

  const sIdsByStatus = cb.segmentIdsByStatus || analysis.segmentIdsByStatus;
  if (sIdsByStatus && typeof sIdsByStatus === 'object') {
    Object.values(sIdsByStatus).forEach((arr: any) => {
      if (Array.isArray(arr)) {
        arr.forEach((sId: any) => {
          const cleanedSegment = cleanSegmentId(sId);
          if (isValidIdentifier(cleanedSegment)) {
            segmentSet.add(cleanedSegment);
          }
        });
      }
    });
  }

  const permitsList = Array.from(permitSet);
  const segmentsList = Array.from(segmentSet);
  const totalSegmentsCount = segmentSet.size;

  return {
    projectId,
    projectName,
    totalLengthMeters: totalMeters,
    totalLengthKm: Number((totalMeters / 1000).toFixed(3)),
    executedWaterMeters: execWaterM,
    executedSewageMeters: execSewageM,
    ongoingMeters: ongoingM,
    remainingMeters: remainingM,
    cancelledMeters: cancelledM,
    permitsCount: permitsList.length,
    uniqueSegmentsCount: segmentsList.length,
    totalSegmentsCount,
    permitsList,
    segmentsList,
    yellowNoPermitCount,
    yellowNoPermitMeters,
    yellowNoPermitKm: Number((yellowNoPermitMeters / 1000).toFixed(3)),
    yellowNoPermitSegments,
    redNoSegmentCount,
    redNoSegmentMeters,
    redNoSegmentKm: Number((redNoSegmentMeters / 1000).toFixed(3)),
    redNoSegmentFeatures,
    updatedAt: new Date().toISOString()
  };
}

export const DashboardMetricsStore = {
  async getAllMetricsMap(): Promise<Map<number, DashboardProjectMetric>> {
    const map = new Map<number, DashboardProjectMetric>();

    // 1. Check memory / localStorage
    const localMap = loadLocalStorageMetrics();
    localMap.forEach((v, k) => map.set(k, v));
    memoryMetricsMap.forEach((v, k) => map.set(k, v));

    // 2. Fetch from Database dashboard_project_metrics table
    const db = getDatabaseClient();
    if (db) {
      try {
        const { data, error } = await (db.from('dashboard_project_metrics') as any)
          .select('*')
          .order('project_id', { ascending: true });

        if (!error && data && data.length > 0) {
          for (const row of data) {
            const rawPermits = Array.isArray(row.permits_list) ? row.permits_list : [];
            const rawSegments = Array.isArray(row.segments_list) ? row.segments_list : [];
            const cleanPermits: string[] = Array.from(new Set(rawPermits.map((p: any) => cleanPermitNo(p)).filter(isValidIdentifier)));
            const cleanSegments: string[] = Array.from(new Set(rawSegments.map((s: any) => cleanSegmentId(s)).filter(isValidIdentifier)));
            const rawYellowSegments = Array.isArray(row.yellow_no_permit_segments) ? row.yellow_no_permit_segments : [];
            const cleanYellowSegments: string[] = rawYellowSegments.map((s: any) => cleanSegmentId(s)).filter(isValidIdentifier);
            const rawRedFeatures = Array.isArray(row.red_no_segment_features) ? row.red_no_segment_features : (Array.isArray(row.redNoSegmentFeatures) ? row.redNoSegmentFeatures : []);

            const metric: DashboardProjectMetric = {
              projectId: Number(row.project_id),
              projectName: row.project_name || '',
              totalLengthMeters: Number(row.total_length_meters || 0),
              totalLengthKm: Number(row.total_length_km || 0),
              executedWaterMeters: Number(row.executed_water_meters || 0),
              executedSewageMeters: Number(row.executed_sewage_meters || 0),
              ongoingMeters: Number(row.ongoing_meters || 0),
              remainingMeters: Number(row.remaining_meters || 0),
              cancelledMeters: Number(row.cancelled_meters || 0),
              permitsCount: cleanPermits.length,
              uniqueSegmentsCount: cleanSegments.length,
              totalSegmentsCount: Number(row.total_segments_count || cleanSegments.length || 0),
              permitsList: cleanPermits,
              segmentsList: cleanSegments,
              yellowNoPermitCount: Number(row.yellow_no_permit_count || 0),
              yellowNoPermitMeters: Number(row.yellow_no_permit_meters || 0),
              yellowNoPermitKm: Number(row.yellow_no_permit_km || (row.yellow_no_permit_meters ? (Number(row.yellow_no_permit_meters) / 1000).toFixed(3) : 0)),
              yellowNoPermitSegments: cleanYellowSegments,
              redNoSegmentCount: Number(row.red_no_segment_count || row.redNoSegmentCount || 0),
              redNoSegmentMeters: Number(row.red_no_segment_meters || row.redNoSegmentMeters || 0),
              redNoSegmentKm: Number(row.red_no_segment_km || row.redNoSegmentKm || (row.red_no_segment_meters ? (Number(row.red_no_segment_meters) / 1000).toFixed(3) : 0)),
              redNoSegmentFeatures: rawRedFeatures,
              updatedAt: row.updated_at || new Date().toISOString()
            };
            map.set(metric.projectId, metric);
            memoryMetricsMap.set(metric.projectId, metric);
          }
          saveLocalStorageMetrics(map);
        }
      } catch (err) {
        console.error('Error loading dashboard_project_metrics from Database:', err);
      }
    }

    return map;
  },

  async saveProjectMetric(
    projectId: number,
    projectName: string,
    analysis: KMLAnalysisResult
  ): Promise<DashboardProjectMetric> {
    const metric = computeMetricFromAnalysis(projectId, projectName, analysis);

    // Save in memory & localStorage
    memoryMetricsMap.set(projectId, metric);
    const localMap = loadLocalStorageMetrics();
    localMap.set(projectId, metric);
    saveLocalStorageMetrics(localMap);

    // Upsert into Database dashboard_project_metrics table
    const db = getDatabaseClient();
    if (db) {
      try {
        const row = {
          project_id: projectId,
          project_name: projectName,
          total_length_meters: metric.totalLengthMeters,
          total_length_km: metric.totalLengthKm,
          executed_water_meters: metric.executedWaterMeters,
          executed_sewage_meters: metric.executedSewageMeters,
          ongoing_meters: metric.ongoingMeters,
          remaining_meters: metric.remainingMeters,
          cancelled_meters: metric.cancelledMeters,
          permits_count: metric.permitsCount,
          unique_segments_count: metric.uniqueSegmentsCount,
          total_segments_count: metric.totalSegmentsCount,
          permits_list: metric.permitsList,
          segments_list: metric.segmentsList,
          yellow_no_permit_count: metric.yellowNoPermitCount || 0,
          yellow_no_permit_meters: metric.yellowNoPermitMeters || 0,
          yellow_no_permit_km: metric.yellowNoPermitKm || 0,
          yellow_no_permit_segments: metric.yellowNoPermitSegments || [],
          red_no_segment_count: metric.redNoSegmentCount || 0,
          red_no_segment_meters: metric.redNoSegmentMeters || 0,
          red_no_segment_km: metric.redNoSegmentKm || 0,
          red_no_segment_features: metric.redNoSegmentFeatures || [],
          updated_at: new Date().toISOString()
        };

        const { error } = await (db.from('dashboard_project_metrics') as any)
          .upsert([row], { onConflict: 'project_id' });

        if (error) {
          console.warn('Database upsert dashboard_project_metrics warning:', error.message);
        } else {
          console.log(`✅ Upserted dashboard metrics for project ID ${projectId} (${projectName})`);
        }
      } catch (err) {
        console.error('Exception upserting dashboard metrics:', err);
      }
    }

    return metric;
  },

  async syncAllProjectMetrics(
    projects: Project[],
    reportsMap: Map<number, HistoricalReport>
  ): Promise<Map<number, DashboardProjectMetric>> {
    // 1. Fetch existing metrics from Database / LocalStorage / Memory
    const existingDbMetricsMap = await this.getAllMetricsMap();
    const updatedMap = new Map<number, DashboardProjectMetric>();
    const rowsToUpsert: DashboardProjectMetric[] = [];

    for (const p of projects) {
      const pId = Number(p.id);
      if (!pId) continue;

      // STRICT MATCHING: Get saved report strictly matching project
      const savedRep = findReportForProject(p, reportsMap);
      const existingMetric = existingDbMetricsMap.get(pId);

      if (savedRep && savedRep.analysisResult && (savedRep.analysisResult.totalLengthMeters > 0 || (savedRep.analysisResult.items && savedRep.analysisResult.items.length > 0))) {
        // Recompute metric from saved report
        const metric = computeMetricFromAnalysis(pId, p.name, savedRep.analysisResult);
        updatedMap.set(pId, metric);
        memoryMetricsMap.set(pId, metric);
        rowsToUpsert.push(metric);
      } else if (existingMetric && (existingMetric.totalLengthMeters > 0 || existingMetric.totalSegmentsCount > 0 || existingMetric.permitsCount > 0)) {
        // PRESERVE existing valid metric from Database/database!
        updatedMap.set(pId, existingMetric);
        memoryMetricsMap.set(pId, existingMetric);
      } else if (savedRep && savedRep.analysisResult) {
        const metric = computeMetricFromAnalysis(pId, p.name, savedRep.analysisResult);
        updatedMap.set(pId, metric);
        memoryMetricsMap.set(pId, metric);
        rowsToUpsert.push(metric);
      } else if (existingMetric) {
        updatedMap.set(pId, existingMetric);
        memoryMetricsMap.set(pId, existingMetric);
      } else {
        // Zero metric if no report and no existing database metric
        const emptyMetric: DashboardProjectMetric = {
          projectId: pId,
          projectName: p.name,
          totalLengthMeters: 0,
          totalLengthKm: 0,
          executedWaterMeters: 0,
          executedSewageMeters: 0,
          ongoingMeters: 0,
          remainingMeters: 0,
          cancelledMeters: 0,
          permitsCount: 0,
          uniqueSegmentsCount: 0,
          totalSegmentsCount: 0,
          permitsList: [],
          segmentsList: [],
          yellowNoPermitCount: 0,
          yellowNoPermitMeters: 0,
          yellowNoPermitKm: 0,
          yellowNoPermitSegments: [],
          redNoSegmentCount: 0,
          redNoSegmentMeters: 0,
          redNoSegmentKm: 0,
          redNoSegmentFeatures: [],
          updatedAt: new Date().toISOString()
        };
        updatedMap.set(pId, emptyMetric);
        memoryMetricsMap.set(pId, emptyMetric);
      }
    }

    saveLocalStorageMetrics(updatedMap);

    // Bulk upsert ONLY updated non-zero project metrics into Database table if connected
    const db = getDatabaseClient();
    if (db && rowsToUpsert.length > 0) {
      try {
        const payload = rowsToUpsert.map(metric => ({
          project_id: metric.projectId,
          project_name: metric.projectName,
          total_length_meters: metric.totalLengthMeters,
          total_length_km: metric.totalLengthKm,
          executed_water_meters: metric.executedWaterMeters,
          executed_sewage_meters: metric.executedSewageMeters,
          ongoing_meters: metric.ongoingMeters,
          remaining_meters: metric.remainingMeters,
          cancelled_meters: metric.cancelledMeters,
          permits_count: metric.permitsCount,
          unique_segments_count: metric.uniqueSegmentsCount,
          total_segments_count: metric.totalSegmentsCount,
          permits_list: metric.permitsList,
          segments_list: metric.segmentsList,
          yellow_no_permit_count: metric.yellowNoPermitCount || 0,
          yellow_no_permit_meters: metric.yellowNoPermitMeters || 0,
          yellow_no_permit_km: metric.yellowNoPermitKm || 0,
          yellow_no_permit_segments: metric.yellowNoPermitSegments || [],
          red_no_segment_count: metric.redNoSegmentCount || 0,
          red_no_segment_meters: metric.redNoSegmentMeters || 0,
          red_no_segment_km: metric.redNoSegmentKm || 0,
          red_no_segment_features: metric.redNoSegmentFeatures || [],
          updated_at: metric.updatedAt || new Date().toISOString()
        }));

        const { error } = await (db.from('dashboard_project_metrics') as any)
          .upsert(payload, { onConflict: 'project_id' });

        if (error) {
          console.warn('Error bulk upserting dashboard_project_metrics to Database:', error.message);
        } else {
          console.log(`✅ Automatically populated/updated ${payload.length} rows in Database dashboard_project_metrics table.`);
        }
      } catch (err) {
        console.error('Exception bulk upserting dashboard metrics:', err);
      }
    }

    return updatedMap;
  }
};
