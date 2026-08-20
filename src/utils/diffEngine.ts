/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  KMLAnalysisResult, 
  ProjectDiffResult, 
  YellowLineStageChange, 
  LengthChangeDetail, 
  PermitChangeDetail, 
  ScopeChangeDetail,
  StatusCategory
} from '../types';
import { COLOR_CONFIG, getStatusCategoryLabel, isValidIdentifier, cleanStage, cleanPermitNo } from './myMapsKmlParser';

export interface GroupedYellowLineChanges {
  permitNo: string; // empty string if no permit
  hasPermit: boolean;
  changes: YellowLineStageChange[];
}

/**
 * Groups yellow line stage changes by Permit Number (رقم الفسح).
 * Elements associated with the same permit number are detailed inside that Permit Box.
 * Elements without a permit number are grouped separately with a "No Permit" warning.
 */
export function groupYellowLineChangesByPermit(changes: YellowLineStageChange[]): GroupedYellowLineChanges[] {
  const groupsMap = new Map<string, YellowLineStageChange[]>();

  changes.forEach((c) => {
    const rawPermit = (c.permitNo || '').trim();
    const permitKey = (rawPermit && rawPermit !== '-') ? rawPermit : 'NO_PERMIT';
    if (!groupsMap.has(permitKey)) {
      groupsMap.set(permitKey, []);
    }
    groupsMap.get(permitKey)!.push(c);
  });

  const result: GroupedYellowLineChanges[] = [];
  groupsMap.forEach((items, permitKey) => {
    result.push({
      permitNo: permitKey === 'NO_PERMIT' ? '' : permitKey,
      hasPermit: permitKey !== 'NO_PERMIT',
      changes: items
    });
  });

  // Sort: Valid permit numbers first, NO_PERMIT group last
  result.sort((a, b) => {
    if (a.hasPermit && !b.hasPermit) return -1;
    if (!a.hasPermit && b.hasPermit) return 1;
    return a.permitNo.localeCompare(b.permitNo);
  });

  return result;
}

/**
 * Performs a comprehensive diff check between previous KML analysis and newly extracted KML analysis
 */
export function compareKMLAnalyses(
  oldResult: KMLAnalysisResult | null,
  newResult: KMLAnalysisResult,
  projectId: number,
  projectName: string,
  projectScope?: string
): ProjectDiffResult {
  const currentReportDate = newResult.parsedAt || new Date().toLocaleString('ar-SA');
  const previousReportDate = oldResult?.parsedAt || 'لا يوجد تقرير سابق';

  const categories: StatusCategory[] = ['executed_water', 'executed_sewage', 'ongoing', 'remaining', 'cancelled'];

  if (!oldResult) {
    // Initial analysis snapshot (no previous report to compare against)
    return {
      hasChanges: false,
      projectId,
      projectName,
      currentReportDate,
      previousReportDate: 'التقرير الأولي التأسيسي',
      totalLengthDiffKm: 0,
      totalLengthDiffMeters: 0,
      lengthChanges: [],
      addedPermits: [],
      removedPermits: [],
      scopeChanges: [],
      yellowLineStageChanges: [],
      summaryMessages: ['تم تسجيل هذا التحليل الجغرافي كمرجع تأسيسي للمشروع. سيتم المقارنة وتتبع التغيرات ابتداءً من التقرير القادم.']
    };
  }

  // 1. Total length diff
  const totalLengthDiffMeters = Math.round(newResult.totalLengthMeters - oldResult.totalLengthMeters);
  const totalLengthDiffKm = Number((newResult.totalLengthKm - oldResult.totalLengthKm).toFixed(3));

  // 2. Length breakdown diff per category
  const lengthChanges: LengthChangeDetail[] = [];
  categories.forEach((cat) => {
    const oldCatStats = oldResult.colorBreakdown[cat] || { totalLengthKm: 0, totalLengthMeters: 0 };
    const newCatStats = newResult.colorBreakdown[cat] || { totalLengthKm: 0, totalLengthMeters: 0 };

    const diffMeters = Math.round(newCatStats.totalLengthMeters - oldCatStats.totalLengthMeters);
    const diffKm = Number((newCatStats.totalLengthKm - oldCatStats.totalLengthKm).toFixed(3));
    
    let percentChange = 0;
    if (oldCatStats.totalLengthMeters > 0) {
      percentChange = Number(((diffMeters / oldCatStats.totalLengthMeters) * 100).toFixed(1));
    }

    if (diffMeters !== 0) {
      lengthChanges.push({
        category: cat,
        label: getStatusCategoryLabel(cat, projectName, projectScope || newResult.projectScope || oldResult?.projectScope),
        oldKm: oldCatStats.totalLengthKm,
        newKm: newCatStats.totalLengthKm,
        diffKm,
        diffMeters,
        percentChange
      });
    }
  });

  // 3. Permits Comparison (إضافة فسح جديد / تعديل الفسوح)
  const extractAllPermits = (res: KMLAnalysisResult) => {
    const set = new Set<string>();
    Object.values(res.permitNosByStatus || {}).forEach((arr) => {
      (arr || []).forEach((p) => {
        if (isValidIdentifier(p)) set.add(p.trim());
      });
    });
    // Also scan items
    (res.items || []).forEach((item) => {
      if (isValidIdentifier(item.permitNo)) set.add(item.permitNo.trim());
    });
    return set;
  };

  const oldPermits = extractAllPermits(oldResult);
  const newPermits = extractAllPermits(newResult);

  const addedPermits: PermitChangeDetail[] = [];
  const removedPermits: PermitChangeDetail[] = [];

  newPermits.forEach((p) => {
    if (!oldPermits.has(p)) {
      // Find matching item for segment & geo reference
      const cleanP = isValidIdentifier(p) ? cleanPermitNo(p) : p;
      const matchingItem = newResult.items.find(it => it.permitNo === p)
                        || newResult.items.find(it => it.permitNo && cleanPermitNo(it.permitNo) === cleanP)
                        || newResult.items.find(it => (it.description || '').includes(p))
                        || newResult.items.find(it => (it.name || '').includes(p));

      let mapUrl = matchingItem?.googleMapsUrl;
      if (!mapUrl && matchingItem?.centerLat !== undefined && matchingItem?.centerLng !== undefined) {
        mapUrl = `https://www.google.com/maps?q=${matchingItem.centerLat},${matchingItem.centerLng}`;
      }
      if (!mapUrl && matchingItem?.description) {
        const descUrlMatch = matchingItem.description.match(/href=["'](https?:\/\/[^"'>]+)["']/i)
                          || matchingItem.description.match(/(https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|earth\.google\.com|maps\.google\.com)[^\s"'<>]+)/i)
                          || matchingItem.description.match(/(https?:\/\/[^\s"'<>]+)/i);
        if (descUrlMatch) mapUrl = descUrlMatch[1];
      }

      addedPermits.push({
        type: 'added',
        permitNo: p,
        category: matchingItem?.statusLabel || 'فسح جديد',
        segmentId: matchingItem?.segmentId,
        featureName: matchingItem?.name,
        lengthMeters: matchingItem?.lengthMeters,
        colorHex: matchingItem?.colorHex,
        stage: matchingItem?.stage,
        description: matchingItem?.description,
        streetName: matchingItem?.streetName,
        district: matchingItem?.district,
        innerDiameter: matchingItem?.innerDiameter,
        zone: matchingItem?.zone,
        drillingType: matchingItem?.drillingType,
        contractor: matchingItem?.contractor,
        kmlProjectName: matchingItem?.kmlProjectName,
        kmlProjectId: matchingItem?.kmlProjectId,
        centerLat: matchingItem?.centerLat,
        centerLng: matchingItem?.centerLng,
        googleMapsUrl: mapUrl
      });
    }
  });

  oldPermits.forEach((p) => {
    if (!newPermits.has(p)) {
      const cleanP = isValidIdentifier(p) ? cleanPermitNo(p) : p;
      const matchingItem = oldResult.items?.find(it => it.permitNo === p)
                        || oldResult.items?.find(it => it.permitNo && cleanPermitNo(it.permitNo) === cleanP)
                        || oldResult.items?.find(it => (it.description || '').includes(p));

      let mapUrl = matchingItem?.googleMapsUrl;
      if (!mapUrl && matchingItem?.centerLat !== undefined && matchingItem?.centerLng !== undefined) {
        mapUrl = `https://www.google.com/maps?q=${matchingItem.centerLat},${matchingItem.centerLng}`;
      }

      removedPermits.push({
        type: 'removed',
        permitNo: p,
        segmentId: matchingItem?.segmentId,
        featureName: matchingItem?.name,
        lengthMeters: matchingItem?.lengthMeters,
        colorHex: matchingItem?.colorHex,
        stage: matchingItem?.stage,
        description: matchingItem?.description,
        streetName: matchingItem?.streetName,
        district: matchingItem?.district,
        innerDiameter: matchingItem?.innerDiameter,
        zone: matchingItem?.zone,
        drillingType: matchingItem?.drillingType,
        contractor: matchingItem?.contractor,
        kmlProjectName: matchingItem?.kmlProjectName,
        kmlProjectId: matchingItem?.kmlProjectId,
        centerLat: matchingItem?.centerLat,
        centerLng: matchingItem?.centerLng,
        googleMapsUrl: mapUrl
      });
    }
  });

  // 4. Yellow Line Stage Comparison (#ffea00 / ongoing items)
  // Check Stage property on yellow lines (ongoing status category)
  const yellowLineStageChanges: YellowLineStageChange[] = [];

  const oldOngoingItemsMap = new Map<string, { stage: string; item: any }>();
  (oldResult.items || [])
    .filter((it) => it.statusCategory === 'ongoing' || it.colorHex?.toLowerCase() === '#ffea00')
    .forEach((it) => {
      const key = it.segmentId || it.name || it.id;
      oldOngoingItemsMap.set(key, { stage: cleanStage(it.stage), item: it });
    });

  (newResult.items || [])
    .filter((it) => it.statusCategory === 'ongoing' || it.colorHex?.toLowerCase() === '#ffea00')
    .forEach((newItem) => {
      const key = newItem.segmentId || newItem.name || newItem.id;
      const oldData = oldOngoingItemsMap.get(key);

      const currentStage = cleanStage(newItem.stage);

      if (oldData) {
        const previousStage = cleanStage(oldData.stage);
        if (previousStage !== currentStage) {
          yellowLineStageChanges.push({
            segmentId: newItem.segmentId,
            featureName: newItem.name,
            previousStage,
            newStage: currentStage,
            permitNo: newItem.permitNo,
            lengthMeters: newItem.lengthMeters,
            colorHex: newItem.colorHex || '#ffea00',
            streetName: newItem.streetName,
            district: newItem.district,
            innerDiameter: newItem.innerDiameter,
            zone: newItem.zone,
            drillingType: newItem.drillingType,
            contractor: newItem.contractor,
            kmlProjectName: newItem.kmlProjectName,
            kmlProjectId: newItem.kmlProjectId,
            centerLat: newItem.centerLat,
            centerLng: newItem.centerLng,
            googleMapsUrl: newItem.googleMapsUrl
          });
        }
      } else {
        // New yellow line segment added
        yellowLineStageChanges.push({
          segmentId: newItem.segmentId,
          featureName: newItem.name,
          previousStage: 'قطاع جديد',
          newStage: currentStage,
          permitNo: newItem.permitNo,
          lengthMeters: newItem.lengthMeters,
          colorHex: newItem.colorHex || '#ffea00',
          streetName: newItem.streetName,
          district: newItem.district,
          innerDiameter: newItem.innerDiameter,
          zone: newItem.zone,
          drillingType: newItem.drillingType,
          contractor: newItem.contractor,
          kmlProjectName: newItem.kmlProjectName,
          kmlProjectId: newItem.kmlProjectId,
          centerLat: newItem.centerLat,
          centerLng: newItem.centerLng,
          googleMapsUrl: newItem.googleMapsUrl
        });
      }
    });

  // 5. Scopes and feature counts comparison
  const scopeChanges: ScopeChangeDetail[] = [];
  if (oldResult.totalFeaturesCount !== newResult.totalFeaturesCount) {
    scopeChanges.push({
      type: 'modified',
      field: 'عدد قطاعات الخطوط',
      oldValue: `${oldResult.totalFeaturesCount} قطاع`,
      newValue: `${newResult.totalFeaturesCount} قطاع`
    });
  }

  // 6. Generate Human-Readable Summary Bullet Messages
  const summaryMessages: string[] = [];

  if (totalLengthDiffMeters !== 0) {
    const sign = totalLengthDiffMeters > 0 ? '+' : '';
    summaryMessages.push(`📏 تغير إجمالي أطوال خطوط الشبكة بمقدار ${sign}${totalLengthDiffMeters.toLocaleString()} متر (${sign}${totalLengthDiffKm} كم)`);
  }

  if (addedPermits.length > 0) {
    addedPermits.forEach(ap => {
      summaryMessages.push(`📄 تم إضافة فسح/رخصة جديدة برقم: (${ap.permitNo}) ${ap.segmentId ? `للقطاع ${ap.segmentId}` : ''}`);
    });
  }

  if (yellowLineStageChanges.length > 0) {
    yellowLineStageChanges.forEach(yc => {
      const permitTag = (yc.permitNo && yc.permitNo.trim() && yc.permitNo !== '-') 
        ? `[فسح: ${yc.permitNo}]` 
        : `[⚠️ الأعمال جارية - لا يوجد رقم فسح]`;
      summaryMessages.push(`🏗️ تغير بيان Stage لعنصر/قطاع الحفرية (${yc.segmentId} - ${yc.featureName}) ${permitTag} إلى: [${yc.newStage}] (المرحلة السابقة: ${yc.previousStage})`);
    });
  }

  lengthChanges.forEach(lc => {
    const sign = lc.diffMeters > 0 ? '+' : '';
    summaryMessages.push(`📊 تغير في فئة (${lc.label}): ${sign}${lc.diffMeters.toLocaleString()} م (${sign}${lc.diffKm} كم)`);
  });

  const hasChanges = 
    totalLengthDiffMeters !== 0 ||
    addedPermits.length > 0 ||
    removedPermits.length > 0 ||
    yellowLineStageChanges.length > 0 ||
    lengthChanges.length > 0 ||
    scopeChanges.length > 0;

  if (!hasChanges) {
    summaryMessages.push('✅ لا توجد تغيرات طارئة على أطوال وفسوح ومراحل هذا المشروع مقارنة بالتقرير السابق.');
  }

  return {
    hasChanges,
    projectId,
    projectName,
    currentReportDate,
    previousReportDate,
    totalLengthDiffKm,
    totalLengthDiffMeters,
    lengthChanges,
    addedPermits,
    removedPermits,
    scopeChanges,
    yellowLineStageChanges,
    summaryMessages
  };
}
