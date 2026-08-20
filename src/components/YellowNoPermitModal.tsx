/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Project, KMLFeatureItem } from '../types';
import { FeatureDetailsModal, FeatureDetailData } from './FeatureDetailsModal';
import { exportYellowNoPermitToPDF } from '../utils/pdfExport';
import { useLanguage } from '../utils/i18n';
import * as XLSX from 'xlsx';
import { 
  X, 
  AlertTriangle, 
  Search, 
  Filter, 
  FileSpreadsheet, 
  FileText,
  Loader2,
  Copy, 
  Check, 
  ExternalLink, 
  MapPin, 
  Ruler, 
  Building2, 
  HardHat, 
  Layers, 
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  Eye,
  Globe
} from 'lucide-react';

export interface YellowNoPermitItemDetail {
  id: string;
  projectId: number;
  projectName: string;
  po?: string;
  contractor?: string;
  classification?: string;
  region?: string;
  subProgram?: string;
  scope?: string;
  segmentId: string;
  permitNo: string;
  name: string;
  lengthMeters: number;
  lengthKm: number;
  stage?: string;
  streetName?: string;
  district?: string;
  innerDiameter?: string;
  zone?: string;
  drillingType?: string;
  centerLat?: number;
  centerLng?: number;
  googleMapsUrl?: string;
  coordinates?: Array<[number, number]>;
  featureItem?: KMLFeatureItem;
  projectObj?: Project;
}

interface YellowNoPermitModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: YellowNoPermitItemDetail[];
  categoryTitle?: string;
  onOpenMyMaps?: (project: Project) => void;
}

export function YellowNoPermitModal({
  isOpen,
  onClose,
  items,
  categoryTitle = 'جميع المشاريع',
  onOpenMyMaps
}: YellowNoPermitModalProps) {
  const { t, language, isRtl, formatNumber, translateDynamic } = useLanguage();
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('all');
  const [selectedContractorFilter, setSelectedContractorFilter] = useState<string>('all');
  const [selectedStageFilter, setSelectedStageFilter] = useState<string>('all');
  const [selectedFeatureForDetail, setSelectedFeatureForDetail] = useState<FeatureDetailData | null>(null);
  const [copiedSegmentId, setCopiedSegmentId] = useState<string | null>(null);
  const [isCopiedAll, setIsCopiedAll] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [sortField, setSortField] = useState<'length' | 'segmentId' | 'projectName'>('length');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 20;

  // Dropdown filter options derived from items
  const uniqueProjects = useMemo(() => {
    const map = new Map<number, string>();
    items.forEach(it => {
      if (it.projectId && it.projectName) {
        map.set(it.projectId, it.projectName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [items]);

  const uniqueContractors = useMemo(() => {
    const set = new Set<string>();
    items.forEach(it => {
      if (it.contractor && it.contractor !== 'غير محدد') {
        set.add(it.contractor);
      }
    });
    return Array.from(set).sort();
  }, [items]);

  const uniqueStages = useMemo(() => {
    const set = new Set<string>();
    items.forEach(it => {
      if (it.stage && it.stage !== 'غير متوفر') {
        set.add(it.stage);
      }
    });
    return Array.from(set).sort();
  }, [items]);

  // Filtered & Sorted items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Search term matching
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const seg = (item.segmentId || '').toLowerCase();
        const pName = (item.projectName || '').toLowerCase();
        const po = (item.po || '').toLowerCase();
        const cont = (item.contractor || '').toLowerCase();
        const street = (item.streetName || '').toLowerCase();
        const dist = (item.district || '').toLowerCase();
        const stage = (item.stage || '').toLowerCase();
        const diam = (item.innerDiameter || '').toLowerCase();
        const name = (item.name || '').toLowerCase();

        const match = seg.includes(query) || pName.includes(query) || po.includes(query) ||
                      cont.includes(query) || street.includes(query) || dist.includes(query) ||
                      stage.includes(query) || diam.includes(query) || name.includes(query);
        if (!match) return false;
      }

      // Project filter
      if (selectedProjectFilter !== 'all' && String(item.projectId) !== selectedProjectFilter) {
        return false;
      }

      // Contractor filter
      if (selectedContractorFilter !== 'all' && item.contractor !== selectedContractorFilter) {
        return false;
      }

      // Stage filter
      if (selectedStageFilter !== 'all' && item.stage !== selectedStageFilter) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortField === 'length') {
        return sortAsc ? (a.lengthMeters - b.lengthMeters) : (b.lengthMeters - a.lengthMeters);
      } else if (sortField === 'segmentId') {
        return sortAsc ? a.segmentId.localeCompare(b.segmentId) : b.segmentId.localeCompare(a.segmentId);
      } else {
        return sortAsc ? a.projectName.localeCompare(b.projectName) : b.projectName.localeCompare(a.projectName);
      }
    });
  }, [items, searchTerm, selectedProjectFilter, selectedContractorFilter, selectedStageFilter, sortField, sortAsc]);

  // Paginated items
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage]);

  // Aggregate stats for filtered items
  const stats = useMemo(() => {
    const totalMeters = filteredItems.reduce((acc, it) => acc + (it.lengthMeters || 0), 0);
    const projCount = new Set(filteredItems.map(it => it.projectId)).size;
    const contractorCount = new Set(filteredItems.map(it => it.contractor).filter(Boolean)).size;
    return {
      count: filteredItems.length,
      totalMeters,
      totalKm: Number((totalMeters / 1000).toFixed(3)),
      projCount,
      contractorCount
    };
  }, [filteredItems]);

  const handleCopySegment = (segId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(segId);
    setCopiedSegmentId(segId);
    setTimeout(() => setCopiedSegmentId(null), 2000);
  };

  const handleCopyAllSegments = () => {
    const segList = Array.from(new Set(filteredItems.map(it => it.segmentId).filter(Boolean))).join('\n');
    navigator.clipboard.writeText(segList);
    setIsCopiedAll(true);
    setTimeout(() => setIsCopiedAll(false), 2500);
  };

  const handleExportExcel = () => {
    const exportData = filteredItems.map((it, idx) => ({
      'م': idx + 1,
      'Segment ID (معرف القطاع)': it.segmentId || 'غير محدد',
      'رقم الفسح / التصريح': it.permitNo || 'بدون فسح (Missing)',
      'اسم المشروع': it.projectName,
      'أمر الشراء (PO)': it.po || '-',
      'المقاول': it.contractor || '-',
      'التصنيف': it.classification || '-',
      'المنطقة': it.region || '-',
      'البرنامج / القطاع': it.subProgram || it.scope || '-',
      'الشارع': it.streetName || '-',
      'الحي': it.district || '-',
      'القطر الداخلي (مم)': it.innerDiameter || '-',
      'طريقة الحفر': it.drillingType || '-',
      'مرحلة الحفرية (جاري العمل)': it.stage || 'غير متوفر',
      'الطول (متر)': it.lengthMeters,
      'الطول (كيلومتر)': it.lengthKm,
      'الإحداثيات': (it.centerLat && it.centerLng) ? `${it.centerLat}, ${it.centerLng}` : '-',
      'رابط الخريطة': it.googleMapsUrl || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'قطاعات بدون فسح');
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `حصر_القطاعات_الصفراء_بدون_فسح_${categoryTitle.replace(/\s+/g, '_')}_${dateStr}.xlsx`);
  };

  const handleExportPdf = async () => {
    if (filteredItems.length === 0 || isExportingPdf) return;
    try {
      setIsExportingPdf(true);
      await exportYellowNoPermitToPDF(filteredItems, categoryTitle);
    } catch (err) {
      console.error('Error generating PDF report for yellow items:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleOpenDetailModal = (item: YellowNoPermitItemDetail) => {
    const detailData: FeatureDetailData = {
      name: item.name || `قطاع ${item.segmentId}`,
      segmentId: item.segmentId,
      permitNo: item.permitNo || 'بدون فسح مسجل',
      statusLabel: 'جاري العمل / التنفيذ (بدون رقم فسح)',
      colorHex: '#ffea00',
      stage: item.stage || 'غير متوفر',
      lengthMeters: item.lengthMeters,
      streetName: item.streetName,
      district: item.district,
      innerDiameter: item.innerDiameter,
      zone: item.zone,
      drillingType: item.drillingType,
      contractor: item.contractor,
      kmlProjectName: item.projectName,
      centerLat: item.centerLat,
      centerLng: item.centerLng,
      googleMapsUrl: item.googleMapsUrl,
      coordinates: item.coordinates || item.featureItem?.coordinates
    };
    setSelectedFeatureForDetail(detailData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-5 overflow-y-auto animate-fadeIn text-right dir-rtl">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-6xl overflow-hidden my-auto flex flex-col max-h-[94vh]">
        
        {/* Top Header */}
        <div className="bg-gradient-to-r from-slate-950 via-amber-950 to-slate-950 p-5 sm:p-6 text-white flex items-center justify-between shrink-0 border-b border-amber-900/40">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-amber-500/20 text-amber-300 rounded-2xl border border-amber-500/40 shadow-inner">
              <AlertTriangle className="h-6 w-6 animate-pulse text-amber-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
                  <span>حصر ومعاينة القطاعات الجارية باللون الأصفر بدون رقم فسح</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-600 text-white shadow-xs">
                    {stats.count.toLocaleString('ar-SA')} قطاع 🚨
                  </span>
                </h2>
              </div>
              <p className="text-xs text-amber-200/80 mt-1 flex flex-wrap items-center gap-2">
                <span>النطاق: <strong>{categoryTitle}</strong></span>
                <span>•</span>
                <span>العناصر المحصورة ضمن تقارير المشاريع المعتمدة في قاعدة البيانات</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer border border-slate-700 shrink-0"
            title="إغلاق النافذة"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 4 Summary Stats Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 sm:p-5 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 shrink-0">
          {/* 1. Total Segments Count */}
          <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-900/50 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px] font-bold mb-1">
              <span>إجمالي القطاعات بدون فسح</span>
              <Layers className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
              {stats.count.toLocaleString('ar-SA')} <span className="text-xs font-bold text-slate-500">قطاع</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">خطوط جاري العمل الصفراء</div>
          </div>

          {/* 2. Total Lengths */}
          <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-900/50 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px] font-bold mb-1">
              <span>إجمالي الأطوال الكلية</span>
              <Ruler className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-300 font-mono">
              {stats.totalKm.toLocaleString('ar-SA')} <span className="text-xs font-bold text-slate-500">كم</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">({stats.totalMeters.toLocaleString('ar-SA')} متر طولي)</div>
          </div>

          {/* 3. Affected Projects */}
          <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-900/50 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px] font-bold mb-1">
              <span>المشاريع المتأثرة</span>
              <Building2 className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
              {stats.projCount.toLocaleString('ar-SA')} <span className="text-xs font-bold text-slate-500">مشروع</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">تحتوي على قطاعات غير مرخصة</div>
          </div>

          {/* 4. Contractors */}
          <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-900/50 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px] font-bold mb-1">
              <span>شركات المقاولات</span>
              <HardHat className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
              {stats.contractorCount.toLocaleString('ar-SA')} <span className="text-xs font-bold text-slate-500">شركة</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">المنفذة للقطاعات الجارية</div>
          </div>
        </div>

        {/* Toolbar & Filters Bar */}
        <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="ابحث برمز Segment ID، اسم المشروع، المقاول، الشارع، الحي، القطر..."
              className="w-full pr-9 pl-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-900 dark:text-slate-100 font-bold"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-black cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filters Group */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Project Filter */}
            {uniqueProjects.length > 1 && (
              <select
                value={selectedProjectFilter}
                onChange={(e) => {
                  setSelectedProjectFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">🏢 جميع المشاريع ({uniqueProjects.length})</option>
                {uniqueProjects.map(p => (
                  <option key={p.id} value={String(p.id)}>{p.name}</option>
                ))}
              </select>
            )}

            {/* Contractor Filter */}
            {uniqueContractors.length > 1 && (
              <select
                value={selectedContractorFilter}
                onChange={(e) => {
                  setSelectedContractorFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">👷‍♂️ كافة المقاولين ({uniqueContractors.length})</option>
                {uniqueContractors.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}

            {/* Stage Filter */}
            {uniqueStages.length > 1 && (
              <select
                value={selectedStageFilter}
                onChange={(e) => {
                  setSelectedStageFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">🚧 كل المراحل ({uniqueStages.length})</option>
                {uniqueStages.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}

            {/* Export Excel Button */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredItems.length === 0}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              title="تصدير جدول القطاعات بالكامل إلى ملف إكسل"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>تصدير إكسل</span>
            </button>

            {/* Export PDF Button */}
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={filteredItems.length === 0 || isExportingPdf}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              title="تصدير تقرير رقابي شامل ومفصل بصيغة PDF بجودة عالية"
            >
              {isExportingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span>{isExportingPdf ? 'جارِ التصدير...' : 'تصدير PDF'}</span>
            </button>

            {/* Copy Segment IDs Button */}
            <button
              type="button"
              onClick={handleCopyAllSegments}
              disabled={filteredItems.length === 0}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 cursor-pointer disabled:opacity-50"
              title="نسخ جميع معرفات Segment ID في الحافظة"
            >
              {isCopiedAll ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{isCopiedAll ? 'تم النسخ!' : 'نسخ المعرفات'}</span>
            </button>
          </div>
        </div>

        {/* Table Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {filteredItems.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 space-y-3">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <Check className="h-6 w-6" />
              </div>
              <h4 className="text-base font-extrabold text-slate-800 dark:text-slate-200">
                لا توجد قطاعات بدون فسح مطابقة للبحث
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                جميع القطاعات الجارية المحددة تحتوي على أرقام فسوح نظامية أو لا توجد نتائج تطابق خيارات التصفية الحالية.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-right text-xs border-collapse min-w-[950px]">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-extrabold border-b border-slate-200 dark:border-slate-700">
                    <th className="p-3 text-center w-12">م</th>
                    <th 
                      className="p-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                      onClick={() => {
                        if (sortField === 'segmentId') setSortAsc(!sortAsc);
                        else { setSortField('segmentId'); setSortAsc(true); }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <span>Segment ID (معرف القطاع)</span>
                        {sortField === 'segmentId' && (sortAsc ? ' 🔼' : ' 🔽')}
                      </div>
                    </th>
                    <th 
                      className="p-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                      onClick={() => {
                        if (sortField === 'projectName') setSortAsc(!sortAsc);
                        else { setSortField('projectName'); setSortAsc(true); }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <span>المشروع / أمر الشراء</span>
                        {sortField === 'projectName' && (sortAsc ? ' 🔼' : ' 🔽')}
                      </div>
                    </th>
                    <th className="p-3">المقاول</th>
                    <th className="p-3">الشارع والحي</th>
                    <th className="p-3 text-center">القطر وطريقة الحفر</th>
                    <th className="p-3 text-center">مرحلة الحفرية</th>
                    <th 
                      className="p-3 text-center cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                      onClick={() => {
                        if (sortField === 'length') setSortAsc(!sortAsc);
                        else { setSortField('length'); setSortAsc(false); }
                      }}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>الطول (متر / كم)</span>
                        {sortField === 'length' && (sortAsc ? ' 🔼' : ' 🔽')}
                      </div>
                    </th>
                    <th className="p-3 text-center">رقم الفسح (Permit No)</th>
                    <th className="p-3 text-center w-28">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold">
                  {paginatedItems.map((item, idx) => {
                    const globalIdx = (currentPage - 1) * itemsPerPage + idx + 1;
                    return (
                      <tr 
                        key={`${item.id}-${idx}`}
                        className="hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-colors"
                      >
                        <td className="p-3 text-center text-slate-400 font-mono text-[11px]">
                          {globalIdx}
                        </td>

                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-slate-900 dark:text-slate-100 bg-amber-100/70 dark:bg-amber-950/80 px-2 py-0.5 rounded-lg border border-amber-300 dark:border-amber-800 text-[11px]">
                              {item.segmentId || 'غير محدد'}
                            </span>
                            {item.segmentId && (
                              <button
                                type="button"
                                onClick={(e) => handleCopySegment(item.segmentId, e)}
                                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                title="نسخ رمز القطاع"
                              >
                                {copiedSegmentId === item.segmentId ? (
                                  <Check className="h-3 w-3 text-emerald-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="p-3">
                          <div className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[220px]" title={item.projectName}>
                            {item.projectName}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <span>PO: {item.po || '-'}</span>
                            {item.region && <span>• {item.region}</span>}
                          </div>
                        </td>

                        <td className="p-3">
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[160px] block" title={item.contractor}>
                            {item.contractor || 'غير محدد'}
                          </span>
                        </td>

                        <td className="p-3">
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            {item.streetName || '-'}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {item.district ? `حي ${item.district}` : 'غير محدد'}
                          </div>
                        </td>

                        <td className="p-3 text-center">
                          <div className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                            {item.innerDiameter ? `${item.innerDiameter} مم` : '-'}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {item.drillingType || '-'}
                          </div>
                        </td>

                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold text-[11px] whitespace-nowrap">
                            {item.stage || 'غير متوفر'}
                          </span>
                        </td>

                        <td className="p-3 text-center">
                          <div className="font-black text-slate-900 dark:text-slate-100 font-mono">
                            {item.lengthMeters.toLocaleString('ar-SA')} م
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            ({item.lengthKm} كم)
                          </div>
                        </td>

                        <td className="p-3 text-center">
                          <span className="px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 font-bold text-[11px] inline-flex items-center gap-1 shadow-3xs">
                            <AlertTriangle className="h-3 w-3 text-rose-500" />
                            <span>بدون فسح</span>
                          </span>
                        </td>

                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenDetailModal(item)}
                              className="p-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-300 rounded-lg transition-all cursor-pointer"
                              title="معاينة تفاصيل القطاع على الخريطة"
                            >
                              <Eye className="h-4 w-4" />
                            </button>

                            {item.googleMapsUrl && (
                              <a
                                href={item.googleMapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950 dark:hover:bg-emerald-900 text-emerald-600 dark:text-emerald-300 rounded-lg transition-all cursor-pointer"
                                title="فتح الموقع في خرائط Google"
                              >
                                <Globe className="h-4 w-4" />
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

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
              <div className="text-slate-500 dark:text-slate-400 font-bold">
                عرض {((currentPage - 1) * itemsPerPage) + 1} إلى {Math.min(currentPage * itemsPerPage, filteredItems.length)} من إجمالي {filteredItems.length} عنصر
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronRight className="h-4 w-4" />
                  <span>السابق</span>
                </button>

                <span className="px-3 py-1.5 font-bold text-slate-800 dark:text-slate-200">
                  صفحة {currentPage} من {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <span>التالي</span>
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Bar */}
        <div className="bg-slate-100 dark:bg-slate-950 p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-bold">
            <Info className="h-4 w-4 text-amber-500" />
            <span>يمكن استخراج وتوليد الفسوح تلقائياً عبر محرك التدقيق المكاني في قسم تحليل الخرائط.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>

      {/* Feature Details Modal (Leaflet preview) */}
      {selectedFeatureForDetail && (
        <FeatureDetailsModal
          feature={selectedFeatureForDetail}
          onClose={() => setSelectedFeatureForDetail(null)}
        />
      )}
    </div>
  );
}
