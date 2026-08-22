/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Project, KMLFeatureItem } from '../types';
import { FeatureDetailsModal, FeatureDetailData } from './FeatureDetailsModal';
import { useLanguage } from '../utils/i18n';
import * as XLSX from 'xlsx';
import { 
  X, 
  AlertOctagon, 
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

export interface RedNoSegmentItemDetail {
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

interface RedNoSegmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: RedNoSegmentItemDetail[];
  categoryTitle?: string;
  onOpenMyMaps?: (project: Project) => void;
}

export function RedNoSegmentModal({
  isOpen,
  onClose,
  items,
  categoryTitle = 'جميع المشاريع',
  onOpenMyMaps
}: RedNoSegmentModalProps) {
  const { t, language, isRtl, formatNumber, translateDynamic } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('all');
  const [copied, setCopied] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // State for inspecting a single feature details & map
  const [inspectFeature, setInspectFeature] = useState<FeatureDetailData | null>(null);

  // Extract unique projects and districts for filtering
  const projectOptions = useMemo(() => {
    const map = new Map<number, string>();
    items.forEach(it => {
      if (it.projectId && it.projectName) {
        map.set(it.projectId, it.projectName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [items]);

  const districtOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach(it => {
      if (it.district && it.district.trim() !== '' && it.district !== '-') {
        set.add(it.district.trim());
      }
    });
    return Array.from(set);
  }, [items]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Project filter
      if (selectedProject !== 'all' && String(item.projectId) !== selectedProject) {
        return false;
      }
      // District filter
      if (selectedDistrict !== 'all' && item.district !== selectedDistrict) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (item.name || '').toLowerCase().includes(q);
        const matchProj = (item.projectName || '').toLowerCase().includes(q);
        const matchPo = (item.po || '').toLowerCase().includes(q);
        const matchStreet = (item.streetName || '').toLowerCase().includes(q);
        const matchDistrict = (item.district || '').toLowerCase().includes(q);
        const matchContractor = (item.contractor || '').toLowerCase().includes(q);
        const matchDiameter = (item.innerDiameter || '').toLowerCase().includes(q);
        if (!matchName && !matchProj && !matchPo && !matchStreet && !matchDistrict && !matchContractor && !matchDiameter) {
          return false;
        }
      }
      return true;
    });
  }, [items, selectedProject, selectedDistrict, searchQuery]);

  // Aggregate KPI Statistics
  const totalLengthMeters = useMemo(() => {
    return filteredItems.reduce((acc, it) => acc + (it.lengthMeters || 0), 0);
  }, [filteredItems]);

  const totalLengthKm = useMemo(() => {
    return Number((totalLengthMeters / 1000).toFixed(3));
  }, [totalLengthMeters]);

  const uniqueProjectsCount = useMemo(() => {
    return new Set(filteredItems.map(it => it.projectId)).size;
  }, [filteredItems]);

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  if (!isOpen) return null;

  // Handle Export to Excel
  const handleExportExcel = () => {
    if (filteredItems.length === 0) return;

    const data = filteredItems.map((it, idx) => ({
      '#': idx + 1,
      'اسم المشروع': it.projectName,
      'أمر الشراء PO': it.po || '-',
      'اسم الخط / العنصر': it.name,
      'اللون': '#A52714 (أعمال متبقية)',
      'Segment ID': 'غير مسجل (فارغ / -)',
      'الطول (متر)': Math.round(it.lengthMeters),
      'الطول (كم)': it.lengthKm,
      'الشارع': it.streetName || '-',
      'الحي': it.district || '-',
      'القطر الداخلي': it.innerDiameter || '-',
      'المقاول': it.contractor || '-',
      'المنطقة': it.region || '-',
      'رابط خرائط جوجل': it.googleMapsUrl || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'قطاعات حمراء بدون Segment ID');
    XLSX.writeFile(wb, `تدقيق_القطاعات_الحمراء_بدون_سجمنت_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Copy summary report to clipboard
  const handleCopySummary = () => {
    const text = `🚨 تقرير تدقيق القطاعات باللون الأحمر (#a52714) بدون Segment ID:
- إجمالي العناصر المرصودة: ${filteredItems.length} عنصر
- إجمالي الأطوال: ${totalLengthKm.toLocaleString('ar-SA')} كم (${totalLengthMeters.toLocaleString('ar-SA')} متر)
- عدد المشاريع المتأثرة: ${uniqueProjectsCount} مشروع
تاريخ الفحص: ${new Date().toLocaleDateString('ar-SA')}`;

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-rose-200 dark:border-rose-900/60 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-rose-100 dark:border-rose-900/40 bg-gradient-to-r from-rose-50 via-red-50/50 to-white dark:from-rose-950/40 dark:via-red-950/20 dark:to-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-rose-600/10 dark:bg-rose-500/20 border border-rose-300 dark:border-rose-700/60 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-sm">
              <AlertOctagon className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  فحص القطاعات باللون الأحمر (#a52714) بدون Segment ID
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 border border-rose-300 dark:border-rose-700">
                  {items.length} عنصر
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                رصد الخطوط والعناصر باللون الأحمر المعتمد (#A52714) التي لا تحتوي على معرّف قطاع (Segment ID) أو تحتوي على فراغ / شرطة (-) فقط
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/40 text-slate-400 hover:text-rose-600 dark:hover:text-rose-300 transition-colors"
            title={t('common.close') || 'إغلاق'}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Top KPI Summary Cards */}
        <div className="p-6 pb-2 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
          <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-rose-200/80 dark:border-rose-900/40 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">عدد الخطوط الحمراء بدون سجمنت</div>
              <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-0.5">
                {filteredItems.length.toLocaleString('ar-SA')}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-rose-200/80 dark:border-rose-900/40 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950/50 flex items-center justify-center text-red-600 dark:text-red-400">
              <Ruler className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">إجمالي الأطوال المتأثرة</div>
              <div className="text-xl font-black text-red-600 dark:text-red-400 mt-0.5">
                {totalLengthKm.toLocaleString('ar-SA')} <span className="text-xs font-normal">كم</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">المشاريع المتأثرة</div>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                {uniqueProjectsCount.toLocaleString('ar-SA')}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">حالة الأعمال المستهدفة</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-full bg-[#a52714] inline-block border border-slate-300"></span>
                <span>خطوط متبقية (غير مرقمة)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Controls */}
        <div className="p-4 px-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            {/* Search Input */}
            <div className="relative min-w-[220px] flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="بحث باسم الخط، المشروع، الشارع، الحي، المقاول..."
                className="w-full pl-3 pr-9 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Project Filter */}
            {projectOptions.length > 1 && (
              <select
                value={selectedProject}
                onChange={e => { setSelectedProject(e.target.value); setCurrentPage(1); }}
                className="py-2 px-3 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-rose-500 max-w-[200px] truncate"
              >
                <option value="all">جميع المشاريع ({projectOptions.length})</option>
                {projectOptions.map(p => (
                  <option key={p.id} value={String(p.id)}>{p.name}</option>
                ))}
              </select>
            )}

            {/* District Filter */}
            {districtOptions.length > 0 && (
              <select
                value={selectedDistrict}
                onChange={e => { setSelectedDistrict(e.target.value); setCurrentPage(1); }}
                className="py-2 px-3 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-rose-500 max-w-[160px] truncate"
              >
                <option value="all">جميع الأحياء ({districtOptions.length})</option>
                {districtOptions.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}
          </div>

          {/* Export and Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySummary}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors border border-slate-200 dark:border-slate-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'تم النسخ' : 'نسخ التقرير'}
            </button>

            <button
              onClick={handleExportExcel}
              disabled={filteredItems.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-colors shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              تصدير إكسيل
            </button>
          </div>
        </div>

        {/* Main Data Table */}
        <div className="flex-1 overflow-auto p-4 px-6 min-h-[300px]">
          {filteredItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-16 text-center text-slate-400">
              <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                <Check className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                لا توجد قطاعات باللون الأحمر بدون Segment ID
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                كافة عناصر وخطوط الأعمال المتبقية (#a52714) تحتوي على أرقام Segment ID معتمدة ومطابقة للاشتراطات.
              </p>
            </div>
          ) : (
            <table className="w-full text-right text-xs border-separate border-spacing-y-1.5">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">المشروع</th>
                  <th className="py-2.5 px-3">اسم الخط / العنصر</th>
                  <th className="py-2.5 px-3">حالة Segment ID</th>
                  <th className="py-2.5 px-3">الطول</th>
                  <th className="py-2.5 px-3">الشارع / الحي</th>
                  <th className="py-2.5 px-3">القطر / المقاول</th>
                  <th className="py-2.5 px-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item, index) => {
                  const globalIdx = (currentPage - 1) * pageSize + index + 1;
                  return (
                    <tr 
                      key={item.id || `${item.projectId}_${index}`}
                      className="bg-white dark:bg-slate-800/80 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 border border-slate-200 dark:border-slate-700/60 rounded-xl transition-all shadow-2xs group"
                    >
                      {/* Index */}
                      <td className="py-3 px-3 font-semibold text-slate-400 rounded-r-xl">
                        {globalIdx}
                      </td>

                      {/* Project */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-white max-w-[200px] truncate" title={item.projectName}>
                          {item.projectName}
                        </div>
                        {item.po && (
                          <div className="text-[11px] text-slate-400 font-mono">
                            PO: {item.po}
                          </div>
                        )}
                      </td>

                      {/* Line Name */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#a52714] shrink-0"></span>
                          <span className="max-w-[180px] truncate" title={item.name}>{item.name || 'بدون اسم'}</span>
                        </div>
                      </td>

                      {/* Segment ID Status Badge */}
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          <AlertOctagon className="w-3 h-3 text-rose-600" />
                          غير مسجل (فارغ / -)
                        </span>
                      </td>

                      {/* Length */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {Math.round(item.lengthMeters).toLocaleString('ar-SA')} م
                        </div>
                        <div className="text-[10px] text-slate-400">
                          ({item.lengthKm} كم)
                        </div>
                      </td>

                      {/* Street / District */}
                      <td className="py-3 px-3">
                        <div className="text-slate-700 dark:text-slate-300 truncate max-w-[140px]" title={item.streetName}>
                          {item.streetName || '-'}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[140px]" title={item.district}>
                          {item.district || '-'}
                        </div>
                      </td>

                      {/* Diameter / Contractor */}
                      <td className="py-3 px-3">
                        <div className="text-slate-700 dark:text-slate-300 text-[11px]">
                          {item.innerDiameter ? `قطر: ${item.innerDiameter}` : '-'}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[120px]" title={item.contractor}>
                          {item.contractor || '-'}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-center rounded-l-xl">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Inspect feature on map */}
                          <button
                            onClick={() => {
                              if (item.featureItem) {
                                setInspectFeature({
                                  item: item.featureItem,
                                  projectName: item.projectName,
                                  projectScope: item.scope
                                });
                              } else {
                                const syntheticItem: KMLFeatureItem = {
                                  id: item.id,
                                  name: item.name,
                                  segmentId: '',
                                  permitNo: item.permitNo || '',
                                  colorHex: '#a52714',
                                  statusCategory: 'remaining',
                                  statusLabel: 'أعمال متبقية',
                                  lengthMeters: item.lengthMeters,
                                  lengthKm: item.lengthKm,
                                  coordinatesCount: item.coordinates ? item.coordinates.length : 0,
                                  streetName: item.streetName,
                                  district: item.district,
                                  innerDiameter: item.innerDiameter,
                                  contractor: item.contractor,
                                  centerLat: item.centerLat,
                                  centerLng: item.centerLng,
                                  googleMapsUrl: item.googleMapsUrl,
                                  coordinates: item.coordinates
                                };
                                setInspectFeature({
                                  item: syntheticItem,
                                  projectName: item.projectName,
                                  projectScope: item.scope
                                });
                              }
                            }}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900 text-rose-600 dark:text-rose-400 transition-colors border border-rose-200 dark:border-rose-800"
                            title="معاينة تفاصيل وموقع الخط"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                          </button>

                          {/* Google Maps link */}
                          {item.googleMapsUrl && (
                            <a
                              href={item.googleMapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 transition-colors"
                              title="فتح في خرائط جوجل"
                            >
                              <Globe className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer & Pagination */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex items-center justify-between text-xs">
          <div className="text-slate-500 dark:text-slate-400">
            عرض {paginatedItems.length} من أصل {filteredItems.length} عنصر
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                {isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>

              <span className="px-3 py-1 font-bold text-slate-700 dark:text-slate-200">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                {isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            className="px-4 py-2 font-semibold rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>

      {/* Feature Details Modal (For Map & Coordinates inspection) */}
      {inspectFeature && (
        <FeatureDetailsModal
          isOpen={!!inspectFeature}
          onClose={() => setInspectFeature(null)}
          data={inspectFeature}
        />
      )}
    </div>
  );
}
