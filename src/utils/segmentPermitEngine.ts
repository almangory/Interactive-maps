import { KMLFeatureItem, StatusCategory, KMLAnalysisResult } from '../types';
import {
  isValidIdentifier,
  getHaversineDistanceMeters,
  cleanSegmentId,
  cleanPermitNo,
  extractStrictPermitNo,
  extractStrictSegmentId
} from './myMapsKmlParser';

export interface PermitBoundaryPolygon {
  permitNo: string;
  projectName?: string;
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  coordinates?: Array<[number, number]>;
}

/**
 * 1️⃣ Header Matching & Property Extraction for Segment ID
 * Strictly searches properties, XML tags, and text for explicit Segment ID keywords and statements only.
 * Preserves all numbers, letters, and symbols/marks (e.g. SEG-101, 12/A, #44-B, 400-W-01, 24/19/01).
 */
export function extractSegmentIdFromData(
  properties: Record<string, any> | Array<{ name: string; value: string }>,
  layerName: string = '',
  descriptionText: string = '',
  featureName: string = ''
): string {
  const targetKeys = [
    'segment id', 'segment_id', 'segmentid', 'segment-id', 'segment_no', 'segment no', 'segment number', 'segment #',
    'seg_id', 'seg id', 'segid'
  ];

  // 1. Check direct properties array or object
  if (Array.isArray(properties)) {
    for (const p of properties) {
      const k = (p.name || '').trim().toLowerCase();
      const val = (p.value || '').trim();
      if (targetKeys.some(tk => k === tk || k.replace(/[\s_-]+/g, '') === tk.replace(/[\s_-]+/g, '')) && isValidIdentifier(val)) {
        const cleaned = cleanSegmentId(val);
        if (cleaned && isValidIdentifier(cleaned)) return cleaned;
      }
    }
  } else if (properties && typeof properties === 'object') {
    for (const [k, v] of Object.entries(properties)) {
      const keyLower = k.trim().toLowerCase();
      const val = String(v || '').trim();
      if (targetKeys.some(tk => keyLower === tk || keyLower.replace(/[\s_-]+/g, '') === tk.replace(/[\s_-]+/g, '')) && isValidIdentifier(val)) {
        const cleaned = cleanSegmentId(val);
        if (cleaned && isValidIdentifier(cleaned)) return cleaned;
      }
    }
  }

  // 2. Strict description & text extractor
  const fromStrictText = extractStrictSegmentId(null, descriptionText, descriptionText, featureName);
  if (fromStrictText && isValidIdentifier(fromStrictText)) {
    return fromStrictText;
  }

  return '';
}

/**
 * 2️⃣ Strict Pattern Extraction for Permit No (تصريح الحفر)
 * Strictly searches for the explicit "Permit No" statement/header and brings only its corresponding content.
 * Returns empty string if not present or placeholder, keeping yellow lines without permit accurately identified.
 */
export function extractPermitNoFromText(
  properties: Record<string, any> | Array<{ name: string; value: string }>,
  descriptionText: string = '',
  featureName: string = '',
  layerName: string = ''
): string {
  const targetKeys = [
    'permit no', 'permit_no', 'permitno', 'permit-no', 'permit number', 'permit_number', 'permit num', 'permit_num', 'permit #', 'permit_id',
    'perm_no', 'permno', 'perm no'
  ];

  // 1. Check direct properties array or object
  if (Array.isArray(properties)) {
    for (const p of properties) {
      const k = (p.name || '').trim().toLowerCase();
      const val = (p.value || '').trim();
      if (targetKeys.some(tk => k === tk || k.replace(/[\s_-]+/g, '') === tk.replace(/[\s_-]+/g, '')) && isValidIdentifier(val)) {
        const cleaned = cleanPermitNo(val);
        if (cleaned && isValidIdentifier(cleaned)) return cleaned;
      }
    }
  } else if (properties && typeof properties === 'object') {
    for (const [k, v] of Object.entries(properties)) {
      const keyLower = k.trim().toLowerCase();
      const val = String(v || '').trim();
      if (targetKeys.some(tk => keyLower === tk || keyLower.replace(/[\s_-]+/g, '') === tk.replace(/[\s_-]+/g, '')) && isValidIdentifier(val)) {
        const cleaned = cleanPermitNo(val);
        if (cleaned && isValidIdentifier(cleaned)) return cleaned;
      }
    }
  }

  // 2. Strict description & text extractor
  const fromStrictText = extractStrictPermitNo(null, descriptionText, descriptionText, featureName);
  if (fromStrictText && isValidIdentifier(fromStrictText)) {
    return fromStrictText;
  }

  return '';
}

/**
 * Helper to test if point [lat, lng] is inside polygon using ray casting
 */
function isPointInPolygon(lat: number, lng: number, polygon: Array<[number, number]>): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][1], yi = polygon[i][0]; // [lng, lat]
    const xj = polygon[j][1], yj = polygon[j][0];

    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * 3️⃣ Spatial Overlay & Geofencing for Work Permits
 * Assigns Permit No to features if they fall inside work permit boundary polygons.
 */
export function processSpatialPermitOverlay(
  items: KMLFeatureItem[],
  permitBoundaries: PermitBoundaryPolygon[] = []
): { items: KMLFeatureItem[]; matchedCount: number } {
  let matchedCount = 0;
  if (!permitBoundaries || permitBoundaries.length === 0) {
    return { items, matchedCount: 0 };
  }

  const updatedItems = items.map(item => {
    if (item.permitNo && isValidIdentifier(item.permitNo)) {
      return item; // Already has permit
    }

    if (item.centerLat === undefined || item.centerLng === undefined) {
      return item;
    }

    const lat = item.centerLat;
    const lng = item.centerLng;

    for (const pb of permitBoundaries) {
      // Must pass Bounding Box check first as quick filter
      if (pb.bounds) {
        if (lat < pb.bounds.minLat || lat > pb.bounds.maxLat ||
            lng < pb.bounds.minLng || lng > pb.bounds.maxLng) {
          continue;
        }
      }

      // Check strict ray-casting Point-In-Polygon match
      if (pb.coordinates && pb.coordinates.length >= 3) {
        if (isPointInPolygon(lat, lng, pb.coordinates)) {
          matchedCount++;
          return {
            ...item,
            permitNo: pb.permitNo
          };
        }
      }
    }

    return item;
  });

  return { items: updatedItems, matchedCount };
}

/**
 * 4️⃣ Geometrical Classification & Segment Vault System
 * If explicit Segment ID is missing:
 * - Group connected / adjacent line features within tolerance (default 2m).
 * - Generate standardized unified Segment ID: SEG-[القطر]-[النوع]-[رقم تسلسلي]
 * - Group main lines & attached branch connections under the same Vault Segment ID.
 */
export function processGeometricalSegmentationAndVault(
  items: KMLFeatureItem[],
  toleranceMeters: number = 2.0
): { items: KMLFeatureItem[]; generatedCount: number; clustersCount: number } {
  let generatedCount = 0;

  // Extract diameter numeric value e.g. "400" or "160"
  const getCleanDiameter = (it: KMLFeatureItem): string => {
    if (it.innerDiameter) {
      const match = it.innerDiameter.match(/\d+/);
      if (match) return match[0];
    }
    const nameMatch = (it.name + ' ' + it.description).match(/(?:Ø|D|قطر|mm|\b)(\d{2,4})\b/i);
    if (nameMatch) return nameMatch[1];
    return '160'; // Default standard pipe diameter
  };

  // Determine service type code
  const getServiceTypeCode = (it: KMLFeatureItem): string => {
    if (it.statusCategory === 'executed_water') return 'WATER';
    if (it.statusCategory === 'executed_sewage') return 'SEWAGE';
    if (it.statusCategory === 'ongoing') return 'ONGOING';
    if (it.statusCategory === 'remaining') return 'REMAINING';
    if (it.statusCategory === 'cancelled') return 'CANCELLED';
    return 'PIPE';
  };

  // Store existing clusters for proximity grouping (Vault System)
  interface ClusterInfo {
    id: string;
    diameter: string;
    type: string;
    points: Array<[number, number]>;
    itemsCount: number;
  }

  const clusters: ClusterInfo[] = [];

  // First pass: register existing valid segment IDs into clusters
  items.forEach(it => {
    if (it.segmentId && isValidIdentifier(it.segmentId) && it.centerLat !== undefined && it.centerLng !== undefined) {
      const diameter = getCleanDiameter(it);
      const type = getServiceTypeCode(it);
      clusters.push({
        id: it.segmentId.trim(),
        diameter,
        type,
        points: [[it.centerLng, it.centerLat]],
        itemsCount: 1
      });
    }
  });

  let nextSequence = clusters.length + 1;

  const updatedItems = items.map(item => {
    if (item.segmentId && isValidIdentifier(item.segmentId)) {
      return item; // Keep existing valid segment ID as is
    }

    // Do NOT generate default or synthetic segment IDs
    return {
      ...item,
      segmentId: ''
    };
  });

  return {
    items: updatedItems,
    generatedCount,
    clustersCount: clusters.length
  };
}

/**
 * 5️⃣ Full Pipeline for Data Formatting (قسم تنسيق البيانات)
 * Runs Header Matching, Pattern Extraction, Spatial Permit Geofencing, and Geometrical Segmentation & Vault System.
 */
export function runAttributeFormatterPipeline(
  analysisResult: KMLAnalysisResult,
  options?: {
    toleranceMeters?: number;
    permitBoundaries?: PermitBoundaryPolygon[];
  }
): {
  updatedResult: KMLAnalysisResult;
  filledPermitCount: number;
  filledSegmentCount: number;
  vaultClustersCount: number;
} {
  const tolerance = options?.toleranceMeters ?? 2.0;

  // Step 1: Run Header & Pattern Extraction for all items
  let step1Items = analysisResult.items.map(it => {
    let segId = it.segmentId || '';
    let prmNo = it.permitNo || '';

    if (!isValidIdentifier(segId)) {
      segId = extractSegmentIdFromData({}, '', it.description || '', it.name || '');
    }

    if (!isValidIdentifier(prmNo)) {
      prmNo = extractPermitNoFromText({}, it.description || '', it.name || '', '');
    }

    return {
      ...it,
      segmentId: isValidIdentifier(segId) ? segId : '',
      permitNo: isValidIdentifier(prmNo) ? prmNo : ''
    };
  });

  // Step 2: Spatial Overlay & Geofencing for Permits
  const { items: step2Items, matchedCount: filledPermitCount } = processSpatialPermitOverlay(
    step1Items,
    options?.permitBoundaries
  );

  // Step 3: Geometrical Segmentation & Segment Vault System
  const { items: finalItems, generatedCount: filledSegmentCount, clustersCount: vaultClustersCount } = processGeometricalSegmentationAndVault(
    step2Items,
    tolerance
  );

  // Step 4: Re-calculate KMLAnalysisResult stats
  const segmentSetMap: Record<StatusCategory, Set<string>> = {
    executed_water: new Set(),
    executed_sewage: new Set(),
    ongoing: new Set(),
    remaining: new Set(),
    cancelled: new Set()
  };

  const permitSetMap: Record<StatusCategory, Set<string>> = {
    executed_water: new Set(),
    executed_sewage: new Set(),
    ongoing: new Set(),
    remaining: new Set(),
    cancelled: new Set()
  };

  finalItems.forEach(it => {
    const cat = it.statusCategory;
    if (isValidIdentifier(it.segmentId)) segmentSetMap[cat].add(it.segmentId.trim());
    if (isValidIdentifier(it.permitNo)) permitSetMap[cat].add(it.permitNo.trim());
  });

  const updatedColorBreakdown = { ...analysisResult.colorBreakdown };
  (['executed_water', 'executed_sewage', 'ongoing', 'remaining', 'cancelled'] as StatusCategory[]).forEach(cat => {
    if (updatedColorBreakdown[cat]) {
      updatedColorBreakdown[cat] = {
        ...updatedColorBreakdown[cat],
        segmentCount: segmentSetMap[cat].size,
        permitCount: permitSetMap[cat].size
      };
    }
  });

  const updatedResult: KMLAnalysisResult = {
    ...analysisResult,
    items: finalItems,
    colorBreakdown: updatedColorBreakdown,
    segmentIdsByStatus: {
      executedWater: Array.from(segmentSetMap.executed_water),
      executedSewage: Array.from(segmentSetMap.executed_sewage),
      ongoing: Array.from(segmentSetMap.ongoing),
      remaining: Array.from(segmentSetMap.remaining),
      cancelled: Array.from(segmentSetMap.cancelled)
    },
    permitNosByStatus: {
      executedWater: Array.from(permitSetMap.executed_water),
      executedSewage: Array.from(permitSetMap.executed_sewage),
      ongoing: Array.from(permitSetMap.ongoing),
      remaining: Array.from(permitSetMap.remaining),
      cancelled: Array.from(permitSetMap.cancelled)
    }
  };

  return {
    updatedResult,
    filledPermitCount,
    filledSegmentCount,
    vaultClustersCount
  };
}
