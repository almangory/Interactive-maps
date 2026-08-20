import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  KMLAnalysisResult, 
  KMLFeatureItem, 
  StatusCategory 
} from '../types';
import { 
  getStatusCategoryLabel, 
  cleanSegmentId, 
  cleanPermitNo, 
  cleanStage,
  isValidIdentifier,
  isYellowItemWithoutPermit
} from '../utils/myMapsKmlParser';
import * as XLSX from 'xlsx';
import { 
  X, 
  MapPin, 
  Search, 
  Filter, 
  Layers, 
  Hash, 
  FileCheck, 
  Ruler, 
  ExternalLink, 
  Navigation, 
  Check, 
  Copy, 
  Eye, 
  Maximize2, 
  Sparkles,
  Info,
  Building2,
  HardHat,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  FileSpreadsheet
} from 'lucide-react';

interface SegmentPermitRegionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysisResult: KMLAnalysisResult | null;
  initialMode?: 'segment' | 'permit';
  initialFocusId?: string;
  initialStatusFilter?: string;
  projectName?: string;
}

interface GroupedRegion {
  id: string; // clean segmentId or clean permitNo
  rawId: string;
  mode: 'segment' | 'permit';
  items: KMLFeatureItem[];
  totalLengthMeters: number;
  totalLengthKm: number;
  statusCategories: Set<StatusCategory>;
  colorHex: string;
  associatedPermits: Set<string>;
  associatedSegments: Set<string>;
  streets: Set<string>;
  districts: Set<string>;
  contractors: Set<string>;
  stages: Set<string>;
  centerLat?: number;
  centerLng?: number;
  allCoordinates: Array<[number, number]>; // [lng, lat]
  hasYellowNoPermit?: boolean;
  yellowNoPermitCount?: number;
  yellowNoPermitLengthMeters?: number;
}

export const SegmentPermitRegionsModal: React.FC<SegmentPermitRegionsModalProps> = ({
  isOpen,
  onClose,
  analysisResult,
  initialMode = 'segment',
  initialFocusId = '',
  initialStatusFilter = '',
  projectName = ''
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [mode, setMode] = useState<'segment' | 'permit'>(initialMode);
  const [selectedId, setSelectedId] = useState<string>(initialFocusId);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>(initialStatusFilter || 'all');
  const [tileLayerType, setTileLayerType] = useState<'google' | 'satellite' | 'dark' | 'osm'>('google');
  const [showLabelsOnMap, setShowLabelsOnMap] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  // Helper to check if latitude and longitude are valid numbers
  const isValidLatLng = (lat: any, lng: any): boolean => {
    const numLat = Number(lat);
    const numLng = Number(lng);
    return !isNaN(numLat) && !isNaN(numLng) &&
           numLat >= -90 && numLat <= 90 &&
           numLng >= -180 && numLng <= 180 &&
           !(numLat === 0 && numLng === 0);
  };

  // Sync initial props when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setSelectedId(initialFocusId || '');
      if (initialStatusFilter) {
        setSelectedStatusFilter(initialStatusFilter);
      }
    }
  }, [isOpen, initialMode, initialFocusId, initialStatusFilter]);

  // Group KML items into Segment regions or Permit regions
  const groupedRegions = useMemo(() => {
    if (!analysisResult || !analysisResult.items || analysisResult.items.length === 0) {
      return [];
    }

    const map = new Map<string, GroupedRegion>();

    analysisResult.items.forEach(item => {
      const cleanSeg = cleanSegmentId(item.segmentId);
      const cleanPerm = cleanPermitNo(item.permitNo);
      const isYellowNoPerm = isYellowItemWithoutPermit(item);

      let targetId = mode === 'segment' ? cleanSeg : cleanPerm;

      if (!isValidIdentifier(targetId)) {
        if (isYellowNoPerm && mode === 'permit') {
          targetId = 'عناصر جارية بدون رقم فسح (تنبيه قرمزي)';
        } else if (isYellowNoPerm && mode === 'segment' && !isValidIdentifier(cleanSeg)) {
          targetId = 'قطاعات جارية بدون ترميز (تنبيه قرمزي)';
        } else {
          return;
        }
      }

      let group = map.get(targetId);
      if (!group) {
        group = {
          id: targetId,
          rawId: targetId,
          mode,
          items: [],
          totalLengthMeters: 0,
          totalLengthKm: 0,
          statusCategories: new Set(),
          colorHex: isYellowNoPerm ? '#dc2626' : (item.colorHex || (mode === 'segment' ? '#3b82f6' : '#10b981')),
          associatedPermits: new Set(),
          associatedSegments: new Set(),
          streets: new Set(),
          districts: new Set(),
          contractors: new Set(),
          stages: new Set(),
          allCoordinates: [],
          hasYellowNoPermit: false,
          yellowNoPermitCount: 0,
          yellowNoPermitLengthMeters: 0
        };
        map.set(targetId, group);
      }

      group.items.push(item);
      group.totalLengthMeters += (item.lengthMeters || 0);

      if (isYellowNoPerm) {
        group.hasYellowNoPermit = true;
        group.yellowNoPermitCount = (group.yellowNoPermitCount || 0) + 1;
        group.yellowNoPermitLengthMeters = (group.yellowNoPermitLengthMeters || 0) + (item.lengthMeters || 0);
      }

      if (item.statusCategory) group.statusCategories.add(item.statusCategory);
      if (isValidIdentifier(cleanPerm) && cleanPerm !== targetId) group.associatedPermits.add(cleanPerm);
      if (isValidIdentifier(cleanSeg) && cleanSeg !== targetId) group.associatedSegments.add(cleanSeg);
      if (item.streetName && item.streetName.trim()) group.streets.add(item.streetName.trim());
      if (item.district && item.district.trim()) group.districts.add(item.district.trim());
      if (item.contractor && item.contractor.trim()) group.contractors.add(item.contractor.trim());
      if (item.stage && item.stage.trim()) group.stages.add(cleanStage(item.stage));

      // Coordinates
      if (item.coordinates && item.coordinates.length > 0) {
        group.allCoordinates.push(...item.coordinates);
      } else if (item.centerLat && item.centerLng) {
        group.allCoordinates.push([item.centerLng, item.centerLat]);
      }
    });

    // Compute totals and center coords for each region
    const resultList: GroupedRegion[] = [];
    map.forEach(group => {
      group.totalLengthKm = Number((group.totalLengthMeters / 1000).toFixed(3));

      if (group.allCoordinates.length > 0) {
        let sumLat = 0;
        let sumLng = 0;
        group.allCoordinates.forEach(pt => {
          sumLng += pt[0];
          sumLat += pt[1];
        });
        group.centerLat = sumLat / group.allCoordinates.length;
        group.centerLng = sumLng / group.allCoordinates.length;
      }

      resultList.push(group);
    });

    // Sort descending by total length
    return resultList.sort((a, b) => b.totalLengthMeters - a.totalLengthMeters);
  }, [analysisResult, mode]);

  // Overall yellow items without permit statistics across regions
  const yellowNoPermitStats = useMemo(() => {
    let count = 0;
    let lengthMeters = 0;
    let regionsCount = 0;

    groupedRegions.forEach(r => {
      if (r.hasYellowNoPermit) {
        count += r.yellowNoPermitCount || 0;
        lengthMeters += r.yellowNoPermitLengthMeters || 0;
        regionsCount++;
      }
    });

    return {
      count,
      lengthMeters,
      lengthKm: Number((lengthMeters / 1000).toFixed(3)),
      regionsCount
    };
  }, [groupedRegions]);

  // Filtered list based on search and status filter
  const filteredRegions = useMemo(() => {
    return groupedRegions.filter(region => {
      // Search match
      const matchesSearch = searchTerm === '' || 
        region.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        Array.from(region.streets).some(s => String(s).toLowerCase().includes(searchTerm.toLowerCase())) ||
        Array.from(region.districts).some(d => String(d).toLowerCase().includes(searchTerm.toLowerCase())) ||
        Array.from(region.associatedPermits).some(p => String(p).toLowerCase().includes(searchTerm.toLowerCase())) ||
        Array.from(region.associatedSegments).some(s => String(s).toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      // Status filter
      if (selectedStatusFilter === 'all') return true;
      if (selectedStatusFilter === 'yellow_no_permit') {
        return Boolean(region.hasYellowNoPermit);
      }
      if (selectedStatusFilter === 'executed') {
        return region.statusCategories.has('executed_water') || region.statusCategories.has('executed_sewage');
      }
      if (selectedStatusFilter === 'ongoing') {
        return region.statusCategories.has('ongoing');
      }
      if (selectedStatusFilter === 'remaining') {
        return region.statusCategories.has('remaining');
      }
      if (selectedStatusFilter === 'cancelled') {
        return region.statusCategories.has('cancelled');
      }

      return true;
    });
  }, [groupedRegions, searchTerm, selectedStatusFilter]);

  // Active selected region details
  const activeSelectedRegion = useMemo(() => {
    if (!selectedId) return filteredRegions[0] || groupedRegions[0] || null;
    return groupedRegions.find(r => r.id === selectedId) || null;
  }, [selectedId, groupedRegions, filteredRegions]);

  // Cleanup map instance whenever modal closes or unmounts
  useEffect(() => {
    if (!isOpen) {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          console.error('Error removing map on close:', e);
        }
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
      }
    }
  }, [isOpen]);

  // Attach ResizeObserver to keep map container sized properly
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });

    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isOpen]);

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    // Default Riyadh center
    const defaultCenter: [number, number] = [24.7136, 46.6753];

    // If mapInstance exists but is attached to a detached container or needs re-attachment
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch (e) {
        console.error('Error removing previous map instance:', e);
      }
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
    }

    // Clear stale leaflet container id if any
    if ((mapContainerRef.current as any)._leaflet_id) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }

    // Initialize fresh Leaflet map on current container
    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 13,
      zoomControl: true
    });

    mapInstanceRef.current = map;
    layerGroupRef.current = L.layerGroup().addTo(map);

    // Trigger multiple invalidateSize checks to prevent black/white screen or un-rendered tiles
    requestAnimationFrame(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    const timer1 = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 100);
    const timer2 = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 300);

    // Update tile layer
    map.eachLayer(layer => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    if (tileLayerType === 'google') {
      L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Maps',
        maxZoom: 20
      }).addTo(map);
    } else if (tileLayerType === 'satellite') {
      L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Maps Satellite',
        maxZoom: 20
      }).addTo(map);
    } else if (tileLayerType === 'dark') {
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19
      }).addTo(map);
    } else {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);
    }

    // Clear existing layer group items
    if (layerGroupRef.current) {
      layerGroupRef.current.clearLayers();
    } else {
      layerGroupRef.current = L.layerGroup().addTo(map);
    }

    const allBoundsPoints: L.LatLngExpression[] = [];

    // Render polylines & markers for all regions
    groupedRegions.forEach(region => {
      const isSelected = activeSelectedRegion?.id === region.id;

      region.items.forEach(item => {
        const itemCoords = item.coordinates || [];
        // Filter out invalid coords (NaN or out of bounds)
        const validCoords = itemCoords.filter(pt => Array.isArray(pt) && pt.length >= 2 && isValidLatLng(pt[1], pt[0]));

        if (validCoords.length > 1) {
          const latLngs: L.LatLngExpression[] = validCoords.map(pt => [pt[1], pt[0]]);
          
          if (isSelected) {
            allBoundsPoints.push(...latLngs);
          }

          const isUnpermittedYellow = isYellowItemWithoutPermit(item);
          const baseColor = isUnpermittedYellow ? '#dc2626' : (item.colorHex || region.colorHex || (mode === 'segment' ? '#3b82f6' : '#10b981'));

          // Outer glowing polyline if selected or unpermitted yellow alert
          if (isSelected) {
            L.polyline(latLngs, {
              color: '#38bdf8',
              weight: 12,
              opacity: 0.55,
              lineCap: 'round'
            }).addTo(layerGroupRef.current!);
          } else if (isUnpermittedYellow) {
            // Crimson alert glow for yellow elements lacking permit
            L.polyline(latLngs, {
              color: '#dc2626',
              weight: 10,
              opacity: 0.8,
              dashArray: '5, 8'
            }).addTo(layerGroupRef.current!);
          }

          const polyline = L.polyline(latLngs, {
            color: isSelected ? '#3b82f6' : baseColor,
            weight: isSelected ? 8 : (isUnpermittedYellow ? 6 : 4),
            opacity: isSelected ? 1.0 : 0.85,
            dashArray: (item.statusCategory === 'remaining' || item.statusCategory === 'cancelled') ? '6, 6' : undefined
          }).addTo(layerGroupRef.current!);

          // Tooltip/Popup
          const popupContent = `
            <div style="direction: rtl; font-family: sans-serif; padding: 4px; min-width: 220px;">
              ${isUnpermittedYellow ? `
                <div style="background-color: #be123c; color: white; padding: 4px 8px; border-radius: 6px; font-weight: 900; font-size: 11px; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
                  <span>🚨 تنبيه قرمزي: أصفر بدون رقم فسح!</span>
                </div>
              ` : ''}
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
                <span style="background-color: ${baseColor}; color: white; padding: 2px 8px; border-radius: 6px; font-weight: bold; font-size: 11px;">
                  ${item.statusLabel || 'منطقة جغرافية'}
                </span>
                <span style="font-weight: 900; font-family: monospace; font-size: 12px; color: #1e293b;">
                  ${region.id}
                </span>
              </div>
              <div style="font-size: 11px; color: #334155; line-height: 1.6;">
                <b>اسم الخط:</b> ${item.name || '-'}<br/>
                <b>الطول:</b> ${item.lengthMeters} متر (${item.lengthKm} كم)<br/>
                ${item.segmentId && isValidIdentifier(item.segmentId) ? `<b>Segment ID:</b> ${cleanSegmentId(item.segmentId)}<br/>` : ''}
                ${cleanPermitNo(item.permitNo) ? `<b>Permit No:</b> ${cleanPermitNo(item.permitNo)}<br/>` : '<b style="color: #be123c;">Permit No:</b> <span style="color: #be123c; font-weight: bold;">🚨 بدون تصريح صريح (يحتوي على - أو / أو فارغ) ❌</span><br/>'}
                ${item.streetName ? `<b>الشارع:</b> ${item.streetName}<br/>` : ''}
                ${item.district ? `<b>الحي:</b> ${item.district}<br/>` : ''}
                ${item.stage ? `<b>المرحلة:</b> ${cleanStage(item.stage)}<br/>` : ''}
              </div>
            </div>
          `;

          polyline.bindPopup(popupContent);

          polyline.on('click', () => {
            setSelectedId(region.id);
          });
        }
      });

      // Render Region Label Marker if showLabelsOnMap is enabled or if selected
      if ((showLabelsOnMap || isSelected) && isValidLatLng(region.centerLat, region.centerLng)) {
        const isSelectedRegion = activeSelectedRegion?.id === region.id;
        const badgeColor = isSelectedRegion ? '#2563eb' : (region.hasYellowNoPermit ? '#be123c' : region.colorHex);

        const customLabelIcon = L.divIcon({
          className: 'region-map-badge',
          html: `
            <div style="
              background-color: ${badgeColor}; 
              color: white; 
              padding: 3px 8px; 
              border-radius: 20px; 
              font-family: monospace; 
              font-weight: 900; 
              font-size: 11px; 
              border: ${region.hasYellowNoPermit ? '2px solid #fecdd3' : '2px solid white'}; 
              box-shadow: ${region.hasYellowNoPermit ? '0 0 12px rgba(190, 18, 60, 0.8)' : '0 4px 12px rgba(0,0,0,0.35)'}; 
              white-space: nowrap;
              display: flex;
              align-items: center;
              gap: 4px;
              transform: ${isSelectedRegion ? 'scale(1.15)' : 'scale(1.0)'};
              transition: all 0.2s ease;
              cursor: pointer;
            ">
              <span>${region.hasYellowNoPermit ? '🚨' : (mode === 'segment' ? '🏷️' : '📜')}</span>
              <span>${region.id}</span>
            </div>
          `,
          iconSize: [80, 26],
          iconAnchor: [40, 13]
        });

        const labelMarker = L.marker([region.centerLat!, region.centerLng!], { icon: customLabelIcon })
          .addTo(layerGroupRef.current!);

        labelMarker.on('click', () => {
          setSelectedId(region.id);
        });
      }
    });

    // Auto fit bounds to selected region or overall bounds
    if (activeSelectedRegion && activeSelectedRegion.allCoordinates.length > 0) {
      const validRegionCoords = activeSelectedRegion.allCoordinates.filter(pt => isValidLatLng(pt[1], pt[0]));
      const boundsLatLngs: L.LatLngExpression[] = validRegionCoords.map(pt => [pt[1], pt[0]]);
      
      if (boundsLatLngs.length > 0) {
        try {
          const bounds = L.latLngBounds(boundsLatLngs);
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
          } else if (isValidLatLng(activeSelectedRegion.centerLat, activeSelectedRegion.centerLng)) {
            map.setView([activeSelectedRegion.centerLat!, activeSelectedRegion.centerLng!], 16);
          }
        } catch (e) {
          if (isValidLatLng(activeSelectedRegion.centerLat, activeSelectedRegion.centerLng)) {
            map.setView([activeSelectedRegion.centerLat!, activeSelectedRegion.centerLng!], 16);
          }
        }
      } else if (isValidLatLng(activeSelectedRegion.centerLat, activeSelectedRegion.centerLng)) {
        map.setView([activeSelectedRegion.centerLat!, activeSelectedRegion.centerLng!], 16);
      }
    } else if (groupedRegions.length > 0) {
      const allPoints: L.LatLngExpression[] = [];
      groupedRegions.forEach(g => {
        if (isValidLatLng(g.centerLat, g.centerLng)) {
          allPoints.push([g.centerLat!, g.centerLng!]);
        }
      });
      if (allPoints.length > 0) {
        try {
          const bounds = L.latLngBounds(allPoints);
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50] });
          }
        } catch (e) {}
      }
    }

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          console.error('Error removing map on effect unmount:', e);
        }
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, [isOpen, groupedRegions, activeSelectedRegion, tileLayerType, showLabelsOnMap, mode]);

  if (!isOpen) return null;

  const handleCopyDetails = () => {
    if (!activeSelectedRegion) return;
    const text = `📌 تفاصيل منطقة ${mode === 'segment' ? 'السجمنت' : 'التصريح'} (${activeSelectedRegion.id}):
• إجمالي الطول: ${activeSelectedRegion.totalLengthKm} كم (${activeSelectedRegion.totalLengthMeters} متر)
• عدد أجزاء الخطوط: ${activeSelectedRegion.items.length}
• الفسوح المربوطة: ${Array.from(activeSelectedRegion.associatedPermits).join(', ') || 'لا يوجد'}
• الشوارع: ${Array.from(activeSelectedRegion.streets).join(', ') || 'غير محدد'}
• الأحياء: ${Array.from(activeSelectedRegion.districts).join(', ') || 'غير محدد'}
• إحداثيات الموقع: ${activeSelectedRegion.centerLat?.toFixed(6)}, ${activeSelectedRegion.centerLng?.toFixed(6)}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportToExcel = () => {
    if (!groupedRegions || groupedRegions.length === 0) {
      alert('لا توجد بيانات متاحة للتصدير حالياً');
      return;
    }

    const rows = groupedRegions.map(reg => {
      const lat = reg.centerLat !== undefined && reg.centerLat !== null ? Number(reg.centerLat.toFixed(6)) : '';
      const lng = reg.centerLng !== undefined && reg.centerLng !== null ? Number(reg.centerLng.toFixed(6)) : '';
      const mapLink = lat !== '' && lng !== '' ? `https://www.google.com/maps?q=${lat},${lng}` : 'غير متوفر';

      if (mode === 'permit') {
        return {
          'رقم الرخصة (Permit No)': reg.id,
          'اسم المشروع': projectName || 'غير محدد',
          'عدد القطاعات والعناصر': reg.items.length,
          'أطوال الرخصة (متر)': reg.totalLengthMeters,
          'أطوال الرخصة (كم)': reg.totalLengthKm,
          'معرفات السجمنت المرتبطة (Segment IDs)': Array.from(reg.associatedSegments).join(', ') || 'غير محدد',
          'المقاول المنفذ': Array.from(reg.contractors).join(' - ') || 'غير محدد',
          'المراحل والحالات': Array.from(reg.stages).join(' / ') || 'معتمد',
          'الأحياء والمناطق': Array.from(reg.districts).join(' - ') || 'غير محدد',
          'الشوارع والمواقع': Array.from(reg.streets).join(' - ') || 'غير محدد',
          'خط العرض (Latitude)': lat || 'غير متوفر',
          'خط الطول (Longitude)': lng || 'غير متوفر',
          'رابط الموقع على الخريطة': mapLink
        };
      } else {
        return {
          'Segment ID (معرف القطاع)': reg.id,
          'اسم المشروع': projectName || 'غير محدد',
          'عدد العناصر': reg.items.length,
          'إجمالي الطول (متر)': reg.totalLengthMeters,
          'إجمالي الطول (كم)': reg.totalLengthKm,
          'أرقام الفسوحات المرتبطة (Permit No)': Array.from(reg.associatedPermits).join(', ') || 'غير محدد',
          'المقاول المنفذ': Array.from(reg.contractors).join(' - ') || 'غير محدد',
          'المراحل والحالات': Array.from(reg.stages).join(' / ') || 'معتمد',
          'الأحياء والمناطق': Array.from(reg.districts).join(' - ') || 'غير محدد',
          'الشوارع والمواقع': Array.from(reg.streets).join(' - ') || 'غير محدد',
          'خط العرض (Latitude)': lat || 'غير متوفر',
          'خط الطول (Longitude)': lng || 'غير متوفر',
          'رابط الموقع على الخريطة': mapLink
        };
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!views'] = [{ RTL: true }];
    worksheet['!cols'] = Object.keys(rows[0] || {}).map(key => ({
      wch: Math.max(key.length * 2.2, 18)
    }));

    const workbook = XLSX.utils.book_new();
    const sheetName = mode === 'permit' ? 'بيانات_رخص_Permit_No' : 'بيانات_سجمنت_Segment_ID';
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const dateStr = new Date().toISOString().split('T')[0];
    const filePrefix = mode === 'permit' ? 'حصر_الرخص_Permit_No' : 'حصر_السجمنت_Segment_ID';
    XLSX.writeFile(workbook, `${filePrefix}_${dateStr}.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-7xl h-[92vh] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-slate-900 dark:text-slate-100">
        
        {/* Header Bar */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  خريطة مناطق {mode === 'segment' ? 'السجمنت (Segment ID)' : 'التراخيص والفسوح (Permit No)'}
                </h3>
                <span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-black font-mono rounded-full border border-blue-200 dark:border-blue-800">
                  {groupedRegions.length} منطقة مسجلة
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                تصفح واستعراض النطاقات والمناطق الجغرافية لـ {mode === 'segment' ? 'معرفات القطاعات Segment ID' : 'أرقام فسوح الحفر Permit No'} المحددة على الخريطة
              </p>
            </div>
          </div>

          {/* Actions and Mode Switcher */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportToExcel}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer whitespace-nowrap"
              title={`تصدير بيانات ${mode === 'permit' ? 'الرخص (Permit No)' : 'السجمنت (Segment ID)'} إلى ملف إكسل`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
              <span>تصدير إكسل</span>
            </button>

            {/* Mode Switcher Tabs */}
            <div className="flex items-center gap-2 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-2xl border border-slate-300/60 dark:border-slate-700">
              <button
                onClick={() => {
                  setMode('segment');
                  setSelectedId('');
                }}
                className={`px-3.5 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  mode === 'segment'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-300/50 dark:hover:bg-slate-700'
                }`}
              >
                <Hash className="w-3.5 h-3.5" />
                <span>مناطق السجمنت (Segment ID)</span>
              </button>

              <button
                onClick={() => {
                  setMode('permit');
                  setSelectedId('');
                }}
                className={`px-3.5 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  mode === 'permit'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-300/50 dark:hover:bg-slate-700'
                }`}
              >
                <FileCheck className="w-3.5 h-3.5" />
                <span>مناطق الفسوح (Permit No)</span>
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer"
            title="إغلاق النافذة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Split Body */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
          
          {/* Left / Right Interactive Sidebar Controls & Regions List */}
          <div className="w-full lg:w-96 bg-slate-50/70 dark:bg-slate-900/60 border-b lg:border-b-0 lg:border-l border-slate-200 dark:border-slate-800 flex flex-col h-72 lg:h-full overflow-hidden shrink-0">
            
            {/* Search & Filters */}
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-2 bg-white dark:bg-slate-900/80">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder={`ابحث عن رمز ${mode === 'segment' ? 'سجمنت (SEG)' : 'فسح (PERM)'}، شارع أو حي...`}
                  className="w-full bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 pr-9 pl-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
                />
              </div>

              {/* Status filter buttons */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] font-bold">
                <button
                  onClick={() => setSelectedStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg shrink-0 transition-colors cursor-pointer ${
                    selectedStatusFilter === 'all'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-extrabold'
                      : 'bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300'
                  }`}
                >
                  الكل ({groupedRegions.length})
                </button>

                {yellowNoPermitStats.count > 0 && (
                  <button
                    onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'yellow_no_permit' ? 'all' : 'yellow_no_permit')}
                    className={`px-2.5 py-1 rounded-lg shrink-0 transition-all cursor-pointer flex items-center gap-1.5 font-black shadow-2xs ${
                      selectedStatusFilter === 'yellow_no_permit'
                        ? 'bg-rose-600 text-white ring-2 ring-rose-400 shadow-md'
                        : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 hover:bg-rose-200 border border-rose-300 dark:border-rose-800'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping shrink-0" />
                    <span>🚨 قطاعات جارية بدون فسح ({yellowNoPermitStats.count})</span>
                  </button>
                )}

                <button
                  onClick={() => setSelectedStatusFilter('executed')}
                  className={`px-2.5 py-1 rounded-lg shrink-0 transition-colors cursor-pointer ${
                    selectedStatusFilter === 'executed'
                      ? 'bg-emerald-600 text-white font-extrabold'
                      : 'bg-emerald-100/60 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200'
                  }`}
                >
                  منفذ
                </button>
                <button
                  onClick={() => setSelectedStatusFilter('ongoing')}
                  className={`px-2.5 py-1 rounded-lg shrink-0 transition-colors cursor-pointer ${
                    selectedStatusFilter === 'ongoing'
                      ? 'bg-amber-500 text-white font-extrabold'
                      : 'bg-amber-100/60 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-200'
                  }`}
                >
                  جاري
                </button>
                <button
                  onClick={() => setSelectedStatusFilter('remaining')}
                  className={`px-2.5 py-1 rounded-lg shrink-0 transition-colors cursor-pointer ${
                    selectedStatusFilter === 'remaining'
                      ? 'bg-rose-600 text-white font-extrabold'
                      : 'bg-rose-100/60 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 hover:bg-rose-200'
                  }`}
                >
                  متبقي
                </button>
              </div>
            </div>

            {/* Region Items Scroll List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredRegions.length === 0 ? (
                <div className="p-8 text-center text-slate-400 dark:text-slate-500 space-y-2">
                  <MapPin className="w-8 h-8 mx-auto opacity-40" />
                  <p className="text-xs font-bold">لا توجد مناطق مطابقة للبحث الحركي</p>
                </div>
              ) : (
                filteredRegions.map((region) => {
                  const isSelected = activeSelectedRegion?.id === region.id;
                  const primaryStatus = (Array.from(region.statusCategories)[0] || 'ongoing') as StatusCategory;
                  const statusLabel = getStatusCategoryLabel(primaryStatus, projectName, analysisResult?.projectScope);

                  return (
                    <div
                      key={region.id}
                      onClick={() => setSelectedId(region.id)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 ${
                        isSelected
                          ? 'bg-blue-50/90 dark:bg-blue-950/60 border-blue-400 dark:border-blue-600 shadow-md ring-2 ring-blue-500/20'
                          : 'bg-white dark:bg-slate-800/80 hover:bg-slate-100/80 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-3 h-3 rounded-full shrink-0 shadow-2xs" 
                            style={{ backgroundColor: region.colorHex }}
                          />
                          <span className="font-mono font-black text-xs text-slate-900 dark:text-white">
                            {region.id}
                          </span>
                        </div>

                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono">
                          {region.totalLengthKm} كم ({region.items.length} قطع)
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span>
                          {statusLabel}
                        </span>
                        {region.streets.size > 0 && (
                          <span className="truncate max-w-[140px] text-slate-600 dark:text-slate-300">
                            📍 {Array.from(region.streets)[0]}
                          </span>
                        )}
                      </div>

                      {/* Associated IDs pill preview */}
                      {mode === 'segment' && region.associatedPermits.size > 0 && (
                        <div className="flex items-center gap-1 overflow-x-auto text-[10px]">
                          <span className="text-slate-400 shrink-0">الفسح:</span>
                          {Array.from(region.associatedPermits).slice(0, 2).map((perm, pIdx) => (
                            <span key={pIdx} className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono font-bold px-1.5 py-0.2 rounded">
                              {perm}
                            </span>
                          ))}
                          {region.associatedPermits.size > 2 && (
                            <span className="text-slate-400">+{region.associatedPermits.size - 2}</span>
                          )}
                        </div>
                      )}

                      {mode === 'permit' && region.associatedSegments.size > 0 && (
                        <div className="flex items-center gap-1 overflow-x-auto text-[10px]">
                          <span className="text-slate-400 shrink-0">السجمنت:</span>
                          {Array.from(region.associatedSegments).slice(0, 2).map((seg, sIdx) => (
                            <span key={sIdx} className="bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-mono font-bold px-1.5 py-0.2 rounded">
                              {seg}
                            </span>
                          ))}
                          {region.associatedSegments.size > 2 && (
                            <span className="text-slate-400">+{region.associatedSegments.size - 2}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Map & Focused Region Details Overlay Container */}
          <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-slate-100 dark:bg-slate-950">
            
            {/* Map Controls Floating Bar */}
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl">
              
              {/* Tile layer selector */}
              <button
                onClick={() => setTileLayerType(
                  tileLayerType === 'google' ? 'satellite' : 
                  tileLayerType === 'satellite' ? 'dark' : 
                  tileLayerType === 'dark' ? 'osm' : 'google'
                )}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                title="تغيير نوع الخريطة (Google / أقمار صناعية / وضع داكن / OSM)"
              >
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span>
                  {tileLayerType === 'google' ? 'خرائط Google' : tileLayerType === 'satellite' ? 'أقمار صناعية' : tileLayerType === 'dark' ? 'الوضع الداكن' : 'OpenStreetMap'}
                </span>
              </button>

              {/* Toggle map labels */}
              <button
                onClick={() => setShowLabelsOnMap(!showLabelsOnMap)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                  showLabelsOnMap
                    ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
                title="إظهار/إخفاء شارات ومسميات المناطق على الخريطة"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>تسميات الخريطة</span>
              </button>

              {activeSelectedRegion && isValidLatLng(activeSelectedRegion.centerLat, activeSelectedRegion.centerLng) && (
                <a
                  href={`https://www.google.com/maps?q=${activeSelectedRegion.centerLat},${activeSelectedRegion.centerLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                  title="فتح موقع هذه المنطقة في خرائط Google"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Google Maps</span>
                </a>
              )}
            </div>

            {/* Warning overlay if active region has no valid geographic coordinates */}
            {activeSelectedRegion && !activeSelectedRegion.allCoordinates.some(pt => isValidLatLng(pt[1], pt[0])) && (
              <div className="absolute top-16 right-4 left-4 z-20 bg-amber-500/90 dark:bg-amber-600/90 backdrop-blur-md text-white p-3 rounded-2xl shadow-xl flex items-center gap-3 text-xs font-bold border border-amber-400">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-100" />
                <div>
                  <p>تنبيه: {mode === 'segment' ? 'السجمنت' : 'التصريح'} ({activeSelectedRegion.id}) مسجل بجدول البيانات لكن لا توجد له مسارات خطوط KML ذات إحداثيات جغرافية رسمية.</p>
                  <p className="text-[11px] text-amber-100 font-normal mt-0.5">يتم استخدام المركز التقريبي للمشروع لعرض الخريطة.</p>
                </div>
              </div>
            )}

            {/* Leaflet Map Canvas */}
            <div ref={mapContainerRef} className="w-full h-full z-10" />

            {/* Bottom Overlay Info Card for Active Selected Region */}
            {activeSelectedRegion && (
              <div className="absolute bottom-4 right-4 left-4 lg:left-auto lg:max-w-md z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl space-y-3 text-xs animate-in slide-in-from-bottom-4 duration-200">
                
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: activeSelectedRegion.colorHex }}
                    />
                    <div>
                      <h4 className="font-black text-sm font-mono text-slate-900 dark:text-white">
                        {mode === 'segment' ? 'قطاع' : 'رخصة/فسح'} {activeSelectedRegion.id}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        إجمالي الطول: <span className="font-mono font-bold text-slate-900 dark:text-white">{activeSelectedRegion.totalLengthKm} كم</span> ({activeSelectedRegion.totalLengthMeters} متر)
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleCopyDetails}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'تم النسخ' : 'نسخ النص'}</span>
                  </button>
                </div>

                {/* Crimson alert callout if region contains yellow items without permit */}
                {activeSelectedRegion.hasYellowNoPermit && (
                  <div className="bg-rose-50 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 p-2.5 rounded-xl text-[11px] flex items-center gap-2 font-extrabold shadow-2xs">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 animate-bounce" />
                    <div>
                      <span>🚨 تنبيه قرمزي: يوجد {activeSelectedRegion.yellowNoPermitCount} قطاع جاري (باللون الأصفر) بدون رقم فسح مسجل!</span>
                      <span className="block text-[10px] text-rose-700 dark:text-rose-300 font-normal mt-0.5">
                        إجمالي طول القطاعات بدون فسح: {((activeSelectedRegion.yellowNoPermitLengthMeters || 0) / 1000).toFixed(3)} كم
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {mode === 'segment' && (
                    <div className="p-2 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
                      <span className="text-emerald-700 dark:text-emerald-300 font-bold block mb-0.5">
                        الفسوح المربوطة ({activeSelectedRegion.associatedPermits.size}):
                      </span>
                      <span className="font-mono font-black text-emerald-900 dark:text-emerald-200 truncate block">
                        {Array.from(activeSelectedRegion.associatedPermits).join(', ') || 'غير محدد'}
                      </span>
                    </div>
                  )}

                  {mode === 'permit' && (
                    <div className="p-2 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
                      <span className="text-blue-700 dark:text-blue-300 font-bold block mb-0.5">
                        القطاعات المربوطة ({activeSelectedRegion.associatedSegments.size}):
                      </span>
                      <span className="font-mono font-black text-blue-900 dark:text-blue-200 truncate block">
                        {Array.from(activeSelectedRegion.associatedSegments).join(', ') || 'غير محدد'}
                      </span>
                    </div>
                  )}

                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-500 dark:text-slate-400 font-bold block mb-0.5">
                      عدد قطع الخطوط:
                    </span>
                    <span className="font-mono font-black text-slate-900 dark:text-white block">
                      {activeSelectedRegion.items.length} قطعة
                    </span>
                  </div>
                </div>

                {/* Additional KML Attributes if available */}
                {(activeSelectedRegion.streets.size > 0 || activeSelectedRegion.districts.size > 0 || activeSelectedRegion.stages.size > 0) && (
                  <div className="p-2.5 rounded-2xl bg-slate-100/70 dark:bg-slate-800/60 text-[11px] space-y-1">
                    {activeSelectedRegion.streets.size > 0 && (
                      <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                        <Navigation className="w-3 h-3 text-blue-500 shrink-0" />
                        <b>الشارع:</b>
                        <span className="truncate">{Array.from(activeSelectedRegion.streets).join(', ')}</span>
                      </div>
                    )}
                    {activeSelectedRegion.districts.size > 0 && (
                      <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                        <Building2 className="w-3 h-3 text-amber-500 shrink-0" />
                        <b>الحي:</b>
                        <span className="truncate">{Array.from(activeSelectedRegion.districts).join(', ')}</span>
                      </div>
                    )}
                    {activeSelectedRegion.stages.size > 0 && (
                      <div className="flex items-center gap-1 text-amber-800 dark:text-amber-300">
                        <HardHat className="w-3 h-3 text-amber-500 shrink-0" />
                        <b>مرحلة الحفرية:</b>
                        <span className="truncate font-bold">{Array.from(activeSelectedRegion.stages).join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
