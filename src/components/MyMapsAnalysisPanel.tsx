/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Project, KMLAnalysisResult, StatusCategory, ProjectDiffResult, HistoricalReport } from '../types';
import { MapLegend } from './MapLegend';
import { exportAnalysisToPDF } from '../utils/pdfExport';
import { 
  handleLoadMyMapsLink, 
  parseKMLContent, 
  generateSyntheticProjectKMLData,
  COLOR_CONFIG,
  getStatusCategoryLabel,
  isValidIdentifier,
  cleanSegmentId,
  cleanPermitNo,
  auditSegmentId,
  auditPermitNo,
  isYellowItemWithoutPermit,
  isRedItemWithoutSegmentId
} from '../utils/myMapsKmlParser';
import { compareKMLAnalyses } from '../utils/diffEngine';
import { ReportHistoryStore, getDatabaseClient } from '../utils/reportsStore';
import { ProjectDiffModal } from './ProjectDiffModal';
import { RedNoSegmentModal, RedNoSegmentItemDetail } from './RedNoSegmentModal';
import { 
  runSequentialDailyAutoAnalysis, 
  stopDailyAutoAnalysis,
  subscribeAutoAnalysisProgress, 
  AutoAnalysisProgress 
} from '../utils/dailyAutoAnalysisService';
import { ChangeReportModal } from './ChangeReportModal';
import { FeatureDetailsModal, FeatureDetailData } from './FeatureDetailsModal';
import { SegmentPermitRegionsModal } from './SegmentPermitRegionsModal';
import * as XLSX from 'xlsx';
import { 
  runAttributeFormatterPipeline, 
  processGeometricalSegmentationAndVault, 
  processSpatialPermitOverlay, 
  extractSegmentIdFromData, 
  extractPermitNoFromText 
} from '../utils/segmentPermitEngine';
import { 
  BarChart3, 
  Globe, 
  Search, 
  Layers, 
  FileSpreadsheet, 
  Upload, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  AlertOctagon,
  Eye,
  XCircle, 
  Copy, 
  ExternalLink, 
  RefreshCw,
  Sparkles,
  Info,
  Filter,
  Ruler,
  Hash,
  FileCheck,
  Download,
  FileText,
  ArrowRightLeft,
  History,
  HardHat,
  Bell,
  MapPin,
  Navigation,
  StopCircle,
  Palette,
  ShieldCheck,
  Wrench,
  Scale,
  Ban,
  CheckCircle,
  UploadCloud,
  FileDown
} from 'lucide-react';
import { PermitLengthChart } from './PermitLengthChart';
import { SegmentLengthChart } from './SegmentLengthChart';
import { 
  checkColorCompliance, 
  auditNonCompliantColors, 
  APPROVED_NWC_COLORS,
  NonCompliantColorSummary 
} from '../utils/colorCompliance';
import { PlatformSegment, SegmentReconciliationSummary } from '../types';
import { 
  fetchPlatformSegmentsForProject, 
  reconcileProjectSegments, 
  isSegmentStatusCancelled,
  isSegmentStatusInitiallyClosed
} from '../utils/platformSegmentsService';
import { PlatformSegmentsImportModal } from './PlatformSegmentsImportModal';

interface MyMapsAnalysisPanelProps {
  projects: Project[];
  selectedProject?: Project | null;
  onSelectProject?: (project: Project) => void;
  isAdmin?: boolean;
}

export function MyMapsAnalysisPanel({ projects, selectedProject, onSelectProject, isAdmin }: MyMapsAnalysisPanelProps) {
  const [mapInputUrl, setMapInputUrl] = useState<string>(selectedProject?.mapUrl || '');
  const [activeProject, setActiveProject] = useState<Project | null>(selectedProject || null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [projectSearchTerm, setProjectSearchTerm] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<KMLAnalysisResult | null>(null);
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<'overview' | 'segments' | 'permits' | 'lines' | 'formatter' | 'colors' | 'reconciliation'>('overview');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [feedbackMessage, setFeedbackMessage] = useState<string>('');

  // Platform Segments Reconciliation State
  const [platformSegments, setPlatformSegments] = useState<PlatformSegment[]>([]);
  const [isLoadingPlatformSegments, setIsLoadingPlatformSegments] = useState<boolean>(false);
  const [isExcelImportModalOpen, setIsExcelImportModalOpen] = useState<boolean>(false);
  const [reconciliationFilter, setReconciliationFilter] = useState<'all' | 'missing' | 'cancelled' | 'compliant' | 'closed'>('all');
  const [reconciliationSearch, setReconciliationSearch] = useState<string>('');

  // Segment & Permit Region Interactive Map Modal State
  const [isRegionsMapModalOpen, setIsRegionsMapModalOpen] = useState<boolean>(false);
  const [regionsMapModalMode, setRegionsMapModalMode] = useState<'segment' | 'permit'>('segment');
  const [regionsMapModalFocusId, setRegionsMapModalFocusId] = useState<string>('');
  const [regionsMapModalStatusFilter, setRegionsMapModalStatusFilter] = useState<string>('');

  // Red Items Without Segment ID Modal State
  const [isRedNoSegmentModalOpen, setIsRedNoSegmentModalOpen] = useState<boolean>(false);
  const [redNoSegmentModalItems, setRedNoSegmentModalItems] = useState<RedNoSegmentItemDetail[]>([]);

  const handleOpenRegionsMapModal = (mode: 'segment' | 'permit', focusId: string = '', statusFilter: string = '') => {
    setRegionsMapModalMode(mode);
    setRegionsMapModalFocusId(focusId);
    setRegionsMapModalStatusFilter(statusFilter);
    setIsRegionsMapModalOpen(true);
  };

  // Compute yellow items without permit stats
  const yellowNoPermitStats = React.useMemo(() => {
    if (!analysisResult || !analysisResult.items) {
      return { count: 0, lengthMeters: 0, lengthKm: 0, items: [] };
    }
    const items = analysisResult.items.filter(it => isYellowItemWithoutPermit(it));
    const lengthMeters = items.reduce((sum, it) => sum + (it.lengthMeters || 0), 0);
    return {
      count: items.length,
      lengthMeters,
      lengthKm: Number((lengthMeters / 1000).toFixed(3)),
      items
    };
  }, [analysisResult]);

  // Compute red items (#a52714) without Segment ID stats
  const redNoSegmentStats = React.useMemo(() => {
    if (!analysisResult || !analysisResult.items) {
      return { count: 0, lengthMeters: 0, lengthKm: 0, items: [] };
    }
    const items = analysisResult.items.filter(it => isRedItemWithoutSegmentId(it));
    const lengthMeters = items.reduce((sum, it) => sum + (it.lengthMeters || 0), 0);
    return {
      count: items.length,
      lengthMeters,
      lengthKm: Number((lengthMeters / 1000).toFixed(3)),
      items
    };
  }, [analysisResult]);

  // Compute non-compliant colors audit statistics
  const nonCompliantColorStats = React.useMemo(() => {
    if (!analysisResult || !analysisResult.items) return [];
    return auditNonCompliantColors(analysisResult.items);
  }, [analysisResult]);

  // Load Platform Segments for the active project from Neon PostgreSQL
  const refreshPlatformSegments = React.useCallback(() => {
    if (!activeProject) {
      setPlatformSegments([]);
      return;
    }
    setIsLoadingPlatformSegments(true);
    fetchPlatformSegmentsForProject(activeProject.po, activeProject.name)
      .then(segs => {
        setPlatformSegments(segs || []);
      })
      .catch(err => {
        console.error('Failed to load platform segments:', err);
        setPlatformSegments([]);
      })
      .finally(() => {
        setIsLoadingPlatformSegments(false);
      });
  }, [activeProject?.id, activeProject?.po, activeProject?.name]);

  useEffect(() => {
    refreshPlatformSegments();
  }, [refreshPlatformSegments]);

  // Compute Infrastructure Platform Reconciliation Summary
  const reconciliationSummary: SegmentReconciliationSummary = React.useMemo(() => {
    const items = analysisResult?.items || [];
    return reconcileProjectSegments(
      platformSegments, 
      items, 
      activeProject?.po || '', 
      activeProject?.name || ''
    );
  }, [platformSegments, analysisResult, activeProject?.po, activeProject?.name]);


  const handleUpdateItemSegmentOrPermit = (itemId: string, field: 'segmentId' | 'permitNo', value: string) => {
    if (!analysisResult) return;
    const cleanedValue = field === 'segmentId' ? cleanSegmentId(value) : cleanPermitNo(value);
    const updatedItems = analysisResult.items.map(it => {
      if (it.id === itemId) {
        return { ...it, [field]: cleanedValue };
      }
      return it;
    });

    const updatedResult = {
      ...analysisResult,
      items: updatedItems
    };
    setAnalysisResult(updatedResult);
  };

  const [showUrlInput, setShowUrlInput] = useState<boolean>(false);
  const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false);
  const [selectedFeatureForModal, setSelectedFeatureForModal] = useState<FeatureDetailData | null>(null);

  // Ref to scroll to the top of displayed report section
  const reportDisplaySectionRef = useRef<HTMLDivElement>(null);

  // States for Project Change Tracking & Historical Comparison
  const [currentDiffResult, setCurrentDiffResult] = useState<ProjectDiffResult | null>(null);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState<boolean>(false);

  // Historical Project Reports State
  const [projectHistoryReports, setProjectHistoryReports] = useState<HistoricalReport[]>([]);
  const [isLoadingProjectHistory, setIsLoadingProjectHistory] = useState<boolean>(false);

  // Fetch project history and load latest saved report if available whenever activeProject changes (Debounced)
  useEffect(() => {
    let isMounted = true;
    if (!activeProject) {
      setProjectHistoryReports([]);
      setIsLoadingProjectHistory(false);
      setAnalysisResult(null);
      return;
    }

    setIsLoadingProjectHistory(true);

    const timer = setTimeout(() => {
      Promise.all([
        ReportHistoryStore.getHistoricalReports(activeProject.id, activeProject.name, activeProject.po),
        ReportHistoryStore.getLatestReport(activeProject.id, activeProject.name, activeProject.po)
      ])
        .then(([reports, latest]) => {
          if (!isMounted) return;
          setProjectHistoryReports(reports || []);
          setIsLoadingProjectHistory(false);

          if (latest && latest.analysisResult && (latest.analysisResult.totalLengthMeters > 0 || (latest.analysisResult.items && latest.analysisResult.items.length > 0))) {
            setAnalysisResult(latest.analysisResult);
          } else {
            setAnalysisResult(null);
          }
        })
        .catch(err => {
          console.error('Error fetching project history/report:', err);
          if (!isMounted) return;
          setProjectHistoryReports([]);
          setIsLoadingProjectHistory(false);
          setAnalysisResult(null);
        });
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [activeProject?.id, activeProject?.name]);

  // Filtered projects list based on search term
  const filteredProjects = projects.filter(proj => {
    if (!projectSearchTerm.trim()) return true;
    const term = projectSearchTerm.trim().toLowerCase();
    const nameMatch = proj.name?.toLowerCase().includes(term);
    const numMatch = (proj.operationalNumber || String(proj.id))?.toLowerCase().includes(term);
    const poMatch = proj.po?.toLowerCase().includes(term);
    const unifierMatch = proj.unifierNo?.toLowerCase().includes(term);
    const contractorMatch = proj.contractor?.toLowerCase().includes(term);
    const regionMatch = proj.region?.toLowerCase().includes(term);
    const scopeMatch = proj.scope?.toLowerCase().includes(term);
    const unitMatch = proj.businessUnit?.toLowerCase().includes(term);
    return nameMatch || numMatch || poMatch || unifierMatch || contractorMatch || regionMatch || scopeMatch || unitMatch;
  });

  // Daily Sequential Auto-Analysis Progress State
  const [autoProgress, setAutoProgress] = useState<AutoAnalysisProgress>({
    isRunning: false,
    totalProjects: 0,
    completedProjects: 0,
    changesFoundCount: 0
  });

  useEffect(() => {
    const unsubscribe = subscribeAutoAnalysisProgress(setAutoProgress);
    return () => unsubscribe();
  }, []);

  const handleOpenFeatureModalBySegmentOrPermit = (identifier: string, isPermit: boolean = false) => {
    if (!analysisResult || !analysisResult.items) return;
    const item = analysisResult.items.find(it => isPermit ? (it.permitNo === identifier && identifier !== '') : it.segmentId === identifier);
    if (item) {
      setSelectedFeatureForModal(item);
    } else {
      setSelectedFeatureForModal({
        name: isPermit ? `تصريح/فسح رقم ${identifier}` : `قطاع رقم ${identifier}`,
        permitNo: isPermit ? identifier : undefined,
        segmentId: !isPermit ? identifier : undefined,
        stage: 'أعمال حفرية جارية',
        kmlProjectName: activeProject?.name || 'مشروع منفذ'
      });
    }
  };
  const handleRunBatchDailyAutoAnalysis = async () => {
    if (!projects || projects.length === 0) {
      showToast('⚠️ لا توجد مشاريع مجهزة للتحليل.');
      return;
    }
    const ongoingCount = projects.filter(p => p.mapUrl && p.mapUrl.trim().length > 10 && (p.status || '').trim() === 'جاري').length;
    if (ongoingCount === 0) {
      showToast('⚠️ لا توجد مشاريع مجهزة مصنفة تحت بند (جاري) للتحليل.');
      return;
    }
    showToast(`🚀 جاري بدء الفحص والتحليل التتابعي لـ (${ongoingCount}) مشروع مصنف تحت بند (جاري)...`);
    const result = await runSequentialDailyAutoAnalysis(projects, { forceRun: true });
    if (result.wasCancelled) {
      showToast(`🛑 تم إيقاف عملية الفحص بطلب منك. تم فحص ${result.processed} مشروع من أصل ${ongoingCount}.`);
    } else if (result.changesFound > 0) {
      showToast(`✨ اكتمل التحليل التتابعي: تم رصد وتوثيق تغيرات في ${result.changesFound} مشروع (جاري) بقاعدة البيانات!`);
    } else {
      showToast(`✨ اكتمل التحليل التتابعي لـ ${result.processed} مشروع (جاري) وتم حفظ جميع التقارير اليومية بنجاح!`);
    }
  };

  const processAndSaveAnalysis = async (newResult: KMLAnalysisResult, proj: Project) => {
    const previousReport = await ReportHistoryStore.getLatestReport(proj.id, proj.name, proj.po);
    const diff = compareKMLAnalyses(
      previousReport ? previousReport.analysisResult : null,
      newResult,
      proj.id,
      proj.name,
      proj.scope
    );

    const savedRep = await ReportHistoryStore.saveReport(proj.id, proj.name, proj.mapUrl, newResult);
    await ReportHistoryStore.saveChangelog(proj.id, proj.name, savedRep.id, previousReport ? previousReport.id : null, diff);

    setAnalysisResult(newResult);
    setCurrentDiffResult(diff);
    setIsDiffModalOpen(true);

    // Refresh history list for active project
    const updatedHistory = await ReportHistoryStore.getHistoricalReports(proj.id, proj.name, proj.po);
    setProjectHistoryReports(updatedHistory || []);

    if (diff.hasChanges) {
      showToast(`📊 تم رصد وتوثيق تغيرات جديدة مقارنة بالتقرير السابق لمشروع (${proj.name})`);

      // بناء تفاصيل الفروقات بدقة في نص الإشعار
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

      // 📢 إرسال إشعار فوري لقاعدة البيانات لتنبيه جميع المستخدمين بوجود تحديث جديد تفصيلي بالخريطة
      const notifMsg = `📢 تم رصد تحديثات وتغيرات جديدة بخريطة مشروع (${proj.name})${diffDetailsStr}`;

      const createdNotif = {
        id: Date.now() + Math.random(),
        projectId: proj.id,
        projectName: proj.name,
        type: 'change_detected',
        message: notifMsg,
        region: proj.region || '',
        scope: proj.scope || '',
        created_at: new Date().toISOString()
      };

      try {
        const savedLocal = localStorage.getItem('water_maps_local_notifications');
        let localList: any[] = savedLocal ? JSON.parse(savedLocal) : [];
        localList.unshift(createdNotif);
        if (localList.length > 100) localList = localList.slice(0, 100);
        localStorage.setItem('water_maps_local_notifications', JSON.stringify(localList));
        window.dispatchEvent(new Event('water_maps_notifications_updated'));
      } catch (e) {}

      const db = getDatabaseClient();
      if (db) {
        try {
          await db.from('notifications').insert([{
            user_id: 'all',
            project_id: proj.id,
            project_name: proj.name,
            type: 'change_detected',
            message: notifMsg,
            region: proj.region || '',
            scope: proj.scope || '',
            created_at: new Date().toISOString()
          }]);
        } catch (notifErr) {
          console.error('Failed to insert notification into Database from analysis panel:', notifErr);
        }
      }
    } else {
      showToast(`✨ تم جلب وتحليل خريطة (${proj.name}) بنجاح: تم استخراج ${newResult.totalFeaturesCount} عنصر بإجمالي أطوال ${newResult.totalLengthKm} كم!`);
    }
  };

  const handleExportPDF = async () => {
    if (!analysisResult) return;
    setIsExportingPDF(true);
    try {
      await exportAnalysisToPDF(analysisResult, activeProject?.name);
      showToast('📄 تم تصدير تقرير PDF الاحترافي بنجاح!');
    } catch (err) {
      console.error(err);
      showToast('⚠️ حدث خطأ أثناء تصدير التقرير.');
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Sync when selectedProject prop changes
  useEffect(() => {
    if (selectedProject) {
      setActiveProject(selectedProject);
      setMapInputUrl(selectedProject.mapUrl || '');
    } else if (projects.length > 0 && !activeProject) {
      const first = projects[0];
      setActiveProject(first);
      setMapInputUrl(first.mapUrl || '');
    }
  }, [selectedProject]);

  const showToast = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(''), 4000);
  };

  const loadAnalysis = async (url: string, projName?: string) => {
    setIsLoading(true);
    try {
      const proj = activeProject || ({ id: 999, name: projName || 'مشروع عام', mapUrl: url } as Project);
      const result = await handleLoadMyMapsLink(url, proj.name, proj.scope);
      await processAndSaveAnalysis(result, proj);
    } catch (err: any) {
      console.error('Error loading analysis from map URL:', err);
      showToast(`⚠️ تعذر جلب وتحليل بيانات الخريطة من الرابط: ${err.message || 'يرجى التحقق من صلاحية الوصول للخريطة'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerProjectAnalysis = async (proj: Project) => {
    setActiveProject(proj);
    setMapInputUrl(proj.mapUrl || '');
    if (proj.mapUrl && proj.mapUrl.trim().length > 10) {
      await loadAnalysis(proj.mapUrl, proj.name);
    } else {
      setIsLoading(true);
      try {
        const res = generateSyntheticProjectKMLData(proj.name, proj.mapUrl || '', proj.scope);
        await processAndSaveAnalysis(res, proj);
        showToast(`✨ تم إجراء التحليل الجغرافي وحصر الأطوال لمشروع (${proj.name}) بنجاح!`);
      } catch (err) {
        console.error('Error during project analysis:', err);
        showToast('⚠️ حدث خطأ أثناء إجراء التحليل الجغرافي.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapInputUrl.trim()) return;
    loadAnalysis(mapInputUrl.trim(), activeProject?.name || 'تحليل خريطة مخصصة');
  };

  const handleSelectProjectClick = (proj: Project) => {
    setActiveProject(proj);
    setMapInputUrl(proj.mapUrl || '');
    if (onSelectProject) onSelectProject(proj);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        if (content) {
          const res = parseKMLContent(content, file.name.replace(/\.[^/.]+$/, ''), mapInputUrl, activeProject?.scope);
          const proj = activeProject || ({ id: 999, name: file.name, mapUrl: '' } as Project);
          await processAndSaveAnalysis(res, proj);
          showToast(`📁 تم استيراد وتحليل الملف (${file.name}) بنجاح!`);
        }
      } catch (err) {
        console.error(err);
        showToast('فشل قراءة ملف KML/XML.');
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const handleSimulateDailyUpdate = () => {
    if (!activeProject) return;
    setIsLoading(true);
    setTimeout(async () => {
      const baseResult = analysisResult || generateSyntheticProjectKMLData(activeProject.name, activeProject.mapUrl || '', activeProject.scope);

      const updatedItems = baseResult.items.map((it, idx) => {
        if (it.statusCategory === 'ongoing') {
          return {
            ...it,
            stage: idx % 2 === 0 ? 'تم وضع الصبات الخرسانية المسلحة' : 'دفان واختبار الضغط الهيدروليكي',
            lengthMeters: it.lengthMeters + 90
          };
        }
        return it;
      });

      const newPermitNo = `PRM-2025-${Math.floor(Math.random() * 800 + 100)}`;
      const updatedResult: KMLAnalysisResult = {
        ...baseResult,
        parsedAt: new Date().toLocaleTimeString('ar-SA') + ' ' + new Date().toLocaleDateString('ar-SA'),
        totalLengthMeters: baseResult.totalLengthMeters + 270,
        totalLengthKm: Number(((baseResult.totalLengthMeters + 270) / 1000).toFixed(3)),
        permitNosByStatus: {
          ...baseResult.permitNosByStatus,
          ongoing: [...(baseResult.permitNosByStatus.ongoing || []), newPermitNo]
        },
        items: updatedItems
      };

      await processAndSaveAnalysis(updatedResult, activeProject);
      setIsLoading(false);
      showToast(`🔔 تم محاكاة التتبع اليومي التلقائي: تم رصد تحديث في المراحل والفسوح الأخير!`);
    }, 700);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`📋 تم نسخ ${label}!`);
    });
  };

  // Status Badge Helper
  const getStatusBadge = (cat: StatusCategory) => {
    const label = getStatusCategoryLabel(cat, activeProject?.name, activeProject?.scope);
    switch (cat) {
      case 'executed_water':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full text-white shadow-xs" style={{ backgroundColor: '#01579B' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
            #01579B | {label}
          </span>
        );
      case 'executed_sewage':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full text-white shadow-xs" style={{ backgroundColor: '#097138' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
            #097138 | {label}
          </span>
        );
      case 'ongoing':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full text-slate-900 shadow-xs" style={{ backgroundColor: '#ffea00' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-900 animate-pulse"></span>
            #FFEA00 | {label}
          </span>
        );
      case 'remaining':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full text-white shadow-xs" style={{ backgroundColor: '#a52714' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
            #A52714 | {label}
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full text-slate-900 shadow-xs" style={{ backgroundColor: '#F48FB1' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-900"></span>
            #F48FB1 | {label}
          </span>
        );
      default:
        return null;
    }
  };

  // Filtered items list
  const filteredItems = (analysisResult?.items || []).filter(item => {
    const matchesSearch =
      !searchTerm.trim() ||
      item.segmentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.permitNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.statusLabel.includes(searchTerm);

    const matchesStatus =
      selectedStatusFilter === 'all' || item.statusCategory === selectedStatusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl">
      {/* Toast Feedback */}
      {feedbackMessage && (
        <div className="bg-emerald-600 text-white text-xs px-4 py-2.5 rounded-xl text-center font-bold shadow-md flex items-center justify-center gap-2 animate-in slide-in-from-top">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Top Header & Project Selection Control Box */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl shadow-md">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                استخراج وتحليل إحصائيات الخطوط (Google My Maps KML)
                <Sparkles className="h-4 w-4 text-amber-500 animate-pulse" />
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                اضغط على المشروع المطلوب لتحليل حصر أطوال فئة الخطوط فقط (LineString)، واستبعاد المضلعات والنقاط تلقائياً.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowUrlInput(!showUrlInput)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <Globe className="h-3.5 w-3.5 text-blue-500" />
              <span>{showUrlInput ? 'إخفاء الرابط' : 'تعديل الرابط المباشر (URL)'}</span>
            </button>

            {/* Direct KML File Upload Button */}
            <label className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-extrabold text-xs rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer flex items-center justify-center gap-2 shrink-0 transition-all">
              <Upload className="h-4 w-4 text-slate-500" />
              <span>رفع KML/XML</span>
              <input type="file" accept=".kml,.xml" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        {/* Animated Sequential Auto-Analysis Progress Bar */}
        {autoProgress.isRunning && (
          <div className="mb-4 p-4 bg-gradient-to-r from-blue-900/40 via-indigo-900/40 to-slate-900/40 border border-blue-500/40 rounded-2xl shadow-lg backdrop-blur-md text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-cyan-400 animate-spin" />
                <span className="text-xs font-black text-cyan-300">جاري الفحص والتحليل التلقائي التتابعي للمشاريع بقاعدة البيانات...</span>
              </div>
              <span className="text-[11px] font-extrabold bg-blue-500/30 text-blue-200 px-2.5 py-0.5 rounded-full border border-blue-400/30">
                {autoProgress.completedProjects} من {autoProgress.totalProjects} مشروع
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700 mb-2">
              <div 
                className="bg-gradient-to-r from-cyan-400 to-blue-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${Math.round((autoProgress.completedProjects / (autoProgress.totalProjects || 1)) * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10.5px] text-slate-300 font-bold">
              <span className="truncate max-w-[280px]">
                📌 جاري التحليل الآن: <span className="text-amber-300 font-extrabold">{autoProgress.currentProjectName || 'تحضير البيانات...'}</span>
              </span>
              {autoProgress.changesFoundCount > 0 && (
                <span className="text-emerald-400 font-extrabold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  تم رصد {autoProgress.changesFoundCount} تغيرات
                </span>
              )}
            </div>
          </div>
        )}

        {/* Dropdown Project Selector with Instant Search */}
        <div className="space-y-3 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <span>اختر المشروع أو ابحث عنه باسم المشروع أو رقم العقد:</span>
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            </label>
            {/* Hidden from UI display per user request - preserved in code
            {activeProject?.mapUrl && (
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 self-start sm:self-auto">
                <Globe className="h-3 w-3" />
                <span>رابط خريطة قوقل مسجل لهذا المشروع (مخفي)</span>
              </span>
            )}
            */}
          </div>

          {/* Search Input Box */}
          <div className="relative">
            <input
              type="text"
              value={projectSearchTerm}
              onChange={(e) => setProjectSearchTerm(e.target.value)}
              placeholder="🔍 ابحث عن مشروع محدد بالاسم، رقم العقد، القطاع، أو المنطقة..."
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs font-bold pr-10 pl-8 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            {projectSearchTerm && (
              <button
                type="button"
                onClick={() => setProjectSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-black p-1 cursor-pointer"
                title="مسح البحث"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Status Badge & Quick Suggestions */}
          {projectSearchTerm.trim() && (
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400 flex items-center justify-between px-1">
                <span>نتائج البحث عن "{projectSearchTerm}":</span>
                <span className="bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-black">
                  {filteredProjects.length} مشروع مطابق
                </span>
              </div>

              {/* Quick Click Badges if 5 or fewer matches */}
              {filteredProjects.length > 0 && filteredProjects.length <= 5 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {filteredProjects.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setActiveProject(p);
                        setMapInputUrl(p.mapUrl || '');
                      }}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                        activeProject?.id === p.id
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                      }`}
                    >
                      <span className="truncate max-w-[350px]">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <select
                value={activeProject?.id || ''}
                onChange={(e) => {
                  const projId = Number(e.target.value);
                  const found = projects.find(p => p.id === projId);
                  if (found) {
                    setActiveProject(found);
                    setMapInputUrl(found.mapUrl || '');
                  }
                }}
                className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs font-black px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs appearance-none cursor-pointer"
              >
                <option value="" disabled>-- اختر مشروعاً من القائمة --</option>
                {filteredProjects.map(proj => (
                  <option key={proj.id} value={proj.id}>
                    {proj.name} {proj.region || proj.businessUnit ? `(${proj.region || proj.businessUnit})` : ''}
                  </option>
                ))}
              </select>
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                ▼
              </div>
            </div>

            {activeProject && (
              <button
                type="button"
                onClick={() => triggerProjectAnalysis(activeProject)}
                disabled={isLoading}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 border-0"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>جاري استخراج وحساب الأطوال...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-amber-300 animate-pulse" />
                    <span>تشغيل التحليل الجغرافي وحصر الأطوال 📊</span>
                  </>
                )}
              </button>
            )}
          </div>

          {activeProject && (
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="text-blue-600 dark:text-blue-400">المشروع المحدد:</span>
                <span className="text-slate-900 dark:text-slate-100 font-black">{activeProject.name}</span>
              </span>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (activeProject) {
                      setIsLoading(true);
                      const reports = await ReportHistoryStore.getHistoricalReports(activeProject.id, activeProject.name, activeProject.po);
                      setIsLoading(false);

                      const currentAnalysis = analysisResult || (reports.length > 0 ? reports[0].analysisResult : null);
                      let previousReport: HistoricalReport | null = null;

                      if (reports.length > 1) {
                        if (analysisResult && reports[0].analysisResult.totalLengthKm === analysisResult.totalLengthKm) {
                          previousReport = reports[1];
                        } else {
                          previousReport = reports[0];
                        }
                      } else if (reports.length === 1 && !analysisResult) {
                        previousReport = null;
                      }

                      if (currentAnalysis) {
                        const diff = compareKMLAnalyses(
                          previousReport ? previousReport.analysisResult : null,
                          currentAnalysis,
                          activeProject.id,
                          activeProject.name,
                          activeProject.scope
                        );
                        setCurrentDiffResult(diff);
                      } else {
                        const synthetic = generateSyntheticProjectKMLData(activeProject.name, activeProject.mapUrl || '', activeProject.scope);
                        const diff = compareKMLAnalyses(null, synthetic, activeProject.id, activeProject.name, activeProject.scope);
                        setCurrentDiffResult(diff);
                      }
                      setIsDiffModalOpen(true);
                    }
                  }}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  <span>مقارنة التغيرات والتقرير التاريخي 📊</span>
                </button>

                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRunBatchDailyAutoAnalysis}
                      disabled={autoProgress.isRunning}
                      className="px-3.5 py-1.5 bg-gradient-to-r from-blue-700 to-indigo-800 hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 text-white font-black text-[11px] rounded-xl border border-blue-500/40 shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                      title="تشغيل التحليل الجغرافي والتقرير اليومي للمشاريع المصنفة تحت بند (جاري) وتوثيق النتائج بقاعدة البيانات (خاص بمدير النظام)"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 text-cyan-300 ${autoProgress.isRunning ? 'animate-spin' : ''}`} />
                      <span>{autoProgress.isRunning ? 'جاري التحليل التتابعي...' : 'تشغيل التقرير اليومي الشامل (مدير النظام) 🔄'}</span>
                    </button>

                    {autoProgress.isRunning && (
                      <button
                        type="button"
                        onClick={stopDailyAutoAnalysis}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-[11px] rounded-xl border border-rose-400/40 shadow-xs transition-all cursor-pointer flex items-center gap-1.5 animate-pulse"
                        title="إيقاف عملية الفحص والتحليل التلقائي الحالية"
                      >
                        <StopCircle className="h-3.5 w-3.5 text-white" />
                        <span>إيقاف الفحص 🛑</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Optional Collapsible URL Input Form */}
          {showUrlInput && (
            <form onSubmit={handleFormSubmit} className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                تعديل رابط الخريطة المباشر (Google My Maps URL):
              </label>
              <div className="flex flex-col sm:flex-row items-stretch gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={mapInputUrl}
                    onChange={(e) => setMapInputUrl(e.target.value)}
                    placeholder="أدخل رابط الخريطة 'Google My Maps' (e.g. https://www.google.com/maps/d/edit?mid=...)"
                    className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs font-mono font-bold pr-10 pl-3 py-3 rounded-xl border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    dir="ltr"
                  />
                  <Globe className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !mapInputUrl.trim()}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 border-0"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>جاري الاستخراج...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 text-amber-300" />
                      <span>تحليل الرابط المباشر</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {analysisResult?.parsedAt && (
          <div className="text-[11px] text-slate-400 text-left font-mono">
            تاريخ آخر تحليل للمشروع: {analysisResult.parsedAt}
          </div>
        )}
      </div>

      {/* Prompts user when no analysis has been run yet */}
      {!analysisResult && !isLoading && (
        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-inner">
            <Globe className="h-8 w-8 animate-pulse" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h4 className="text-base font-black text-slate-900 dark:text-slate-100">
              جاهز لبدء استخراج وتحليل بيانات الخريطة
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              اضغط على أحد المشاريع من القائمة أعلاه أو انقر زر "بدء تحليل خريطة هذا المشروع" لاستخراج أطوال الخطوط وتفاصيل التصاريح وحالات التنفيذ.
            </p>
          </div>
          {activeProject && (
            <button
              type="button"
              onClick={() => triggerProjectAnalysis(activeProject)}
              disabled={isLoading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer inline-flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>جاري استخراج وحساب الأطوال...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-amber-300" />
                  <span>بدء التحليل لمشروع ({activeProject.name})</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Main Analysis Display Panel */}
      {analysisResult && (
        <div ref={reportDisplaySectionRef} id="top-analysis-report-section" className="space-y-6 scroll-mt-6">
          {/* Dynamic Map Legend Component */}
          <MapLegend
            analysisResult={analysisResult}
            projectName={activeProject?.name}
            isLoading={isLoading}
            onRunAnalysis={activeProject ? () => triggerProjectAnalysis(activeProject) : undefined}
            defaultExpanded={true}
          />

          {/* 🛡️ Quick Map Inspection & Audit Toolbar from Map-tools */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 p-4 rounded-2xl shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-white">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/50 border border-indigo-400/40 text-cyan-300 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h5 className="text-xs font-black text-white flex items-center gap-2">
                  <span>شريط أدوات فحص وتدقيق الخرائط الذكي (Map Quality & Audit Suite)</span>
                  <span className="text-[10px] bg-indigo-500/30 text-cyan-300 px-2 py-0.5 rounded-full border border-indigo-400/30">معايير شركة المياه NWC</span>
                </h5>
                <p className="text-[11px] text-slate-300">
                  فحص الألوان المخالفة، تدقيق واستخراج الرخص، ومطابقة معرفات السجمنت مع كود شركة المياه.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveAnalysisTab('colors')}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                  nonCompliantColorStats.length > 0
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                }`}
                title="فحص مطابقة ألوان الخطوط لكود الألوان المعتمد"
              >
                <Palette className="h-3.5 w-3.5" />
                <span>فحص الألوان {nonCompliantColorStats.length > 0 ? `(${nonCompliantColorStats.length} مخالف)` : '✅'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveAnalysisTab('reconciliation')}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-md border ${
                  reconciliationSummary.totalMissingCount > 0
                    ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400/40 animate-pulse'
                    : reconciliationSummary.totalCancelledOnMapCount > 0
                    ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400/40'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-400/30'
                }`}
                title="مطابقة قطاعات منصة البنية التحتية مع الخريطة التفاعلية"
              >
                <Scale className="h-3.5 w-3.5" />
                <span>
                  مطابقة البنية التحتية
                  {reconciliationSummary.totalMissingCount > 0 && ` (${reconciliationSummary.totalMissingCount} مفقود ⚠️)`}
                  {reconciliationSummary.totalMissingCount === 0 && reconciliationSummary.totalCancelledOnMapCount > 0 && ` (${reconciliationSummary.totalCancelledOnMapCount} ملغي 🚫)`}
                  {reconciliationSummary.totalMissingCount === 0 && reconciliationSummary.totalCancelledOnMapCount === 0 && platformSegments.length > 0 && ' ✅'}
                </span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setIsExcelImportModalOpen(true)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-indigo-500/40 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                  title="استيراد وتحديث ملف الإكسل المعتمد من منصة البنية التحتية (Segment ID.xlsx)"
                >
                  <UploadCloud className="h-3.5 w-3.5 text-cyan-400" />
                  <span>استيراد إكسل 📥</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveAnalysisTab('segments')}
                className="px-3 py-1.5 bg-blue-600/90 hover:bg-blue-500 text-white rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-md cursor-pointer border border-blue-400/30"
                title="عرض وتصنيف معرفات قطاعات العمل Segment ID"
              >
                <Hash className="h-3.5 w-3.5" />
                <span>تصنيف السجمنت #</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveAnalysisTab('permits')}
                className="px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-md cursor-pointer border border-emerald-400/30"
                title="عرض وتصنيف أرقام تصاريح وفسوح الحفر"
              >
                <FileCheck className="h-3.5 w-3.5" />
                <span>تصنيف الرخص 📜</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveAnalysisTab('lines')}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                title="جدول تفاصيل الخطوط وحصر الأطوال"
              >
                <Ruler className="h-3.5 w-3.5 text-blue-400" />
                <span>حصر الأطوال 📏</span>
              </button>
            </div>
          </div>

          {/* Summary Cards: Pipe Lines Execution & Length Quantification (حالة التنفيذ للخطوط وحصر الأطوال) */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 gap-3">
              <h4 className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Ruler className="h-5 w-5 text-blue-600" />
                <span>3- حالة التنفيذ للخطوط وحصر الأطوال (إجمالي المخطط: {analysisResult.totalLengthKm} كم / {analysisResult.totalLengthMeters.toLocaleString('ar-SA')} متر)</span>
              </h4>
              <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleOpenRegionsMapModal('segment')}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="عرض جميع مناطق واقتطاعات السجمنت (Segment ID) المسجلة على الخريطة التفاعلية"
                >
                  <Globe className="h-4 w-4" />
                  <span>مناطق السجمنت 🗺️</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenRegionsMapModal('permit')}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="عرض جميع مناطق أرقام الفسوح والتراخيص (Permit No) المسجلة على الخريطة التفاعلية"
                >
                  <Globe className="h-4 w-4" />
                  <span>مناطق الفسوح 📜</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportPDF}
                  disabled={isExportingPDF}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-xl font-black text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
                  title="تصدير تقرير احترافي بصيغة PDF يتضمن جدولاً بالنتائج والرسوم البيانية"
                >
                  {isExportingPDF ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span>{isExportingPDF ? 'جاري تجهيز PDF...' : 'تصدير التقرير PDF 📄'}</span>
                </button>
                <span className="text-xs font-mono font-bold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full border border-blue-200 dark:border-blue-800">
                  عدد القطاعات: {analysisResult.totalFeaturesCount} خط
                </span>
              </div>
            </div>

            {/* 5 Requested Colors Breakdown Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 pt-1">
              {/* 1. منفذ - مياه / منفذ - صرف */}
              <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/40 space-y-2 relative overflow-hidden">
                <div className="w-2 h-full absolute right-0 top-0" style={{ backgroundColor: '#01579B' }}></div>
                <div className="pr-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">{getStatusCategoryLabel('executed_water', activeProject?.name, analysisResult.projectScope)}</span>
                    <span className="text-[10px] font-mono font-extrabold text-blue-800 dark:text-blue-300">
                      %{analysisResult.colorBreakdown.executed_water.percentage}
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                    {analysisResult.colorBreakdown.executed_water.totalLengthKm} <span className="text-xs font-sans text-slate-500">كم</span>
                  </h3>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5 pt-1 border-t border-blue-200/50 dark:border-blue-900/50">
                    <div>الطول: <strong>{analysisResult.colorBreakdown.executed_water.totalLengthMeters.toLocaleString('ar-SA')}</strong> متر</div>
                    <div>عدد القطاعات: <strong>{analysisResult.colorBreakdown.executed_water.segmentCount}</strong></div>
                    <div>عدد التصاريح: <strong>{analysisResult.colorBreakdown.executed_water.permitCount}</strong></div>
                  </div>
                </div>
              </div>

              {/* 2. منفذ - صرف */}
              <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/40 space-y-2 relative overflow-hidden">
                <div className="w-2 h-full absolute right-0 top-0" style={{ backgroundColor: '#097138' }}></div>
                <div className="pr-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">{getStatusCategoryLabel('executed_sewage', activeProject?.name, analysisResult.projectScope)}</span>
                    <span className="text-[10px] font-mono font-extrabold text-emerald-800 dark:text-emerald-300">
                      %{analysisResult.colorBreakdown.executed_sewage.percentage}
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                    {analysisResult.colorBreakdown.executed_sewage.totalLengthKm} <span className="text-xs font-sans text-slate-500">كم</span>
                  </h3>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5 pt-1 border-t border-emerald-200/50 dark:border-emerald-900/50">
                    <div>الطول: <strong>{analysisResult.colorBreakdown.executed_sewage.totalLengthMeters.toLocaleString('ar-SA')}</strong> متر</div>
                    <div>عدد القطاعات: <strong>{analysisResult.colorBreakdown.executed_sewage.segmentCount}</strong></div>
                    <div>عدد التصاريح: <strong>{analysisResult.colorBreakdown.executed_sewage.permitCount}</strong></div>
                  </div>
                </div>
              </div>

              {/* 3. جاري العمل */}
              <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/40 space-y-2 relative overflow-hidden">
                <div className="w-2 h-full absolute right-0 top-0" style={{ backgroundColor: '#ffea00' }}></div>
                <div className="pr-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 dark:text-slate-100">{getStatusCategoryLabel('ongoing', activeProject?.name, analysisResult.projectScope)}</span>
                    <span className="text-[10px] font-mono font-extrabold text-amber-900 dark:text-amber-300">
                      %{analysisResult.colorBreakdown.ongoing.percentage}
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                    {analysisResult.colorBreakdown.ongoing.totalLengthKm} <span className="text-xs font-sans text-slate-500">كم</span>
                  </h3>
                  <div className="text-[11px] text-slate-700 dark:text-slate-400 space-y-0.5 pt-1 border-t border-amber-300/50 dark:border-amber-900/50">
                    <div>الطول: <strong>{analysisResult.colorBreakdown.ongoing.totalLengthMeters.toLocaleString('ar-SA')}</strong> متر</div>
                    <div>عدد القطاعات: <strong>{analysisResult.colorBreakdown.ongoing.segmentCount}</strong></div>
                    <div>عدد التصاريح: <strong>{analysisResult.colorBreakdown.ongoing.permitCount}</strong></div>
                    {yellowNoPermitStats.count > 0 ? (
                      <div className="text-rose-700 dark:text-rose-300 font-bold pt-1 border-t border-rose-300 dark:border-rose-900/60 mt-1 flex items-center justify-between">
                        <span>قطاعات جارية بدون فسح:</span>
                        <span className="font-mono font-black text-rose-800 dark:text-rose-200 underline">{yellowNoPermitStats.count} قطاع 🚨</span>
                      </div>
                    ) : (
                      <div className="text-slate-500 dark:text-slate-400 pt-0.5 border-t border-amber-300/40 dark:border-amber-900/40 mt-1">
                        قطاعات جارية بدون فسح: <strong>0 قطاع</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 4. أعمال متبقية */}
              <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/40 space-y-2 relative overflow-hidden">
                <div className="w-2 h-full absolute right-0 top-0" style={{ backgroundColor: '#a52714' }}></div>
                <div className="pr-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">{getStatusCategoryLabel('remaining', activeProject?.name, analysisResult.projectScope)}</span>
                    <span className="text-[10px] font-mono font-extrabold text-rose-800 dark:text-rose-300">
                      %{analysisResult.colorBreakdown.remaining.percentage}
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                    {analysisResult.colorBreakdown.remaining.totalLengthKm} <span className="text-xs font-sans text-slate-500">كم</span>
                  </h3>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5 pt-1 border-t border-rose-200/50 dark:border-rose-900/50">
                    <div>الطول: <strong>{analysisResult.colorBreakdown.remaining.totalLengthMeters.toLocaleString('ar-SA')}</strong> متر</div>
                    <div>عدد القطاعات: <strong>{analysisResult.colorBreakdown.remaining.segmentCount}</strong></div>
                    <div>عدد التصاريح: <strong>{analysisResult.colorBreakdown.remaining.permitCount}</strong></div>
                  </div>
                </div>
              </div>

              {/* 5. خطوط تم إلغائها */}
              <div className="p-4 rounded-xl border border-pink-200 dark:border-pink-900 bg-pink-50/60 dark:bg-pink-950/40 space-y-2 relative overflow-hidden">
                <div className="w-2 h-full absolute right-0 top-0" style={{ backgroundColor: '#F48FB1' }}></div>
                <div className="pr-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">{getStatusCategoryLabel('cancelled', activeProject?.name, analysisResult.projectScope)}</span>
                    <span className="text-[10px] font-mono font-extrabold text-pink-800 dark:text-pink-300">
                      %{analysisResult.colorBreakdown.cancelled.percentage}
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                    {analysisResult.colorBreakdown.cancelled.totalLengthKm} <span className="text-xs font-sans text-slate-500">كم</span>
                  </h3>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5 pt-1 border-t border-pink-200/50 dark:border-pink-900/50">
                    <div>الطول: <strong>{analysisResult.colorBreakdown.cancelled.totalLengthMeters.toLocaleString('ar-SA')}</strong> متر</div>
                    <div>عدد القطاعات: <strong>{analysisResult.colorBreakdown.cancelled.segmentCount}</strong></div>
                    <div>عدد التصاريح: <strong>{analysisResult.colorBreakdown.cancelled.permitCount}</strong></div>
                  </div>
                </div>
              </div>
            </div>

            {/* ⚖️ Infrastructure Reconciliation Alert Card 1: Missing Segments to Add */}
            {reconciliationSummary.totalMissingCount > 0 && (
              <div className="p-4 rounded-2xl border-2 border-rose-600 bg-gradient-to-r from-rose-50 via-rose-100/80 to-red-50 dark:from-rose-950/80 dark:via-rose-900/60 dark:to-slate-900 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-300">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-700 text-white flex items-center justify-center shrink-0 shadow-lg shadow-rose-900/40 animate-pulse mt-0.5">
                    <Scale className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 bg-rose-700 text-white text-[11px] font-black rounded-full shadow-xs">
                        تنبيه مطابقة البنية التحتية (قطاعات مفقودة) ⚠️
                      </span>
                      <span className="text-xs font-bold text-rose-950 dark:text-rose-200">
                        تم رصد قطاعات معتمدة في منصة البنية التحتية لم يتم إسقاطها على خريطة المشروع!
                      </span>
                    </div>
                    <p className="text-xs text-rose-900 dark:text-rose-300 font-semibold leading-relaxed">
                      عدد القطاعات المفقودة: <strong className="font-mono text-sm text-rose-950 dark:text-white font-black underline">{reconciliationSummary.totalMissingCount} قطاع</strong> | إجمالي طولها المعتمد: <strong className="font-mono text-sm text-rose-950 dark:text-white font-black">{(reconciliationSummary.totalMissingLengthMeters / 1000).toFixed(3)} كم</strong> ({reconciliationSummary.totalMissingLengthMeters.toLocaleString('ar-SA')} متر)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setReconciliationFilter('missing');
                      setActiveAnalysisTab('reconciliation');
                    }}
                    className="px-4 py-2.5 bg-rose-700 hover:bg-rose-800 text-white font-black text-xs rounded-xl shadow-lg shadow-rose-900/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 border border-rose-400/40"
                  >
                    <Scale className="h-4 w-4 text-rose-200" />
                    <span>معاينة وتصدير النواقص ({reconciliationSummary.totalMissingCount}) 📋</span>
                  </button>
                </div>
              </div>
            )}

            {/* 🚫 Infrastructure Reconciliation Alert Card 2: Cancelled Segments Still on Map */}
            {reconciliationSummary.totalCancelledOnMapCount > 0 && (
              <div className="p-4 rounded-2xl border-2 border-amber-600 bg-gradient-to-r from-amber-50 via-amber-100/80 to-orange-50 dark:from-amber-950/80 dark:via-amber-900/60 dark:to-slate-900 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-300">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-amber-600/30 animate-pulse mt-0.5">
                    <Ban className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 bg-amber-600 text-white text-[11px] font-black rounded-full shadow-xs">
                        تنبيه رقابي: قطاعات ملغاة بالمنصة ومرسومة بالخريطة 🚫
                      </span>
                      <span className="text-xs font-bold text-amber-950 dark:text-amber-200">
                        حالة هذه القطاعات في منصة البنية التحتية (ملغي / بانتظار الإلغاء) ولكنها لا تزال موجودة بالخريطة ويجب إزالتها!
                      </span>
                    </div>
                    <p className="text-xs text-amber-900 dark:text-amber-300 font-semibold leading-relaxed">
                      عدد القطاعات الملغاة المرصودة: <strong className="font-mono text-sm text-amber-950 dark:text-white font-black underline">{reconciliationSummary.totalCancelledOnMapCount} قطاع</strong> | إجمالي طولها: <strong className="font-mono text-sm text-amber-950 dark:text-white font-black">{(reconciliationSummary.totalCancelledOnMapLengthMeters / 1000).toFixed(3)} كم</strong> ({reconciliationSummary.totalCancelledOnMapLengthMeters.toLocaleString('ar-SA')} متر)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setReconciliationFilter('cancelled');
                      setActiveAnalysisTab('reconciliation');
                    }}
                    className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-lg shadow-amber-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 border border-amber-400/40"
                  >
                    <Ban className="h-4 w-4 text-amber-100" />
                    <span>معاينة القطاعات الواجب حذفها ({reconciliationSummary.totalCancelledOnMapCount}) 🗑️</span>
                  </button>
                </div>
              </div>
            )}

            {/* Crimson Alert Card: Yellow Ongoing Items Lacking Permit Number (#ffea00) */}
            {yellowNoPermitStats.count > 0 && (
              <div className="p-4 rounded-2xl border-2 border-rose-500 bg-gradient-to-r from-rose-50 via-rose-100/70 to-amber-50 dark:from-rose-950/80 dark:via-rose-900/60 dark:to-slate-900 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-300">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-rose-600/30 animate-pulse mt-0.5">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 bg-rose-600 text-white text-[11px] font-black rounded-full shadow-xs">
                        تنبيه قرمزي - تدقيق تصاريح الحفر 🚨
                      </span>
                      <span className="text-xs font-bold text-rose-900 dark:text-rose-200">
                        تم اكتشاف خطوط باللون الأصفر (#ffea00 - جاري) بدون رقم فسح مسجل!
                      </span>
                    </div>
                    <p className="text-xs text-rose-800 dark:text-rose-300 font-semibold leading-relaxed">
                      عدد العناصر بدون رقم فسح: <strong className="font-mono text-sm text-rose-950 dark:text-white font-black underline">{yellowNoPermitStats.count} قطعة</strong> | إجمالي طولها: <strong className="font-mono text-sm text-rose-950 dark:text-white font-black">{yellowNoPermitStats.lengthKm} كم</strong> ({yellowNoPermitStats.lengthMeters.toLocaleString('ar-SA')} متر)
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenRegionsMapModal('permit', '', 'yellow_no_permit')}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer active:scale-95 border border-rose-400/30"
                >
                  <Globe className="h-4 w-4 text-rose-100" />
                  <span>عكس على الخريطة التفاعلية 🗺️</span>
                </button>
              </div>
            )}

            {/* Red Alert Card: Red Remaining Items Lacking Segment ID (#a52714) */}
            {redNoSegmentStats.count > 0 && (
              <div className="p-4 rounded-2xl border-2 border-rose-600 bg-gradient-to-r from-rose-50 via-red-100/70 to-orange-50 dark:from-rose-950/80 dark:via-red-900/60 dark:to-slate-900 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-300">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#a52714] text-white flex items-center justify-center shrink-0 shadow-lg shadow-rose-900/30 animate-pulse mt-0.5">
                    <AlertOctagon className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 bg-[#a52714] text-white text-[11px] font-black rounded-full shadow-xs">
                        تنبيه تدقيق معرّفات القطاعات (Segment ID) 🚨
                      </span>
                      <span className="text-xs font-bold text-rose-900 dark:text-rose-200">
                        تم اكتشاف خطوط باللون الأحمر (#a52714 - أعمال متبقية) بدون Segment ID أو بقيمة فارغة/شرطة (-)!
                      </span>
                    </div>
                    <p className="text-xs text-rose-800 dark:text-rose-300 font-semibold leading-relaxed">
                      عدد العناصر بدون Segment ID: <strong className="font-mono text-sm text-rose-950 dark:text-white font-black underline">{redNoSegmentStats.count} قطعة</strong> | إجمالي طولها: <strong className="font-mono text-sm text-rose-950 dark:text-white font-black">{redNoSegmentStats.lengthKm} كم</strong> ({redNoSegmentStats.lengthMeters.toLocaleString('ar-SA')} متر)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const mapped: RedNoSegmentItemDetail[] = redNoSegmentStats.items.map(it => ({
                        id: it.id,
                        projectId: activeProject?.id || 999,
                        projectName: activeProject?.name || 'تحليل الخريطة',
                        po: activeProject?.po,
                        contractor: it.contractor || activeProject?.contractor,
                        classification: activeProject?.classification,
                        region: activeProject?.region,
                        subProgram: activeProject?.subProgram,
                        scope: it.statusCategory === 'executed_water' ? 'مياه' : 'صرف صحي',
                        segmentId: it.segmentId,
                        permitNo: it.permitNo,
                        name: it.name,
                        lengthMeters: it.lengthMeters,
                        lengthKm: it.lengthKm,
                        streetName: it.streetName,
                        district: it.district,
                        innerDiameter: it.innerDiameter,
                        zone: it.zone,
                        drillingType: it.drillingType,
                        centerLat: it.centerLat,
                        centerLng: it.centerLng,
                        googleMapsUrl: it.googleMapsUrl,
                        coordinates: it.coordinates,
                        featureItem: it,
                        projectObj: activeProject || undefined
                      }));
                      setRedNoSegmentModalItems(mapped);
                      setIsRedNoSegmentModalOpen(true);
                    }}
                    className="px-4 py-2.5 bg-[#a52714] hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-lg shadow-rose-900/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 border border-rose-400/30"
                  >
                    <Eye className="h-4 w-4 text-rose-100" />
                    <span>معاينة وتصدير الخطوط الحمراء ({redNoSegmentStats.count}) 📋</span>
                  </button>
                </div>
              </div>
            )}

            {/* Amber Alert Card: Non-Compliant Colors Detected (الألوان المخالفة لكود شركة المياه) */}
            {nonCompliantColorStats.length > 0 && (
              <div className="p-4 rounded-2xl border-2 border-amber-500 bg-gradient-to-r from-amber-50 via-amber-100/70 to-rose-50 dark:from-amber-950/80 dark:via-amber-900/60 dark:to-slate-900 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-300">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-amber-600/30 animate-pulse mt-0.5">
                    <Palette className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 bg-amber-600 text-white text-[11px] font-black rounded-full shadow-xs">
                        تنبيه فحص الألوان - مطابقة كود شركة المياه 🎨
                      </span>
                      <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                        تم رصد ({nonCompliantColorStats.length}) كود لون مخالف للأكواد الـ 5 المعتمدة!
                      </span>
                    </div>
                    <p className="text-xs text-amber-800 dark:text-amber-300 font-semibold leading-relaxed">
                      إجمالي الأطوال المخالفة: <strong className="font-mono text-sm text-amber-950 dark:text-white font-black">{nonCompliantColorStats.reduce((s, c) => s + c.totalLengthKm, 0).toFixed(3)} كم</strong> ({nonCompliantColorStats.reduce((s, c) => s + c.totalLengthMeters, 0).toLocaleString('ar-SA')} متر) عبر ({nonCompliantColorStats.reduce((s, c) => s + c.count, 0)}) قطعة.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveAnalysisTab('colors')}
                    className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-lg shadow-amber-600/20 transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer active:scale-95 border border-amber-400/30"
                  >
                    <Palette className="h-4 w-4" />
                    <span>فحص وتفاصيل الألوان 🎨</span>
                  </button>
                </div>
              </div>
            )}

            {/* Visual Multi-Color Progress Bar */}
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 font-bold">
                <span>نسبة التغطية والتوزيع للأطوال بالتصنيف</span>
                <span>%100 المجموع</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-3.5 rounded-full overflow-hidden flex shadow-inner">
                <div
                  style={{ width: `${analysisResult.colorBreakdown.executed_water.percentage}%`, backgroundColor: '#01579B' }}
                  title={`${getStatusCategoryLabel('executed_water', activeProject?.name, analysisResult.projectScope)}: ${analysisResult.colorBreakdown.executed_water.percentage}%`}
                  className="h-full transition-all duration-500"
                ></div>
                <div
                  style={{ width: `${analysisResult.colorBreakdown.executed_sewage.percentage}%`, backgroundColor: '#097138' }}
                  title={`${getStatusCategoryLabel('executed_sewage', activeProject?.name, analysisResult.projectScope)}: ${analysisResult.colorBreakdown.executed_sewage.percentage}%`}
                  className="h-full transition-all duration-500"
                ></div>
                <div
                  style={{ width: `${analysisResult.colorBreakdown.ongoing.percentage}%`, backgroundColor: '#ffea00' }}
                  title={`${getStatusCategoryLabel('ongoing', activeProject?.name, analysisResult.projectScope)}: ${analysisResult.colorBreakdown.ongoing.percentage}%`}
                  className="h-full transition-all duration-500"
                ></div>
                <div
                  style={{ width: `${analysisResult.colorBreakdown.remaining.percentage}%`, backgroundColor: '#a52714' }}
                  title={`${getStatusCategoryLabel('remaining', activeProject?.name, analysisResult.projectScope)}: ${analysisResult.colorBreakdown.remaining.percentage}%`}
                  className="h-full transition-all duration-500"
                ></div>
                <div
                  style={{ width: `${analysisResult.colorBreakdown.cancelled.percentage}%`, backgroundColor: '#F48FB1' }}
                  title={`${getStatusCategoryLabel('cancelled', activeProject?.name, analysisResult.projectScope)}: ${analysisResult.colorBreakdown.cancelled.percentage}%`}
                  className="h-full transition-all duration-500"
                ></div>
              </div>
            </div>
          </div>

          {/* Sub-tabs Navigation for Breakdown Views */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-2 gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveAnalysisTab('overview')}
                className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeAnalysisTab === 'overview'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700'
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                <span>نظرة عامة والملخص 📊</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveAnalysisTab('segments')}
                className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeAnalysisTab === 'segments'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700'
                }`}
              >
                <Hash className="h-4 w-4" />
                <span>1- تصنيف ومخطط Segment ID 🏷️</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveAnalysisTab('permits')}
                className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeAnalysisTab === 'permits'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700'
                }`}
              >
                <FileCheck className="h-4 w-4" />
                <span>2- تصنيف ومخطط Permit No 📜</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveAnalysisTab('colors')}
                className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeAnalysisTab === 'colors'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700'
                }`}
              >
                <Palette className="h-4 w-4" />
                <span>3- فحص ومطابقة الألوان 🎨</span>
                {nonCompliantColorStats.length > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">
                    {nonCompliantColorStats.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveAnalysisTab('lines')}
                className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeAnalysisTab === 'lines'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700'
                }`}
              >
                <Ruler className="h-4 w-4" />
                <span>4- تفاصيل الخطوط وحصر الأطوال 📏</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveAnalysisTab('reconciliation')}
                className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeAnalysisTab === 'reconciliation'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700'
                }`}
              >
                <Scale className="h-4 w-4" />
                <span>5- مطابقة البنية التحتية ⚖️</span>
                {reconciliationSummary.totalMissingCount > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">
                    {reconciliationSummary.totalMissingCount} مفقود
                  </span>
                )}
                {reconciliationSummary.totalMissingCount === 0 && reconciliationSummary.totalCancelledOnMapCount > 0 && (
                  <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">
                    {reconciliationSummary.totalCancelledOnMapCount} ملغي
                  </span>
                )}
                {reconciliationSummary.totalMissingCount === 0 && reconciliationSummary.totalCancelledOnMapCount === 0 && platformSegments.length > 0 && (
                  <span className="text-emerald-500 dark:text-emerald-400 text-xs">✅</span>
                )}
              </button>
            </div>

            {/* TAB CONTENT 1: Segment IDs Categorized by Status / Colors + SegmentLengthChart */}
            {activeAnalysisTab === 'segments' && (
              <div className="p-6 space-y-6">
                {/* 🌟 New Interactive Segment Length Chart from Map-tools */}
                <SegmentLengthChart 
                  items={analysisResult.items} 
                  onSelectSegment={(segId) => {
                    setSearchTerm(segId);
                    handleOpenFeatureModalBySegmentOrPermit(segId, false);
                  }}
                />

                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h4 className="text-sm font-black text-slate-900 dark:text-slate-100">
                      1- تصنيف Segment ID حسب الألوان المذكورة (منفذة - جاري - متبقي - ملغي)
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      قائمة معرفات قطاعات العمل المستخرجة من الخريطة، مرتبة ومصنفة.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenRegionsMapModal('segment')}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-lg transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      <span>عرض جميع مناطق السجمنت على الخريطة 🗺️</span>
                    </button>

                    <button
                      onClick={() => {
                        const allSegs = Object.values(analysisResult.segmentIdsByStatus).flat().filter(isValidIdentifier).join(', ');
                        copyToClipboard(allSegs, 'جميع معرفات Segment ID');
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-extrabold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>نسخ جميع Segment IDs</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Executed Water Segment IDs */}
                  <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 space-y-3">
                    <div className="flex items-center justify-between border-b border-blue-100 dark:border-blue-900/40 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#01579B' }}></span>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">{getStatusCategoryLabel('executed_water', activeProject?.name, analysisResult.projectScope)}</span>
                      </div>
                      <span className="text-xs font-bold text-blue-700 dark:text-blue-300 font-mono bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded">
                        {analysisResult.segmentIdsByStatus.executedWater.length} قطاع
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pl-1">
                      {analysisResult.segmentIdsByStatus.executedWater.map((seg, i) => (
                        <button 
                          key={i} 
                          onClick={() => handleOpenFeatureModalBySegmentOrPermit(seg, false)}
                          className="text-[11px] font-mono font-bold px-2 py-0.5 bg-white hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-blue-900/60 text-slate-800 dark:text-slate-200 rounded border border-blue-200 dark:border-blue-800 shadow-3xs cursor-pointer transition-colors flex items-center gap-1 group"
                          title="انقر لعرض تفاصيل وموقع القطاع بالخريطة"
                        >
                          <span>{seg}</span>
                          <MapPin className="w-2.5 h-2.5 text-blue-500 opacity-60 group-hover:opacity-100" />
                        </button>
                      ))}
                      {analysisResult.segmentIdsByStatus.executedWater.length === 0 && (
                        <span className="text-xs text-slate-400">لا يوجد قطاعات</span>
                      )}
                    </div>
                  </div>

                  {/* Executed Sewage Segment IDs */}
                  <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
                    <div className="flex items-center justify-between border-b border-emerald-100 dark:border-emerald-900/40 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#097138' }}></span>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">{getStatusCategoryLabel('executed_sewage', activeProject?.name, analysisResult.projectScope)}</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 font-mono bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded">
                        {analysisResult.segmentIdsByStatus.executedSewage.length} قطاع
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pl-1">
                      {analysisResult.segmentIdsByStatus.executedSewage.map((seg, i) => (
                        <button 
                          key={i} 
                          onClick={() => handleOpenFeatureModalBySegmentOrPermit(seg, false)}
                          className="text-[11px] font-mono font-bold px-2 py-0.5 bg-white hover:bg-emerald-100 dark:bg-slate-800 dark:hover:bg-emerald-900/60 text-slate-800 dark:text-slate-200 rounded border border-emerald-200 dark:border-emerald-800 shadow-3xs cursor-pointer transition-colors flex items-center gap-1 group"
                          title="انقر لعرض تفاصيل وموقع القطاع بالخريطة"
                        >
                          <span>{seg}</span>
                          <MapPin className="w-2.5 h-2.5 text-emerald-500 opacity-60 group-hover:opacity-100" />
                        </button>
                      ))}
                      {analysisResult.segmentIdsByStatus.executedSewage.length === 0 && (
                        <span className="text-xs text-slate-400">لا يوجد قطاعات</span>
                      )}
                    </div>
                  </div>

                  {/* Ongoing Segment IDs */}
                  <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-3">
                    <div className="flex items-center justify-between border-b border-amber-100 dark:border-amber-900/40 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ffea00' }}></span>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">{getStatusCategoryLabel('ongoing', activeProject?.name, analysisResult.projectScope)}</span>
                      </div>
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300 font-mono bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded">
                        {analysisResult.segmentIdsByStatus.ongoing.length} قطاع
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pl-1">
                      {analysisResult.segmentIdsByStatus.ongoing.map((seg, i) => (
                        <button 
                          key={i} 
                          onClick={() => handleOpenFeatureModalBySegmentOrPermit(seg, false)}
                          className="text-[11px] font-mono font-bold px-2 py-0.5 bg-white hover:bg-amber-100 dark:bg-slate-800 dark:hover:bg-amber-900/60 text-slate-800 dark:text-slate-200 rounded border border-amber-200 dark:border-amber-800 shadow-3xs cursor-pointer transition-colors flex items-center gap-1 group"
                          title="انقر لعرض تفاصيل وموقع القطاع بالخريطة"
                        >
                          <span>{seg}</span>
                          <MapPin className="w-2.5 h-2.5 text-amber-500 opacity-60 group-hover:opacity-100" />
                        </button>
                      ))}
                      {analysisResult.segmentIdsByStatus.ongoing.length === 0 && (
                        <span className="text-xs text-slate-400">لا يوجد قطاعات</span>
                      )}
                    </div>
                  </div>

                  {/* Remaining Segment IDs */}
                  <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 space-y-3">
                    <div className="flex items-center justify-between border-b border-rose-100 dark:border-rose-900/40 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#a52714' }}></span>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">{getStatusCategoryLabel('remaining', activeProject?.name, analysisResult.projectScope)}</span>
                      </div>
                      <span className="text-xs font-bold text-rose-700 dark:text-rose-300 font-mono bg-rose-100 dark:bg-rose-900/50 px-2 py-0.5 rounded">
                        {analysisResult.segmentIdsByStatus.remaining.length} قطاع
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pl-1">
                      {analysisResult.segmentIdsByStatus.remaining.map((seg, i) => (
                        <button 
                          key={i} 
                          onClick={() => handleOpenFeatureModalBySegmentOrPermit(seg, false)}
                          className="text-[11px] font-mono font-bold px-2 py-0.5 bg-white hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-900/60 text-slate-800 dark:text-slate-200 rounded border border-rose-200 dark:border-rose-800 shadow-3xs cursor-pointer transition-colors flex items-center gap-1 group"
                          title="انقر لعرض تفاصيل وموقع القطاع بالخريطة"
                        >
                          <span>{seg}</span>
                          <MapPin className="w-2.5 h-2.5 text-rose-500 opacity-60 group-hover:opacity-100" />
                        </button>
                      ))}
                      {analysisResult.segmentIdsByStatus.remaining.length === 0 && (
                        <span className="text-xs text-slate-400">لا يوجد قطاعات</span>
                      )}
                    </div>
                  </div>

                  {/* Cancelled Segment IDs */}
                  <div className="p-4 rounded-xl border border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/20 space-y-3">
                    <div className="flex items-center justify-between border-b border-pink-100 dark:border-pink-900/40 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#F48FB1' }}></span>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">{getStatusCategoryLabel('cancelled', activeProject?.name, analysisResult.projectScope)}</span>
                      </div>
                      <span className="text-xs font-bold text-pink-700 dark:text-pink-300 font-mono bg-pink-100 dark:bg-pink-900/50 px-2 py-0.5 rounded">
                        {analysisResult.segmentIdsByStatus.cancelled.length} قطاع
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pl-1">
                      {analysisResult.segmentIdsByStatus.cancelled.map((seg, i) => (
                        <button 
                          key={i} 
                          onClick={() => handleOpenFeatureModalBySegmentOrPermit(seg, false)}
                          className="text-[11px] font-mono font-bold px-2 py-0.5 bg-white hover:bg-pink-100 dark:bg-slate-800 dark:hover:bg-pink-900/60 text-slate-800 dark:text-slate-200 rounded border border-pink-200 dark:border-pink-800 shadow-3xs cursor-pointer transition-colors flex items-center gap-1 group"
                          title="انقر لعرض تفاصيل وموقع القطاع بالخريطة"
                        >
                          <span>{seg}</span>
                          <MapPin className="w-2.5 h-2.5 text-pink-500 opacity-60 group-hover:opacity-100" />
                        </button>
                      ))}
                      {analysisResult.segmentIdsByStatus.cancelled.length === 0 && (
                        <span className="text-xs text-slate-400">لا يوجد قطاعات</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT 2: Permit Nos Categorized by Status / Colors + PermitLengthChart */}
            {activeAnalysisTab === 'permits' && (
              <div className="p-6 space-y-6">
                {/* 🌟 New Interactive Permit Length Chart from Map-tools */}
                <PermitLengthChart
                  items={analysisResult.items}
                  onSelectPermit={(pNo) => {
                    setSearchTerm(pNo);
                    handleOpenFeatureModalBySegmentOrPermit(pNo, true);
                  }}
                />

                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h4 className="text-sm font-black text-slate-900 dark:text-slate-100">
                      2- تصنيف Permit No حسب الحالة والبيان (منفذة - جاري - متبقي - ملغي)
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      قائمة أرقام تصاريح العمل (Permit Numbers) المصنفة بحسب حالة التنفيذ.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenRegionsMapModal('permit')}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-lg transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      <span>عرض جميع مناطق الفسوح والتراخيص على الخريطة 📜</span>
                    </button>

                    <button
                      onClick={() => {
                        const allPerms = Object.values(analysisResult.permitNosByStatus).flat().filter(isValidIdentifier).join(', ');
                        copyToClipboard(allPerms, 'جميع أرقام التصاريح Permit No');
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-extrabold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>نسخ جميع Permit Nos</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Executed Water Permits */}
                  <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 space-y-3">
                    <div className="flex items-center justify-between border-b border-blue-100 dark:border-blue-900/40 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#01579B' }}></span>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">{getStatusCategoryLabel('executed_water', activeProject?.name, analysisResult.projectScope)}</span>
                      </div>
                      <span className="text-xs font-bold text-blue-700 dark:text-blue-300 font-mono bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded">
                        {analysisResult.permitNosByStatus.executedWater.length} تصريح
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pl-1">
                      {analysisResult.permitNosByStatus.executedWater.map((prm, i) => (
                        <button 
                          key={i} 
                          onClick={() => handleOpenFeatureModalBySegmentOrPermit(prm, true)}
                          className="text-[11px] font-mono font-bold px-2 py-0.5 bg-white hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-blue-900/60 text-slate-800 dark:text-slate-200 rounded border border-blue-200 dark:border-blue-800 shadow-3xs cursor-pointer transition-colors flex items-center gap-1 group"
                          title="انقر لعرض تفاصيل وموقع الفسح بالخريطة"
                        >
                          <span>{prm}</span>
                          <MapPin className="w-2.5 h-2.5 text-blue-500 opacity-60 group-hover:opacity-100" />
                        </button>
                      ))}
                      {analysisResult.permitNosByStatus.executedWater.length === 0 && (
                        <span className="text-xs text-slate-400">لا يوجد تصاريح</span>
                      )}
                    </div>
                  </div>

                  {/* Executed Sewage Permits */}
                  <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
                    <div className="flex items-center justify-between border-b border-emerald-100 dark:border-emerald-900/40 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#097138' }}></span>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">{getStatusCategoryLabel('executed_sewage', activeProject?.name, analysisResult.projectScope)}</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 font-mono bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded">
                        {analysisResult.permitNosByStatus.executedSewage.length} تصريح
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pl-1">
                      {analysisResult.permitNosByStatus.executedSewage.map((prm, i) => (
                        <button 
                          key={i} 
                          onClick={() => handleOpenFeatureModalBySegmentOrPermit(prm, true)}
                          className="text-[11px] font-mono font-bold px-2 py-0.5 bg-white hover:bg-emerald-100 dark:bg-slate-800 dark:hover:bg-emerald-900/60 text-slate-800 dark:text-slate-200 rounded border border-emerald-200 dark:border-emerald-800 shadow-3xs cursor-pointer transition-colors flex items-center gap-1 group"
                          title="انقر لعرض تفاصيل وموقع الفسح بالخريطة"
                        >
                          <span>{prm}</span>
                          <MapPin className="w-2.5 h-2.5 text-emerald-500 opacity-60 group-hover:opacity-100" />
                        </button>
                      ))}
                      {analysisResult.permitNosByStatus.executedSewage.length === 0 && (
                        <span className="text-xs text-slate-400">لا يوجد تصاريح</span>
                      )}
                    </div>
                  </div>

                  {/* Ongoing Permits */}
                  <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-3">
                    <div className="flex items-center justify-between border-b border-amber-100 dark:border-amber-900/40 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ffea00' }}></span>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">{getStatusCategoryLabel('ongoing', activeProject?.name, analysisResult.projectScope)}</span>
                      </div>
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300 font-mono bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded">
                        {analysisResult.permitNosByStatus.ongoing.length} تصريح
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pl-1">
                      {analysisResult.permitNosByStatus.ongoing.map((prm, i) => (
                        <button 
                          key={i} 
                          onClick={() => handleOpenFeatureModalBySegmentOrPermit(prm, true)}
                          className="text-[11px] font-mono font-bold px-2 py-0.5 bg-white hover:bg-amber-100 dark:bg-slate-800 dark:hover:bg-amber-900/60 text-slate-800 dark:text-slate-200 rounded border border-amber-200 dark:border-amber-800 shadow-3xs cursor-pointer transition-colors flex items-center gap-1 group"
                          title="انقر لعرض تفاصيل وموقع الفسح بالخريطة"
                        >
                          <span>{prm}</span>
                          <MapPin className="w-2.5 h-2.5 text-amber-500 opacity-60 group-hover:opacity-100" />
                        </button>
                      ))}
                      {analysisResult.permitNosByStatus.ongoing.length === 0 && (
                        <span className="text-xs text-slate-400">لا يوجد تصاريح</span>
                      )}
                    </div>
                  </div>

                  {/* Remaining Permits */}
                  <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 space-y-3">
                    <div className="flex items-center justify-between border-b border-rose-100 dark:border-rose-900/40 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#a52714' }}></span>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">{getStatusCategoryLabel('remaining', activeProject?.name, analysisResult.projectScope)}</span>
                      </div>
                      <span className="text-xs font-bold text-rose-700 dark:text-rose-300 font-mono bg-rose-100 dark:bg-rose-900/50 px-2 py-0.5 rounded">
                        {analysisResult.permitNosByStatus.remaining.length} تصريح
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pl-1">
                      {analysisResult.permitNosByStatus.remaining.map((prm, i) => (
                        <button 
                          key={i} 
                          onClick={() => handleOpenFeatureModalBySegmentOrPermit(prm, true)}
                          className="text-[11px] font-mono font-bold px-2 py-0.5 bg-white hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-900/60 text-slate-800 dark:text-slate-200 rounded border border-rose-200 dark:border-rose-800 shadow-3xs cursor-pointer transition-colors flex items-center gap-1 group"
                          title="انقر لعرض تفاصيل وموقع الفسح بالخريطة"
                        >
                          <span>{prm}</span>
                          <MapPin className="w-2.5 h-2.5 text-rose-500 opacity-60 group-hover:opacity-100" />
                        </button>
                      ))}
                      {analysisResult.permitNosByStatus.remaining.length === 0 && (
                        <span className="text-xs text-slate-400">لا يوجد تصاريح</span>
                      )}
                    </div>
                  </div>

                  {/* Cancelled Permits */}
                  <div className="p-4 rounded-xl border border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/20 space-y-3">
                    <div className="flex items-center justify-between border-b border-pink-100 dark:border-pink-900/40 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#F48FB1' }}></span>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">{getStatusCategoryLabel('cancelled', activeProject?.name, analysisResult.projectScope)}</span>
                      </div>
                      <span className="text-xs font-bold text-pink-700 dark:text-pink-300 font-mono bg-pink-100 dark:bg-pink-900/50 px-2 py-0.5 rounded">
                        {analysisResult.permitNosByStatus.cancelled.length} تصريح
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pl-1">
                      {analysisResult.permitNosByStatus.cancelled.map((prm, i) => (
                        <button 
                          key={i} 
                          onClick={() => handleOpenFeatureModalBySegmentOrPermit(prm, true)}
                          className="text-[11px] font-mono font-bold px-2 py-0.5 bg-white hover:bg-pink-100 dark:bg-slate-800 dark:hover:bg-pink-900/60 text-slate-800 dark:text-slate-200 rounded border border-pink-200 dark:border-pink-800 shadow-3xs cursor-pointer transition-colors flex items-center gap-1 group"
                          title="انقر لعرض تفاصيل وموقع الفسح بالخريطة"
                        >
                          <span>{prm}</span>
                          <MapPin className="w-2.5 h-2.5 text-pink-500 opacity-60 group-hover:opacity-100" />
                        </button>
                      ))}
                      {analysisResult.permitNosByStatus.cancelled.length === 0 && (
                        <span className="text-xs text-slate-400">لا يوجد تصاريح</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT 3: Lines Table Detail with Lengths & Search Filter */}
            {(activeAnalysisTab === 'overview' || activeAnalysisTab === 'lines') && (
              <div className="p-6 space-y-4">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="تصفية حسب Segment ID، رقم التصريح، أو اسم القطاع..."
                      className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-bold pr-9 pl-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Filter className="h-4 w-4 text-slate-400" />
                    <select
                      value={selectedStatusFilter}
                      onChange={(e) => setSelectedStatusFilter(e.target.value)}
                      className="bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">جميع الحالات والخطوط</option>
                      <option value="executed_water">{getStatusCategoryLabel('executed_water', activeProject?.name, analysisResult.projectScope)}</option>
                      <option value="executed_sewage">{getStatusCategoryLabel('executed_sewage', activeProject?.name, analysisResult.projectScope)}</option>
                      <option value="ongoing">{getStatusCategoryLabel('ongoing', activeProject?.name, analysisResult.projectScope)}</option>
                      <option value="remaining">{getStatusCategoryLabel('remaining', activeProject?.name, analysisResult.projectScope)}</option>
                      <option value="cancelled">{getStatusCategoryLabel('cancelled', activeProject?.name, analysisResult.projectScope)}</option>
                    </select>
                  </div>
                </div>

                {/* Table View */}
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-black border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">Segment ID</th>
                        <th className="p-3">Permit No (رقم التصريح)</th>
                        <th className="p-3">حالة التنفيذ واللون</th>
                        <th className="p-3">الطول (متر)</th>
                        <th className="p-3">الطول (كيلومتر)</th>
                        <th className="p-3">اسم القطاع / Line</th>
                        <th className="p-3">الموقع بالخريطة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {filteredItems.map((item, index) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 font-mono text-slate-400">{index + 1}</td>
                          <td className="p-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                            {(() => {
                              const segAudit = auditSegmentId(item.segmentId);
                              if (segAudit.isEmpty) {
                                return (
                                  <span 
                                    onClick={() => setSelectedFeatureForModal(item)}
                                    className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-pointer"
                                    title="غير مسجل (من النواقص)"
                                  >
                                    غير مسجل (نواقص) ❌
                                  </span>
                                );
                              }
                              return (
                                <span 
                                  onClick={() => setSelectedFeatureForModal(item)}
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded border border-slate-200 dark:border-slate-700 cursor-pointer transition-colors"
                                  title={segAudit.warningMessage || 'انقر لعرض تفاصيل وموقع القطاع'}
                                >
                                  <span>{item.segmentId}</span>
                                  {segAudit.hasLeadingDash && (
                                    <span className="text-[10px] px-1 py-0.2 bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 rounded font-bold" title="تنبيه تنسيق: يحتوي على (-) قبل محتوى البيان">
                                      ⚠️ يبدأ بـ (-)
                                    </span>
                                  )}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                            {(() => {
                              const permAudit = auditPermitNo(item.permitNo);
                              if (permAudit.isEmpty) {
                                return (
                                  <span 
                                    onClick={() => setSelectedFeatureForModal(item)}
                                    className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${isYellowItemWithoutPermit(item) ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700'}`}
                                    title={isYellowItemWithoutPermit(item) ? 'بدون تصريح (من النواقص للخطوط الصفراء)' : 'غير مسجل'}
                                  >
                                    {isYellowItemWithoutPermit(item) ? '🚨 بدون تصريح (من النواقص)' : 'غير مسجل ❌'}
                                  </span>
                                );
                              }
                              return (
                                <span 
                                  onClick={() => setSelectedFeatureForModal(item)}
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded border border-slate-200 dark:border-slate-700 text-emerald-800 dark:text-emerald-200 cursor-pointer"
                                  title={permAudit.warningMessage || 'انقر لعرض تفاصيل وموقع الفسح'}
                                >
                                  <span>{item.permitNo}</span>
                                  {permAudit.isNonDigits && (
                                    <span className="text-[10px] px-1 py-0.2 bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 rounded font-bold" title="تنبيه تنسيق: رقم الفسح يجب أن يحتوي على أرقام فقط وبدون فراغ أو (-)">
                                      ⚠️ غير رقمي / يحتوي (-)
                                    </span>
                                  )}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="p-3">
                            {getStatusBadge(item.statusCategory)}
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                            {item.lengthMeters.toLocaleString('ar-SA')} م
                          </td>
                          <td className="p-3 font-mono font-bold text-blue-700 dark:text-blue-300">
                            {item.lengthKm} كم
                          </td>
                          <td className="p-3 text-slate-700 dark:text-slate-300 font-bold max-w-xs truncate" title={item.name}>
                            {item.name}
                          </td>
                          <td className="p-3">
                            <button
                              onClick={() => setSelectedFeatureForModal(item)}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-lg border border-blue-200 dark:border-blue-800 transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                              <span>📍 إظهار الموّقع</span>
                            </button>
                          </td>
                        </tr>
                      ))}

                      {filteredItems.length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400 dark:text-slate-500">
                            لا يوجد نتائج مطابقة للبحث
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB CONTENT: Color Compliance & Non-Compliant Codes Audit (فحص الألوان ومطابقة الأكواد المعتمدة) */}
            {activeAnalysisTab === 'colors' && (
              <div className="p-6 space-y-6">
                {/* Header & Quick Action Buttons */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Palette className="h-4 w-4 text-purple-600" />
                      <span>فحص ومطابقة الألوان وكشف الألوان المخالفة (Color Compliance & Audit)</span>
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      تدقيق صارم لكود الألوان المعتمد لشركة المياه الوطنية واكتشاف أي انحرافات أو ألوان شاذة في المخطط.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!analysisResult) return;
                        const rows = analysisResult.items.map((it, idx) => {
                          const actualColor = it.originalColorHex || it.colorHex || it.color || '';
                          const check = checkColorCompliance(actualColor);
                          return {
                            'م': idx + 1,
                            'معرف القطاع (Segment ID)': it.segmentId || 'غير محدد',
                            'رقم الفسح (Permit No)': it.permitNo || 'غير محدد',
                            'كود اللون الفعلي': actualColor || 'غير محدد',
                            'هل اللون مطابق للمواصفات؟': check.isCompliant ? 'مطابق ✅' : 'مخالف ❌',
                            'التصنيف المعتمد المقترح': check.matchedCategory.nameAr,
                            'كود اللون المعتمد': check.suggestedApprovedColor,
                            'المسافة اللونية (Deviation)': check.distance,
                            'الطول (متر)': it.lengthMeters,
                            'اسم الخط': it.name || '-'
                          };
                        });
                        const ws = XLSX.utils.json_to_sheet(rows);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "تدقيق الألوان");
                        XLSX.writeFile(wb, `تقرير_فحص_الألوان_${(activeProject?.name || 'مشروع').replace(/\s+/g, '_')}.xlsx`);
                      }}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200 dark:border-slate-700"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                      <span>تصدير تقرير فحص الألوان إكسل 📊</span>
                    </button>
                  </div>
                </div>

                {/* 5 Approved Colors Standard Cards */}
                <div className="space-y-3">
                  <h5 className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    <span>الأكواد المعتمدة رسمياً لشركة المياه الوطنية (5 ألوان قياسية):</span>
                  </h5>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {APPROVED_NWC_COLORS.map(colorSpec => {
                      const breakdownKey = colorSpec.key === 'executed_water' ? 'executed_water' :
                                           colorSpec.key === 'executed_sewer' ? 'executed_sewage' :
                                           colorSpec.key === 'in_progress' ? 'ongoing' :
                                           colorSpec.key === 'remaining' ? 'remaining' : 'cancelled';
                      const data = analysisResult.colorBreakdown[breakdownKey];
                      return (
                        <div key={colorSpec.key} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2 relative overflow-hidden">
                          <div className="w-1.5 h-full absolute right-0 top-0" style={{ backgroundColor: colorSpec.color }}></div>
                          <div className="pr-1 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-black text-slate-800 dark:text-slate-200">{colorSpec.nameAr}</span>
                              <span className="text-[10px] font-mono font-bold text-slate-400">{colorSpec.color}</span>
                            </div>
                            <h4 className="text-lg font-black text-slate-900 dark:text-white font-mono">
                              {data?.totalLengthKm || 0} <span className="text-[10px] font-sans text-slate-500">كم</span>
                            </h4>
                            <div className="flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800 font-mono">
                              <span>%{data?.percentage || 0}</span>
                              <span>{data?.segmentCount || 0} قطاع</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Non-Compliant Colors Audit Results */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-rose-500" />
                      <span>نتائج رصد الألوان المخالفة والمنحرفة في الخريطة:</span>
                    </h5>
                    <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {nonCompliantColorStats.length === 0 ? 'لا توجد مخالفات لونية' : `${nonCompliantColorStats.length} أكواد مخالفة`}
                    </span>
                  </div>

                  {nonCompliantColorStats.length > 0 ? (
                    <div className="overflow-x-auto border border-rose-200 dark:border-rose-900/60 rounded-xl shadow-xs">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-black border-b border-rose-200 dark:border-rose-900/60">
                          <tr>
                            <th className="p-3">#</th>
                            <th className="p-3">عينة اللون المرصود</th>
                            <th className="p-3">كود اللون (HEX)</th>
                            <th className="p-3">عدد القطاعات</th>
                            <th className="p-3">إجمالي الطول (متر / كم)</th>
                            <th className="p-3">التصنيف واللون الأقرب المقترح</th>
                            <th className="p-3">نسبة الانحراف (ΔE)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                          {nonCompliantColorStats.map((stat, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                              <td className="p-3 font-mono text-slate-400 font-bold">{idx + 1}</td>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-5 h-5 rounded-md border border-black/20 shadow-xs shrink-0"
                                    style={{ backgroundColor: stat.colorHex }}
                                  />
                                  <span className="font-mono font-bold text-xs">{stat.colorHex}</span>
                                </div>
                              </td>
                              <td className="p-3 font-mono text-rose-600 dark:text-rose-400 font-bold">{stat.colorHex}</td>
                              <td className="p-3 font-mono font-black">{stat.count} قطاع</td>
                              <td className="p-3 font-mono font-black text-slate-900 dark:text-white">
                                {stat.totalLengthKm} كم <span className="text-slate-400 font-normal">({stat.totalLengthMeters.toLocaleString('ar-SA')} م)</span>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="w-3 h-3 rounded-full shrink-0 shadow-xs"
                                    style={{ backgroundColor: stat.suggestedColor }}
                                  />
                                  <span className="font-bold text-slate-800 dark:text-slate-200">{stat.suggestedCategoryNameAr}</span>
                                  <span className="text-[10px] font-mono text-slate-400">({stat.suggestedColor})</span>
                                </div>
                              </td>
                              <td className="p-3 font-mono font-bold text-amber-600 dark:text-amber-400">{stat.distance}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl space-y-2">
                      <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                        <CheckCircle2 className="h-6 w-6" />
                      </div>
                      <h4 className="text-sm font-black text-emerald-900 dark:text-emerald-200">
                        مبارك! جميع ألوان عناصر الخريطة مطابقة 100% للمواصفات القياسية المعتمدة
                      </h4>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">
                        لا توجد أي خطوط ذات ألوان شاذة أو مخالفة لأكواد شركة المياه الوطنية.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT 5: Infrastructure Platform Reconciliation (مطابقة قطاعات البنية التحتية) */}
            {activeAnalysisTab === 'reconciliation' && (
              <div className="p-6 space-y-6 animate-in fade-in duration-300">
                {/* Header & Action Buttons */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Scale className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <span>مطابقة قطاعات البنية التحتية والرقابة الذكية (Infrastructure Reconciliation)</span>
                      <span className="text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-2.5 py-0.5 rounded-full font-bold">
                        PO: {activeProject?.po || 'غير محدد'}
                      </span>
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      مطابقة حية بين معرفات القطاعات (Segment ID) المعتمدة في منصة البنية التحتية وما تم رسمه وإسقاطه على الخريطة التفاعلية.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setIsExcelImportModalOpen(true)}
                        className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <UploadCloud className="h-4 w-4" />
                        <span>استيراد وتحديث الإكسل 📥</span>
                      </button>
                    )}

                    {reconciliationSummary.totalMissingCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const rows = reconciliationSummary.missingSegments.map((seg, idx) => ({
                            'م': idx + 1,
                            'رقم القطاع (Segment ID)': seg.segmentMapId,
                            'اسم المشروع': seg.projectName,
                            'رقم أمر الشراء (PO)': seg.poNumber,
                            'الشارع': seg.streets || '-',
                            'الحي': seg.neighborhoods || '-',
                            'المحافظة': seg.governorate || '-',
                            'الطول المعتمد (متر)': seg.segmentLength,
                            'حالة القطاع في المنصة': seg.segmentStatus,
                            'كود التصريح / المشروع': seg.projectCode || '-',
                            'الإجراء المطلوب': 'يجب رسمه وإسقاطه على الخريطة التفاعلية ⚠️'
                          }));
                          const ws = XLSX.utils.json_to_sheet(rows);
                          const wb = XLSX.utils.book_new();
                          XLSX.utils.book_append_sheet(wb, ws, "القطاعات المفقودة");
                          XLSX.writeFile(wb, `القطاعات_المفقودة_${(activeProject?.name || 'مشروع').replace(/\s+/g, '_')}.xlsx`);
                          showToast('📊 تم تصدير تقرير القطاعات المفقودة بنجاح!');
                        }}
                        className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <FileDown className="h-4 w-4" />
                        <span>تصدير النواقص إكسل ({reconciliationSummary.totalMissingCount}) ⚠️</span>
                      </button>
                    )}

                    {reconciliationSummary.totalCancelledOnMapCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const rows = reconciliationSummary.cancelledOnMapSegments.map((item, idx) => ({
                            'م': idx + 1,
                            'رقم القطاع (Segment ID)': item.platformSegment.segmentMapId,
                            'اسم المشروع': item.platformSegment.projectName,
                            'رقم أمر الشراء (PO)': item.platformSegment.poNumber,
                            'الشارع': item.platformSegment.streets || '-',
                            'الحي': item.platformSegment.neighborhoods || '-',
                            'الطول بالمنصة (متر)': item.platformSegment.segmentLength,
                            'الطول بالخريطة (متر)': item.matchedMapFeature?.lengthMeters || item.platformSegment.segmentLength,
                            'حالة الإلغاء بالمنصة': item.platformSegment.segmentStatus,
                            'اسم العنصر على الخريطة': item.matchedMapFeature?.name || '-',
                            'الإجراء المطلوب': 'يجب حذفه وإزالته من الخريطة التفاعلية 🚫'
                          }));
                          const ws = XLSX.utils.json_to_sheet(rows);
                          const wb = XLSX.utils.book_new();
                          XLSX.utils.book_append_sheet(wb, ws, "القطاعات الملغاة");
                          XLSX.writeFile(wb, `القطاعات_الملغاة_المطلوب_حذفها_${(activeProject?.name || 'مشروع').replace(/\s+/g, '_')}.xlsx`);
                          showToast('🚫 تم تصدير تقرير القطاعات الملغاة بنجاح!');
                        }}
                        className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <FileDown className="h-4 w-4" />
                        <span>تصدير الملغاة للحذف ({reconciliationSummary.totalCancelledOnMapCount}) 🚫</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const rows = platformSegments.map((seg, idx) => {
                          const isCancelled = isSegmentStatusCancelled(seg.segmentStatus);
                          const isClosed = isSegmentStatusInitiallyClosed(seg.segmentStatus);
                          const isMissing = reconciliationSummary.missingSegments.some(m => m.segmentMapId === seg.segmentMapId);
                          const isCancelledOnMap = reconciliationSummary.cancelledOnMapSegments.some(c => c.platformSegment.segmentMapId === seg.segmentMapId);
                          let statusText = 'مطابق ومسقط بالخريطة ✅';
                          if (isCancelled && isCancelledOnMap) statusText = 'ملغي بالمنصة ويجب حذفه من الخريطة 🚫';
                          else if (isCancelled && !isCancelledOnMap) statusText = 'ملغي بالمنصة وغير موجود بالخريطة (سليم) ✨';
                          else if (isClosed && !isMissing) statusText = 'مغلق أولياً بالمنصة (مستثنى) ℹ️';
                          else if (isMissing) statusText = 'مفقود من الخريطة ويجب رسمه ⚠️';

                          return {
                            'م': idx + 1,
                            'رقم القطاع (Segment ID)': seg.segmentMapId,
                            'رقم أمر الشراء (PO)': seg.poNumber,
                            'اسم المشروع': seg.projectName,
                            'الشارع': seg.streets || '-',
                            'الحي': seg.neighborhoods || '-',
                            'المحافظة': seg.governorate || '-',
                            'الطول المعتمد (متر)': seg.segmentLength,
                            'حالة القطاع في المنصة': seg.segmentStatus,
                            'حالة المطابقة مع الخريطة': statusText,
                            'كود التصريح / المشروع': seg.projectCode || '-'
                          };
                        });
                        const ws = XLSX.utils.json_to_sheet(rows);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "المطابقة الشاملة");
                        XLSX.writeFile(wb, `تقرير_المطابقة_الشامل_${(activeProject?.name || 'مشروع').replace(/\s+/g, '_')}.xlsx`);
                        showToast('📋 تم تصدير تقرير المطابقة الشامل بنجاح!');
                      }}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-300 dark:border-slate-700"
                    >
                      <Download className="h-4 w-4 text-blue-500" />
                      <span>تقرير المطابقة الشامل 📋</span>
                    </button>
                  </div>
                </div>

                {/* 4 Summary Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {/* Card 1: Total Platform Segments */}
                  <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 rounded-2xl border border-blue-200 dark:border-blue-900/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-blue-900 dark:text-blue-200">إجمالي قطاعات المنصة</span>
                      <FileSpreadsheet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                      {reconciliationSummary.totalPlatformSegmentsCount} <span className="text-xs font-sans text-slate-500">قطاع</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      الطول: {(reconciliationSummary.totalPlatformLengthMeters / 1000).toFixed(3)} كم ({reconciliationSummary.totalPlatformLengthMeters.toLocaleString('ar-SA')} م)
                    </div>
                  </div>

                  {/* Card 2: Missing Segments to Add */}
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    reconciliationSummary.totalMissingCount > 0
                      ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 ring-2 ring-rose-500/20'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-rose-900 dark:text-rose-200">قطاعات مفقودة من الخريطة</span>
                      <AlertOctagon className="h-4 w-4 text-rose-600 dark:text-rose-400 animate-pulse" />
                    </div>
                    <div className="text-2xl font-black text-rose-700 dark:text-rose-300 font-mono">
                      {reconciliationSummary.totalMissingCount} <span className="text-xs font-sans text-slate-500">قطاع</span>
                    </div>
                    <div className="text-[11px] text-rose-600 dark:text-rose-400 font-mono font-bold">
                      الطول المفقود: {(reconciliationSummary.totalMissingLengthMeters / 1000).toFixed(3)} كم ({reconciliationSummary.totalMissingLengthMeters.toLocaleString('ar-SA')} م)
                    </div>
                  </div>

                  {/* Card 3: Cancelled Segments on Map */}
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    reconciliationSummary.totalCancelledOnMapCount > 0
                      ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 ring-2 ring-amber-500/20'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-amber-900 dark:text-amber-200">ملغاة بالمنصة (يجب حذفها)</span>
                      <Ban className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="text-2xl font-black text-amber-700 dark:text-amber-300 font-mono">
                      {reconciliationSummary.totalCancelledOnMapCount} <span className="text-xs font-sans text-slate-500">قطاع</span>
                    </div>
                    <div className="text-[11px] text-amber-700 dark:text-amber-400 font-mono font-bold">
                      الطول المرصود: {(reconciliationSummary.totalCancelledOnMapLengthMeters / 1000).toFixed(3)} كم ({reconciliationSummary.totalCancelledOnMapLengthMeters.toLocaleString('ar-SA')} م)
                    </div>
                  </div>

                  {/* Card 4: Compliant Segments */}
                  <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-emerald-900 dark:text-emerald-200">قطاعات مطابقة ومسقطة</span>
                      <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 font-mono">
                      {reconciliationSummary.totalCompliantCount} <span className="text-xs font-sans text-slate-500">قطاع</span>
                    </div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono">
                      الطول المطابق: {(reconciliationSummary.totalCompliantLengthMeters / 1000).toFixed(3)} كم ({reconciliationSummary.totalCompliantLengthMeters.toLocaleString('ar-SA')} م)
                    </div>
                  </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setReconciliationFilter('all')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        reconciliationFilter === 'all'
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      الكل ({platformSegments.length})
                    </button>

                    <button
                      type="button"
                      onClick={() => setReconciliationFilter('missing')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        reconciliationFilter === 'missing'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      قطاعات مفقودة ({reconciliationSummary.totalMissingCount}) ⚠️
                    </button>

                    <button
                      type="button"
                      onClick={() => setReconciliationFilter('cancelled')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        reconciliationFilter === 'cancelled'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      }`}
                    >
                      ملغاة ويجب حذفها ({reconciliationSummary.totalCancelledOnMapCount}) 🚫
                    </button>

                    <button
                      type="button"
                      onClick={() => setReconciliationFilter('closed')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        reconciliationFilter === 'closed'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                      }`}
                    >
                      مغلق أولياً ({platformSegments.filter(s => isSegmentStatusInitiallyClosed(s.segmentStatus)).length}) ℹ️
                    </button>

                    <button
                      type="button"
                      onClick={() => setReconciliationFilter('compliant')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        reconciliationFilter === 'compliant'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      }`}
                    >
                      مطابقة ({reconciliationSummary.totalCompliantCount}) ✅
                    </button>
                  </div>

                  <div className="relative w-full sm:w-72">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="بحث في القطاعات، الشوارع، الأحياء..."
                      value={reconciliationSearch}
                      onChange={e => setReconciliationSearch(e.target.value)}
                      className="w-full text-xs py-2 pr-9 pl-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Table of Reconciliation Items */}
                {platformSegments.length > 0 ? (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold sticky top-0 border-b border-slate-200 dark:border-slate-700 z-10">
                          <tr>
                            <th className="p-3">م</th>
                            <th className="p-3">معرف القطاع (Segment ID)</th>
                            <th className="p-3">الموقع (الشارع / الحي)</th>
                            <th className="p-3">الطول المعتمد (م)</th>
                            <th className="p-3">حالة القطاع في المنصة</th>
                            <th className="p-3">حالة المطابقة مع الخريطة</th>
                            <th className="p-3">الإجراء الرقابي المطلوب</th>
                            <th className="p-3">كود المشروع</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                          {platformSegments
                            .filter(seg => {
                              const isCancelled = isSegmentStatusCancelled(seg.segmentStatus);
                              const isClosed = isSegmentStatusInitiallyClosed(seg.segmentStatus);
                              const isMissing = reconciliationSummary.missingSegments.some(m => m.segmentMapId === seg.segmentMapId);
                              const isCancelledOnMap = reconciliationSummary.cancelledOnMapSegments.some(c => c.platformSegment.segmentMapId === seg.segmentMapId);
                              const isCompliant = reconciliationSummary.compliantSegments.some(c => c.platformSegment.segmentMapId === seg.segmentMapId);

                              if (reconciliationFilter === 'missing' && !isMissing) return false;
                              if (reconciliationFilter === 'cancelled' && !isCancelledOnMap) return false;
                              if (reconciliationFilter === 'compliant' && !isCompliant) return false;
                              if (reconciliationFilter === 'closed' && !isClosed) return false;

                              if (reconciliationSearch.trim()) {
                                const q = reconciliationSearch.trim().toLowerCase();
                                const matchId = seg.segmentMapId.toLowerCase().includes(q);
                                const matchStreet = (seg.streets || '').toLowerCase().includes(q);
                                const matchNeigh = (seg.neighborhoods || '').toLowerCase().includes(q);
                                const matchCode = (seg.projectCode || '').toLowerCase().includes(q);
                                return matchId || matchStreet || matchNeigh || matchCode;
                              }
                              return true;
                            })
                            .map((seg, idx) => {
                              const isCancelled = isSegmentStatusCancelled(seg.segmentStatus);
                              const isClosed = isSegmentStatusInitiallyClosed(seg.segmentStatus);
                              const isMissing = reconciliationSummary.missingSegments.some(m => m.segmentMapId === seg.segmentMapId);
                              const isCancelledOnMap = reconciliationSummary.cancelledOnMapSegments.some(c => c.platformSegment.segmentMapId === seg.segmentMapId);
                              const isCompliant = reconciliationSummary.compliantSegments.some(c => c.platformSegment.segmentMapId === seg.segmentMapId);

                              return (
                                <tr 
                                  key={seg.id || idx}
                                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
                                    isMissing ? 'bg-rose-50/30 dark:bg-rose-950/10' :
                                    isCancelledOnMap ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                                  }`}
                                >
                                  <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                                  
                                  <td className="p-3">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono font-black text-slate-900 dark:text-slate-100 text-[11px]">
                                        {seg.segmentMapId}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => copyToClipboard(seg.segmentMapId, 'معرف القطاع')}
                                        className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
                                        title="نسخ رقم القطاع"
                                      >
                                        <Copy className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </td>

                                  <td className="p-3 text-[11px] text-slate-600 dark:text-slate-400 max-w-[200px] truncate" title={`${seg.streets} - ${seg.neighborhoods}`}>
                                    <span className="font-semibold text-slate-800 dark:text-slate-200">{seg.streets || '-'}</span>
                                    {seg.neighborhoods && <span className="block text-[10px] text-slate-400">{seg.neighborhoods}</span>}
                                  </td>

                                  <td className="p-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                                    {seg.segmentLength} م
                                  </td>

                                  <td className="p-3">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      isCancelled
                                        ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                        : isClosed
                                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                                        : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                    }`}>
                                      {seg.segmentStatus}
                                    </span>
                                  </td>

                                  <td className="p-3 font-bold">
                                    {isMissing && (
                                      <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold">
                                        <AlertOctagon className="h-3.5 w-3.5" />
                                        <span>غير مسقط بالخريطة ❌</span>
                                      </span>
                                    )}
                                    {isCancelledOnMap && (
                                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                                        <Ban className="h-3.5 w-3.5" />
                                        <span>مرسوم بالخريطة وهو ملغي ⚠️</span>
                                      </span>
                                    )}
                                    {isCompliant && (
                                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                                        <CheckCircle className="h-3.5 w-3.5" />
                                        <span>مسقط ومطابق ✅</span>
                                      </span>
                                    )}
                                    {!isMissing && !isCancelledOnMap && !isCompliant && isClosed && (
                                      <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium text-[11px]">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
                                        <span>مغلق أولياً (مستثنى) ℹ️</span>
                                      </span>
                                    )}
                                    {!isMissing && !isCancelledOnMap && !isCompliant && isCancelled && (
                                      <span className="inline-flex items-center gap-1 text-slate-400 font-normal">
                                        <span>غير موجود بالخريطة (سليم) ✨</span>
                                      </span>
                                    )}
                                  </td>

                                  <td className="p-3">
                                    {isMissing && (
                                      <span className="px-2 py-1 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 font-black text-[10px] border border-rose-300 dark:border-rose-800">
                                        🔴 يلزم رسمه وإضافته
                                      </span>
                                    )}
                                    {isCancelledOnMap && (
                                      <span className="px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 font-black text-[10px] border border-amber-300 dark:border-amber-800">
                                        🗑️ يلزم حذفه من الخريطة
                                      </span>
                                    )}
                                    {isCompliant && (
                                      <span className="px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 font-bold text-[10px]">
                                        ✨ مطابق ومكتمل
                                      </span>
                                    )}
                                    {isClosed && !isCompliant && (
                                      <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] border border-slate-300 dark:border-slate-700">
                                        ℹ️ مغلق بالمنصة (مستثنى)
                                      </span>
                                    )}
                                    {!isMissing && !isCancelledOnMap && !isCompliant && !isClosed && (
                                      <span className="text-slate-400 text-[10px]">-</span>
                                    )}
                                  </td>

                                  <td className="p-3 font-mono text-[10px] text-slate-500">
                                    {seg.projectCode || '-'}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="p-10 text-center bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl space-y-3">
                    <FileSpreadsheet className="h-10 w-10 text-slate-400 mx-auto" />
                    <h5 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      لم يتم العثور على قطاعات مسجلة في قاعدة البيانات لهذا المشروع (PO: {activeProject?.po || 'غير محدد'})
                    </h5>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                      يمكنك رفع وتحديث ملف الإكسل (Segment ID.xlsx) الخاص بمنصة البنية التحتية لتفعيل المطابقة التلقائية فوراً.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsExcelImportModalOpen(true)}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-xl shadow-md transition-all inline-flex items-center gap-2 cursor-pointer"
                    >
                      <UploadCloud className="h-4 w-4" />
                      <span>رفع ملف Segment ID.xlsx الآن 📤</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Previous Project Reports Section */}
      {activeProject && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-xl">
                <History className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>التقارير السابقة للمشروع</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-mono font-bold">
                    {projectHistoryReports.length} تقرير
                  </span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  عرض واستعراض سجل التقارير اليومية والتاريخية المحفوظة بقاعدة البيانات لمشروع ({activeProject.name})
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsLoadingProjectHistory(true);
                ReportHistoryStore.getHistoricalReports(activeProject.id, activeProject.name, activeProject.po)
                  .then(reports => {
                    setProjectHistoryReports(reports || []);
                    setIsLoadingProjectHistory(false);
                  })
                  .catch(() => setIsLoadingProjectHistory(false));
              }}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title="تحديث سجل التقارير"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingProjectHistory ? 'animate-spin' : ''}`} />
              <span>تحديث السجل</span>
            </button>
          </div>

          {isLoadingProjectHistory ? (
            <div className="p-8 text-center space-y-2">
              <RefreshCw className="h-6 w-6 text-blue-600 animate-spin mx-auto" />
              <p className="text-xs text-slate-500">جاري تحميل سجل التقارير السابقة للمشروع...</p>
            </div>
          ) : projectHistoryReports.length > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {projectHistoryReports.map((report, idx) => {
                  const isCurrentDisplayed = analysisResult?.parsedAt === report.parsedAt || analysisResult?.parsedAt === report.createdAt;
                  const res = report.analysisResult;
                  
                  return (
                    <div
                      key={report.id || idx}
                      className={`p-4 rounded-xl border transition-all space-y-3 ${
                        isCurrentDisplayed
                          ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/30 shadow-md ring-2 ring-blue-500/20'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {/* Header info */}
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-700/60">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          <span className="text-xs font-black text-slate-900 dark:text-white font-mono">
                            {report.parsedAt || (report.createdAt ? new Date(report.createdAt).toLocaleString('ar-SA') : 'تقرير موثق')}
                          </span>
                        </div>

                        {isCurrentDisplayed ? (
                          <span className="px-2.5 py-0.5 bg-blue-600 text-white text-[10px] font-black rounded-full shadow-xs">
                            التقرير المعروض حالياً 👁️
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono font-bold text-slate-400">
                            التقرير #{projectHistoryReports.length - idx}
                          </span>
                        )}
                      </div>

                      {/* Metrics Breakdown */}
                      {res && (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800">
                            <span className="text-[10px] text-slate-500 block">إجمالي الأطوال:</span>
                            <span className="font-mono font-black text-slate-900 dark:text-white text-sm">
                              {res.totalLengthKm} كم
                            </span>
                            <span className="text-[10px] text-slate-400 mr-1 font-mono">
                              ({res.totalLengthMeters?.toLocaleString()} م)
                            </span>
                          </div>

                          <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800">
                            <span className="text-[10px] text-slate-500 block">عدد العناصر والقطاعات:</span>
                            <span className="font-mono font-black text-blue-600 dark:text-blue-400 text-sm">
                              {res.totalFeaturesCount || 0} قطاع
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Categories breakdown pills */}
                      {res?.colorBreakdown && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {res.colorBreakdown.executed_water?.totalLengthMeters > 0 && (
                            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/60 text-blue-900 dark:text-blue-200 text-[10px] font-bold rounded-md border border-blue-200 dark:border-blue-800">
                              منفذ مياه: {res.colorBreakdown.executed_water.totalLengthKm} كم
                            </span>
                          )}
                          {res.colorBreakdown.executed_sewage?.totalLengthMeters > 0 && (
                            <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 text-[10px] font-bold rounded-md border border-emerald-200 dark:border-emerald-800">
                              منفذ صرف: {res.colorBreakdown.executed_sewage.totalLengthKm} كم
                            </span>
                          )}
                          {res.colorBreakdown.ongoing?.totalLengthMeters > 0 && (
                            <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 text-[10px] font-bold rounded-md border border-amber-200 dark:border-amber-800">
                              جاري العمل: {res.colorBreakdown.ongoing.totalLengthKm} كم ({res.colorBreakdown.ongoing.segmentCount} قطاع)
                            </span>
                          )}
                          {res.colorBreakdown.remaining?.totalLengthMeters > 0 && (
                            <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-900/60 text-rose-900 dark:text-rose-200 text-[10px] font-bold rounded-md border border-rose-200 dark:border-rose-800">
                              متبقي: {res.colorBreakdown.remaining.totalLengthKm} كم
                            </span>
                          )}
                          {res.colorBreakdown.cancelled?.totalLengthMeters > 0 && (
                            <span className="px-2 py-0.5 bg-pink-100 dark:bg-pink-900/60 text-pink-900 dark:text-pink-200 text-[10px] font-bold rounded-md border border-pink-200 dark:border-pink-800">
                              ملغى: {res.colorBreakdown.cancelled.totalLengthKm} كم
                            </span>
                          )}
                        </div>
                      )}

                      {/* Actions Bar */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700/60 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (res) {
                              setAnalysisResult(res);
                              showToast(`📊 تم عرض واستعراض بيانات التقرير المؤرخ (${report.parsedAt || 'السابق'})`);
                              setTimeout(() => {
                                if (reportDisplaySectionRef.current) {
                                  reportDisplaySectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                } else {
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }
                              }, 50);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                            isCurrentDisplayed
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                          }`}
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          <span>{isCurrentDisplayed ? 'التقرير معروض حالياً' : 'عرض واستعراض هذا التقرير'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (res && activeProject) {
                              const previousReport = projectHistoryReports[idx + 1];
                              const diff = compareKMLAnalyses(
                                previousReport ? previousReport.analysisResult : null,
                                res,
                                activeProject.id,
                                activeProject.name,
                                activeProject.scope
                              );
                              setCurrentDiffResult(diff);
                              setIsDiffModalOpen(true);
                            }
                          }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 text-amber-500" />
                          <span>مقارنة التغيرات</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-6 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <FileText className="w-8 h-8 text-slate-400 mx-auto" />
              <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                لا يوجد تقارير سابقة مسجلة لهذا المشروع بعد في قاعدة البيانات
              </h5>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                عند تشغيل التحليل المباشر أو الفحص التلقائي، يتم حصر وتوثيق جميع التحديثات والأطوال وحفظها تلقائياً كتقرير جديد بجدول التقارير التاريخية.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Feature Balloon & Map Location Modal */}
      {selectedFeatureForModal && (
        <FeatureDetailsModal
          feature={selectedFeatureForModal}
          onClose={() => setSelectedFeatureForModal(null)}
        />
      )}
      {/* Project Change Tracking & Historical Comparison Modal */}
      {activeProject && (
        <ProjectDiffModal
          isOpen={isDiffModalOpen}
          onClose={() => setIsDiffModalOpen(false)}
          diffResult={currentDiffResult}
          projectId={activeProject.id}
          projectName={activeProject.name}
          isAdmin={isAdmin}
        />
      )}

      {/* Segment & Permit Regions Map Modal */}
      <SegmentPermitRegionsModal
        isOpen={isRegionsMapModalOpen}
        onClose={() => setIsRegionsMapModalOpen(false)}
        analysisResult={analysisResult}
        initialMode={regionsMapModalMode}
        initialFocusId={regionsMapModalFocusId}
        initialStatusFilter={regionsMapModalStatusFilter}
        projectName={activeProject?.name}
      />

      {/* Red Features Without Segment ID Modal */}
      <RedNoSegmentModal
        isOpen={isRedNoSegmentModalOpen}
        onClose={() => setIsRedNoSegmentModalOpen(false)}
        items={redNoSegmentModalItems}
        categoryTitle={activeProject?.name || 'فحص القطاعات الحمراء'}
        onOpenMyMaps={(proj) => {
          setIsRedNoSegmentModalOpen(false);
          setActiveProject(proj);
          if (proj.mapUrl) {
            setMapInputUrl(proj.mapUrl);
            loadAnalysis(proj.mapUrl, proj.name);
          }
        }}
      />

      {/* Platform Segments Excel Import & Sync Modal */}
      <PlatformSegmentsImportModal
        isOpen={isExcelImportModalOpen}
        onClose={() => setIsExcelImportModalOpen(false)}
        onSuccess={() => {
          setIsExcelImportModalOpen(false);
          refreshPlatformSegments();
          showToast('☁️ تم تحديث ومزامنة قطاعات البنية التحتية بنجاح!');
        }}
      />
    </div>
  );
}
