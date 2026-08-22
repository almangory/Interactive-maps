/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { User, Project } from '../types';
import { useLanguage } from '../utils/i18n';
import { 
  Users, 
  UserCheck, 
  Shield, 
  HelpCircle, 
  Plus, 
  Trash2, 
  Key, 
  CheckSquare, 
  Square, 
  Settings, 
  Eye, 
  EyeOff, 
  Briefcase, 
  Building2, 
  Layers, 
  MapPin, 
  Bookmark, 
  Compass, 
  Filter, 
  ExternalLink,
  Search,
  X,
  UserX,
  SlidersHorizontal,
  Activity
} from 'lucide-react';

interface UserManagementProps {
  users: User[];
  currentUser: User;
  onSaveUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
  projects?: Project[];
}

const REGION_OPTIONS = [
  'شمال الرياض',
  'جنوب الرياض',
  'غرب الرياض',
  'المحافظات الشمالية',
  'المحافظات الجنوبية',
  'المحافظات الغربية',
  'المتفرقات'
];

const SCOPE_OPTIONS = [
  'مياه',
  'صرف صحي'
];

// 🛡️ Cryptographically secure random password generator (CSPRNG)
function generateSecurePassword(length: number = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%^&*';
  const allChars = upper + lower + digits + special;
  
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const randomBytes = new Uint8Array(length);
    window.crypto.getRandomValues(randomBytes);
    let pwd = [
      upper[randomBytes[0] % upper.length],
      lower[randomBytes[1] % lower.length],
      digits[randomBytes[2] % digits.length],
      special[randomBytes[3] % special.length]
    ];
    for (let i = 4; i < length; i++) {
      pwd.push(allChars[randomBytes[i] % allChars.length]);
    }
    // Fisher-Yates shuffle using cryptographically secure values
    for (let i = pwd.length - 1; i > 0; i--) {
      const j = randomBytes[i % randomBytes.length] % (i + 1);
      [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
    }
    return pwd.join('');
  }
  return 'Nwc#' + Math.random().toString(36).substring(2, 10);
}

export function UserManagement({ 
  users, 
  currentUser, 
  onSaveUser, 
  onDeleteUser, 
  projects = [] 
}: UserManagementProps) {
  const { t, translateDynamic, isRtl, language } = useLanguage();
  const [selectedUser, setSelectedUser] = useState<User | null>(users[0] || null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<'all' | 'admin' | 'editor' | 'viewer'>('all');

  const roleCounts = useMemo(() => {
    return {
      all: users.length,
      admin: users.filter(u => u.role === 'admin').length,
      editor: users.filter(u => u.role === 'editor').length,
      viewer: users.filter(u => u.role === 'viewer').length,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      // Filter by role if not 'all'
      if (selectedRoleFilter !== 'all' && u.role !== selectedRoleFilter) {
        return false;
      }

      if (!searchTerm.trim()) return true;

      const term = searchTerm.trim().toLowerCase();
      const name = (u.name || '').toLowerCase();
      const username = (u.username || '').toLowerCase();
      const email = ((u as any).email || u.username || '').toLowerCase();
      const jobTitle = (u.jobTitle || '').toLowerCase();
      const department = (u.department || '').toLowerCase();
      const regions = (u.allowedRegions || []).map(r => r.toLowerCase()).join(' ');
      const scopes = (u.allowedScopes || []).map(s => s.toLowerCase()).join(' ');
      const roleTextAr = u.role === 'admin' ? 'مدير مسؤول كامل أدمن admin' : u.role === 'editor' ? 'محرر خرائط تعديل editor' : 'مستعرض عرض مشاهد viewer';

      return (
        name.includes(term) ||
        username.includes(term) ||
        email.includes(term) ||
        jobTitle.includes(term) ||
        department.includes(term) ||
        regions.includes(term) ||
        scopes.includes(term) ||
        roleTextAr.toLowerCase().includes(term)
      );
    });
  }, [users, searchTerm, selectedRoleFilter]);

  const TAB_OPTIONS = useMemo(() => [
    { id: 'maps', label: language === 'en' ? 'Interactive Maps 🗺️' : 'الخرائط التفاعلية 🗺️' },
    { id: 'stats', label: language === 'en' ? 'GIS Statistics 📊' : 'الإحصائيات الجغرافية 📊' },
    { id: 'layers', label: language === 'en' ? 'Project Layers 🥞' : 'طبقات المشاريع 🥞' },
    { id: 'changelog', label: language === 'en' ? 'Change Log 📜' : 'سجل التغييرات 📜' },
    { id: 'maptools', label: language === 'en' ? 'Map Tools 🛠️' : 'أدوات الخرائط 🛠️' }
  ], [language]);

  const LAYER_OPTIONS = useMemo(() => [
    { id: 'water', label: language === 'en' ? 'Water Layer 💧' : 'طبقة المياه 💧' },
    { id: 'sewage', label: language === 'en' ? 'Sewage Layer 🌿' : 'طبقة الصرف 🌿' },
    { id: 'materials', label: language === 'en' ? 'Materials Layer 📦' : 'طبقة مواد التشوين 📦' }
  ], [language]);

  const STATS_SUBTAB_OPTIONS = useMemo(() => [
    { id: 'lengths', label: language === 'en' ? 'Lengths & Permits per Segment 📏' : 'حصر الأطوال والرخص بالسجمنت 📏' },
    { id: 'mymaps', label: language === 'en' ? 'My Maps GIS Analysis 📊' : 'تحليل الخرائط الجغرافية (My Maps) 📊' },
    { id: 'general', label: language === 'en' ? 'General Projects Stats 📈' : 'إحصائيات المشاريع العامة 📈' }
  ], [language]);

  const ALL_PROJECT_STATUSES = useMemo(() => [
    'جاري',
    'تم انهاء العقد',
    'مكتمل',
    'معلق',
    'مسلم ابتدائي',
    'مسحوب',
    'جاري الاستلام الابتدائي',
    'جاري الاستلام النهائي',
    'متوقف كليا',
    'متوقف جزئيا',
    'مشروع مستأنف'
  ], []);

  // Form State
  const [formData, setFormData] = useState<Partial<User>>({
    id: '',
    username: '',
    name: '',
    role: 'viewer',
    allowedRegions: ['الكل'],
    allowedScopes: ['الكل'],
    allowedTabs: ['maps', 'stats', 'layers'],
    canOpenExternalLinks: true,
    canFilter: true,
    canInsert: true,
    department: '',
    jobTitle: '',
    allowedProjectIds: [],
    allowedStatuses: ['الكل']
  });

  // Status selection filter for permissions assignment
  const [selectedStatusForPerms, setSelectedStatusForPerms] = useState<string>('all');

  // Sub-program selection state for permissions
  const [selectedSubProgramForPerms, setSelectedSubProgramForPerms] = useState<string>('');

  // Search by project name for permissions assignment
  const [projectSearchTermForPerms, setProjectSearchTermForPerms] = useState<string>('');

  const isAdmin = currentUser.role === 'admin';

  // Helper to test if a project matches the base permissions (regions, scopes, statuses)
  const isProjectMatchingBasePermissions = (p: Project, form: Partial<User>) => {
    // 1. Region check
    const uRegions = (form.allowedRegions || ['الكل']).map(r => r.trim());
    const isAllRegions = uRegions.includes('الكل');
    let isRegionAllowed = isAllRegions;
    if (!isRegionAllowed) {
      const pr = (p.region || '').trim();
      const pb = (p.businessUnit || '').trim();
      const ps = (p.subProgram || '').trim();
      if (uRegions.includes(pr) || uRegions.includes(pb) || uRegions.includes(ps)) {
        isRegionAllowed = true;
      } else {
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

    // 2. Scope check
    const pScope = (p.scope || '').trim();
    const uScopes = (form.allowedScopes || ['الكل']).map(s => s.trim());
    const isAllScopes = uScopes.includes('الكل');
    const isScopeAllowed = isAllScopes || uScopes.includes(pScope);

    // 3. Status check
    const pStatus = (p.status || '').trim();
    const uStatuses = (form.allowedStatuses || ['الكل']).map(st => st.trim());
    const isAllStatuses = uStatuses.includes('الكل') || uStatuses.length === 0;
    const isStatusAllowed = isAllStatuses || uStatuses.includes(pStatus);

    return isRegionAllowed && isScopeAllowed && isStatusAllowed;
  };

  // Compute eligible base projects matching current form's regions, scopes, and statuses
  const eligibleBaseProjects = useMemo(() => {
    return projects.filter(p => p.id !== -1 && isProjectMatchingBasePermissions(p, formData));
  }, [projects, formData.allowedRegions, formData.allowedScopes, formData.allowedStatuses]);

  // Compute unique sub-programs from eligibleBaseProjects list
  const subPrograms = useMemo(() => {
    const set = new Set(eligibleBaseProjects.map(p => p.subProgram).filter(Boolean));
    return Array.from(set).sort();
  }, [eligibleBaseProjects]);

  // Set default sub-program when entering creation/editing or when eligible subPrograms change
  React.useEffect(() => {
    if (subPrograms.length > 0) {
      if (!selectedSubProgramForPerms || (!subPrograms.includes(selectedSubProgramForPerms) && selectedSubProgramForPerms !== 'all')) {
        setSelectedSubProgramForPerms('all');
      }
    } else {
      setSelectedSubProgramForPerms('all');
    }
  }, [subPrograms, selectedSubProgramForPerms]);

  // Compute projects in the selected sub-program and filtered by status & search term
  const projectsInSelectedSubProgram = useMemo(() => {
    let list = eligibleBaseProjects;
    if (selectedSubProgramForPerms && selectedSubProgramForPerms !== 'all' && selectedSubProgramForPerms !== 'الكل') {
      list = list.filter(p => p.subProgram === selectedSubProgramForPerms);
    }
    if (selectedStatusForPerms && selectedStatusForPerms !== 'all' && selectedStatusForPerms !== 'الكل') {
      list = list.filter(p => (p.status || '').trim() === selectedStatusForPerms.trim());
    }
    if (projectSearchTermForPerms.trim()) {
      const term = projectSearchTermForPerms.trim().toLowerCase();
      list = list.filter(p => 
        (p.name || '').toLowerCase().includes(term) ||
        (p.operationalNumber || '').toLowerCase().includes(term) ||
        (p.contractor || '').toLowerCase().includes(term) ||
        (p.classification || '').toLowerCase().includes(term) ||
        (p.region || '').toLowerCase().includes(term)
      );
    }
    return list;
  }, [eligibleBaseProjects, selectedSubProgramForPerms, selectedStatusForPerms, projectSearchTermForPerms]);

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setIsEditing(false);
    setIsCreating(false);
    const userTabs = user.allowedTabs || ['maps', 'stats', 'layers'];
    const hasLayers = userTabs.includes('layers');
    const hasStats = userTabs.includes('stats');
    setFormData({
      ...user,
      allowedTabs: userTabs,
      allowedLayers: hasLayers ? (user.allowedLayers || ['water', 'sewage', 'materials']) : [],
      allowedStatsSubTabs: hasStats ? (user.allowedStatsSubTabs || ['lengths', 'mymaps', 'general']) : []
    });
  };

  const handleStartCreate = () => {
    if (!isAdmin) return;
    setIsCreating(true);
    setIsEditing(false);
    setSelectedUser(null);
    setFormData({
      id: `user_${Date.now()}`,
      username: '',
      name: '',
      role: 'viewer',
      allowedRegions: ['الكل'],
      allowedScopes: ['الكل'],
      allowedTabs: ['maps', 'stats', 'layers'],
      allowedLayers: ['water', 'sewage', 'materials'],
      allowedStatsSubTabs: ['lengths', 'mymaps', 'general'],
      canOpenExternalLinks: true,
      canFilter: true,
      canInsert: true,
      department: '',
      jobTitle: '',
      allowedProjectIds: [],
      allowedStatuses: ['الكل'],
      password: generateSecurePassword(12)
    });
  };

  const handleStartEdit = () => {
    if (!isAdmin || !selectedUser) return;
    setIsEditing(true);
    const displayedUsername = selectedUser.username;
    const userTabs = selectedUser.allowedTabs || ['maps', 'stats', 'layers'];
    const hasLayers = userTabs.includes('layers');
    const hasStats = userTabs.includes('stats');
    
    setFormData({
      ...selectedUser,
      username: displayedUsername,
      allowedTabs: userTabs,
      allowedLayers: hasLayers ? (selectedUser.allowedLayers || ['water', 'sewage', 'materials']) : [],
      allowedStatsSubTabs: hasStats ? (selectedUser.allowedStatsSubTabs || ['lengths', 'mymaps', 'general']) : [],
      canOpenExternalLinks: selectedUser.canOpenExternalLinks !== false,
      canFilter: selectedUser.canFilter !== false,
      canInsert: selectedUser.canInsert !== false,
      department: selectedUser.department || '',
      jobTitle: selectedUser.jobTitle || '',
      allowedProjectIds: selectedUser.allowedProjectIds || [],
      allowedStatuses: selectedUser.allowedStatuses || ['الكل']
    });
  };

  const handleCheckboxChange = (field: 'allowedRegions' | 'allowedScopes' | 'allowedStatuses', value: string) => {
    const list = formData[field] || [];
    let nextData: Partial<User>;
    
    if (value === 'الكل') {
      nextData = {
        ...formData,
        [field]: ['الكل']
      };
      if (field === 'allowedScopes') {
        const isLayersActive = (formData.allowedTabs || []).includes('layers');
        if (isLayersActive) {
          nextData.allowedLayers = ['water', 'sewage', 'materials'];
        } else {
          nextData.allowedLayers = [];
        }
      }
    } else {
      let newList = list.filter(item => item !== 'الكل');
      if (newList.includes(value)) {
        newList = newList.filter(item => item !== value);
      } else {
        newList.push(value);
      }

      if (newList.length === 0) {
        newList = ['الكل'];
      }

      nextData = {
        ...formData,
        [field]: newList
      };

      if (field === 'allowedScopes') {
        const isLayersActive = (formData.allowedTabs || []).includes('layers');
        if (isLayersActive) {
          if (newList.includes('الكل') || (newList.includes('مياه') && newList.includes('صرف صحي'))) {
            nextData.allowedLayers = ['water', 'sewage', 'materials'];
          } else if (newList.includes('مياه')) {
            nextData.allowedLayers = ['water', 'materials'];
          } else if (newList.includes('صرف صحي')) {
            nextData.allowedLayers = ['sewage', 'materials'];
          }
        } else {
          nextData.allowedLayers = [];
        }
      }
    }

    // 🔗 الربط الشامل والتلقائي: تنقية المشاريع المحددة بحيث لا يتبقى أي مشروع خارج الصلاحيات الجديدة
    if (nextData.allowedProjectIds && nextData.allowedProjectIds.length > 0) {
      const newEligibleIds = new Set(projects.filter(p => p.id !== -1 && isProjectMatchingBasePermissions(p, nextData)).map(p => p.id));
      nextData.allowedProjectIds = nextData.allowedProjectIds.filter(id => newEligibleIds.has(id));
    }

    setFormData(nextData);
  };

  const handleTabToggle = (tabId: string) => {
    const currentTabs = formData.allowedTabs || ['maps', 'stats', 'layers'];
    const isRemoving = currentTabs.includes(tabId);
    let newTabs: string[];
    
    if (isRemoving) {
      newTabs = currentTabs.filter(t => t !== tabId);
    } else {
      newTabs = [...currentTabs, tabId];
    }

    const nextData: Partial<User> = {
      ...formData,
      allowedTabs: newTabs
    };

    // 🔗 IAM Permission Dependency Rules:
    // 1. If 'layers' tab is disabled -> automatically disable/clear allowedLayers
    if (isRemoving && tabId === 'layers') {
      nextData.allowedLayers = [];
    } else if (!isRemoving && tabId === 'layers') {
      if (!nextData.allowedLayers || nextData.allowedLayers.length === 0) {
        nextData.allowedLayers = ['water', 'sewage', 'materials'];
      }
    }

    // 2. If 'stats' tab is disabled -> automatically disable/clear allowedStatsSubTabs
    if (isRemoving && tabId === 'stats') {
      nextData.allowedStatsSubTabs = [];
    } else if (!isRemoving && tabId === 'stats') {
      if (!nextData.allowedStatsSubTabs || nextData.allowedStatsSubTabs.length === 0) {
        nextData.allowedStatsSubTabs = ['lengths', 'mymaps', 'general'];
      }
    }

    // 3. If 'maps' tab is disabled -> clear custom project IDs
    if (isRemoving && tabId === 'maps') {
      nextData.allowedProjectIds = [];
    }

    setFormData(nextData);
  };

  // Specific projects selection handlers
  const handleToggleProjectPermission = (projectId: number) => {
    const list = formData.allowedProjectIds || [];
    let newList: number[];
    if (list.includes(projectId)) {
      newList = list.filter(id => id !== projectId);
    } else {
      newList = [...list, projectId];
    }
    setFormData({ ...formData, allowedProjectIds: newList });
  };

  const handleSelectAllProjectsInSubProgram = () => {
    const list = formData.allowedProjectIds || [];
    const subProjIds = projectsInSelectedSubProgram.map(p => p.id);
    
    // Add all project IDs of current sub-program if they are not already in the list
    const combined = Array.from(new Set([...list, ...subProjIds]));
    setFormData({ ...formData, allowedProjectIds: combined });
  };

  const handleDeselectAllProjectsInSubProgram = () => {
    const list = formData.allowedProjectIds || [];
    const subProjIds = projectsInSelectedSubProgram.map(p => p.id);
    
    // Remove all projects of this sub-program from the list
    const filtered = list.filter(id => !subProjIds.includes(id));
    setFormData({ ...formData, allowedProjectIds: filtered });
  };

  const handleSelectAllFilteredProjects = () => {
    const list = formData.allowedProjectIds || [];
    const filteredIds = projectsInSelectedSubProgram.map(p => p.id);
    const combined = Array.from(new Set([...list, ...filteredIds]));
    setFormData({ ...formData, allowedProjectIds: combined });
  };

  const handleDeselectAllFilteredProjects = () => {
    const list = formData.allowedProjectIds || [];
    const filteredIds = projectsInSelectedSubProgram.map(p => p.id);
    const filtered = list.filter(id => !filteredIds.includes(id));
    setFormData({ ...formData, allowedProjectIds: filtered });
  };

  const handleSelectAllProjectsAcrossAllPrograms = () => {
    const eligibleIds = eligibleBaseProjects.map(p => p.id);
    setFormData({ ...formData, allowedProjectIds: eligibleIds });
  };

  const handleDeselectAllProjectsAcrossAllPrograms = () => {
    setFormData({ ...formData, allowedProjectIds: [] });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!formData.username || !formData.name) {
      alert('الرجاء تعبئة البريد الإلكتروني والاسم الثلاثي');
      return;
    }

    const emailInput = formData.username.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailInput)) {
      alert('خطأ في إدخال البريد: يرجى كتابة بريد إلكتروني صحيح (مثال: user@example.com)');
      return;
    }

    const passwordCandidate = formData.password ? formData.password.trim() : '';
    if (passwordCandidate && passwordCandidate.length < 6) {
      alert('كلمة المرور يجب ألا تقل عن 6 خانات لضمان أمان الحساب.');
      return;
    }

    // Prune allowedProjectIds so only eligible projects matching selected region/scope/status are preserved
    let finalProjectIds = formData.allowedProjectIds || [];
    if (finalProjectIds.length > 0) {
      const eligibleIds = new Set(projects.filter(p => p.id !== -1 && isProjectMatchingBasePermissions(p, formData)).map(p => p.id));
      finalProjectIds = finalProjectIds.filter(id => eligibleIds.has(id));
    }

    const isLayersActive = (formData.allowedTabs || []).includes('layers');
    const isStatsActive = (formData.allowedTabs || []).includes('stats');

    const savedUser: User = {
      id: formData.id || `user_${Date.now()}`,
      username: emailInput,
      name: formData.name.trim(),
      role: formData.role as 'admin' | 'editor' | 'viewer',
      allowedRegions: formData.allowedRegions || ['الكل'],
      allowedScopes: formData.allowedScopes || ['الكل'],
      password: passwordCandidate || generateSecurePassword(12),
      
      // Strict IAM fields mapping
      allowedTabs: formData.allowedTabs || ['maps', 'stats', 'layers'],
      allowedLayers: isLayersActive ? (formData.allowedLayers && formData.allowedLayers.length > 0 ? formData.allowedLayers : ['water', 'sewage', 'materials']) : [],
      allowedStatsSubTabs: isStatsActive ? (formData.allowedStatsSubTabs && formData.allowedStatsSubTabs.length > 0 ? formData.allowedStatsSubTabs : ['lengths', 'mymaps', 'general']) : [],
      canOpenExternalLinks: formData.canOpenExternalLinks !== false,
      canFilter: formData.canFilter !== false,
      canInsert: formData.canInsert !== false,
      department: formData.department?.trim() || '',
      jobTitle: formData.jobTitle?.trim() || '',
      allowedProjectIds: finalProjectIds,
      allowedStatuses: formData.allowedStatuses || ['الكل']
    };

    onSaveUser(savedUser);
    setSelectedUser(savedUser);
    setIsEditing(false);
    setIsCreating(false);
  };

  const handleDelete = (userId: string) => {
    if (!isAdmin) return;
    if (userId === currentUser.id) {
      alert(language === 'en' ? 'You cannot delete the currently active user!' : 'لا يمكنك حذف الحساب النشط حالياً!');
      return;
    }
    if (confirm(language === 'en' ? 'Are you sure you want to delete this user and permanently revoke access?' : 'هل أنت متأكد من رغبتك في حذف هذا المستخدم وسحب صلاحياته نهائياً؟')) {
      onDeleteUser(userId);
      const remaining = users.filter(u => u.id !== userId);
      setSelectedUser(remaining[0] || null);
      setIsEditing(false);
      setIsCreating(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[600px]" id="user-management-panel" dir={isRtl ? 'rtl' : 'ltr'}>
      
      {/* Users List Column */}
      <div className={`lg:col-span-4 ${isRtl ? 'border-l' : 'border-r'} border-slate-200/80 dark:border-slate-800 p-5 space-y-3.5 flex flex-col`}>
        <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <div>
              <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                {language === 'en' ? 'System Users' : 'مستخدمو النظام'}
              </h4>
              <span className="text-[10px] text-slate-400 font-medium">
                {t('users.totalUsers', { count: users.length.toString() })}
              </span>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={handleStartCreate}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer border-0 shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t('users.addNew')}</span>
            </button>
          )}
        </div>

        {/* Search Bar */}
        <div className="space-y-2 shrink-0">
          <div className="relative">
            <div className={`absolute top-1/2 -translate-y-1/2 ${isRtl ? 'right-3' : 'left-3'} pointer-events-none text-slate-400 flex items-center`}>
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={t('users.searchPlaceholder')}
              className={`w-full text-xs py-2.5 ${isRtl ? 'pr-9 pl-8 text-right' : 'pl-9 pr-8 text-left'} bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 transition-all shadow-2xs`}
              id="users-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className={`absolute top-1/2 -translate-y-1/2 ${isRtl ? 'left-2.5' : 'right-2.5'} p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md transition-colors cursor-pointer`}
                title={t('users.clearSearch')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Role Filter Chips */}
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {[
              { id: 'all', label: t('users.allRoles'), count: roleCounts.all },
              { id: 'admin', label: t('users.adminRoleFilter'), count: roleCounts.admin },
              { id: 'editor', label: t('users.editorRoleFilter'), count: roleCounts.editor },
              { id: 'viewer', label: t('users.viewerRoleFilter'), count: roleCounts.viewer },
            ].map(rf => {
              const isActive = selectedRoleFilter === rf.id;
              return (
                <button
                  key={rf.id}
                  type="button"
                  onClick={() => setSelectedRoleFilter(rf.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 border ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <span>{rf.label}</span>
                  <span className={`text-[9px] px-1 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-blue-500/80 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}>
                    {rf.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Filter Results Summary */}
          {(searchTerm.trim() || selectedRoleFilter !== 'all') && (
            <div className="flex items-center justify-between text-[10.5px] px-1 text-slate-500 dark:text-slate-400">
              <span>
                {t('users.showingCount', { count: filteredUsers.length.toString(), total: users.length.toString() })}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedRoleFilter('all');
                }}
                className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
              >
                {t('users.clearSearch')}
              </button>
            </div>
          )}
        </div>

        {/* List of Users */}
        <div className="space-y-2 flex-1 overflow-y-auto pr-1">
          {filteredUsers.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2.5 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 my-2">
              <UserX className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="font-semibold text-slate-600 dark:text-slate-300">{t('users.noMatchingUsers')}</p>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedRoleFilter('all');
                }}
                className="mt-1 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-blue-200 dark:border-blue-800"
              >
                {t('users.clearSearch')}
              </button>
            </div>
          ) : (
            filteredUsers.map(u => {
              const isSelected = selectedUser?.id === u.id;
              return (
                <div
                  key={u.id}
                  onClick={() => handleSelectUser(u)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-200 ${isRtl ? 'text-right' : 'text-left'} ${
                    isSelected 
                      ? 'border-blue-500/80 bg-blue-50/30 dark:bg-blue-950/40 shadow-xs' 
                      : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h5 className="font-bold text-slate-850 dark:text-slate-100 text-xs flex flex-wrap items-center gap-1.5 leading-tight">
                        <span>{u.name}</span>
                        {u.id === currentUser.id && (
                          <span className="text-[9px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded font-normal">
                            {language === 'en' ? 'You' : 'أنت حالياً'}
                          </span>
                        )}
                      </h5>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">@{u.username}</p>
                      
                      {/* Display Job Title and Department if present */}
                      {(u.jobTitle || u.department) && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-slate-500 dark:text-slate-400 text-[10px] font-semibold">
                          {u.jobTitle && (
                            <span className="flex items-center gap-0.5">
                              <Briefcase className="h-3 w-3 shrink-0 text-slate-400" />
                              {translateDynamic(u.jobTitle)}
                            </span>
                          )}
                          {u.department && (
                            <span className={`flex items-center gap-0.5 ${isRtl ? 'border-r pr-1.5 mr-1.5' : 'border-l pl-1.5 ml-1.5'} border-slate-200 dark:border-slate-700`}>
                              <Building2 className="h-3 w-3 shrink-0 text-slate-400" />
                              {translateDynamic(u.department)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold whitespace-nowrap ${
                      u.role === 'admin' 
                        ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900' 
                        : u.role === 'editor'
                          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-700'
                    }`}>
                      {u.role === 'admin' ? (language === 'en' ? 'Full Admin' : 'مدير كامل') : u.role === 'editor' ? (language === 'en' ? 'Map Editor' : 'محرر خرائط') : (language === 'en' ? 'Viewer Only' : 'مستعرض فقط')}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1 mt-2.5">
                    <div className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
                      {language === 'en' ? 'Regions: ' : 'المناطق: '} 
                      {u.allowedRegions.map(r => translateDynamic(r)).join(', ')}
                    </div>
                    <div className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
                      {language === 'en' ? 'Scopes: ' : 'القطاعات: '}
                      {u.allowedScopes.map(s => translateDynamic(s)).join(', ')}
                    </div>
                    {u.allowedStatuses && !u.allowedStatuses.includes('الكل') && (
                      <div className="text-[9px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900 px-1.5 py-0.5 rounded font-bold">
                        {language === 'en' ? 'Statuses: ' : 'الحالات: '}{u.allowedStatuses.length}
                      </div>
                    )}
                    {u.allowedProjectIds && u.allowedProjectIds.length > 0 && (() => {
                      const effectiveCount = u.allowedProjectIds.filter(id => {
                        const proj = projects.find(p => p.id === id);
                        return proj ? isProjectMatchingBasePermissions(proj, u) : false;
                      }).length;
                      return effectiveCount > 0 ? (
                        <div className="text-[9px] bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-900 px-1.5 py-0.5 rounded font-bold">
                          {language === 'en' ? 'Assigned: ' : 'مشاريع مخصصة: '}{effectiveCount}
                        </div>
                      ) : null;
                    })()}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Detail / Config Panel Column */}
      <div className="lg:col-span-8 p-6 flex flex-col justify-between overflow-y-auto max-h-[700px]">
        
        {/* Security Warning notice if not admin */}
        {!isAdmin && (
          <div className={`mb-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-3.5 rounded-xl text-slate-600 dark:text-slate-300 text-xs flex items-start gap-2 ${isRtl ? 'text-right' : 'text-left'}`}>
            <Shield className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">{language === 'en' ? 'Read-only View: ' : 'مستند للقراءة فقط: '}</span>
              {language === 'en' 
                ? `Your account (${currentUser.name}) does not have privileges to edit or revoke permissions of other users. Panel is locked.`
                : `صلاحيات حسابك الحالي (${currentUser.name}) لا تسمح لك بتعديل أو سحب صلاحيات مستخدمين آخرين. لوحة التعديل مقفلة.`}
            </div>
          </div>
        )}

        {(isEditing || isCreating) ? (
          <form onSubmit={handleSave} className={`space-y-5 ${isRtl ? 'text-right' : 'text-left'}`}>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2">
              {isCreating 
                ? (language === 'en' ? 'Create New User Account & Assign Privileges' : 'إعداد حساب مستخدم وصلاحيات جديدة') 
                : (language === 'en' ? `Edit Permissions: ${formData.name}` : `تعديل صلاحيات المستخدم: ${formData.name}`)}
            </h4>

            {/* Basic Info & Department/Job Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t('users.fullName')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={language === 'en' ? 'e.g. Eng. Faisal Al-Mugrin' : 'مثال: المهندس فيصل المقرن'}
                  className={`w-full text-xs p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 ${isRtl ? 'text-right' : 'text-left'}`}
                  value={formData.name || ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t('users.username')}
                </label>
                <input
                  type="email"
                  required
                  placeholder="user@example.com"
                  className="w-full text-xs p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 font-mono text-left"
                  dir="ltr"
                  value={formData.username || ''}
                  onChange={e => setFormData({ ...formData, username: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t('users.password')}
                </label>
                <input
                  type="text"
                  required
                  placeholder="nwc1234"
                  className="w-full text-xs p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 font-mono text-center"
                  value={formData.password || ''}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1 justify-start">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  <span>{t('users.department')}</span>
                </label>
                <input
                  type="text"
                  placeholder={language === 'en' ? 'e.g. Sewage Projects Directorate' : 'مثال: إدارة مشاريع الصرف الصحي'}
                  className={`w-full text-xs p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 ${isRtl ? 'text-right' : 'text-left'}`}
                  value={formData.department || ''}
                  onChange={e => setFormData({ ...formData, department: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1 justify-start">
                  <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                  <span>{t('users.jobTitle')}</span>
                </label>
                <input
                  type="text"
                  placeholder={language === 'en' ? 'e.g. GIS Specialist' : 'مثال: أخصائي نظم معلومات جغرافية'}
                  className={`w-full text-xs p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 ${isRtl ? 'text-right' : 'text-left'}`}
                  value={formData.jobTitle || ''}
                  onChange={e => setFormData({ ...formData, jobTitle: e.target.value })}
                />
              </div>
            </div>

            {/* Role Select */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block">
                {t('users.role')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  { value: 'viewer', title: language === 'en' ? 'Viewer' : 'مستعرض', desc: language === 'en' ? 'View GIS maps and dashboards only without edit permissions.' : 'استعراض البيانات والخرائط فقط دون القدرة على تعديل الرابط أو مواصفات العقد.' },
                  { value: 'editor', title: language === 'en' ? 'Map Editor' : 'محرر خرائط', desc: language === 'en' ? 'Ability to update KMZ maps and technical project data in assigned scopes.' : 'صلاحية تعديل روابط الـ KMZ للمناطق المسموحة له والبيانات الفنية.' },
                  { value: 'admin', title: language === 'en' ? 'Full Admin' : 'مدير كامل', desc: language === 'en' ? 'Full system access to all projects, audit logs, and user management.' : 'حق الوصول لجميع المشاريع وتلقي التقارير وإنشاء وتعديل مستخدمي النظام.' }
                ].map(r => (
                  <label
                    key={r.value}
                    className={`p-2.5 rounded-lg border cursor-pointer flex flex-col justify-between transition-all ${isRtl ? 'text-right' : 'text-left'} ${
                      formData.role === r.value 
                        ? 'border-blue-600 bg-blue-50/30 dark:bg-blue-950/40 shadow-2xs' 
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{r.title}</span>
                      <input
                        type="radio"
                        name="role"
                        className="accent-blue-600 cursor-pointer"
                        checked={formData.role === r.value}
                        onChange={() => setFormData({ ...formData, role: r.value as any })}
                      />
                    </div>
                    <span className="text-[9px] text-slate-400 leading-normal mt-1">{r.desc}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Site features in permissions */}
            <div className="border border-slate-200/80 dark:border-slate-700 rounded-2xl p-4.5 bg-slate-50/40 dark:bg-slate-800/40 space-y-4">
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 block">
                {language === 'en' ? 'Feature Access & Usage Permissions' : 'إعداد خصائص الموقع وصلاحيات الاستخدام'}
              </span>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* A. Tab Permissions */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
                    {t('users.allowedTabs')}:
                  </label>
                  <div className="space-y-1.5">
                    {TAB_OPTIONS.map(tab => {
                      const isAllowed = (formData.allowedTabs || ['maps', 'stats', 'layers']).includes(tab.id);
                      return (
                        <button
                          type="button"
                          key={tab.id}
                          onClick={() => handleTabToggle(tab.id)}
                          className={`flex items-center justify-between w-full p-2 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                            isAllowed 
                              ? 'bg-white dark:bg-slate-800 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-300' 
                              : 'bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-400'
                          }`}
                        >
                          <span>{tab.label}</span>
                          {isAllowed ? (
                            <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                          ) : (
                            <Square className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* B. Specific Feature Settings */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
                    {t('users.permissionsFlags')}:
                  </label>
                  <div className="space-y-1.5">
                    {/* B1. Open External Links */}
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, canOpenExternalLinks: !formData.canOpenExternalLinks })}
                      className={`flex items-center justify-between w-full p-2.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                        formData.canOpenExternalLinks !== false
                          ? 'bg-white dark:bg-slate-800 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-300'
                          : 'bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className={`flex flex-col ${isRtl ? 'items-start' : 'items-start'} gap-0.5`}>
                        <span>{t('users.canOpenExternalLinks')}</span>
                        <span className="text-[9px] text-slate-400 font-normal">
                          {language === 'en' ? 'Enable external Google Maps routing and navigation buttons' : 'تفعيل أزرار ملاحة خرائط قوقل الخارجية'}
                        </span>
                      </div>
                      {formData.canOpenExternalLinks !== false ? (
                        <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />
                      )}
                    </button>

                    {/* B2. Filtering and Search */}
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, canFilter: !formData.canFilter })}
                      className={`flex items-center justify-between w-full p-2.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                        formData.canFilter !== false
                          ? 'bg-white dark:bg-slate-800 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-300'
                          : 'bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className={`flex flex-col ${isRtl ? 'items-start' : 'items-start'} gap-0.5`}>
                        <span>{t('users.canFilter')}</span>
                        <span className="text-[9px] text-slate-400 font-normal">
                          {language === 'en' ? 'Show project filter and search bar in list' : 'عرض شريط فلترة المشاريع في القائمة'}
                        </span>
                      </div>
                      {formData.canFilter !== false ? (
                        <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />
                      )}
                    </button>

                    {/* B3. Inserting projects */}
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, canInsert: !formData.canInsert })}
                      className={`flex items-center justify-between w-full p-2.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                        formData.canInsert !== false
                          ? 'bg-white dark:bg-slate-800 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-300'
                          : 'bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className={`flex flex-col ${isRtl ? 'items-start' : 'items-start'} gap-0.5`}>
                        <span>{t('users.canInsert')}</span>
                        <span className="text-[9px] text-slate-400 font-normal">
                          {language === 'en' ? 'Allow adding and modifying GIS projects in portal' : 'السماح بتعبئة وإدراج مشاريع جغرافية بالبوابة'}
                        </span>
                      </div>
                      {formData.canInsert !== false ? (
                        <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />
                      )}
                    </button>
                  </div>
                </div>

                {/* B4. Project Layers Permissions (Linked to 'layers' tab) */}
                {(() => {
                  const isLayersTabActive = (formData.allowedTabs || []).includes('layers');
                  return (
                    <div className={`space-y-2 col-span-1 md:col-span-2 border-t border-slate-200/60 dark:border-slate-700 pt-3 mt-1 transition-opacity ${
                      isLayersTabActive ? 'opacity-100' : 'opacity-40 select-none'
                    }`}>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <span>{t('users.allowedLayers')}:</span>
                          {!isLayersTabActive && (
                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/80 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                              🔒 {language === 'en' ? 'Disabled (Requires activating Project Layers tab above)' : 'معطل (يتطلب تفعيل تبويب طبقات المشاريع بالأعلى)'}
                            </span>
                          )}
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {LAYER_OPTIONS.map(layer => {
                          const list = isLayersTabActive ? (formData.allowedLayers || ['water', 'sewage', 'materials']) : [];
                          const isAllowed = isLayersTabActive && (list.includes(layer.id) || list.includes('الكل'));
                          return (
                            <button
                              type="button"
                              key={layer.id}
                              disabled={!isLayersTabActive}
                              onClick={() => {
                                if (!isLayersTabActive) return;
                                let baseList = list.includes('الكل') 
                                  ? ['water', 'sewage', 'materials'] 
                                  : list.filter(l => l !== 'الكل');
                                let newLayers: string[];
                                if (baseList.includes(layer.id)) {
                                  newLayers = baseList.filter(l => l !== layer.id);
                                } else {
                                  newLayers = [...baseList, layer.id];
                                }
                                if (newLayers.length === 0) {
                                  newLayers = ['water', 'sewage', 'materials'];
                                }

                                // Sync allowedScopes
                                let newScopes: string[] = [];
                                if (newLayers.includes('water') && newLayers.includes('sewage')) {
                                  newScopes = ['الكل'];
                                } else if (newLayers.includes('water')) {
                                  newScopes = ['مياه'];
                                } else if (newLayers.includes('sewage')) {
                                  newScopes = ['صرف صحي'];
                                } else {
                                  newScopes = ['الكل'];
                                }

                                setFormData({
                                  ...formData,
                                  allowedLayers: newLayers,
                                  allowedScopes: newScopes
                                });
                              }}
                              className={`flex items-center justify-between p-2.5 rounded-lg text-xs font-bold transition-all border ${
                                !isLayersTabActive 
                                  ? 'bg-slate-100/60 dark:bg-slate-800/40 border-dashed border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                                  : isAllowed
                                    ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 shadow-xs cursor-pointer'
                                    : 'bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-400 cursor-pointer'
                              }`}
                            >
                              <span>{layer.label}</span>
                              {isAllowed ? (
                                <CheckSquare className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                              ) : (
                                <Square className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* B5. Statistics Sub-Tabs Permissions (Linked to 'stats' tab) */}
                {(() => {
                  const isStatsTabActive = (formData.allowedTabs || []).includes('stats');
                  return (
                    <div className={`space-y-2 col-span-1 md:col-span-2 border-t border-slate-200/60 dark:border-slate-700 pt-3 mt-1 transition-opacity ${
                      isStatsTabActive ? 'opacity-100' : 'opacity-40 select-none'
                    }`}>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <span>{t('users.allowedStatsSubTabs')}:</span>
                          {!isStatsTabActive && (
                            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                              🔒 {language === 'en' ? 'Disabled (Requires activating Statistics tab above)' : 'معطل (يتطلب تفعيل تبويب الإحصائيات الجغرافية بالأعلى)'}
                            </span>
                          )}
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {STATS_SUBTAB_OPTIONS.map(subtab => {
                          const list = isStatsTabActive ? (formData.allowedStatsSubTabs || ['lengths', 'mymaps', 'general']) : [];
                          const isAllowed = isStatsTabActive && (list.includes(subtab.id) || list.includes('الكل'));
                          return (
                            <button
                              type="button"
                              key={subtab.id}
                              disabled={!isStatsTabActive}
                              onClick={() => {
                                if (!isStatsTabActive) return;
                                let baseList = list.includes('الكل') 
                                  ? ['lengths', 'mymaps', 'general'] 
                                  : list.filter(s => s !== 'الكل');
                                let newStats: string[];
                                if (baseList.includes(subtab.id)) {
                                  newStats = baseList.filter(s => s !== subtab.id);
                                } else {
                                  newStats = [...baseList, subtab.id];
                                }
                                if (newStats.length === 0) {
                                  newStats = ['lengths', 'mymaps', 'general'];
                                }
                                setFormData({
                                  ...formData,
                                  allowedStatsSubTabs: newStats
                                });
                              }}
                              className={`flex items-center justify-between p-2.5 rounded-lg text-xs font-bold transition-all border ${
                                !isStatsTabActive
                                  ? 'bg-slate-100/60 dark:bg-slate-800/40 border-dashed border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                                  : isAllowed
                                    ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200 shadow-xs cursor-pointer'
                                    : 'bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-400 cursor-pointer'
                              }`}
                            >
                              <span>{subtab.label}</span>
                              {isAllowed ? (
                                <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                              ) : (
                                <Square className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Allowed Regions (Checkboxes) */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {t('users.allowedRegions')}
                </label>
                <button
                  type="button"
                  onClick={() => handleCheckboxChange('allowedRegions', 'الكل')}
                  className={`text-[10px] px-2 py-0.5 rounded border cursor-pointer ${
                    formData.allowedRegions?.includes('الكل') 
                      ? 'bg-blue-600 text-white border-blue-600 font-bold' 
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 font-semibold'
                  }`}
                >
                  {language === 'en' ? 'Global Access (All)' : 'الوصول العام (الكل)'}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                {REGION_OPTIONS.map(reg => {
                  const isChecked = formData.allowedRegions?.includes(reg) || formData.allowedRegions?.includes('الكل');
                  return (
                    <button
                      type="button"
                      key={reg}
                      onClick={() => handleCheckboxChange('allowedRegions', reg)}
                      className={`flex items-center gap-2 p-1.5 rounded ${isRtl ? 'text-right' : 'text-left'} text-xs transition-colors cursor-pointer ${
                        isChecked 
                          ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-700 shadow-xs' 
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 bg-transparent border-0'
                      }`}
                    >
                      {isChecked ? <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" /> : <Square className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />}
                      <span className="truncate">{translateDynamic(reg)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Allowed Scopes */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {t('users.allowedScopes')}
                </label>
                <button
                  type="button"
                  onClick={() => handleCheckboxChange('allowedScopes', 'الكل')}
                  className={`text-[10px] px-2 py-0.5 rounded border cursor-pointer ${
                    formData.allowedScopes?.includes('الكل') 
                      ? 'bg-blue-600 text-white border-blue-600 font-bold' 
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 font-semibold'
                  }`}
                >
                  {language === 'en' ? 'All Scopes (All)' : 'صلاحية شاملة (الكل)'}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                {SCOPE_OPTIONS.map(scope => {
                  const isChecked = formData.allowedScopes?.includes(scope) || formData.allowedScopes?.includes('الكل');
                  return (
                    <button
                      type="button"
                      key={scope}
                      onClick={() => handleCheckboxChange('allowedScopes', scope)}
                      className={`flex items-center gap-2 p-1.5 rounded ${isRtl ? 'text-right' : 'text-left'} text-xs transition-colors cursor-pointer ${
                        isChecked 
                          ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-700 shadow-xs' 
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 bg-transparent border-0'
                      }`}
                    >
                      {isChecked ? <CheckSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" /> : <Square className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />}
                      <span>{translateDynamic(scope)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 🏷️ Allowed Project Statuses (حالات المشاريع المسموحة) */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {language === 'en' ? 'Allowed Project Statuses:' : 'حالات المشاريع المسموحة:'}
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => handleCheckboxChange('allowedStatuses', 'الكل')}
                  className={`text-[10px] px-2 py-0.5 rounded border cursor-pointer ${
                    formData.allowedStatuses?.includes('الكل') 
                      ? 'bg-indigo-600 text-white border-indigo-600 font-bold' 
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 font-semibold'
                  }`}
                >
                  {language === 'en' ? 'All Statuses (All)' : 'الوصول العام لكافة الحالات (الكل)'}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                {ALL_PROJECT_STATUSES.map(st => {
                  const isChecked = formData.allowedStatuses?.includes(st) || formData.allowedStatuses?.includes('الكل');
                  const countForStatus = projects.filter(p => p.id !== -1 && (p.status || '').trim() === st).length;
                  return (
                    <button
                      type="button"
                      key={st}
                      onClick={() => handleCheckboxChange('allowedStatuses', st)}
                      className={`flex items-center justify-between gap-1.5 p-2 rounded-lg ${isRtl ? 'text-right' : 'text-left'} text-xs transition-all cursor-pointer border ${
                        isChecked 
                          ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 font-bold border-indigo-200 dark:border-indigo-700 shadow-xs ring-1 ring-indigo-500/20' 
                          : 'bg-white/40 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200/60 dark:border-slate-700/60'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isChecked ? <CheckSquare className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" /> : <Square className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0" />}
                        <span className="truncate text-[11px]">{translateDynamic(st)}</span>
                      </div>
                      <span className="text-[9px] font-mono px-1 py-0.2 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded shrink-0">
                        {countForStatus}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom project permissions based on Sub-Program selection */}
            {(() => {
              const isMapsTabActive = (formData.allowedTabs || []).includes('maps');
              return (
                <div className={`border border-slate-200 dark:border-slate-700 rounded-2xl p-4 bg-amber-50/20 dark:bg-amber-950/20 border-amber-200/50 space-y-4 transition-opacity ${
                  isMapsTabActive ? 'opacity-100' : 'opacity-40 select-none'
                }`}>
                  {!isMapsTabActive && (
                    <div className="bg-amber-100/80 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 p-2.5 rounded-xl text-xs font-bold border border-amber-300 dark:border-amber-800 flex items-center gap-2">
                      <span>🔒</span>
                      <span>{language === 'en' ? 'Custom projects assignment is locked because Interactive Maps tab is not activated above.' : 'صلاحية تحديد المشاريع معطلة لأن تبويب الخرائط التفاعلية غير مفعل بالأعلى.'}</span>
                    </div>
                  )}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/30 dark:border-amber-800/30 pb-2">
                <div>
                  <h5 className="text-xs font-extrabold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                    <Layers className="h-4 w-4 text-amber-600" />
                    <span>{language === 'en' ? 'Custom Assigned Projects per Sub-Program' : 'صلاحية تحديد مشاريع مخصصة داخل البرنامج الفرعي'}</span>
                  </h5>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {language === 'en' ? 'Select sub-program to assign specific projects or include all.' : 'اختر البرنامج الفرعي، ثم عيّن مشاريع محددة للمستشار أو عيّنها كاملة.'}
                  </p>
                </div>
                <span className="text-[10px] px-2.5 py-1 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg font-bold">
                  {language === 'en' ? 'Selected Projects: ' : 'إجمالي المشاريع المحددة: '}
                  <strong className="font-mono text-xs text-amber-900 dark:text-amber-100 underline">
                    {formData.allowedProjectIds && formData.allowedProjectIds.length > 0 ? formData.allowedProjectIds.length : 0}
                  </strong>
                  {' '}{language === 'en' ? `of ${eligibleBaseProjects.length} eligible` : `من أصل ${eligibleBaseProjects.length} مشروع متاح`}
                </span>
              </div>

              {/* Global control for all projects across all programs */}
              <div className="bg-amber-500/5 border border-amber-200/40 dark:border-amber-800/40 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3" id="global-projects-bulk-actions">
                <div className={`space-y-0.5 ${isRtl ? 'text-right' : 'text-left'}`}>
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
                    {language === 'en' ? 'Global Control for All Projects:' : 'التحكم الشامل بكافة المشاريع:'}
                  </span>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                    {language === 'en' ? 'Select or deselect all projects across all sub-programs in one click.' : 'تحديد أو إلغاء تحديد كافة المشاريع بجميع البرامج الفرعية المتاحة بضغطة واحدة.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleSelectAllProjectsAcrossAllPrograms}
                    className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-[10px] font-black rounded-lg transition-colors border-0 cursor-pointer shadow-3xs"
                  >
                    {language === 'en' ? `Select All Eligible (${eligibleBaseProjects.length}) 🌐` : `تحديد كافة المشاريع المتاحة والمصرح بها (${eligibleBaseProjects.length}) 🌐`}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAllProjectsAcrossAllPrograms}
                    className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold rounded-lg transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer shadow-3xs"
                  >
                    {language === 'en' ? 'Deselect All 🧹' : 'إلغاء تحديد كافة المشاريع 🧹'}
                  </button>
                </div>
              </div>

              {/* Sub-Program, Status & Name Search Filter dropdown selection */}
              <div className="space-y-2.5 bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-200/50 dark:border-amber-900/40">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* 1. Sub-Program Filter */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
                      <span>{language === 'en' ? '1. Active Sub-Program:' : '1. البرنامج الفرعي:'}</span>
                      <span className="text-[10px] font-normal text-slate-400">({subPrograms.length} برنامج)</span>
                    </label>
                    <select
                      value={selectedSubProgramForPerms}
                      onChange={e => setSelectedSubProgramForPerms(e.target.value)}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 dark:text-slate-200"
                    >
                      <option value="all">{language === 'en' ? '-- All Sub-Programs (All) --' : '-- جميع البرامج الفرعية (الكل) --'}</option>
                      {subPrograms.map(sp => (
                        <option key={sp} value={sp}>{translateDynamic(sp)}</option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Status Filter Dropdown */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
                      <span>{language === 'en' ? '2. Filter by Project Status:' : '2. فلترة المشاريع حسب الحالة:'}</span>
                      <span className="text-[10px] font-normal text-slate-400">({ALL_PROJECT_STATUSES.length} حالة)</span>
                    </label>
                    <select
                      value={selectedStatusForPerms}
                      onChange={e => setSelectedStatusForPerms(e.target.value)}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 dark:text-slate-200"
                    >
                      <option value="all">{language === 'en' ? '-- All Statuses (Show All) --' : '-- جميع حالات المشاريع (عرض الكل) --'}</option>
                      {ALL_PROJECT_STATUSES.map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 3. Search by Project Name / PO / Contractor */}
                <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Search className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      <span>{language === 'en' ? '3. Search Project Name / PO / Contractor:' : '3. بحث باسم المشروع / الرقم التشغيلي / المقاول:'}</span>
                    </span>
                    {projectSearchTermForPerms && (
                      <button
                        type="button"
                        onClick={() => setProjectSearchTermForPerms('')}
                        className="text-[10px] font-bold text-rose-500 hover:underline cursor-pointer"
                      >
                        {language === 'en' ? 'Clear Search ✕' : 'مسح البحث ✕'}
                      </button>
                    )}
                  </label>
                  <div className="relative">
                    <Search className={`absolute ${isRtl ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none`} />
                    <input
                      type="text"
                      placeholder={language === 'en' ? 'Search by project name, PO number, or contractor...' : 'اكتب اسم المشروع، الرقم التشغيلي، أو المقاول للبحث والفلترة...'}
                      value={projectSearchTermForPerms}
                      onChange={e => setProjectSearchTermForPerms(e.target.value)}
                      className={`w-full text-xs ${isRtl ? 'pr-9 pl-8 text-right' : 'pl-9 pr-8 text-left'} py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 shadow-2xs`}
                    />
                    {projectSearchTermForPerms && (
                      <button
                        type="button"
                        onClick={() => setProjectSearchTermForPerms('')}
                        className={`absolute ${isRtl ? 'left-2.5' : 'right-2.5'} top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Status and Subprogram Quick Actions Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-amber-200/30 dark:border-amber-800/30">
                <div className="text-[11px] font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                  <span>المشاريع المطابقة للفلتر: <strong className="font-mono text-xs text-amber-700 dark:text-amber-300 font-black underline">{projectsInSelectedSubProgram.length} مشروع</strong></span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={handleSelectAllFilteredProjects}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-black rounded-lg transition-colors border-0 cursor-pointer shadow-3xs flex items-center gap-1"
                  >
                    <span>تحديد المطابقة ({projectsInSelectedSubProgram.length}) 🎯</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAllFilteredProjects}
                    className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-[10px] font-bold rounded-lg transition-colors border-0 cursor-pointer shadow-3xs"
                  >
                    <span>إلغاء المطابقة 🧹</span>
                  </button>
                </div>
              </div>

              {/* Projects in Selected Sub-Program Checkbox List */}
              {selectedSubProgramForPerms ? (
                projectsInSelectedSubProgram.length > 0 ? (
                  <div className="space-y-1.5 max-h-[180px] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                    {projectsInSelectedSubProgram.map(proj => {
                      const isChecked = (formData.allowedProjectIds || []).includes(proj.id);
                      return (
                        <button
                          type="button"
                          key={proj.id}
                          onClick={() => handleToggleProjectPermission(proj.id)}
                          className={`flex items-start gap-2.5 p-2 rounded-lg ${isRtl ? 'text-right' : 'text-left'} text-xs transition-all w-full border cursor-pointer ${
                            isChecked 
                              ? 'bg-amber-50/50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-bold' 
                              : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {isChecked ? (
                            <CheckSquare className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          ) : (
                            <Square className="h-4.5 w-4.5 text-slate-350 dark:text-slate-600 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-slate-800 dark:text-slate-100 text-[11px] font-extrabold">{translateDynamic(proj.name)}</span>
                              <span className="text-[9px] px-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded whitespace-nowrap">{translateDynamic(proj.classification)}</span>
                            </div>
                            <div className="text-[9.5px] text-slate-400 font-normal mt-1 leading-none">
                              {language === 'en' ? 'PO: ' : 'الرقم التشغيلي: '}<span className="font-mono">{proj.operationalNumber}</span> | {language === 'en' ? 'Contractor: ' : 'المقاول: '}{proj.contractor}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl text-center text-xs text-slate-400">
                    {language === 'en' ? 'No projects currently added under this sub-program.' : 'لا توجد مشاريع مضافة تابعة لهذا البرنامج الفرعي بعد.'}
                  </div>
                )
              ) : (
                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl text-center text-xs text-slate-400">
                  {language === 'en' ? 'Please select a sub-program to view and assign individual projects.' : 'يرجى تحديد برنامج فرعي لعرض ومطابقة المشاريع الفردية.'}
                </div>
              )}
            </div>
          );
        })()}

            {/* Form actions */}
            <div className={`flex items-center ${isRtl ? 'justify-end' : 'justify-end'} gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 shrink-0`}>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setIsCreating(false);
                  if (users[0]) setSelectedUser(users[0]);
                }}
                className="text-xs font-semibold px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="text-xs font-bold px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors shadow-xs cursor-pointer border-0"
              >
                {t('common.save')}
              </button>
            </div>
          </form>
        ) : selectedUser ? (
          <div className={`space-y-6 flex-1 flex flex-col justify-between ${isRtl ? 'text-right' : 'text-left'}`}>
            {/* Show User Detail */}
            <div className="space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100">{selectedUser.name}</h4>
                  <p className="text-xs font-mono text-slate-400">@{selectedUser.username}</p>
                  
                  {/* Display Department & Job Title in Detail Card */}
                  {(selectedUser.jobTitle || selectedUser.department) && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5 text-slate-600 dark:text-slate-300 text-xs">
                      {selectedUser.jobTitle && (
                        <span className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-2 py-1 rounded-lg">
                          <Briefcase className="h-4 w-4 text-slate-400" />
                          <span>{t('users.jobTitle')}: <strong>{translateDynamic(selectedUser.jobTitle)}</strong></span>
                        </span>
                      )}
                      {selectedUser.department && (
                        <span className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-2 py-1 rounded-lg">
                          <Building2 className="h-4 w-4 text-slate-400" />
                          <span>{t('users.department')}: <strong>{translateDynamic(selectedUser.department)}</strong></span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/60 rounded-2xl text-blue-600 dark:text-blue-400 shrink-0">
                  <UserCheck className="h-7 w-7" />
                </div>
              </div>

              {/* Badges and parameters summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-100 dark:border-slate-700">
                  <span className={`text-[10px] text-slate-400 font-bold block mb-1 ${isRtl ? 'text-right' : 'text-left'}`}>
                    {t('users.role')}
                  </span>
                  <div className="flex items-center gap-1.5 justify-start">
                    <Shield className="h-4 w-4 text-indigo-500 shrink-0" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {selectedUser.role === 'admin' ? (language === 'en' ? 'Full Admin' : 'مدير كامل') : selectedUser.role === 'editor' ? (language === 'en' ? 'Map Editor' : 'محرر خرائط فنية') : (language === 'en' ? 'Viewer Only' : 'مستعرض خرائط فقط')}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-100 dark:border-slate-700">
                  <span className={`text-[10px] text-slate-400 font-bold block mb-1 ${isRtl ? 'text-right' : 'text-left'}`}>
                    {language === 'en' ? 'Account Status' : 'حالة الحساب بمركز التنسيق'}
                  </span>
                  <div className="flex items-center gap-1.5 justify-start">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {language === 'en' ? 'Active & KMZ Connected' : 'نَشِط ومتصل لـ KMZ'}
                    </span>
                  </div>
                </div>

                <div className="bg-blue-50/40 dark:bg-blue-950/40 p-3.5 rounded-xl border border-blue-100/60 dark:border-blue-900/60">
                  <span className={`text-[10px] text-blue-500 font-bold block mb-1 ${isRtl ? 'text-right' : 'text-left'}`}>
                    {t('users.password')}
                  </span>
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-blue-800 dark:text-blue-300">
                      <Key className="h-4 w-4 text-blue-500 shrink-0" />
                      <span>{showPassword ? (selectedUser.password || 'nwc1234') : '••••••••'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-100/50 transition-all cursor-pointer shrink-0 border-0 bg-transparent"
                      title={showPassword ? (language === 'en' ? 'Hide Password' : 'إخفاء كلمة المرور') : (language === 'en' ? 'Show Password' : 'إظهار كلمة المرور')}
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Requirement 2 Checklist overview in User detail card */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 block">
                  {language === 'en' ? 'Detailed Privilege Overview:' : 'امتيازات التحكم المفصلة:'}
                </span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs leading-relaxed">
                  {/* Tabs */}
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 font-bold block mb-1">
                      {t('users.allowedTabs')}:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(selectedUser.allowedTabs || ['maps', 'stats', 'layers']).map(tab => (
                        <span key={tab} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded text-[10px] font-bold">
                          {tab === 'maps' ? (language === 'en' ? 'Maps' : 'الخرائط التفاعلية') : tab === 'stats' ? (language === 'en' ? 'Stats' : 'الإحصائيات') : tab === 'layers' ? (language === 'en' ? 'Layers' : 'طبقات المشاريع') : tab === 'changelog' ? (language === 'en' ? 'Changelog' : 'سجل التغييرات') : tab === 'maptools' ? (language === 'en' ? 'Map Tools' : 'أدوات الخرائط') : tab}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold block mb-1">
                      {t('users.permissionsFlags')}:
                    </span>
                    <div className="flex flex-col gap-1 text-[11px] font-semibold">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${selectedUser.canOpenExternalLinks !== false ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span className={selectedUser.canOpenExternalLinks !== false ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}>
                          {language === 'en' ? 'Open external links: ' : 'فتح الروابط الخارجية: '}
                          {selectedUser.canOpenExternalLinks !== false ? (language === 'en' ? 'Allowed ✅' : 'مسموح ✅') : (language === 'en' ? 'Disabled 🔒' : 'معطل 🔒')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${selectedUser.canFilter !== false ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span className={selectedUser.canFilter !== false ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}>
                          {language === 'en' ? 'Search & Filter: ' : 'البحث والتصفية: '}
                          {selectedUser.canFilter !== false ? (language === 'en' ? 'Allowed ✅' : 'مسموح ✅') : (language === 'en' ? 'Disabled 🔒' : 'معطل 🔒')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${selectedUser.canInsert !== false ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span className={selectedUser.canInsert !== false ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}>
                          {language === 'en' ? 'Add & Edit Projects: ' : 'إدراج وإضافة مشاريع: '}
                          {selectedUser.canInsert !== false ? (language === 'en' ? 'Allowed ✅' : 'مسموح ✅') : (language === 'en' ? 'Disabled 🔒' : 'معطل 🔒')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Layers allowed */}
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 md:col-span-1">
                    <span className="text-[10px] text-slate-400 font-bold block mb-1">
                      {t('users.allowedLayers')}:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(() => {
                        const hasLayersTab = (selectedUser.allowedTabs || []).includes('layers');
                        const layersList = hasLayersTab ? (selectedUser.allowedLayers || []) : [];
                        if (hasLayersTab && layersList.length > 0) {
                          return layersList.map(l => (
                            <span key={l} className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-200/60 dark:border-amber-900 rounded text-[10px] font-bold">
                              {l === 'water' ? (language === 'en' ? '💧 Water' : '💧 المياه') : l === 'sewage' ? (language === 'en' ? '🌿 Sewage' : '🌿 الصرف الصحي') : l === 'materials' ? (language === 'en' ? '📦 Materials' : '📦 مواد التشوين') : l}
                            </span>
                          ));
                        }
                        return (
                          <span className="text-rose-600 dark:text-rose-400 font-bold bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900 text-[10px]">
                            🔒 {language === 'en' ? 'Disabled (No tab access)' : 'معطلة (لا تتوفر صلاحية للتبويب)'}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Stats Sub-tabs allowed */}
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 md:col-span-1">
                    <span className="text-[10px] text-slate-400 font-bold block mb-1">
                      {t('users.allowedStatsSubTabs')}:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(() => {
                        const hasStatsTab = (selectedUser.allowedTabs || []).includes('stats');
                        const statsList = hasStatsTab ? (selectedUser.allowedStatsSubTabs || []) : [];
                        if (hasStatsTab && statsList.length > 0) {
                          return statsList.map(s => (
                            <span key={s} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200 border border-blue-200/60 dark:border-blue-900 rounded text-[10px] font-bold">
                              {s === 'lengths' ? (language === 'en' ? '📏 Lengths & Permits' : '📏 حصر الأطوال والرخص') : s === 'mymaps' ? (language === 'en' ? '📊 My Maps' : '📊 تحليل My Maps') : s === 'general' ? (language === 'en' ? '📈 General Stats' : '📈 الإحصائيات العامة') : s}
                            </span>
                          ));
                        }
                        return (
                          <span className="text-rose-600 dark:text-rose-400 font-bold bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900 text-[10px]">
                            🔒 {language === 'en' ? 'Disabled (No tab access)' : 'معطلة (لا تتوفر صلاحية للتبويب)'}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Geographic boundaries visual */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
                  {language === 'en' ? 'Geographic, Sector & Status Coverage Granted:' : 'نطاق التراخيص الجغرافي والقطاعي وحالات المشاريع الممنوحة:'}
                </span>
                
                <div className="space-y-1.5">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    <strong className="text-slate-800 dark:text-slate-200">{t('users.allowedRegions')}:</strong>{' '}
                    {selectedUser.allowedRegions.includes('الكل') ? (
                      <span className="text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded">
                        {language === 'en' ? 'Full Geographic Access (All Regions)' : 'وصول جغرافي كامل (جميع المناطق)'}
                      </span>
                    ) : (
                      <span className="text-slate-700 dark:text-slate-300 font-semibold">{selectedUser.allowedRegions.map(r => translateDynamic(r)).join(', ')}</span>
                    )}
                  </div>
                  
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    <strong className="text-slate-800 dark:text-slate-200">{t('users.allowedScopes')}:</strong>{' '}
                    {selectedUser.allowedScopes.includes('الكل') ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded">
                        {language === 'en' ? 'All Water & Sewage Scopes' : 'كافة تخصصات المياه والصرف'}
                      </span>
                    ) : (
                      <span className="text-slate-700 dark:text-slate-300 font-semibold">{selectedUser.allowedScopes.map(s => translateDynamic(s)).join(', ')}</span>
                    )}
                  </div>

                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    <strong className="text-slate-800 dark:text-slate-200">{language === 'en' ? 'Allowed Statuses:' : 'حالات المشاريع المسموحة:'}</strong>{' '}
                    {(!selectedUser.allowedStatuses || selectedUser.allowedStatuses.includes('الكل')) ? (
                      <span className="text-indigo-700 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded">
                        {language === 'en' ? 'All Project Statuses (11 Statuses)' : 'وصول شامل لكافة حالات المشاريع (11 حالة)'}
                      </span>
                    ) : (
                      <span className="text-slate-700 dark:text-slate-300 font-semibold">
                        {selectedUser.allowedStatuses.map(st => translateDynamic(st)).join(', ')}
                      </span>
                    )}
                  </div>

                  {selectedUser.allowedProjectIds && selectedUser.allowedProjectIds.length > 0 && (() => {
                    const effectiveCount = selectedUser.allowedProjectIds.filter(id => {
                      const proj = projects.find(p => p.id === id);
                      return proj ? isProjectMatchingBasePermissions(proj, selectedUser) : false;
                    }).length;
                    return effectiveCount > 0 ? (
                      <div className="text-xs text-slate-500 dark:text-slate-400 border-t border-dashed border-slate-200 dark:border-slate-700 pt-2.5 mt-2.5">
                        <strong className="text-amber-800 dark:text-amber-300">
                          {language === 'en' ? `🔒 Restricted to specific projects (${effectiveCount}):` : `🔒 الوصول مقتصر على مشاريع محددة (${effectiveCount}):`}
                        </strong>{' '}
                      <p className="text-[10px] text-slate-400 font-semibold leading-relaxed mt-1">
                        {language === 'en' 
                          ? 'This user is restricted exclusively to projects assigned by the system admin.'
                          : 'تم تقييد رؤية هذا المستشار حصراً على المشاريع المحددة التي عينها المشرف العام. لن يتمكن من رؤية غيرها في البوابة.'}
                      </p>
                    </div>
                    ) : null;
                  })()}
                </div>
              </div>

              {/* Rules description */}
              <div className="p-3.5 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900 text-[11px] text-indigo-900 dark:text-indigo-200 leading-relaxed">
                <span className="font-bold block mb-0.5">💡 {language === 'en' ? 'Access Control Policy:' : 'أثر الصلاحيات والقيود:'}</span>
                {language === 'en' 
                  ? 'The system automatically enforces geographic, scope, and project constraints to safeguard National Water Company official GIS records.'
                  : 'تلقائياً يقوم النظام بتطبيق القيود الجغرافية والقطاعية والمشاريع المخصصة لفلترة المشاريع في الخرائط والإحصائيات وتفاصيل البوابة لضمان حماية ومطابقة السرية التامة للمعلومات الرسمية لشركة المياه الوطنية.'}
              </div>
            </div>

            {/* Actions for selection */}
            {isAdmin && (
              <div className={`flex items-center ${isRtl ? 'justify-end' : 'justify-end'} gap-2 pt-4 border-t border-slate-100 dark:border-slate-800 shrink-0`}>
                <button
                  type="button"
                  onClick={() => handleDelete(selectedUser.id)}
                  className="flex items-center gap-1 text-xs text-rose-600 hover:text-white border border-rose-200 dark:border-rose-800 hover:bg-rose-600 px-3 py-2 rounded-xl transition-all cursor-pointer bg-white dark:bg-slate-900"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{t('users.deleteUser')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="flex items-center gap-1 text-xs bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl transition-colors cursor-pointer border-0"
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span>{t('users.editUser')}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-slate-400 py-16">
            <Users className="h-10 w-10 mx-auto opacity-40 mb-2" />
            <p className="text-xs">{language === 'en' ? 'Please select a user from the list to view or edit permissions.' : 'الرجاء اختيار مستخدم من القائمة لمشاهدة أو تعديل تفاصيل صلاحياته.'}</p>
          </div>
        )}

      </div>
    </div>
  );
}
