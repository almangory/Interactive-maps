import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cleanStage, cleanPermitNo, isYellowItemWithoutPermit } from '../utils/myMapsKmlParser';
import { useLanguage } from '../utils/i18n';
import { 
  X, 
  MapPin, 
  ExternalLink, 
  Copy, 
  Check, 
  Ruler, 
  Layers, 
  Building2, 
  Navigation, 
  HardHat, 
  FileText, 
  ShieldCheck, 
  AlertTriangle 
} from 'lucide-react';

export interface FeatureDetailData {
  name?: string;
  segmentId?: string;
  permitNo?: string;
  statusLabel?: string;
  colorHex?: string;
  stage?: string;
  lengthMeters?: number;
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
  coordinates?: Array<[number, number]>;
  description?: string;
}

interface FeatureDetailsModalProps {
  feature: FeatureDetailData | null;
  onClose: () => void;
}

export const FeatureDetailsModal: React.FC<FeatureDetailsModalProps> = ({ feature, onClose }) => {
  const { t, isRtl, translateDynamic } = useLanguage();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [copied, setCopied] = useState(false);

  if (!feature) return null;

  // Resolve coordinates
  let lat = feature.centerLat;
  let lng = feature.centerLng;

  // Fallback lat lng if not directly provided
  if ((!lat || !lng) && feature.coordinates && feature.coordinates.length > 0) {
    let sumLat = 0;
    let sumLng = 0;
    feature.coordinates.forEach(pt => {
      sumLng += pt[0];
      sumLat += pt[1];
    });
    lat = sumLat / feature.coordinates.length;
    lng = sumLng / feature.coordinates.length;
  }

  // Default fallback if still missing (Riyadh default area)
  const finalLat = lat || 24.582043;
  const finalLng = lng || 46.806716;
  const mapsUrl = feature.googleMapsUrl || `https://www.google.com/maps?q=${finalLat},${finalLng}`;
  const coordString = `${finalLat.toFixed(7)}, ${finalLng.toFixed(7)}`;

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Destroy prior map instance if exists
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    try {
      const map = L.map(mapContainerRef.current, {
        center: [finalLat, finalLng],
        zoom: 17,
        zoomControl: true
      });

      mapInstanceRef.current = map;

      // Add OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // Custom icon
      const customIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div style="background-color: ${feature.colorHex || '#ffea00'}; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
            <div style="background-color: #1e293b; width: 10px; height: 10px; border-radius: 50%;"></div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      L.marker([finalLat, finalLng], { icon: customIcon })
        .addTo(map)
        .bindPopup(`<b>${feature.name || feature.streetName || t('common.details', 'العنصر')}</b><br/>${feature.segmentId ? `Segment: ${feature.segmentId}` : ''}`)
        .openPopup();

      // Render line polyline if coordinates available
      if (feature.coordinates && feature.coordinates.length > 1) {
        const polylineLatLngs: L.LatLngExpression[] = feature.coordinates.map(pt => [pt[1], pt[0]]);
        const polyline = L.polyline(polylineLatLngs, {
          color: feature.colorHex || '#3b82f6',
          weight: 6,
          opacity: 0.85
        }).addTo(map);

        map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
      }

      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    } catch (e) {
      console.error('Error initializing Leaflet preview map:', e);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [feature, finalLat, finalLng, t]);

  const handleCopyCoords = () => {
    navigator.clipboard.writeText(coordString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm animate-fade-in ${isRtl ? 'dir-rtl' : 'dir-ltr'}`}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md"
              style={{ backgroundColor: feature.colorHex || '#3b82f6' }}
            >
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {t('feature.title', 'تفاصيل القطاع وموقع الشارع')}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {feature.streetName || feature.name || t('common.details', 'عنصر حفرية')}
                {feature.segmentId ? ` • ${feature.segmentId}` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Map & Primary Action */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Map Preview */}
            <div className="lg:col-span-7 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-inner h-[260px] lg:h-[300px] relative">
              <div ref={mapContainerRef} className="w-full h-full z-0" />
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-3 left-3 z-10 bg-white/90 dark:bg-slate-900/90 hover:bg-white dark:hover:bg-slate-900 text-slate-800 dark:text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                {t('feature.openGoogleMaps', 'توسيع في خرائط Google')}
              </a>
            </div>

            {/* Key Action Summary Box */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-slate-800/60 dark:to-slate-800/30 p-5 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{t('feature.statusLabel', 'حالة القطاع والبيان:')}</span>
                  <span 
                    className="px-2.5 py-1 rounded-full text-xs font-bold text-slate-900 shadow-sm"
                    style={{ backgroundColor: feature.colorHex || '#ffea00' }}
                  >
                    {translateDynamic(feature.statusLabel || 'جاري العمل')}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-slate-600 dark:text-slate-400">{t('feature.stage', 'مرحلة الحفرية والعمل:')}</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    <HardHat className="w-4 h-4 text-amber-500" />
                    {translateDynamic(cleanStage(feature.stage))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-slate-600 dark:text-slate-400">{t('feature.coords', 'الإحداثيات الجغرافية:')}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold bg-slate-200 dark:bg-slate-900 px-3 py-2 rounded-lg text-slate-800 dark:text-slate-200 flex-1 border border-slate-300 dark:border-slate-800 text-center">
                      {coordString}
                    </span>
                    <button
                      onClick={handleCopyCoords}
                      className="p-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-300 dark:border-slate-800 transition-colors cursor-pointer"
                      title={t('feature.copyCoords', 'نسخ الإحداثيات')}
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <Navigation className="w-4 h-4" />
                  {t('feature.showOnMap', 'إظهار موقعه على خريطة Google')}
                  <ExternalLink className="w-4 h-4 opacity-80" />
                </a>
              </div>
            </div>
          </div>

          {/* Complete KML Balloon Attributes Grid (Matching My Maps Details) */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
              <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              {t('feature.allData', 'جميع بيانات وعناصر القطاع (البيانات المستخرجة من الفسح والطبقات)')}
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              
              {/* השارع / STREETNAME */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('feature.streetName', 'اسم الشارع (STREETNAME)')}</div>
                <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">{feature.streetName || '-'}</div>
              </div>

              {/* الحي / District */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('feature.district', 'الحي (District)')}</div>
                <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">{feature.district || '-'}</div>
              </div>

              {/* رقم القطاع / SEGMENTID */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('feature.segmentId', 'رقم القطاع (SEGMENTID)')}</div>
                <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5">{feature.segmentId || '-'}</div>
              </div>

              {/* رقم التصريح / الفسح PERMITNO */}
              <div className={`p-3 rounded-xl border ${isYellowItemWithoutPermit(feature) ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/80'}`}>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('feature.permitNo', 'رقم التصريح / الفسح (PERMITNO)')}</div>
                <div className="text-xs font-bold mt-0.5">
                  {cleanPermitNo(feature.permitNo) ? (
                    <span className="text-emerald-700 dark:text-emerald-400 font-mono text-sm">{cleanPermitNo(feature.permitNo)}</span>
                  ) : (
                    <span className="text-rose-700 dark:text-rose-300 font-extrabold flex items-center gap-1.5 leading-relaxed">
                      <AlertTriangle className="w-4 h-4 inline shrink-0 text-rose-600 animate-bounce" />
                      {t('feature.noPermitAlert', '🚨 الأعمال جارية ولا يوجد رقم فسح/تصريح صريح للقطاع (يحتوي على - أو / أو فارغ)')}
                    </span>
                  )}
                </div>
              </div>

              {/* القطر الداخلي / INNERDIAMETER */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('feature.innerDiameter', 'القطر الداخلي (INNERDIAMETER)')}</div>
                <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">{feature.innerDiameter ? `${feature.innerDiameter} ${t('feature.mm', 'مم')}` : '-'}</div>
              </div>

              {/* المنطقة / ZONE */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('feature.zone', 'المنطقة (ZONE)')}</div>
                <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">{translateDynamic(feature.zone || '') || '-'}</div>
              </div>

              {/* نوع الحفر / Drilling type */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('feature.drillingType', 'نوع الحفر (Drilling type)')}</div>
                <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">{translateDynamic(feature.drillingType || '') || '-'}</div>
              </div>

              {/* المقاول / CONTRACTOR */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('feature.contractor', 'المقاول (CONTRACTOR)')}</div>
                <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">{feature.contractor || '-'}</div>
              </div>

              {/* طول القطاع / SHAPE_Length */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('feature.length', 'الطول الميداني (SHAPE_Length)')}</div>
                <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                  {feature.lengthMeters !== undefined ? `${feature.lengthMeters} ${t('dash.meters', 'متر')}` : '-'}
                </div>
              </div>

              {/* اسم المشروع / PROJECTNAME */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/80 sm:col-span-2">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('feature.projectName', 'اسم المشروع (PROJECTNAME)')}</div>
                <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">{feature.kmlProjectName || '-'}</div>
              </div>

              {/* رقم المشروع / PROJECTID */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('feature.projectId', 'رقم المشروع (PROJECTID)')}</div>
                <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">{feature.kmlProjectId || '-'}</div>
              </div>

            </div>
          </div>

          {feature.description && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-bold text-slate-800 dark:text-slate-200">{t('feature.desc', 'ملاحظات الوصف: ')}</span>
              {feature.description}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5"
          >
            <Navigation className="w-3.5 h-3.5" />
            {t('feature.openInMap', 'فتح بالخريطة')}
          </a>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-bold rounded-lg text-xs transition-colors cursor-pointer"
          >
            {t('common.close', 'إغلاق')}
          </button>
        </div>

      </div>
    </div>
  );
};
