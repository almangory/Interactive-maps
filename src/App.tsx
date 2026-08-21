/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Project, User, AppNotification } from './types';
import { getParsedProjects } from './data/initialProjects';
import { INITIAL_USERS } from './data/initialUsers';

// استيراد عميل قاعدة البيانات
import { db } from './db';
import { getDatabaseClient } from './utils/reportsStore';

// Components
import { DashboardStats } from './components/DashboardStats';
import { ProjectMapViewer } from './components/ProjectMapViewer';
import { UserManagement } from './components/UserManagement';
import { ProjectModal } from './components/ProjectModal';
import { ProjectList } from './components/ProjectList';
import { NWCLogo } from './components/NWCLogo';
import { ProjectLayersViewer } from './components/ProjectLayersViewer';
import { ChangelogTab } from './components/ChangelogTab';
import { 
  NotificationSettingsPage, 
  DEFAULT_NOTIF_SETTINGS, 
  NotificationSettings 
} from './components/NotificationSettingsPage';
import { PWAInstallPrompt, PWAInstallHeaderButton } from './components/PWAInstallPrompt';

// Icons
import { 
  Layers, 
  Map as MapIcon, 
  Users, 
  Plus, 
  ChevronDown, 
  ShieldAlert, 
  Settings, 
  Sliders,
  LifeBuoy, 
  ShieldCheck, 
  Lock,
  Compass,
  FileSpreadsheet,
  AlertCircle,
  Mail,
  Key,
  LogOut,
  Smartphone,
  CheckCircle2,
  Bell,
  Sun,
  Moon,
  History,
  Globe,
  Wrench,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { useLanguage } from './utils/i18n';

// Helper to determine the actual effective scope of a project (resolving any data classification discrepancies)
export const getActualProjectScope = (proj: Project): string => {
  const name = (proj.name || '').trim();
  const scope = (proj.scope || '').trim();
  const classification = (proj.classification || '').trim();
  const subProgram = (proj.subProgram || '').trim();
  
  if (
    name.includes('صرف') || 
    name.includes('الصرف') || 
    classification.includes('صرف') || 
    classification.includes('معالجة') || 
    classification.includes('بيئية') || 
    subProgram.includes('صرف')
  ) {
    return 'صرف صحي';
  }
  
  if (scope.includes('صرف')) {
    return 'صرف صحي';
  }
  
  if (scope.includes('مياه')) {
    return 'مياه';
  }
  
  return scope || 'مياه';
};

export const isProjectAllowedForUser = (p: Project, currentUser: User): boolean => {
  if (currentUser.role === 'admin') return true;
  
  // 1. Custom Project IDs constraint (if specified, project must be in the list)
  if (currentUser.allowedProjectIds && currentUser.allowedProjectIds.length > 0) {
    const allowed = currentUser.allowedProjectIds.map(Number);
    if (!allowed.includes(Number(p.id))) {
      return false;
    }
  }

  // 2. Geographic & Region constraint
  const uRegions = (currentUser.allowedRegions || ['الكل']).map(r => r.trim());
  const isAllRegions = uRegions.includes('الكل');
  
  let isRegionAllowed = isAllRegions;
  if (!isRegionAllowed) {
    const pr = (p.region || '').trim();
    const pb = (p.businessUnit || '').trim();
    const ps = (p.subProgram || '').trim();
    
    if (uRegions.includes(pr) || uRegions.includes(pb) || uRegions.includes(ps)) {
      isRegionAllowed = true;
    }
    
    if (!isRegionAllowed) {
      const northGovs = ['المجمعة', 'رماح', 'الزلفي', 'ثادق', 'حريملاء', 'الغاط', 'ثادق وحريملاء'];
      const southGovs = ['السليل', 'وادي الدواسر', 'الأفلاج', 'حوطة بني تميم', 'الحريق', 'السيح', 'الخرج', 'تمرة', 'خيران', 'السيح والخرج'];
      const westGovs = ['المزاحمية', 'شقراء', 'عفيف', 'القويعية', 'البجاديه', 'البجادية', 'ضرما', 'ضرماء', 'الدوادمي', 'شقراء ومرات', 'عفيف والدوادمي', 'المزاحمية و ضرماء'];
      
      if (uRegions.includes('المحافظات الشمالية') && (northGovs.includes(pr) || pr.includes('المجمعة') || pr.includes('رماح') || pr.includes('الزلفي') || pr.includes('حريملاء') || pr.includes('الغاط') || pr.includes('ثادق'))) {
        isRegionAllowed = true;
      }
      if (uRegions.includes('المحافظات الجنوبية') && (southGovs.includes(pr) || pr.includes('السليل') || pr.includes('الدواسر') || pr.includes('الأفلاج') || pr.includes('تميم') || pr.includes('الخرج') || pr.includes('الحريق') || pr.includes('السيح'))) {
        isRegionAllowed = true;
      }
      if (uRegions.includes('المحافظات الغربية') && (westGovs.includes(pr) || pr.includes('عفيف') || pr.includes('الدوادمي') || pr.includes('المزاحمية') || pr.includes('شقراء') || pr.includes('القويعية') || pr.includes('البجادية') || pr.includes('البجاديه') || pr.includes('ضرما') || pr.includes('ضرماء'))) {
        isRegionAllowed = true;
      }
    }
  }

  const actualScope = getActualProjectScope(p);

  const uScopes = (currentUser.allowedScopes || ['الكل']).map(s => s.trim());
  const isAllScopes = uScopes.includes('الكل');
  const isScopeAllowed = isAllScopes || uScopes.some(scopeType => {
    const uScope = scopeType.trim();
    if (!uScope) return false;
    return actualScope === uScope;
  });

  const uStatuses = (currentUser.allowedStatuses || ['الكل']).map(s => s.trim());
  const isAllStatuses = uStatuses.includes('الكل') || uStatuses.length === 0;
  const isStatusAllowed = isAllStatuses || uStatuses.some(st => (p.status || '').trim() === st);

  return isRegionAllowed && isScopeAllowed && isStatusAllowed;
};

export const getProjectDifferencesMessage = (oldP: Project, newP: Project): string => {
  const changes: string[] = [];
  
  if ((oldP.name || '').trim() !== (newP.name || '').trim()) {
    changes.push(`الاسم (من "${oldP.name}" إلى "${newP.name}")`);
  }
  if ((oldP.status || '').trim() !== (newP.status || '').trim()) {
    changes.push(`الحالة (من "${oldP.status}" إلى "${newP.status}")`);
  }
  if ((oldP.contractor || '').trim() !== (newP.contractor || '').trim()) {
    changes.push(`المقاول (من "${oldP.contractor || 'غير محدد'}" إلى "${newP.contractor || 'غير محدد'}")`);
  }
  if ((oldP.consultant || '').trim() !== (newP.consultant || '').trim()) {
    changes.push(`الاستشاري (من "${oldP.consultant || 'غير محدد'}" إلى "${newP.consultant || 'غير محدد'}")`);
  }
  if ((oldP.region || '').trim() !== (newP.region || '').trim()) {
    changes.push(`المنطقة (من "${oldP.region}" إلى "${newP.region}")`);
  }
  if ((oldP.classification || '').trim() !== (newP.classification || '').trim()) {
    changes.push(`التصنيف (من "${oldP.classification}" إلى "${newP.classification}")`);
  }
  if ((oldP.po || '').trim() !== (newP.po || '').trim()) {
    changes.push(`رقم PO (من "${oldP.po || '-'}" إلى "${newP.po || '-'}")`);
  }
  if ((oldP.unifierNo || '').trim() !== (newP.unifierNo || '').trim()) {
    changes.push(`رقم Unifier (من "${oldP.unifierNo || '-'}" إلى "${newP.unifierNo || '-'}")`);
  }
  if ((oldP.subProgram || '').trim() !== (newP.subProgram || '').trim()) {
    changes.push(`البرنامج الفرعي (من "${oldP.subProgram}" إلى "${oldP.subProgram}")`);
  }
  if ((oldP.mapUrl || '').trim() !== (newP.mapUrl || '').trim()) {
    changes.push(`رابط الخارطة التفاعلية`);
  }
  if ((oldP.surveyorName || '').trim() !== (newP.surveyorName || '').trim()) {
    changes.push(`اسم المساح (من "${oldP.surveyorName || 'غير محدد'}" إلى "${newP.surveyorName || 'غير محدد'}")`);
  }
  if ((oldP.surveyorPhone || '').trim() !== (newP.surveyorPhone || '').trim()) {
    changes.push(`رقم تواصل المساح (من "${oldP.surveyorPhone || 'غير محدد'}" إلى "${newP.surveyorPhone || 'غير محدد'}")`);
  }
  
  if (changes.length === 0) return '';
  return `وتم تعديل: ${changes.join(' و ')}`;
};

export const getProjectFieldChanges = (oldP: Project, newP: Project) => {
  const list: { fieldLabel: string; oldValue: string; newValue: string }[] = [];
  
  if ((oldP.name || '').trim() !== (newP.name || '').trim()) {
    list.push({ fieldLabel: 'اسم المشروع', oldValue: oldP.name || 'لا يوجد', newValue: newP.name || 'لا يوجد' });
  }
  if ((oldP.status || '').trim() !== (newP.status || '').trim()) {
    list.push({ fieldLabel: 'الحالة التشغيلية', oldValue: oldP.status || 'غير محدد', newValue: newP.status || 'غير محدد' });
  }
  if ((oldP.contractor || '').trim() !== (newP.contractor || '').trim()) {
    list.push({ fieldLabel: 'شركة المقاولات المنفذة', oldValue: oldP.contractor || 'غير محدد', newValue: newP.contractor || 'غير محدد' });
  }
  if ((oldP.consultant || '').trim() !== (newP.consultant || '').trim()) {
    list.push({ fieldLabel: 'المكتب الاستشاري', oldValue: oldP.consultant || 'غير محدد', newValue: newP.consultant || 'غير محدد' });
  }
  if ((oldP.region || '').trim() !== (newP.region || '').trim()) {
    list.push({ fieldLabel: 'المنطقة / المحافظة', oldValue: oldP.region || 'غير محدد', newValue: newP.region || 'غير محدد' });
  }
  if ((oldP.classification || '').trim() !== (newP.classification || '').trim()) {
    list.push({ fieldLabel: 'تصنيف المشروع', oldValue: oldP.classification || 'غير محدد', newValue: newP.classification || 'غير محدد' });
  }
  if ((oldP.po || '').trim() !== (newP.po || '').trim()) {
    list.push({ fieldLabel: 'رقم امر الشراء PO', oldValue: oldP.po || 'غير محدد', newValue: newP.po || 'غير محدد' });
  }
  if ((oldP.unifierNo || '').trim() !== (newP.unifierNo || '').trim()) {
    list.push({ fieldLabel: 'رقم Unifier', oldValue: oldP.unifierNo || 'غير محدد', newValue: newP.unifierNo || 'غير محدد' });
  }
  if ((oldP.subProgram || '').trim() !== (newP.subProgram || '').trim()) {
    list.push({ fieldLabel: 'البرنامج الفرعي', oldValue: oldP.subProgram || 'غير محدد', newValue: newP.subProgram || 'غير محدد' });
  }
  if ((oldP.mapUrl || '').trim() !== (newP.mapUrl || '').trim()) {
    list.push({ fieldLabel: 'رابط الخارطة التفاعلية', oldValue: oldP.mapUrl || 'غير متاح', newValue: newP.mapUrl || 'غير متاح' });
  }
  if ((oldP.surveyorName || '').trim() !== (newP.surveyorName || '').trim()) {
    list.push({ fieldLabel: 'اسم المساح الميداني', oldValue: oldP.surveyorName || 'غير محدد', newValue: newP.surveyorName || 'غير محدد' });
  }
  if ((oldP.surveyorPhone || '').trim() !== (newP.surveyorPhone || '').trim()) {
    list.push({ fieldLabel: 'رقم هاتف المساح', oldValue: oldP.surveyorPhone || 'غير محدد', newValue: newP.surveyorPhone || 'غير محدد' });
  }
  
  return list;
};

export const cleanNotificationMessage = (msg: string, pName?: string, nType?: string): string => {
  if (!msg) return '';
  
  // إذا كانت الرسالة نصاً شارحاً بالتفصيل (تحتوي اسم المهندس، التعديلات الحدوث، الفروقات، أو التنبيهات المباشرة) نعيدها كاملة بدون حذف التفاصيل
  if (
    msg.includes('قام المهندس') ||
    msg.includes('بواسطة') ||
    msg.includes('عنصر') ||
    msg.includes('أطوال') ||
    msg.includes('فارق') ||
    msg.includes('تعديل') ||
    msg.includes('إضافة') ||
    msg.startsWith('🚀') ||
    msg.startsWith('📢')
  ) {
    if (!msg.includes('SHAPE_Length') && !msg.includes('CONTRACTOR:') && !msg.includes('PROJECTNAME:')) {
      return msg;
    }
  }

  if (
    nType === 'change_detected' ||
    msg.includes('SHAPE_Length') ||
    msg.includes('CONTRACTOR:') ||
    msg.includes('PROJECTNAME:')
  ) {
    const cleanName = pName ? pName.replace(/^\[.*?\]\s*/, '') : '';
    return cleanName ? `📢 تم رصد تحديث وتغيرات جديدة بخريطة مشروع (${cleanName})` : `📢 تم رصد تحديث وتغيرات جديدة بخريطة المشروع`;
  }
  return msg;
};

export const getUserNotifSettings = (userId: string): NotificationSettings => {
  try {
    const saved = localStorage.getItem(`water_maps_notif_settings_${userId}`);
    return saved ? { ...DEFAULT_NOTIF_SETTINGS, ...JSON.parse(saved) } : DEFAULT_NOTIF_SETTINGS;
  } catch (e) {
    return DEFAULT_NOTIF_SETTINGS;
  }
};

export const isNotificationAllowed = (
  notif: AppNotification, 
  user: User, 
  userNotifSettings?: NotificationSettings, 
  favoriteProjectIds?: number[],
  projectsList?: Project[]
): boolean => {
  if (!user) return true;

  const settings = userNotifSettings || getUserNotifSettings(user.id);

  // 1. التحقق مما إذا كان المستخدم قد أوقف فئة معينة صراحةً من إعداداته الشخصية
  if (notif.type === 'add' && settings.allowNewProjects === false) return false;
  if (notif.type === 'edit' && settings.allowProjectEdits === false) return false;
  
  const notifTypeStr = String(notif.type || '');
  const isChangeType = 
    notifTypeStr === 'change_detected' || 
    notifTypeStr === 'map_change' || 
    notifTypeStr === 'update' ||
    (notif.message && (
      notif.message.includes('تحديث') || 
      notif.message.includes('تغير') ||
      notif.message.includes('رصد')
    ));

  if (isChangeType && settings.allowMapChanges === false) return false;

  // 2. تصفية المشاريع المفضلة فقط في حال تفعيل الخيار من إعدادات المستخدم
  if (settings.onlyFavoriteProjects && favoriteProjectIds && favoriteProjectIds.length > 0) {
    const numProjId = Number(notif.projectId);
    const strProjId = String(notif.projectId);
    const isFav = favoriteProjectIds.some(id => Number(id) === numProjId || String(id) === strProjId);
    if (!isFav) return false;
  }

  // 3. تصفية الإشعارات حسب صلاحيات الوصول للمشروع والمنطقة للمستخدمين
  if (user.role !== 'admin' && projectsList && projectsList.length > 0 && notif.projectId) {
    const targetProject = projectsList.find(p => String(p.id) === String(notif.projectId));
    if (targetProject && !isProjectAllowedForUser(targetProject, user)) {
      return false;
    }
  }

  // جميع إشعارات التحديثات والتغيرات وإدراج/تعديل المشاريع والفحص التلقائي تظهر لجميع المستخدمين المسموح لهم
  return true;
};

export default function App() {
  const { language, toggleLanguage, t, translateDynamic, isRtl } = useLanguage();

  // 0. Dark Mode State & Global Class Sync
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('water_maps_dark_mode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('water_maps_dark_mode', String(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }, [darkMode]);

  // 1. Authentication State
  const [isLogged, setIsLogged] = useState<boolean>(() => {
    return localStorage.getItem('water_maps_is_logged') === 'true';
  });

  // 2. Core State
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const cached = localStorage.getItem('water_maps_cached_projects');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.error(e);
    }
    return getParsedProjects();
  });
  const [users, setUsers] = useState<User[]>(() => {
    try {
      const cached = localStorage.getItem('water_maps_cached_users');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [currentUser, setCurrentUser] = useState<User>(() => {
    const savedAndActive = localStorage.getItem('water_maps_active_user_id');
    try {
      const cached = localStorage.getItem('water_maps_cached_users');
      if (cached) {
        const cachedUsers = JSON.parse(cached);
        if (savedAndActive) {
          const matched = cachedUsers.find((u: any) => u.id === savedAndActive);
          if (matched) return matched;
        } else {
          if (cachedUsers.length > 0) return cachedUsers[0];
        }
      }
    } catch (e) {
      console.error(e);
    }

    if (savedAndActive) {
      return { id: savedAndActive, username: 'admin', name: 'جاري التحميل...', role: 'admin', allowedRegions: ['الكل'], allowedScopes: ['الكل'], allowedLayers: ['water', 'sewage', 'materials'], password: '' };
    }
    return {
      id: 'guest',
      username: 'guest',
      name: 'زائر',
      role: 'viewer',
      allowedRegions: ['الكل'],
      allowedScopes: ['الكل'],
      allowedLayers: ['water', 'sewage', 'materials'],
      password: ''
    };
  });

  // 3.0.1 Notifications State
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);

  // 3. UI Control State
  const [activeTab, setActiveTab] = useState<'maps' | 'stats' | 'layers' | 'changelog' | 'maptools' | 'users' | 'settings'>('maps');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [mobileViewMode, setMobileViewMode] = useState<'map' | 'list'>('map');
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [showRoleSwitcherDropdown, setShowRoleSwitcherDropdown] = useState(false);
  const [successNotification, setSuccessNotification] = useState('');
  const [showExitModal, setShowExitModal] = useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);

  // 3.0. Offline/Online Status Monitor
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 3.1 Login states
  const [loginTab, setLoginTab] = useState<'nwc' | 'admin'>('nwc');
  const [nwcEmail, setNwcEmail] = useState('');
  const [nwcName, setNwcName] = useState('');
  const [nwcPassword, setNwcPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // 4. Persistent Synchronization effects
  const [favoriteIds, setFavoriteIds] = useState<number[]>(() => {
    const savedActive = localStorage.getItem('water_maps_active_user_id');
    const userId = savedActive || 'admin';
    const saved = localStorage.getItem(`water_maps_favorites_${userId}`);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { }
    }
    return [];
  });

  // 📢 دالة إرسال التنبيهات إلى ستارة النظام الخارجية بالجوال والكمبيوتر
  const sendNativeNotification = (title: string, body: string) => {
    if (currentUser && currentUser.id) {
      const userSettings = getUserNotifSettings(currentUser.id);
      if (!userSettings.allowNativePush) return;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: body,
        icon: '/vite.svg',
        dir: 'rtl'
      });
    }
  };

  // 🔓 دالة تطلب إذن التنبيهات من المستخدم وتطلق ترحيباً منزلقاً فوراً
  const requestNotificationPermission = async (userName: string) => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification('   • ', {
          body: `مرحباً بك المهندس ${userName}، تم تفعيل ميزة إشعارات ستارة الجوال الخارجية بنجاح.`,
          icon: '/vite.svg',
          dir: 'rtl'
        });
      }
    }
  };

  // دالة جلب البيانات من قاعدة بيانات Neon عند تشغيل الموقع
  const fetchDataFromDatabase = async (userToUse?: User) => {
    const activeUser = userToUse || currentUser;
    const isActuallyLogged = isLogged || !!userToUse;
    
    if (!isActuallyLogged) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      let dbProjects: any[] | null = null;
      let projError: any = null;

      // 🚀 Explicit column projection to reduce Egress Bandwidth
      const PROJECT_COLUMNS = 'id, operational_number, name, po, unifier_no, contractor, consultant, status, scope, classification, business_unit, region, sub_program, map_url, x, y, surveyor_name, surveyor_phone, created_at';

      const res1 = await db
        .from('projects')
        .select(PROJECT_COLUMNS)
        .order('created_at', { ascending: false });

      if (res1.error) {
        const res2 = await db.from('projects').select(PROJECT_COLUMNS);
        dbProjects = res2.data;
        projError = res2.error;
      } else {
        dbProjects = res1.data;
      }

      if (projError) {
        console.warn("فشل الاتصال بقاعدة البيانات:", projError.message);
        setDatabaseError(projError.message);
      } else if (dbProjects && dbProjects.length > 0) {
        setDatabaseError(null);
        const mappedProjects = dbProjects.map((p: any) => ({
          id: Number(p.id) || p.id,
          operationalNumber: p.operational_number || p.operationalNumber || '',
          name: p.name || '',
          po: p.po || '',
          unifierNo: p.unifier_no || p.unifierNo || '',
          contractor: p.contractor || '',
          consultant: p.consultant || '',
          status: p.status || '',
          scope: p.scope || '',
          classification: p.classification || '',
          businessUnit: p.business_unit || p.businessUnit || '',
          region: p.region || '',
          subProgram: p.sub_program || p.subProgram || '',
          mapUrl: p.map_url || p.mapUrl || '',
          x: p.x !== undefined && p.x !== null ? Number(p.x) : null,
          y: p.y !== undefined && p.y !== null ? Number(p.y) : null,
          surveyorName: p.surveyor_name || p.surveyorName || '',
          surveyorPhone: p.surveyor_phone || p.surveyorPhone || ''
        }));

        setProjects(mappedProjects);
        try {
          localStorage.setItem('water_maps_cached_projects', JSON.stringify(mappedProjects));
        } catch (cacheErr) {
          console.error(cacheErr);
        }
      } else if (dbProjects && dbProjects.length === 0) {
        // إذا عاد الاستعلام فارغاً نحافظ على المشاريع الموجودة أو المحفوظة في التطبيق بدلاً من المسح
        const initial = getParsedProjects();
        setProjects(prev => (prev && prev.length > 0 ? prev : initial));
      }

      // جلب وتحديث الصلاحيات للمستخدم النشط والمدير مباشرة وحياً من قاعدة البيانات
      if (activeUser && activeUser.id && activeUser.id !== 'guest') {
        const { data: dbUsers, error: userError } = await db
          .from('users')
          .select('*');

        if (userError) {
          console.warn("فشل جلب المستخدمين:", userError.message);
        } else if (dbUsers && dbUsers.length > 0) {
          const mappedUsers = dbUsers.map((u: any) => {
            let allowedRegions: string[] = ['الكل'];
            if (u.allowed_regions) {
              if (Array.isArray(u.allowed_regions)) { allowedRegions = u.allowed_regions; } 
              else { try { allowedRegions = JSON.parse(u.allowed_regions); } catch (e) { allowedRegions = [u.allowed_regions]; } }
            }
            let allowedScopes: string[] = ['الكل'];
            if (u.allowed_scopes) {
              if (Array.isArray(u.allowed_scopes)) { allowedScopes = u.allowed_scopes; } 
              else { try { allowedScopes = JSON.parse(u.allowed_scopes); } catch (e) { allowedScopes = [u.allowed_scopes]; } }
            }

            let allowedTabs = ['maps', 'stats', 'layers'];
            if (u.allowed_tabs !== undefined && u.allowed_tabs !== null) {
              if (Array.isArray(u.allowed_tabs)) { allowedTabs = u.allowed_tabs; } 
              else { try { allowedTabs = JSON.parse(u.allowed_tabs); } catch (e) { } }
            }

            let allowedLayers: string[] = ['water', 'sewage', 'materials'];
            if (u.allowed_layers !== undefined && u.allowed_layers !== null) {
              if (Array.isArray(u.allowed_layers)) { allowedLayers = u.allowed_layers; } 
              else { try { allowedLayers = JSON.parse(u.allowed_layers); } catch (e) { allowedLayers = [u.allowed_layers]; } }
            }

            let allowedStatsSubTabs: string[] = ['lengths', 'mymaps', 'general'];
            if (u.allowed_stats_sub_tabs !== undefined && u.allowed_stats_sub_tabs !== null) {
              if (Array.isArray(u.allowed_stats_sub_tabs)) { allowedStatsSubTabs = u.allowed_stats_sub_tabs; }
              else { try { allowedStatsSubTabs = JSON.parse(u.allowed_stats_sub_tabs); } catch (e) { } }
            }

            let allowedProjectIds: number[] = [];
            if (u.allowed_project_ids !== undefined && u.allowed_project_ids !== null) {
              if (Array.isArray(u.allowed_project_ids)) { allowedProjectIds = u.allowed_project_ids.map(Number); } 
              else { try { allowedProjectIds = JSON.parse(u.allowed_project_ids).map(Number); } catch (e) { } }
            }

            let allowedStatuses: string[] = ['الكل'];
            if (u.allowed_statuses) {
              if (Array.isArray(u.allowed_statuses)) { allowedStatuses = u.allowed_statuses; } 
              else { try { allowedStatuses = JSON.parse(u.allowed_statuses); } catch (e) { allowedStatuses = [u.allowed_statuses]; } }
            }

            return {
              id: u.id,
              username: u.username,
              name: u.name,
              role: u.role,
              allowedRegions: allowedRegions,
              allowedScopes: allowedScopes,
              password: u.password,
              allowedTabs: allowedTabs,
              allowedLayers: allowedLayers,
              allowedStatsSubTabs: allowedStatsSubTabs,
              canOpenExternalLinks: u.can_open_external_links !== false,
              canFilter: u.can_filter !== false,
              canInsert: u.can_insert !== false,
              department: u.department || '',
              jobTitle: u.job_title || '',
              allowedProjectIds: allowedProjectIds,
              allowedStatuses: allowedStatuses
            };
          });

          // 🛡️ Strip sensitive password fields before caching in localStorage
          const safeUsersForStorage = mappedUsers.map(({ password, ...rest }) => ({ ...rest, password: '' }));
          if (activeUser.role === 'admin') {
            setUsers(safeUsersForStorage);
            localStorage.setItem('water_maps_cached_users', JSON.stringify(safeUsersForStorage));
          }

          // 🔗 Sync active currentUser state with the latest live permissions from database
          const myProfile = mappedUsers.find(u => u.id === activeUser.id || (u.username && u.username.toLowerCase() === (activeUser.username || '').toLowerCase()));
          if (myProfile) {
            setCurrentUser(myProfile);
            const { password: _p, ...safeProfile } = myProfile;
            localStorage.setItem('water_maps_cached_users', JSON.stringify([safeProfile]));
          }
        }
      }
    } catch (err) {
      console.warn(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setActiveTab('maps');
    if (isLogged) {
      fetchDataFromDatabase();
    } else {
      setIsLoading(false);
    }
  }, [isLogged]);

  // تتبع الإشعارات التي أرسلت لها تنبيهات خارجية لمنع التكرار المتتالي المنبثق
  const notifiedNativeIdsRef = useRef<Set<string>>(
    (() => {
      try {
        const saved = localStorage.getItem('water_maps_already_notified_ids');
        return saved ? new Set(JSON.parse(saved)) : new Set<string>();
      } catch (e) {
        return new Set<string>();
      }
    })()
  );

  // 🔄 المزامنة الحية لِـسحب الإشعارات وسجلات التغيرات من قاعدة البيانات والتخزين المحلي وتمرير الأحداث الدقيقة
  useEffect(() => {
    const fetchUserNotifications = async () => {
      if (!currentUser || !currentUser.id || !isLogged) return;
      
      try {
        let fetchedData: any[] = [];
        let changelogData: any[] = [];
        const client = getDatabaseClient() || db;

        if (client) {
          try {
            const { data, error } = await client
              .from('notifications')
              .select('id, project_id, project_name, type, message, created_at, region, scope')
              .order('created_at', { ascending: false })
              .limit(40);

            if (!error && data) {
              fetchedData = data;
            }
          } catch (e) {
            console.warn('Neon Database notifications fetch error:', e);
          }

          try {
            const { data: cData, error: cErr } = await (client.from('project_changelogs') as any)
              .select('id, project_id, project_name, report_id, previous_report_id, diff, created_at')
              .order('created_at', { ascending: false })
              .limit(30);

            if (!cErr && cData) {
              changelogData = cData;
            }
          } catch (e) {
            console.warn('Neon Database project_changelogs fetch error:', e);
          }
        }

        // Merge with local notifications cache if present
        let localNotifs: any[] = [];
        try {
          const savedLocal = localStorage.getItem('water_maps_local_notifications');
          if (savedLocal) {
            localNotifs = JSON.parse(savedLocal);
          }
        } catch (e) {}

        const allRawMap = new Map<string, any>();
        
        // 1. Add fetched from notifications table
        for (const item of fetchedData) {
          const key = String(item.id);
          allRawMap.set(key, {
            id: key,
            projectId: item.project_id || item.projectId,
            projectName: item.project_name || item.projectName,
            type: item.type || 'change_detected',
            message: item.message,
            timestamp: item.created_at ? (new Date(item.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) + ' - ' + new Date(item.created_at).toLocaleDateString('ar-SA')) : (item.timestamp || ''),
            region: item.region || '',
            scope: item.scope || '',
            created_at: item.created_at || new Date().toISOString()
          });
        }

        // 2. Add fetched from project_changelogs table for map updates coverage
        for (const cItem of changelogData) {
          const diff = cItem.diff || {};
          if (diff.hasChanges || diff.addedFeaturesCount > 0 || diff.modifiedFeaturesCount > 0 || diff.deletedFeaturesCount > 0) {
            const cKey = `changelog-${cItem.id}`;
            if (!allRawMap.has(cKey)) {
              const parts = [];
              if (diff.addedFeaturesCount > 0) parts.push(`إضافة ${diff.addedFeaturesCount} عنصر`);
              if (diff.modifiedFeaturesCount > 0) parts.push(`تعديل ${diff.modifiedFeaturesCount} عنصر`);
              if (diff.deletedFeaturesCount > 0) parts.push(`حذف ${diff.deletedFeaturesCount} عنصر`);
              if (diff.lengthDiffMeters && Math.abs(diff.lengthDiffMeters) > 0.1) {
                parts.push(`فارق أطوال (${diff.lengthDiffMeters > 0 ? '+' : ''}${Number(diff.lengthDiffMeters).toFixed(1)}m)`);
              }
              const diffDetailsStr = parts.length > 0 ? ` (${parts.join('، ')})` : '';
              const projName = cItem.project_name || 'مشروع';
              const notifMsg = `📢 تم رصد تحديثات وتغيرات جديدة بخريطة مشروع (${projName})${diffDetailsStr}`;

              allRawMap.set(cKey, {
                id: cKey,
                projectId: cItem.project_id,
                projectName: projName,
                type: 'change_detected',
                message: notifMsg,
                timestamp: cItem.created_at ? (new Date(cItem.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) + ' - ' + new Date(cItem.created_at).toLocaleDateString('ar-SA')) : '',
                region: '',
                scope: '',
                created_at: cItem.created_at || new Date().toISOString()
              });
            }
          }
        }

        // 3. Add local
        for (const item of localNotifs) {
          const key = String(item.id);
          if (!allRawMap.has(key)) {
            allRawMap.set(key, {
              id: key,
              projectId: item.project_id || item.projectId,
              projectName: item.project_name || item.projectName,
              type: item.type || 'change_detected',
              message: item.message,
              timestamp: item.created_at ? (new Date(item.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) + ' - ' + new Date(item.created_at).toLocaleDateString('ar-SA')) : (item.timestamp || ''),
              region: item.region || '',
              scope: item.scope || '',
              created_at: item.created_at || new Date().toISOString()
            });
          }
        }

        const combinedRows = Array.from(allRawMap.values());
        combinedRows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        // Read & Cleared IDs for current user
        const readIdsKey = `water_maps_read_notifs_${currentUser.id}`;
        const clearedIdsKey = `water_maps_cleared_notifs_${currentUser.id}`;
        
        let readIds: string[] = [];
        let clearedIds: string[] = [];
        
        try {
          const savedRead = localStorage.getItem(readIdsKey);
          readIds = savedRead ? JSON.parse(savedRead) : [];
        } catch (e) {}
        
        try {
          const savedCleared = localStorage.getItem(clearedIdsKey);
          clearedIds = savedCleared ? JSON.parse(savedCleared) : [];
        } catch (e) {}

        const userNotifSettings = getUserNotifSettings(currentUser.id);
        const favProjectIds = projects.filter(p => p.isFavorite || favoriteIds.includes(p.id)).map(p => p.id);

        const mappedNotifs = combinedRows
          .map((n: any) => ({
            id: String(n.id),
            projectId: n.projectId,
            projectName: n.projectName,
            type: n.type,
            message: cleanNotificationMessage(n.message, n.projectName, n.type),
            timestamp: n.timestamp,
            read: readIds.includes(String(n.id)),
            region: n.region || '',
            scope: n.scope || ''
          }))
          .filter((notif: any) => isNotificationAllowed(notif, currentUser, userNotifSettings, favProjectIds, projects) && !clearedIds.includes(String(notif.id)));

        // إطلاق التنبيه الخارجي مرة واحدة فقط لكل إشعار غير مقروء لمنع الانبثاق المتكرر
        const unnotifiedItems = mappedNotifs.filter((mn: any) => !mn.read && !notifiedNativeIdsRef.current.has(mn.id));
        if (unnotifiedItems.length > 0) {
          unnotifiedItems.forEach((newNotif: any) => {
            notifiedNativeIdsRef.current.add(newNotif.id);
            sendNativeNotification('تنبيه مشاريع الخرائط 🔔', cleanNotificationMessage(newNotif.message, newNotif.projectName, newNotif.type));
          });
          try {
            localStorage.setItem(
              'water_maps_already_notified_ids',
              JSON.stringify(Array.from(notifiedNativeIdsRef.current))
            );
          } catch (e) {}
        }

        setNotifications(mappedNotifs);
      } catch (err) {
        console.error('fetchUserNotifications exception:', err);
      }
    };

    fetchUserNotifications();
    // تقليل التكرار المفرط لمنع استهلاك Vercel Edge Requests: المزامنة تتم فورياً عبر Neon Database Realtime وأحداث النافذة
    const interval = setInterval(fetchUserNotifications, 300000); // كل 5 دقائق كفحص احتياطي نادراً بدلاً من كل 12 ثانية

    // تحديث الإشعارات عند عودة المستخدم إلى تبويب التطبيق
    const handleWindowFocus = () => fetchUserNotifications();
    window.addEventListener('focus', handleWindowFocus);

    // الاشتراك المباشر عبر Neon Database Realtime لإرسال الإشعارات لحظياً لجميع الأجهزة
    let realtimeChannel: any = null;
    const client = getDatabaseClient() || db;
    if (client && typeof client.channel === 'function') {
      try {
        realtimeChannel = client
          .channel('public:notifications_and_changelogs_live')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
            fetchUserNotifications();
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'project_changelogs' }, () => {
            fetchUserNotifications();
          })
          .subscribe();
      } catch (e) {
        console.warn('Neon Database Realtime subscription warning:', e);
      }
    }

    const handleCustomEvent = () => fetchUserNotifications();
    window.addEventListener('water_maps_notifications_updated', handleCustomEvent);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleWindowFocus);
      if (realtimeChannel && client && typeof client.removeChannel === 'function') {
        try { client.removeChannel(realtimeChannel); } catch (e) {}
      }
      window.removeEventListener('water_maps_notifications_updated', handleCustomEvent);
    };
  }, [currentUser, isLogged, projects, favoriteIds]);

  useEffect(() => {
    localStorage.setItem('water_maps_active_user_id', currentUser.id);
  }, [currentUser]);

  useEffect(() => {
    const saved = localStorage.getItem(`water_maps_favorites_${currentUser.id}`);
    if (saved) { try { setFavoriteIds(JSON.parse(saved)); } catch (e) { } }
  }, [currentUser.id]);

  useEffect(() => {
    localStorage.setItem(`water_maps_favorites_${currentUser.id}`, JSON.stringify(favoriteIds));
  }, [favoriteIds, currentUser.id]);

  // دمج ميزة الرجوع الذكي باستخدام زر الرجوع للجوال والمتصفح لضمان عدم إغلاق التطبيق فجأة
  useEffect(() => {
    if (!isLogged) return;

    if (!window.history.state || window.history.state.step !== 'app') {
      window.history.replaceState({ step: 'root' }, '');
      window.history.pushState({ step: 'app' }, '');
    }

    const handlePopState = (event: PopStateEvent) => {
      if (showExitModal) {
        setShowExitModal(false);
        window.history.pushState({ step: 'app' }, '');
        return;
      }

      let handled = false;
      if (isProjectModalOpen) {
        setIsProjectModalOpen(false);
        handled = true;
      }
      else if (selectedProjectId !== null) {
        setSelectedProjectId(null);
        setMobileViewMode('list');
        handled = true;
      }
      else if (activeTab !== 'maps') {
        setActiveTab('maps');
        handled = true;
      }

      if (handled) {
        window.history.pushState({ step: 'app' }, '');
      } else {
        setShowExitModal(true);
        window.history.pushState({ step: 'app' }, '');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isLogged, isProjectModalOpen, selectedProjectId, activeTab, showExitModal]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const bellContainer = document.getElementById('notifications-bell-container');
      if (bellContainer && !bellContainer.contains(event.target as Node)) {
        setShowNotificationsDropdown(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, []);

  const handleToggleFavorite = (projectId: number) => {
    setFavoriteIds(prev => {
      const isFav = prev.includes(projectId);
      const updated = isFav ? prev.filter(id => id !== projectId) : [...prev, projectId];
      const targetProj = projects.find(p => p.id === projectId);
      const projName = targetProj ? targetProj.name : '';
      
      const alertMsg = isFav ? `تمت الإزالة من المفضلة ⭐️` : `تمت الإضافة للمفضلة ⭐`;
      showNotification(alertMsg);
      
      // مزامنة التفضيل مع ستارة الجوال الخارجية
      sendNativeNotification('المشاريع المفضلة ⭐', `${alertMsg}: ${projName}`);
      
      return updated;
    });
  };

  // تجميع الإشعارات المتشابهة حسب المشروع لعدم التكرار وإظهار عداد التحديثات المجمعة
  const groupedNotifications = useMemo(() => {
    if (!notifications || notifications.length === 0) return [];

    const map = new Map<string, AppNotification>();
    const orderKeys: string[] = [];

    for (const notif of notifications) {
      const key = notif.projectId ? `proj_${notif.projectId}` : (notif.projectName ? `name_${notif.projectName}` : `id_${notif.id}`);

      if (!map.has(key)) {
        orderKeys.push(key);
        map.set(key, {
          ...notif,
          groupedCount: 1,
          groupedIds: [String(notif.id)]
        });
      } else {
        const existing = map.get(key)!;
        existing.groupedCount = (existing.groupedCount || 1) + 1;
        if (!existing.groupedIds) existing.groupedIds = [String(existing.id)];
        existing.groupedIds.push(String(notif.id));
        if (!notif.read) {
          existing.read = false;
        }
      }
    }

    return orderKeys.map(k => map.get(k)!);
  }, [notifications]);

  const unreadNotificationsCount = useMemo(() => {
    return groupedNotifications.filter(n => !n.read).length;
  }, [groupedNotifications]);

  const handleMarkAllAsRead = () => {
    const readIdsKey = `water_maps_read_notifs_${currentUser.id}`;
    const allIds = notifications.map(n => String(n.id));
    localStorage.setItem(readIdsKey, JSON.stringify(allIds));
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    showNotification('تم تحديد جميع الإشعارات كمقروءة');
  };

  const handleClearNotifications = () => {
    const clearedIdsKey = `water_maps_cleared_notifs_${currentUser.id}`;
    const allIds = notifications.map(n => String(n.id));
    localStorage.setItem(clearedIdsKey, JSON.stringify(allIds));
    setNotifications([]);
    showNotification('تم مسح قائمة الإشعارات');
  };

  const handleNotificationClick = (notif: AppNotification) => {
    const readIdsKey = `water_maps_read_notifs_${currentUser.id}`;
    try {
      const saved = localStorage.getItem(readIdsKey);
      let readIds: string[] = saved ? JSON.parse(saved) : [];
      const idsToMark = notif.groupedIds && notif.groupedIds.length > 0 ? notif.groupedIds : [String(notif.id)];
      let changed = false;
      idsToMark.forEach(id => {
        if (!readIds.includes(id)) {
          readIds.push(id);
          changed = true;
        }
      });
      if (changed) {
        localStorage.setItem(readIdsKey, JSON.stringify(readIds));
      }
    } catch (e) { }
    
    const idsToSet = new Set(notif.groupedIds || [String(notif.id)]);
    setNotifications(prev => prev.map(n => idsToSet.has(String(n.id)) ? { ...n, read: true } : n));
    
    if (notif.projectId) {
      setSelectedProjectId(notif.projectId);
      setActiveTab('maps');
      setMobileViewMode('map');
      showNotification(`تم تحديد مشروع: ${notif.projectName}`);
    }
    setShowNotificationsDropdown(false);
  };

  // 5. Role-based Project Filtering Logic
  const visibleProjects = useMemo(() => {
    return projects
      .filter(p => isProjectAllowedForUser(p, currentUser))
      .map(p => ({
        ...p,
        isFavorite: favoriteIds.includes(Number(p.id)) || favoriteIds.includes(p.id as any)
      }));
  }, [projects, currentUser, favoriteIds]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubProgram, setSelectedSubProgram] = useState('الكل');
  const [selectedClassification, setSelectedClassification] = useState('الكل');
  const [selectedStatus, setSelectedStatus] = useState('الكل');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const filteredProjects = useMemo(() => {
    return visibleProjects.filter(p => {
      const query = searchTerm.toLowerCase().trim();
      const matchesSearch = !query ||
        p.name.toLowerCase().includes(query) ||
        p.operationalNumber.toLowerCase().includes(query) ||
        (p.contractor || '').toLowerCase().includes(query) ||
        (p.consultant || '').toLowerCase().includes(query) ||
        (p.po || '').toLowerCase().includes(query) ||
        (p.unifierNo || '').toLowerCase().includes(query) ||
        (p.classification || '').toLowerCase().includes(query) ||
        (p.status || '').toLowerCase().includes(query);

      const matchesSubProgram = selectedSubProgram === 'الكل' || p.subProgram === selectedSubProgram;
      const matchesClassification = selectedClassification === 'الكل' || p.classification === selectedClassification;
      const matchesStatus = selectedStatus === 'الكل' || p.status === selectedStatus;
      const matchesFavorites = !showOnlyFavorites || !!p.isFavorite;

      return matchesSearch && matchesSubProgram && matchesClassification && matchesStatus && matchesFavorites;
    });
  }, [visibleProjects, searchTerm, selectedSubProgram, selectedClassification, selectedStatus, showOnlyFavorites]);

  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return visibleProjects.find(p => p.id === selectedProjectId) || null;
  }, [visibleProjects, selectedProjectId]);

  const canEditProjects = currentUser.role === 'admin' || (currentUser.role === 'editor' && currentUser.canInsert !== false) || currentUser.canInsert === true;

  const showNotification = (msg: string) => {
    setSuccessNotification(msg);
    setTimeout(() => setSuccessNotification(''), 4000);
  };

  const handleNwcSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const email = nwcEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) && !email.includes('@')) {
      setLoginError('الرجاء إدخال بريد إلكتروني صحيح.');
      return;
    }
    const prefix = email.includes('@') ? email.split('@')[0] : email;
    
    setIsLoading(true);
    try {
      const { data, error } = await db
        .from('users')
        .select('*');

      let found = null;
      if (data && data.length > 0) {
        found = data.find((u: any) => {
          const uName = (u.username || '').trim().toLowerCase();
          const uEmail = (u.email || '').trim().toLowerCase();
          return uName === email || uName === prefix || uEmail === email || uEmail === prefix;
        });
      }

      if (!found) {
        setLoginError('عذراً، هذا البريد غير معتمد ومسجل مسبقاً في النظام.');
        setIsLoading(false);
        return;
      }

      if (nwcPassword.trim() !== (found.password || 'nwc1234')) {
        setLoginError('كلمة المرور المدخلة غير صحيحة!');
        setIsLoading(false);
        return;
      }

      let allowedRegions: string[] = ['الكل'];
      if (found.allowed_regions) {
        if (Array.isArray(found.allowed_regions)) { allowedRegions = found.allowed_regions; } 
        else { try { allowedRegions = JSON.parse(found.allowed_regions); } catch (e) { allowedRegions = [found.allowed_regions]; } }
      }
      let allowedScopes: string[] = ['الكل'];
      if (found.allowed_scopes) {
        if (Array.isArray(found.allowed_scopes)) { allowedScopes = found.allowed_scopes; } 
        else { try { allowedScopes = JSON.parse(found.allowed_scopes); } catch (e) { allowedScopes = [found.allowed_scopes]; } }
      }
      let allowedTabs = ['maps', 'stats', 'layers'];
      if (found.allowed_tabs) {
        if (Array.isArray(found.allowed_tabs)) { allowedTabs = found.allowed_tabs; } 
        else { try { allowedTabs = JSON.parse(found.allowed_tabs); } catch (e) { } }
      }
      let allowedLayers: string[] = ['water', 'sewage', 'materials'];
      if (found.allowed_layers) {
        if (Array.isArray(found.allowed_layers)) { allowedLayers = found.allowed_layers; } 
        else { try { allowedLayers = JSON.parse(found.allowed_layers); } catch (e) { allowedLayers = [found.allowed_layers]; } }
      }
      let allowedStatsSubTabs: string[] = ['lengths', 'mymaps', 'general'];
      if (found.allowed_stats_sub_tabs) {
        if (Array.isArray(found.allowed_stats_sub_tabs)) { allowedStatsSubTabs = found.allowed_stats_sub_tabs; }
        else { try { allowedStatsSubTabs = JSON.parse(found.allowed_stats_sub_tabs); } catch (e) { } }
      }
      let allowedProjectIds: number[] = [];
      if (found.allowed_project_ids) {
        if (Array.isArray(found.allowed_project_ids)) { allowedProjectIds = found.allowed_project_ids.map(Number); } 
        else { try { allowedProjectIds = JSON.parse(found.allowed_project_ids).map(Number); } catch (e) { } }
      }
      let allowedStatuses: string[] = ['الكل'];
      if (found.allowed_statuses) {
        if (Array.isArray(found.allowed_statuses)) { allowedStatuses = found.allowed_statuses; } 
        else { try { allowedStatuses = JSON.parse(found.allowed_statuses); } catch (e) { allowedStatuses = [found.allowed_statuses]; } }
      }

      const mappedUser = {
        id: found.id,
        username: found.username,
        name: found.name,
        role: found.role,
        allowedRegions: allowedRegions,
        allowedScopes: allowedScopes,
        password: found.password,
        allowedTabs: allowedTabs,
        allowedLayers: allowedLayers,
        allowedStatsSubTabs: allowedStatsSubTabs,
        canOpenExternalLinks: found.can_open_external_links !== false,
        canFilter: found.can_filter !== false,
        canInsert: found.can_insert !== false,
        department: found.department || '',
        jobTitle: found.job_title || '',
        allowedProjectIds: allowedProjectIds,
        allowedStatuses: allowedStatuses
      };

      setCurrentUser(mappedUser);
      setIsLogged(true);
      setActiveTab('maps');
      localStorage.setItem('water_maps_is_logged', 'true');
      localStorage.setItem('water_maps_active_user_id', mappedUser.id);
      // 🛡️ Strip sensitive password fields before caching in localStorage
      const { password: _pwd1, ...safeUser1 } = mappedUser;
      localStorage.setItem('water_maps_cached_users', JSON.stringify([{ ...safeUser1, password: '' }]));
      showNotification(`مرحباً بك مجدداً المهندس: ${mappedUser.name}`);
      
      requestNotificationPermission(mappedUser.name);

      await fetchDataFromDatabase(mappedUser);
    } catch (err) {
      console.error(err);
      setLoginError('حدث خطأ أثناء الاتصال بقاعدة البيانات.');
      setIsLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoading(true);

    try {
      let data: any[] | null = null;

      const res = await db
        .from('users')
        .select('*')
        .or('role.eq.admin,username.eq.admin');

      if (!res.error && res.data && res.data.length > 0) {
        data = res.data;
      } else {
        const allRes = await db.from('users').select('*');
        if (allRes.data) {
          data = allRes.data.filter((u: any) => u.role === 'admin' || u.username === 'admin');
        }
      }

      let found: any = null;

      if (data && data.length > 0) {
        found = data.find((u: any) => u.password === adminPassword.trim());
      }

      if (!found) {
        if (data && data.length > 0) {
          setLoginError('كلمة المرور غير صحيحة!');
          setIsLoading(false);
          return;
        }

        // إذا لم يكن هناك أي حساب مدير في قاعدة البيانات نهائياً، ننشئ حساب مدير تلقائياً بكلمة المرور المدخلة
        if (!adminPassword.trim() || adminPassword.trim().length < 6) {
          setLoginError('يرجى إدخال كلمة مرور قوية لا تقل عن 6 خانات لتهيئة حساب المشرف.');
          setIsLoading(false);
          return;
        }
        const defaultPassword = adminPassword.trim();
        const newAdminUser = {
          id: 'admin-' + Date.now(),
          username: 'admin',
          name: 'مدير النظام الرئيسي',
          role: 'admin',
          password: defaultPassword,
          allowed_regions: ['الكل'],
          allowed_scopes: ['الكل'],
          allowed_tabs: ['maps', 'stats', 'layers', 'users'],
          allowed_layers: ['water', 'sewage', 'materials'],
          can_open_external_links: true,
          can_filter: true,
          can_insert: true,
          department: 'إدارة النظام',
          job_title: 'مدير النظام'
        };

        try {
          await db.from('users').insert([newAdminUser]);
        } catch (insertErr) {
          console.warn("تعذر إضافة مدير النظام تلقائياً لقاعدة البيانات:", insertErr);
        }

        found = newAdminUser;
      }

      let allowedRegions: string[] = ['الكل'];
      if (found.allowed_regions) {
        if (Array.isArray(found.allowed_regions)) { allowedRegions = found.allowed_regions; } 
        else { try { allowedRegions = JSON.parse(found.allowed_regions); } catch (e) { allowedRegions = [found.allowed_regions]; } }
      }
      let allowedScopes: string[] = ['الكل'];
      if (found.allowed_scopes) {
        if (Array.isArray(found.allowed_scopes)) { allowedScopes = found.allowed_scopes; } 
        else { try { allowedScopes = JSON.parse(found.allowed_scopes); } catch (e) { allowedScopes = [found.allowed_scopes]; } }
      }
      let allowedTabs = ['maps', 'stats', 'layers', 'users'];
      if (found.allowed_tabs) {
        if (Array.isArray(found.allowed_tabs)) { allowedTabs = found.allowed_tabs; } 
        else { try { allowedTabs = JSON.parse(found.allowed_tabs); } catch (e) { } }
      }
      let allowedLayers: string[] = ['water', 'sewage', 'materials'];
      if (found.allowed_layers) {
        if (Array.isArray(found.allowed_layers)) { allowedLayers = found.allowed_layers; } 
        else { try { allowedLayers = JSON.parse(found.allowed_layers); } catch (e) { allowedLayers = [found.allowed_layers]; } }
      }
      let allowedProjectIds: number[] = [];
      if (found.allowed_project_ids) {
        if (Array.isArray(found.allowed_project_ids)) { allowedProjectIds = found.allowed_project_ids.map(Number); } 
        else { try { allowedProjectIds = JSON.parse(found.allowed_project_ids).map(Number); } catch (e) { } }
      }
      let allowedStatuses: string[] = ['الكل'];
      if (found.allowed_statuses) {
        if (Array.isArray(found.allowed_statuses)) { allowedStatuses = found.allowed_statuses; } 
        else { try { allowedStatuses = JSON.parse(found.allowed_statuses); } catch (e) { allowedStatuses = [found.allowed_statuses]; } }
      }

      const mappedUser: User = {
        id: found.id,
        username: found.username || 'admin',
        name: found.name || 'مدير النظام',
        role: 'admin',
        allowedRegions: allowedRegions,
        allowedScopes: allowedScopes,
        password: found.password || adminPassword.trim(),
        allowedTabs: allowedTabs,
        allowedLayers: allowedLayers,
        canOpenExternalLinks: found.can_open_external_links !== false,
        canFilter: found.can_filter !== false,
        canInsert: found.can_insert !== false,
        department: found.department || '',
        jobTitle: found.job_title || '',
        allowedProjectIds: allowedProjectIds,
        allowedStatuses: allowedStatuses
      };

      setCurrentUser(mappedUser);
      setIsLogged(true);
      setActiveTab('maps');
      localStorage.setItem('water_maps_is_logged', 'true');
      localStorage.setItem('water_maps_active_user_id', mappedUser.id);
      // 🛡️ Strip sensitive password fields before caching in localStorage
      const { password: _pwd2, ...safeUser2 } = mappedUser;
      localStorage.setItem('water_maps_cached_users', JSON.stringify([{ ...safeUser2, password: '' }]));
      showNotification('أهلاً بك يا مدير النظام، تم تسجيل الدخول بنجاح.');
      
      requestNotificationPermission('مدير النظام');

      await fetchDataFromDatabase(mappedUser);
    } catch (err) {
      console.error(err);
      setLoginError('حدث خطأ أثناء الاتصال بقاعدة البيانات.');
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLogged(false);
    localStorage.removeItem('water_maps_is_logged');
    localStorage.removeItem('water_maps_active_user_id');
    localStorage.removeItem('water_maps_cached_users');
    localStorage.removeItem('water_maps_cached_projects');
    setProjects([]);
    setUsers([]);
    setNotifications([]);
    setSelectedProjectId(null);
    showNotification('تم تسجيل الخروج بنجاح.');
  };

  // ==========================================
  // دالة الحفظ المحدثة بالكامل لصياغة الحدث الدقيق مدمجاً باسم المهندس الحقيقي
  // ==========================================
  const handleSaveProject = async (savedProj: Project) => {
    const payload: any = {
      operational_number: savedProj.operationalNumber,
      name: savedProj.name,
      po: savedProj.po,
      unifier_no: savedProj.unifierNo,
      contractor: savedProj.contractor,
      consultant: savedProj.consultant,
      status: savedProj.status,
      scope: typeof savedProj.scope === 'string' ? savedProj.scope : (Array.isArray(savedProj.scope) ? savedProj.scope[0] : 'صرف صحي'),
      classification: savedProj.classification,
      business_unit: savedProj.businessUnit,
      region: savedProj.region,
      sub_program: savedProj.subProgram,
      map_url: savedProj.mapUrl,
      x: savedProj.x !== undefined && savedProj.x !== null ? Number(savedProj.x) : null,
      y: savedProj.y !== undefined && savedProj.y !== null ? Number(savedProj.y) : null,
      surveyor_name: savedProj.surveyorName || '',
      surveyor_phone: savedProj.surveyorPhone || ''
    };

    const exists = projects.some(p => p.id === savedProj.id);
    let fieldChangesList: { fieldLabel: string; oldValue: string; newValue: string }[] = [];
    
    // 1️⃣ حساب الفروقات ودمجها بذكاء مع اسم المهندس القام بالحركة لتطير جملة واحدة مقفلة
    let dynamicDiffMsg = '';
    if (exists) {
      const oldProj = projects.find(p => p.id === savedProj.id);
      const diffDetails = oldProj ? getProjectDifferencesMessage(oldProj, savedProj) : '';
      fieldChangesList = oldProj ? getProjectFieldChanges(oldProj, savedProj) : [];
      
      if (diffDetails) {
        dynamicDiffMsg = `قام المهندس ${currentUser.name} بتعديل مشروع: ${savedProj.name}، ${diffDetails}`;
      } else {
        dynamicDiffMsg = `قام المهندس ${currentUser.name} بتعديل بيانات في مشروع: ${savedProj.name}`;
      }
    } else {
      dynamicDiffMsg = `🚀 قام المهندس ${currentUser.name} بإضافة مشروع جديد: ${savedProj.name}`;
    }

    // بناء كائن التوثيق التاريخي لسجل التغييرات
    const changelogPayload = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      projectId: savedProj.id,
      projectName: savedProj.name,
      operationalNumber: savedProj.operationalNumber,
      userName: currentUser.name,
      userRole: currentUser.role === 'admin' ? 'مدير النظام' : 'محرر خرائط',
      changeType: exists ? 'edit' : 'add',
      timestamp: new Date().toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }),
      createdAtISO: new Date().toISOString(),
      summary: dynamicDiffMsg,
      fieldChanges: fieldChangesList
    };

    try {
      await db.from('project_changelogs').insert([{
        project_id: savedProj.id,
        project_name: savedProj.name,
        diff: changelogPayload,
        created_at: new Date().toISOString()
      }]);
    } catch (clErr) {
      console.warn("تعذر حفظ سجل التغييرات في قاعدة البيانات:", clErr);
    }

    try {
      const savedLocalLogs = localStorage.getItem('water_maps_local_changelogs');
      let localLogsList = savedLocalLogs ? JSON.parse(savedLocalLogs) : [];
      localLogsList.unshift(changelogPayload);
      if (localLogsList.length > 200) localLogsList = localLogsList.slice(0, 200);
      localStorage.setItem('water_maps_local_changelogs', JSON.stringify(localLogsList));
    } catch (e) {}

    try {
      if (exists) {
        // 2️⃣ الرفع طوالي لقاعدة البيانات
        let { error } = await db.from('projects').update(payload).eq('id', savedProj.id);
        
        // إذا لم تكن الأعمدة surveyor_name / surveyor_phone مضافة بعد في جدول Neon Database
        if (error && (error.code === '42703' || error.message.includes('surveyor_name') || error.message.includes('surveyor_phone'))) {
          const fallbackPayload = { ...payload };
          delete fallbackPayload.surveyor_name;
          delete fallbackPayload.surveyor_phone;
          const retryRes = await db.from('projects').update(fallbackPayload).eq('id', savedProj.id);
          error = retryRes.error;
        }

        if (!error) {
          showNotification(`تم تحديث بيانات مشروع بالسيرفر: ${savedProj.name}`);
          
          // طيران إشعار فوري منزلق لستارة الجوال الخارجية بالحدث المدمج الكامل
          sendNativeNotification('تعديل مشروع 💾', dynamicDiffMsg);

          // إدخال سطر الإشعار الحامِل لِلاسم والحدث الدقيق ليتوزع وراء الستار للباقيين
          await db.from('notifications').insert([{
            user_id: 'all',
            project_id: savedProj.id,
            project_name: savedProj.name,
            type: 'edit',
            message: dynamicDiffMsg, 
            region: savedProj.region,
            scope: payload.scope
          }]);
        }
      } else {
        let { data: insertedData, error } = await db.from('projects').insert([payload]).select();
        
        // إذا لم تكن الأعمدة مضافة بعد في Neon Database
        if (error && (error.code === '42703' || error.message.includes('surveyor_name') || error.message.includes('surveyor_phone'))) {
          const fallbackPayload = { ...payload };
          delete fallbackPayload.surveyor_name;
          delete fallbackPayload.surveyor_phone;
          const retryRes = await db.from('projects').insert([fallbackPayload]).select();
          insertedData = retryRes.data;
          error = retryRes.error;
        }

        if (!error && insertedData && insertedData[0]) {
          showNotification(`تم إضافة مشروع شبكة جديد بنجاح للسيرفر: ${savedProj.name}`);
          
          sendNativeNotification('إضافة مشروع جديد 🚀', `تم إدراج خارطة مشروع جديد بنجاح: ${savedProj.name}`);

          await db.from('notifications').insert([{
            user_id: 'all',
            project_id: insertedData[0].id,
            project_name: savedProj.name,
            type: 'add',
            message: dynamicDiffMsg,
            region: savedProj.region,
            scope: payload.scope
          }]);
        }
      }
    } catch (err: any) {
      console.error(err);
    }

    // 3️⃣ تحديث الـ State المحلية ونعش البيانات بعد الإرسال الناجح لضمان سلامة الترتيب وحساب الفروقات
    setProjects(prev => {
      const exists = prev.some(p => p.id === savedProj.id);
      if (exists) {
        return prev.map(p => p.id === savedProj.id ? savedProj : p);
      } else {
        return [savedProj, ...prev];
      }
    });

    fetchDataFromDatabase();
  };

  const handleStartAddNewProject = () => {
    if (!canEditProjects) return;
    setEditingProject(null);
    setIsProjectModalOpen(true);
  };

  const handleStartEditProject = (proj: Project) => {
    if (!canEditProjects) return;
    setEditingProject(proj);
    setIsProjectModalOpen(true);
  };

  const handleSaveUserPermissions = async (updatedUser: User) => {
    // 1. Update local users state and local storage immediately
    setUsers(prev => {
      const exists = prev.some(u => u.id === updatedUser.id);
      const nextUsers = exists 
        ? prev.map(u => u.id === updatedUser.id ? updatedUser : u)
        : [updatedUser, ...prev];
      try {
        localStorage.setItem('water_maps_cached_users', JSON.stringify(nextUsers));
      } catch (e) {
        console.error(e);
      }
      return nextUsers;
    });

    if (currentUser.id === updatedUser.id) {
      setCurrentUser(updatedUser);
    }

    const payload = {
      username: updatedUser.username,
      name: updatedUser.name,
      role: updatedUser.role,
      allowed_regions: updatedUser.allowedRegions,
      allowed_scopes: updatedUser.allowedScopes,
      password: updatedUser.password || 'nwc1234',
      allowed_tabs: updatedUser.allowedTabs || ['maps', 'stats', 'layers'],
      allowed_layers: updatedUser.allowedLayers || ['water', 'sewage', 'materials'],
      allowed_stats_sub_tabs: updatedUser.allowedStatsSubTabs || ['lengths', 'mymaps', 'general'],
      can_open_external_links: updatedUser.canOpenExternalLinks !== false,
      can_filter: updatedUser.canFilter !== false,
      can_insert: updatedUser.canInsert !== false,
      department: updatedUser.department || '',
      job_title: updatedUser.jobTitle || '',
      allowed_project_ids: updatedUser.allowedProjectIds || [],
      allowed_statuses: updatedUser.allowedStatuses || ['الكل']
    };

    const exists = users.some(u => u.id === updatedUser.id);
    try {
      let { error } = exists
        ? await db.from('users').update(payload).eq('id', updatedUser.id)
        : await db.from('users').insert([{ id: updatedUser.id, ...payload }]);

      if (error) {
        console.warn("تعذر إضافة الأعمدة المتقدمة في قاعدة البيانات، جاري الحفظ بالأعمدة الأساسية:", error.message);
        const fallbackPayload = {
          username: updatedUser.username,
          name: updatedUser.name,
          role: updatedUser.role,
          allowed_regions: updatedUser.allowedRegions,
          allowed_scopes: updatedUser.allowedScopes,
          password: updatedUser.password || 'nwc1234'
        };
        await (exists
          ? db.from('users').update(fallbackPayload).eq('id', updatedUser.id)
          : db.from('users').insert([{ id: updatedUser.id, ...fallbackPayload }]));
      }
    } catch (err: any) {
      console.error(err);
    }
    fetchDataFromDatabase();
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await db.from('users').delete().eq('id', userId);
    } catch (err: any) {
      console.error(err);
    }
    fetchDataFromDatabase();
  };

  if (!isLogged) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden font-sans" id="login-container">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-3xl shadow-2xl p-6 md:p-8 space-y-6 relative z-10">
          
          {/* Top Language Toggle Button on Login */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={toggleLanguage}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all"
              title={language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
            >
              <Globe className="h-3.5 w-3.5 text-blue-600" />
              <span>{t('app.switchLang')}</span>
            </button>
          </div>

          <div className="text-center space-y-3">
            <div className="mx-auto flex justify-center pb-2">
              <NWCLogo size="lg" className="h-20 w-auto" />
            </div>
            <div>
              <span className="px-2.5 py-0.5 text-[9.5px] tracking-wide font-extrabold text-blue-800 bg-blue-50 rounded-full uppercase border border-blue-100">
                NWC GIS PLATFORM • {language === 'ar' ? 'شركة المياه الوطنية' : 'National Water Company'}
              </span>
              <h2 className="text-base font-extrabold text-slate-900 mt-2">{t('login.title')}</h2>
            </div>
          </div>

          {loginError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3.5 rounded-xl text-xs text-center leading-relaxed">
              <p>{loginError}</p>
            </div>
          )}

          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button onClick={() => { setLoginTab('nwc'); setLoginError(''); }} className={`flex-1 text-center py-2 rounded-xl text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5 ${loginTab === 'nwc' ? 'bg-white text-blue-700 shadow-md border' : 'text-slate-500'}`}><Mail className="h-4 w-4" /><span>{t('login.nwcEmployees')}</span></button>
            <button onClick={() => { setLoginTab('admin'); setLoginError(''); }} className={`flex-1 text-center py-2 rounded-xl text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5 ${loginTab === 'admin' ? 'bg-white text-blue-700 shadow-md border' : 'text-slate-500'}`}><Lock className="h-4 w-4" /><span>{t('login.adminLogin')}</span></button>
          </div>

          {loginTab === 'nwc' ? (
            <form onSubmit={handleNwcSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">{t('login.emailLabel')}</label>
                <input type="email" required value={nwcEmail} onChange={e => setNwcEmail(e.target.value)} placeholder="user@example.com" className="w-full text-xs p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl focus:outline-none text-slate-800 font-mono text-left" dir="ltr" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">{t('login.passwordLabel')}</label>
                <input type="password" required value={nwcPassword} onChange={e => setNwcPassword(e.target.value)} placeholder="••••••••" className="w-full text-xs p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl focus:outline-none text-slate-800 font-mono text-center tracking-widest" />
              </div>
              <button type="submit" className="w-full mt-2 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs py-3.5 px-4 rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-2"><span>{t('login.enterPortal')}</span><Compass className="h-4 w-4" /></button>
            </form>
          ) : (
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">{t('login.adminPassLabel')}</label>
                <input type="password" required value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="••••••••" className="w-full text-xs p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl focus:outline-none text-slate-800 font-mono text-center tracking-widest" />
              </div>
              <button type="submit" className="w-full mt-2 bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs py-3.5 px-4 rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-2"><span>{t('login.enterAdmin')}</span><Key className="h-4 w-4" /></button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 flex flex-col font-sans transition-colors duration-200" id="app-root">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 shadow-xs sticky top-0 z-40 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <NWCLogo size="sm" className="h-11 w-auto" />
              <div>
                <h1 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white">{t('app.title')}</h1>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{t('app.subtitle')}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 relative">
              <div className="hidden sm:block text-right">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block">{t('app.currentUser')}</span>
                <span className="text-xs text-slate-800 dark:text-slate-200 font-extrabold">{currentUser.name}</span>
              </div>

              {/* Language Switcher Button */}
              <button
                type="button"
                onClick={toggleLanguage}
                className="px-2.5 py-2 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-2xs"
                title={language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
              >
                <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="font-extrabold text-blue-700 dark:text-blue-300">{t('app.switchLang')}</span>
              </button>

              {/* Dark Mode Toggle Switch Button */}
              <button
                type="button"
                onClick={() => setDarkMode(!darkMode)}
                className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700 shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs'
                }`}
                title={darkMode ? t('app.switchToLight') : t('app.switchToDark')}
              >
                {darkMode ? (
                  <>
                    <Sun className="h-4 w-4 text-amber-400 fill-amber-400" />
                    <span className="hidden sm:inline text-amber-300">{t('app.lightMode')}</span>
                  </>
                ) : (
                  <>
                    <Moon className="h-4 w-4 text-slate-600 fill-slate-200" />
                    <span className="hidden sm:inline">{t('app.darkMode')}</span>
                  </>
                )}
              </button>

              {/* PWA Application Install Button */}
              <PWAInstallHeaderButton />

              <div className="relative" id="notifications-bell-container">
                <button type="button" onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)} className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center relative ${showNotificationsDropdown ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}><Bell className="h-4 w-4" />{unreadNotificationsCount > 0 && (<span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-extrabold h-4 w-4 rounded-full flex items-center justify-center animate-bounce">{unreadNotificationsCount}</span>)}</button>

                {showNotificationsDropdown && (
                  <div className={`absolute ${isRtl ? 'left-0' : 'right-0'} mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 overflow-hidden`}>
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                      <div className="flex items-center gap-2"><Bell className="h-4 w-4 text-blue-600 dark:text-blue-400" /><span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">{t('notif.title')}</span></div>
                      <div className="flex gap-2 items-center">
                        <button
                          type="button"
                          onClick={() => { setShowNotificationsDropdown(false); setActiveTab('settings'); }}
                          className="text-[10px] text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300 font-bold cursor-pointer flex items-center gap-1 bg-slate-200/60 dark:bg-slate-700/60 px-2 py-0.5 rounded-lg border border-slate-300/50 dark:border-slate-600/50 transition-all"
                          title={t('notif.preferences')}
                        >
                          <Sliders className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                          <span>{t('notif.preferences')}</span>
                        </button>
                        {unreadNotificationsCount > 0 && (<button type="button" onClick={handleMarkAllAsRead} className="text-[10px] text-blue-600 dark:text-blue-400 font-bold cursor-pointer">{t('notif.markAllRead')}</button>)}
                        {notifications.length > 0 && (<button type="button" onClick={handleClearNotifications} className="text-[10px] text-slate-400 hover:text-rose-600 font-bold cursor-pointer">{t('notif.clearAll')}</button>)}
                      </div>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {groupedNotifications.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2"><Bell className="h-8 w-8 text-slate-200 dark:text-slate-700" /><span>{t('notif.empty')}</span></div>
                      ) : (
                        groupedNotifications.map(notif => (
                          <div key={notif.id} onClick={() => handleNotificationClick(notif)} className={`p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors cursor-pointer flex gap-3 items-start ${!notif.read ? 'bg-blue-50/20 dark:bg-blue-950/30' : ''}`}>
                            <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${notif.type === 'add' ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400' : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'}`}>{notif.type === 'add' ? <Plus className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}</div>
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center justify-between gap-1">
                                <p className="text-xs text-slate-800 dark:text-slate-200 font-extrabold truncate flex items-center gap-1.5">
                                  <span>{notif.projectName ? `${t('list.project')}: ${notif.projectName}` : t('notif.title')}</span>
                                  {(notif.type === 'change_detected' || notif.message?.includes('تحديث جديد')) && (
                                    <span className="bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 font-black text-[9px] px-1.5 py-0.2 rounded border border-amber-300 dark:border-amber-700 shrink-0">
                                      {t('notif.newUpdate')}
                                    </span>
                                  )}
                                </p>
                                {notif.groupedCount && notif.groupedCount > 1 ? (
                                  <span className="bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-extrabold text-[9.5px] px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 shrink-0 flex items-center gap-0.5">
                                    <span>×{notif.groupedCount} {t('notif.updates')}</span>
                                  </span>
                                ) : null}
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-semibold">{cleanNotificationMessage(notif.message, notif.projectName, notif.type)}</p>
                              <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 pt-0.5">
                                <span>{notif.timestamp}</span>
                                <div className="flex items-center gap-1.5">
                                  {notif.groupedCount && notif.groupedCount > 1 ? (
                                    <span className="bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-1.5 py-0.2 rounded font-bold text-[9px]">
                                      {t('notif.grouped')} ({notif.groupedCount})
                                    </span>
                                  ) : null}
                                  <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.2 rounded font-medium text-[9px]">{translateDynamic(notif.region) || translateDynamic(notif.scope)}</span>
                                </div>
                              </div>
                            </div>
                            {!notif.read && (<span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-2"></span>)}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button onClick={handleLogout} className="p-2 text-rose-600 hover:text-white bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-600 dark:hover:bg-rose-600 border border-rose-100 dark:border-rose-900 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">{t('app.logout')}</span></button>
            </div>
          </div>
        </div>
      </header>

      {!isOnline && (
        <div className="bg-amber-600 text-white text-xs px-6 py-2.5 font-bold text-center flex items-center justify-center gap-2"><span>{t('app.offline')}</span></div>
      )}

      {successNotification && (
        <div className="bg-emerald-600 text-white text-xs px-6 py-3 font-semibold text-center flex items-center justify-center gap-2"><ShieldCheck className="h-4 w-4" /><span>{successNotification}</span></div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="bg-slate-900 dark:bg-slate-900/90 leading-normal p-4.5 rounded-2xl border border-slate-700/60 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md relative overflow-hidden">
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></div>
            <div>
              <div className="text-xs text-slate-200">{language === 'ar' ? 'مرحباً' : 'Welcome'}: <span className="font-bold text-blue-400">{currentUser.name}</span> ({currentUser.role === 'admin' ? t('app.fullAdminAccess') : t('app.editorRole')})</div>
              <div className="text-[10px] text-slate-400 font-medium mt-0.5">{t('app.allowedAccess')}: <span className="text-slate-300">{t('app.regions')} [ {currentUser.allowedRegions.map(r => translateDynamic(r)).join(', ')} ]</span></div>
            </div>
          </div>
          <div className="flex items-center gap-2 relative z-10">
            {canEditProjects && (<button onClick={handleStartAddNewProject} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm cursor-pointer"><Plus className="h-4 w-4" /><span>{t('app.addNewProject')}</span></button>)}
          </div>
        </div>

        <div className="border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 p-2.5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-2xs transition-colors">
          <div className="flex gap-1.5 overflow-x-auto w-full sm:w-auto">
            {[
              ...((currentUser.role === 'admin' || (currentUser.allowedTabs || ['maps', 'stats', 'layers', 'changelog', 'maptools']).includes('maps')) ? [{ id: 'maps', label: t('tab.maps'), icon: MapIcon }] : []),
              ...((currentUser.role === 'admin' || (currentUser.allowedTabs || ['maps', 'stats', 'layers', 'changelog', 'maptools']).includes('stats')) ? [{ id: 'stats', label: t('tab.stats'), icon: Layers }] : []),
              ...((currentUser.role === 'admin' || (currentUser.allowedTabs || ['maps', 'stats', 'layers', 'changelog', 'maptools']).includes('layers')) ? [{ id: 'layers', label: t('tab.layers'), icon: Compass }] : []),
              ...((currentUser.role === 'admin' || (currentUser.allowedTabs || ['maps', 'stats', 'layers', 'changelog', 'maptools']).includes('changelog')) ? [{ id: 'changelog', label: t('tab.changelog'), icon: History }] : []),
              { id: 'maptools', label: t('tab.maptools'), icon: Wrench },
              ...(currentUser.role === 'admin' ? [{ id: 'users', label: t('tab.users'), icon: Users }] : []),
              { id: 'settings', label: t('tab.settings'), icon: Sliders }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}><Icon className="h-4 w-4 shrink-0" /><span>{tab.label}</span></button>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          {activeTab === 'maps' && (
            <div className="flex flex-col space-y-4">
              <div className="xl:hidden bg-white dark:bg-slate-900 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex">
                <button type="button" onClick={() => setMobileViewMode('map')} className={`flex-1 text-center py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${mobileViewMode === 'map' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400'}`}><MapIcon className="h-3.5 w-3.5 shrink-0" /><span>{t('tab.interactiveMap')}</span></button>
                <button type="button" onClick={() => setMobileViewMode('list')} className={`flex-1 text-center py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${mobileViewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400'}`}><FileSpreadsheet className="h-3.5 w-3.5 shrink-0" /><span>{t('tab.projectList')} ({visibleProjects.length})</span></button>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
                <div className={`xl:col-span-7 ${mobileViewMode === 'map' ? 'block' : 'hidden xl:block'}`} id="map-port-view">
                  <ProjectMapViewer project={selectedProject} projects={filteredProjects} onSelectProject={(proj) => { setSelectedProjectId(proj.id); setMobileViewMode('map'); }} onEditClick={handleStartEditProject} canEdit={canEditProjects} isAdmin={currentUser.role === 'admin'} canOpenExternalLinks={currentUser.canOpenExternalLinks !== false} onUpdateProjectCoordinates={(id, lat, lng) => { const updated = projects.map(p => { if (p.id === id) { const newUrl = `https://www.google.com/maps/d/viewer?mid=custom&ll=${lat},${lng}&z=13`; const updatedProj = { ...p, mapUrl: newUrl, x: lng, y: lat }; handleSaveProject(updatedProj); return updatedProj; } return p; }); setProjects(updated); }} />
                </div>

                <div className={`xl:col-span-5 flex flex-col ${mobileViewMode === 'list' ? 'block' : 'hidden xl:flex'}`}>
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-t-2xl border dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{t('list.projectListTitle')}</span>
                    </div>
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-bold">
                      {isRtl ? `${filteredProjects.length} ${t('list.projectCount')}` : `${t('list.projectCount')}: ${filteredProjects.length}`}
                    </span>
                  </div>
                  <div className="bg-slate-50/50 dark:bg-slate-950/50 p-4 border dark:border-slate-800 rounded-b-2xl max-h-[580px] overflow-y-auto w-full">
                    <ProjectList 
                      projects={visibleProjects} 
                      filteredProjects={filteredProjects} 
                      selectedProject={selectedProject} 
                      onSelectProject={(proj) => { 
                        setSelectedProjectId(selectedProjectId === proj.id ? null : proj.id);
                      }}
                      onGoToMap={(proj) => {
                        setSelectedProjectId(proj.id);
                        setMobileViewMode('map');
                        showNotification(`تم الانتقال لخريطة مشروع: ${proj.name}`);
                      }}
                      currentUser={currentUser} 
                      onToggleFavorite={handleToggleFavorite} 
                      onEditProject={canEditProjects ? handleStartEditProject : undefined} 
                      searchTerm={searchTerm} 
                      setSearchTerm={setSearchTerm} 
                      selectedSubProgram={selectedSubProgram} 
                      setSelectedSubProgram={setSelectedSubProgram} 
                      selectedClassification={selectedClassification} 
                      setSelectedClassification={setSelectedClassification} 
                      selectedStatus={selectedStatus} 
                      setSelectedStatus={setSelectedStatus} 
                      showFilters={showFilters} 
                      setShowFilters={setShowFilters} 
                      showOnlyFavorites={showOnlyFavorites} 
                      setShowOnlyFavorites={setShowOnlyFavorites} 
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
            <DashboardStats
              projects={filteredProjects}
              selectedProject={selectedProject}
              onSelectProject={(proj) => setSelectedProjectId(proj.id)}
              isAdmin={currentUser.role === 'admin'}
              currentUser={currentUser}
            />
          )}
          {activeTab === 'layers' && <ProjectLayersViewer currentUser={currentUser} />}
          {activeTab === 'changelog' && (
            <ChangelogTab 
              currentUser={currentUser} 
              projects={projects} 
              onSelectProject={(proj) => { 
                setSelectedProjectId(proj.id); 
                setActiveTab('maps'); 
                setMobileViewMode('map'); 
              }} 
            />
          )}
          {activeTab === 'maptools' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shrink-0">
                    <Wrench className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{language === 'ar' ? 'منصة أدوات الخرائط الجغرافية الذكية' : 'Smart Map Tools & GIS Suite'}</span>
                      <span className="text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-bold border border-blue-200 dark:border-blue-800 font-mono">
                        map-tools-657.pages.dev
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {language === 'ar' ? 'منصة متقدمة لمعالجة واستخراج وتدقيق بيانات الخرائط الجغرافية وKML/KMZ وتوليد الأكواد' : 'Advanced suite for GIS data extraction, formatting, and KML/KMZ conversion'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      const iframe = document.getElementById('map-tools-iframe') as HTMLIFrameElement;
                      if (iframe) {
                        iframe.src = iframe.src;
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200 dark:border-slate-700"
                    title={language === 'ar' ? 'إعادة تحميل' : 'Reload'}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{language === 'ar' ? 'تحديث' : 'Reload'}</span>
                  </button>

                  <a
                    href="https://map-tools-657.pages.dev/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>{language === 'ar' ? 'فتح في نافذة جديدة ↗' : 'Open in New Window ↗'}</span>
                  </a>
                </div>
              </div>

              <div className="w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden relative" style={{ height: 'calc(100vh - 240px)', minHeight: '650px' }}>
                <iframe
                  id="map-tools-iframe"
                  src="https://map-tools-657.pages.dev/"
                  title="Map Tools Platform"
                  className="w-full h-full border-0 rounded-2xl"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; geolocation"
                  loading="lazy"
                />
              </div>
            </div>
          )}
          {activeTab === 'users' && currentUser.role === 'admin' && <UserManagement users={users} currentUser={currentUser} onSaveUser={handleSaveUserPermissions} onDeleteUser={handleDeleteUser} projects={projects} />}
          {activeTab === 'settings' && (
            <NotificationSettingsPage 
              currentUser={currentUser}
              projects={projects}
              onShowNotification={showNotification}
              onSendTestNativeNotification={sendNativeNotification}
            />
          )}
        </div>
      </main>

      <ProjectModal isOpen={isProjectModalOpen} project={editingProject} onClose={() => setIsProjectModalOpen(false)} onSave={handleSaveProject} />

      {showExitModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div dir="rtl" className="bg-white rounded-3xl p-6 max-w-sm w-full border text-center">
            <div className="mx-auto bg-amber-50 text-amber-600 p-3.5 rounded-full flex items-center justify-center shrink-0"><AlertCircle className="h-8 w-8" /></div>
            <h3 className="text-base font-extrabold text-slate-900 mt-2">هل أنت متأكد من رغبتك بالخروج؟</h3>
            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => { setShowExitModal(false); window.history.pushState({ step: 'app' }, ''); }} className="flex-1 py-2.5 px-4 bg-slate-100 text-slate-800 text-xs font-bold rounded-2xl border">الاستمرار في التصفح</button>
              <button type="button" onClick={() => { setShowExitModal(false); setIsLogged(false); localStorage.removeItem('water_maps_is_logged'); }} className="flex-1 py-2.5 px-4 bg-rose-600 text-white text-xs font-bold rounded-2xl shadow-xs">تأكيد الخروج الآمن</button>
            </div>
          </div>
        </div>
      )}

      <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 py-6 mt-12 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} نظام الخرائط التفاعلية الآمن •   </p>
        </div>
      </footer>

      {/* Floating PWA Installation Notification Prompt */}
      <PWAInstallPrompt />
    </div>
  );
}