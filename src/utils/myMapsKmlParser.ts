/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { KMLAnalysisResult, KMLFeatureItem, ColorStatsSummary, StatusCategory } from '../types';
import { extractSegmentIdFromData, extractPermitNoFromText, processGeometricalSegmentationAndVault, processSpatialPermitOverlay } from './segmentPermitEngine';
import length from '@turf/length';
import { lineString } from '@turf/helpers';

// Color mappings requested
export const COLOR_CONFIG: Record<StatusCategory, { hex: string; label: string; labelEn: string }> = {
  executed_water: { hex: '#01579B', label: 'منفذ - شبكات مياه', labelEn: 'Executed - Water Networks' },
  executed_sewage: { hex: '#097138', label: 'منفذ - شبكات صرف صحي', labelEn: 'Executed - Sewage Networks' },
  ongoing: { hex: '#ffea00', label: 'جاري العمل / التنفيذ', labelEn: 'Ongoing / In Progress' },
  remaining: { hex: '#a52714', label: 'أعمال متبقية', labelEn: 'Remaining Works' },
  cancelled: { hex: '#F48FB1', label: 'خطوط تم إلغائها / ملغى', labelEn: 'Cancelled Lines' }
};

/**
 * Helper to check if a project is a sewage project based on name or scope
 */
export function isSewageProject(projectName?: string, projectScope?: string): boolean {
  const name = (projectName || '').toLowerCase();
  const scope = (projectScope || '').toLowerCase();
  return scope.includes('صرف') || name.includes('صرف');
}

/**
 * Category label mapping with bilingual support
 */
export function getStatusCategoryLabel(category: StatusCategory, projectName?: string, projectScope?: string, lang: 'ar' | 'en' = 'ar'): string {
  const item = COLOR_CONFIG[category];
  if (!item) return category;
  return lang === 'en' ? item.labelEn : item.label;
}

// Calculate Haversine distance in meters between two lat/lng coordinates
export function getHaversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate precise geographic length of a LineString coordinate array in meters using @turf/length
 * @param coordsArray Array of [longitude, latitude] coordinates
 */
export function calculateTurfLineStringLength(coordsArray: Array<[number, number]>): number {
  if (!coordsArray || coordsArray.length < 2) return 0;
  try {
    const ls = lineString(coordsArray);
    const lengthMeters = length(ls, { units: 'meters' });
    if (!isNaN(lengthMeters) && lengthMeters > 0) {
      return lengthMeters;
    }
    const lengthKm = length(ls, { units: 'kilometers' });
    return (lengthKm || 0) * 1000;
  } catch (err) {
    console.warn('Turf length calculation fallback to Haversine:', err);
    let total = 0;
    for (let i = 0; i < coordsArray.length - 1; i++) {
      total += getHaversineDistanceMeters(coordsArray[i][1], coordsArray[i][0], coordsArray[i + 1][1], coordsArray[i + 1][0]);
    }
    return total;
  }
}

// Extract mid from Google My Maps link
export function extractGoogleMapsMid(link: string): string | null {
  if (!link) return null;
  const match = link.match(/mid=([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(link.trim())) return link.trim();
  return null;
}

// Extract explicit Shape_Length attribute if present in GIS / KML Placemark ExtendedData
export function extractShapeLengthAttribute(pm: Element, description: string): number | null {
  const dataElements = Array.from(pm.getElementsByTagName('Data')).concat(Array.from(pm.getElementsByTagName('SimpleData')));
  for (const dataEl of dataElements) {
    const nameAttr = (dataEl.getAttribute('name') || '').toLowerCase();
    if (
      nameAttr === 'shape_length' ||
      nameAttr === 'shapelength' ||
      nameAttr === 'shape_leng' ||
      nameAttr === 'length' ||
      nameAttr === 'st_length' ||
      nameAttr === 'shape_len' ||
      nameAttr.includes('طول') ||
      nameAttr.includes('length')
    ) {
      const valText = dataEl.getElementsByTagName('value')[0]?.textContent?.trim() || dataEl.textContent?.trim() || '';
      const num = parseFloat(valText.replace(/,/g, ''));
      if (!isNaN(num) && num > 0) {
        return num;
      }
    }
  }

  // Regex check inside description string
  const descMatch = description.match(/(?:Shape_Length|ShapeLength|Shape_Leng|ST_Length|SHAPE_LEN|Length|طول_الخط|الطول)\s*[:=]?\s*([0-9.,]+)/i);
  if (descMatch) {
    const num = parseFloat(descMatch[1].replace(/,/g, ''));
    if (!isNaN(num) && num > 0) {
      return num;
    }
  }

  return null;
}

/**
 * Extract map URL and explicit coordinates (latitude, longitude) from raw description (HTML or text) and ExtendedData
 */
export function extractMapUrlAndCoordsFromElement(
  rawDescription: string,
  descText: string,
  dataElements: Element[]
): { explicitMapUrl: string; descLat?: number; descLng?: number } {
  let explicitMapUrl = '';
  let descLat: number | undefined;
  let descLng: number | undefined;

  // 1. Extract explicit map URL from raw HTML description (checking href attributes and plain text)
  const hrefMatch = rawDescription.match(/href=["'](https?:\/\/[^"'>]+)["']/i) || rawDescription.match(/href=(https?:\/\/[^\s>]+)/i);
  if (hrefMatch && hrefMatch[1]) {
    explicitMapUrl = hrefMatch[1];
  }

  if (!explicitMapUrl) {
    const mapUrlMatch = rawDescription.match(/(https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|earth\.google\.com|maps\.google\.com)[^\s"'<>]+)/i)
                     || rawDescription.match(/(https?:\/\/[^\s"'<>]+)/i);
    if (mapUrlMatch && mapUrlMatch[1]) {
      explicitMapUrl = mapUrlMatch[1];
    }
  }

  // Check dataElements for map URL or links
  dataElements.forEach(dataEl => {
    const val = dataEl.textContent?.trim() || '';
    if (!val) return;
    if (!explicitMapUrl && (val.startsWith('http://') || val.startsWith('https://') || val.includes('maps.google') || val.includes('google.com/maps'))) {
      const urlM = val.match(/(https?:\/\/[^\s"'<>]+)/i);
      if (urlM) explicitMapUrl = urlM[1];
    }
  });

  // 2. Try extracting lat, lng from explicitMapUrl if it contains q=lat,lng or @lat,lng or ll=lat,lng
  if (explicitMapUrl) {
    const qMatch = explicitMapUrl.match(/(?:q|ll|query)=([0-9.-]+)[,%2C]+([0-9.-]+)/i) || explicitMapUrl.match(/@([0-9.-]+),([0-9.-]+)/i);
    if (qMatch) {
      const v1 = parseFloat(qMatch[1]);
      const v2 = parseFloat(qMatch[2]);
      if (!isNaN(v1) && !isNaN(v2)) {
        if (Math.abs(v1) <= 35 && Math.abs(v2) >= 30) {
          descLat = v1;
          descLng = v2;
        } else if (Math.abs(v2) <= 35 && Math.abs(v1) >= 30) {
          descLat = v2;
          descLng = v1;
        }
      }
    }
  }

  // 3. Extract coordinates from description text or HTML tags
  if (descLat === undefined || descLng === undefined) {
    // Look for explicit coordinate labels (Arabic or English)
    const labelMatch = rawDescription.match(/(?:الإحداثيات|إحداثيات|الاحداثيات|احداثيات|Coordinates|Coordinate|Location|الموقع|موقع|Point|LatLng|Lat\/Lng)\s*[:=]?\s*([0-9.-]+)\s*[,;\s%2C|]+\s*([0-9.-]+)/i)
                    || descText.match(/(?:الإحداثيات|إحداثيات|الاحداثيات|احداثيات|Coordinates|Coordinate|Location|الموقع|موقع|Point|LatLng|Lat\/Lng)\s*[:=]?\s*([0-9.-]+)\s*[,;\s%2C|]+\s*([0-9.-]+)/i);
    if (labelMatch) {
      const v1 = parseFloat(labelMatch[1]);
      const v2 = parseFloat(labelMatch[2]);
      if (!isNaN(v1) && !isNaN(v2)) {
        if (Math.abs(v1) <= 35 && Math.abs(v2) >= 30) {
          descLat = v1;
          descLng = v2;
        } else if (Math.abs(v2) <= 35 && Math.abs(v1) >= 30) {
          descLat = v2;
          descLng = v1;
        }
      }
    }
  }

  // 4. Look for separate Lat / Lng fields (Lat: 24.xxx, Lng: 46.xxx)
  if (descLat === undefined || descLng === undefined) {
    const latMatch = rawDescription.match(/(?:Lat|Latitude|خط\s*العرض|العرض|Y)\s*[:=]?\s*([0-9.-]+)/i)
                  || descText.match(/(?:Lat|Latitude|خط\s*العرض|العرض|Y)\s*[:=]?\s*([0-9.-]+)/i);
    const lngMatch = rawDescription.match(/(?:Lng|Lon|Longitude|خط\s*الطول|الطول|X)\s*[:=]?\s*([0-9.-]+)/i)
                  || descText.match(/(?:Lng|Lon|Longitude|خط\s*الطول|الطول|X)\s*[:=]?\s*([0-9.-]+)/i);
    if (latMatch && lngMatch) {
      const vLat = parseFloat(latMatch[1]);
      const vLng = parseFloat(lngMatch[1]);
      if (!isNaN(vLat) && !isNaN(vLng)) {
        descLat = vLat;
        descLng = vLng;
      }
    }
  }

  // 5. Look in dataElements for lat/lng attributes
  if (descLat === undefined || descLng === undefined) {
    let dLat: number | undefined;
    let dLng: number | undefined;
    dataElements.forEach(dataEl => {
      const nameAttr = (dataEl.getAttribute('name') || '').trim().toLowerCase();
      const val = parseFloat(dataEl.textContent?.trim() || '');
      if (isNaN(val)) return;
      if (nameAttr.includes('lat') || nameAttr.includes('y') || nameAttr.includes('عرض')) {
        dLat = val;
      } else if (nameAttr.includes('lng') || nameAttr.includes('lon') || nameAttr.includes('x') || nameAttr.includes('طول')) {
        dLng = val;
      }
    });
    if (dLat !== undefined && dLng !== undefined) {
      descLat = dLat;
      descLng = dLng;
    }
  }

  // 6. Standalone Saudi Arabia coordinates match (Lat 15-35, Lng 34-56)
  if (descLat === undefined || descLng === undefined) {
    const saudiCoordMatch = rawDescription.match(/\b([1-3][0-9]\.[0-9]{3,})\b[\s,;\/]+\b([3-5][0-9]\.[0-9]{3,})\b/)
                         || descText.match(/\b([1-3][0-9]\.[0-9]{3,})\b[\s,;\/]+\b([3-5][0-9]\.[0-9]{3,})\b/);
    if (saudiCoordMatch) {
      const v1 = parseFloat(saudiCoordMatch[1]);
      const v2 = parseFloat(saudiCoordMatch[2]);
      if (!isNaN(v1) && !isNaN(v2)) {
        descLat = v1;
        descLng = v2;
      }
    }
  }

  return { explicitMapUrl, descLat, descLng };
}

// Convert KML color format (AABBGGRR in hex) or standard hex to #RRGGBB
export function normalizeColorToHex(rawColorStr: string): string {
  if (!rawColorStr) return '';
  let str = rawColorStr.trim().toLowerCase().replace('#', '');
  
  // KML colors are 8 chars: AABBGGRR (Alpha, Blue, Green, Red)
  if (str.length === 8) {
    const bb = str.substring(2, 4);
    const gg = str.substring(4, 6);
    const rr = str.substring(6, 8);
    return `#${rr}${gg}${bb}`;
  }
  
  if (str.length === 6) {
    return `#${str}`;
  }
  
  return '';
}

// Convert hex string to RGB object
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().toLowerCase().replace('#', '');
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return { r, g, b };
    }
  }
  return null;
}

// Reference RGB coordinates for the 5 requested status categories
const TARGET_RGB: Array<{ cat: StatusCategory; r: number; g: number; b: number }> = [
  { cat: 'executed_water', r: 1, g: 87, b: 155 },   // #01579B - Blue
  { cat: 'executed_sewage', r: 9, g: 113, b: 56 },   // #097138 - Green
  { cat: 'ongoing', r: 255, g: 234, b: 0 },         // #FFEA00 - Yellow
  { cat: 'remaining', r: 165, g: 39, b: 20 },        // #A52714 - Red
  { cat: 'cancelled', r: 244, g: 143, b: 177 }       // #F48FB1 - Pink
];

// Match parsed hex color using RGB Euclidean distance or text keywords to one of the 5 status categories
export function matchStatusCategory(colorHex: string, textContext: string = ''): StatusCategory {
  const rgb = hexToRgb(colorHex);

  if (rgb) {
    let minDistance = Infinity;
    let bestCat: StatusCategory = 'ongoing';

    for (const target of TARGET_RGB) {
      // Euclidean distance in 3D RGB color space
      const dr = rgb.r - target.r;
      const dg = rgb.g - target.g;
      const db = rgb.b - target.b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);

      if (dist < minDistance) {
        minDistance = dist;
        bestCat = target.cat;
      }
    }

    return bestCat;
  }

  // Fallback to strict text keywords if color is absent
  const ctx = textContext.toLowerCase();
  if (ctx.includes('منفذ') && (ctx.includes('مياه') || ctx.includes('ماء'))) return 'executed_water';
  if (ctx.includes('منفذ') && (ctx.includes('صرف') || ctx.includes('صحى') || ctx.includes('صحي'))) return 'executed_sewage';
  if (ctx.includes('ملغى') || ctx.includes('ملغي') || ctx.includes('إلغاء') || ctx.includes('الغاء') || ctx.includes('ملغاة')) return 'cancelled';
  if (ctx.includes('متبقي') || ctx.includes('متبقية') || ctx.includes('متبق')) return 'remaining';
  if (ctx.includes('جاري') || ctx.includes('قيد التنفيذ') || ctx.includes('تحت التنفيذ')) return 'ongoing';

  return 'ongoing';
}

/**
 * Fetch a URL using the internal server-side proxy route or direct fetch
 * (Strictly avoids third-party public proxies to prevent infrastructure data leakage)
 */
async function fetchUrlWithProxy(targetUrl: string): Promise<string> {
  // 1. Try our internal server-side proxy route first
  try {
    const internalProxyUrl = `/api/fetch-kml?url=${encodeURIComponent(targetUrl)}`;
    const resp = await fetch(internalProxyUrl);
    if (resp.ok) {
      const text = await resp.text();
      if (text && (text.includes('<kml') || text.includes('<Placemark') || text.includes('<Document') || text.includes('<xml'))) {
        return text;
      }
    }
  } catch (e) {
    // Internal proxy route not available or network error
  }

  // 2. Try direct fetch with credentials omitted for CORS compliance
  try {
    const directResp = await fetch(targetUrl, { 
      cache: 'no-cache',
      credentials: 'omit',
      headers: {
        'Accept': 'application/vnd.google-earth.kml+xml, application/xml, text/xml'
      }
    });
    if (directResp.ok) {
      const text = await directResp.text();
      if (text && (text.includes('<kml') || text.includes('<Placemark') || text.includes('<Document') || text.includes('<xml'))) {
        return text;
      }
    }
  } catch (e) {
    // Direct fetch blocked by CORS or network
  }

  throw new Error(`تعذر جلب ملف الخارطة التفاعلية بأمان من الرابط: ${targetUrl}. يرجى التأكد من إتاحة الوصول للملف.`);
}

/**
 * Combines multiple KML XML string documents into a single master KML document
 */
function combineKMLTexts(kmlTexts: string[]): string {
  if (kmlTexts.length === 0) return '';
  if (kmlTexts.length === 1) return kmlTexts[0];

  const parser = new DOMParser();
  const masterDoc = parser.parseFromString('<kml xmlns="http://www.opengis.net/kml/2.2"><Document></Document></kml>', 'text/xml');
  const masterDocumentNode = masterDoc.getElementsByTagName('Document')[0] || masterDoc.documentElement;

  kmlTexts.forEach(xmlStr => {
    try {
      const doc = parser.parseFromString(xmlStr, 'text/xml');
      const styles = Array.from(doc.getElementsByTagName('Style'));
      styles.forEach(s => masterDocumentNode.appendChild(masterDoc.importNode(s, true)));

      const styleMaps = Array.from(doc.getElementsByTagName('StyleMap'));
      styleMaps.forEach(sm => masterDocumentNode.appendChild(masterDoc.importNode(sm, true)));

      const folders = Array.from(doc.getElementsByTagName('Folder'));
      folders.forEach(f => masterDocumentNode.appendChild(masterDoc.importNode(f, true)));

      const placemarks = Array.from(doc.getElementsByTagName('Placemark'));
      placemarks.forEach(p => {
        const parentTag = p.parentElement ? p.parentElement.tagName.toLowerCase() : '';
        if (parentTag !== 'folder') {
          masterDocumentNode.appendChild(masterDoc.importNode(p, true));
        }
      });
    } catch (e) {
      console.warn('Failed to parse sub-KML for combination:', e);
    }
  });

  const serializer = new XMLSerializer();
  return serializer.serializeToString(masterDoc);
}

/**
 * Fetch KML content from Google My Maps link via proxy endpoints and NetworkLink resolution
 */
export async function fetchMyMapsKML(link: string): Promise<string> {
  const mid = extractGoogleMapsMid(link);
  let initialUrl = '';

  if (mid) {
    initialUrl = `https://www.google.com/maps/d/u/0/kml?mid=${mid}&forcekml=1`;
  } else if (link.trim().startsWith('<') && link.includes('kml')) {
    return link; // Raw KML string passed
  } else if (link.trim().startsWith('http')) {
    initialUrl = link.trim();
  } else {
    throw new Error('رابط غير صالح لخرائط قوقل My Maps (لم يتم العثور على رمز mid)');
  }

  console.log(`🗺️ [Google My Maps KML] البدء في فحص واستخراج بيانات الخريطة من الرابط: ${initialUrl} (MID: ${mid || 'N/A'})`);

  // Step 1: Fetch root KML
  let rootXmlText = '';
  try {
    rootXmlText = await fetchUrlWithProxy(initialUrl);
  } catch (err) {
    if (mid) {
      const fallbackUrl = `https://www.google.com/maps/d/kml?mid=${mid}&forcekml=1`;
      rootXmlText = await fetchUrlWithProxy(fallbackUrl);
    } else {
      throw err;
    }
  }

  console.log(`📥 [Google My Maps KML] تم تحميل ملف الخريطة بنجاح بحجم: ${(rootXmlText.length / 1024).toFixed(1)} KB`);
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(rootXmlText, 'text/xml');
  const placemarks = xmlDoc.getElementsByTagName('Placemark');
  console.log(`📍 [Google My Maps KML] تم العثور على ${placemarks.length} عنصر (Placemark) في ملف الخريطة.`);

  // If placemarks exist in root document, return rootXmlText directly
  if (placemarks.length > 0) {
    return rootXmlText;
  }

  // Step 2: Check for NetworkLink elements (Google My Maps multi-layer link)
  const networkLinks = Array.from(xmlDoc.getElementsByTagName('NetworkLink'));
  const subUrls: string[] = [];

  networkLinks.forEach(nl => {
    const hrefNode = nl.getElementsByTagName('href')[0] || nl.getElementsByTagName('Link')[0]?.getElementsByTagName('href')[0];
    if (hrefNode && hrefNode.textContent) {
      let subUrl = hrefNode.textContent.trim().replace(/&amp;/g, '&');
      if (subUrl.startsWith('/')) {
        subUrl = `https://www.google.com${subUrl}`;
      }
      subUrls.push(subUrl);
    }
  });

  if (subUrls.length > 0) {
    const subKmlTexts: string[] = [];
    for (const subUrl of subUrls) {
      try {
        const subText = await fetchUrlWithProxy(subUrl);
        if (subText && (subText.includes('<kml') || subText.includes('<Placemark') || subText.includes('<Document'))) {
          subKmlTexts.push(subText);
        }
      } catch (e) {
        console.warn(`Failed to fetch sub-KML NetworkLink: ${subUrl}`, e);
      }
    }

    if (subKmlTexts.length > 0) {
      return combineKMLTexts(subKmlTexts);
    }
  }

  return rootXmlText;
}

/**
 * Robustly parses KML coordinate string into array of [longitude, latitude] tuples.
 * Handles:
 * - "lng,lat,alt lng,lat,alt"
 * - "lng, lat, alt \n lng, lat, alt"
 * - "lng,lat,alt,lng,lat,alt"
 * - "lng,lat lng,lat"
 */
export function parseKmlCoordinatesText(text: string): Array<[number, number]> {
  if (!text) return [];
  const points: Array<[number, number]> = [];

  // Match numbers separated by commas (with optional whitespace)
  const regex = /(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*,\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?:\s*,\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?))?/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const lng = parseFloat(match[1]);
    const lat = parseFloat(match[2]);
    if (!isNaN(lng) && !isNaN(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      if (points.length === 0 || (points[points.length - 1][0] !== lng || points[points.length - 1][1] !== lat)) {
        points.push([lng, lat]);
      }
    }
  }

  // Fallback if space-delimited without commas
  if (points.length < 2) {
    const gxRegex = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)(?:\s+(-?\d+(?:\.\d+)?))?/g;
    while ((match = gxRegex.exec(text)) !== null) {
      const lng = parseFloat(match[1]);
      const lat = parseFloat(match[2]);
      if (!isNaN(lng) && !isNaN(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        if (points.length === 0 || (points[points.length - 1][0] !== lng || points[points.length - 1][1] !== lat)) {
          points.push([lng, lat]);
        }
      }
    }
  }

  return points;
}

/**
 * Strips field statement prefixes like "Segment ID:", "Segment ID =", etc.
 * Preserves the actual identifier content including all numbers, letters, and symbols/signs (e.g. SEG-101, 12/A, #44-B, 400-W-01, 24/19/01).
 * Truncates before any concatenated downstream field headers (like Permit No:, Stage:, etc.).
 */
export interface IdentifierAuditResult {
  raw: string;
  isEmpty: boolean; // True if empty, only '-' or invalid placeholder (من النواقص)
  isValid: boolean; // True if compliant with standards
  hasLeadingDash?: boolean; // For Segment ID: has '-' before content
  isNonDigits?: boolean; // For Permit No: not pure digits or contains spaces/dashes
  warningMessage?: string; // Alert message describing the detected issue
}

/**
 * 🔍 Audit and detect format compliance for Segment ID (Detection Only - No Mutation)
 * Rule: Must NOT contain '-' before the content. If only '-', it is considered empty/non-existent (النواقص).
 */
export function auditSegmentId(val: any): IdentifierAuditResult {
  if (val === null || val === undefined) {
    return { raw: '', isEmpty: true, isValid: false, warningMessage: 'غير مسجل (من النواقص)' };
  }
  const raw = String(val).trim();
  if (!raw) {
    return { raw: '', isEmpty: true, isValid: false, warningMessage: 'غير مسجل (من النواقص)' };
  }

  const lower = raw.toLowerCase();
  const invalidKeywords = [
    '-', '/', '--', '//', '---', '///', '-/-', '- / -', '-/', '/-', '/ -', '- /', 'n/a', 'na', 'none', 'null',
    'undefined', 'بدون', 'لا يوجد', 'لايوجد', 'غير محدد', 'غير متوفر', 'فراغ', 'بدون سجمنت', 'لا يوجد سجمنت', '0', '00', '000', '0000', 'nan'
  ];

  if (invalidKeywords.includes(lower) || /^[-–—_#/\\:;.\s]+$/.test(raw)) {
    return { raw, isEmpty: true, isValid: false, warningMessage: 'فارغ / يحتوي على (-) فقط (من النواقص)' };
  }

  // Detection: Check if starts with '-' before content
  if (/^[-–—]/.test(raw)) {
    return {
      raw,
      isEmpty: false,
      isValid: false,
      hasLeadingDash: true,
      warningMessage: 'تنبيه تنسيق: يحتوي على (-) قبل محتوى البيان'
    };
  }

  return { raw, isEmpty: false, isValid: true };
}

/**
 * 🔍 Audit and detect format compliance for Permit No (Detection Only - No Mutation)
 * Rule: Must contain PURE DIGITS ONLY without leading spaces, trailing spaces, dashes (-), or letters.
 * If only '-', it is considered empty/non-existent (النواقص).
 */
export function auditPermitNo(val: any): IdentifierAuditResult {
  if (val === null || val === undefined) {
    return { raw: '', isEmpty: true, isValid: false, warningMessage: 'بدون فسح (من النواقص)' };
  }
  const raw = String(val).trim();
  if (!raw) {
    return { raw: '', isEmpty: true, isValid: false, warningMessage: 'بدون فسح (من النواقص)' };
  }

  const lower = raw.toLowerCase();
  const invalidKeywords = [
    '-', '/', '--', '//', '---', '///', '-/-', '- / -', '-/', '/-', '/ -', '- /', 'n/a', 'na', 'none', 'null',
    'undefined', 'بدون', 'لا يوجد', 'لايوجد', 'غير محدد', 'غير متوفر', 'فراغ', 'بدون تصريح', 'بدون فسح', 'لا', 'لايوجد تصريح',
    'لا يوجد تصريح', 'لا يوجد فسح', 'لايوجد فسح', 'بدون سجمنت', 'لا يوجد سجمنت', '0', '00', '000', '0000', 'nan'
  ];

  if (invalidKeywords.includes(lower) || /^[-–—_#/\\:;.\s]+$/.test(raw)) {
    return { raw, isEmpty: true, isValid: false, warningMessage: 'فارغ / يحتوي على (-) فقط (من النواقص)' };
  }

  // Detection: Check if strictly digits only (without leading spaces, dashes, or letters)
  const isAllDigits = /^[0-9٠-٩]+$/.test(raw);
  if (!isAllDigits || /^[-–—\s]/.test(val) || /[^0-9٠-٩]/.test(raw)) {
    return {
      raw,
      isEmpty: false,
      isValid: false,
      isNonDigits: true,
      warningMessage: 'تنبيه تنسيق: رقم الفسح يجب أن يحتوي على أرقام فقط وبدون فراغ أو (-)'
    };
  }

  return { raw, isEmpty: false, isValid: true };
}

/**
 * Strips field statement prefixes like "Segment ID:", "Segment ID =", etc.
 * Preserves the actual user content as-is (Detection Only - No silent mutation).
 * Returns empty string ('') if value is only '-' or invalid placeholder (considered missing/نواقص).
 */
export function cleanSegmentId(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (!str) return '';

  // 1. Remove Segment ID statement prefixes only (case-insensitive)
  str = str.replace(/^(?:segment\s*id|segment_id|segment-id|segment\s*no|segment_no|segment\s*#|seg_id|segid|سجمنت|رقم\s*السجمنت|القطاع|رقم\s*القطاع)\s*[:=–—#=-]\s*/i, '');
  str = str.replace(/^(?:segment\s*id|segment_id|سجمنت|القطاع)\s+/i, '');

  // 2. Truncate before any downstream joined field labels if concatenated
  const downstreamRegex = /(?:^|\s+)(?:-|–|—)?\s*(?:PERMIT|PERMITNO|PERMIT_NO|PERMIT_NUMBER|PERM_NO|STAGE|CONTRACTOR|PROJECTNAME|PROJECTID|STREETNAME|STREET_NAME|DISTRICT|SHAPE_Length|SHAPE_LENGTH|ZONE|ZONE_NO|INNERDIAMETER|DRILLING|تصريح|رخصة|فسح|مرحلة|المقاول|اسم\s*المشروع|رقم\s*المشروع|اسم\s*الشارع|الحي|القطر|المنطقة)\s*[:=]/i;
  const match = str.match(downstreamRegex);
  if (match && match.index !== undefined && match.index > 0) {
    str = str.substring(0, match.index).trim();
  }

  // 3. Clean outer quotes only, preserve internal characters and dashes
  str = str.replace(/^["'`]+|["'`]+$/g, '').trim();

  if (!str) return '';

  // 4. If value is '-' only or placeholder, return '' (considered missing data / نواقص)
  const lower = str.toLowerCase();
  const invalidKeywords = [
    '-', '/', '--', '//', '---', '///', '-/-', '- / -', '-/', '/-', '/ -', '- /', 'n/a', 'na', 'none', 'null',
    'undefined', 'بدون', 'لا يوجد', 'لايوجد', 'غير محدد', 'غير متوفر', 'فراغ', 'بدون سجمنت', 'لا يوجد سجمنت', '0', '00', '000', '0000', 'nan',
    'segment id', 'segment_id', 'segment', 'seg', 'sec', 'id', 'id:'
  ];

  if (invalidKeywords.includes(lower) || /^[-–—_#/\\:;.\s]+$/.test(str)) {
    return '';
  }

  return str;
}

/**
 * Strips label prefixes like "Permit No:", "permit_no:", etc.
 * Preserves the actual user content as-is (Detection Only - No silent mutation).
 * Returns empty string ('') if value is only '-' or invalid placeholder (considered missing/نواقص).
 */
export function cleanPermitNo(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (!str) return '';

  // 1. Remove Permit No prefixes strictly
  str = str.replace(/^(?:permit\s*no|permit_no|permitno|permit-no|permit\s*number|permit_number|permit\s*num|permit_num|permit\s*#|permit_id|perm_no|permno|perm\s*no|perm\s*num|رقم\s*الفسح|رقم\s*التصريح|الفسح|التصريح|فسح|تصريح)\s*[:=–—#=-]\s*/i, '');
  str = str.replace(/^(?:permit\s*no|permit_no|permitno|perm_no|الفسح|التصريح)\s+/i, '');

  // 2. Truncate before any downstream joined field labels if concatenated
  const downstreamRegex = /(?:^|\s+)(?:-|–|—)?\s*(?:ZONE|ZONE_NO|DRILLING|DRILLING_TYPE|DRILLINGTYPE|STAGE|CONTRACTOR|CONTRACTOR_NAME|PROJECTNAME|PROJECT_NAME|PROJECTID|PROJECT_ID|SHAPE_LENGTH|SHAPE_Length|SHAPE_LEN|STREETNAME|STREET_NAME|DISTRICT|INNERDIAMETER|INNER_DIAMETER|SEGMENT|SEGMENTID|SEGMENT_ID|SEG_ID|OBJECTID|FID|المقاول|الحي|الشارع|المرحلة)\s*[:=]/i;
  const match = str.match(downstreamRegex);
  if (match && match.index !== undefined) {
    if (match.index === 0) {
      return '';
    }
    str = str.substring(0, match.index).trim();
  }

  // 3. Clean outer quotes only, preserve internal characters
  str = str.replace(/^["'`]+|["'`]+$/g, '').trim();

  if (!str) return '';

  // 4. If value is '-' only or placeholder, return '' (considered missing data / نواقص)
  const lower = str.toLowerCase();
  const invalidKeywords = [
    '-', '/', '--', '//', '---', '///', '-/-', '- / -', '-/', '/-', '/ -', '- /', 'n/a', 'na', 'none', 'null',
    'undefined', 'بدون', 'لا يوجد', 'لايوجد', 'غير محدد', 'غير متوفر', 'فراغ', 'بدون تصريح', 'بدون فسح', 'لا', 'لايوجد تصريح',
    'لا يوجد تصريح', 'لا يوجد فسح', 'لايوجد فسح', 'بدون سجمنت', 'لا يوجد سجمنت', '0', '00', '000', '0000', 'nan'
  ];

  if (invalidKeywords.includes(lower) || /^[-–—_#/\\:;.\s]+$/.test(str)) {
    return '';
  }

  return str;
}

/**
 * Strict Extraction of Permit No from Placemark elements, HTML description table rows, or structured text.
 */
export function extractStrictPermitNo(
  pm?: Element | null,
  rawDescription: string = '',
  descText: string = '',
  featureName: string = ''
): string {
  const permitKeys = [
    'permit no', 'permit_no', 'permitno', 'permit-no', 'permit number', 'permit_number', 'permit num', 'permit_num', 'permit #', 'permit_id',
    'perm_no', 'permno', 'perm no'
  ];

  // 1. Check Data and SimpleData elements in Placemark (ExtendedData)
  if (pm) {
    const dataElements = Array.from(pm.getElementsByTagName('Data')).concat(Array.from(pm.getElementsByTagName('SimpleData')));
    for (const el of dataElements) {
      const nameAttr = (el.getAttribute('name') || '').trim().toLowerCase();
      const displayName = el.getElementsByTagName('displayName')[0]?.textContent?.trim().toLowerCase() || '';
      
      const isMatch = permitKeys.some(k => nameAttr === k || nameAttr.replace(/[\s_-]+/g, '') === k.replace(/[\s_-]+/g, '') || displayName === k);
      if (isMatch) {
        const val = el.getElementsByTagName('value')[0]?.textContent?.trim() || el.textContent?.trim() || '';
        const cleaned = cleanPermitNo(val);
        if (cleaned && isValidIdentifier(cleaned)) {
          return cleaned;
        }
      }
    }
  }

  // 2. Check HTML Description Table rows (<tr><td>Permit No</td><td>2206604</td></tr>)
  if (rawDescription && rawDescription.includes('<')) {
    const rowRegex = /<tr[^>]*>\s*<(?:td|th)[^>]*>(.*?)<\/(?:td|th)>\s*<(?:td|th)[^>]*>(.*?)<\/(?:td|th)>\s*<\/tr>/gi;
    let match;
    while ((match = rowRegex.exec(rawDescription)) !== null) {
      const cell1Text = match[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
      const cell2Raw = match[2].replace(/<[^>]+>/g, '').trim();

      const isCell1Key = permitKeys.some(k => cell1Text === k || cell1Text.replace(/[\s_:-]+/g, '') === k.replace(/[\s_:-]+/g, ''));
      if (isCell1Key) {
        const cleaned = cleanPermitNo(cell2Raw);
        if (cleaned && isValidIdentifier(cleaned)) {
          return cleaned;
        }
      }

      // Check if inverted (cell 2 is key e.g. 'Permit No', cell 1 is value e.g. '2206604')
      const isCell2Key = permitKeys.some(k => cell2Raw.toLowerCase() === k || cell2Raw.toLowerCase().replace(/[\s_:-]+/g, '') === k.replace(/[\s_:-]+/g, ''));
      if (isCell2Key) {
        const cleaned = cleanPermitNo(match[1].replace(/<[^>]+>/g, '').trim());
        if (cleaned && isValidIdentifier(cleaned)) {
          return cleaned;
        }
      }
    }

    // Check HTML bold / span labels e.g. <b>Permit No:</b> 2206604 or <span class="atr-name">Permit No:</span> 2206604
    const htmlLabelRegex = /(?:<b>|<strong>|<span[^>]*>)?\s*(?:Permit\s*No|Permit_No|PermitNo|Permit\s*Number|Permit\s*#|Perm_No)\s*(?:<\/b>|<\/strong>|<\/span>)?\s*[:=]\s*([^<\n\r]+)/i;
    const htmlMatch = rawDescription.match(htmlLabelRegex);
    if (htmlMatch && htmlMatch[1]) {
      const cleaned = cleanPermitNo(htmlMatch[1]);
      if (cleaned && isValidIdentifier(cleaned)) {
        return cleaned;
      }
    }
  }

  // 3. Multi-line inspection for Google My Maps formats (Strict single-line matches only)
  const fullText = `${rawDescription}\n${descText}`.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>|<\/div>/gi, '\n');
  const lines = fullText.split(/\r?\n/).map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);

  for (const line of lines) {
    // Format 1: "Permit No: 2206604" or "Permit_No = 2206604"
    const colonMatch = line.match(/^(?:Permit\s*No|Permit_No|PermitNo|Perm_No)\s*[:=–—#-]\s*([^\s,;]+)/i);
    if (colonMatch && colonMatch[1]) {
      const cleaned = cleanPermitNo(colonMatch[1]);
      if (cleaned && isValidIdentifier(cleaned)) {
        return cleaned;
      }
    }

    // Format 2: Suffix format on same line: "2206604 Permit No"
    const suffixMatch = line.match(/^([A-Za-z0-9_/-]{3,30})\s+(?:Permit\s*No|Permit_No|PermitNo|Perm_No)$/i);
    if (suffixMatch && suffixMatch[1]) {
      const cleaned = cleanPermitNo(suffixMatch[1]);
      if (cleaned && isValidIdentifier(cleaned)) {
        return cleaned;
      }
    }
  }

  // 4. Check plain text with strict Permit No label followed by colon/equals
  const plainText = `${descText}`.replace(/<[^>]+>/g, ' ');
  const textLineRegex = /(?:^|[\n\r;|,])\s*(?:Permit\s*No|Permit_No|PermitNo|Permit\s*Number|PERMIT\s*NO|PERM_NO)\s*[:=]\s*([^\n\r<,;|]+)/i;
  const textMatch = plainText.match(textLineRegex);
  if (textMatch && textMatch[1]) {
    const cleaned = cleanPermitNo(textMatch[1]);
    if (cleaned && isValidIdentifier(cleaned)) {
      return cleaned;
    }
  }

  return '';
}

/**
 * Strict Extraction of Segment ID from Placemark elements, HTML description table rows, or structured text.
 * Strictly searches for the "Segment ID" header/statement only (Segment ID, Segment_ID, SegmentID, Segment No, Seg ID)
 * and retrieves only its corresponding value without any other naming or aliases.
 * Preserves all numbers, letters, and symbols/marks (e.g. SEG-101, 12/A, #44-B, 400-W-01, 24/19/01).
 */
export function extractStrictSegmentId(
  pm?: Element | null,
  rawDescription: string = '',
  descText: string = '',
  featureName: string = ''
): string {
  const segmentKeys = [
    'segment id', 'segment_id', 'segmentid', 'segment-id', 'segment_no', 'segment no', 'segment number', 'segment #',
    'seg_id', 'seg id', 'segid'
  ];

  // 1. Check Data and SimpleData elements in Placemark (ExtendedData)
  if (pm) {
    const dataElements = Array.from(pm.getElementsByTagName('Data')).concat(Array.from(pm.getElementsByTagName('SimpleData')));
    for (const el of dataElements) {
      const nameAttr = (el.getAttribute('name') || '').trim().toLowerCase();
      const displayName = el.getElementsByTagName('displayName')[0]?.textContent?.trim().toLowerCase() || '';

      const isMatch = segmentKeys.some(k => nameAttr === k || nameAttr.replace(/[\s_-]+/g, '') === k.replace(/[\s_-]+/g, '') || displayName === k);
      if (isMatch) {
        const val = el.getElementsByTagName('value')[0]?.textContent?.trim() || el.textContent?.trim() || '';
        const cleaned = cleanSegmentId(val);
        if (cleaned && isValidIdentifier(cleaned)) {
          return cleaned;
        }
      }
    }
  }

  // 2. Check HTML Description Table rows (<tr><td>Segment ID</td><td>SEG-101</td></tr>)
  if (rawDescription && rawDescription.includes('<')) {
    const rowRegex = /<tr[^>]*>\s*<(?:td|th)[^>]*>(.*?)<\/(?:td|th)>\s*<(?:td|th)[^>]*>(.*?)<\/(?:td|th)>\s*<\/tr>/gi;
    let match;
    while ((match = rowRegex.exec(rawDescription)) !== null) {
      const cell1Text = match[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
      const cell2Text = match[2].replace(/<[^>]+>/g, '').trim();

      const isCell1Key = segmentKeys.some(k => cell1Text === k || cell1Text.replace(/[\s_:-]+/g, '') === k.replace(/[\s_:-]+/g, ''));
      if (isCell1Key) {
        const cleaned = cleanSegmentId(cell2Text);
        if (cleaned && isValidIdentifier(cleaned)) {
          return cleaned;
        }
      }

      // Check inverted
      const isCell2Key = segmentKeys.some(k => cell2Text.toLowerCase() === k || cell2Text.toLowerCase().replace(/[\s_:-]+/g, '') === k.replace(/[\s_:-]+/g, ''));
      if (isCell2Key) {
        const cleaned = cleanSegmentId(match[1].replace(/<[^>]+>/g, '').trim());
        if (cleaned && isValidIdentifier(cleaned)) {
          return cleaned;
        }
      }
    }

    // Check HTML bold / span labels
    const htmlLabelRegex = /(?:<b>|<strong>|<span[^>]*>)?\s*(?:Segment\s*ID|Segment_ID|SegmentID|Segment\s*No|Segment\s*#|SEG_ID|SEGID)\s*(?:<\/b>|<\/strong>|<\/span>)?\s*[:=#-]\s*([^<\n\r]+)/i;
    const htmlMatch = rawDescription.match(htmlLabelRegex);
    if (htmlMatch && htmlMatch[1]) {
      const cleaned = cleanSegmentId(htmlMatch[1]);
      if (cleaned && isValidIdentifier(cleaned)) {
        return cleaned;
      }
    }
  }

  // 3. Check plain text lines with strict Segment ID label
  const plainText = `${descText} ${featureName}`.replace(/<[^>]+>/g, ' ');
  const textLineRegex = /(?:^|[\n\r;|,])\s*(?:Segment\s*ID|Segment_ID|SegmentID|SEGMENT\s*ID|SEG_ID|SEGID|Segment\s*No)\s*[:=#-]\s*([^\n\r<,;|]+)/i;
  const textMatch = plainText.match(textLineRegex);
  if (textMatch && textMatch[1]) {
    const cleaned = cleanSegmentId(textMatch[1]);
    if (cleaned && isValidIdentifier(cleaned)) {
      return cleaned;
    }
  }

  return '';
}

/**
 * Cleans and extracts the Stage (مرحلة العمل/الحفرية) string.
 * Cuts off any concatenated downstream attributes (like CONTRACTOR, PROJECTNAME, STREETNAME, SHAPE_Length, etc.).
 * If the result is empty, contains only dashes (-), or is an invalid placeholder, returns 'غير متوفر'.
 */
export function cleanStage(val: any): string {
  if (val === null || val === undefined) return 'غير متوفر';
  let str = String(val).trim();
  if (!str) return 'غير متوفر';

  // 1. Remove leading field labels like "Stage:", "بيان Stage:", "مرحلة:", "وضع الحفرية:", "حالة الحفرية:"
  str = str.replace(/^(?:بيان\s*Stage|Stage|مرحلة|وضع\s*الحفرية|حالة\s*الحفرية)[\s_:#=-]+/i, '').trim();

  // 2. Truncate before any concatenated downstream key-value pairs or field labels
  const keywordRegex = /(?:^|\s+)(?:-|–|—)?\s*(?:CONTRACTOR|PROJECTNAME|PROJECTID|STREETNAME|STREET_NAME|DISTRICT|SHAPE_Length|SHAPE_LENGTH|PERMIT|PERMITNO|PERMIT_NO|SEGMENT|SEGMENTID|SEG_ID|ZONE|ZONE_NO|INNERDIAMETER|DRILLING|المقاول|اسم\s*المشروع|رقم\s*المشروع|اسم\s*الشارع|الحي|تصريح|القطر|المنطقة)\s*[:=]/i;
  const match = str.match(keywordRegex);
  if (match && match.index !== undefined) {
    if (match.index === 0) {
      // String starts directly with downstream label like "- CONTRACTOR:", so no actual stage value precedes it
      return 'غير متوفر';
    }
    str = str.substring(0, match.index).trim();
  }

  // 3. Truncate if a secondary uppercase attribute key pattern like " KEY:" appears
  const secondaryKeyMatch = str.match(/\s+[A-Z0-9_]{3,}\s*:/);
  if (secondaryKeyMatch && secondaryKeyMatch.index !== undefined && secondaryKeyMatch.index > 0) {
    str = str.substring(0, secondaryKeyMatch.index).trim();
  }

  // 4. Clean leading/trailing punctuation, dashes, colons, spaces, symbols
  str = str.replace(/^[-\s:=–—_#;,.]+|[-\s:=–—_#;,.]+$/g, '').trim();

  if (!str) return 'غير متوفر';

  // 5. Check if string is an invalid placeholder or only symbols/dashes
  const lower = str.toLowerCase();
  const invalidPlaceholders = [
    '-', '--', '---', '/', '.', 'n/a', 'na', 'none', 'null', 'undefined',
    'لا يوجد', 'غير محدد', 'غير متوفر', 'لم تحدد', 'لاشيء', 'لايوجد', 'no', '0', '00'
  ];

  if (invalidPlaceholders.includes(lower) || /^[-–—_#\s/\\:;.]+$/.test(str)) {
    return 'غير متوفر';
  }

  return str;
}

/**
 * Validates whether a Segment ID, Permit No, or text field contains a meaningful value.
 * Returns false if the value is empty, null, undefined, or consists only of
 * spaces, dashes (-), slashes (/), backslashes (\), underscores (_), or placeholders (e.g. N/A, none, بدون, - / -).
 */
export function isValidIdentifier(val: any): boolean {
  if (val === null || val === undefined) return false;
  const rawStr = String(val).trim();
  if (rawStr.length === 0) return false;

  const lowerRaw = rawStr.toLowerCase();
  const invalidRawKeywords = [
    '-', '--', '---', '/', '.', 'id', 'id:', 'segment id', 'segment_id', 'segment', 'seg', 'sec',
    'permit', 'permit no', 'permit_no', 'permitno', 'ermit', 'perm', 'prm',
    'رقم', 'تصريح', 'فسح', 'سجمنت', 'قطاع', 'معرف', 'اسم', 'رمز', 'القطاع', 'السجمنت'
  ];
  if (invalidRawKeywords.includes(lowerRaw) || /^[-–—_#/\\:;.\s]+$/.test(rawStr)) return false;

  const cleanedSeg = cleanSegmentId(rawStr);
  const cleanedPerm = cleanPermitNo(rawStr);

  return cleanedSeg.length > 0 || cleanedPerm.length > 0;
}

/**
 * Checks if a KML feature item is in yellow color (#ffea00 / ongoing status) AND lacks a valid permit number.
 */
export function isYellowItemWithoutPermit(item: KMLFeatureItem | any): boolean {
  if (!item || typeof item !== 'object') return false;

  // 1. Check if color or status category is yellow / ongoing
  const color = (item.colorHex || item.color_hex || item.color || item.hex || '').toLowerCase();
  const statusCat = (item.statusCategory || item.status_category || '').toLowerCase();
  const statusLbl = (item.statusLabel || item.status_label || item.label || '').toLowerCase();
  const stage = (item.stage || item.itemStage || '').toLowerCase();

  const isYellow = color === '#ffea00' || color === '#ffeb3b' || color === '#ffff00' ||
                   color === '#f59e0b' || color === '#eab308' || color === '#facc15' ||
                   color === '#ffd600' || color === '#ffee58' || color === '#fff176' ||
                   color === '#fbc02d' || color === '#f57f17' || color.includes('yellow') ||
                   color.includes('amber') || color.includes('gold') ||
                   statusCat === 'ongoing' || statusCat === 'جاري' || statusCat === 'جاري العمل' ||
                   statusLbl.includes('جاري') || statusLbl.includes('ongoing');

  if (!isYellow) return false;

  // 2. Check if permitNo is missing or invalid
  const rawPerm = item.permitNo !== undefined ? item.permitNo : (item.permit_no !== undefined ? item.permit_no : (item as any)['Permit No']);
  if (rawPerm === null || rawPerm === undefined || String(rawPerm).trim() === '') return true;

  const cleanPerm = cleanPermitNo(rawPerm);
  const hasNoPermit = !cleanPerm || !isValidIdentifier(cleanPerm);

  return hasNoPermit;
}

/**
 * Checks if a KML feature item has the red color (#a52714 / remaining status) AND lacks a valid Segment ID.
 * As per requirements: empty strings, spaces only, '-' or '--' only do NOT qualify as a valid Segment ID.
 */
export function isRedItemWithoutSegmentId(item: KMLFeatureItem | any): boolean {
  if (!item || typeof item !== 'object') return false;

  // 1. Check if color or status category is red (#a52714 / remaining)
  const color = (item.colorHex || item.color_hex || item.color || item.hex || '').toLowerCase().trim();
  const statusCat = (item.statusCategory || item.status_category || '').toLowerCase().trim();
  const statusLbl = (item.statusLabel || item.status_label || item.label || '').toLowerCase().trim();

  const isRed = color === '#a52714' || color === '#d93025' || color === '#c5221f' ||
                color === '#ea4335' || color === '#e53935' || color === '#ef4444' ||
                color === '#dc2626' || color === '#b71c1c' || color.includes('red') ||
                statusCat === 'remaining' || statusCat === 'متبقي' || statusCat === 'أعمال متبقية' ||
                statusLbl.includes('متبقي') || statusLbl.includes('remaining');

  if (!isRed) return false;

  // 2. Check if segmentId is missing, empty, only dashes/spaces, or invalid placeholder
  const rawSeg = item.segmentId !== undefined ? item.segmentId : (item.segment_id !== undefined ? item.segment_id : (item as any)['Segment ID']);
  if (rawSeg === null || rawSeg === undefined) return true;

  const str = String(rawSeg).trim();
  if (!str || str === '-' || /^[-–—_#/\\:;.\s]+$/.test(str)) return true;

  const cleanSeg = cleanSegmentId(rawSeg);
  const hasNoSegmentId = !cleanSeg || !isValidIdentifier(cleanSeg);

  return hasNoSegmentId;
}

/**
 * Parse KML XML string into analytical dataset
 */
export function parseKMLContent(xmlString: string, projectName: string = 'مشروع الخارطة التفاعلية', mapUrl: string = '', projectScope?: string): KMLAnalysisResult {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  const placemarks = Array.from(xmlDoc.getElementsByTagName('Placemark'));

  // Build style color dictionary from <Style> and <StyleMap> nodes
  const styleColorMap: Record<string, string> = {};

  // Parse <Style> elements
  const styleNodes = Array.from(xmlDoc.getElementsByTagName('Style'));
  styleNodes.forEach(styleNode => {
    const id = styleNode.getAttribute('id');
    if (!id) return;

    let hex = '';
    const lineStyle = styleNode.getElementsByTagName('LineStyle')[0];
    const colorNode = lineStyle ? lineStyle.getElementsByTagName('color')[0] : styleNode.getElementsByTagName('color')[0];
    
    if (colorNode && colorNode.textContent) {
      hex = normalizeColorToHex(colorNode.textContent);
    }
    
    if (!hex) {
      // Try to extract 6-digit hex from Style ID itself (e.g., line-01579B-1200)
      const hexMatch = id.match(/([0-9A-Fa-f]{6})/);
      if (hexMatch) {
        hex = `#${hexMatch[1]}`;
      }
    }

    if (hex) {
      styleColorMap[`#${id}`] = hex;
      styleColorMap[id] = hex;
    }
  });

  // Parse <StyleMap> elements
  const styleMapNodes = Array.from(xmlDoc.getElementsByTagName('StyleMap'));
  styleMapNodes.forEach(smNode => {
    const id = smNode.getAttribute('id');
    if (!id) return;

    let targetStyleUrl = '';
    const pairs = Array.from(smNode.getElementsByTagName('Pair'));
    pairs.forEach(p => {
      const key = p.getElementsByTagName('key')[0]?.textContent?.trim();
      if (key === 'normal' || !targetStyleUrl) {
        targetStyleUrl = p.getElementsByTagName('styleUrl')[0]?.textContent?.trim() || '';
      }
    });

    let hex = '';
    if (targetStyleUrl && styleColorMap[targetStyleUrl]) {
      hex = styleColorMap[targetStyleUrl];
    } else {
      const hexMatch = id.match(/([0-9A-Fa-f]{6})/);
      if (hexMatch) {
        hex = `#${hexMatch[1]}`;
      }
    }

    if (hex) {
      styleColorMap[`#${id}`] = hex;
      styleColorMap[id] = hex;
    }
  });

  const items: KMLFeatureItem[] = [];

  placemarks.forEach((pm, idx) => {
    // Process all GIS placemarks (LineString, Track, MultiLineString, Polygon, LinearRing, MultiGeometry)
    const allChildElements = Array.from(pm.getElementsByTagName('*'));
    
    // Find all line and polygon geometry nodes
    const lineStringNodes = allChildElements.filter(el => {
      const name = (el.localName || el.tagName || '').toLowerCase();
      return name === 'linestring' || name === 'track' || name === 'multilinestring' || name === 'linearring' || name === 'polygon';
    });

    // Also look for coordinates elements directly in Placemark if no wrapper node found
    const directCoordsNodes = lineStringNodes.length === 0 ? Array.from(pm.getElementsByTagName('coordinates')) : [];

    const name = pm.getElementsByTagName('name')[0]?.textContent?.trim() || `قطاع خط ${idx + 1}`;
    const description = pm.getElementsByTagName('description')[0]?.textContent?.trim() || '';
    const styleUrl = pm.getElementsByTagName('styleUrl')[0]?.textContent?.trim() || '';
    const descText = description.replace(/<[^>]+>/g, ' ');

    // Extract all ExtendedData / Balloon fields
    let segmentId = extractStrictSegmentId(pm, description, descText, name);
    let permitNo = extractStrictPermitNo(pm, description, descText, name);
    let extractedColor = '';
    let extractedStage = '';
    let streetName = '';
    let district = '';
    let innerDiameter = '';
    let zone = '';
    let drillingType = '';
    let contractor = '';
    let kmlProjectName = '';
    let kmlProjectId = '';
    let explicitMapUrl = '';

    const dataElements = Array.from(pm.getElementsByTagName('Data')).concat(Array.from(pm.getElementsByTagName('SimpleData')));
    dataElements.forEach(dataEl => {
      const nameAttr = (dataEl.getAttribute('name') || '').trim().toLowerCase();
      const val = dataEl.textContent?.trim() || '';
      if (!val) return;

      if (val.startsWith('http://') || val.startsWith('https://')) {
        explicitMapUrl = val;
      }

      if (nameAttr.includes('color') || nameAttr.includes('اللون') || nameAttr.includes('لون')) {
        extractedColor = val;
      } else if (nameAttr.includes('stage') || nameAttr.includes('مرحلة') || nameAttr.includes('حفرية') || nameAttr.includes('وضع')) {
        extractedStage = cleanStage(val);
      } else if (nameAttr.includes('street') || nameAttr.includes('شارع')) {
        streetName = val;
      } else if (nameAttr.includes('district') || nameAttr.includes('hay') || nameAttr.includes('حي')) {
        district = val;
      } else if (nameAttr.includes('diameter') || nameAttr.includes('قطر')) {
        innerDiameter = val;
      } else if (nameAttr.includes('zone') || nameAttr.includes('منطقة') || nameAttr.includes('زون')) {
        zone = val;
      } else if (nameAttr.includes('drilling') || nameAttr.includes('حفر')) {
        drillingType = val;
      } else if (nameAttr.includes('contractor') || nameAttr.includes('مقاول') || nameAttr.includes('شركة')) {
        contractor = val;
      } else if (nameAttr.includes('projectname') || nameAttr.includes('اسم المشروع')) {
        kmlProjectName = val;
      } else if (nameAttr.includes('projectid') || nameAttr.includes('رقم المشروع')) {
        kmlProjectId = val;
      }
    });

    if (!explicitMapUrl) {
      const urlInDesc = description.match(/(https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|earth\.google\.com|maps\.google\.com)[^\s"'<>]+)/i)
                     || description.match(/(https?:\/\/[^\s"'<>]+)/i);
      if (urlInDesc && urlInDesc[1]) {
        explicitMapUrl = urlInDesc[1];
      }
    }

    if (!isValidIdentifier(segmentId)) {
      segmentId = extractSegmentIdFromData({}, '', descText, name);
    }
    if (!isValidIdentifier(permitNo)) {
      permitNo = extractPermitNoFromText({}, descText, name, '');
    }
    if (!extractedStage || extractedStage === 'غير متوفر') {
      const stageMatch = descText.match(/(?:بيان\s*Stage|Stage|مرحلة|وضع\s*الحفرية|حالة\s*الحفرية)\s*[:=]?\s*([^\n\r<,]+)/i);
      if (stageMatch) {
        const cleaned = cleanStage(stageMatch[1]);
        if (cleaned !== 'غير متوفر') {
          extractedStage = cleaned;
        }
      }
    }
    if (!streetName) {
      const m = descText.match(/(?:STREETNAME|STREET_NAME|STREET|الشارع|اسم الشارع)\s*[:=]?\s*([^\r\n<,]+)/i) || descText.match(/([^\r\n<,]+)\s+STREETNAME/i);
      if (m && m[1] && isValidIdentifier(m[1])) streetName = m[1].trim();
    }
    if (!district) {
      const m = descText.match(/(?:DISTRICT|HAY|NEIGHBORHOOD|الحي|حي)\s*[:=]?\s*([^\r\n<,]+)/i) || descText.match(/([^\r\n<,]+)\s+DISTRICT/i);
      if (m && m[1] && isValidIdentifier(m[1])) district = m[1].trim();
    }
    if (!innerDiameter) {
      const m = descText.match(/(?:INNERDIAMETER|INNER_DIAMETER|DIAMETER|القطر الداخلي|القطر_الداخلي|القطر)\s*[:=]?\s*([0-9.,A-Za-z_-]+)/i) || descText.match(/([0-9.,A-Za-z_-]+)\s+INNERDIAMETER/i);
      if (m && m[1] && isValidIdentifier(m[1])) innerDiameter = m[1].trim();
    }
    if (!zone) {
      const m = descText.match(/(?:ZONE|ZONE_NO|المنطقة|منطقة|زون)\s*[:=]?\s*([0-9.,A-Za-z_-]+)/i) || descText.match(/([0-9.,A-Za-z_-]+)\s+ZONE/i);
      if (m && m[1] && isValidIdentifier(m[1])) zone = m[1].trim();
    }
    if (!drillingType) {
      const m = descText.match(/(?:Drilling\s*type|DRILLING_TYPE|DRILLINGTYPE|نوع\s*الحفر|طريقة\s*الحفر)\s*[:=]?\s*([^\r\n<,]+)/i) || descText.match(/([^\r\n<,]+)\s+Drilling\s*type/i);
      if (m && m[1] && isValidIdentifier(m[1])) drillingType = m[1].trim();
    }
    if (!contractor) {
      const m = descText.match(/(?:CONTRACTOR|CONTRACTOR_NAME|المقاول|شركة\s*المقاولات|اسم\s*المقاول)\s*[:=]?\s*([^\r\n<,]+)/i) || descText.match(/([^\r\n<,]+)\s+CONTRACTOR/i);
      if (m && m[1] && isValidIdentifier(m[1])) contractor = m[1].trim();
    }
    if (!kmlProjectName) {
      const m = descText.match(/(?:PROJECTNAME|PROJECT_NAME|اسم\s*المشروع)\s*[:=]?\s*([^\r\n<,]+)/i) || descText.match(/([^\r\n<,]+)\s+PROJECTNAME/i);
      if (m && m[1] && isValidIdentifier(m[1])) kmlProjectName = m[1].trim();
    }
    if (!kmlProjectId) {
      const m = descText.match(/(?:PROJECTID|PROJECT_ID|رقم\s*المشروع|معرف\s*المشروع)\s*[:=]?\s*([0-9.,A-Za-z_-]+)/i) || descText.match(/([0-9.,A-Za-z_-]+)\s+PROJECTID/i);
      if (m && m[1] && isValidIdentifier(m[1])) kmlProjectId = m[1].trim();
    }

    // Extract map URL and explicit coordinates from description (HTML/text) and ExtendedData/SimpleData
    const extractedGeo = extractMapUrlAndCoordsFromElement(description, descText, dataElements);
    if (extractedGeo.explicitMapUrl) {
      explicitMapUrl = extractedGeo.explicitMapUrl;
    }

    // Clean out invalid segmentId and permitNo (e.g. whitespace, '-', '/', 'N/A')
    segmentId = cleanSegmentId(segmentId);
    if (!isValidIdentifier(segmentId)) {
      segmentId = '';
    }
    permitNo = cleanPermitNo(permitNo);
    if (!isValidIdentifier(permitNo)) {
      permitNo = '';
    }

    // Determine hex color with maximum fallback coverage
    let hexColor = extractedColor ? normalizeColorToHex(extractedColor) : '';
    
    // Check inline LineStyle / Style inside placemark
    if (!hexColor) {
      const inlineLS = pm.getElementsByTagName('LineStyle')[0];
      const inlineColor = inlineLS ? inlineLS.getElementsByTagName('color')[0] : pm.getElementsByTagName('color')[0];
      if (inlineColor && inlineColor.textContent) {
        hexColor = normalizeColorToHex(inlineColor.textContent);
      }
    }

    // Check styleColorMap
    if (!hexColor && styleUrl && styleColorMap[styleUrl]) {
      hexColor = styleColorMap[styleUrl];
    }

    // Check 6-digit hex code embedded in styleUrl itself
    if (!hexColor && styleUrl) {
      const match = styleUrl.match(/([0-9A-Fa-f]{6})/);
      if (match) {
        hexColor = `#${match[1]}`;
      }
    }

    // Check 6-digit hex code in description or name
    if (!hexColor) {
      const match = (description + ' ' + name).match(/#([0-9A-Fa-f]{6})/);
      if (match) {
        hexColor = `#${match[1]}`;
      }
    }

    // 1. Calculate actual geographic line length in meters strictly from LineString coordinates using parseKmlCoordinatesText
    let geoMeters = 0;
    let coordsCount = 0;
    const allCoordinates: Array<[number, number]> = [];
    let sumLat = 0;
    let sumLng = 0;
    let validPtsCount = 0;

    const targetGeomNodes = lineStringNodes.length > 0 ? lineStringNodes : directCoordsNodes;
    targetGeomNodes.forEach(ls => {
      let coordsText = '';
      const coordsNode = (ls.localName || ls.tagName || '').toLowerCase() === 'coordinates' 
        ? ls 
        : Array.from(ls.getElementsByTagName('*')).find(el => (el.localName || el.tagName || '').toLowerCase() === 'coordinates');
      
      if (coordsNode && coordsNode.textContent) {
        coordsText = coordsNode.textContent;
      } else {
        coordsText = ls.textContent || '';
      }

      const pointsLngLat = parseKmlCoordinatesText(coordsText);

      pointsLngLat.forEach(pt => {
        allCoordinates.push(pt);
        sumLng += pt[0];
        sumLat += pt[1];
        validPtsCount++;
      });

      coordsCount += pointsLngLat.length;
      if (pointsLngLat.length >= 2) {
        const turfLengthMeters = calculateTurfLineStringLength(pointsLngLat);
        let haversineMeters = 0;
        for (let p = 0; p < pointsLngLat.length - 1; p++) {
          haversineMeters += getHaversineDistanceMeters(
            pointsLngLat[p][1], pointsLngLat[p][0],
            pointsLngLat[p + 1][1], pointsLngLat[p + 1][0]
          );
        }
        const preciseLength = (turfLengthMeters > 0 && !isNaN(turfLengthMeters)) 
          ? Math.max(turfLengthMeters, haversineMeters) 
          : haversineMeters;
        geoMeters += preciseLength;
      }
    });

    let centerLat: number | undefined = extractedGeo.descLat;
    let centerLng: number | undefined = extractedGeo.descLng;

    if ((centerLat === undefined || centerLng === undefined) && validPtsCount > 0) {
      centerLat = Number((sumLat / validPtsCount).toFixed(7));
      centerLng = Number((sumLng / validPtsCount).toFixed(7));
    }

    let googleMapsUrl: string | undefined = explicitMapUrl || extractedGeo.explicitMapUrl || undefined;
    if (!googleMapsUrl && centerLat !== undefined && centerLng !== undefined && !isNaN(centerLat) && !isNaN(centerLng)) {
      googleMapsUrl = `https://www.google.com/maps?q=${centerLat},${centerLng}`;
    }

    // 2. Check explicit Shape_Length attribute as secondary backup if geometry points were absent
    const explicitShapeLength = extractShapeLengthAttribute(pm, description);

    // Final precise length calculation priority: @turf/length from actual geometry coordinates > explicit GIS attribute
    let finalLengthMeters = 0;
    if (geoMeters > 0) {
      finalLengthMeters = geoMeters;
    } else if (explicitShapeLength !== null && explicitShapeLength > 0) {
      finalLengthMeters = explicitShapeLength;
    }

    const textCtx = `${name} ${description} ${segmentId} ${permitNo} ${streetName} ${district}`;
    const category = matchStatusCategory(hexColor, textCtx);
    const assignedConfig = COLOR_CONFIG[category];
    const statusLabel = getStatusCategoryLabel(category, projectName, projectScope);

    let itemStage = cleanStage(extractedStage);

    items.push({
      id: `feature-${idx + 1}`,
      name,
      segmentId,
      permitNo,
      colorHex: assignedConfig.hex,
      statusCategory: category,
      statusLabel,
      lengthMeters: Math.round(finalLengthMeters),
      lengthKm: Number((finalLengthMeters / 1000).toFixed(3)),
      coordinatesCount: coordsCount || 2,
      description,
      stage: itemStage,

      // Extended Balloon Attributes
      streetName: streetName || name,
      district: district || undefined,
      innerDiameter: innerDiameter || undefined,
      zone: zone || undefined,
      drillingType: drillingType || undefined,
      contractor: contractor || undefined,
      kmlProjectName: kmlProjectName || projectName,
      kmlProjectId: kmlProjectId || undefined,
      centerLat,
      centerLng,
      googleMapsUrl,
      coordinates: allCoordinates.length > 0 ? allCoordinates : undefined
    });
  });

  return generateFinalAnalysisResult(items, projectName, mapUrl, projectScope);
}

/**
 * Generate fallback analytical dataset if XML parsing or network fetching requires full synthetic extraction
 */
export function generateSyntheticProjectKMLData(
  projectName: string, 
  mapUrl: string,
  projectScope?: string
): KMLAnalysisResult {
  let projHash = 0;
  for (let c = 0; c < projectName.length; c++) {
    projHash = (projHash * 31 + projectName.charCodeAt(c)) % 10000;
  }
  projHash = Math.abs(projHash) || 101;

  const seed = (projHash * 17) % 50;
  const itemsCount = 18 + (seed % 12); // 18 to 30 line segments

  const categories: StatusCategory[] = [
    'executed_water',
    'executed_sewage',
    'ongoing',
    'remaining',
    'cancelled'
  ];

  const items: KMLFeatureItem[] = [];
  const sampleStages = ['حفر وتمديد', 'تم وضع الصبات', 'دفان واختبار', 'تم السفلتة والتنفيذ'];
  const isSewage = isSewageProject(projectName, projectScope);

  for (let i = 0; i < itemsCount; i++) {
    // Distribute categories
    let cat: StatusCategory = 'ongoing';
    if (i % 5 === 0) cat = 'executed_water';
    else if (i % 5 === 1) cat = 'executed_sewage';
    else if (i % 5 === 2) cat = 'ongoing';
    else if (i % 5 === 3) cat = 'remaining';
    else cat = 'cancelled';

    const config = COLOR_CONFIG[cat];
    const statusLabel = getStatusCategoryLabel(cat, projectName, projectScope);
    const segNum = (projHash * 100) + (i + 1);
    const permNum = 20250000 + (projHash * 10) + ((i * 7) % 80) + 1;

    const segmentId = `SEG-${segNum}`;
    // Intentionally leave permitNo empty for some ongoing elements to test missing permit notice
    const permitNo = (cat === 'ongoing' && i % 4 === 0) ? '' : `PERM-${permNum}`;

    const lengthMeters = 180 + ((i * 127) % 850);
    const itemStage = cat === 'ongoing' ? sampleStages[i % sampleStages.length] : undefined;

    const lineTypeLabel = cat === 'executed_water' 
      ? (isSewage ? 'صرف' : 'مياه') 
      : cat === 'executed_sewage' ? 'صرف' : 'تنفيذي';

    const sampleStreets = ['شارع الجريسي', 'شارع العليا', 'طريق الملك فهد', 'شارع الإمام مسلم', 'طريق الدائري الجنوبي', 'شارع خالد بن الوليد'];
    const sampleDistricts = ['الدار البيضاء', 'المناخ', 'العزيزية', 'الشفا', 'الياسمين', 'النرجس'];
    const sampleContractors = ['شركة دائن للمقاولات', 'شركة الإنشاءات الوطنية', 'شركة شبه الجزيرة', 'شركة طويق للمقاولات'];
    const sampleDiameters = ['400', '600', '800', '1000', '1200'];

    const streetName = sampleStreets[i % sampleStreets.length];
    const district = sampleDistricts[i % sampleDistricts.length];
    const contractor = sampleContractors[i % sampleContractors.length];
    const innerDiameter = sampleDiameters[i % sampleDiameters.length];
    const zone = `${(i % 3) + 1}`;
    const drillingType = i % 2 === 0 ? 'حفر مفتوح' : 'حفر ثقبي (دفع هيدروليكي)';

    // Generate Riyadh area coordinates around lat 24.582, lng 46.806
    const baseLat = 24.582043 + (i * 0.0035);
    const baseLng = 46.806716 + (i * 0.0028);
    const centerLat = Number(baseLat.toFixed(7));
    const centerLng = Number(baseLng.toFixed(7));
    const googleMapsUrl = `https://www.google.com/maps?q=${centerLat},${centerLng}`;

    const syntheticCoords: Array<[number, number]> = [
      [Number((baseLng - 0.001).toFixed(7)), Number((baseLat - 0.001).toFixed(7))],
      [centerLng, centerLat],
      [Number((baseLng + 0.001).toFixed(7)), Number((baseLat + 0.001).toFixed(7))]
    ];

    items.push({
      id: `sym-feature-${i + 1}`,
      name: `قطاع خط ${lineTypeLabel} - ${streetName}`,
      segmentId,
      permitNo,
      colorHex: config.hex,
      statusCategory: cat,
      statusLabel,
      lengthMeters,
      lengthKm: Number((lengthMeters / 1000).toFixed(3)),
      coordinatesCount: 8 + (i % 6),
      description: `مخطط خط تنفيذ ${statusLabel} للمشروع ${projectName}`,
      stage: itemStage,

      // Extended Balloon Details
      streetName,
      district,
      innerDiameter,
      zone,
      drillingType,
      contractor,
      kmlProjectName: projectName,
      kmlProjectId: `PRJ-2012500${(i % 5) + 1}`,
      centerLat,
      centerLng,
      googleMapsUrl,
      coordinates: syntheticCoords
    });
  }

  return generateFinalAnalysisResult(items, projectName, mapUrl, projectScope);
}

/**
 * Helper to consolidate items into final KMLAnalysisResult
 */
function generateFinalAnalysisResult(
  rawItems: KMLFeatureItem[], 
  projectName: string, 
  mapUrl: string,
  projectScope?: string
): KMLAnalysisResult {
  // Step 1: Process Spatial Permit Overlay (Geofencing)
  const { items: step1Items } = processSpatialPermitOverlay(rawItems);

  // Step 2: Process Geometrical Classification & Segment Vault System (Assigns SEG-[diameter]-[type]-[seq] if missing)
  const { items } = processGeometricalSegmentationAndVault(step1Items, 2.0);

  let totalMeters = 0;
  items.forEach(it => totalMeters += it.lengthMeters);

  const categories: StatusCategory[] = ['executed_water', 'executed_sewage', 'ongoing', 'remaining', 'cancelled'];

  const colorBreakdown: Record<StatusCategory, ColorStatsSummary> = {
    executed_water: { colorHex: COLOR_CONFIG.executed_water.hex, label: getStatusCategoryLabel('executed_water', projectName, projectScope), category: 'executed_water', totalLengthMeters: 0, totalLengthKm: 0, segmentCount: 0, permitCount: 0, percentage: 0 },
    executed_sewage: { colorHex: COLOR_CONFIG.executed_sewage.hex, label: getStatusCategoryLabel('executed_sewage', projectName, projectScope), category: 'executed_sewage', totalLengthMeters: 0, totalLengthKm: 0, segmentCount: 0, permitCount: 0, percentage: 0 },
    ongoing: { colorHex: COLOR_CONFIG.ongoing.hex, label: getStatusCategoryLabel('ongoing', projectName, projectScope), category: 'ongoing', totalLengthMeters: 0, totalLengthKm: 0, segmentCount: 0, permitCount: 0, percentage: 0 },
    remaining: { colorHex: COLOR_CONFIG.remaining.hex, label: getStatusCategoryLabel('remaining', projectName, projectScope), category: 'remaining', totalLengthMeters: 0, totalLengthKm: 0, segmentCount: 0, permitCount: 0, percentage: 0 },
    cancelled: { colorHex: COLOR_CONFIG.cancelled.hex, label: getStatusCategoryLabel('cancelled', projectName, projectScope), category: 'cancelled', totalLengthMeters: 0, totalLengthKm: 0, segmentCount: 0, permitCount: 0, percentage: 0 }
  };

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

  items.forEach(it => {
    const cat = it.statusCategory;
    colorBreakdown[cat].totalLengthMeters += it.lengthMeters;
    if (isValidIdentifier(it.segmentId)) segmentSetMap[cat].add(it.segmentId.trim());
    if (isValidIdentifier(it.permitNo)) permitSetMap[cat].add(it.permitNo.trim());
  });

  categories.forEach(cat => {
    const cb = colorBreakdown[cat];
    cb.totalLengthKm = Number((cb.totalLengthMeters / 1000).toFixed(3));
    cb.segmentCount = segmentSetMap[cat].size;
    cb.permitCount = permitSetMap[cat].size;
    cb.percentage = totalMeters > 0 ? Number(((cb.totalLengthMeters / totalMeters) * 100).toFixed(1)) : 0;
  });

  const yellowNoPermitItems = items.filter(isYellowItemWithoutPermit);
  const yellowNoPermitMeters = yellowNoPermitItems.reduce((sum, it) => sum + (it.lengthMeters || 0), 0);
  const yellowNoPermitKm = Number((yellowNoPermitMeters / 1000).toFixed(3));
  const yellowNoPermitSegments = yellowNoPermitItems.map(it => it.segmentId || it.name).filter(Boolean);

  colorBreakdown.ongoing.yellowNoPermitCount = yellowNoPermitItems.length;
  colorBreakdown.ongoing.yellowNoPermitMeters = yellowNoPermitMeters;
  colorBreakdown.ongoing.yellowNoPermitKm = yellowNoPermitKm;
  colorBreakdown.ongoing.yellowNoPermitSegments = yellowNoPermitSegments;

  const redNoSegmentItems = items.filter(isRedItemWithoutSegmentId);
  const redNoSegmentMeters = redNoSegmentItems.reduce((sum, it) => sum + (it.lengthMeters || 0), 0);
  const redNoSegmentKm = Number((redNoSegmentMeters / 1000).toFixed(3));
  const redNoSegmentFeatures = redNoSegmentItems.map(it => it.name || it.id).filter(Boolean);

  colorBreakdown.remaining.redNoSegmentCount = redNoSegmentItems.length;
  colorBreakdown.remaining.redNoSegmentMeters = redNoSegmentMeters;
  colorBreakdown.remaining.redNoSegmentKm = redNoSegmentKm;
  colorBreakdown.remaining.redNoSegmentFeatures = redNoSegmentFeatures;

  return {
    projectName,
    projectScope,
    mapUrl,
    totalLengthMeters: totalMeters,
    totalLengthKm: Number((totalMeters / 1000).toFixed(3)),
    totalFeaturesCount: items.length,
    colorBreakdown,
    yellowNoPermitStats: {
      count: yellowNoPermitItems.length,
      lengthMeters: yellowNoPermitMeters,
      lengthKm: yellowNoPermitKm,
      segments: yellowNoPermitSegments
    },
    redNoSegmentStats: {
      count: redNoSegmentItems.length,
      lengthMeters: redNoSegmentMeters,
      lengthKm: redNoSegmentKm,
      features: redNoSegmentFeatures
    },
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
    },
    items,
    parsedAt: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString('ar-SA')
  };
}

/**
 * Main function required: handleLoadMyMapsLink
 * Imports data from Google My Maps link and converts directly to analysis data
 */
export async function handleLoadMyMapsLink(
  link: string, 
  projectName?: string, 
  projectScope?: string
): Promise<KMLAnalysisResult> {
  const name = projectName || 'تحليل الخريطة التفاعلية';
  const kmlXml = await fetchMyMapsKML(link);
  return parseKMLContent(kmlXml, name, link, projectScope);
}
