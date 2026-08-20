/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Project, User } from '../types';
import { Droplet, Wind, RefreshCw, CheckCircle2, AlertTriangle, Building2, MapPin, Layers, BarChart3, Globe, Sparkles, Ruler, SlidersHorizontal, Lock } from 'lucide-react';
import { MyMapsAnalysisPanel } from './MyMapsAnalysisPanel';
import { ProjectLengthsDashboard } from './ProjectLengthsDashboard';
import { useLanguage } from '../utils/i18n';

interface DashboardStatsProps {
  projects: Project[];
  selectedProject?: Project | null;
  onSelectProject?: (project: Project) => void;
  isAdmin?: boolean;
  currentUser?: User;
}

export function DashboardStats({ projects, selectedProject, onSelectProject, isAdmin, currentUser }: DashboardStatsProps) {
  const { t, translateDynamic, formatNumber, isRtl } = useLanguage();
  // Compute allowed sub-tabs based on currentUser permissions
  const allowedSubTabs = useMemo(() => {
    if (!currentUser) return ['lengths', 'mymaps', 'general'];
    if (currentUser.role === 'admin') return ['lengths', 'mymaps', 'general'];
    const list = currentUser.allowedStatsSubTabs;
    if (!list || list.length === 0 || list.includes('الكل')) {
      return ['lengths', 'mymaps', 'general'];
    }
    return list;
  }, [currentUser]);

  const [activeSubTab, setActiveSubTab] = useState<'lengths' | 'general' | 'mymaps'>(() => {
    if (allowedSubTabs.includes('lengths')) return 'lengths';
    if (allowedSubTabs.includes('mymaps')) return 'mymaps';
    if (allowedSubTabs.includes('general')) return 'general';
    return 'lengths';
  });

  useEffect(() => {
    if (!allowedSubTabs.includes(activeSubTab)) {
      if (allowedSubTabs.includes('lengths')) setActiveSubTab('lengths');
      else if (allowedSubTabs.includes('mymaps')) setActiveSubTab('mymaps');
      else if (allowedSubTabs.includes('general')) setActiveSubTab('general');
    }
  }, [allowedSubTabs, activeSubTab]);
  const [selectedGeneralStatus, setSelectedGeneralStatus] = useState<string>('all');

  // Filter projects by general status if selected
  const filteredProjects = projects.filter(p => {
    if (selectedGeneralStatus === 'all') return true;
    const s = (p.status || '').trim();
    if (selectedGeneralStatus === 'جاري') {
      return (s.includes('جاري') && !s.includes('استلام')) || s.includes('تنفيذ');
    }
    if (selectedGeneralStatus === 'مسلم ابتدائي') {
      return s.includes('مسلم ابتدائي');
    }
    if (selectedGeneralStatus === 'جاري الاستلام الابتدائي') {
      return s.includes('جاري الاستلام') || s.includes('استلام ابتدائي');
    }
    if (selectedGeneralStatus === 'مكتمل') {
      return s.includes('مكتمل') || s.includes('انهاء العقد') || s.includes('إنهاء العقد');
    }
    if (selectedGeneralStatus === 'مسحوب') {
      return s.includes('مسحوب');
    }
    if (selectedGeneralStatus === 'معلق') {
      return s.includes('معلق') || s.includes('متوقف');
    }
    return s === selectedGeneralStatus || s.includes(selectedGeneralStatus);
  });

  // Calculations based on filtered projects
  const total = filteredProjects.length;
  
  const sewageCount = filteredProjects.filter(p => {
    const scopeStr = Array.isArray(p.scope) ? p.scope.join(' ') : (p.scope || '');
    const nameStr = p.name || '';
    const classStr = p.classification || '';
    return scopeStr.includes('صرف') || scopeStr.includes('بيئية') || scopeStr.includes('الرفع') || scopeStr.includes('رفع') ||
           nameStr.includes('الرفع') || nameStr.includes('صرف') || classStr.includes('الرفع') || classStr.includes('صرف');
  }).length;

  const waterCount = filteredProjects.filter(p => {
    const scopeStr = Array.isArray(p.scope) ? p.scope.join(' ') : (p.scope || '');
    const nameStr = p.name || '';
    const classStr = p.classification || '';
    return scopeStr.includes('مياه') || nameStr.includes('مياه') || classStr.includes('مياه');
  }).length;

  const otherScopeCount = total - sewageCount - waterCount;

  const currentCount = filteredProjects.filter(p => {
    const statusStr = p.status || '';
    return (statusStr.includes('جاري') || statusStr.includes('تنفيذ') || statusStr.includes('التنفيذ') || statusStr.includes('مستأنف')) && !statusStr.includes('الاستلام');
  }).length;
  const initialHandoverCount = filteredProjects.filter(p => {
    const statusStr = p.status || '';
    return statusStr.includes('مسلم') || statusStr.includes('الاستلام') || statusStr.includes('مكتمل');
  }).length;
  const withdrawnCount = filteredProjects.filter(p => {
    const statusStr = p.status || '';
    return statusStr.includes('مسحوب') || statusStr.includes('معلق') || statusStr.includes('متوقف');
  }).length;
  
  // Contractors breakdown
  const contractorsMap: Record<string, number> = {};
  filteredProjects.forEach(p => {
    if (p.contractor) {
      contractorsMap[p.contractor] = (contractorsMap[p.contractor] || 0) + 1;
    }
  });
  const topContractors = Object.entries(contractorsMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Region breakdown
  const regionsMap: Record<string, number> = {};
  filteredProjects.forEach(p => {
    if (p.region) {
      regionsMap[p.region] = (regionsMap[p.region] || 0) + 1;
    }
  });

  if (allowedSubTabs.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 text-center space-y-3">
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-full w-fit mx-auto">
          <Lock className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
          {t('dash.noAccessTitle')}
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          {t('dash.noAccessDesc')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs header */}
      <div className="bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {allowedSubTabs.includes('lengths') && (
            <button
              type="button"
              onClick={() => setActiveSubTab('lengths')}
              className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 relative ${
                activeSubTab === 'lengths'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Ruler className="h-4 w-4 text-amber-300" />
              <span>{t('dash.subtabLengths')}</span>
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            </button>
          )}

          {allowedSubTabs.includes('mymaps') && (
            <button
              type="button"
              onClick={() => setActiveSubTab('mymaps')}
              className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 relative ${
                activeSubTab === 'mymaps'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Globe className="h-4 w-4 text-cyan-400" />
              <span>{t('dash.subtabMyMaps')}</span>
            </button>
          )}

          {allowedSubTabs.includes('general') && (
            <button
              type="button"
              onClick={() => setActiveSubTab('general')}
              className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                activeSubTab === 'general'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              <span>{t('dash.subtabGeneral')}</span>
            </button>
          )}
        </div>
      </div>

      {activeSubTab === 'lengths' ? (
        <ProjectLengthsDashboard
          projects={projects}
          onSelectProject={onSelectProject}
          onOpenMyMaps={(proj) => {
            if (onSelectProject) onSelectProject(proj);
            setActiveSubTab('mymaps');
          }}
        />
      ) : activeSubTab === 'mymaps' ? (
        <MyMapsAnalysisPanel
          projects={projects}
          selectedProject={selectedProject}
          onSelectProject={onSelectProject}
          isAdmin={isAdmin}
        />
      ) : (
        <>
          {/* Status Filter Bar for General Stats */}
          <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span>{t('dash.filterByStatus')}</span>
              </span>
              {selectedGeneralStatus !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedGeneralStatus('all')}
                  className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  {t('dash.showAllStatuses')}
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedGeneralStatus('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  selectedGeneralStatus === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                {t('dash.statusAll')} ({projects.length})
              </button>

              <button
                type="button"
                onClick={() => setSelectedGeneralStatus('جاري')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  selectedGeneralStatus === 'جاري'
                    ? 'bg-amber-500 text-slate-900 shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 border border-slate-200 dark:border-slate-700 hover:bg-amber-50'
                }`}
              >
                {t('dash.statusOngoing')}
              </button>

              <button
                type="button"
                onClick={() => setSelectedGeneralStatus('مسلم ابتدائي')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  selectedGeneralStatus === 'مسلم ابتدائي'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 border border-slate-200 dark:border-slate-700 hover:bg-blue-50'
                }`}
              >
                {t('dash.statusHandover')}
              </button>

              <button
                type="button"
                onClick={() => setSelectedGeneralStatus('جاري الاستلام الابتدائي')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  selectedGeneralStatus === 'جاري الاستلام الابتدائي'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 hover:bg-indigo-50'
                }`}
              >
                {t('dash.statusReceiving')}
              </button>

              <button
                type="button"
                onClick={() => setSelectedGeneralStatus('مكتمل')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  selectedGeneralStatus === 'مكتمل'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 border border-slate-200 dark:border-slate-700 hover:bg-emerald-50'
                }`}
              >
                {t('dash.statusCompleted')}
              </button>

              <button
                type="button"
                onClick={() => setSelectedGeneralStatus('مسحوب')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  selectedGeneralStatus === 'مسحوب'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-400 border border-slate-200 dark:border-slate-700 hover:bg-rose-50'
                }`}
              >
                {t('dash.statusWithdrawn')}
              </button>

              <button
                type="button"
                onClick={() => setSelectedGeneralStatus('معلق')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  selectedGeneralStatus === 'معلق'
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                {t('dash.statusSuspended')}
              </button>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Projects */}
            <div id="stat-total" className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs flex items-center justify-between transition-all hover:shadow-md">
              <div className="space-y-1">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('dash.totalAvailable')}</span>
                <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{formatNumber(total)}</h3>
                <span className="text-xs text-slate-400 dark:text-slate-500">{t('dash.accordingToPerms')}</span>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-2xl">
                <Layers className="h-6 w-6" />
              </div>
            </div>

            {/* Water Projects */}
            <div id="stat-water" className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs flex items-center justify-between transition-all hover:shadow-md">
              <div className="space-y-1">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('dash.waterProjects')}</span>
                <h3 className="text-3xl font-bold text-cyan-600 dark:text-cyan-400 tracking-tight">{formatNumber(waterCount)}</h3>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-600 dark:bg-cyan-400"></span>
                  <span>{t('dash.percentage')} {total > 0 ? ((waterCount / total) * 100).toFixed(2) : '0.00'}%</span>
                </div>
              </div>
              <div className="p-3 bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 rounded-2xl">
                <Droplet className="h-6 w-6" />
              </div>
            </div>

            {/* Sewage Projects */}
            <div id="stat-sewage" className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs flex items-center justify-between transition-all hover:shadow-md">
              <div className="space-y-1">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('dash.sewageProjects')}</span>
                <h3 className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">{formatNumber(sewageCount)}</h3>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400"></span>
                  <span>{t('dash.percentage')} {total > 0 ? ((sewageCount / total) * 100).toFixed(2) : '0.00'}%</span>
                </div>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                <Wind className="h-6 w-6 animate-pulse" />
              </div>
            </div>

            {/* Ongoing projects */}
            <div id="stat-ongoing" className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs flex items-center justify-between transition-all hover:shadow-md">
              <div className="space-y-1">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('dash.ongoingProjects')}</span>
                <h3 className="text-3xl font-bold text-amber-600 dark:text-amber-400 tracking-tight">{formatNumber(currentCount)}</h3>
                <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">{formatNumber(initialHandoverCount)} {t('dash.completedOrHandover')}</span>
                  <span className="text-rose-600 dark:text-rose-400 font-medium">{formatNumber(withdrawnCount)} {t('dash.suspendedOrWithdrawn')}</span>
                </div>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-2xl">
                <RefreshCw className="h-6 w-6" />
              </div>
            </div>
          </div>

          {/* Breakdowns section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Custom regional distribution chart */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs lg:col-span-7 space-y-4">
              <h4 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                {t('dash.geoDistribution')}
              </h4>
              
              <div className="space-y-3 pt-2">
                {Object.entries(regionsMap).map(([regionName, count]) => {
                  const pet = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={regionName} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{translateDynamic(regionName)}</span>
                        <span className="text-slate-500 dark:text-slate-400 font-medium">{formatNumber(count)} {t('dash.project')} ({pet.toFixed(2)}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-blue-500 dark:bg-blue-400 h-full rounded-full transition-all duration-500" 
                          style={{ width: `${pet}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                
                {Object.keys(regionsMap).length === 0 && (
                  <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">{t('dash.noGeoData')}</p>
                )}
              </div>
            </div>

            {/* Contractor Leaderboard */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs lg:col-span-5 space-y-4">
              <h4 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                {t('dash.topContractors')}
              </h4>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {topContractors.map(([contractor, count], idx) => (
                  <div key={contractor} className="flex items-center justify-between py-3 first:pt-1 last:pb-1">
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center w-5 h-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold rounded-full">
                        {formatNumber(idx + 1)}
                      </span>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]" title={contractor}>
                        {translateDynamic(contractor)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-700 text-[11px] px-2 py-0.5 rounded-md font-bold">
                        {formatNumber(count)} {t('dash.project')}
                      </span>
                    </div>
                  </div>
                ))}

                {topContractors.length === 0 && (
                  <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">{t('dash.noContractors')}</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
