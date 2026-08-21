/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Project, User, ProjectDiffResult } from '../types';
import { Search, MapPin, SlidersHorizontal, Droplet, Waves, RefreshCw, AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Eye, Globe, List, LayoutGrid, Star, Pencil, MessageCircle, Phone, Zap, FileSpreadsheet, Sparkles } from 'lucide-react';
import { getProjectCoordinates } from './ProjectMapViewer';
import { getEmbeddableMapUrl } from '../data/initialProjects';
import { VoiceSearchButton } from './VoiceSearchButton';
import { getWhatsAppLink, WhatsAppIcon } from '../utils/whatsapp';
import { useLanguage } from '../utils/i18n';
import { ExecutiveChangesSummaryModal } from './ExecutiveChangesSummaryModal';

interface ProjectListProps {
  projects: Project[]; // All authenticated visible projects
  filteredProjects: Project[]; // Precomputed filtered projects based on active filter choices
  selectedProject: Project | null;
  onSelectProject: (project: Project) => void;
  onGoToMap?: (project: Project) => void;
  currentUser: User;
  onToggleFavorite?: (projectId: number) => void;
  onEditProject?: (project: Project) => void;
  onTriggerQuickAnalysis?: (project: Project) => Promise<void> | void;
  onOpenProjectDiff?: (diff: ProjectDiffResult, project: Project) => void;

  searchTerm: string;
  setSearchTerm: (val: string) => void;
  selectedSubProgram: string;
  setSelectedSubProgram: (val: string) => void;
  selectedClassification: string;
  setSelectedClassification: (val: string) => void;
  selectedStatus: string;
  setSelectedStatus: (val: string) => void;
  showFilters: boolean;
  setShowFilters: (val: boolean) => void;
  showOnlyFavorites: boolean;
  setShowOnlyFavorites: (val: boolean) => void;
}

const ITEMS_PER_PAGE = 12;

const getStatusBadgeClass = (status: string) => {
  const norm = (status || '').trim();
  if (norm === 'مكتمل' || norm.includes('كامل') || norm.includes('مسلم') || norm.includes('الاستلام')) {
    return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
  }
  if (norm === 'قيد التنفيذ' || (norm.includes('جاري') && !norm.includes('الاستلام')) || norm === 'نشط' || norm === 'مشروع مستأنف') {
    return 'bg-blue-50 text-blue-700 border border-blue-100';
  }
  if (norm === 'متوقف كليا') {
    return 'bg-rose-50 text-rose-700 border border-rose-100 font-bold';
  }
  if (norm === 'متوقف جزئيا') {
    return 'bg-amber-50 text-amber-700 border border-amber-150 font-semibold';
  }
  if (norm === 'معلق' || norm === 'متوقف') {
    return 'bg-slate-100 text-slate-600 border border-slate-200';
  }
  if (norm.includes('مسحوب') || norm === 'ملغي') {
    return 'bg-rose-100/50 text-rose-700 border border-rose-200';
  }
  return 'bg-indigo-50 text-indigo-700 border border-indigo-100';
};

export function ProjectList({
  projects,
  filteredProjects,
  selectedProject,
  onSelectProject,
  onGoToMap,
  currentUser,
  onToggleFavorite,
  onEditProject,
  searchTerm,
  setSearchTerm,
  selectedSubProgram,
  setSelectedSubProgram,
  selectedClassification,
  setSelectedClassification,
  selectedStatus,
  setSelectedStatus,
  showFilters,
  setShowFilters,
  showOnlyFavorites,
  setShowOnlyFavorites
}: ProjectListProps) {
  const { t, language, translateDynamic, isRtl } = useLanguage();
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'compact' | 'cards'>('compact');
  // Track which project has its inline My Maps viewer toggled on inside the list view
  const [showListInlineMapId, setShowListInlineMapId] = useState<number | null>(null);
  const [isExecutiveSummaryOpen, setIsExecutiveSummaryOpen] = useState(false);
  const [quickAnalyzingId, setQuickAnalyzingId] = useState<number | null>(null);

  // Filter lists derived dynamically from active accessible projects
  const uniqueSubPrograms = useMemo(() => {
    const list = new Set(projects.map(p => p.subProgram).filter(Boolean));
    return ['الكل', ...Array.from(list)];
  }, [projects]);

  const uniqueClassifications = useMemo(() => {
    const list = new Set(projects.map(p => p.classification).filter(Boolean));
    return ['الكل', ...Array.from(list)];
  }, [projects]);

  const uniqueStatuses = useMemo(() => {
    const list = new Set(projects.map(p => p.status).filter(Boolean));
    return ['الكل', ...Array.from(list)];
  }, [projects]);

  // Reset page to 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedSubProgram, selectedClassification, selectedStatus, showOnlyFavorites]);

  // Paginated views
  const totalPages = Math.ceil(filteredProjects.length / ITEMS_PER_PAGE);
  const paginatedProjects = useMemo(() => {
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProjects.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  }, [filteredProjects, currentPage]);

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Toggle Bar */}
      {currentUser.canFilter !== false ? (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs space-y-3 transition-colors">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className={`absolute ${isRtl ? 'right-3' : 'left-3'} top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500`} />
              <input
                type="text"
                placeholder={t('list.searchPlaceholder')}
                className={`w-full text-xs ${isRtl ? 'pr-10 pl-10 text-right' : 'pl-10 pr-10 text-left'} py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500`}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <div className={`absolute ${isRtl ? 'left-1.5' : 'right-1.5'} top-1/2 -translate-y-1/2 flex items-center`}>
                <VoiceSearchButton
                  size="sm"
                  onSpeechResult={(text) => setSearchTerm(text)}
                  placeholderHint={t('list.voiceSearchPrompt')}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsExecutiveSummaryOpen(true)}
              className="flex items-center gap-1.5 px-3.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-indigo-950/60 border-blue-200 dark:border-indigo-800 text-blue-800 dark:text-blue-300 hover:from-blue-100 hover:to-indigo-100 shadow-3xs"
              title="عرض تقرير التغيرات المجمع لجميع المشاريع وتصدير Excel"
            >
              <FileSpreadsheet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="hidden md:inline">تقرير التغيرات الأسبوعي 📑</span>
            </button>
            <button
              type="button"
              onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
              className={`flex items-center gap-1.5 px-3.5 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                showOnlyFavorites
                  ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 shadow-3xs'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
              title={t('list.favoritesOnlyTooltip')}
            >
              <Star className={`h-4 w-4 ${showOnlyFavorites ? 'fill-amber-500 text-amber-500' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">{t('list.favoritesOnly')}</span>
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3.5 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                showFilters || selectedSubProgram !== 'الكل' || selectedClassification !== 'الكل' || selectedStatus !== 'الكل' || showOnlyFavorites
                  ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">{t('list.filterTools')}</span>
            </button>
          </div>

          {/* Expandable Advanced Filters */}
          {(showFilters || selectedSubProgram !== 'الكل' || selectedClassification !== 'الكل' || selectedStatus !== 'الكل') && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              {/* SubProgram select */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">{t('list.subProgramLabel')}</label>
                <select
                  className="w-full text-xs p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={selectedSubProgram}
                  onChange={e => setSelectedSubProgram(e.target.value)}
                >
                  {uniqueSubPrograms.map(sp => (
                    <option key={sp} value={sp} className="bg-white dark:bg-slate-800">
                      {sp === 'الكل' ? t('list.all') : translateDynamic(sp)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Classification select */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">{t('list.classificationLabel')}</label>
                <select
                  className="w-full text-xs p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={selectedClassification}
                  onChange={e => setSelectedClassification(e.target.value)}
                >
                  {uniqueClassifications.map(c => (
                    <option key={c} value={c} className="bg-white dark:bg-slate-800">
                      {c === 'الكل' ? t('list.all') : translateDynamic(c)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status select */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">{t('list.statusLabel')}</label>
                <select
                  className="w-full text-xs p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value)}
                >
                  {uniqueStatuses.map(s => (
                    <option key={s} value={s} className="bg-white dark:bg-slate-800">
                      {s === 'الكل' ? t('list.all') : translateDynamic(s)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Filtering status indicator */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 pt-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span>
                {isRtl ? (
                  <>تم العثور على <span className="font-bold text-blue-600 dark:text-blue-400">{filteredProjects.length}</span> من أصل <span className="font-semibold text-slate-800 dark:text-slate-200">{projects.length}</span></>
                ) : (
                  <>Found <span className="font-bold text-blue-600 dark:text-blue-400">{filteredProjects.length}</span> of <span className="font-semibold text-slate-800 dark:text-slate-200">{projects.length}</span></>
                )}
              </span>
              
              {/* High fidelity mode toggle */}
              <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 select-none shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('compact')}
                  className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                    viewMode === 'compact'
                      ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-3xs border border-slate-200/40 dark:border-slate-600'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title={t('list.compactTooltip')}
                >
                  <List className="h-3 w-3" />
                  <span>{t('list.compact')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                    viewMode === 'cards'
                      ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-3xs border border-slate-200/40 dark:border-slate-600'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title={t('list.cardsTooltip')}
                >
                  <LayoutGrid className="h-3 w-3" />
                  <span>{t('list.cards')}</span>
                </button>
              </div>
            </div>
            {(selectedSubProgram !== 'الكل' || selectedClassification !== 'الكل' || selectedStatus !== 'الكل' || searchTerm || showOnlyFavorites) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedSubProgram('الكل');
                  setSelectedClassification('الكل');
                  setSelectedStatus('الكل');
                  setShowOnlyFavorites(false);
                }}
                className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 font-bold hover:underline cursor-pointer"
              >
                {t('list.clearFilters')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[#FFFBEB] dark:bg-amber-950/40 border border-[#FDE68A] dark:border-amber-800 p-4 rounded-2xl text-[#92400E] dark:text-amber-300 text-xs font-extrabold text-center shadow-xs flex items-center justify-center gap-1.5" id="filters-locked-alert">
          <span>{t('list.filtersLocked')}</span>
        </div>
      )}

      {/* Projects Grid List */}
      <div className={viewMode === 'compact' ? 'flex flex-col gap-2' : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4'}>
        {paginatedProjects.map(p => {
          const isSelected = selectedProject?.id === p.id;
          const isWater = (p.scope || '').includes('مياه');
          const isAdmin = currentUser?.role === 'admin';
          const canOpenExternalLinks = currentUser?.canOpenExternalLinks !== false;
          
          if (viewMode === 'compact') {
            return (
              <div
                key={p.id}
                onClick={() => onSelectProject(p)}
                className={`bg-white dark:bg-slate-900 rounded-xl border p-3.5 cursor-pointer transition-all duration-200 hover:shadow-xs relative overflow-hidden flex flex-col gap-3 w-full ${
                  isSelected 
                    ? 'border-blue-500 dark:border-blue-500 ring-4 ring-blue-500/10 dark:ring-blue-500/20 bg-blue-50/10 dark:bg-blue-950/30' 
                    : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {/* Decorative color side-strip */}
                <div className={`absolute top-0 bottom-0 ${isRtl ? 'right-0' : 'left-0'} w-1 ${
                  isWater ? 'bg-cyan-500' : 'bg-emerald-500'
                }`} />

                {/* Main Content Area */}
                <div className={`${isRtl ? 'pr-2.5 text-right' : 'pl-2.5 text-left'} w-full space-y-2`}>
                  {/* Top Badges Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-extrabold font-mono text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-900">
                        {t('list.opNo')}: {p.operationalNumber}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold whitespace-nowrap ${
                        isWater ? 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 border border-cyan-100 dark:border-cyan-900' : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900'
                      }`}>
                        {translateDynamic(p.scope)} • {translateDynamic(p.classification)}
                      </span>
                      <span className="text-[10.5px] text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500" />
                        {translateDynamic(p.region)}
                      </span>
                    </div>

                    <span className={`text-[10px] px-2.5 py-0.5 rounded-md font-extrabold whitespace-nowrap ${getStatusBadgeClass(p.status)}`}>
                      {translateDynamic(p.status)}
                    </span>
                  </div>

                  {/* Title & Favorite */}
                  <div className="flex items-start justify-between gap-2">
                    <h5 className={`font-extrabold text-slate-800 dark:text-slate-100 text-xs sm:text-sm leading-normal flex-1 ${isRtl ? 'text-right' : 'text-left'}`} title={p.name}>
                      {p.name}
                    </h5>
                    {onToggleFavorite && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(p.id);
                        }}
                        className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-amber-500 transition-all hover:scale-115 active:scale-90 shrink-0 cursor-pointer"
                        title={p.isFavorite ? t('list.removeFromFavorites') : t('list.addToFavorites')}
                      >
                        <Star className={`h-4 w-4 ${p.isFavorite ? 'fill-amber-400 text-amber-500' : 'text-slate-300 dark:text-slate-600'}`} />
                      </button>
                    )}
                  </div>

                  {/* Expanded additional project details */}
                  {isSelected && (
                    <div className="text-xs text-slate-600 dark:text-slate-300 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 p-3 rounded-xl animate-in fade-in duration-200">
                      <div><strong className="text-slate-400 dark:text-slate-400 font-bold">{t('list.contractor')}:</strong> <span className="text-slate-800 dark:text-slate-200 font-bold">{p.contractor || t('common.unknown')}</span></div>
                      <div><strong className="text-slate-400 dark:text-slate-400 font-bold">{t('list.consultant')}:</strong> <span className="text-slate-800 dark:text-slate-200 font-bold">{p.consultant || t('list.yardaOffice')}</span></div>
                      <div><strong className="text-slate-400 dark:text-slate-400 font-bold">{t('list.po')}:</strong> <span className="text-slate-800 dark:text-slate-200 font-mono font-bold">{p.po || '-'}</span></div>
                      <div><strong className="text-slate-400 dark:text-slate-400 font-bold">{t('list.unifier')}:</strong> <span className="text-slate-800 dark:text-slate-200 font-mono font-bold">{p.unifierNo || '-'}</span></div>
                      <div><strong className="text-slate-400 dark:text-slate-400 font-bold">{t('list.surveyor')}:</strong> <span className="text-slate-800 dark:text-slate-200 font-bold">{p.surveyorName || t('common.unknown')}</span></div>
                      
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="text-slate-400 dark:text-slate-400 font-bold">{t('list.surveyorWhatsapp')}:</strong>
                        {p.surveyorPhone ? (
                          canOpenExternalLinks ? (
                            <a
                              href={getWhatsAppLink(p.surveyorPhone, p.name, p.operationalNumber)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 text-white font-mono font-extrabold bg-[#25D366] hover:bg-[#20bd5a] px-2.5 py-1 rounded-md transition-all shadow-2xs hover:scale-105 active:scale-95 text-xs"
                              title={`WhatsApp: ${p.surveyorPhone}`}
                            >
                              <WhatsAppIcon className="h-4 w-4 text-white fill-white shrink-0" />
                              <span dir="ltr">{p.surveyorPhone}</span>
                            </a>
                          ) : (
                            <span dir="ltr" className="font-mono text-slate-700 dark:text-slate-300 font-bold text-xs">{p.surveyorPhone}</span>
                          )
                        ) : (
                          <div className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            <WhatsAppIcon className="h-4 w-4 text-[#25D366] shrink-0" />
                            <span className="font-semibold text-slate-500 dark:text-slate-400 text-xs">{t('common.unknown')}</span>
                            {onEditProject && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditProject(p);
                                }}
                                className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded cursor-pointer transition-colors"
                                title={t('list.addPhone')}
                              >
                                + {t('list.addPhone')}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="col-span-full pt-2 mt-1 border-t border-dashed border-slate-200 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-slate-400 font-bold text-xs">{t('list.mapTools')}</strong>
                          {p.mapUrl && canOpenExternalLinks && (
                            <a
                              href={p.mapUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-md hover:bg-blue-100 transition-colors text-xs font-bold"
                            >
                              <Globe className="h-3 w-3 text-blue-600" />
                              <span>{t('list.openNavigation')}</span>
                            </a>
                          )}

                          {p.mapUrl && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowListInlineMapId(showListInlineMapId === p.id ? null : p.id);
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border transition-all text-xs font-bold cursor-pointer ${
                                showListInlineMapId === p.id
                                  ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                              }`}
                            >
                              <Globe className={`h-3 w-3 ${showListInlineMapId === p.id ? 'text-white' : 'text-emerald-600 animate-pulse'}`} />
                              <span>{showListInlineMapId === p.id ? t('list.hidePreview') : t('list.previewMap')}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {showListInlineMapId === p.id && p.mapUrl && (
                        <div className="col-span-full mt-2 rounded-xl overflow-hidden border border-slate-200 shadow-xs bg-white animate-in zoom-in-95 duration-200">
                          <div className="bg-slate-800 text-slate-200 px-3 py-1.5 flex items-center justify-between text-xs font-bold">
                            <span className="flex items-center gap-1.5">
                              <Globe className="h-3.5 w-3.5 text-blue-400" />
                              <span>{t('list.googleMyMapsTitle')}</span>
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowListInlineMapId(null);
                              }}
                              className="text-slate-400 hover:text-white cursor-pointer font-bold"
                            >
                              {t('common.close')} ✕
                            </button>
                          </div>
                          <div className="h-72 w-full bg-slate-50 relative overflow-hidden">
                            <iframe
                              src={getEmbeddableMapUrl(p.mapUrl)}
                              className="absolute left-0 w-full border-0 z-0"
                              style={{
                                top: '-56px',
                                height: 'calc(100% + 56px + 40px)'
                              }}
                              title={`Google My Maps list preview ${p.name}`}
                              allowFullScreen
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            ></iframe>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pr-2.5 pt-2.5 border-t border-slate-100/90 w-full">
                  <div className="flex items-center gap-1.5">
                    {onEditProject && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditProject(p);
                        }}
                        className="flex items-center gap-1 font-bold px-2.5 py-1 rounded-lg transition-colors text-xs whitespace-nowrap shrink-0 cursor-pointer bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200"
                        title={t('list.edit')}
                      >
                        <Pencil className="h-3 w-3 text-amber-600" />
                        <span>{t('list.edit')}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {p.mapUrl && onTriggerQuickAnalysis && (
                      <button
                        type="button"
                        disabled={quickAnalyzingId === p.id}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setQuickAnalyzingId(p.id);
                          try {
                            await onTriggerQuickAnalysis(p);
                          } finally {
                            setQuickAnalyzingId(null);
                          }
                        }}
                        className={`flex items-center gap-1 font-bold px-2.5 py-1 rounded-lg transition-all text-xs whitespace-nowrap shrink-0 cursor-pointer ${
                          quickAnalyzingId === p.id
                            ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-3xs'
                        }`}
                        title="فحص فوري للرابط واستخراج الأطوال ومقارنة التغيرات"
                      >
                        {quickAnalyzingId === p.id ? (
                          <>
                            <div className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                            <span>جاري الفحص...</span>
                          </>
                        ) : (
                          <>
                            <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                            <span>فحص فوري ⚡</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProject(p);
                      }}
                      className={`flex items-center gap-1 font-bold px-3 py-1 rounded-lg transition-colors text-xs whitespace-nowrap shrink-0 cursor-pointer ${
                        isSelected 
                          ? 'bg-blue-50 text-blue-700 border border-blue-200 font-extrabold' 
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                      title={isSelected ? t('list.hideData') : t('list.viewData')}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>{isSelected ? t('list.hideData') : t('list.viewData')}</span>
                    </button>

                    {onGoToMap && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onGoToMap(p);
                        }}
                        className="flex items-center gap-1 font-extrabold px-3 py-1 rounded-lg transition-all text-xs whitespace-nowrap shrink-0 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white shadow-xs hover:shadow-md"
                        title={t('list.goToMap')}
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{t('list.goToMap')}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={p.id}
              onClick={() => onSelectProject(p)}
              className={`bg-white dark:bg-slate-900 rounded-2xl border p-4.5 cursor-pointer flex flex-col justify-between transition-all duration-300 hover:shadow-md group relative overflow-hidden ${
                isSelected 
                  ? 'border-blue-500 dark:border-blue-500 ring-4 ring-blue-500/10 dark:ring-blue-500/20 shadow-sm' 
                  : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
              }`}
            >
              {/* Scope accent line */}
              <div className={`absolute top-0 right-0 left-0 h-1 ${
                isWater ? 'bg-cyan-500' : 'bg-emerald-500'
              }`} />

              <div className="space-y-3.5">
                {/* Header */}
                <div className="flex items-start justify-between gap-1.5">
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 border border-slate-200/60 dark:border-slate-700 rounded">
                    {t('list.opNo')}: {p.operationalNumber}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {onToggleFavorite && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(p.id);
                        }}
                        className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-amber-500 transition-all hover:scale-115 active:scale-90 shrink-0"
                        title={p.isFavorite ? t('list.removeFromFavorites') : t('list.addToFavorites')}
                      >
                        <Star className={`h-3.5 w-3.5 ${p.isFavorite ? 'fill-amber-400 text-amber-500' : 'text-slate-300 dark:text-slate-600'}`} />
                      </button>
                    )}
                    <span className={`text-[9px] px-2 py-0.5 rounded font-bold whitespace-nowrap ${getStatusBadgeClass(p.status)}`}>
                      {translateDynamic(p.status)}
                    </span>
                  </div>
                </div>

                {/* Name */}
                <div className="space-y-1">
                  <h5 className={`font-bold text-slate-800 dark:text-slate-100 text-xs leading-relaxed line-clamp-2 min-h-[36px] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors ${isRtl ? 'text-right' : 'text-left'}`} title={p.name}>
                    {p.name}
                  </h5>
                  <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <MapPin className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                    <span className="truncate">{translateDynamic(p.region)} • {translateDynamic(p.subProgram)}</span>
                  </div>
                </div>

                {/* Details list as professional bento cards/sub-labels */}
                <div className="grid grid-cols-2 gap-x-2.5 gap-y-2 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="min-w-0 flex flex-col">
                    <span className={`text-[9px] text-slate-400 dark:text-slate-400 font-bold block ${isRtl ? 'text-right' : 'text-left'}`}>{t('list.contractor')}</span>
                    <span className={`text-slate-700 dark:text-slate-200 font-medium truncate mt-0.5 ${isRtl ? 'text-right' : 'text-left'}`} title={p.contractor}>{p.contractor || t('common.unknown')}</span>
                  </div>
                  <div className="min-w-0 flex flex-col">
                    <span className={`text-[9px] text-slate-400 dark:text-slate-400 font-bold block ${isRtl ? 'text-right' : 'text-left'}`}>{t('list.consultant')}</span>
                    <span className={`text-slate-700 dark:text-slate-200 font-medium truncate mt-0.5 ${isRtl ? 'text-right' : 'text-left'}`} title={p.consultant}>{p.consultant || t('list.yardaOffice')}</span>
                  </div>
                  <div className="min-w-0 flex flex-col">
                    <span className={`text-[9px] text-slate-400 dark:text-slate-400 font-bold block ${isRtl ? 'text-right' : 'text-left'}`}>{t('list.po')} / {t('list.unifier')}</span>
                    <span className={`text-slate-700 dark:text-slate-200 font-semibold font-mono truncate mt-0.5 ${isRtl ? 'text-right' : 'text-left'}`} title={`${p.po || '-'} / ${p.unifierNo || '-'}`}>{p.po || '-'} / {p.unifierNo || '-'}</span>
                  </div>
                  <div className="min-w-0 flex flex-col col-span-2 bg-slate-100/70 dark:bg-slate-800 p-2 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="min-w-0">
                        <span className={`text-[8.5px] text-slate-500 dark:text-slate-400 font-extrabold block ${isRtl ? 'text-right' : 'text-left'}`}>{t('list.surveyorResponsible')}</span>
                        <span className={`text-slate-800 dark:text-slate-200 font-bold text-[11px] truncate block ${isRtl ? 'text-right' : 'text-left'}`} title={p.surveyorName || t('common.unknown')}>
                          {p.surveyorName || t('common.unknown')}
                        </span>
                      </div>
                      <div className="shrink-0">
                        {p.surveyorPhone ? (
                          canOpenExternalLinks ? (
                            <a
                              href={getWhatsAppLink(p.surveyorPhone, p.name, p.operationalNumber)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-white text-[10.5px] font-extrabold px-2.5 py-1 rounded-lg transition-all shadow-xs hover:scale-105 active:scale-95"
                              title={`WhatsApp: ${p.surveyorPhone}`}
                            >
                              <WhatsAppIcon className="h-3.5 w-3.5 fill-white text-white" />
                              <span dir="ltr">WhatsApp ({p.surveyorPhone})</span>
                            </a>
                          ) : (
                            <span dir="ltr" className="font-mono text-slate-700 dark:text-slate-300 font-bold text-xs">{p.surveyorPhone}</span>
                          )
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">{t('common.unknown')}</span>
                            {onEditProject && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditProject(p);
                                }}
                                className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                                title={t('list.addPhone')}
                              >
                                + {t('list.addPhone')}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <div className="pt-2.5 mt-2 border-t border-slate-100 flex flex-col gap-2 animate-in fade-in duration-200">
                    <span className={`text-[9px] font-bold text-slate-400 ${isRtl ? 'text-right' : 'text-left'}`}>{t('list.mapTools')}</span>
                    <div className={`flex flex-wrap gap-1.5 ${isRtl ? 'justify-end' : 'justify-start'}`}>
                      {p.mapUrl && canOpenExternalLinks && (
                        <a
                          href={p.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded hover:bg-blue-100 transition-colors text-[9px] font-bold"
                        >
                          <Globe className="h-2.5 w-2.5 text-blue-600" />
                          <span>{t('list.openNavigation')}</span>
                        </a>
                      )}

                      {p.mapUrl && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowListInlineMapId(showListInlineMapId === p.id ? null : p.id);
                          }}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border transition-all text-[9px] font-bold cursor-pointer ${
                            showListInlineMapId === p.id
                              ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-100 hover:bg-emerald-100'
                          }`}
                        >
                          <Globe className={`h-2.5 w-2.5 ${showListInlineMapId === p.id ? 'text-white' : 'text-emerald-600 animate-pulse'}`} />
                          <span>{showListInlineMapId === p.id ? t('list.hidePreview') : t('list.previewMap')}</span>
                        </button>
                      )}
                    </div>

                    {showListInlineMapId === p.id && p.mapUrl && (
                      <div className="w-full mt-2 rounded-lg overflow-hidden border border-slate-200 shadow-xs bg-white animate-in zoom-in-95 duration-200">
                        <div className="bg-slate-800 text-slate-250 px-2 py-1 flex items-center justify-between text-[9px] font-bold">
                          <span>{t('list.googleMyMapsTitle')}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowListInlineMapId(null);
                            }}
                            className="text-slate-400 hover:text-white cursor-pointer font-bold"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="h-60 w-full bg-slate-50 relative overflow-hidden">
                          <iframe
                            src={getEmbeddableMapUrl(p.mapUrl)}
                            className="absolute left-0 w-full border-0 z-0"
                            style={{
                              top: '-56px',
                              height: 'calc(100% + 56px + 40px)'
                            }}
                            title={`Google My Maps card preview ${p.name}`}
                            allowFullScreen
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          ></iframe>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action area */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs gap-2">
                <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${
                  isWater ? 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-100 dark:border-cyan-900' : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900'
                }`}>
                  {isWater ? <Droplet className="h-3 w-3" /> : <Waves className="h-3 w-3" />}
                  <span>{translateDynamic(p.classification)}</span>
                </span>

                <div className="flex items-center gap-2">
                  {onEditProject && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditProject(p);
                      }}
                      className="flex items-center gap-1.5 font-bold px-3 py-1.5 rounded-lg transition-colors text-[11px] whitespace-nowrap shrink-0 cursor-pointer bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                      title={t('list.edit')}
                    >
                      <Pencil className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      <span>{t('list.edit')}</span>
                    </button>
                  )}

                <div className="flex items-center gap-1.5">
                  {p.mapUrl && onTriggerQuickAnalysis && (
                    <button
                      type="button"
                      disabled={quickAnalyzingId === p.id}
                      onClick={async (e) => {
                        e.stopPropagation();
                        setQuickAnalyzingId(p.id);
                        try {
                          await onTriggerQuickAnalysis(p);
                        } finally {
                          setQuickAnalyzingId(null);
                        }
                      }}
                      className={`flex items-center gap-1 font-bold px-2.5 py-1.5 rounded-lg transition-all text-[11px] whitespace-nowrap shrink-0 cursor-pointer ${
                        quickAnalyzingId === p.id
                          ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                          : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-3xs'
                      }`}
                      title="فحص فوري للرابط واستخراج الأطوال ومقارنة التغيرات"
                    >
                      {quickAnalyzingId === p.id ? (
                        <>
                          <div className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                          <span>جاري الفحص...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                          <span>فحص فوري ⚡</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectProject(p);
                    }}
                    className={`flex items-center gap-1.5 font-bold px-3 py-1.5 rounded-lg transition-colors text-[11px] whitespace-nowrap shrink-0 cursor-pointer ${
                      isSelected 
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-extrabold' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                    title={isSelected ? t('list.hideData') : t('list.viewData')}
                  >
                    <Eye className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                    <span>{isSelected ? t('list.hideData') : t('list.viewData')}</span>
                  </button>

                  {onGoToMap && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onGoToMap(p);
                      }}
                      className="flex items-center gap-1.5 font-extrabold px-3.5 py-1.5 rounded-lg transition-all text-[11px] whitespace-nowrap shrink-0 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white shadow-xs hover:shadow-md"
                      title={t('list.goToMap')}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{t('list.goToMap')}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredProjects.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12 text-center col-span-full space-y-3">
            <AlertTriangle className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <div className="space-y-1">
              <h5 className="font-bold text-slate-700 dark:text-slate-200 text-sm">{t('list.noResultsTitle')}</h5>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal max-w-md mx-auto">
                {t('list.noResultsDesc')}
              </p>
            </div>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedSubProgram('الكل');
                setSelectedClassification('الكل');
                setSelectedStatus('الكل');
              }}
              className="text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3.5 py-2 rounded-xl transition-colors font-semibold cursor-pointer"
            >
              {t('list.resetFilters')}
            </button>
          </div>
        )}
      </div>

      {/* Paginations */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {isRtl ? (
              <>الصفحة <span className="font-bold text-slate-800 dark:text-slate-200">{currentPage}</span> من <span className="font-bold text-slate-800 dark:text-slate-200">{totalPages}</span> | يعرض الآن مشاريع من <span className="font-semibold">{Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filteredProjects.length)}</span> إلى <span className="font-semibold">{Math.min(currentPage * ITEMS_PER_PAGE, filteredProjects.length)}</span></>
            ) : (
              <>Page <span className="font-bold text-slate-800 dark:text-slate-200">{currentPage}</span> of <span className="font-bold text-slate-800 dark:text-slate-200">{totalPages}</span> | Showing projects <span className="font-semibold">{Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filteredProjects.length)}</span> to <span className="font-semibold">{Math.min(currentPage * ITEMS_PER_PAGE, filteredProjects.length)}</span></>
            )}
          </div>

          <div className="flex gap-1.5">
            <button
              onClick={isRtl ? handlePrevPage : handleNextPage}
              disabled={isRtl ? currentPage === 1 : currentPage === totalPages}
              className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer ${
                (isRtl ? currentPage === 1 : currentPage === totalPages)
                  ? 'text-slate-300 dark:text-slate-600 bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed'
                  : 'text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={isRtl ? handleNextPage : handlePrevPage}
              disabled={isRtl ? currentPage === totalPages : currentPage === 1}
              className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer ${
                (isRtl ? currentPage === totalPages : currentPage === 1)
                  ? 'text-slate-300 dark:text-slate-600 bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed'
                  : 'text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {/* Executive Multi-Project Changes Summary Modal */}
      <ExecutiveChangesSummaryModal
        isOpen={isExecutiveSummaryOpen}
        onClose={() => setIsExecutiveSummaryOpen(false)}
        projects={projects}
        onOpenProjectDiff={onOpenProjectDiff}
      />
    </div>
  );
}
