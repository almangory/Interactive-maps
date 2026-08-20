/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { KMLAnalysisResult, StatusCategory } from '../types';
import { COLOR_CONFIG, getStatusCategoryLabel } from '../utils/myMapsKmlParser';
import { exportAnalysisToPDF } from '../utils/pdfExport';
import { useLanguage } from '../utils/i18n';
import { Key, Sparkles, ChevronDown, ChevronUp, Layers, Ruler, RefreshCw, Download } from 'lucide-react';

interface MapLegendProps {
  analysisResult?: KMLAnalysisResult | null;
  projectName?: string;
  onRunAnalysis?: () => void;
  isLoading?: boolean;
  className?: string;
  isCollapsible?: boolean;
  defaultExpanded?: boolean;
  compact?: boolean;
}

export const MapLegend: React.FC<MapLegendProps> = ({
  analysisResult,
  projectName,
  onRunAnalysis,
  isLoading = false,
  className = '',
  isCollapsible = true,
  defaultExpanded = true,
  compact = false
}) => {
  const { t, isRtl, formatNumber, translateDynamic, language } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPDF = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!analysisResult) return;
    setIsExporting(true);
    try {
      await exportAnalysisToPDF(analysisResult, projectName);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  const categories: StatusCategory[] = ['executed_water', 'executed_sewage', 'ongoing', 'remaining', 'cancelled'];

  const totalKm = analysisResult?.totalLengthKm || 0;
  const totalMeters = analysisResult?.totalLengthMeters || 0;
  const totalFeatures = analysisResult?.totalFeaturesCount || 0;

  return (
    <div
      className={`bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl transition-all duration-200 ${isRtl ? 'text-right' : 'text-left'} font-sans ${className}`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Header bar */}
      <div
        className={`flex items-center justify-between p-3.5 ${
          isCollapsible ? 'cursor-pointer select-none hover:bg-slate-50/80 dark:hover:bg-slate-800/50' : ''
        } rounded-t-2xl border-b border-slate-100 dark:border-slate-800/80`}
        onClick={() => isCollapsible && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-xl shadow-xs shrink-0">
            <Key className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5 truncate">
              <span>{t('legend.title', 'مفاتيح الخريطة وحصر الأطوال')}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800 shrink-0">
                @turf/length
              </span>
            </h4>
            {projectName && (
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {projectName}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {analysisResult && (
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={isExporting}
              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-black text-[10px] shadow-xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 active:scale-95"
              title={t('legend.pdfReport', 'تصدير تقرير PDF')}
            >
              {isExporting ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <Download className="h-3 w-3" />
              )}
              <span>{t('legend.pdfReport', 'تقرير PDF')}</span>
            </button>
          )}

          {onRunAnalysis && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRunAnalysis();
              }}
              disabled={isLoading}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-black text-[10px] shadow-xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 text-amber-200" />
              )}
              <span>{analysisResult ? t('legend.reAnalyze', 'إعادة التحليل') : t('legend.runAnalysis', 'تشغيل التحليل')}</span>
            </button>
          )}

          {isCollapsible && (
            <button
              type="button"
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-3.5 space-y-3">
          {/* Active Analysis Total Badge */}
          {analysisResult ? (
            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Ruler className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="font-extrabold text-slate-700 dark:text-slate-300">{t('legend.totalNetwork', 'إجمالي شبكة الخطوط (LineString):')}</span>
              </div>
              <div className="font-mono font-black text-slate-900 dark:text-slate-100">
                <span className="text-blue-600 dark:text-blue-400 text-sm">{formatNumber(totalKm)} {t('dash.km', 'كم')}</span>
                <span className="text-[10px] text-slate-500 mx-1.5">({formatNumber(totalMeters)} {t('dash.m', 'م')})</span>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300 text-center space-y-2">
              <p className="font-bold">{t('legend.runAnalysisPrompt', 'انقر على زر "تشغيل التحليل" لحساب الأطوال الحقيقية لخطوط الخريطة.')}</p>
              {onRunAnalysis && (
                <button
                  type="button"
                  onClick={onRunAnalysis}
                  disabled={isLoading}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-xs shadow-md transition-all inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-200" />
                  <span>{t('legend.startAnalysisNow', 'بدء التحليل الآن 📊')}</span>
                </button>
              )}
            </div>
          )}

          {/* Categories Grid */}
          <div className={`grid ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5'} gap-2`}>
            {categories.map((cat) => {
              const cfg = COLOR_CONFIG[cat];
              const stats = analysisResult?.colorBreakdown?.[cat];
              const categoryLabel = getStatusCategoryLabel(cat, projectName, analysisResult?.projectScope, language);

              return (
                <div
                  key={cat}
                  className="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/80 transition-all relative overflow-hidden flex flex-col justify-between"
                >
                  {/* Left/Right color vertical stripe indicator */}
                  <div
                    className={`w-1.5 h-full absolute ${isRtl ? 'right-0 rounded-r-md' : 'left-0 rounded-l-md'} top-0`}
                    style={{ backgroundColor: cfg.hex }}
                  ></div>

                  <div className={`${isRtl ? 'pr-2' : 'pl-2'} space-y-1`}>
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-3 h-3 rounded-full border border-black/10 shrink-0 inline-block shadow-2xs"
                          style={{ backgroundColor: cfg.hex }}
                        ></span>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                          {categoryLabel}
                        </span>
                      </div>
                      {stats && (
                        <span className="text-[10px] font-mono font-black text-slate-500 dark:text-slate-400">
                          %{formatNumber(stats.percentage)}
                        </span>
                      )}
                    </div>

                    {stats ? (
                      <div className="pt-1 border-t border-slate-200/60 dark:border-slate-700/60 space-y-0.5">
                        <div className="text-sm font-black text-slate-900 dark:text-slate-100 font-mono">
                          {formatNumber(stats.totalLengthKm)} <span className="text-[10px] font-sans text-slate-500">{t('dash.km', 'كم')}</span>
                        </div>
                        <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                          <span>{formatNumber(stats.totalLengthMeters)} {t('dash.meters', 'متر')}</span>
                          <span>({formatNumber(stats.segmentCount)} {t('legend.lines', 'خط')})</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 font-mono font-bold pt-1">
                        {t('legend.colorCode', 'كود اللون:')} {cfg.hex}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Technical Note */}
          <div className="text-[9.5px] font-bold text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span>{t('legend.techNote', '• يتم حساب الأطوال حصرياً لعناصر الخطوط (LineString) واستبعاد المضلعات والنقاط.')}</span>
            <span>{t('legend.accuracy', 'طول الدقة:')} @turf/length</span>
          </div>
        </div>
      )}
    </div>
  );
};
