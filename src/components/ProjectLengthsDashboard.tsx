/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Project, StatusCategory, KMLAnalysisResult, HistoricalReport } from '../types';
import { ReportHistoryStore, extractPoDigits, isReportMatchingProject, findReportForProject } from '../utils/reportsStore';
import { DashboardMetricsStore, DashboardProjectMetric } from '../utils/dashboardMetricsStore';
import { generateSyntheticProjectKMLData, getStatusCategoryLabel, isValidIdentifier, cleanSegmentId, cleanPermitNo, cleanStage, isYellowItemWithoutPermit } from '../utils/myMapsKmlParser';
import { YellowNoPermitModal, YellowNoPermitItemDetail } from './YellowNoPermitModal';
import { useLanguage } from '../utils/i18n';
import * as XLSX from 'xlsx';
import {
  Ruler,
  FileCheck,
  Scissors,
  Building2,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Globe,
  MapPin,
  Droplet,
  Wind,
  BarChart3,
  Search,
  ExternalLink,
  Sparkles,
  Printer,
  Table,
  SlidersHorizontal,
  Info,
  Filter,
  FileSpreadsheet,
  FileText,
  X
} from 'lucide-react';

interface ProjectLengthsDashboardProps {
  projects: Project[];
  onSelectProject?: (project: Project) => void;
  onOpenMyMaps?: (project: Project) => void;
}

type CategoryType = 'all' | 'riyadh' | 'governorates' | 'central_sewage' | 'central_water';

interface CategoryStats {
  projectsCount: number;
  totalContractMeters: number;
  totalContractKm: number;
  totalPermitsCount: number;
  totalSegmentsCount: number;
  uniqueSegmentsCount: number;
  yellowNoPermitItems: YellowNoPermitItemDetail[];
  statusBreakdown: Record<StatusCategory, {
    category: StatusCategory;
    label: string;
    hex: string;
    totalMeters: number;
    totalKm: number;
    percentage: number;
    permitCount: number;
    segmentCount: number;
    uniqueSegmentCount: number;
    projectsCount: number;
    yellowNoPermitCount?: number;
    yellowNoPermitMeters?: number;
    yellowNoPermitKm?: number;
  }>;
}

export function ProjectLengthsDashboard({ projects, onSelectProject, onOpenMyMaps }: ProjectLengthsDashboardProps) {
  const { t, language, translateDynamic, isRtl } = useLanguage();
  const [activeCategory, setActiveCategory] = useState<CategoryType>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedScope, setSelectedScope] = useState<'all' | 'water' | 'sewage'>('all');
  const [reportsMap, setReportsMap] = useState<Map<number, HistoricalReport>>(new Map());
  const [metricsMap, setMetricsMap] = useState<Map<number, DashboardProjectMetric>>(new Map());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showComparisonTable, setShowComparisonTable] = useState<boolean>(true);
  const [selectedReportModalProject, setSelectedReportModalProject] = useState<Project | null>(null);
  const [isYellowNoPermitModalOpen, setIsYellowNoPermitModalOpen] = useState<boolean>(false);
  const [yellowModalProjectScope, setYellowModalProjectScope] = useState<string>('جميع المشاريع');
  const [selectedYellowModalItems, setSelectedYellowModalItems] = useState<YellowNoPermitItemDetail[] | null>(null);

  // Dynamically compute list of available statuses from projects
  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    projects.forEach(p => {
      if (p.status && p.status.trim()) {
        set.add(p.status.trim());
      }
    });
    return Array.from(set);
  }, [projects]);

  // Helper to find a saved report strictly matching the project by ID, PO number, or project name
  const findReportForProject = (p: Project, map: Map<number, HistoricalReport>): HistoricalReport | undefined => {
    if (!p) return undefined;
    const repById = map.get(p.id);
    if (repById && isReportMatchingProject(repById.projectId, repById.projectName, p.id, p.name, p.po)) {
      return repById;
    }

    for (const rep of map.values()) {
      if (isReportMatchingProject(rep.projectId, rep.projectName, p.id, p.name, p.po)) {
        return rep;
      }
    }

    return undefined;
  };

  // Load latest reports and dashboard metrics for all projects from Database / dedicated store
  const loadReportsAndMetrics = async () => {
    setIsLoading(true);
    try {
      const map = await ReportHistoryStore.getAllLatestReportsMap(projects);
      setReportsMap(map);

      // Sync and load dedicated dashboard metrics table
      const metrics = await DashboardMetricsStore.syncAllProjectMetrics(projects, map);
      setMetricsMap(metrics);
    } catch (err) {
      console.error('Error loading reports & dashboard metrics map:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReportsAndMetrics();
  }, [projects]);

  // Helper functions for categorization
  const isWaterProject = (p: Project): boolean => {
    const scopeStr = (p.scope || '').toLowerCase();
    const nameStr = (p.name || '').toLowerCase();
    const classStr = (p.classification || '').toLowerCase();

    // Explicit sewage keywords (e.g. sewage networks, wastewater treatment, etc.)
    const isExplicitSewageName = nameStr.includes('مياه الصرف') || 
                                 nameStr.includes('صرف صحي') || 
                                 nameStr.includes('شبكات صرف') || 
                                 nameStr.includes('خطوط صرف') || 
                                 nameStr.includes('المعالجة البيئية') ||
                                 scopeStr.includes('صرف صحي');

    if (isExplicitSewageName) {
      // Unless the name explicitly mentions water network automation or water supply
      if (!nameStr.includes('أتمتة شبكة المياه') && !nameStr.includes('شبكة المياه')) {
        return false;
      }
    }

    if (nameStr.includes('أتمتة شبكة المياه') || nameStr.includes('شبكة المياه') || nameStr.includes('شبكات المياه') || nameStr.includes('خطوط المياه') || nameStr.includes('خزانات') || nameStr.includes('تنقية المياه') || nameStr.includes('تغذية المياه') || nameStr.includes('المخطط الاستراتيجي للمياه')) {
      return true;
    }

    if (scopeStr.includes('مياه') && !scopeStr.includes('صرف')) {
      return true;
    }

    if (classStr.includes('مياه') || classStr.includes('خزان')) {
      return true;
    }

    return false;
  };

  const isSewageProject = (p: Project): boolean => {
    return !isWaterProject(p);
  };

  const isRiyadhProject = (p: Project): boolean => {
    const text = ((p.region || '') + ' ' + (p.businessUnit || '') + ' ' + (p.name || '')).toLowerCase();
    const isGov = text.includes('محافظ') || text.includes('محافظة');
    const isRiyadh = text.includes('الرياض');
    return isRiyadh && !isGov;
  };

  const isGovernoratesProject = (p: Project): boolean => {
    return !isRiyadhProject(p);
  };

  const isCentralSewageProject = (p: Project): boolean => {
    return isSewageProject(p);
  };

  const isCentralWaterProject = (p: Project): boolean => {
    return isWaterProject(p);
  };

  const filterProjectsByCategory = (cat: CategoryType, list: Project[], scopeFilter: 'all' | 'water' | 'sewage' = 'all'): Project[] => {
    let catList: Project[] = [];
    switch (cat) {
      case 'riyadh':
        catList = list.filter(isRiyadhProject);
        break;
      case 'governorates':
        catList = list.filter(isGovernoratesProject);
        break;
      case 'central_sewage':
        catList = list.filter(isCentralSewageProject);
        break;
      case 'central_water':
        catList = list.filter(isCentralWaterProject);
        break;
      case 'all':
      default:
        catList = list;
        break;
    }

    if (scopeFilter === 'water') {
      return catList.filter(isWaterProject);
    }
    if (scopeFilter === 'sewage') {
      return catList.filter(isSewageProject);
    }
    return catList;
  };

  const filterProjectsByStatus = (status: string, list: Project[]): Project[] => {
    if (!status || status === 'all') return list;
    return list.filter(p => {
      const s = (p.status || '').trim();
      if (status === 'جاري') {
        return (s.includes('جاري') && !s.includes('استلام')) || s.includes('تنفيذ');
      }
      if (status === 'مسلم ابتدائي') {
        return s.includes('مسلم ابتدائي');
      }
      if (status === 'جاري الاستلام الابتدائي') {
        return s.includes('جاري الاستلام') || s.includes('استلام ابتدائي');
      }
      if (status === 'مكتمل') {
        return s.includes('مكتمل') || s.includes('انهاء العقد') || s.includes('إنهاء العقد');
      }
      if (status === 'مسحوب') {
        return s.includes('مسحوب');
      }
      if (status === 'معلق') {
        return s.includes('معلق') || s.includes('متوقف');
      }
      return s === status || s.includes(status);
    });
  };

  const getValidMetricForProject = (p: Project): DashboardProjectMetric | undefined => {
    const metric = metricsMap.get(p.id);
    if (!metric) return undefined;
    if (metric.projectId === p.id) return metric;
    return undefined;
  };

  // Helper to format integer metrics cleanly so 0 and numbers display clearly
  const formatVal = (val: number | undefined | null): string => {
    if (val === undefined || val === null || isNaN(val)) return '0';
    return val.toLocaleString('en-US');
  };

  // Helper to get KML analysis result for a project strictly from stored reports in database or null if none
  const getAnalysisForProject = (p: Project): KMLAnalysisResult | null => {
    const saved = findReportForProject(p, reportsMap);
    if (saved && saved.analysisResult) {
      return saved.analysisResult;
    }
    return null;
  };

  // Calculate detailed statistics for a subset of projects strictly from database stored reports or detailed line data
  const computeCategoryStats = (catProjects: Project[]): CategoryStats => {
    let totalMeters = 0;
    let globalSegmentTotalCount = 0;
    const globalPermitSet = new Set<string>();
    const globalSegmentSet = new Set<string>();

    const categories: StatusCategory[] = ['executed_water', 'executed_sewage', 'ongoing', 'remaining', 'cancelled'];
    const collectedYellowNoPermitItems: YellowNoPermitItemDetail[] = [];

    const breakdownMap: Record<StatusCategory, {
      category: StatusCategory;
      label: string;
      hex: string;
      totalMeters: number;
      totalKm: number;
      percentage: number;
      permitSet: Set<string>;
      segmentSet: Set<string>;
      segmentTotalCount: number;
      projectSet: Set<number>;
      yellowNoPermitCount: number;
      yellowNoPermitMeters: number;
    }> = {
      executed_water: { category: 'executed_water', label: 'منفذ - شبكات مياه', hex: '#01579B', totalMeters: 0, totalKm: 0, percentage: 0, permitSet: new Set(), segmentSet: new Set(), segmentTotalCount: 0, projectSet: new Set(), yellowNoPermitCount: 0, yellowNoPermitMeters: 0 },
      executed_sewage: { category: 'executed_sewage', label: 'منفذ - شبكات صرف صحي', hex: '#097138', totalMeters: 0, totalKm: 0, percentage: 0, permitSet: new Set(), segmentSet: new Set(), segmentTotalCount: 0, projectSet: new Set(), yellowNoPermitCount: 0, yellowNoPermitMeters: 0 },
      ongoing: { category: 'ongoing', label: 'جاري العمل / التنفيذ', hex: '#ffea00', totalMeters: 0, totalKm: 0, percentage: 0, permitSet: new Set(), segmentSet: new Set(), segmentTotalCount: 0, projectSet: new Set(), yellowNoPermitCount: 0, yellowNoPermitMeters: 0 },
      remaining: { category: 'remaining', label: 'أعمال متبقية', hex: '#a52714', totalMeters: 0, totalKm: 0, percentage: 0, permitSet: new Set(), segmentSet: new Set(), segmentTotalCount: 0, projectSet: new Set(), yellowNoPermitCount: 0, yellowNoPermitMeters: 0 },
      cancelled: { category: 'cancelled', label: 'خطوط تم إلغائها', hex: '#F48FB1', totalMeters: 0, totalKm: 0, percentage: 0, permitSet: new Set(), segmentSet: new Set(), segmentTotalCount: 0, projectSet: new Set(), yellowNoPermitCount: 0, yellowNoPermitMeters: 0 }
    };

    catProjects.forEach(p => {
      const res = getAnalysisForProject(p);
      const metric = getValidMetricForProject(p);

      if (res && (res.totalLengthMeters > 0 || (res.items && res.items.length > 0))) {
        let projTotalMeters = res.totalLengthMeters || 0;
        if (projTotalMeters === 0 && res.items && res.items.length > 0) {
          projTotalMeters = res.items.reduce((sum, item) => sum + (item.lengthMeters || 0), 0);
        }

        totalMeters += projTotalMeters;

        const catKeyMap: Record<StatusCategory, 'executedWater' | 'executedSewage' | 'ongoing' | 'remaining' | 'cancelled'> = {
          'executed_water': 'executedWater',
          'executed_sewage': 'executedSewage',
          'ongoing': 'ongoing',
          'remaining': 'remaining',
          'cancelled': 'cancelled'
        };

        categories.forEach(cat => {
          const altKey = catKeyMap[cat];
          let catMeters = res.colorBreakdown?.[cat]?.totalLengthMeters || (res.colorBreakdown as any)?.[altKey]?.totalLengthMeters || 0;
          if (catMeters === 0 && res.items && res.items.length > 0) {
            catMeters = res.items
              .filter(it => it.statusCategory === cat)
              .reduce((sum, item) => sum + (item.lengthMeters || 0), 0);
          }

          if (catMeters > 0) {
            breakdownMap[cat].totalMeters += catMeters;
            breakdownMap[cat].projectSet.add(p.id);
          }
        });

        // Aggregate Permit No and Segment ID values broken down by category from res
        const pNosByCat = (res.colorBreakdown as any)?.permitNosByStatus || res.permitNosByStatus;
        const sIdsByCat = (res.colorBreakdown as any)?.segmentIdsByStatus || res.segmentIdsByStatus;

        let projYellowCount = 0;
        let projYellowMeters = 0;

        if (res.items && Array.isArray(res.items) && res.items.length > 0) {
          res.items.forEach(item => {
            const cat = item.statusCategory || 'ongoing';

            if (isYellowItemWithoutPermit(item)) {
              projYellowCount++;
              projYellowMeters += (item.lengthMeters || 0);
              breakdownMap.ongoing.yellowNoPermitCount++;
              breakdownMap.ongoing.yellowNoPermitMeters += (item.lengthMeters || 0);

              collectedYellowNoPermitItems.push({
                id: item.id || `yellow-${p.id}-${collectedYellowNoPermitItems.length + 1}`,
                projectId: p.id,
                projectName: p.name,
                po: p.po,
                contractor: item.contractor || p.contractor || 'غير محدد',
                classification: p.classification,
                region: p.region,
                subProgram: p.subProgram,
                scope: p.scope,
                segmentId: item.segmentId || 'غير محدد',
                permitNo: item.permitNo || '',
                name: item.name || `قطاع ${item.segmentId || ''}`,
                lengthMeters: item.lengthMeters || 0,
                lengthKm: item.lengthKm || Number(((item.lengthMeters || 0) / 1000).toFixed(3)),
                stage: item.stage || 'غير متوفر',
                streetName: item.streetName || item.name,
                district: item.district,
                innerDiameter: item.innerDiameter,
                zone: item.zone,
                drillingType: item.drillingType,
                centerLat: item.centerLat,
                centerLng: item.centerLng,
                googleMapsUrl: item.googleMapsUrl,
                coordinates: item.coordinates,
                featureItem: item,
                projectObj: p
              });
            }

            const pNo = item.permitNo || (item as any)['permitNo'] || (item as any)['Permit No'] || (item as any)['permit_no'];
            const cleanP = cleanPermitNo(pNo);
            if (isValidIdentifier(cleanP)) {
              globalPermitSet.add(cleanP);
              if (breakdownMap[cat]) {
                breakdownMap[cat].permitSet.add(cleanP);
              }
            }

            const sId = item.segmentId || (item as any)['segmentId'] || (item as any)['Segment ID'] || (item as any)['segment_id'];
            const cleanS = cleanSegmentId(sId);
            if (isValidIdentifier(cleanS)) {
              globalSegmentSet.add(cleanS);
              if (breakdownMap[cat]) {
                breakdownMap[cat].segmentSet.add(cleanS);
                breakdownMap[cat].segmentTotalCount++;
              }
              globalSegmentTotalCount++;
            }
          });
        }

        // If items loop did not yield yellow without permit, check res.yellowNoPermitStats or colorBreakdown or metric
        if (projYellowCount === 0) {
          const ynResCount = res.yellowNoPermitStats?.count || (res.colorBreakdown?.ongoing as any)?.yellowNoPermitCount || (res.colorBreakdown as any)?.yellowNoPermitStats?.count || metric?.yellowNoPermitCount || 0;
          const ynResMeters = res.yellowNoPermitStats?.lengthMeters || (res.colorBreakdown?.ongoing as any)?.yellowNoPermitMeters || (res.colorBreakdown as any)?.yellowNoPermitStats?.lengthMeters || metric?.yellowNoPermitMeters || 0;
          const ynSegments = res.yellowNoPermitStats?.segments || (res.colorBreakdown?.ongoing as any)?.yellowNoPermitSegments || (res.colorBreakdown as any)?.yellowNoPermitStats?.segments || metric?.yellowNoPermitSegments || [];

          if (ynResCount > 0) {
            breakdownMap.ongoing.yellowNoPermitCount += ynResCount;
            breakdownMap.ongoing.yellowNoPermitMeters += ynResMeters;

            if (ynSegments && ynSegments.length > 0) {
              ynSegments.forEach((sId: string, sIdx: number) => {
                collectedYellowNoPermitItems.push({
                  id: `yellow-res-${p.id}-${sIdx + 1}`,
                  projectId: p.id,
                  projectName: p.name,
                  po: p.po,
                  contractor: p.contractor || 'غير محدد',
                  classification: p.classification,
                  region: p.region,
                  subProgram: p.subProgram,
                  scope: p.scope,
                  segmentId: sId,
                  permitNo: '',
                  name: `قطاع ${sId}`,
                  lengthMeters: Math.round(ynResMeters / (ynSegments.length || 1)),
                  lengthKm: Number((ynResMeters / (ynSegments.length || 1) / 1000).toFixed(3)),
                  stage: 'جاري العمل',
                  streetName: p.name,
                  projectObj: p
                });
              });
            } else {
              for (let i = 0; i < ynResCount; i++) {
                collectedYellowNoPermitItems.push({
                  id: `yellow-res-${p.id}-${i + 1}`,
                  projectId: p.id,
                  projectName: p.name,
                  po: p.po,
                  contractor: p.contractor || 'غير محدد',
                  classification: p.classification,
                  region: p.region,
                  subProgram: p.subProgram,
                  scope: p.scope,
                  segmentId: `قطاع ${i + 1}`,
                  permitNo: '',
                  name: `قطاع جاري بدون فسح ${i + 1}`,
                  lengthMeters: Math.round(ynResMeters / ynResCount),
                  lengthKm: Number((ynResMeters / ynResCount / 1000).toFixed(3)),
                  stage: 'جاري العمل',
                  streetName: p.name,
                  projectObj: p
                });
              }
            }
          }
        }

        if (!res.items || !Array.isArray(res.items) || res.items.length === 0) {
          categories.forEach(cat => {
            const key = catKeyMap[cat];
            const pList = pNosByCat ? (pNosByCat[key] || pNosByCat[cat]) : null;
            if (Array.isArray(pList)) {
              pList.forEach((pNo: any) => {
                const cleanP = cleanPermitNo(pNo);
                if (isValidIdentifier(cleanP)) {
                  globalPermitSet.add(cleanP);
                  if (breakdownMap[cat]) {
                    breakdownMap[cat].permitSet.add(cleanP);
                  }
                }
              });
            }

            const sList = sIdsByCat ? (sIdsByCat[key] || sIdsByCat[cat]) : null;
            if (Array.isArray(sList)) {
              sList.forEach((sId: any) => {
                const cleanS = cleanSegmentId(sId);
                if (isValidIdentifier(cleanS)) {
                  globalSegmentSet.add(cleanS);
                  if (breakdownMap[cat]) {
                    breakdownMap[cat].segmentSet.add(cleanS);
                    breakdownMap[cat].segmentTotalCount++;
                  }
                }
              });
            }

            const cbSegCount = res.colorBreakdown?.[cat]?.segmentCount || (res.colorBreakdown as any)?.[key]?.segmentCount || 0;
            if (breakdownMap[cat].segmentTotalCount < cbSegCount) {
              breakdownMap[cat].segmentTotalCount = cbSegCount;
            }
          });

          const featCount = res.totalFeaturesCount || 0;
          const totalCatSegs = Object.values(breakdownMap).reduce((acc, b) => acc + b.segmentTotalCount, 0);
          globalSegmentTotalCount += Math.max(featCount, totalCatSegs);
        }
      } else if (metric && metric.totalLengthMeters > 0) {
        totalMeters += metric.totalLengthMeters;

        if (metric.executedWaterMeters > 0) {
          breakdownMap.executed_water.totalMeters += metric.executedWaterMeters;
          breakdownMap.executed_water.projectSet.add(p.id);
        }
        if (metric.executedSewageMeters > 0) {
          breakdownMap.executed_sewage.totalMeters += metric.executedSewageMeters;
          breakdownMap.executed_sewage.projectSet.add(p.id);
        }
        if (metric.ongoingMeters > 0) {
          breakdownMap.ongoing.totalMeters += metric.ongoingMeters;
          breakdownMap.ongoing.projectSet.add(p.id);
        }
        if (metric.remainingMeters > 0) {
          breakdownMap.remaining.totalMeters += metric.remainingMeters;
          breakdownMap.remaining.projectSet.add(p.id);
        }
        if (metric.cancelledMeters > 0) {
          breakdownMap.cancelled.totalMeters += metric.cancelledMeters;
          breakdownMap.cancelled.projectSet.add(p.id);
        }

        // Add yellowNoPermit metrics if available from metric
        if (metric.yellowNoPermitCount && metric.yellowNoPermitCount > 0) {
          breakdownMap.ongoing.yellowNoPermitCount += metric.yellowNoPermitCount;
          breakdownMap.ongoing.yellowNoPermitMeters += (metric.yellowNoPermitMeters || 0);

          if (metric.yellowNoPermitSegments && metric.yellowNoPermitSegments.length > 0) {
            metric.yellowNoPermitSegments.forEach((sId, sIdx) => {
              collectedYellowNoPermitItems.push({
                id: `yellow-metric-${p.id}-${sIdx + 1}`,
                projectId: p.id,
                projectName: p.name,
                po: p.po,
                contractor: p.contractor || 'غير محدد',
                classification: p.classification,
                region: p.region,
                subProgram: p.subProgram,
                scope: p.scope,
                segmentId: sId,
                permitNo: '',
                name: `قطاع ${sId}`,
                lengthMeters: Math.round((metric.yellowNoPermitMeters || 0) / (metric.yellowNoPermitSegments?.length || 1)),
                lengthKm: Number(((metric.yellowNoPermitMeters || 0) / (metric.yellowNoPermitSegments?.length || 1) / 1000).toFixed(3)),
                stage: 'جاري العمل',
                streetName: p.name,
                projectObj: p
              });
            });
          }
        }

        metric.permitsList.forEach(pNo => {
          const cleanP = cleanPermitNo(pNo);
          if (isValidIdentifier(cleanP)) {
            globalPermitSet.add(cleanP);
            breakdownMap.ongoing.permitSet.add(cleanP);
          }
        });

        metric.segmentsList.forEach(sId => {
          const cleanS = cleanSegmentId(sId);
          if (isValidIdentifier(cleanS)) {
            globalSegmentSet.add(cleanS);
            breakdownMap.ongoing.segmentSet.add(cleanS);
          }
        });

        globalSegmentTotalCount += metric.totalSegmentsCount;
      }
    });

    const statusBreakdownFinal: CategoryStats['statusBreakdown'] = {
      executed_water: {
        category: 'executed_water',
        label: getStatusCategoryLabel('executed_water'),
        hex: '#01579B',
        totalMeters: breakdownMap.executed_water.totalMeters,
        totalKm: Number((breakdownMap.executed_water.totalMeters / 1000).toFixed(3)),
        percentage: totalMeters > 0 ? Number(((breakdownMap.executed_water.totalMeters / totalMeters) * 100).toFixed(1)) : 0,
        permitCount: breakdownMap.executed_water.permitSet.size,
        segmentCount: breakdownMap.executed_water.segmentTotalCount > 0 ? breakdownMap.executed_water.segmentTotalCount : breakdownMap.executed_water.segmentSet.size,
        uniqueSegmentCount: breakdownMap.executed_water.segmentSet.size,
        projectsCount: breakdownMap.executed_water.projectSet.size
      },
      executed_sewage: {
        category: 'executed_sewage',
        label: getStatusCategoryLabel('executed_sewage'),
        hex: '#097138',
        totalMeters: breakdownMap.executed_sewage.totalMeters,
        totalKm: Number((breakdownMap.executed_sewage.totalMeters / 1000).toFixed(3)),
        percentage: totalMeters > 0 ? Number(((breakdownMap.executed_sewage.totalMeters / totalMeters) * 100).toFixed(1)) : 0,
        permitCount: breakdownMap.executed_sewage.permitSet.size,
        segmentCount: breakdownMap.executed_sewage.segmentTotalCount > 0 ? breakdownMap.executed_sewage.segmentTotalCount : breakdownMap.executed_sewage.segmentSet.size,
        uniqueSegmentCount: breakdownMap.executed_sewage.segmentSet.size,
        projectsCount: breakdownMap.executed_sewage.projectSet.size
      },
      ongoing: {
        category: 'ongoing',
        label: getStatusCategoryLabel('ongoing'),
        hex: '#ffea00',
        totalMeters: breakdownMap.ongoing.totalMeters,
        totalKm: Number((breakdownMap.ongoing.totalMeters / 1000).toFixed(3)),
        percentage: totalMeters > 0 ? Number(((breakdownMap.ongoing.totalMeters / totalMeters) * 100).toFixed(1)) : 0,
        permitCount: breakdownMap.ongoing.permitSet.size,
        segmentCount: breakdownMap.ongoing.segmentTotalCount > 0 ? breakdownMap.ongoing.segmentTotalCount : breakdownMap.ongoing.segmentSet.size,
        uniqueSegmentCount: breakdownMap.ongoing.segmentSet.size,
        projectsCount: breakdownMap.ongoing.projectSet.size,
        yellowNoPermitCount: breakdownMap.ongoing.yellowNoPermitCount,
        yellowNoPermitMeters: breakdownMap.ongoing.yellowNoPermitMeters,
        yellowNoPermitKm: Number((breakdownMap.ongoing.yellowNoPermitMeters / 1000).toFixed(3))
      },
      remaining: {
        category: 'remaining',
        label: getStatusCategoryLabel('remaining'),
        hex: '#a52714',
        totalMeters: breakdownMap.remaining.totalMeters,
        totalKm: Number((breakdownMap.remaining.totalMeters / 1000).toFixed(3)),
        percentage: totalMeters > 0 ? Number(((breakdownMap.remaining.totalMeters / totalMeters) * 100).toFixed(1)) : 0,
        permitCount: breakdownMap.remaining.permitSet.size,
        segmentCount: breakdownMap.remaining.segmentTotalCount > 0 ? breakdownMap.remaining.segmentTotalCount : breakdownMap.remaining.segmentSet.size,
        uniqueSegmentCount: breakdownMap.remaining.segmentSet.size,
        projectsCount: breakdownMap.remaining.projectSet.size
      },
      cancelled: {
        category: 'cancelled',
        label: getStatusCategoryLabel('cancelled'),
        hex: '#F48FB1',
        totalMeters: breakdownMap.cancelled.totalMeters,
        totalKm: Number((breakdownMap.cancelled.totalMeters / 1000).toFixed(3)),
        percentage: totalMeters > 0 ? Number(((breakdownMap.cancelled.totalMeters / totalMeters) * 100).toFixed(1)) : 0,
        permitCount: breakdownMap.cancelled.permitSet.size,
        segmentCount: breakdownMap.cancelled.segmentTotalCount > 0 ? breakdownMap.cancelled.segmentTotalCount : breakdownMap.cancelled.segmentSet.size,
        uniqueSegmentCount: breakdownMap.cancelled.segmentSet.size,
        projectsCount: breakdownMap.cancelled.projectSet.size
      }
    };

    return {
      projectsCount: catProjects.length,
      totalContractMeters: totalMeters,
      totalContractKm: Number((totalMeters / 1000).toFixed(3)),
      totalPermitsCount: globalPermitSet.size,
      totalSegmentsCount: globalSegmentTotalCount > 0 ? globalSegmentTotalCount : globalSegmentSet.size,
      uniqueSegmentsCount: globalSegmentSet.size,
      yellowNoPermitItems: collectedYellowNoPermitItems,
      statusBreakdown: statusBreakdownFinal
    };
  };

  // Base category projects before scope filter
  const currentCategoryBaseProjects = useMemo(() => {
    return filterProjectsByCategory(activeCategory, projects, 'all');
  }, [activeCategory, projects]);

  const waterScopeCount = useMemo(() => {
    return currentCategoryBaseProjects.filter(isWaterProject).length;
  }, [currentCategoryBaseProjects]);

  const sewageScopeCount = useMemo(() => {
    return currentCategoryBaseProjects.filter(isSewageProject).length;
  }, [currentCategoryBaseProjects]);

  // Filtered projects for active tab (includes scope filter & status filter)
  const activeCategoryProjects = useMemo(() => {
    const catFiltered = filterProjectsByCategory(activeCategory, projects, selectedScope);
    return filterProjectsByStatus(selectedStatus, catFiltered);
  }, [activeCategory, selectedScope, selectedStatus, projects]);

  // Calculated stats for active tab
  const activeStats = useMemo(() => {
    return computeCategoryStats(activeCategoryProjects);
  }, [activeCategoryProjects, reportsMap, metricsMap]);

  // Calculated stats for all 5 categories for the side-by-side comparison table
  const allCategoryStatsMap = useMemo(() => {
    return {
      all: computeCategoryStats(filterProjectsByStatus(selectedStatus, filterProjectsByCategory('all', projects))),
      riyadh: computeCategoryStats(filterProjectsByStatus(selectedStatus, filterProjectsByCategory('riyadh', projects))),
      governorates: computeCategoryStats(filterProjectsByStatus(selectedStatus, filterProjectsByCategory('governorates', projects))),
      central_sewage: computeCategoryStats(filterProjectsByStatus(selectedStatus, filterProjectsByCategory('central_sewage', projects))),
      central_water: computeCategoryStats(filterProjectsByStatus(selectedStatus, filterProjectsByCategory('central_water', projects)))
    };
  }, [projects, reportsMap, metricsMap, selectedStatus]);

  // Project list table search filter
  const searchedProjects = useMemo(() => {
    if (!searchTerm.trim()) return activeCategoryProjects;
    const term = searchTerm.trim().toLowerCase();
    return activeCategoryProjects.filter(p => 
      (p.name || '').toLowerCase().includes(term) ||
      (p.po || '').toLowerCase().includes(term) ||
      (p.operationalNumber || '').toLowerCase().includes(term) ||
      (p.contractor || '').toLowerCase().includes(term) ||
      (p.region || '').toLowerCase().includes(term)
    );
  }, [activeCategoryProjects, searchTerm]);

  // Printable report handler
  const handlePrint = () => {
    window.print();
  };

  // Excel Export Handler for Detailed Projects List
  const handleExportProjectsToExcel = () => {
    const exportRows = searchedProjects.map((p, idx) => {
      const metric = getValidMetricForProject(p);
      const res = getAnalysisForProject(p);

      const totalKm = metric ? metric.totalLengthKm : (res ? res.totalLengthKm : 0);
      const ongoingKm = metric ? Number((metric.ongoingMeters / 1000).toFixed(3)) : (res ? (res.colorBreakdown?.ongoing?.totalLengthKm || 0) : 0);
      const remainingKm = metric ? Number((metric.remainingMeters / 1000).toFixed(3)) : (res ? (res.colorBreakdown?.remaining?.totalLengthKm || 0) : 0);
      
      const executedWaterKm = metric 
        ? Number((metric.executedWaterMeters / 1000).toFixed(3)) 
        : (res ? (res.colorBreakdown?.executed_water?.totalLengthKm || (res.colorBreakdown as any)?.executedWater?.totalLengthKm || 0) : 0);

      const executedSewageKm = metric 
        ? Number((metric.executedSewageMeters / 1000).toFixed(3)) 
        : (res ? (res.colorBreakdown?.executed_sewage?.totalLengthKm || (res.colorBreakdown as any)?.executedSewage?.totalLengthKm || 0) : 0);

      const cancelledKm = metric 
        ? Number((metric.cancelledMeters / 1000).toFixed(3)) 
        : (res ? (res.colorBreakdown?.cancelled?.totalLengthKm || 0) : 0);

      const permitCount = metric 
        ? metric.permitsCount 
        : (res && res.permitNosByStatus 
            ? new Set(Object.values(res.permitNosByStatus).flat().filter(isValidIdentifier)).size 
            : 0);

      const uniqueSegmentCount = metric 
        ? metric.uniqueSegmentsCount 
        : (res && res.segmentIdsByStatus 
            ? new Set(Object.values(res.segmentIdsByStatus).flat().filter(isValidIdentifier)).size 
            : 0);

      const totalSegmentCount = metric 
        ? metric.totalSegmentsCount 
        : uniqueSegmentCount;

      return {
        'م': idx + 1,
        'معرف المشروع': p.id,
        'اسم المشروع / أمر الشراء': p.name || '-',
        'رقم أمر الشراء (PO)': p.po || '-',
        'الرقم التشغيلي / رقم العقد': p.operationalNumber || '-',
        'المقاول': p.contractor || 'غير محدد',
        'تصنيف المشروع': p.classification || 'غير محدد',
        'البرنامج / القطاع التابع له': p.subProgram || p.scope || 'غير محدد',
        'مجال العمل': p.scope || 'غير محدد',
        'الاستشاري': p.consultant || 'غير محدد',
        'المنطقة / النطاق': p.region || 'القطاع الأوسط',
        'وحدة الأعمال': p.businessUnit || 'وحدة أعمال الرياض',
        'حالة العقد': p.status || 'جاري',
        'إجمالي الأطوال بالعقد (كم)': totalKm,
        'الجاري تنفيذه (كم)': ongoingKm,
        'المتبقي (كم)': remainingKm,
        'المنفذ - شبكات مياه (كم)': executedWaterKm,
        'المنفذ - شبكات صرف صحي (كم)': executedSewageKm,
        'خطوط ملغاة (كم)': cancelledKm,
        'أعداد الرخص (Permit No)': permitCount,
        'أعداد السجمنت الفريد (Segment ID)': uniqueSegmentCount,
        'إجمالي عناصر السجمنت': totalSegmentCount
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet['!views'] = [{ RTL: true }];

    if (exportRows.length > 0) {
      const keys = Object.keys(exportRows[0]);
      worksheet['!cols'] = keys.map(key => ({
        wch: Math.max(key.length * 2.2, 16)
      }));
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'حصر أطوال المشاريع');

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `قائمة_المشاريع_وحصر_الأطوال_${dateStr}.xlsx`);
  };

  // Excel Export Handler for Segment ID detailed data
  const handleExportSegmentsToExcel = (targetProjects?: Project[]) => {
    const projectsToExport = targetProjects || searchedProjects;
    const exportRows: any[] = [];

    projectsToExport.forEach(p => {
      const savedReport = findReportForProject(p, reportsMap);
      const metric = getValidMetricForProject(p);
      const res = savedReport?.analysisResult || getAnalysisForProject(p);
      const items = res?.items || [];

      // Filter items that have a valid segmentId
      const validItems = items.filter(it => it && isValidIdentifier(it.segmentId));

      if (validItems.length > 0) {
        validItems.forEach(item => {
          let lat: number | string = '';
          let lng: number | string = '';

          if (item.centerLat !== undefined && item.centerLat !== null && !isNaN(Number(item.centerLat))) {
            lat = Number(item.centerLat);
          } else if (item.coordinates && item.coordinates.length > 0 && item.coordinates[0] && item.coordinates[0].length >= 2) {
            lat = Number(item.coordinates[0][1]);
          }

          if (item.centerLng !== undefined && item.centerLng !== null && !isNaN(Number(item.centerLng))) {
            lng = Number(item.centerLng);
          } else if (item.coordinates && item.coordinates.length > 0 && item.coordinates[0] && item.coordinates[0].length >= 2) {
            lng = Number(item.coordinates[0][0]);
          }

          // Determine explicit element map link registered in element data
          let mapLink = item.googleMapsUrl || '';

          // Check if description has an embedded URL registered for the element
          if (!mapLink && item.description) {
            const descUrlMatch = item.description.match(/href=["'](https?:\/\/[^"'>]+)["']/i)
                              || item.description.match(/(https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|earth\.google\.com|maps\.google\.com)[^\s"'<>]+)/i)
                              || item.description.match(/(https?:\/\/[^\s"'<>]+)/i);
            if (descUrlMatch && descUrlMatch[1]) {
              mapLink = descUrlMatch[1];
            }
          }

          if (!mapLink && lat !== '' && lng !== '') {
            mapLink = `https://www.google.com/maps?q=${lat},${lng}`;
          }

          exportRows.push({
            'اسم المشروع': p.name || item.kmlProjectName || 'غير محدد',
            'البرنامج / القطاع': p.subProgram || p.scope || 'غير محدد',
            'اسم المقاول': p.contractor || item.contractor || 'غير محدد',
            'Segment ID (معرف القطاع)': cleanSegmentId(item.segmentId),
            'القطر': item.innerDiameter || 'غير محدد',
            'خط العرض (Latitude)': lat !== '' ? lat : 'غير متوفر',
            'خط الطول (Longitude)': lng !== '' ? lng : 'غير متوفر',
            'رابط الموقع للعنصر على الخريطة': mapLink || 'غير متوفر',
            'أمر الشراء (PO)': p.po || 'غير محدد',
            'رقم الرخصة (Permit No)': item.permitNo && isValidIdentifier(item.permitNo) ? cleanPermitNo(item.permitNo) : 'غير محدد',
            'حالة العنصر / المرحلة': cleanStage(item.stage) !== 'غير متوفر' ? cleanStage(item.stage) : (item.statusLabel || 'غير متوفر'),
            'الطول (متر)': item.lengthMeters ? Number(item.lengthMeters.toFixed(2)) : 0,
          });
        });
      } else {
        // Fallback: Check segmentIdsByStatus or metric.segmentsList
        const segmentsList: string[] = res?.segmentIdsByStatus
          ? Array.from(new Set(Object.values(res.segmentIdsByStatus).flat().filter(isValidIdentifier)))
          : (metric && metric.segmentsList && metric.segmentsList.length > 0
            ? metric.segmentsList.filter(isValidIdentifier)
            : []);

        segmentsList.forEach(segId => {
          const matchingItem = res?.items?.find(it => cleanSegmentId(it.segmentId) === cleanSegmentId(segId));
          let lat: number | string = matchingItem?.centerLat ?? (p.y ? Number(p.y) : '');
          let lng: number | string = matchingItem?.centerLng ?? (p.x ? Number(p.x) : '');
          let mapLink = matchingItem?.googleMapsUrl || '';

          if (!mapLink && matchingItem?.description) {
            const descUrlMatch = matchingItem.description.match(/href=["'](https?:\/\/[^"'>]+)["']/i)
                              || matchingItem.description.match(/(https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|earth\.google\.com|maps\.google\.com)[^\s"'<>]+)/i)
                              || matchingItem.description.match(/(https?:\/\/[^\s"'<>]+)/i);
            if (descUrlMatch && descUrlMatch[1]) {
              mapLink = descUrlMatch[1];
            }
          }

          if (!mapLink && lat !== '' && lng !== '') {
            mapLink = `https://www.google.com/maps?q=${lat},${lng}`;
          }

          exportRows.push({
            'اسم المشروع': p.name || 'غير محدد',
            'البرنامج / القطاع': p.subProgram || p.scope || 'غير محدد',
            'اسم المقاول': p.contractor || 'غير محدد',
            'Segment ID (معرف القطاع)': cleanSegmentId(segId),
            'القطر': matchingItem?.innerDiameter || 'غير محدد',
            'خط العرض (Latitude)': lat !== '' ? lat : 'غير متوفر',
            'خط الطول (Longitude)': lng !== '' ? lng : 'غير متوفر',
            'رابط الموقع للعنصر على الخريطة': mapLink || 'غير متوفر',
            'أمر الشراء (PO)': p.po || 'غير محدد',
            'رقم الرخصة (Permit No)': matchingItem?.permitNo && isValidIdentifier(matchingItem.permitNo) ? cleanPermitNo(matchingItem.permitNo) : 'غير محدد',
            'حالة العنصر / المرحلة': cleanStage(matchingItem?.stage) !== 'غير متوفر' ? cleanStage(matchingItem?.stage) : (matchingItem?.statusLabel || 'غير متوفر'),
            'الطول (متر)': matchingItem?.lengthMeters ? Number(matchingItem.lengthMeters.toFixed(2)) : 0,
          });
        });
      }
    });

    if (exportRows.length === 0) {
      alert('لا توجد بيانات Segment ID محللة أو معرفة حالياً في المشاريع المحددة للتصدير.');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet['!views'] = [{ RTL: true }];

    const keys = Object.keys(exportRows[0]);
    worksheet['!cols'] = keys.map(key => ({
      wch: Math.max(key.length * 2.2, 18)
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'بيانات_Segment_ID');

    const dateStr = new Date().toISOString().split('T')[0];
    const fileNameSuffix = targetProjects && targetProjects.length === 1 
      ? `مشروع_${targetProjects[0].id}`
      : 'جميع_المشاريع';
    XLSX.writeFile(workbook, `بيانات_Segment_ID_${fileNameSuffix}_${dateStr}.xlsx`);
  };

  // Excel Export Handler for Permit No detailed data
  const handleExportPermitsToExcel = (targetProjects?: Project[]) => {
    const projectsToExport = targetProjects || searchedProjects;
    const detailRows: any[] = [];
    const summaryMap = new Map<string, {
      permitNo: string;
      projectName: string;
      po: string;
      contractor: string;
      subProgram: string;
      statusLabels: Set<string>;
      segments: Set<string>;
      totalMeters: number;
      districts: Set<string>;
      streets: Set<string>;
      firstLat?: number | string;
      firstLng?: number | string;
      firstMapLink?: string;
    }>();

    projectsToExport.forEach(p => {
      const savedReport = findReportForProject(p, reportsMap);
      const metric = getValidMetricForProject(p);
      const res = savedReport?.analysisResult || getAnalysisForProject(p);
      const items = res?.items || [];

      // Filter items with valid clean permitNo
      const validItems = items.filter(it => it && isValidIdentifier(cleanPermitNo(it.permitNo)));

      if (validItems.length > 0) {
        validItems.forEach(item => {
          let lat: number | string = '';
          let lng: number | string = '';

          if (item.centerLat !== undefined && item.centerLat !== null && !isNaN(Number(item.centerLat))) {
            lat = Number(item.centerLat);
          } else if (item.coordinates && item.coordinates.length > 0 && item.coordinates[0] && item.coordinates[0].length >= 2) {
            lat = Number(item.coordinates[0][1]);
          }

          if (item.centerLng !== undefined && item.centerLng !== null && !isNaN(Number(item.centerLng))) {
            lng = Number(item.centerLng);
          } else if (item.coordinates && item.coordinates.length > 0 && item.coordinates[0] && item.coordinates[0].length >= 2) {
            lng = Number(item.coordinates[0][0]);
          }

          let mapLink = item.googleMapsUrl || '';
          if (!mapLink && item.description) {
            const descUrlMatch = item.description.match(/href=["'](https?:\/\/[^"'>]+)["']/i)
                              || item.description.match(/(https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|earth\.google\.com|maps\.google\.com)[^\s"'<>]+)/i)
                              || item.description.match(/(https?:\/\/[^\s"'<>]+)/i);
            if (descUrlMatch && descUrlMatch[1]) {
              mapLink = descUrlMatch[1];
            }
          }

          if (!mapLink && lat !== '' && lng !== '') {
            mapLink = `https://www.google.com/maps?q=${lat},${lng}`;
          }

          const cPermit = cleanPermitNo(item.permitNo);
          const cSeg = cleanSegmentId(item.segmentId);
          const stageLabel = cleanStage(item.stage) !== 'غير متوفر' ? cleanStage(item.stage) : (item.statusLabel || 'غير متوفر');
          const categoryLabel = item.statusCategory ? getStatusCategoryLabel(item.statusCategory) : 'غير محدد';
          const meters = item.lengthMeters ? Number(item.lengthMeters.toFixed(2)) : 0;
          const km = item.lengthKm ? Number(item.lengthKm.toFixed(3)) : (meters > 0 ? Number((meters / 1000).toFixed(3)) : 0);

          detailRows.push({
            'رقم الرخصة (Permit No)': cPermit,
            'اسم المشروع': p.name || item.kmlProjectName || 'غير محدد',
            'أمر الشراء (PO)': p.po || 'غير محدد',
            'البرنامج / القطاع': p.subProgram || p.scope || p.classification || 'غير محدد',
            'اسم المقاول': item.contractor || p.contractor || 'غير محدد',
            'Segment ID (معرف القطاع)': isValidIdentifier(cSeg) ? cSeg : 'غير محدد',
            'حالة العنصر / المرحلة': stageLabel,
            'تصنيف الحالة': categoryLabel,
            'الطول (متر)': meters,
            'الطول (كم)': km,
            'القطر (مم)': item.innerDiameter || 'غير محدد',
            'نوع الحفرية': item.drillingType || 'غير متوفر',
            'الحي / المنطقة': item.district || p.region || 'غير محدد',
            'اسم الشارع / الموقع': item.streetName || item.name || 'غير محدد',
            'خط العرض (Latitude)': lat !== '' ? lat : 'غير متوفر',
            'خط الطول (Longitude)': lng !== '' ? lng : 'غير متوفر',
            'رابط الموقع على الخريطة': mapLink || 'غير متوفر',
          });

          // Build summary aggregation
          const summaryKey = `${p.id}_${cPermit}`;
          if (!summaryMap.has(summaryKey)) {
            summaryMap.set(summaryKey, {
              permitNo: cPermit,
              projectName: p.name || 'غير محدد',
              po: p.po || 'غير محدد',
              contractor: item.contractor || p.contractor || 'غير محدد',
              subProgram: p.subProgram || p.scope || p.classification || 'غير محدد',
              statusLabels: new Set(),
              segments: new Set(),
              totalMeters: 0,
              districts: new Set(),
              streets: new Set(),
              firstLat: lat !== '' ? lat : undefined,
              firstLng: lng !== '' ? lng : undefined,
              firstMapLink: mapLink || undefined
            });
          }
          const sum = summaryMap.get(summaryKey)!;
          if (stageLabel && stageLabel !== 'غير متوفر') sum.statusLabels.add(stageLabel);
          if (isValidIdentifier(cSeg)) sum.segments.add(cSeg);
          sum.totalMeters += meters;
          if (item.district) sum.districts.add(item.district);
          if (item.streetName) sum.streets.add(item.streetName);
        });
      } else {
        // Fallback: Check permitNosByStatus or metric.permitsList
        const permitsList: string[] = res?.permitNosByStatus
          ? Array.from(new Set(Object.values(res.permitNosByStatus).flat().map(cleanPermitNo).filter(isValidIdentifier)))
          : (metric && metric.permitsList && metric.permitsList.length > 0
            ? Array.from(new Set(metric.permitsList.map(cleanPermitNo).filter(isValidIdentifier)))
            : []);

        permitsList.forEach(pNo => {
          const cPermit = cleanPermitNo(pNo);
          const matchingItems = res?.items?.filter(it => cleanPermitNo(it.permitNo) === cPermit) || [];
          const firstMatching = matchingItems[0];

          let lat: number | string = firstMatching?.centerLat ?? (p.y ? Number(p.y) : '');
          let lng: number | string = firstMatching?.centerLng ?? (p.x ? Number(p.x) : '');
          let mapLink = firstMatching?.googleMapsUrl || '';

          if (!mapLink && firstMatching?.description) {
            const descUrlMatch = firstMatching.description.match(/href=["'](https?:\/\/[^"'>]+)["']/i)
                              || firstMatching.description.match(/(https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|earth\.google\.com|maps\.google\.com)[^\s"'<>]+)/i)
                              || firstMatching.description.match(/(https?:\/\/[^\s"'<>]+)/i);
            if (descUrlMatch && descUrlMatch[1]) {
              mapLink = descUrlMatch[1];
            }
          }

          if (!mapLink && lat !== '' && lng !== '') {
            mapLink = `https://www.google.com/maps?q=${lat},${lng}`;
          }

          const associatedSegments = matchingItems
            .map(it => cleanSegmentId(it.segmentId))
            .filter(isValidIdentifier);
          const totalPermitMeters = matchingItems.reduce((s, it) => s + (it.lengthMeters || 0), 0);
          const stageLabel = firstMatching ? (cleanStage(firstMatching.stage) !== 'غير متوفر' ? cleanStage(firstMatching.stage) : (firstMatching.statusLabel || 'غير متوفر')) : 'معتمد';
          const categoryLabel = firstMatching?.statusCategory ? getStatusCategoryLabel(firstMatching.statusCategory) : 'غير محدد';

          detailRows.push({
            'رقم الرخصة (Permit No)': cPermit,
            'اسم المشروع': p.name || 'غير محدد',
            'أمر الشراء (PO)': p.po || 'غير محدد',
            'البرنامج / القطاع': p.subProgram || p.scope || p.classification || 'غير محدد',
            'اسم المقاول': firstMatching?.contractor || p.contractor || 'غير محدد',
            'Segment ID (معرف القطاع)': associatedSegments.length > 0 ? Array.from(new Set(associatedSegments)).join(', ') : 'غير محدد',
            'حالة العنصر / المرحلة': stageLabel,
            'تصنيف الحالة': categoryLabel,
            'الطول (متر)': totalPermitMeters > 0 ? Number(totalPermitMeters.toFixed(2)) : 0,
            'الطول (كم)': totalPermitMeters > 0 ? Number((totalPermitMeters / 1000).toFixed(3)) : 0,
            'القطر (مم)': firstMatching?.innerDiameter || 'غير محدد',
            'نوع الحفرية': firstMatching?.drillingType || 'غير متوفر',
            'الحي / المنطقة': firstMatching?.district || p.region || 'غير محدد',
            'اسم الشارع / الموقع': firstMatching?.streetName || firstMatching?.name || 'غير محدد',
            'خط العرض (Latitude)': lat !== '' ? lat : 'غير متوفر',
            'خط الطول (Longitude)': lng !== '' ? lng : 'غير متوفر',
            'رابط الموقع على الخريطة': mapLink || 'غير متوفر',
          });

          // Summary Map
          const summaryKey = `${p.id}_${cPermit}`;
          summaryMap.set(summaryKey, {
            permitNo: cPermit,
            projectName: p.name || 'غير محدد',
            po: p.po || 'غير محدد',
            contractor: firstMatching?.contractor || p.contractor || 'غير محدد',
            subProgram: p.subProgram || p.scope || p.classification || 'غير محدد',
            statusLabels: new Set([stageLabel]),
            segments: new Set(associatedSegments),
            totalMeters: totalPermitMeters,
            districts: new Set(firstMatching?.district ? [firstMatching.district] : (p.region ? [p.region] : [])),
            streets: new Set(firstMatching?.streetName ? [firstMatching.streetName] : []),
            firstLat: lat !== '' ? lat : undefined,
            firstLng: lng !== '' ? lng : undefined,
            firstMapLink: mapLink || undefined
          });
        });
      }
    });

    if (detailRows.length === 0) {
      alert('لا توجد بيانات Permit No محللة أو معرفة حالياً في المشاريع المحددة للتصدير.');
      return;
    }

    const summaryRows = Array.from(summaryMap.values()).map(s => ({
      'رقم الرخصة (Permit No)': s.permitNo,
      'اسم المشروع': s.projectName,
      'أمر الشراء (PO)': s.po,
      'اسم المقاول': s.contractor,
      'البرنامج / القطاع': s.subProgram,
      'حالة الأعمال المعتمدة': Array.from(s.statusLabels).join(' / ') || 'معتمد',
      'أعداد السجمنت المرتبطة': s.segments.size,
      'معرفات السجمنت (Segment IDs)': Array.from(s.segments).join(', ') || 'غير محدد',
      'إجمالي طول الرخصة (متر)': Number(s.totalMeters.toFixed(2)),
      'إجمالي طول الرخصة (كم)': Number((s.totalMeters / 1000).toFixed(3)),
      'الأحياء والمناطق': Array.from(s.districts).join(' - ') || 'غير محدد',
      'الشوارع والمواقع': Array.from(s.streets).join(' - ') || 'غير محدد',
      'رابط الموقع على الخريطة': s.firstMapLink || 'غير متوفر'
    }));

    const workbook = XLSX.utils.book_new();

    // Summary Sheet
    const summaryWorksheet = XLSX.utils.json_to_sheet(summaryRows);
    summaryWorksheet['!views'] = [{ RTL: true }];
    summaryWorksheet['!cols'] = Object.keys(summaryRows[0] || {}).map(key => ({
      wch: Math.max(key.length * 2.2, 18)
    }));
    XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'ملخص_رخص_Permit_No');

    // Details Sheet
    const detailWorksheet = XLSX.utils.json_to_sheet(detailRows);
    detailWorksheet['!views'] = [{ RTL: true }];
    detailWorksheet['!cols'] = Object.keys(detailRows[0] || {}).map(key => ({
      wch: Math.max(key.length * 2.2, 18)
    }));
    XLSX.utils.book_append_sheet(workbook, detailWorksheet, 'تفاصيل_العناصر_لكل_رخصة');

    const dateStr = new Date().toISOString().split('T')[0];
    const fileNameSuffix = targetProjects && targetProjects.length === 1 
      ? `مشروع_${targetProjects[0].id}`
      : 'جميع_المشاريع';
    XLSX.writeFile(workbook, `بيانات_الرخص_Permit_No_${fileNameSuffix}_${dateStr}.xlsx`);
  };

  // Excel Export Handler for Sector Comparison Table
  const handleExportComparisonToExcel = () => {
    const rows = [
      {
        'التصنيف / القطاع': '🌐 جميع المشاريع (الكل)',
        'عدد المشاريع': allCategoryStatsMap.all.projectsCount,
        'إجمالي الأطوال بالعقد (كم)': allCategoryStatsMap.all.totalContractKm,
        'الجاري (كم)': allCategoryStatsMap.all.statusBreakdown.ongoing.totalKm,
        'المتبقي (كم)': allCategoryStatsMap.all.statusBreakdown.remaining.totalKm,
        'المنفذ (كم)': Number((allCategoryStatsMap.all.statusBreakdown.executed_water.totalKm + allCategoryStatsMap.all.statusBreakdown.executed_sewage.totalKm).toFixed(3)),
        'أعداد الرخص (Permit No)': allCategoryStatsMap.all.totalPermitsCount,
        'السجمنت الفريد': allCategoryStatsMap.all.uniqueSegmentsCount,
        'إجمالي عناصر السجمنت': allCategoryStatsMap.all.totalSegmentsCount
      },
      {
        'التصنيف / القطاع': '🏙️ مشاريع الرياض',
        'عدد المشاريع': allCategoryStatsMap.riyadh.projectsCount,
        'إجمالي الأطوال بالعقد (كم)': allCategoryStatsMap.riyadh.totalContractKm,
        'الجاري (كم)': allCategoryStatsMap.riyadh.statusBreakdown.ongoing.totalKm,
        'المتبقي (كم)': allCategoryStatsMap.riyadh.statusBreakdown.remaining.totalKm,
        'المنفذ (كم)': Number((allCategoryStatsMap.riyadh.statusBreakdown.executed_water.totalKm + allCategoryStatsMap.riyadh.statusBreakdown.executed_sewage.totalKm).toFixed(3)),
        'أعداد الرخص (Permit No)': allCategoryStatsMap.riyadh.totalPermitsCount,
        'السجمنت الفريد': allCategoryStatsMap.riyadh.uniqueSegmentsCount,
        'إجمالي عناصر السجمنت': allCategoryStatsMap.riyadh.totalSegmentsCount
      },
      {
        'التصنيف / القطاع': '🏛️ مشاريع المحافظات',
        'عدد المشاريع': allCategoryStatsMap.governorates.projectsCount,
        'إجمالي الأطوال بالعقد (كم)': allCategoryStatsMap.governorates.totalContractKm,
        'الجاري (كم)': allCategoryStatsMap.governorates.statusBreakdown.ongoing.totalKm,
        'المتبقي (كم)': allCategoryStatsMap.governorates.statusBreakdown.remaining.totalKm,
        'المنفذ (كم)': Number((allCategoryStatsMap.governorates.statusBreakdown.executed_water.totalKm + allCategoryStatsMap.governorates.statusBreakdown.executed_sewage.totalKm).toFixed(3)),
        'أعداد الرخص (Permit No)': allCategoryStatsMap.governorates.totalPermitsCount,
        'السجمنت الفريد': allCategoryStatsMap.governorates.uniqueSegmentsCount,
        'إجمالي عناصر السجمنت': allCategoryStatsMap.governorates.totalSegmentsCount
      },
      {
        'التصنيف / القطاع': '💧 مشاريع الصرف بالقطاع الأوسط',
        'عدد المشاريع': allCategoryStatsMap.central_sewage.projectsCount,
        'إجمالي الأطوال بالعقد (كم)': allCategoryStatsMap.central_sewage.totalContractKm,
        'الجاري (كم)': allCategoryStatsMap.central_sewage.statusBreakdown.ongoing.totalKm,
        'المتبقي (كم)': allCategoryStatsMap.central_sewage.statusBreakdown.remaining.totalKm,
        'المنفذ (كم)': Number((allCategoryStatsMap.central_sewage.statusBreakdown.executed_water.totalKm + allCategoryStatsMap.central_sewage.statusBreakdown.executed_sewage.totalKm).toFixed(3)),
        'أعداد الرخص (Permit No)': allCategoryStatsMap.central_sewage.totalPermitsCount,
        'السجمنت الفريد': allCategoryStatsMap.central_sewage.uniqueSegmentsCount,
        'إجمالي عناصر السجمنت': allCategoryStatsMap.central_sewage.totalSegmentsCount
      },
      {
        'التصنيف / القطاع': '🚰 مشاريع المياه بالقطاع الأوسط',
        'عدد المشاريع': allCategoryStatsMap.central_water.projectsCount,
        'إجمالي الأطوال بالعقد (كم)': allCategoryStatsMap.central_water.totalContractKm,
        'الجاري (كم)': allCategoryStatsMap.central_water.statusBreakdown.ongoing.totalKm,
        'المتبقي (كم)': allCategoryStatsMap.central_water.statusBreakdown.remaining.totalKm,
        'المنفذ (كم)': Number((allCategoryStatsMap.central_water.statusBreakdown.executed_water.totalKm + allCategoryStatsMap.central_water.statusBreakdown.executed_sewage.totalKm).toFixed(3)),
        'أعداد الرخص (Permit No)': allCategoryStatsMap.central_water.totalPermitsCount,
        'السجمنت الفريد': allCategoryStatsMap.central_water.uniqueSegmentsCount,
        'إجمالي عناصر السجمنت': allCategoryStatsMap.central_water.totalSegmentsCount
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!views'] = [{ RTL: true }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'مقارنة القطاعات');

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `مقارنة_قطاعات_الأطوال_${dateStr}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white p-6 rounded-3xl shadow-lg border border-indigo-800/50 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full filter blur-3xl pointer-events-none"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-3 py-1 bg-amber-400/20 text-amber-300 border border-amber-400/30 text-xs font-black rounded-full flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                داشبورد حصر الأطوال والرخص بالسجمنت
              </span>
              <span className="text-xs text-indigo-200">محدث مع الخرائط التفصيلية</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              <span>تحليل أطوال العقود والرخص المعتمدة</span>
              <Ruler className="h-7 w-7 text-cyan-400" />
            </h2>
            <p className="text-xs md:text-sm text-indigo-200 mt-1 max-w-2xl">
              عرض تفصيلي لأطوال الخطوط (الكلية بالعقد، الجاري، المتبقية، والمنفذة)، وأعداد الرخص وأعداد القطاعات (السجمنت) مقسمة حسب النطاق والقطاع.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={loadReportsAndMetrics}
              disabled={isLoading}
              className="px-3.5 py-2 bg-indigo-800/80 hover:bg-indigo-700 text-white font-black text-xs rounded-xl border border-indigo-600/50 shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 text-cyan-300 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{t('lengths.syncNeon Database')}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-black text-xs rounded-xl border border-slate-600 shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Printer className="h-4 w-4 text-slate-300" />
              <span>طباعة الداشبورد</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Category Filter Tabs (للكل - مشاريع الرياض - مشاريع المحافظات - مشاريع الصرف بالقطاع الأوسط - مشاريع المياه بالقطاع الأوسط) */}
      <div className="bg-white dark:bg-slate-900 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { setActiveCategory('all'); setSelectedScope('all'); }}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeCategory === 'all'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Globe className="h-4 w-4 text-amber-300" />
          <span>🌐 الكل (جميع المشاريع)</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/20 font-bold">
            {allCategoryStatsMap.all.projectsCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveCategory('riyadh'); setSelectedScope('all'); }}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeCategory === 'riyadh'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Building2 className="h-4 w-4 text-cyan-300" />
          <span>🏙️ مشاريع الرياض</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/20 font-bold">
            {allCategoryStatsMap.riyadh.projectsCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveCategory('governorates'); setSelectedScope('all'); }}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeCategory === 'governorates'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <MapPin className="h-4 w-4 text-emerald-300" />
          <span>🏛️ مشاريع المحافظات</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/20 font-bold">
            {allCategoryStatsMap.governorates.projectsCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveCategory('central_sewage'); setSelectedScope('all'); }}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeCategory === 'central_sewage'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Wind className="h-4 w-4 text-emerald-300" />
          <span>💧 مشاريع الصرف (القطاع الأوسط)</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/20 font-bold">
            {allCategoryStatsMap.central_sewage.projectsCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveCategory('central_water'); setSelectedScope('all'); }}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeCategory === 'central_water'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Droplet className="h-4 w-4 text-cyan-300" />
          <span>🚰 مشاريع المياه (القطاع الأوسط)</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/20 font-bold">
            {allCategoryStatsMap.central_water.projectsCount}
          </span>
        </button>
      </div>

      {/* Scope Sub-Filter Bar (فرز مشاريع الرياض ومشاريع المحافظات حسب المياه أو الصرف الصحي) */}
      <div className="bg-slate-100/80 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 rounded-lg">
            <Filter className="h-4 w-4" />
          </div>
          <div>
            <span className="text-xs font-black text-slate-800 dark:text-slate-200 block">
              فرز نوع الخدمة ({activeCategory === 'riyadh' ? 'مشاريع الرياض' : activeCategory === 'governorates' ? 'مشاريع المحافظات' : activeCategory === 'central_sewage' ? 'قطاع الصرف' : activeCategory === 'central_water' ? 'قطاع المياه' : 'جميع المشاريع'}):
            </span>
            <span className="text-[10px] text-slate-500 font-bold block">
              فرز وتخصيص العرض بين مشاريع المياه أو مشاريع الصرف الصحي
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedScope('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedScope === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>عرض الكل</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedScope === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
              {currentCategoryBaseProjects.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedScope('water')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedScope === 'water'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-cyan-700 dark:text-cyan-400 border border-slate-200 dark:border-slate-700 hover:bg-cyan-50 dark:hover:bg-cyan-950/40'
            }`}
          >
            <Droplet className="h-3.5 w-3.5 text-cyan-400" />
            <span>🚰 مشاريع المياه</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedScope === 'water' ? 'bg-white/20 text-white' : 'bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-200'}`}>
              {waterScopeCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedScope('sewage')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedScope === 'sewage'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
            }`}
          >
            <Wind className="h-3.5 w-3.5 text-emerald-400" />
            <span>💧 مشاريع الصرف الصحي</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedScope === 'sewage' ? 'bg-white/20 text-white' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200'}`}>
              {sewageScopeCount}
            </span>
          </button>
        </div>
      </div>

      {/* Project Status Filter Bar (فرز وتصفية حسب حالة/مرحلة المشروع) */}
      <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span>فرز وتصفية حسب مرحلة / حالة المشروع:</span>
          </span>
          {selectedStatus !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedStatus('all')}
              className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>إلغاء الفرز (عرض جميع الحالات)</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Preset status filter buttons */}
          <button
            type="button"
            onClick={() => setSelectedStatus('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              selectedStatus === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            الكل (جميع الحالات)
          </button>

          <button
            type="button"
            onClick={() => setSelectedStatus('جاري')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedStatus === 'جاري'
                ? 'bg-amber-500 text-slate-900 shadow-xs'
                : 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            <span>⚡ جاري التنفيذ</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedStatus('مسلم ابتدائي')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedStatus === 'مسلم ابتدائي'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950/40'
            }`}
          >
            <span>📝 مسلم ابتدائي</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedStatus('جاري الاستلام الابتدائي')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedStatus === 'جاري الاستلام الابتدائي'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
            }`}
          >
            <span>⏳ جاري الاستلام الابتدائي</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedStatus('مكتمل')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedStatus === 'مكتمل'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
            }`}
          >
            <span>✅ مكتمل / تم إنهاء العقد</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedStatus('مسحوب')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedStatus === 'مسحوب'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-400 border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40'
            }`}
          >
            <span>⚠️ مسحوب</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedStatus('معلق')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedStatus === 'معلق'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>🛑 معلق / متوقف</span>
          </button>

          {/* Dynamic selector for custom statuses */}
          {availableStatuses.length > 0 && (
            <div className="mr-auto flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 shrink-0">حالة محددة:</span>
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="text-xs font-bold py-1.5 px-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-slate-200 shadow-2xs"
              >
                <option value="all">جميع الحالات ({projects.length})</option>
                {availableStatuses.map(st => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Top Key Performance Indicators Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Total Contract Length */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">الأطوال الكلية بالعقد</span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
              <Ruler className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {activeStats.totalContractKm.toLocaleString('ar-SA')} <span className="text-xs text-slate-500">كم</span>
            </div>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
              ({activeStats.totalContractMeters.toLocaleString('ar-SA')} متر)
            </p>
          </div>
        </div>

        {/* Ongoing Length */}
        <div className="bg-amber-50/60 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-800/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 dark:text-amber-300">الأطوال الجاري تنفيذها</span>
            <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
              <RefreshCw className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black text-amber-900 dark:text-amber-200 tracking-tight">
                {activeStats.statusBreakdown.ongoing.totalKm.toLocaleString('ar-SA')} <span className="text-xs">كم</span>
              </span>
              <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200">
                %{activeStats.statusBreakdown.ongoing.percentage}
              </span>
            </div>
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mt-0.5">
              ({activeStats.statusBreakdown.ongoing.totalMeters.toLocaleString('ar-SA')} متر)
            </p>
          </div>
        </div>

        {/* Remaining Length */}
        <div className="bg-rose-50/60 dark:bg-rose-950/30 p-4 rounded-2xl border border-rose-200 dark:border-rose-800/60 shadow-xs flex flex-col justify-between" style={{ backgroundColor: '#800404' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-800 dark:text-rose-300" style={{ color: '#f7f1f3' }}>الأطوال المتبقية</span>
            <div className="p-2 bg-rose-600 text-white rounded-xl shadow-xs">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black text-rose-900 dark:text-rose-200 tracking-tight" style={{ color: '#e4c9d2' }}>
                {activeStats.statusBreakdown.remaining.totalKm.toLocaleString('ar-SA')} <span className="text-xs">كم</span>
              </span>
              <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-rose-200 dark:bg-rose-900/80 text-rose-900 dark:text-rose-200">
                %{activeStats.statusBreakdown.remaining.percentage}
              </span>
            </div>
            <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 mt-0.5" style={{ color: '#fffefe' }}>
              ({activeStats.statusBreakdown.remaining.totalMeters.toLocaleString('ar-SA')} متر)
            </p>
          </div>
        </div>

        {/* Total Permits Count */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between group hover:border-emerald-300 dark:hover:border-emerald-700/60 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">إجمالي أعداد الرخص (Permit No)</span>
            <button
              type="button"
              onClick={() => handleExportPermitsToExcel()}
              className="p-1.5 px-2.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/80 text-emerald-700 dark:text-emerald-300 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border border-emerald-200 dark:border-emerald-800 shadow-3xs hover:scale-105"
              title="تصدير كافة تفاصيل رخص الحفر (Permit No) المعتمدة إلى إكسل"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-[10px] font-black">تصدير إكسل</span>
            </button>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {activeStats.totalPermitsCount.toLocaleString('ar-SA')} <span className="text-xs text-slate-500 font-bold">Permit No</span>
            </div>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
              رخص وتصاريح الحفر المعتمدة (Permit No)
            </p>
          </div>
        </div>

        {/* Total Segments Count */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">أعداد السجمنت (Segment ID)</span>
            <div className="p-2 bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 rounded-xl">
              <Scissors className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {activeStats.uniqueSegmentsCount.toLocaleString('ar-SA')}
              </span>
              <span className="text-[11px] font-extrabold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/80 px-2 py-0.5 rounded-full">
                سجمنت فريد (غير مكرر)
              </span>
            </div>
            <p className="text-[11px] font-semibold text-slate-400 mt-1">
              إجمالي عناصر وقطاعات الخطوط: {activeStats.totalSegmentsCount.toLocaleString('ar-SA')}
            </p>
          </div>
        </div>

        {/* Active Category Projects Count */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">عدد المشاريع</span>
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Building2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {activeStats.projectsCount} <span className="text-xs text-slate-500">مشروع</span>
            </div>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
              ضمن النطاق المحدد
            </p>
          </div>
        </div>
      </div>

      {/* Visual Multi-color Progress Bar (Stacked Distribution) */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
          <span className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            توزيع النسب المئوية للأطوال الكلية بالعقد حسب الحالات المعتمدة:
          </span>
          <span>إجمالي 100%</span>
        </div>

        <div className="w-full bg-slate-100 dark:bg-slate-800 h-5 rounded-xl overflow-hidden flex shadow-inner">
          <div
            style={{ width: `${activeStats.statusBreakdown.executed_water.percentage}%`, backgroundColor: '#01579B' }}
            title={`منفذ مياه: ${activeStats.statusBreakdown.executed_water.percentage}% (${activeStats.statusBreakdown.executed_water.totalKm} كم)`}
            className="h-full transition-all duration-500 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden px-1"
          >
            {activeStats.statusBreakdown.executed_water.percentage > 4 && `%${activeStats.statusBreakdown.executed_water.percentage}`}
          </div>

          <div
            style={{ width: `${activeStats.statusBreakdown.executed_sewage.percentage}%`, backgroundColor: '#097138' }}
            title={`منفذ صرف صحي: ${activeStats.statusBreakdown.executed_sewage.percentage}% (${activeStats.statusBreakdown.executed_sewage.totalKm} كم)`}
            className="h-full transition-all duration-500 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden px-1"
          >
            {activeStats.statusBreakdown.executed_sewage.percentage > 4 && `%${activeStats.statusBreakdown.executed_sewage.percentage}`}
          </div>

          <div
            style={{ width: `${activeStats.statusBreakdown.ongoing.percentage}%`, backgroundColor: '#ffea00' }}
            title={`جاري العمل: ${activeStats.statusBreakdown.ongoing.percentage}% (${activeStats.statusBreakdown.ongoing.totalKm} كم)`}
            className="h-full transition-all duration-500 flex items-center justify-center text-[10px] font-bold text-slate-900 overflow-hidden px-1"
          >
            {activeStats.statusBreakdown.ongoing.percentage > 4 && `%${activeStats.statusBreakdown.ongoing.percentage}`}
          </div>

          <div
            style={{ width: `${activeStats.statusBreakdown.remaining.percentage}%`, backgroundColor: '#a52714' }}
            title={`متبقي: ${activeStats.statusBreakdown.remaining.percentage}% (${activeStats.statusBreakdown.remaining.totalKm} كم)`}
            className="h-full transition-all duration-500 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden px-1"
          >
            {activeStats.statusBreakdown.remaining.percentage > 4 && `%${activeStats.statusBreakdown.remaining.percentage}`}
          </div>

          <div
            style={{ width: `${activeStats.statusBreakdown.cancelled.percentage}%`, backgroundColor: '#F48FB1' }}
            title={`خطوط ملغاة: ${activeStats.statusBreakdown.cancelled.percentage}% (${activeStats.statusBreakdown.cancelled.totalKm} كم)`}
            className="h-full transition-all duration-500 flex items-center justify-center text-[10px] font-bold text-slate-900 overflow-hidden px-1"
          >
            {activeStats.statusBreakdown.cancelled.percentage > 4 && `%${activeStats.statusBreakdown.cancelled.percentage}`}
          </div>
        </div>

        {/* Progress Bar Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-extrabold pt-1">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#01579B' }}></span>
            <span className="text-slate-700 dark:text-slate-300">منفذ مياه: {activeStats.statusBreakdown.executed_water.totalKm} كم (%{activeStats.statusBreakdown.executed_water.percentage})</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#097138' }}></span>
            <span className="text-slate-700 dark:text-slate-300">منفذ صرف: {activeStats.statusBreakdown.executed_sewage.totalKm} كم (%{activeStats.statusBreakdown.executed_sewage.percentage})</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ffea00' }}></span>
            <span className="text-slate-700 dark:text-slate-300">جاري العمل: {activeStats.statusBreakdown.ongoing.totalKm} كم (%{activeStats.statusBreakdown.ongoing.percentage})</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#a52714' }}></span>
            <span className="text-slate-700 dark:text-slate-300">متبقي: {activeStats.statusBreakdown.remaining.totalKm} كم (%{activeStats.statusBreakdown.remaining.percentage})</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#F48FB1' }}></span>
            <span className="text-slate-700 dark:text-slate-300">ملغى: {activeStats.statusBreakdown.cancelled.totalKm} كم (%{activeStats.statusBreakdown.cancelled.percentage})</span>
          </div>
        </div>
      </div>

      {/* Approved Status Analytical Cards Grid (5 Approved Status Categories - بنفس طريقة عرض التحليل) */}
      <div className="space-y-3">
        <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span>حالة التنفيذ والأطوال والرخص والسجمنت حسب الحالات المعتمدة</span>
          <Layers className="h-5 w-5 text-blue-600" />
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Ongoing Card (جاري العمل / التنفيذ) */}
          <div className="bg-amber-50/90 dark:bg-amber-950/40 p-5 rounded-2xl border-2 border-amber-300 dark:border-amber-700 shadow-xs space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-yellow-400 animate-pulse border border-yellow-600"></span>
                <h4 className="font-extrabold text-slate-900 dark:text-white text-base">جاري العمل / التنفيذ</h4>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-yellow-400 text-slate-900 shadow-xs">
                %{activeStats.statusBreakdown.ongoing.percentage}
              </span>
            </div>

            <div>
              <div className="text-3xl font-black text-slate-900 dark:text-amber-100 tracking-tight">
                {activeStats.statusBreakdown.ongoing.totalKm.toLocaleString('ar-SA')} <span className="text-sm font-bold">كم</span>
              </div>
              <div className="text-xs font-bold text-amber-800 dark:text-amber-300 mt-1">
                الطول الإجمالي: {activeStats.statusBreakdown.ongoing.totalMeters.toLocaleString('ar-SA')} متر
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-amber-200/80 dark:border-amber-800/60 text-xs">
              <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block font-bold">أعداد السجمنت (Segment ID)</span>
                <span className="text-base font-extrabold text-amber-900 dark:text-amber-200 block">
                  {formatVal(activeStats.statusBreakdown.ongoing.uniqueSegmentCount)} فريد
                </span>
                <span className="text-[10px] font-semibold text-slate-400 block">
                  (من إجمالي {formatVal(activeStats.statusBreakdown.ongoing.segmentCount)} عنصر)
                </span>
              </div>

              <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block font-bold">أعداد الرخص (Permit No)</span>
                <span className="text-base font-extrabold text-amber-900 dark:text-amber-200 block">
                  {formatVal(activeStats.statusBreakdown.ongoing.permitCount)} Permit No
                </span>
                <span className="text-[10px] font-semibold text-slate-400 block">
                  رخصة مسجلة
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  const catTitleMap: Record<CategoryType, string> = {
                    all: 'جميع المشاريع',
                    riyadh: 'مشاريع الرياض',
                    governorates: 'مشاريع المحافظات',
                    central_sewage: 'مشاريع الصرف بالقطاع الأوسط',
                    central_water: 'مشاريع المياه بالقطاع الأوسط'
                  };
                  setYellowModalProjectScope(catTitleMap[activeCategory] || 'جميع المشاريع');
                  setIsYellowNoPermitModalOpen(true);
                }}
                className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer w-full group hover:scale-[1.02] active:scale-95 ${
                  (activeStats.statusBreakdown.ongoing.yellowNoPermitCount || 0) > 0
                    ? 'bg-rose-50/90 dark:bg-rose-950/80 border-rose-400 dark:border-rose-800 shadow-sm hover:bg-rose-100 dark:hover:bg-rose-900/60 ring-2 ring-rose-400/40'
                    : 'bg-white/80 dark:bg-slate-900/80 border-amber-200 dark:border-amber-800 hover:bg-amber-100/50'
                }`}
                title="انقر لمعاينة وحصر قائمة القطاعات الجارية باللون الأصفر بدون رقم فسح وتصديرها"
              >
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <span>قطاعات جارية بدون فسح 🚨</span>
                  </span>
                  {(activeStats.statusBreakdown.ongoing.yellowNoPermitCount || 0) > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-extrabold text-[10px] animate-pulse">
                      معاينة الحصر 🔍
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-normal">عرض التفاصيل</span>
                  )}
                </div>
                <span className={`text-base font-black block mt-0.5 ${
                  (activeStats.statusBreakdown.ongoing.yellowNoPermitCount || 0) > 0
                    ? 'text-rose-700 dark:text-rose-300 underline decoration-rose-500 font-mono'
                    : 'text-amber-900 dark:text-amber-200 font-mono'
                }`}>
                  {formatVal(activeStats.statusBreakdown.ongoing.yellowNoPermitCount)} قطاع
                </span>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mt-0.5">
                  {formatVal(activeStats.statusBreakdown.ongoing.yellowNoPermitKm)} كم ({formatVal(activeStats.statusBreakdown.ongoing.yellowNoPermitMeters)} م)
                </span>
              </button>
            </div>
          </div>

          {/* Remaining Card (أعمال متبقية) */}
          <div className="bg-rose-50/90 dark:bg-rose-950/40 p-5 rounded-2xl border-2 border-rose-300 dark:border-rose-700 shadow-xs space-y-4 relative overflow-hidden" style={{ backgroundColor: '#91111c' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-rose-600 border border-rose-800"></span>
                <h4 className="font-extrabold text-slate-900 dark:text-white text-base" style={{ color: '#f1f3f8' }}>أعمال متبقية</h4>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-600 text-white shadow-xs">
                %{activeStats.statusBreakdown.remaining.percentage}
              </span>
            </div>

            <div>
              <div className="text-3xl font-black text-slate-900 dark:text-rose-100 tracking-tight" style={{ color: '#eef0f5' }}>
                {activeStats.statusBreakdown.remaining.totalKm.toLocaleString('ar-SA')} <span className="text-sm font-bold">كم</span>
              </div>
              <div className="text-xs font-bold text-rose-800 dark:text-rose-300 mt-1" style={{ color: '#e7dee1' }}>
                الطول الإجمالي: {activeStats.statusBreakdown.remaining.totalMeters.toLocaleString('ar-SA')} متر
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-rose-200/80 dark:border-rose-800/60 text-xs">
              <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-rose-200 dark:border-rose-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block font-bold">أعداد السجمنت (Segment ID)</span>
                <span className="text-base font-extrabold text-rose-900 dark:text-rose-200 block">
                  {formatVal(activeStats.statusBreakdown.remaining.uniqueSegmentCount)} فريد
                </span>
                <span className="text-[10px] font-semibold text-slate-400 block">
                  (من إجمالي {formatVal(activeStats.statusBreakdown.remaining.segmentCount)} عنصر)
                </span>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-rose-200 dark:border-rose-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block font-bold">أعداد الرخص (Permit No)</span>
                <span className="text-base font-extrabold text-rose-900 dark:text-rose-200">
                  {formatVal(activeStats.statusBreakdown.remaining.permitCount)} Permit No
                </span>
              </div>
            </div>
          </div>

          {/* Executed Water Card (منفذ - شبكات مياه) */}
          <div className="bg-sky-50/90 dark:bg-sky-950/40 p-5 rounded-2xl border-2 border-sky-300 dark:border-sky-700 shadow-xs space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-sky-700 border border-sky-900"></span>
                <h4 className="font-extrabold text-slate-900 dark:text-white text-base">منفذ - شبكات مياه</h4>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-sky-700 text-white shadow-xs">
                %{activeStats.statusBreakdown.executed_water.percentage}
              </span>
            </div>

            <div>
              <div className="text-3xl font-black text-slate-900 dark:text-sky-100 tracking-tight">
                {activeStats.statusBreakdown.executed_water.totalKm.toLocaleString('ar-SA')} <span className="text-sm font-bold">كم</span>
              </div>
              <div className="text-xs font-bold text-sky-800 dark:text-sky-300 mt-1">
                الطول الإجمالي: {activeStats.statusBreakdown.executed_water.totalMeters.toLocaleString('ar-SA')} متر
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-sky-200/80 dark:border-sky-800/60 text-xs">
              <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-sky-200 dark:border-sky-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block font-bold">أعداد السجمنت (Segment ID)</span>
                <span className="text-base font-extrabold text-sky-900 dark:text-sky-200 block">
                  {formatVal(activeStats.statusBreakdown.executed_water.uniqueSegmentCount)} فريد
                </span>
                <span className="text-[10px] font-semibold text-slate-400 block">
                  (من إجمالي {formatVal(activeStats.statusBreakdown.executed_water.segmentCount)} عنصر)
                </span>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-sky-200 dark:border-sky-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block font-bold">أعداد الرخص (Permit No)</span>
                <span className="text-base font-extrabold text-sky-900 dark:text-sky-200">
                  {formatVal(activeStats.statusBreakdown.executed_water.permitCount)} Permit No
                </span>
              </div>
            </div>
          </div>

          {/* Executed Sewage Card (منفذ - شبكات صرف صحي) */}
          <div className="bg-emerald-50/90 dark:bg-emerald-950/40 p-5 rounded-2xl border-2 border-emerald-300 dark:border-emerald-700 shadow-xs space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-emerald-700 border border-emerald-900"></span>
                <h4 className="font-extrabold text-slate-900 dark:text-white text-base">منفذ - شبكات صرف صحي</h4>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-700 text-white shadow-xs">
                %{activeStats.statusBreakdown.executed_sewage.percentage}
              </span>
            </div>

            <div>
              <div className="text-3xl font-black text-slate-900 dark:text-emerald-100 tracking-tight">
                {activeStats.statusBreakdown.executed_sewage.totalKm.toLocaleString('ar-SA')} <span className="text-sm font-bold">كم</span>
              </div>
              <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mt-1">
                الطول الإجمالي: {activeStats.statusBreakdown.executed_sewage.totalMeters.toLocaleString('ar-SA')} متر
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200/80 dark:border-emerald-800/60 text-xs">
              <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block font-bold">أعداد السجمنت (Segment ID)</span>
                <span className="text-base font-extrabold text-emerald-900 dark:text-emerald-200 block">
                  {formatVal(activeStats.statusBreakdown.executed_sewage.uniqueSegmentCount)} فريد
                </span>
                <span className="text-[10px] font-semibold text-slate-400 block">
                  (من إجمالي {formatVal(activeStats.statusBreakdown.executed_sewage.segmentCount)} عنصر)
                </span>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block font-bold">أعداد الرخص (Permit No)</span>
                <span className="text-base font-extrabold text-emerald-900 dark:text-emerald-200">
                  {formatVal(activeStats.statusBreakdown.executed_sewage.permitCount)} Permit No
                </span>
              </div>
            </div>
          </div>

          {/* Cancelled Card (خطوط تم إلغائها) */}
          <div className="bg-pink-50/90 dark:bg-pink-950/40 p-5 rounded-2xl border-2 border-pink-300 dark:border-pink-700 shadow-xs space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-pink-500 border border-pink-700"></span>
                <h4 className="font-extrabold text-slate-900 dark:text-white text-base">خطوط تم إلغائها / ملغى</h4>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-pink-500 text-white shadow-xs">
                %{activeStats.statusBreakdown.cancelled.percentage}
              </span>
            </div>

            <div>
              <div className="text-3xl font-black text-slate-900 dark:text-pink-100 tracking-tight">
                {activeStats.statusBreakdown.cancelled.totalKm.toLocaleString('ar-SA')} <span className="text-sm font-bold">كم</span>
              </div>
              <div className="text-xs font-bold text-pink-800 dark:text-pink-300 mt-1">
                الطول الإجمالي: {activeStats.statusBreakdown.cancelled.totalMeters.toLocaleString('ar-SA')} متر
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-pink-200/80 dark:border-pink-800/60 text-xs">
              <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-pink-200 dark:border-pink-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block font-bold">أعداد السجمنت (Segment ID)</span>
                <span className="text-base font-extrabold text-pink-900 dark:text-pink-200 block">
                  {formatVal(activeStats.statusBreakdown.cancelled.uniqueSegmentCount)} فريد
                </span>
                <span className="text-[10px] font-semibold text-slate-400 block">
                  (من إجمالي {formatVal(activeStats.statusBreakdown.cancelled.segmentCount)} عنصر)
                </span>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-pink-200 dark:border-pink-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block font-bold">أعداد الرخص (Permit No)</span>
                <span className="text-base font-extrabold text-pink-900 dark:text-pink-200">
                  {formatVal(activeStats.statusBreakdown.cancelled.permitCount)} Permit No
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Comprehensive Cross-Sector Comparison Table */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Table className="h-5 w-5 text-indigo-600" />
              جدول المقارنة الشاملة للأطوال والرخص والسجمنت بين التقسيمات والقطاعات
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              عرض تجميعي جنبًا إلى جنب لكافة أطوال العقود الكلية، والجاري تنفيذها، والمتبقية، والمنفذة، وأعداد الرخص والسجمنت.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportComparisonToExcel}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
              title="تصدير جدول مقارنة القطاعات إلى إكسل"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>تصدير المقارنة لإكسل</span>
            </button>
            <button
              type="button"
              onClick={() => setShowComparisonTable(!showComparisonTable)}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              {showComparisonTable ? 'إخفاء الجدول 🔼' : 'عرض الجدول 🔽'}
            </button>
          </div>
        </div>

        {showComparisonTable && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse min-w-[850px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 font-extrabold border-b border-slate-200 dark:border-slate-700">
                  <th className="p-3 rounded-r-xl">التصنيف / القطاع</th>
                  <th className="p-3 text-center">عدد المشاريع</th>
                  <th className="p-3 text-center">إجمالي الأطوال بالعقد (كم)</th>
                  <th className="p-3 text-center bg-amber-100/50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200">الجاري (كم)</th>
                  <th className="p-3 text-center bg-amber-500/10 dark:bg-amber-500/20 text-amber-900 dark:text-amber-300">جاري بدون بيان فسح (كم / عدد)</th>
                  <th className="p-3 text-center bg-rose-100/50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200">المتبقي (كم)</th>
                  <th className="p-3 text-center bg-emerald-100/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200">المنفذ (كم)</th>
                  <th className="p-3 text-center">أعداد الرخص (Permit No)</th>
                  <th className="p-3 text-center rounded-l-xl">السجمنت (الفريد / الإجمالي)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold">
                {/* 1. الكل */}
                <tr className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${activeCategory === 'all' ? 'bg-blue-50/70 dark:bg-blue-950/40 font-black' : ''}`}>
                  <td className="p-3 flex items-center gap-2">
                    <Globe className="h-4 w-4 text-blue-600" />
                    <span>🌐 جميع المشاريع (الكل)</span>
                  </td>
                  <td className="p-3 text-center">{allCategoryStatsMap.all.projectsCount}</td>
                  <td className="p-3 text-center font-bold text-slate-900 dark:text-white">{allCategoryStatsMap.all.totalContractKm.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-amber-700 dark:text-amber-300">{allCategoryStatsMap.all.statusBreakdown.ongoing.totalKm.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-amber-800 dark:text-amber-300">
                    {(allCategoryStatsMap.all.statusBreakdown.ongoing.yellowNoPermitCount || 0) > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setYellowModalProjectScope('جميع المشاريع');
                          setSelectedYellowModalItems(allCategoryStatsMap.all.yellowNoPermitItems || null);
                          setIsYellowNoPermitModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 text-amber-900 dark:text-amber-200 rounded-lg text-[11px] font-black border border-amber-300 dark:border-amber-700 shadow-3xs transition-all cursor-pointer hover:scale-105"
                        title="انقر لمعاينة حصر القطاعات الجارية بدون فسح لجميع المشاريع"
                      >
                        <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                        <span>{Number(((allCategoryStatsMap.all.statusBreakdown.ongoing.yellowNoPermitMeters || 0) / 1000).toFixed(3))} كم</span>
                        <span className="font-mono text-[10px]">({allCategoryStatsMap.all.statusBreakdown.ongoing.yellowNoPermitCount})</span>
                      </button>
                    ) : (
                      <span className="text-slate-400 font-normal">0 كم</span>
                    )}
                  </td>
                  <td className="p-3 text-center font-bold text-rose-700 dark:text-rose-300">{allCategoryStatsMap.all.statusBreakdown.remaining.totalKm.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-emerald-700 dark:text-emerald-300">
                    {(allCategoryStatsMap.all.statusBreakdown.executed_water.totalKm + allCategoryStatsMap.all.statusBreakdown.executed_sewage.totalKm).toFixed(3)}
                  </td>
                  <td className="p-3 text-center font-bold text-indigo-600 dark:text-indigo-400">{allCategoryStatsMap.all.totalPermitsCount.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-purple-600 dark:text-purple-400">
                    <div>{allCategoryStatsMap.all.uniqueSegmentsCount.toLocaleString('ar-SA')} فريد</div>
                    <div className="text-[10px] text-slate-400 font-normal">({allCategoryStatsMap.all.totalSegmentsCount.toLocaleString('ar-SA')} إجمالي)</div>
                  </td>
                </tr>

                {/* 2. مشاريع الرياض */}
                <tr className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${activeCategory === 'riyadh' ? 'bg-blue-50/70 dark:bg-blue-950/40 font-black' : ''}`}>
                  <td className="p-3 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-cyan-600" />
                    <span>🏙️ مشاريع الرياض</span>
                  </td>
                  <td className="p-3 text-center">{allCategoryStatsMap.riyadh.projectsCount}</td>
                  <td className="p-3 text-center font-bold text-slate-900 dark:text-white">{allCategoryStatsMap.riyadh.totalContractKm.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-amber-700 dark:text-amber-300">{allCategoryStatsMap.riyadh.statusBreakdown.ongoing.totalKm.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-amber-800 dark:text-amber-300">
                    {(allCategoryStatsMap.riyadh.statusBreakdown.ongoing.yellowNoPermitCount || 0) > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setYellowModalProjectScope('مشاريع الرياض');
                          setSelectedYellowModalItems(allCategoryStatsMap.riyadh.yellowNoPermitItems || null);
                          setIsYellowNoPermitModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 text-amber-900 dark:text-amber-200 rounded-lg text-[11px] font-black border border-amber-300 dark:border-amber-700 shadow-3xs transition-all cursor-pointer hover:scale-105"
                        title="انقر لمعاينة حصر القطاعات الجارية بدون فسح لمشاريع الرياض"
                      >
                        <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                        <span>{Number(((allCategoryStatsMap.riyadh.statusBreakdown.ongoing.yellowNoPermitMeters || 0) / 1000).toFixed(3))} كم</span>
                        <span className="font-mono text-[10px]">({allCategoryStatsMap.riyadh.statusBreakdown.ongoing.yellowNoPermitCount})</span>
                      </button>
                    ) : (
                      <span className="text-slate-400 font-normal">0 كم</span>
                    )}
                  </td>
                  <td className="p-3 text-center font-bold text-rose-700 dark:text-rose-300">{allCategoryStatsMap.riyadh.statusBreakdown.remaining.totalKm.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-emerald-700 dark:text-emerald-300">
                    {(allCategoryStatsMap.riyadh.statusBreakdown.executed_water.totalKm + allCategoryStatsMap.riyadh.statusBreakdown.executed_sewage.totalKm).toFixed(3)}
                  </td>
                  <td className="p-3 text-center font-bold text-indigo-600 dark:text-indigo-400">{allCategoryStatsMap.riyadh.totalPermitsCount.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-purple-600 dark:text-purple-400">
                    <div>{allCategoryStatsMap.riyadh.uniqueSegmentsCount.toLocaleString('ar-SA')} فريد</div>
                    <div className="text-[10px] text-slate-400 font-normal">({allCategoryStatsMap.riyadh.totalSegmentsCount.toLocaleString('ar-SA')} إجمالي)</div>
                  </td>
                </tr>

                {/* 3. مشاريع المحافظات */}
                <tr className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${activeCategory === 'governorates' ? 'bg-blue-50/70 dark:bg-blue-950/40 font-black' : ''}`}>
                  <td className="p-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-emerald-600" />
                    <span>🏛️ مشاريع المحافظات</span>
                  </td>
                  <td className="p-3 text-center">{allCategoryStatsMap.governorates.projectsCount}</td>
                  <td className="p-3 text-center font-bold text-slate-900 dark:text-white">{allCategoryStatsMap.governorates.totalContractKm.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-amber-700 dark:text-amber-300">{allCategoryStatsMap.governorates.statusBreakdown.ongoing.totalKm.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-amber-800 dark:text-amber-300">
                    {(allCategoryStatsMap.governorates.statusBreakdown.ongoing.yellowNoPermitCount || 0) > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setYellowModalProjectScope('مشاريع المحافظات');
                          setSelectedYellowModalItems(allCategoryStatsMap.governorates.yellowNoPermitItems || null);
                          setIsYellowNoPermitModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 text-amber-900 dark:text-amber-200 rounded-lg text-[11px] font-black border border-amber-300 dark:border-amber-700 shadow-3xs transition-all cursor-pointer hover:scale-105"
                        title="انقر لمعاينة حصر القطاعات الجارية بدون فسح لمشاريع المحافظات"
                      >
                        <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                        <span>{Number(((allCategoryStatsMap.governorates.statusBreakdown.ongoing.yellowNoPermitMeters || 0) / 1000).toFixed(3))} كم</span>
                        <span className="font-mono text-[10px]">({allCategoryStatsMap.governorates.statusBreakdown.ongoing.yellowNoPermitCount})</span>
                      </button>
                    ) : (
                      <span className="text-slate-400 font-normal">0 كم</span>
                    )}
                  </td>
                  <td className="p-3 text-center font-bold text-rose-700 dark:text-rose-300">{allCategoryStatsMap.governorates.statusBreakdown.remaining.totalKm.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-emerald-700 dark:text-emerald-300">
                    {(allCategoryStatsMap.governorates.statusBreakdown.executed_water.totalKm + allCategoryStatsMap.governorates.statusBreakdown.executed_sewage.totalKm).toFixed(3)}
                  </td>
                  <td className="p-3 text-center font-bold text-indigo-600 dark:text-indigo-400">{allCategoryStatsMap.governorates.totalPermitsCount.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-purple-600 dark:text-purple-400">
                    <div>{allCategoryStatsMap.governorates.uniqueSegmentsCount.toLocaleString('ar-SA')} فريد</div>
                    <div className="text-[10px] text-slate-400 font-normal">({allCategoryStatsMap.governorates.totalSegmentsCount.toLocaleString('ar-SA')} إجمالي)</div>
                  </td>
                </tr>

                {/* 4. مشاريع الصرف بالقطاع الأوسط */}
                <tr className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${activeCategory === 'central_sewage' ? 'bg-blue-50/70 dark:bg-blue-950/40 font-black' : ''}`}>
                  <td className="p-3 flex items-center gap-2">
                    <Wind className="h-4 w-4 text-emerald-600" />
                    <span>💧 مشاريع الصرف بالقطاع الأوسط</span>
                  </td>
                  <td className="p-3 text-center">{allCategoryStatsMap.central_sewage.projectsCount}</td>
                  <td className="p-3 text-center font-bold text-slate-900 dark:text-white">{allCategoryStatsMap.central_sewage.totalContractKm.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-amber-700 dark:text-amber-300">{allCategoryStatsMap.central_sewage.statusBreakdown.ongoing.totalKm.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-amber-800 dark:text-amber-300">
                    {(allCategoryStatsMap.central_sewage.statusBreakdown.ongoing.yellowNoPermitCount || 0) > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setYellowModalProjectScope('مشاريع الصرف بالقطاع الأوسط');
                          setSelectedYellowModalItems(allCategoryStatsMap.central_sewage.yellowNoPermitItems || null);
                          setIsYellowNoPermitModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 text-amber-900 dark:text-amber-200 rounded-lg text-[11px] font-black border border-amber-300 dark:border-amber-700 shadow-3xs transition-all cursor-pointer hover:scale-105"
                        title="انقر لمعاينة حصر القطاعات الجارية بدون فسح لمشاريع الصرف"
                      >
                        <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                        <span>{Number(((allCategoryStatsMap.central_sewage.statusBreakdown.ongoing.yellowNoPermitMeters || 0) / 1000).toFixed(3))} كم</span>
                        <span className="font-mono text-[10px]">({allCategoryStatsMap.central_sewage.statusBreakdown.ongoing.yellowNoPermitCount})</span>
                      </button>
                    ) : (
                      <span className="text-slate-400 font-normal">0 كم</span>
                    )}
                  </td>
                  <td className="p-3 text-center font-bold text-rose-700 dark:text-rose-300">{allCategoryStatsMap.central_sewage.statusBreakdown.remaining.totalKm.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-emerald-700 dark:text-emerald-300">
                    {(allCategoryStatsMap.central_sewage.statusBreakdown.executed_water.totalKm + allCategoryStatsMap.central_sewage.statusBreakdown.executed_sewage.totalKm).toFixed(3)}
                  </td>
                  <td className="p-3 text-center font-bold text-indigo-600 dark:text-indigo-400">{allCategoryStatsMap.central_sewage.totalPermitsCount.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-purple-600 dark:text-purple-400">
                    <div>{allCategoryStatsMap.central_sewage.uniqueSegmentsCount.toLocaleString('ar-SA')} فريد</div>
                    <div className="text-[10px] text-slate-400 font-normal">({allCategoryStatsMap.central_sewage.totalSegmentsCount.toLocaleString('ar-SA')} إجمالي)</div>
                  </td>
                </tr>

                {/* 5. مشاريع المياه بالقطاع الأوسط */}
                <tr className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${activeCategory === 'central_water' ? 'bg-blue-50/70 dark:bg-blue-950/40 font-black' : ''}`}>
                  <td className="p-3 flex items-center gap-2">
                    <Droplet className="h-4 w-4 text-cyan-600" />
                    <span>🚰 مشاريع المياه بالقطاع الأوسط</span>
                  </td>
                  <td className="p-3 text-center">{allCategoryStatsMap.central_water.projectsCount}</td>
                  <td className="p-3 text-center font-bold text-slate-900 dark:text-white">{allCategoryStatsMap.central_water.totalContractKm.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-amber-700 dark:text-amber-300">{allCategoryStatsMap.central_water.statusBreakdown.ongoing.totalKm.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-amber-800 dark:text-amber-300">
                    {(allCategoryStatsMap.central_water.statusBreakdown.ongoing.yellowNoPermitCount || 0) > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setYellowModalProjectScope('مشاريع المياه بالقطاع الأوسط');
                          setSelectedYellowModalItems(allCategoryStatsMap.central_water.yellowNoPermitItems || null);
                          setIsYellowNoPermitModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 text-amber-900 dark:text-amber-200 rounded-lg text-[11px] font-black border border-amber-300 dark:border-amber-700 shadow-3xs transition-all cursor-pointer hover:scale-105"
                        title="انقر لمعاينة حصر القطاعات الجارية بدون فسح لمشاريع المياه"
                      >
                        <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                        <span>{Number(((allCategoryStatsMap.central_water.statusBreakdown.ongoing.yellowNoPermitMeters || 0) / 1000).toFixed(3))} كم</span>
                        <span className="font-mono text-[10px]">({allCategoryStatsMap.central_water.statusBreakdown.ongoing.yellowNoPermitCount})</span>
                      </button>
                    ) : (
                      <span className="text-slate-400 font-normal">0 كم</span>
                    )}
                  </td>
                  <td className="p-3 text-center font-bold text-rose-700 dark:text-rose-300">{allCategoryStatsMap.central_water.statusBreakdown.remaining.totalKm.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-emerald-700 dark:text-emerald-300">
                    {(allCategoryStatsMap.central_water.statusBreakdown.executed_water.totalKm + allCategoryStatsMap.central_water.statusBreakdown.executed_sewage.totalKm).toFixed(3)}
                  </td>
                  <td className="p-3 text-center font-bold text-indigo-600 dark:text-indigo-400">{allCategoryStatsMap.central_water.totalPermitsCount.toLocaleString('ar-SA')}</td>
                  <td className="p-3 text-center font-bold text-purple-600 dark:text-purple-400">
                    <div>{allCategoryStatsMap.central_water.uniqueSegmentsCount.toLocaleString('ar-SA')} فريد</div>
                    <div className="text-[10px] text-slate-400 font-normal">({allCategoryStatsMap.central_water.totalSegmentsCount.toLocaleString('ar-SA')} إجمالي)</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Individual Projects Breakdown List for Active Category */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-600" />
              قائمة المشاريع المندرجة وحصر أطوالها بالتفصيل ({searchedProjects.length} مشروع)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              يمكنك البحث باسم المشروع، أمر الشراء، المقاول، أو المنطقة لمعاينة بيانات الأطوال بالتفصيل.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
            <button
              type="button"
              onClick={handleExportProjectsToExcel}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer whitespace-nowrap"
              title="تصدير جدول المشاريع بجميع بيانات وأعمدة الجدول إلى إكسل"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>تصدير المشاريع لإكسل</span>
            </button>

            <button
              type="button"
              onClick={() => handleExportSegmentsToExcel()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer whitespace-nowrap"
              title="تصدير تفاصيل بيانات Segment ID والإحداثيات والروابط والقطر لجميع المشاريع إلى ملف إكسل"
            >
              <FileSpreadsheet className="h-4 w-4 text-cyan-300" />
              <span>تصدير بيانات Segment ID (إكسل)</span>
            </button>

            <button
              type="button"
              onClick={() => handleExportPermitsToExcel()}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 active:scale-95 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer whitespace-nowrap"
              title="تصدير تفاصيل بيانات رخص وتصاريح الحفر (Permit No) لجميع المشاريع إلى ملف إكسل"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-200" />
              <span>تصدير بيانات Permit No (إكسل)</span>
            </button>

            <div className="relative w-full sm:w-64">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="البحث في مشاريع التوزيع..."
                className="w-full pr-9 pl-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse min-w-[1250px]">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-extrabold border-b border-slate-200 dark:border-slate-700">
                <th className="p-3">اسم المشروع / أمر الشراء</th>
                <th className="p-3">المقاول</th>
                <th className="p-3">تصنيف المشروع</th>
                <th className="p-3">البرنامج / القطاع</th>
                <th className="p-3">حالة العقد</th>
                <th className="p-3 text-center">إجمالي الأطوال بالعقد (كم)</th>
                <th className="p-3 text-center text-amber-700 dark:text-amber-300">الجاري (كم)</th>
                <th className="p-3 text-center bg-amber-500/10 dark:bg-amber-500/20 text-amber-900 dark:text-amber-300 font-black whitespace-nowrap">جاري بدون بيان فسح (أصفر)</th>
                <th className="p-3 text-center text-rose-700 dark:text-rose-300">المتبقي (كم)</th>
                <th className="p-3 text-center text-indigo-600 dark:text-indigo-400">الرخص (Permit No)</th>
                <th className="p-3 text-center text-purple-600 dark:text-purple-400">السجمنت (الفريد / الإجمالي)</th>
                <th className="p-3 text-center text-blue-700 dark:text-blue-300 whitespace-nowrap min-w-[150px]">آخر تقرير تم تحليله</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {searchedProjects.map((p) => {
                const savedReport = findReportForProject(p, reportsMap);
                const metric = getValidMetricForProject(p);
                const res = savedReport?.analysisResult || null;

                const totalKm = res ? (res.totalLengthKm || 0) : (metric ? metric.totalLengthKm : 0);
                const ongoingKm = res ? (res.colorBreakdown?.ongoing?.totalLengthKm || 0) : (metric ? Number((metric.ongoingMeters / 1000).toFixed(3)) : 0);
                const remainingKm = res ? (res.colorBreakdown?.remaining?.totalLengthKm || 0) : (metric ? Number((metric.remainingMeters / 1000).toFixed(3)) : 0);

                const yellowKm = res && res.items && res.items.length > 0
                  ? Number((res.items.filter(isYellowItemWithoutPermit).reduce((s, it) => s + (it.lengthMeters || 0), 0) / 1000).toFixed(3))
                  : (metric ? (metric.yellowNoPermitKm || (metric.yellowNoPermitMeters ? Number((metric.yellowNoPermitMeters / 1000).toFixed(3)) : 0)) : 0);

                const yellowCount = res && res.items && res.items.length > 0
                  ? res.items.filter(isYellowItemWithoutPermit).length
                  : (metric ? (metric.yellowNoPermitCount || 0) : 0);

                const getProjectYellowItems = (): YellowNoPermitItemDetail[] => {
                  if (res && res.items && res.items.length > 0) {
                    return res.items
                      .filter(isYellowItemWithoutPermit)
                      .map((item, idx) => ({
                        id: item.id || `yellow-${p.id}-${idx + 1}`,
                        projectId: p.id,
                        projectName: p.name,
                        po: p.po,
                        contractor: item.contractor || p.contractor || 'غير محدد',
                        classification: p.classification,
                        region: p.region,
                        subProgram: p.subProgram,
                        scope: p.scope,
                        segmentId: item.segmentId || 'غير محدد',
                        permitNo: item.permitNo || '',
                        name: item.name || `قطاع ${item.segmentId || ''}`,
                        lengthMeters: item.lengthMeters || 0,
                        lengthKm: item.lengthKm || Number(((item.lengthMeters || 0) / 1000).toFixed(3)),
                        stage: item.stage || 'غير متوفر',
                        streetName: item.streetName || item.name,
                        district: item.district,
                        innerDiameter: item.innerDiameter,
                        zone: item.zone,
                        drillingType: item.drillingType,
                        centerLat: item.centerLat,
                        centerLng: item.centerLng,
                        googleMapsUrl: item.googleMapsUrl,
                        coordinates: item.coordinates,
                        featureItem: item,
                        projectObj: p
                      }));
                  }
                  if (metric && metric.yellowNoPermitSegments && metric.yellowNoPermitSegments.length > 0) {
                    return metric.yellowNoPermitSegments.map((sId, sIdx) => ({
                      id: `yellow-metric-${p.id}-${sIdx + 1}`,
                      projectId: p.id,
                      projectName: p.name,
                      po: p.po,
                      contractor: p.contractor || 'غير محدد',
                      classification: p.classification,
                      region: p.region,
                      subProgram: p.subProgram,
                      scope: p.scope,
                      segmentId: sId,
                      permitNo: '',
                      name: `قطاع ${sId}`,
                      lengthMeters: Math.round((metric.yellowNoPermitMeters || 0) / (metric.yellowNoPermitSegments?.length || 1)),
                      lengthKm: Number(((metric.yellowNoPermitMeters || 0) / (metric.yellowNoPermitSegments?.length || 1) / 1000).toFixed(3)),
                      stage: 'جاري العمل',
                      streetName: p.name,
                      projectObj: p
                    }));
                  }
                  return [];
                };

                const permitCount = res && res.permitNosByStatus
                  ? new Set(Object.values(res.permitNosByStatus).flat().filter(isValidIdentifier)).size
                  : (metric ? metric.permitsCount : 0);

                const uniqueSegmentCount = res && res.segmentIdsByStatus
                  ? new Set(Object.values(res.segmentIdsByStatus).flat().filter(isValidIdentifier)).size
                  : (metric ? metric.uniqueSegmentsCount : 0);

                const totalSegmentCount = res ? (res.totalFeaturesCount || 0) : (metric ? metric.totalSegmentsCount : 0);

                const reportDateRaw = savedReport?.createdAt || savedReport?.parsedAt || metric?.updatedAt;
                let reportDateFormatted = '';
                if (reportDateRaw) {
                  try {
                    const d = new Date(reportDateRaw);
                    if (!isNaN(d.getTime())) {
                      reportDateFormatted = d.toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' });
                    }
                  } catch (e) {
                    reportDateFormatted = '';
                  }
                }

                return (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                    <td className="p-3">
                      <div className="font-extrabold text-slate-900 dark:text-slate-100">{p.name}</div>
                      <div className="text-[11px] text-slate-400">PO: {p.po || '-'}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-extrabold text-slate-800 dark:text-slate-200">
                        {p.contractor || 'غير محدد'}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-bold text-[11px] whitespace-nowrap">
                        {p.classification || 'غير محدد'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 font-bold text-[11px] whitespace-nowrap">
                        {p.subProgram || p.scope || 'غير محدد'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-lg font-bold text-[11px] whitespace-nowrap ${
                        p.status === 'جاري'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {p.status || 'جاري'}
                      </span>
                    </td>
                    <td className="p-3 text-center font-extrabold text-slate-900 dark:text-white">
                      {totalKm > 0 ? `${totalKm} كم` : <span className="text-slate-400 font-normal">لا يوجد تقرير</span>}
                    </td>
                    <td className="p-3 text-center font-extrabold text-amber-700 dark:text-amber-300">
                      {ongoingKm} كم
                    </td>
                    <td className="p-3 text-center bg-amber-50/40 dark:bg-amber-950/20 border-x border-amber-200/40 dark:border-amber-800/40">
                      {yellowCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            const items = getProjectYellowItems();
                            setSelectedYellowModalItems(items);
                            setYellowModalProjectScope(`مشروع: ${p.name}`);
                            setIsYellowNoPermitModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100/90 dark:bg-amber-900/60 hover:bg-amber-200 text-amber-900 dark:text-amber-200 rounded-lg text-[11px] font-black border border-amber-300 dark:border-amber-700 shadow-3xs cursor-pointer transition-all hover:scale-105"
                          title="انقر لمعاينة وحصر القطاعات الجارية باللون الأصفر بدون رقم فسح لهذا المشروع"
                        >
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>{yellowKm} كم</span>
                          <span className="text-[10px] px-1.5 py-0.2 bg-amber-200 dark:bg-amber-800 rounded font-mono">({yellowCount})</span>
                        </button>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500 font-medium text-[11px]">0 كم (0 قطاع)</span>
                      )}
                    </td>
                    <td className="p-3 text-center font-extrabold text-rose-700 dark:text-rose-300">
                      {remainingKm} كم
                    </td>
                    <td className="p-3 text-center font-bold text-indigo-600 dark:text-indigo-400">
                      {permitCount}
                    </td>
                    <td className="p-3 text-center font-bold text-purple-600 dark:text-purple-400">
                      <div>{uniqueSegmentCount.toLocaleString('ar-SA')} فريد</div>
                      {totalSegmentCount > 0 && (
                        <div className="text-[10px] text-slate-400 font-normal">({totalSegmentCount.toLocaleString('ar-SA')} إجمالي)</div>
                      )}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap min-w-[150px]">
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenMyMaps) {
                            onOpenMyMaps(p);
                          } else {
                            if (onSelectProject) onSelectProject(p);
                            setSelectedReportModalProject(p);
                          }
                        }}
                        className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 font-extrabold text-[11px] rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 mx-auto border border-blue-200 dark:border-blue-800/80 shadow-3xs whitespace-nowrap shrink-0 hover:scale-102"
                        title="استدعاء وفتح آخر تقرير تم تحليله للمشروع مباشرة في قسم تحليل الخرائط الجغرافية"
                      >
                        <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span className="whitespace-nowrap">{savedReport ? `تقرير ${reportDateFormatted || 'المعتمد'}` : 'لا يوجد تقرير'}</span>
                        <ExternalLink className="h-3 w-3 opacity-70 shrink-0" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Report Modal */}
      {selectedReportModalProject && (() => {
        const p = selectedReportModalProject;
        const savedReport = findReportForProject(p, reportsMap);
        const metric = getValidMetricForProject(p);
        const res = savedReport?.analysisResult || null;

        const reportDateRaw = savedReport?.createdAt || savedReport?.parsedAt || metric?.updatedAt;
        let reportDateFormatted = '';
        if (reportDateRaw) {
          try {
            const d = new Date(reportDateRaw);
            if (!isNaN(d.getTime())) {
              reportDateFormatted = d.toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' });
            }
          } catch (e) {
            reportDateFormatted = '';
          }
        }

        const totalKm = res ? (res.totalLengthKm || 0) : (metric ? metric.totalLengthKm : 0);
        const totalMeters = res ? (res.totalLengthMeters || 0) : (metric ? metric.totalLengthMeters : 0);
        const ongoingKm = res ? (res.colorBreakdown?.ongoing?.totalLengthKm || 0) : (metric ? Number((metric.ongoingMeters / 1000).toFixed(3)) : 0);
        const remainingKm = res ? (res.colorBreakdown?.remaining?.totalLengthKm || 0) : (metric ? Number((metric.remainingMeters / 1000).toFixed(3)) : 0);
        const executedWaterKm = res ? (res.colorBreakdown?.executed_water?.totalLengthKm || (res.colorBreakdown as any)?.executedWater?.totalLengthKm || 0) : (metric ? Number((metric.executedWaterMeters / 1000).toFixed(3)) : 0);
        const executedSewageKm = res ? (res.colorBreakdown?.executed_sewage?.totalLengthKm || (res.colorBreakdown as any)?.executedSewage?.totalLengthKm || 0) : (metric ? Number((metric.executedSewageMeters / 1000).toFixed(3)) : 0);
        const cancelledKm = res ? (res.colorBreakdown?.cancelled?.totalLengthKm || 0) : (metric ? Number((metric.cancelledMeters / 1000).toFixed(3)) : 0);

        const permitsList: string[] = res && res.permitNosByStatus
          ? Array.from(new Set(Object.values(res.permitNosByStatus).flat().filter(isValidIdentifier)))
          : (metric && metric.permitsList && metric.permitsList.length > 0 ? metric.permitsList : []);

        const segmentsList: string[] = res && res.segmentIdsByStatus
          ? Array.from(new Set(Object.values(res.segmentIdsByStatus).flat().filter(isValidIdentifier)))
          : (metric && metric.segmentsList && metric.segmentsList.length > 0 ? metric.segmentsList : []);

        return (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md overflow-y-auto">
            <div dir="rtl" className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="p-5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-sm shrink-0">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-black text-slate-900 dark:text-white">
                        آخر تقرير تم تحليله للمشروع
                      </h3>
                      {reportDateFormatted && (
                        <span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-bold text-xs rounded-full">
                          تاريخ: {reportDateFormatted}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-0.5">
                      {p.name} {p.po ? (p.po.includes('PO') ? `(${p.po})` : `(PO: ${p.po})`) : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReportModalProject(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-5 flex-1">
                {/* Meta Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 text-xs">
                  <div>
                    <span className="text-slate-400 font-bold block">المقاول</span>
                    <span className="font-extrabold text-slate-800 dark:text-slate-200">{p.contractor || 'غير محدد'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold block">تصنيف / قطاع المشروع</span>
                    <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{p.scope || p.classification || 'مياه/صرف'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold block">حالة العقد</span>
                    <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{p.status || 'جاري'}</span>
                  </div>
                </div>

                {/* Length Breakdown Grid */}
                <div>
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 mb-2.5 flex items-center gap-1.5">
                    <Ruler className="h-4 w-4 text-blue-600" />
                    <span>ملخص حصر أطوال التقرير المعتمد</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-3 bg-blue-50/70 dark:bg-blue-950/40 rounded-2xl border border-blue-100 dark:border-blue-900">
                      <span className="text-[11px] font-bold text-blue-800 dark:text-blue-300 block">إجمالي طول العقد</span>
                      <span className="text-lg font-black text-blue-950 dark:text-blue-100">{totalKm.toLocaleString('ar-SA')} <span className="text-xs font-bold">كم</span></span>
                      {totalMeters > 0 && (
                        <span className="text-[10px] text-blue-600 dark:text-blue-400 block mt-0.5">({totalMeters.toLocaleString('ar-SA')} متر)</span>
                      )}
                    </div>

                    <div className="p-3 bg-sky-50/70 dark:bg-sky-950/40 rounded-2xl border border-sky-200 dark:border-sky-900/80">
                      <span className="text-[11px] font-bold text-sky-800 dark:text-sky-300 block">منفذ - شبكات مياه</span>
                      <span className="text-lg font-black text-sky-950 dark:text-sky-100">{executedWaterKm.toLocaleString('ar-SA')} <span className="text-xs font-bold">كم</span></span>
                    </div>

                    <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-900/80">
                      <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 block">منفذ - شبكات صرف صحي</span>
                      <span className="text-lg font-black text-emerald-950 dark:text-emerald-100">{executedSewageKm.toLocaleString('ar-SA')} <span className="text-xs font-bold">كم</span></span>
                    </div>

                    <div className="p-3 bg-amber-50/70 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-900">
                      <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 block">جاري تنفيذه</span>
                      <span className="text-lg font-black text-amber-950 dark:text-amber-100">{ongoingKm.toLocaleString('ar-SA')} <span className="text-xs font-bold">كم</span></span>
                    </div>

                    <div className="p-3 bg-rose-50/70 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-900">
                      <span className="text-[11px] font-bold text-rose-800 dark:text-rose-300 block">أعمال متبقية</span>
                      <span className="text-lg font-black text-rose-950 dark:text-rose-100">{remainingKm.toLocaleString('ar-SA')} <span className="text-xs font-bold">كم</span></span>
                    </div>

                    <div className="p-3 bg-slate-100/70 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">خطوط ملغاة</span>
                      <span className="text-lg font-black text-slate-900 dark:text-slate-100">{cancelledKm.toLocaleString('ar-SA')} <span className="text-xs font-bold">كم</span></span>
                    </div>
                  </div>
                </div>

                {/* Permits and Segments Lists */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-indigo-700 dark:text-indigo-300">رخص الحفر (Permit No)</span>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-extrabold text-[11px]">
                        {permitsList.length.toLocaleString('ar-SA')} رخصة
                      </span>
                    </div>
                    <div className="max-h-28 overflow-y-auto p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5 text-[11px] font-bold">
                      {permitsList.length > 0 ? (
                        permitsList.map((pNo, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-md border border-indigo-100 dark:border-indigo-900/60">
                            {pNo}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 font-normal text-xs">لا توجد رخص مسجلة لهذا التقرير</span>
                      )}
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-purple-700 dark:text-purple-300">السجمنت / القطاعات (Segment ID)</span>
                      <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 font-extrabold text-[11px]">
                        {segmentsList.length.toLocaleString('ar-SA')} سجمنت
                      </span>
                    </div>
                    <div className="max-h-28 overflow-y-auto p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5 text-[11px] font-bold">
                      {segmentsList.length > 0 ? (
                        segmentsList.map((sId, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 rounded-md border border-purple-100 dark:border-purple-900/60">
                            {sId}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 font-normal text-xs">لا توجد قطاعات سجمنت مسجلة لهذا التقرير</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Yellow No Permit Notice for this specific project */}
                {(res?.items?.some(it => isYellowItemWithoutPermit(it)) || (metric?.yellowNoPermitCount || 0) > 0) && (
                  <div className="p-3.5 bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
                    <div className="flex items-center gap-2 text-rose-800 dark:text-rose-200 font-black">
                      <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 animate-bounce" />
                      <div>
                        <div>يوجد قطاعات جارية باللون الأصفر بدون رقم فسح مسجل بهذا المشروع 🚨</div>
                        <div className="text-[11px] font-normal text-rose-600 dark:text-rose-300">
                          {metric?.yellowNoPermitCount ? `${metric.yellowNoPermitCount} قطاع - ${metric.yellowNoPermitKm || 0} كم` : 'يرجى مراجعة وتدقيق رخص الحفر'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedReportModalProject(null);
                        setYellowModalProjectScope(`مشروع: ${p.name}`);
                        setIsYellowNoPermitModalOpen(true);
                      }}
                      className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs transition-all shadow-xs cursor-pointer shrink-0 flex items-center gap-1.5"
                    >
                      <span>معاينة القطاعات بدون فسح 🔍</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {onOpenMyMaps && (
                    <button
                      type="button"
                      onClick={() => {
                        const proj = p;
                        setSelectedReportModalProject(null);
                        onOpenMyMaps(proj);
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-xs"
                    >
                      <Globe className="h-4 w-4 text-cyan-300" />
                      <span>فتح خريطة التحليل (My Maps) 🌐</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleExportSegmentsToExcel([p])}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-xs"
                    title="تصدير تفاصيل بيانات Segment ID لهذا المشروع إلى إكسل"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-cyan-300" />
                    <span>تصدير Segment ID لإكسل</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportPermitsToExcel([p])}
                    className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-xs"
                    title="تصدير تفاصيل رخص Permit No لهذا المشروع إلى إكسل"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-200" />
                    <span>تصدير Permit No لإكسل</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedReportModalProject(null)}
                  className="px-5 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Yellow Items Without Permit Modal */}
      <YellowNoPermitModal
        isOpen={isYellowNoPermitModalOpen}
        onClose={() => {
          setIsYellowNoPermitModalOpen(false);
          setSelectedYellowModalItems(null);
        }}
        items={selectedYellowModalItems !== null ? selectedYellowModalItems : (activeStats.yellowNoPermitItems || [])}
        categoryTitle={yellowModalProjectScope || 'جميع المشاريع'}
        onOpenMyMaps={onOpenMyMaps}
      />
    </div>
  );
}
