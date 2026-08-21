/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Project {
  id: number;
  operationalNumber: string;
  name: string;
  po: string;
  unifierNo: string;
  contractor: string;
  consultant: string;
  status: string; // جاري, مسلم ابتدائي, مسحوب, جاري الاستلام الابتدائي
  scope: string; // صرف صحي, مياه
  classification: string; // شبكات, خطوط رئيسية, خزانات, مخطط استراتيجي, خطوط ناقلة, ترحيل, استبدال, محطات معالجة صرف صحي, الخ
  businessUnit: string; // وحدة أعمال الرياض, الخ
  region: string; // شمال الرياض, جنوب الرياض, غرب الرياض, المحافظات الشمالية, المحافظات الجنوبية, المحافظات الغربية, المتفرقات
  subProgram: string;
  mapUrl: string;
  isFavorite?: boolean;
  x?: number | null; // خط الطول (X)
  y?: number | null; // خط العرض (Y)
  surveyorName?: string; // اسم المساح
  surveyorPhone?: string; // رقم التواصل للمساح
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  allowedRegions: string[]; // e.g. ["شمال الرياض"] - empty or ["الكل"] means all regions
  allowedScopes: string[];  // e.g. ["مياه", "صرف صحي"] - empty or ["الكل"] means all scopes
  password?: string; // كلمة المرور الخاصة بالمستخدم
  
  // خصائص الصلاحيات الجديدة للموقع
  allowedTabs?: string[]; // التبويبات المسموحة: ["maps", "stats", "layers", "changelog", "maptools", "users"]
  canOpenExternalLinks?: boolean; // فتح روابط خارجية
  canFilter?: boolean; // التصفية والبحث
  canInsert?: boolean; // إدراج مشاريع جديدة
  
  // بيانات الملف الشخصي للمستخدم الجديد
  department?: string; // القسم
  jobTitle?: string; // الوظيفة
  
  // صلاحية اختيار مشاريع محددة
  allowedProjectIds?: number[]; // معرفات المشاريع المحددة المسموحة

  // صلاحية طبقات المشاريع المفصلة
  allowedLayers?: string[]; // المعرفات المسموحة: ["water", "sewage", "materials"]

  // صلاحيات أقسام الإحصائيات التفصيلية
  allowedStatsSubTabs?: string[]; // المعرفات المسموحة: ["lengths", "mymaps", "general"]

  // صلاحية حالات المشاريع المسموحة
  allowedStatuses?: string[]; // e.g. ["جاري", "مكتمل", "معلق", "مسلم ابتدائي", "مسحوب", "جاري الاستلام الابتدائي", "جاري الاستلام النهائي", "متوقف كليا", "متوقف جزئيا", "مشروع مستأنف", "تم انهاء العقد"] - empty or ["الكل"] means all statuses
}

export interface AppNotification {
  id: string;
  projectId: number;
  projectName: string;
  type: 'add' | 'edit' | 'change_detected';
  message: string;
  timestamp: string;
  read: boolean;
  region: string;
  scope: string;
  groupedCount?: number;
  groupedIds?: string[];
}

export type StatusCategory = 'executed_water' | 'executed_sewage' | 'ongoing' | 'remaining' | 'cancelled';

export interface KMLFeatureItem {
  id: string;
  name: string;
  segmentId: string;
  permitNo: string;
  colorHex: string; // #01579B, #097138, #ffea00, #a52714, #F48FB1
  originalColorHex?: string; // Exact raw hex color from KML file before mapping
  color?: string; // Compatibility alias
  statusCategory: StatusCategory;
  statusLabel: string; // منفذ - مياه | منفذ - صرف | جاري العمل | أعمال متبقية | خطوط تم إلغائها
  lengthMeters: number;
  lengthKm: number;
  coordinatesCount: number;
  description?: string;
  layerName?: string;
  stage?: string; // مرحلة الحفرية الحالية (خاصة بالخطوط الصفراء جاري العمل)

  // Extended Balloon & KML Attributes (from My Maps balloon details)
  streetName?: string;       // STREETNAME / الشارع
  district?: string;         // الحي
  innerDiameter?: string;    // INNERDIAMETER / القطر الداخلي
  zone?: string;             // ZONE / المنطقة
  drillingType?: string;     // Drilling type / نوع الحفر
  contractor?: string;       // CONTRACTOR / المقاول
  kmlProjectName?: string;   // PROJECTNAME / اسم المشروع
  kmlProjectId?: string;     // PROJECTID / رقم المشروع
  centerLat?: number;        // خط العرض للمركز
  centerLng?: number;        // خط الطول للمركز
  googleMapsUrl?: string;    // رابط فتح في خرائط جوجل
  coordinates?: Array<[number, number]>; // قائمة الإحداثيات [lng, lat]
}

export interface ColorStatsSummary {
  colorHex: string;
  label: string;
  category: StatusCategory;
  totalLengthMeters: number;
  totalLengthKm: number;
  segmentCount: number;
  permitCount: number;
  percentage: number;
  yellowNoPermitCount?: number;
  yellowNoPermitMeters?: number;
  yellowNoPermitKm?: number;
  yellowNoPermitSegments?: string[];
  redNoSegmentCount?: number;
  redNoSegmentMeters?: number;
  redNoSegmentKm?: number;
  redNoSegmentFeatures?: string[];
}

export interface KMLAnalysisResult {
  projectName?: string;
  projectScope?: string;
  mapUrl?: string;
  totalLengthMeters: number;
  totalLengthKm: number;
  totalFeaturesCount: number;
  colorBreakdown: Record<StatusCategory, ColorStatsSummary>;
  segmentIdsByStatus: {
    executedWater: string[];
    executedSewage: string[];
    ongoing: string[];
    remaining: string[];
    cancelled: string[];
  };
  permitNosByStatus: {
    executedWater: string[];
    executedSewage: string[];
    ongoing: string[];
    remaining: string[];
    cancelled: string[];
  };
  yellowNoPermitStats?: {
    count: number;
    lengthMeters: number;
    lengthKm: number;
    segments: string[];
  };
  redNoSegmentStats?: {
    count: number;
    lengthMeters: number;
    lengthKm: number;
    features: string[];
  };
  items: KMLFeatureItem[];
  parsedAt: string;
}

// ==========================================
// Project Change Tracking & Historical Comparison Types
// ==========================================

export interface HistoricalReport {
  id: string;
  projectId: number;
  projectName: string;
  mapUrl?: string;
  parsedAt: string;
  createdAt: string;
  analysisResult: KMLAnalysisResult;
}

export interface YellowLineStageChange {
  segmentId: string;
  featureName: string;
  previousStage: string;
  newStage: string;
  permitNo?: string;
  lengthMeters: number;
  colorHex: string;

  // Extended Balloon & KML Attributes
  streetName?: string;
  district?: string;
  innerDiameter?: string;
  zone?: string;
  drillingType?: string;
  contractor?: string;
  kmlProjectName?: string;
  kmlProjectId?: string;
  centerLat?: number;
  centerLng?: number;
  googleMapsUrl?: string;
}

export interface LengthChangeDetail {
  category: StatusCategory;
  label: string;
  oldKm: number;
  newKm: number;
  diffKm: number;
  diffMeters: number;
  percentChange: number;
}

export interface PermitChangeDetail {
  type: 'added' | 'removed';
  permitNo: string;
  category?: string;
  segmentId?: string;

  // Extended Balloon & KML Attributes
  featureName?: string;
  lengthMeters?: number;
  colorHex?: string;
  stage?: string;
  description?: string;
  streetName?: string;
  district?: string;
  innerDiameter?: string;
  zone?: string;
  drillingType?: string;
  contractor?: string;
  kmlProjectName?: string;
  kmlProjectId?: string;
  centerLat?: number;
  centerLng?: number;
  googleMapsUrl?: string;
}

export interface ScopeChangeDetail {
  type: 'added' | 'removed' | 'modified';
  field: string;
  oldValue: string;
  newValue: string;
}

export interface ProjectDiffResult {
  hasChanges: boolean;
  projectId: number;
  projectName: string;
  currentReportDate: string;
  previousReportDate: string;
  totalLengthDiffKm: number;
  totalLengthDiffMeters: number;
  lengthDiffMeters?: number;
  addedFeaturesCount?: number;
  modifiedFeaturesCount?: number;
  deletedFeaturesCount?: number;
  lengthChanges: LengthChangeDetail[];
  addedPermits: PermitChangeDetail[];
  removedPermits: PermitChangeDetail[];
  scopeChanges: ScopeChangeDetail[];
  yellowLineStageChanges: YellowLineStageChange[];
  summaryMessages: string[];
}

export interface ProjectChangelogRecord {
  id: string;
  projectId: number;
  projectName: string;
  reportId: string;
  previousReportId: string | null;
  diff: ProjectDiffResult;
  createdAt: string;
  isViewed?: boolean;
}


