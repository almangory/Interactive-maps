/**
 * Color Compliance & Inspection Engine
 * Adapted from Map-tools for NWC Interactive Maps
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface ApprovedColorSpec {
  key: 'executed_water' | 'executed_sewer' | 'in_progress' | 'remaining' | 'cancelled';
  nameAr: string;
  nameEn: string;
  color: string;
}

export const APPROVED_NWC_COLORS: ApprovedColorSpec[] = [
  { key: 'executed_water', nameAr: 'منفذ - مياه', nameEn: 'Executed - Water', color: '#01579B' },
  { key: 'executed_sewer', nameAr: 'منفذ - صرف', nameEn: 'Executed - Sewer', color: '#097138' },
  { key: 'in_progress', nameAr: 'جاري العمل', nameEn: 'Work in Progress', color: '#FFEA00' },
  { key: 'remaining', nameAr: 'أعمال متبقية', nameEn: 'Remaining Work', color: '#A52714' },
  { key: 'cancelled', nameAr: 'أعمال تم الغائها', nameEn: 'Cancelled Works', color: '#F48FB1' },
];

export const EXACT_APPROVED_COLOR_MAP: Record<string, ApprovedColorSpec> = {
  '#01579B': { key: 'executed_water', nameAr: 'منفذ - مياه', nameEn: 'Executed - Water', color: '#01579B' },
  '#097138': { key: 'executed_sewer', nameAr: 'منفذ - صرف', nameEn: 'Executed - Sewer', color: '#097138' },
  '#FFEA00': { key: 'in_progress', nameAr: 'جاري العمل', nameEn: 'Work in Progress', color: '#FFEA00' },
  '#A52714': { key: 'remaining', nameAr: 'أعمال متبقية', nameEn: 'Remaining Work', color: '#A52714' },
  '#F48FB1': { key: 'cancelled', nameAr: 'أعمال تم الغائها', nameEn: 'Cancelled Works', color: '#F48FB1' },
};

export const normalizeHexToRgbHex = (hex: string): string => {
  let cleanHex = String(hex || '').trim().toUpperCase();
  if (cleanHex.startsWith('#')) cleanHex = cleanHex.substring(1);
  if (cleanHex.length === 8) cleanHex = cleanHex.substring(2); // Strip alpha
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  return '#' + cleanHex;
};

export const hexToRgb = (hex: string): RGB | null => {
  const cleanHex = normalizeHexToRgbHex(hex).substring(1);
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleanHex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

export const colorDistance = (c1: string, c2: string): number => {
  const rgb1 = hexToRgb(c1);
  const rgb2 = hexToRgb(c2);
  if (!rgb1 || !rgb2) return 1000;
  return Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) +
    Math.pow(rgb1.g - rgb2.g, 2) +
    Math.pow(rgb1.b - rgb2.b, 2)
  );
};

export interface ColorComplianceCheck {
  isCompliant: boolean;
  matchedCategory: ApprovedColorSpec;
  distance: number;
  suggestedApprovedColor: string;
  reasonAr: string;
  reasonEn: string;
}

/**
 * Validates whether a given color code complies exactly with the 5 approved NWC project codes.
 * Calculates closest distance to suggest the accurate category if non-compliant.
 */
export const checkColorCompliance = (colorHex: string): ColorComplianceCheck => {
  const cleanHex = normalizeHexToRgbHex(colorHex);
  const rgb = hexToRgb(cleanHex);

  if (!rgb || cleanHex.length !== 7) {
    return {
      isCompliant: false,
      matchedCategory: APPROVED_NWC_COLORS[3],
      distance: 999,
      suggestedApprovedColor: APPROVED_NWC_COLORS[3].color,
      reasonAr: `كود لون غير صالح أو غير مقروء (${colorHex})`,
      reasonEn: `Invalid or unreadable color code (${colorHex})`
    };
  }

  // Exact Match Check
  if (EXACT_APPROVED_COLOR_MAP[cleanHex]) {
    const matched = EXACT_APPROVED_COLOR_MAP[cleanHex];
    return {
      isCompliant: true,
      matchedCategory: matched,
      distance: 0,
      suggestedApprovedColor: matched.color,
      reasonAr: `مطابق تماماً للأكواد المعتمدة (${matched.nameAr} - ${matched.color})`,
      reasonEn: `Exact match with approved code (${matched.nameEn} - ${matched.color})`
    };
  }

  // Find nearest approved category
  let minDistance = Infinity;
  let bestCategory = APPROVED_NWC_COLORS[3];

  for (const cat of APPROVED_NWC_COLORS) {
    const dist = colorDistance(cleanHex, cat.color);
    if (dist < minDistance) {
      minDistance = dist;
      bestCategory = cat;
    }
  }

  return {
    isCompliant: false,
    matchedCategory: bestCategory,
    distance: Math.round(minDistance),
    suggestedApprovedColor: bestCategory.color,
    reasonAr: `لون مخالف للمواصفات (${cleanHex}) - الأقرب له هو: ${bestCategory.nameAr} (${bestCategory.color})`,
    reasonEn: `Non-compliant color (${cleanHex}) - Nearest approved is: ${bestCategory.nameEn} (${bestCategory.color})`
  };
};

export interface NonCompliantColorSummary {
  colorHex: string;
  count: number;
  totalLengthMeters: number;
  totalLengthKm: number;
  suggestedColor: string;
  suggestedCategoryNameAr: string;
  distance: number;
  itemIds: string[];
}

/**
 * Scans all items in a KML analysis result and aggregates all non-compliant color segments.
 */
export const auditNonCompliantColors = (items: Array<{ id: string; color?: string; lengthMeters?: number }>): NonCompliantColorSummary[] => {
  const map: Record<string, NonCompliantColorSummary> = {};

  items.forEach(item => {
    const hex = item.color || '#A52714';
    const check = checkColorCompliance(hex);
    if (!check.isCompliant) {
      const normalizedHex = normalizeHexToRgbHex(hex);
      if (!map[normalizedHex]) {
        map[normalizedHex] = {
          colorHex: normalizedHex,
          count: 0,
          totalLengthMeters: 0,
          totalLengthKm: 0,
          suggestedColor: check.suggestedApprovedColor,
          suggestedCategoryNameAr: check.matchedCategory.nameAr,
          distance: check.distance,
          itemIds: []
        };
      }
      map[normalizedHex].count += 1;
      map[normalizedHex].totalLengthMeters += item.lengthMeters || 0;
      map[normalizedHex].itemIds.push(item.id);
    }
  });

  return Object.values(map).map(summary => ({
    ...summary,
    totalLengthKm: Number((summary.totalLengthMeters / 1000).toFixed(3))
  })).sort((a, b) => b.totalLengthMeters - a.totalLengthMeters);
};
