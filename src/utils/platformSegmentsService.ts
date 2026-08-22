/**
 * @license
 * Platform Segments & Infrastructure Reconciliation Service
 * Handles data fetching, Excel parsing, and smart gap analysis / reconciliation 
 * between the National Infrastructure Platform and Google My Maps KML features.
 */

import * as XLSX from 'xlsx';
import { PlatformSegment, SegmentReconciliationSummary, KMLFeatureItem } from '../types';
import { neonDb, neonSql } from './neonClient';

/**
 * Normalizes a segment ID for flexible string matching across formats
 */
export function normalizeSegmentId(idStr: string): string {
  if (!idStr) return '';
  return idStr.trim().toLowerCase().replace(/[\s\-_]/g, '');
}

/**
 * Checks if a map feature's text/description matches a platform segment ID
 */
export function isMapFeatureMatchingSegment(feature: KMLFeatureItem, seg: PlatformSegment): boolean {
  if (!seg.segmentMapId) return false;

  const targetFull = seg.segmentMapId.trim().toLowerCase();
  const targetNorm = normalizeSegmentId(targetFull);

  // Extract short suffix (e.g. "s776342" from "83645-20072-1776342039172-s776342")
  const suffixMatch = targetFull.match(/s\d+/i);
  const suffix = suffixMatch ? suffixMatch[0].toLowerCase() : '';

  // Extract long timestamp number if present (e.g. "1776342039172")
  const numMatch = targetFull.match(/\d{10,}/);
  const numPart = numMatch ? numMatch[0] : '';

  // Check against feature's parsed segmentId
  if (feature.segmentId) {
    const fId = feature.segmentId.trim().toLowerCase();
    const fNorm = normalizeSegmentId(fId);
    if (fId === targetFull || fNorm === targetNorm) return true;
    if (suffix && fId.includes(suffix)) return true;
    if (numPart && fId.includes(numPart)) return true;
    if (targetFull.includes(fId) && fId.length >= 6) return true;
  }

  // Check against feature name
  if (feature.name) {
    const fName = feature.name.trim().toLowerCase();
    const fNorm = normalizeSegmentId(fName);
    if (fName === targetFull || fNorm.includes(targetNorm)) return true;
    if (suffix && fName.includes(suffix)) return true;
    if (numPart && fName.includes(numPart)) return true;
    if (fName.includes(targetFull)) return true;
  }

  // Check against description / raw HTML
  if (feature.description) {
    const fDesc = feature.description.toLowerCase();
    if (fDesc.includes(targetFull)) return true;
    if (suffix && fDesc.includes(suffix)) return true;
    if (numPart && fDesc.includes(numPart)) return true;
  }

  return false;
}

/**
 * Determines if a platform segment status indicates cancellation
 */
export function isSegmentStatusCancelled(statusStr?: string): boolean {
  if (!statusStr) return false;
  const s = statusStr.trim().toLowerCase();
  return (
    s.includes('ملغي') || 
    s.includes('ملغى') || 
    s.includes('الغاء') || 
    s.includes('إلغاء') || 
    s.includes('cancel')
  );
}

/**
 * Determines if a platform segment status indicates initial closure / completion (مغلق أولياً)
 * When closed initially, it is excluded from being reported as missing from the map.
 */
export function isSegmentStatusInitiallyClosed(statusStr?: string): boolean {
  if (!statusStr) return false;
  const s = statusStr.trim().toLowerCase();
  return (
    s.includes('مغلق') || 
    s.includes('مقفول') || 
    s.includes('منتهي') || 
    s.includes('closed') ||
    s.includes('initially closed')
  );
}

/**
 * Fetch all platform segments for a specific project PO or project name
 */
export async function fetchPlatformSegmentsForProject(po?: string, projectName?: string): Promise<PlatformSegment[]> {
  try {
    let rows: any[] = [];
    const cleanPo = (po || '').trim();
    const cleanName = (projectName || '').trim();

    if (cleanPo) {
      const res = await neonSql`
        SELECT * FROM platform_segments 
        WHERE po_number = ${cleanPo} 
        ORDER BY id ASC;
      `;
      rows = res || [];
    }

    // Fallback search by project name if no rows found by PO
    if (rows.length === 0 && cleanName) {
      const res = await neonSql`
        SELECT * FROM platform_segments 
        WHERE project_name ILIKE ${'%' + cleanName + '%'} 
        ORDER BY id ASC;
      `;
      rows = res || [];
    }

    return rows.map((r: any) => ({
      id: r.id,
      poNumber: r.po_number || '',
      projectName: r.project_name || '',
      segmentMapId: r.segment_map_id || '',
      segmentLength: parseFloat(r.segment_length) || 0,
      neighborhoods: r.neighborhoods || '',
      governorate: r.governorate || '',
      streets: r.streets || '',
      segmentStatus: r.segment_status || 'منسق',
      projectCode: r.project_code || '',
      contractor: r.contractor || '',
      asset: r.asset || '',
      work: r.work || '',
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  } catch (err) {
    console.error('Error fetching platform segments from Neon:', err);
    return [];
  }
}

/**
 * Fetch all platform segments in the system
 */
export async function fetchAllPlatformSegments(): Promise<PlatformSegment[]> {
  try {
    const res = await neonSql`
      SELECT * FROM platform_segments 
      ORDER BY po_number ASC, id ASC;
    `;
    return (res || []).map((r: any) => ({
      id: r.id,
      poNumber: r.po_number || '',
      projectName: r.project_name || '',
      segmentMapId: r.segment_map_id || '',
      segmentLength: parseFloat(r.segment_length) || 0,
      neighborhoods: r.neighborhoods || '',
      governorate: r.governorate || '',
      streets: r.streets || '',
      segmentStatus: r.segment_status || 'منسق',
      projectCode: r.project_code || '',
      contractor: r.contractor || '',
      asset: r.asset || '',
      work: r.work || '',
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  } catch (err) {
    console.error('Error fetching all platform segments:', err);
    return [];
  }
}

/**
 * Bulk save / upsert platform segments into Neon PostgreSQL
 */
export async function savePlatformSegmentsBulk(segments: PlatformSegment[]): Promise<{ success: boolean; count: number }> {
  if (!segments || segments.length === 0) {
    return { success: true, count: 0 };
  }

  try {
    let savedCount = 0;
    const batchSize = 40;

    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize);
      
      for (const seg of batch) {
        await neonSql`
          INSERT INTO platform_segments (
            po_number, project_name, segment_map_id, segment_length,
            neighborhoods, governorate, streets, segment_status,
            project_code, contractor, asset, work
          )
          VALUES (
            ${seg.poNumber || ''}, ${seg.projectName || ''}, ${seg.segmentMapId}, ${seg.segmentLength || 0},
            ${seg.neighborhoods || ''}, ${seg.governorate || ''}, ${seg.streets || ''}, ${seg.segmentStatus || 'منسق'},
            ${seg.projectCode || ''}, ${seg.contractor || ''}, ${seg.asset || ''}, ${seg.work || ''}
          )
          ON CONFLICT (po_number, segment_map_id) DO UPDATE SET
            project_name = EXCLUDED.project_name,
            segment_length = EXCLUDED.segment_length,
            neighborhoods = EXCLUDED.neighborhoods,
            governorate = EXCLUDED.governorate,
            streets = EXCLUDED.streets,
            segment_status = EXCLUDED.segment_status,
            project_code = EXCLUDED.project_code,
            contractor = EXCLUDED.contractor,
            asset = EXCLUDED.asset,
            work = EXCLUDED.work,
            updated_at = NOW();
        `;
        savedCount++;
      }
    }

    return { success: true, count: savedCount };
  } catch (err) {
    console.error('Error saving platform segments bulk:', err);
    throw err;
  }
}

/**
 * Reconciles platform segments against extracted map features for a project
 */
export function reconcileProjectSegments(
  platformSegments: PlatformSegment[],
  mapFeatures: KMLFeatureItem[],
  poNumber: string = '',
  projectName: string = ''
): SegmentReconciliationSummary {
  const missingSegments: PlatformSegment[] = [];
  const cancelledOnMapSegments: { platformSegment: PlatformSegment; matchedMapFeature?: KMLFeatureItem }[] = [];
  const compliantSegments: { platformSegment: PlatformSegment; matchedMapFeature: KMLFeatureItem }[] = [];

  const matchedMapFeatureIds = new Set<string>();

  let totalPlatformLengthMeters = 0;
  let totalMissingLengthMeters = 0;
  let totalCancelledOnMapLengthMeters = 0;
  let totalCompliantLengthMeters = 0;

  for (const seg of platformSegments) {
    totalPlatformLengthMeters += seg.segmentLength || 0;
    const isCancelled = isSegmentStatusCancelled(seg.segmentStatus);
    const isInitiallyClosed = isSegmentStatusInitiallyClosed(seg.segmentStatus);

    // Find if any map feature matches this segment
    const matchedFeature = mapFeatures.find(f => isMapFeatureMatchingSegment(f, seg));

    if (isCancelled) {
      // 🚫 If status is CANCELLED in platform (ملغي / بانتظار الموافقة على الإلغاء):
      // If it is STILL found on the map, trigger Alert 2 (Must be deleted from map)
      if (matchedFeature) {
        matchedMapFeatureIds.add(matchedFeature.id);
        cancelledOnMapSegments.push({
          platformSegment: seg,
          matchedMapFeature: matchedFeature
        });
        totalCancelledOnMapLengthMeters += seg.segmentLength || matchedFeature.lengthMeters || 0;
      }
    } else if (isInitiallyClosed) {
      // ℹ️ If status is INITIALLY CLOSED in platform (مغلق أولياً / مغلق):
      // Excluded from missing segments! It is completed/closed, so missing alert is NOT triggered.
      if (matchedFeature) {
        matchedMapFeatureIds.add(matchedFeature.id);
        compliantSegments.push({
          platformSegment: seg,
          matchedMapFeature: matchedFeature
        });
        totalCompliantLengthMeters += seg.segmentLength || matchedFeature.lengthMeters || 0;
      }
    } else {
      // 🟢 If status is ACTIVE/COORDINATED in platform (نشط، منسق، تركيب جديد...):
      if (matchedFeature) {
        matchedMapFeatureIds.add(matchedFeature.id);
        compliantSegments.push({
          platformSegment: seg,
          matchedMapFeature: matchedFeature
        });
        totalCompliantLengthMeters += seg.segmentLength || matchedFeature.lengthMeters || 0;
      } else {
        // 🔴 NOT on map -> Alert 1 (Missing Segment to Add)
        missingSegments.push(seg);
        totalMissingLengthMeters += seg.segmentLength || 0;
      }
    }
  }

  // Find map features that have a segment ID but are not in the platform segments table
  const unregisteredMapSegments = mapFeatures.filter(f => {
    if (!f.segmentId && !f.name) return false;
    return !matchedMapFeatureIds.has(f.id);
  });

  return {
    poNumber,
    projectName,
    totalPlatformSegmentsCount: platformSegments.length,
    totalPlatformLengthMeters,
    missingSegments,
    totalMissingCount: missingSegments.length,
    totalMissingLengthMeters,
    cancelledOnMapSegments,
    totalCancelledOnMapCount: cancelledOnMapSegments.length,
    totalCancelledOnMapLengthMeters,
    compliantSegments,
    totalCompliantCount: compliantSegments.length,
    totalCompliantLengthMeters,
    unregisteredMapSegments,
    totalUnregisteredCount: unregisteredMapSegments.length
  };
}

/**
 * Parse an Excel File (ArrayBuffer / binary) to extract PlatformSegment array
 */
export function parsePlatformSegmentsFromExcel(dataBuffer: ArrayBuffer): PlatformSegment[] {
  const workbook = XLSX.read(dataBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (rawRows.length < 2) return [];

  // Parse header row to find column indexes dynamically
  const headerRow = (rawRows[0] || []).map((h: any) => String(h || '').trim().toLowerCase());
  
  const findCol = (candidates: string[]): number => {
    for (const c of candidates) {
      const idx = headerRow.findIndex((h: string) => h.includes(c.toLowerCase()));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const colSegmentId = findCol(['segment_map_id', 'segment id', 'معرف القطاع', 'رقم القطاع', 'segment_id']) !== -1 
    ? findCol(['segment_map_id', 'segment id', 'معرف القطاع', 'رقم القطاع', 'segment_id']) 
    : 0;

  const colLength = findCol(['segment_length', 'طول القطاع', 'length', 'الطول']) !== -1
    ? findCol(['segment_length', 'طول القطاع', 'length', 'الطول'])
    : 1;

  const colNeighborhood = findCol(['neighborhoods', 'neighborhood', 'الحي', 'الأحياء', 'احياء']) !== -1
    ? findCol(['neighborhoods', 'neighborhood', 'الحي', 'الأحياء', 'احياء'])
    : 4;

  const colGov = findCol(['governorate', 'المحافظة', 'محافظة']) !== -1
    ? findCol(['governorate', 'المحافظة', 'محافظة'])
    : 5;

  const colStreets = findCol(['streets', 'street', 'الشارع', 'الشوارع']) !== -1
    ? findCol(['streets', 'street', 'الشارع', 'الشوارع'])
    : 6;

  const colStatus = findCol(['segment_status', 'حالة القطاع', 'حالة']) !== -1
    ? findCol(['segment_status', 'حالة القطاع', 'حالة'])
    : 7;

  const colProjCode = findCol(['project_code', 'كود المشروع', 'رقم التصريح', 'تصريح']) !== -1
    ? findCol(['project_code', 'كود المشروع', 'رقم التصريح', 'تصريح'])
    : 8;

  const colPo = findCol(['رقم أمر الشراء', 'أمر الشراء', 'po', 'po_number', 'رقم po']) !== -1
    ? findCol(['رقم أمر الشراء', 'أمر الشراء', 'po', 'po_number', 'رقم po'])
    : 18;

  const colProjectName = findCol(['أسم المشروع الصحيح', 'اسم المشروع الصحيح', 'project_name', 'اسم المشروع']) !== -1
    ? findCol(['أسم المشروع الصحيح', 'اسم المشروع الصحيح', 'project_name', 'اسم المشروع'])
    : (findCol(['project_name']) !== -1 ? findCol(['project_name']) : 19);

  const colContractor = findCol(['المقاول', 'contractor', 'contractors', 'الشركة المنفذة']) !== -1
    ? findCol(['المقاول', 'contractor', 'contractors', 'الشركة المنفذة'])
    : 20;

  const colAsset = findCol(['asset', 'النوع', 'نوع الأصل', 'مياه / صرف']) !== -1
    ? findCol(['asset', 'النوع', 'نوع الأصل', 'مياه / صرف'])
    : 11;

  const colWork = findCol(['work', 'نوع العمل', 'الأعمال']) !== -1
    ? findCol(['work', 'نوع العمل', 'الأعمال'])
    : 12;

  const parsedSegments: PlatformSegment[] = [];

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const segId = String(row[colSegmentId] || '').trim();
    if (!segId) continue;

    const lenVal = parseFloat(String(row[colLength] || '0').replace(/,/g, '')) || 0;
    const poVal = String(row[colPo] || '').trim();
    const projNameVal = String(row[colProjectName] || '').trim() || String(row[10] || '').trim();
    const contractorVal = String(row[colContractor] || '').trim() || String(row[16] || '').trim();
    const neighborhoodVal = String(row[colNeighborhood] || '').trim();
    const govVal = String(row[colGov] || '').trim();
    const streetsVal = String(row[colStreets] || '').trim();
    const statusVal = String(row[colStatus] || 'منسق').trim();
    const codeVal = String(row[colProjCode] || '').trim();
    const assetVal = String(row[colAsset] || '').trim();
    const workVal = String(row[colWork] || '').trim();

    parsedSegments.push({
      segmentMapId: segId,
      segmentLength: lenVal,
      poNumber: poVal,
      projectName: projNameVal,
      contractor: contractorVal,
      neighborhoods: neighborhoodVal,
      governorate: govVal,
      streets: streetsVal,
      segmentStatus: statusVal,
      projectCode: codeVal,
      asset: assetVal,
      work: workVal
    });
  }

  return parsedSegments;
}
