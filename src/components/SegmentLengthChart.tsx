import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell
} from 'recharts';
import { 
  Hash, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  BarChart2, 
  AlignLeft
} from 'lucide-react';
import { KMLFeatureItem } from '../types';
import { isValidIdentifier } from '../utils/myMapsKmlParser';

export interface SegmentGroupItem {
  segmentId: string;
  count: number;
  totalLengthMeters: number;
  totalLengthKm: number;
  items: KMLFeatureItem[];
  primaryStatus: string;
  primaryColor: string;
}

interface SegmentLengthChartProps {
  items: KMLFeatureItem[];
  onSelectSegment?: (segmentId: string) => void;
}

export const SegmentLengthChart: React.FC<SegmentLengthChartProps> = ({
  items,
  onSelectSegment
}) => {
  const [topLimit, setTopLimit] = useState<number>(15);
  const [sortBy, setSortBy] = useState<'length-desc' | 'length-asc' | 'count-desc' | 'segment-name'>('length-desc');
  const [unit, setUnit] = useState<'km' | 'm'>('km');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [chartOrientation, setChartOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [hideUnsegmented, setHideUnsegmented] = useState<boolean>(true);

  // Group items by Segment ID
  const segmentGroups = useMemo(() => {
    const map: Record<string, {
      segmentId: string;
      count: number;
      totalLengthMeters: number;
      items: KMLFeatureItem[];
      statusCounts: Record<string, number>;
      colorCounts: Record<string, number>;
    }> = {};

    items.forEach(it => {
      const isVal = isValidIdentifier(it.segmentId);
      const sId = isVal ? it.segmentId.trim() : 'بدون معرف قطاع (غير محدد)';
      if (!map[sId]) {
        map[sId] = {
          segmentId: sId,
          count: 0,
          totalLengthMeters: 0,
          items: [],
          statusCounts: {},
          colorCounts: {}
        };
      }
      map[sId].count += 1;
      map[sId].totalLengthMeters += it.lengthMeters || 0;
      map[sId].items.push(it);

      const st = it.statusCategory || 'remaining';
      map[sId].statusCounts[st] = (map[sId].statusCounts[st] || 0) + 1;

      const col = it.originalColorHex || it.colorHex || it.color || '#A52714';
      map[sId].colorCounts[col] = (map[sId].colorCounts[col] || 0) + 1;
    });

    return Object.values(map).map(grp => {
      let domStatus = 'remaining';
      let maxSt = 0;
      Object.entries(grp.statusCounts).forEach(([st, cnt]) => {
        if (cnt > maxSt) {
          maxSt = cnt;
          domStatus = st;
        }
      });

      let domColor = '#3b82f6';
      let maxCol = 0;
      Object.entries(grp.colorCounts).forEach(([col, cnt]) => {
        if (cnt > maxCol) {
          maxCol = cnt;
          domColor = col;
        }
      });

      return {
        segmentId: grp.segmentId,
        count: grp.count,
        totalLengthMeters: grp.totalLengthMeters,
        totalLengthKm: Number((grp.totalLengthMeters / 1000).toFixed(3)),
        items: grp.items,
        primaryStatus: domStatus,
        primaryColor: domColor
      };
    });
  }, [items]);

  // Overall Statistics
  const stats = useMemo(() => {
    if (!segmentGroups || segmentGroups.length === 0) {
      return { totalSegments: 0, totalLengthKm: '0.00', longestSegment: '-', maxLenKm: '0.00', unsegmentedCount: 0 };
    }

    const validSegments = segmentGroups.filter(s => !s.segmentId.includes('بدون معرف'));
    const totalSegments = validSegments.length;
    let sumLen = 0;
    let maxLen = 0;
    let longestSegment = '-';
    let unsegmentedCount = 0;

    segmentGroups.forEach(s => {
      if (s.segmentId.includes('بدون معرف')) {
        unsegmentedCount += s.count;
      } else {
        sumLen += s.totalLengthMeters;
        if (s.totalLengthMeters > maxLen) {
          maxLen = s.totalLengthMeters;
          longestSegment = s.segmentId;
        }
      }
    });

    return {
      totalSegments,
      totalLengthKm: (sumLen / 1000).toFixed(2),
      longestSegment,
      maxLenKm: (maxLen / 1000).toFixed(2),
      unsegmentedCount
    };
  }, [segmentGroups]);

  // Filter & Sort
  const chartData = useMemo(() => {
    let list = [...segmentGroups];

    // Exclude unassigned segments if toggle is active (prevents scale squashing)
    if (hideUnsegmented) {
      list = list.filter(s => !s.segmentId.includes('بدون معرف'));
    }

    if (statusFilter !== 'all') {
      list = list.filter(s => s.primaryStatus === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s => s.segmentId.toLowerCase().includes(q));
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'length-desc') return b.totalLengthMeters - a.totalLengthMeters;
      if (sortBy === 'length-asc') return a.totalLengthMeters - b.totalLengthMeters;
      if (sortBy === 'count-desc') return b.count - a.count;
      if (sortBy === 'segment-name') return a.segmentId.localeCompare(b.segmentId, undefined, { numeric: true });
      return 0;
    });

    if (topLimit > 0) {
      list = list.slice(0, topLimit);
    }

    return list.map((s, idx) => ({
      ...s,
      rank: idx + 1,
      displayName: s.segmentId.length > 24 ? s.segmentId.substring(0, 22) + '...' : s.segmentId,
      fullDisplayName: s.segmentId,
      chartLength: unit === 'km' ? s.totalLengthKm : Math.round(s.totalLengthMeters)
    }));
  }, [segmentGroups, statusFilter, searchQuery, sortBy, topLimit, unit, hideUnsegmented]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 border border-slate-700 text-white p-3.5 rounded-2xl shadow-2xl backdrop-blur-md text-xs space-y-2 z-50 pointer-events-none min-w-[220px]">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-1.5 font-bold text-cyan-300">
            <span className="font-mono text-sm">{data.fullDisplayName || data.segmentId}</span>
            <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-300 border border-slate-700">#{data.rank}</span>
          </div>
          <div className="text-slate-300 flex justify-between items-center">
            <span>إجمالي الطول:</span>
            <strong className="text-blue-400 font-mono text-sm font-black">
              {data.totalLengthKm} كم ({data.totalLengthMeters.toLocaleString('ar-SA')} م)
            </strong>
          </div>
          <div className="text-slate-300 flex justify-between items-center">
            <span>عدد القطاعات:</span>
            <strong className="text-amber-300 font-mono font-bold">{data.count} قطعة</strong>
          </div>
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
            <Hash className="h-4 w-4 text-blue-600" />
            <span>المخطط البياني وحصر الأطوال حسب القطاعات (Segment ID)</span>
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            توزيع وتحليل أطوال قطاعات العمل المستخرجة من الخريطة بمقاييس دقيقة وواضحة.
          </p>
        </div>

        {/* Quick KPI Badges & Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>إجمالي السجمنت المعتمد: {stats.totalSegments}</span>
          </span>
          {stats.unsegmentedCount > 0 && (
            <button
              type="button"
              onClick={() => setHideUnsegmented(!hideUnsegmented)}
              className={`text-xs font-bold px-3 py-1 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                hideUnsegmented
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-100'
                  : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border-rose-400 dark:border-rose-700 shadow-sm'
              }`}
              title="انقر للتبديل بين إظهار أو استبعاد العناصر بدون Segment ID من المخطط"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              <span>بدون معرف: {stats.unsegmentedCount} ({hideUnsegmented ? 'مستبعد من الرسم' : 'معروض بالرسم'})</span>
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
            placeholder="بحث برمز السجمنت..."
            className="w-full text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 pr-8 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        </div>

        {/* Sort */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
          >
            <option value="length-desc">الترتيب: الأطول أولاً ⬇</option>
            <option value="length-asc">الترتيب: الأقصر أولاً ⬆</option>
            <option value="count-desc">الترتيب: الأكثر قطعاً 📦</option>
            <option value="segment-name">الترتيب: كود السجمنت 🔤</option>
          </select>
        </div>

        {/* Chart View Layout Mode */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setChartOrientation('horizontal')}
            className={`flex-1 text-[11px] font-black py-1 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
              chartOrientation === 'horizontal' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
            title="عرض أفقي (أشرطة أفقية مريحة لقراءة الأسماء والمعرفات الطويلة)"
          >
            <AlignLeft className="h-3.5 w-3.5" />
            <span>أشرطة أفقية</span>
          </button>
          <button
            type="button"
            onClick={() => setChartOrientation('vertical')}
            className={`flex-1 text-[11px] font-black py-1 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
              chartOrientation === 'vertical' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
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
              className={`flex-1 text-[11px] font-black py-1 rounded-lg transition-all cursor-pointer ${unit === 'km' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'}`}
            >
              كم (KM)
            </button>
            <button
              type="button"
              onClick={() => setUnit('m')}
              className={`flex-1 text-[11px] font-black py-1 rounded-lg transition-all cursor-pointer ${unit === 'm' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'}`}
            >
              متر (M)
            </button>
          </div>

          <select
            value={topLimit}
            onChange={(e) => setTopLimit(Number(e.target.value))}
            className="text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
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
          className="w-full text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
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
                  width={140}
                  tick={{ fontSize: 11, fill: '#475569', fontWeight: 'bold' }}
                  interval={0}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="chartLength"
                  radius={[0, 6, 6, 0]}
                  onClick={(data) => {
                    if (data && onSelectSegment) {
                      onSelectSegment(data.segmentId);
                    }
                  }}
                  className="cursor-pointer"
                >
                  {chartData.map((entry, index) => {
                    const color = entry.segmentId.includes('بدون معرف')
                      ? '#f43f5e'
                      : (entry.primaryColor || '#3b82f6');
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
                    if (data && onSelectSegment) {
                      onSelectSegment(data.segmentId);
                    }
                  }}
                  className="cursor-pointer"
                >
                  {chartData.map((entry, index) => {
                    const color = entry.segmentId.includes('بدون معرف')
                      ? '#f43f5e'
                      : (entry.primaryColor || '#3b82f6');
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
          لا توجد بيانات قطاعات مطابقة لخيارات الفلترة الحالية.
        </div>
      )}
    </div>
  );
};
