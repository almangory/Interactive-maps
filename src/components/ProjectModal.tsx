/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Project } from '../types';
import { X, Save, AlertTriangle, Info, Map, CheckCircle } from 'lucide-react';
import { getWhatsAppLink, WhatsAppIcon } from '../utils/whatsapp';
import { useLanguage } from '../utils/i18n';

interface ProjectModalProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
  onSave: (project: Project) => void;
}

const REGIONS = [
  'شمال الرياض',
  'جنوب الرياض',
  'غرب الرياض',
  'المحافظات الشمالية',
  'المحافظات الجنوبية',
  'المحافظات الغربية',
  'المتفرقات'
];

const SCOPES = [
  'صرف صحي',
  'مياه'
];

const STATUSES = [
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
];

const CLASSIFICATIONS = [
  'شبكات',
  'خطوط رئيسية',
  'خزانات',
  'مخطط استراتيجي',
  'خطوط ناقلة',
  'ترحيل',
  'استبدال',
  'محطات معالجة بيئية',
  'خطوط وشبكات',
  'خطوط'
];

export function ProjectModal({ isOpen, project, onClose, onSave }: ProjectModalProps) {
  const { t, isRtl, translateDynamic } = useLanguage();
  const [formData, setFormData] = useState<Partial<Project>>({
    operationalNumber: '',
    name: '',
    po: '',
    unifierNo: '',
    contractor: '',
    consultant: '',
    status: 'جاري',
    scope: 'صرف صحي',
    classification: 'شبكات',
    businessUnit: 'وحدة أعمال الرياض',
    region: 'شمال الرياض',
    subProgram: '',
    mapUrl: '',
    x: null,
    y: null,
    surveyorName: '',
    surveyorPhone: ''
  });

  const [error, setError] = useState('');

  useEffect(() => {
    if (project) {
      setFormData({
        ...project,
        x: project.x !== undefined && project.x !== null ? project.x : null,
        y: project.y !== undefined && project.y !== null ? project.y : null,
        surveyorName: project.surveyorName || '',
        surveyorPhone: project.surveyorPhone || '',
      });
    } else {
      setFormData({
        operationalNumber: '',
        name: '',
        po: '',
        unifierNo: '',
        contractor: '',
        consultant: 'مكتب الياردة للاستشارات الهندسية',
        status: 'جاري',
        scope: 'صرف صحي',
        classification: 'شبكات',
        businessUnit: 'وحدة أعمال الرياض',
        region: 'شمال الرياض',
        subProgram: 'شمال الرياض - صرف',
        mapUrl: '',
        x: null,
        y: null,
        surveyorName: '',
        surveyorPhone: ''
      });
    }
    setError('');
  }, [project, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim() || !formData.operationalNumber?.trim()) {
      setError(t('projModal.validationError', 'الرجاء تعبئة اسم المشروع والرقم التشغيلي للمطابقة التنظيمية'));
      return;
    }

    // Clean map URL from whitespaces, invisible directional unicode marks (LRM/RLM/PDF), newlines, and auto-format
    let cleanMapUrl = (formData.mapUrl || '').trim();
    cleanMapUrl = cleanMapUrl.replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\s]/g, '').trim();

    if (cleanMapUrl) {
      if (!cleanMapUrl.startsWith('http://') && !cleanMapUrl.startsWith('https://')) {
        if (cleanMapUrl.startsWith('www.') || cleanMapUrl.includes('google.com') || cleanMapUrl.includes('maps/')) {
          cleanMapUrl = `https://${cleanMapUrl}`;
        } else {
          setError(t('projModal.urlError', 'رابط الخريطة يجب أن يكون رابطاً صالحاً يبدأ بـ http:// أو https://'));
          return;
        }
      }
    }

    const savedProject: Project = {
      id: project ? project.id : Math.floor(Math.random() * 900000) + 100000,
      operationalNumber: (formData.operationalNumber || '').trim(),
      name: (formData.name || '').trim(),
      po: (formData.po || '').trim(),
      unifierNo: (formData.unifierNo || '').trim(),
      contractor: (formData.contractor || '').trim(),
      consultant: (formData.consultant || '').trim(),
      status: formData.status || 'جاري',
      scope: formData.scope || 'صرف صحي',
      classification: formData.classification || 'شبكات',
      businessUnit: formData.businessUnit || 'وحدة أعمال الرياض',
      region: formData.region || 'شمال الرياض',
      subProgram: formData.subProgram || '',
      mapUrl: cleanMapUrl,
      x: formData.x !== undefined && formData.x !== null && formData.x !== ('' as any) && !isNaN(Number(formData.x)) ? Number(formData.x) : null,
      y: formData.y !== undefined && formData.y !== null && formData.y !== ('' as any) && !isNaN(Number(formData.y)) ? Number(formData.y) : null,
      surveyorName: (formData.surveyorName || '').trim(),
      surveyorPhone: (formData.surveyorPhone || '').trim(),
    };

    onSave(savedProject);
    onClose();
  };

  return (
    <div className={`fixed inset-0 z-[9999] overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 ${isRtl ? 'dir-rtl' : 'dir-ltr'}`}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-100 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Map className="h-5 w-5 text-blue-400" />
            <h3 className="text-base font-bold">
              {project ? t('projModal.editTitle', 'تعديل بيانات المشروع والخرائط الفنية') : t('projModal.addTitle', 'إدراج مشروع تنفيذ وخارطة تفاعلية جديدة')}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="bg-blue-50/50 dark:bg-blue-950/40 p-3.5 rounded-xl border border-blue-100 dark:border-blue-900/60 text-xs text-blue-900 dark:text-blue-200 leading-normal">
            ⚙️ <span className="font-bold">{t('projModal.noticeLabel', 'تنويه إدخال البيانات:')}</span> {t('projModal.noticeText', 'تخفي البوابة تلقائياً الروابط المضافة حديثاً عن المشاهدين العاديين، وتقوم بإتاحتهم للمستخدمين المفوضين بالمنطقة الجغرافية المحددة.')}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Project Name */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('projModal.fullName', 'إسم المشروع بالكامل (Ar)')} <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                placeholder={t('projModal.namePlaceholder', 'مثال: عقد تنفيذ شبكات صرف صحي بأجزاء من حي طويق')}
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white"
                value={formData.name || ''}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            {/* Operational Number */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('projModal.opNumber', 'الرقم التشغيلي للمشروع')} <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                placeholder="مثال: 24/23/2/02/0012/1"
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white font-mono"
                value={formData.operationalNumber || ''}
                onChange={e => setFormData({ ...formData, operationalNumber: e.target.value })}
              />
            </div>

            {/* Contractor */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('projModal.contractor', 'إسم شركة المقاولات المنفذة')}</label>
              <input
                type="text"
                placeholder={t('projModal.contractorPlaceholder', 'مثال: شركة صلت للمقاولات')}
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white"
                value={formData.contractor || ''}
                onChange={e => setFormData({ ...formData, contractor: e.target.value })}
              />
            </div>

            {/* PO */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('projModal.poNumber', 'رقم أمر الشراء PO')}</label>
              <input
                type="text"
                placeholder="مثال: 201230390"
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white font-mono"
                value={formData.po || ''}
                onChange={e => setFormData({ ...formData, po: e.target.value })}
              />
            </div>

            {/* Unifier No */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('projModal.unifierNumber', 'رقم Unifier')}</label>
              <input
                type="text"
                placeholder="مثال: 10120"
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white font-mono"
                value={formData.unifierNo || ''}
                onChange={e => setFormData({ ...formData, unifierNo: e.target.value })}
              />
            </div>

            {/* Execution Consultant */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('projModal.consultant', 'إسم استشاري الإشراف والتنفيذ')}</label>
              <input
                type="text"
                placeholder={t('projModal.consultantPlaceholder', 'مثال: مكتب الياردة للاستشارات الهندسية')}
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white"
                value={formData.consultant || ''}
                onChange={e => setFormData({ ...formData, consultant: e.target.value })}
              />
            </div>

            {/* Surveyor Name */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('projModal.surveyorName', 'اسم المساح المسؤول')}</label>
              <input
                type="text"
                placeholder={t('projModal.surveyorNamePlaceholder', 'مثال: م. أحمد الخالد')}
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white"
                value={formData.surveyorName || ''}
                onChange={e => setFormData({ ...formData, surveyorName: e.target.value })}
              />
            </div>

            {/* Surveyor Phone */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
                  <span>{t('projModal.surveyorPhone', 'رقم التواصل للمساح (واتساب)')}</span>
                </label>
                {formData.surveyorPhone && (
                  <a
                    href={getWhatsAppLink(formData.surveyorPhone, formData.name, formData.operationalNumber)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10.5px] text-white bg-[#25D366] hover:bg-[#20bd5a] font-bold px-2 py-0.5 rounded shadow-2xs"
                    title={t('projModal.testChat', 'تجربة فتح المحادثة المباشرة في واتساب')}
                  >
                    <WhatsAppIcon className="h-3 w-3 text-white fill-white" />
                    <span>{t('projModal.testChatBtn', 'محادثة تجريبية 💬')}</span>
                  </a>
                )}
              </div>
              <input
                type="tel"
                placeholder="مثال: 0501234567"
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white font-mono"
                value={formData.surveyorPhone || ''}
                onChange={e => setFormData({ ...formData, surveyorPhone: e.target.value })}
              />
            </div>

            {/* Sub-program */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('projModal.subProgram', 'البرنامج الفرعي للتنفيذ')}</label>
              <input
                type="text"
                placeholder={t('projModal.subProgramPlaceholder', 'مثال: جنوب الرياض - صرف')}
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white"
                value={formData.subProgram || ''}
                onChange={e => setFormData({ ...formData, subProgram: e.target.value })}
              />
            </div>

            {/* Scope (Dropdown) */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('projModal.scope', 'النطاق العام (القطاع)')}</label>
              <select
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white"
                value={formData.scope}
                onChange={e => setFormData({ ...formData, scope: e.target.value })}
              >
                {SCOPES.map(s => <option key={s} value={s}>{translateDynamic(s)}</option>)}
              </select>
            </div>

            {/* Region (Dropdown) */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('projModal.region', 'منطقة نطاق المشروع الجغرافي')}</label>
              <select
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white"
                value={formData.region}
                onChange={e => setFormData({ ...formData, region: e.target.value })}
              >
                {REGIONS.map(r => <option key={r} value={r}>{translateDynamic(r)}</option>)}
              </select>
            </div>

            {/* Classification (Dropdown / Datalist) */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('projModal.classification', 'تصنيف المشروع')}</label>
              <select
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white"
                value={formData.classification}
                onChange={e => setFormData({ ...formData, classification: e.target.value })}
              >
                {CLASSIFICATIONS.map(c => <option key={c} value={c}>{translateDynamic(c)}</option>)}
              </select>
            </div>

            {/* Status (Dropdown) */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('projModal.status', 'مرحلة المشروع (الحالة)')}</label>
              <select
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white"
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value })}
              >
                {STATUSES.map(st => <option key={st} value={st}>{translateDynamic(st)}</option>)}
              </select>
            </div>

            {/* Map URL */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('projModal.mapUrl', 'رابط خريطة قوقل التفاعلية (Google My Maps URL)')}</label>
              <input
                type="text"
                placeholder="https://www.google.com/maps/d/viewer?mid=..."
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white font-mono"
                value={formData.mapUrl || ''}
                onChange={e => {
                  const cleaned = e.target.value.replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]/g, '');
                  setFormData({ ...formData, mapUrl: cleaned });
                  if (error) setError('');
                }}
              />
              <span className="text-[10px] text-slate-400 block">
                {t('projModal.mapUrlHint', 'يقبل روابط خريطة قوقل للتحرير (My Maps edit) أو العرض (My Maps viewer). يقوم النظام بفلترتها وعرضها بآمان.')}
              </span>
            </div>

            {/* Latitude (Y) & Longitude (X) Coordinates */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('projModal.coordX', 'إحداثي خط الطول (Coordinate X - Longitude)')}</label>
              <input
                type="number"
                step="any"
                placeholder="مثال: 46.6753"
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white font-mono"
                value={formData.x !== undefined && formData.x !== null ? formData.x : ''}
                onChange={e => {
                  const val = e.target.value === '' ? null : parseFloat(e.target.value);
                  setFormData({ ...formData, x: val });
                }}
              />
              <span className="text-[10px] text-slate-400 block">
                {t('projModal.coordXHint', 'القيمة الاختيارية لمحور الشرق (Easting / Longitude).')}
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('projModal.coordY', 'إحداثي خط العرض (Coordinate Y - Latitude)')}</label>
              <input
                type="number"
                step="any"
                placeholder="مثال: 24.7136"
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white font-mono"
                value={formData.y !== undefined && formData.y !== null ? formData.y : ''}
                onChange={e => {
                  const val = e.target.value === '' ? null : parseFloat(e.target.value);
                  setFormData({ ...formData, y: val });
                }}
              />
              <span className="text-[10px] text-slate-400 block">
                {t('projModal.coordYHint', 'القيمة الاختيارية لمحور الشمال (Northing / Latitude).')}
              </span>
            </div>

          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-semibold px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
            >
              {t('projModal.cancel', 'إلغاء التعديل')}
            </button>
            <button
              type="submit"
              className="flex items-center gap-1 text-xs font-bold px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl cursor-pointer transition-colors"
            >
              <Save className="h-4 w-4" />
              <span>{t('projModal.saveRecord', 'حفظ سجل المشروع')}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
