/**
 * @license
 * Platform Segments Excel Import & Sync Modal
 * Allows uploading Segment ID.xlsx from the National Infrastructure Platform
 * and syncing it directly to the Neon PostgreSQL database.
 */

import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  Database, 
  Layers, 
  Sparkles, 
  RefreshCw,
  Search,
  Building2,
  FileCheck
} from 'lucide-react';
import { PlatformSegment } from '../types';
import { 
  parsePlatformSegmentsFromExcel, 
  savePlatformSegmentsBulk,
  isSegmentStatusCancelled,
  isSegmentStatusInitiallyClosed
} from '../utils/platformSegmentsService';

interface PlatformSegmentsImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  isRtl?: boolean;
}

export function PlatformSegmentsImportModal({ isOpen, onClose, onSuccess, isRtl = true }: PlatformSegmentsImportModalProps) {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [parsedSegments, setParsedSegments] = useState<PlatformSegment[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [searchPreview, setSearchPreview] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileProcess = async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
      setStatusMessage({ type: 'error', text: 'يرجى اختيار ملف إكسل بصيغة .xlsx أو .xls' });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);
    setFileName(file.name);
    setFileSize((file.size / 1024).toFixed(1) + ' KB');

    try {
      const buffer = await file.arrayBuffer();
      const segments = parsePlatformSegmentsFromExcel(buffer);

      if (segments.length === 0) {
        setStatusMessage({ type: 'error', text: 'لم يتم العثور على أي قطاعات صالحة في ملف الإكسل. يرجى التأكد من وجود عمود segment_map_id أو رقم القطاع.' });
        setParsedSegments([]);
      } else {
        setParsedSegments(segments);
        setStatusMessage({ 
          type: 'info', 
          text: `تمت قراءة وتحليل ${segments.length.toLocaleString('ar-SA')} قطاعاً بنجاح! راجع المعاينة ثم اضغط على حفظ للتخزين في السحابة.` 
        });
      }
    } catch (err: any) {
      console.error('Failed to parse Excel file:', err);
      setStatusMessage({ type: 'error', text: `فشل قراءة ملف الإكسل: ${err.message || 'خطأ غير معروف'}` });
      setParsedSegments([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileProcess(e.target.files[0]);
    }
  };

  const handleSaveToDatabase = async () => {
    if (parsedSegments.length === 0) return;

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const result = await savePlatformSegmentsBulk(parsedSegments);
      setStatusMessage({ 
        type: 'success', 
        text: `🎉 تم حفظ وتحديث ${result.count.toLocaleString('ar-SA')} قطاعاً في قاعدة البيانات السحابية (Neon) بنجاح!` 
      });
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }
    } catch (err: any) {
      console.error('Failed to save segments to database:', err);
      setStatusMessage({ 
        type: 'error', 
        text: `حدث خطأ أثناء الحفظ في قاعدة البيانات: ${err.message || 'خطأ اتصال'}` 
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Grouping statistics for preview
  const uniquePOs = Array.from(new Set(parsedSegments.map(s => s.poNumber).filter(Boolean)));
  const uniqueProjects = Array.from(new Set(parsedSegments.map(s => s.projectName).filter(Boolean)));
  const cancelledCount = parsedSegments.filter(s => isSegmentStatusCancelled(s.segmentStatus)).length;
  const closedCount = parsedSegments.filter(s => isSegmentStatusInitiallyClosed(s.segmentStatus)).length;
  const activeCount = parsedSegments.length - cancelledCount - closedCount;

  // Filter preview rows
  const filteredPreview = parsedSegments.filter(s => {
    if (!searchPreview) return true;
    const q = searchPreview.toLowerCase();
    return (
      s.segmentMapId.toLowerCase().includes(q) ||
      s.poNumber.toLowerCase().includes(q) ||
      s.projectName.toLowerCase().includes(q) ||
      (s.streets || '').toLowerCase().includes(q) ||
      (s.neighborhoods || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-3xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-slate-800/40 dark:to-slate-800/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-xl shadow-xs">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>استيراد وتحديث قطاعات منصة البنية التحتية</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  Segment ID Excel
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                ارفع ملف الإكسل المعتمد من منصة البنية التحتية لمطابقة الخرائط التفاعلية تلقائياً.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          
          {/* Drag & Drop Upload Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 scale-[0.99]'
                : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600 bg-slate-50/50 dark:bg-slate-800/30'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-2xl shadow-3xs">
                {isLoading ? (
                  <RefreshCw className="h-7 w-7 animate-spin text-blue-600" />
                ) : (
                  <Upload className="h-7 w-7" />
                )}
              </div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {fileName ? `الملف المحدد: ${fileName} (${fileSize})` : 'اسحب وأفلت ملف Segment ID.xlsx هنا أو انقر للاختيار'}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 max-w-md">
                يدعم ملفات الإكسل الرسمية الصادرة من منصة البنية التحتية بجميع الأعمدة (segment_map_id، رقم أمر الشراء، الطول، الشارع، الحي، وحالة القطاع).
              </p>
            </div>
          </div>

          {/* Status Alert Banner */}
          {statusMessage && (
            <div className={`p-3.5 rounded-xl border text-xs font-bold flex items-start gap-2.5 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : statusMessage.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'
            }`}>
              {statusMessage.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />}
              {statusMessage.type === 'error' && <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />}
              {statusMessage.type === 'info' && <FileCheck className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />}
              <span className="leading-relaxed">{statusMessage.text}</span>
            </div>
          )}

          {/* Parsed Data Summary Cards */}
          {parsedSegments.length > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-semibold">إجمالي القطاعات:</span>
                  <span className="text-base font-black text-slate-900 dark:text-white font-mono">{parsedSegments.length.toLocaleString('ar-SA')}</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-semibold">المشاريع المشمولة:</span>
                  <span className="text-base font-black text-blue-600 dark:text-blue-400 font-mono">{uniquePOs.length || uniqueProjects.length} مشروع</span>
                </div>
                <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/60 dark:border-emerald-900/40">
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block font-semibold">معتمدة / نشطة:</span>
                  <span className="text-base font-black text-emerald-700 dark:text-emerald-300 font-mono">{activeCount.toLocaleString('ar-SA')}</span>
                </div>
                <div className="p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-200/60 dark:border-blue-900/40">
                  <span className="text-[11px] text-blue-600 dark:text-blue-400 block font-semibold">مغلقة أولياً (مستثناة):</span>
                  <span className="text-base font-black text-blue-700 dark:text-blue-300 font-mono">{closedCount.toLocaleString('ar-SA')}</span>
                </div>
                <div className="p-3 bg-rose-50/50 dark:bg-rose-950/30 rounded-xl border border-rose-200/60 dark:border-rose-900/40">
                  <span className="text-[11px] text-rose-600 dark:text-rose-400 block font-semibold">ملغاة بالمنصة:</span>
                  <span className="text-base font-black text-rose-700 dark:text-rose-300 font-mono">{cancelledCount.toLocaleString('ar-SA')}</span>
                </div>
              </div>

              {/* Data Table Preview */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    معاينة عينة من القطاعات المرصودة ({filteredPreview.length} نتيجة):
                  </span>
                  <div className="relative w-48 sm:w-64">
                    <Search className={`absolute ${isRtl ? 'right-2.5' : 'left-2.5'} top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400`} />
                    <input
                      type="text"
                      placeholder="بحث في المعاينة..."
                      value={searchPreview}
                      onChange={e => setSearchPreview(e.target.value)}
                      className={`w-full text-xs py-1.5 ${isRtl ? 'pr-8 pl-2 text-right' : 'pl-8 pr-2 text-left'} bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200`}
                    />
                  </div>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs max-h-56 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold sticky top-0 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-2.5">رقم القطاع (Segment ID)</th>
                        <th className="p-2.5">أمر الشراء (PO)</th>
                        <th className="p-2.5">اسم المشروع</th>
                        <th className="p-2.5">الطول (م)</th>
                        <th className="p-2.5">الحالة</th>
                        <th className="p-2.5">الشارع / الحي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 font-mono">
                      {filteredPreview.slice(0, 30).map((seg, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="p-2.5 font-bold text-slate-900 dark:text-slate-100 text-[11px] truncate max-w-[180px]" title={seg.segmentMapId}>
                            {seg.segmentMapId}
                          </td>
                          <td className="p-2.5 text-blue-600 dark:text-blue-400 font-bold">{seg.poNumber || '-'}</td>
                          <td className="p-2.5 font-sans text-slate-700 dark:text-slate-300 text-[11px] truncate max-w-[160px]" title={seg.projectName}>
                            {seg.projectName || '-'}
                          </td>
                          <td className="p-2.5 text-slate-800 dark:text-slate-200 font-bold">{seg.segmentLength} م</td>
                          <td className="p-2.5 font-sans">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              seg.segmentStatus.includes('ملغي') || seg.segmentStatus.includes('إلغاء')
                                ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300'
                                : 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                            }`}>
                              {seg.segmentStatus}
                            </span>
                          </td>
                          <td className="p-2.5 font-sans text-slate-500 dark:text-slate-400 text-[10px] truncate max-w-[140px]" title={`${seg.streets} - ${seg.neighborhoods}`}>
                            {seg.streets || seg.neighborhoods || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Database className="h-4 w-4 text-amber-500" />
            <span>قاعدة البيانات المتزامنة: <strong>Neon PostgreSQL</strong></span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              إغلاق
            </button>
            <button
              type="button"
              disabled={parsedSegments.length === 0 || isSaving}
              onClick={handleSaveToDatabase}
              className={`px-5 py-2 rounded-xl text-xs font-extrabold text-white flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
                parsedSegments.length === 0 || isSaving
                  ? 'bg-slate-400 opacity-60 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/25 active:scale-95'
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>جاري الحفظ في السحابة...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>تأكيد وحفظ في السحابة ({parsedSegments.length.toLocaleString('ar-SA')} قطاع) ☁️</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
