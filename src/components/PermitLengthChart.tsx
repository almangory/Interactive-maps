import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell
} from 'recharts';
import { 
  BarChart3, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  BarChart2, 
  AlignLeft
} from 'lucide-react';
import { KMLFeatureItem } from '../types';
import { isValidIdentifier } from '../utils/myMapsKmlParser';

export interface PermitGroupItem {
  permitNo: string;
  count: number;
  totalLengthMeters: number;
  totalLengthKm: number;
  items: KMLFeatureItem[];
  primaryStatus: string;
  primaryColor: string;
  hasYellowNoPermit?: boolean;
}

interface PermitLengthChartProps {
  items: KMLFeatureItem[];
  onSelectPermit?: (permitNo: string) => void;
}

export const PermitLengthChart: React.FC<PermitLengthChartProps> = ({
  items,
  onSelectPermit
}) => {
  const [sortBy, setSortBy] = useState<'length-desc' | 'length-asc' | 'count-desc' | 'permit-name'>('length-desc');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [unit, setUnit] = useState<'km' | 'm'>('km');
  const [searchQuery, setSearchQuery] = useState('');
  const [topLimit, setTopLimit] = useState<number>(15);
  const [chartOrientation, setChartOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [hideUnpermitted, setHideUnpermitted] = useState<boolean>(true);

  // Group items by Permit No
  const permitGroups = useMemo(() => {
    const map: Record<string, {
      permitNo: string;
      count: number;
      totalLengthMeters: number;
      items: KMLFeatureItem[];
      statusCounts: Record<string, number>;
      colorCounts: Record<string, number>;
    }> = {};

    items.forEach(it => {
      const isVal = isValidIdentifier(it.permitNo);
      const pNo = isVal ? it.permitNo.trim() : 'بدون رقم تصريح (غير محدد)';
      if (!map[pNo]) {
        map[pNo] = {
          permitNo: pNo,
          count: 0,
          totalLengthMeters: 0,
          items: [],
          statusCounts: {},
          colorCounts: {}
        };
      }
      map[pNo].count += 1;
      map[pNo].totalLengthMeters += it.lengthMeters || 0;
      map[pNo].items.push(it);

      const st = it.statusCategory || 'remaining';
      map[pNo].statusCounts[st] = (map[pNo].statusCounts[st] || 0) + 1;

      const col = it.originalColorHex || it.colorHex || it.color || '#A52714';
      map[pNo].colorCounts[col] = (map[pNo].colorCounts[col] || 0) + 1;
    });

    return Object.values(map).map(grp => {
      // Find dominant status
      let domStatus = 'remaining';
      let maxStCount = 0;
      Object.entries(grp.statusCounts).forEach(([st, cnt]) => {
        if (cnt > maxStCount) {
          maxStCount = cnt;
          domStatus = st;
        }
      });

      // Find dominant color
      let domColor = '#10b981';
      let maxColCount = 0;
      Object.entries(grp.colorCounts).forEach(([col, cnt]) => {
        if (cnt > maxColCount) {
          maxColCount = cnt;
          domColor = col;
        }
      });

      const isYellowUnpermitted = grp.permitNo.includes('بدون رقم') && grp.items.some(i => i.statusCategory === 'ongoing');

      return {
        permitNo: grp.permitNo,
        count: grp.count,
        totalLengthMeters: grp.totalLengthMeters,
        totalLengthKm: Number((grp.totalLengthMeters / 1000).toFixed(3)),
        items: grp.items,
        primaryStatus: domStatus,
        primaryColor: domColor,
        hasYellowNoPermit: isYellowUnpermitted
      };
    });
  }, [items]);

  // Overall Permit Statistics
  const stats = useMemo(() => {
    if (!permitGroups || permitGroups.length === 0) {
      return { totalPermits: 0, totalLengthKm: '0.00', longestPermit: '-', maxLenKm: '0.00', unpermittedCount: 0 };
    }

    const validPermits = permitGroups.filter(p => !p.permitNo.includes('بدون رقم'));
    const totalPermits = validPermits.length;
    let sumLen = 0;
    let maxLen = 0;
    let longestPermit = '-';
    let unpermittedCount = 0;

    permitGroups.forEach(p => {
      if (p.permitNo.includes('بدون رقم')) {
        unpermittedCount += p.count;
      } else {
        sumLen += p.totalLengthMeters;
        if (p.totalLengthMeters > maxLen) {
          maxLen = p.totalLengthMeters;
          longestPermit = p.permitNo;
        }
      }
    });

    return {
      totalPermits,
      totalLengthKm: (sumLen / 1000).toFixed(2),
      longestPermit,
      maxLenKm: (maxLen / 1000).toFixed(2),
      unpermittedCount
    };
  }, [permitGroups]);

  // Filtered and Sorted Chart Data
  const chartData = useMemo(() => {
    let list = [...permitGroups];

    // Exclude unassigned/unpermitted items if toggle is active (prevents scale squashing)
    if (hideUnpermitted) {
      list = list.filter(p => !p.permitNo.includes('بدون رقم'));
    }

    if (statusFilter !== 'all') {
      list = list.filter(p => p.primaryStatus === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => p.permitNo.toLowerCase().includes(q));
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'length-desc') return b.totalLengthMeters - a.totalLengthMeters;
      if (sortBy === 'length-asc') return a.totalLengthMeters - b.totalLengthMeters;
      if (sortBy === 'count-desc') return b.count - a.count;
      if (sortBy === 'permit-name') return a.permitNo.localeCompare(b.permitNo, undefined, { numeric: true });
      return 0;
    });

    if (topLimit > 0) {
      list = list.slice(0, topLimit);
    }

    return list.map((p, idx) => ({
      ...p,
      rank: idx + 1,
      displayName: p.permitNo.length > 24 ? p.permitNo.substring(0, 22) + '...' : p.permitNo,
      fullDisplayName: p.permitNo,
      chartLength: unit === 'km' ? p.totalLengthKm : Math.round(p.totalLengthMeters)
    }));
  }, [permitGroups, statusFilter, searchQuery, sortBy, topLimit, unit, hideUnpermitted]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 border border-slate-700 text-white p-3.5 rounded-2xl shadow-2xl backdrop-blur-md text-xs space-y-2 z-50 pointer-events-none min-w-[220px]">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-1.5 font-bold text-cyan-300">
            <span className="font-mono text-sm">{data.fullDisplayName || data.permitNo}</span>
            <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-300 border border-slate-700">#{data.rank}</span>
          </div>
          <div className="text-slate-300 flex justify-between items-center">
            <span>إجمالي الطول:</span>
            <strong className="text-emerald-400 font-mono text-sm font-black">
              {data.totalLengthKm} كم ({data.totalLengthMeters.toLocaleString('ar-SA')} م)
            </strong>
          </div>
          <div className="text-slate-300 flex justify-between items-center">
            <span>عدد القطاعات:</span>
            <strong className="text-amber-300 font-mono font-bold">{data.count} قطعة</strong>
          </div>
          {data.hasYellowNoPermit && (
            <div className="text-rose-400 text-[10px] font-black pt-1 border-t border-rose-900">
              🚨 يتضمن قطاعات جارية بدون فسح مسجل!
            </div>
          )}
          <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-800 text-center">
            💡 انقر على الشريط لعرض التفاصيل وتحديد الموقع بالخريطة
          </p>
        </div>
      );
    }
    return null;
  };

  const dynamicChartHeight = useMemo(() => {
    if (chartOrientation === 'horizontal') {
      return Math.max(340, Math.min(800, chartData.length * 38 + 60));
    }
    return 340;
  }, [chartOrientation, chartData.length]);

  return (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
      {/* Header & KPI Summary */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div>
          <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-600" />
            <span>المخطط البياني وحصر الأطوال حسب رخص وتصاريح الحفر (Permit No)</span>
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            توزيع وتحليل الأطوال المنجزة والجارية لكل تصريح حفر مسجل بالخريطة بمقاييس واضحة.
          </p>
        </div>

        {/* Quick KPI Badges & Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>إجمالي التصاريح المسجلة: {stats.totalPermits}</span>
          </span>
          {stats.unpermittedCount > 0 && (
            <button
              type="button"
              onClick={() => setHideUnpermitted(!hideUnpermitted)}
              className={`text-xs font-bold px-3 py-1 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                hideUnpermitted
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-100'
                  : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border-rose-400 dark:border-rose-700 shadow-sm'
              }`}
              title="انقر للتبديل بين إظهار أو استبعاد العناصر بدون تصريح من المخطط"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              <span>بدون تصريح: {stats.unpermittedCount} ({hideUnpermitted ? 'مستبعد من الرسم' : 'معروض بالرسم'})</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-1">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث برقم التصريح..."
            className="w-full text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 pr-8 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        </div>

        {/* Sort */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none cursor-pointer"
          >
            <option value="length-desc">الترتيب: الأطول أولاً ⬇</option>
            <option value="length-asc">الترتيب: الأقصر أولاً ⬆</option>
            <option value="count-desc">الترتيب: الأكثر قطعاً 📦</option>
            <option value="permit-name">الترتيب: رقم الفسح أ-ي 🔤</option>
          </select>
        </div>

        {/* Chart View Layout Mode */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setChartOrientation('horizontal')}
            className={`flex-1 text-[11px] font-black py-1 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
              chartOrientation === 'horizontal' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
            title="عرض أفقي (أشرطة أفقية مريحة لقراءة أرقام التصاريح الطويلة)"
          >
            <AlignLeft className="h-3.5 w-3.5" />
            <span>أشرطة أفقية</span>
          </button>
          <button
            type="button"
            onClick={() => setChartOrientation('vertical')}
            className={`flex-1 text-[11px] font-black py-1 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
              chartOrientation === 'vertical' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
            title="عرض رأسي (أعمدة رأسية)"
          >
            <BarChart2 className="h-3.5 w-3.5" />
            <span>أعمدة رأسية</span>
          </button>
        </div>

        {/* Unit & Top Limit */}
        <div className="flex items-center gap-1.5">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 flex-1">
            <button
              type="button"
              onClick={() => setUnit('km')}
              className={`flex-1 text-[11px] font-black py-1 rounded-lg transition-all cursor-pointer ${unit === 'km' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'}`}
            >
              كم (KM)
            </button>
            <button
              type="button"
              onClick={() => setUnit('m')}
              className={`flex-1 text-[11px] font-black py-1 rounded-lg transition-all cursor-pointer ${unit === 'm' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'}`}
            >
              متر (M)
            </button>
          </div>

          <select
            value={topLimit}
            onChange={(e) => setTopLimit(Number(e.target.value))}
            className="text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value={10}>أعلى 10</option>
            <option value={15}>أعلى 15</option>
            <option value={25}>أعلى 25</option>
            <option value={50}>أعلى 50</option>
            <option value={0}>الكل</option>
          </select>
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none cursor-pointer"
        >
          <option value="all">جميع الحالات</option>
          <option value="executed_water">منفذ مياه (#01579B)</option>
          <option value="executed_sewer">منفذ صرف (#097138)</option>
          <option value="ongoing">جاري العمل (#FFEA00)</option>
          <option value="remaining">أعمال متبقية (#A52714)</option>
          <option value="cancelled">أعمال ملغاة (#F48FB1)</option>
        </select>
      </div>

      {/* Chart Canvas */}
      {chartData.length > 0 ? (
        <div style={{ height: `${dynamicChartHeight}px` }} className="w-full pt-2 transition-all duration-300">
          <ResponsiveContainer width="100%" height="100%">
            {chartOrientation === 'horizontal' ? (
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={true} vertical={true} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: '#888888', fontWeight: 'bold' }}
                  unit={unit === 'km' ? ' كم' : ' م'}
                />
                <YAxis
                  dataKey="displayName"
                  type="category"
                  width={130}
                  tick={{ fontSize: 11, fill: '#475569', fontWeight: 'bold' }}
                  interval={0}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="chartLength"
                  radius={[0, 6, 6, 0]}
                  onClick={(data) => {
                    if (data && onSelectPermit) {
                      onSelectPermit(data.permitNo);
                    }
                  }}
                  className="cursor-pointer"
                >
                  {chartData.map((entry, index) => {
                    const color = entry.permitNo.includes('بدون رقم')
                      ? '#f43f5e'
                      : (entry.primaryColor || '#10b981');
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={color}
                        stroke={color.toLowerCase() === '#ffea00' ? '#ca8a04' : undefined}
                        strokeWidth={color.toLowerCase() === '#ffea00' ? 1.5 : 0}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            ) : (
              <BarChart
                data={chartData}
                layout="horizontal"
                margin={{ top: 10, right: 10, left: 10, bottom: 55 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis
                  dataKey="displayName"
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                  height={50}
                  tick={{ fontSize: 10, fill: '#888888', fontWeight: 'bold' }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#888888', fontWeight: 'bold' }}
                  unit={unit === 'km' ? ' كم' : ' م'}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="chartLength"
                  radius={[6, 6, 0, 0]}
                  onClick={(data) => {
                    if (data && onSelectPermit) {
                      onSelectPermit(data.permitNo);
                    }
                  }}
                  className="cursor-pointer"
                >
                  {chartData.map((entry, index) => {
                    const color = entry.permitNo.includes('بدون رقم')
                      ? '#f43f5e'
                      : (entry.primaryColor || '#10b981');
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={color}
                        stroke={color.toLowerCase() === '#ffea00' ? '#ca8a04' : undefined}
                        strokeWidth={color.toLowerCase() === '#ffea00' ? 1.5 : 0}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
          لا توجد بيانات تصاريح مطابقة لخيارات الفلترة الحالية.
        </div>
      )}
    </div>
  );
};
