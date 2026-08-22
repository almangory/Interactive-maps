/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Project } from '../types';
import { getEmbeddableMapUrl } from '../data/initialProjects';
import { VoiceSearchButton } from './VoiceSearchButton';
import { getWhatsAppLink } from '../utils/whatsapp';

if (typeof window !== 'undefined') {
  (window as any).L = L;
}
import { MyMapsAnalysisPanel } from './MyMapsAnalysisPanel';
import { MapLegend } from './MapLegend';
import { KMLAnalysisResult } from '../types';
import { handleLoadMyMapsLink, generateSyntheticProjectKMLData } from '../utils/myMapsKmlParser';
import { useLanguage } from '../utils/i18n';
import { 
  Map, 
  Maximize2, 
  Minimize2, 
  Shield, 
  AlertCircle, 
  Layers, 
  Info, 
  Check, 
  Sparkles,
  X,
  Save,
  Navigation,
  RefreshCw,
  LogIn,
  LogOut,
  ShieldCheck,
  Edit,
  MapPin,
  CheckCircle2,
  ExternalLink,
  Lock,
  Unlock,
  Share2,
  Globe,
  Search,
  Key,
  BarChart3
} from 'lucide-react';

interface ProjectMapViewerProps {
  project: Project | null;
  projects?: Project[];
  onSelectProject?: (project: Project) => void;
  onEditClick?: (project: Project) => void;
  canEdit: boolean;
  onUpdateProjectCoordinates?: (projectId: number, lat: number, lng: number) => void;
  isAdmin?: boolean;
  canOpenExternalLinks?: boolean;
}

// Robust fallback coordinate resolver to map projects of Riyadh & provinces beautifully
export function getProjectCoordinates(p: Project): { lat: number; lng: number } {
  // 0. Prioritize manually specified x (longitude) and y (latitude) coordinates if available and valid
  const hasY = p.y !== undefined && p.y !== null && p.y !== 0;
  const hasX = p.x !== undefined && p.x !== null && p.x !== 0;
  if (hasY && hasX) {
    const parseFloatY = typeof p.y === 'string' ? parseFloat(p.y) : p.y;
    const parseFloatX = typeof p.x === 'string' ? parseFloat(p.x) : p.x;
    if (!isNaN(parseFloatY) && !isNaN(parseFloatX) && parseFloatY > 10 && parseFloatY < 35 && parseFloatX > 30 && parseFloatX < 60) {
      return { lat: parseFloatY, lng: parseFloatX };
    }
  }

  if (p.mapUrl) {
    try {
      // 1. Try URL object parsing
      const urlObj = new URL(p.mapUrl);
      const ll = urlObj.searchParams.get('ll');
      if (ll) {
        const parts = ll.split(',');
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng) && lat > 15 && lat < 33 && lng > 35 && lng < 55) {
          return { lat, lng };
        }
      }
    } catch (e) {}

    try {
      // 2. Try Regex parsing (handles encoded and custom string formats)
      const decoded = decodeURIComponent(p.mapUrl);
      
      const llMatch = decoded.match(/ll=([0-9.-]+)(?:,|%2C|;)([0-9.-]+)/i);
      if (llMatch) {
        const lat = parseFloat(llMatch[1]);
        const lng = parseFloat(llMatch[2]);
        if (!isNaN(lat) && !isNaN(lng) && lat > 15 && lat < 33 && lng > 35 && lng < 55) {
          return { lat, lng };
        }
      }
      
      const atMatch = decoded.match(/@([0-9.-]+),([0-9.-]+)/);
      if (atMatch) {
        const lat = parseFloat(atMatch[1]);
        const lng = parseFloat(atMatch[2]);
        if (!isNaN(lat) && !isNaN(lng) && lat > 15 && lat < 33 && lng > 35 && lng < 55) {
          return { lat, lng };
        }
      }
    } catch (e) {}
  }

  // Consistent Riyadh coordinates center in Saudi Arabia
  let baseLat = 24.7136;
  let baseLng = 46.6753;

  const reg = p.region ? p.region.trim() : "";
  const bizUnit = p.businessUnit ? p.businessUnit.trim() : "";
  const subProg = p.subProgram ? p.subProgram.trim() : "";

  // Highly precise custom mapping based on Saudi city/provincial center locations:
  if (reg.includes('المجمعة')) {
    baseLat = 25.9015;
    baseLng = 45.3431;
  } else if (reg.includes('الزلفي')) {
    baseLat = 26.3021;
    baseLng = 44.8025;
  } else if (reg.includes('الخرج') || reg.includes('السيح')) {
    baseLat = 24.1500;
    baseLng = 47.3000;
  } else if (reg.includes('الدوادمي') || reg.includes('البجاديه') || reg.includes('نفي') || reg.includes('عرجاء')) {
    baseLat = 24.5077;
    baseLng = 44.3922;
  } else if (reg.includes('عفيف')) {
    baseLat = 23.9067;
    baseLng = 42.9156;
  } else if (reg.includes('رماح')) {
    baseLat = 25.4012;
    baseLng = 47.1654;
  } else if (reg.includes('شقراء') || reg.includes('مرات')) {
    baseLat = 25.2444;
    baseLng = 45.2581;
  } else if (reg.includes('القويعية')) {
    baseLat = 24.0526;
    baseLng = 45.2713;
  } else if (reg.includes('المزاحمية')) {
    baseLat = 24.4811;
    baseLng = 46.2612;
  } else if (reg.includes('ضرما') || reg.includes('ضرماء')) {
    baseLat = 24.6067;
    baseLng = 46.1265;
  } else if (reg.includes('حوطة بني تميم')) {
    baseLat = 23.5242;
    baseLng = 46.8431;
  } else if (reg.includes('الحريق')) {
    baseLat = 23.6331;
    baseLng = 46.5125;
  } else if (reg.includes('وادي الدواسر')) {
    baseLat = 20.4507;
    baseLng = 44.7876;
  } else if (reg.includes('السليل')) {
    baseLat = 20.4612;
    baseLng = 45.5781;
  } else if (reg.includes('الأفلاج')) {
    baseLat = 22.2831;
    baseLng = 46.7285;
  } else if (reg.includes('الغاط')) {
    baseLat = 26.0244;
    baseLng = 44.9612;
  } else if (reg.includes('ثادق')) {
    baseLat = 25.2125;
    baseLng = 45.8812;
  } else if (reg.includes('حريملاء')) {
    baseLat = 25.1278;
    baseLng = 46.1235;
  } else if (reg.includes('شمال الرياض')) {
    baseLat = 24.8125;
    baseLng = 46.6342;
  } else if (reg.includes('جنوب الرياض') || reg.includes('الحائر') || reg.includes('المناخ') || reg.includes('هيت') || reg.includes('بدر')) {
    baseLat = 24.5231;
    baseLng = 46.7321;
  } else if (reg.includes('غرب الرياض') || reg.includes('المهدية') || reg.includes('طويق') || reg.includes('عرقة') || reg.includes('ظهرة لبن') || reg.includes('العوالي')) {
    baseLat = 24.6312;
    baseLng = 46.5122;
  } else if (bizUnit.includes('المحافظات الشمالية') || subProg.includes('المحافظات الشمالية')) {
    baseLat = 25.8825;
    baseLng = 45.3522;
  } else if (bizUnit.includes('المحافظات الجنوبية') || subProg.includes('المحافظات الجنوبية')) {
    baseLat = 22.8211;
    baseLng = 45.6025;
  } else if (bizUnit.includes('المحافظات الغربية') || subProg.includes('المحافظات الغربية')) {
    baseLat = 24.3012;
    baseLng = 45.1022;
  }

  // Consistent stable distribution based on IDs so contiguous items in the same city cluster beautifully without direct stacking
  const idHashFactor = ((p.id * 131) % 1000) / 1000;
  const radius = 0.008 + idHashFactor * 0.022; // spread radius in degrees (highly localized to each city)
  const angle = idHashFactor * 2 * Math.PI;

  return {
    lat: baseLat + Math.sin(angle) * radius,
    lng: baseLng + Math.cos(angle) * radius
  };
}

export function ProjectMapViewer({ 
  project, 
  projects = [], 
  onSelectProject, 
  onEditClick, 
  canEdit,
  onUpdateProjectCoordinates,
  isAdmin = false,
  canOpenExternalLinks = true
}: ProjectMapViewerProps) {
  const { t, language, translateDynamic, isRtl } = useLanguage();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLeafletReady, setIsLeafletReady] = useState(true);
  const [showAutoAnalysisModal, setShowAutoAnalysisModal] = useState(false);
  const [activeAnalysisResult, setActiveAnalysisResult] = useState<KMLAnalysisResult | null>(null);
  const [isAnalyzingMap, setIsAnalyzingMap] = useState<boolean>(false);

  const hasWriteAccess = isAdmin || canEdit;

  // Trigger project analysis on demand
  const runProjectAnalysis = async (p: Project) => {
    if (!p) return;
    setIsAnalyzingMap(true);
    try {
      let res: KMLAnalysisResult;
      if (p.mapUrl) {
        res = await handleLoadMyMapsLink(p.mapUrl, p.name);
      } else {
        res = generateSyntheticProjectKMLData(p.name, p.mapUrl || '');
      }
      setActiveAnalysisResult(res);
    } catch (err) {
      console.warn('Map legend analysis fallback:', err);
      setActiveAnalysisResult(generateSyntheticProjectKMLData(p.name, p.mapUrl || ''));
    } finally {
      setIsAnalyzingMap(false);
    }
  };

  useEffect(() => {
    setActiveAnalysisResult(null);
  }, [project?.id]);

  // Map Lock state to prevent traps when scrolling on mobile.
  // Defaults to unlocked on desktop, but locked on mobile/touch screen for safe scrolling.
  const [isMapUnlocked, setIsMapUnlocked] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024; // screen size lg is generally desktop
    }
    return true;
  });
  
  // Default map view mode:
  // 'osm': OpenStreetMap with interactive vector points (perfect fallback, respects security)
  // 'iframe': Original raw Google map iframe (if project has a valid URL and is not master)
  const [mapMode, setMapMode] = useState<'osm' | 'iframe'>('osm');
  const [isIframeLoading, setIsIframeLoading] = useState(true);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // Live Geographic Inline Editing Mode
  const [isLocationSelectorActive, setIsLocationSelectorActive] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string>('');

  // Refs for tracking interactive click listeners within stale leaflet closures
  const isLocationSelectorActiveRef = useRef(false);
  isLocationSelectorActiveRef.current = isLocationSelectorActive;

  const activeProjectRef = useRef<any>(null);
  activeProjectRef.current = project;

  const projectsRef = useRef<any[]>([]);
  projectsRef.current = projects || [];

  const onSelectProjectRef = useRef<any>(null);
  onSelectProjectRef.current = onSelectProject;

  const setMapModeRef = useRef<any>(null);
  setMapModeRef.current = setMapMode;

  const onMapClickCallbackRef = useRef<(lat: number, lng: number) => void>();
  onMapClickCallbackRef.current = (lat: number, lng: number) => {
    setPendingCoords({ lat, lng });
  };

  const triggerFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(''), 4000);
  };

  // Local/Geographic search states
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isLegendExpanded, setIsLegendExpanded] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [matchingProjects, setMatchingProjects] = useState<Project[]>([]);
  const [searchError, setSearchError] = useState('');
  const [activeSearchMarkerCoords, setActiveSearchMarkerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const searchMarkerRef = useRef<any>(null);

  const clearSearchMarker = () => {
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
      searchMarkerRef.current = null;
    }
    setActiveSearchMarkerCoords(null);
    setSearchResults([]);
    setMatchingProjects([]);
    setSearchQuery('');
    setSearchError('');
  };

  const focusOnCoordinates = (lat: number, lng: number, popupLabel: string, optProject?: Project) => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    // Direct OSM mode if user switches
    setMapMode('osm');

    // Remove any older search marker
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
    }

    map.setView([lat, lng], 14, { animate: true, duration: 1.0 });

    const isEn = language === 'en';
    const dirAttr = isEn ? 'dir="ltr"' : 'dir="rtl"';
    const textAlignClass = isEn ? 'text-left' : 'text-right';

    const popupHtml = `
      <div ${dirAttr} class="${textAlignClass} p-1.5 font-sans min-w-[200px]">
        <div class="flex items-center gap-1.5 mb-1.5 justify-start">
          <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-100">${t('map.searchResultCoords', 'الموقع المحدد للبحث 📍')}</span>
          <span class="px-1.5 py-0.5 rounded text-[8.5px] bg-slate-100 text-slate-600 font-mono">GPS_MATCH</span>
        </div>
        <div class="font-extrabold text-slate-900 text-xs mb-1">${popupLabel}</div>
        <div class="text-[9px] text-slate-400 font-mono flex items-center justify-between bg-slate-50 p-1 rounded mt-2 border border-slate-100">
          <span>Lat: ${lat.toFixed(6)}</span>
          <span class="text-slate-300">|</span>
          <span>Lng: ${lng.toFixed(6)}</span>
        </div>
      </div>
    `;

    // Draw a prominent, beautiful red pulsing circle marker representing the exact geocoded match
    const searchMarkerOptions = {
      radius: 12,
      color: '#DC2626', // Red-600
      fillColor: '#FEE2E2', // Red-100
      weight: 3.5,
      opacity: 1,
      fillOpacity: 0.85,
      className: 'leaflet-active-pulse-glow'
    };

    searchMarkerRef.current = L.circleMarker([lat, lng], searchMarkerOptions)
      .bindPopup(popupHtml, { maxWidth: 260, closeButton: true })
      .addTo(map);

    setActiveSearchMarkerCoords({ lat, lng });

    setTimeout(() => {
      if (searchMarkerRef.current) {
        searchMarkerRef.current.openPopup();
      }
    }, 200);

    // If an associated project exists, select it
    if (optProject && onSelectProject) {
      onSelectProject(optProject);
    }
  };

  const handleMapSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSearchError('');
    setSearchResults([]);
    setMatchingProjects([]);

    const cleanQuery = searchQuery.trim();
    if (!cleanQuery) return;

    // 1. Check if the input contains coordinates (lat, lng) in various formats
    const tryExtractCoords = (text: string) => {
      // Normalise characters: remove degree/minutes symbols, N, E, Lat, Lng, and Arabic direction symbols
      const cleaned = text.replace(/[°'"’“”NnEeSsWw\u0634\u0631\u0642\u0645\u0644\u064a\u062c,;:\/]/g, ' ').trim();
      const numberPattern = /[+-]?\d+(?:\.\d+)?/g;
      const matches = cleaned.match(numberPattern);
      if (matches && matches.length >= 2) {
        const num1 = parseFloat(matches[0]);
        const num2 = parseFloat(matches[1]);
        
        // Saudi Arabia lat/lng bounds (approx 15 to 35 Lat, 30 to 60 Lng)
        if (num1 >= 15 && num1 <= 35 && num2 >= 30 && num2 <= 60) {
          return { lat: num1, lng: num2 };
        }
        if (num2 >= 15 && num2 <= 35 && num1 >= 30 && num1 <= 60) {
          return { lat: num2, lng: num1 };
        }
      }
      return null;
    };

    const parsedCoords = tryExtractCoords(cleanQuery);

    if (parsedCoords) {
      focusOnCoordinates(parsedCoords.lat, parsedCoords.lng, `الإحداثيات المدخلة: ${parsedCoords.lat.toFixed(5)}، ${parsedCoords.lng.toFixed(5)}`);
      triggerFeedback('📍 تم الانتقال للإحداثيات المعطاة على الخريطة مباشرة!');
      return;
    }

    // 2. Local Projects Match
    const normalisedQuery = cleanQuery.toLowerCase();
    const localMatches = (projects || []).filter(p => {
      if (p.id === -1) return false;
      return (
        p.name.toLowerCase().includes(normalisedQuery) ||
        (p.operationalNumber && p.operationalNumber.toLowerCase().includes(normalisedQuery)) ||
        (p.contractor && p.contractor.toLowerCase().includes(normalisedQuery)) ||
        (p.consultant && p.consultant.toLowerCase().includes(normalisedQuery)) ||
        (p.region && p.region.toLowerCase().includes(normalisedQuery))
      );
    });
    
    if (localMatches.length > 0) {
      setMatchingProjects(localMatches);
    }

    // 3. Web Geocoding match using OSM Nominatim free API
    setIsSearching(true);
    try {
      let apiQuery = cleanQuery;
      if (!apiQuery.toLowerCase().includes('رياض') && !apiQuery.toLowerCase().includes('riyadh') && !apiQuery.includes('السعودية')) {
        apiQuery += ', الرياض, السعودية';
      }

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(apiQuery)}&limit=5&accept-language=ar`
      );
      if (!response.ok) {
        throw new Error('فشل جلب البيانات من المزود الخارجي الجغرافي.');
      }
      
      const data = await response.json();
      if (data && data.length > 0) {
        setSearchResults(data);
      } else if (localMatches.length === 0) {
        setSearchError('لم يتم العثور على أي نتائج مطابقة للاسم أو الإحداثيات. يرجى توضيح المعلمات أو المحاولة مجدداً.');
      }
    } catch (err: any) {
      console.error('Nominatim query error:', err);
      if (localMatches.length === 0) {
        setSearchError('عذراً، حدث خطأ أثناء الاتصال بمزود خرائط العنونة. يرجى تكرار المحاولة لاحقاً أو البحث بالإيجاز.');
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleSaveCoordinates = () => {
    if (project && pendingCoords && onUpdateProjectCoordinates) {
      onUpdateProjectCoordinates(project.id, pendingCoords.lat, pendingCoords.lng);
      triggerFeedback(`تم حفظ الموقع الجغرافي الجديد للمشروع [${project.name}] بنجاح!`);
      setPendingCoords(null);
      setIsLocationSelectorActive(false);
    }
  };

  // Automatically reset map mode based on active project selection
  useEffect(() => {
    setIsIframeLoading(true);
    // Keep mapMode on 'osm' first so they see the interactive Leaflet popup card on the map!
    setMapMode('osm');
  }, [project]);

  // Clean search marker on unmount
  useEffect(() => {
    return () => {
      if (searchMarkerRef.current) {
        searchMarkerRef.current.remove();
      }
    };
  }, []);

  // Register global callback for Leaflet popup button click to switch map tab mode dynamically on the same page
  useEffect(() => {
    (window as any).switchToIframeMap = (projectId: number) => {
      const foundProject = (projects || []).find(p => p.id === projectId);
      if (foundProject) {
        if (onSelectProject) {
          onSelectProject(foundProject);
        }
        setMapMode('iframe');
      }
    };
    return () => {
      delete (window as any).switchToIframeMap;
    };
  }, [projects, onSelectProject]);

  // High performance observer to update OpenStreetMap view borders immediately
  useEffect(() => {
    if (!mapContainerRef.current) return;
    
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current && mapMode === 'osm') {
        mapInstanceRef.current.invalidateSize({ animate: false });
      }
    });
    
    resizeObserver.observe(mapContainerRef.current);
    
    // Initial staggered timers to ensure rendering resolves cleanly without flooding tile servers
    const t1 = setTimeout(() => {
      if (mapInstanceRef.current && mapMode === 'osm') {
        mapInstanceRef.current.invalidateSize({ animate: false });
      }
    }, 250);

    const t2 = setTimeout(() => {
      if (mapInstanceRef.current && mapMode === 'osm') {
        mapInstanceRef.current.invalidateSize({ animate: false });
      }
    }, 750);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isLeafletReady, mapMode]);

  // Leaflet is now statically imported and ready
  useEffect(() => {
    setIsLeafletReady(true);
  }, []);

  // Track map state for locking / unlocking dynamically to give smooth mobile pages scroll
  useEffect(() => {
    if (mapInstanceRef.current) {
      const map = mapInstanceRef.current;
      if (isMapUnlocked) {
        if (map.dragging) map.dragging.enable();
        if (map.touchZoom) map.touchZoom.enable();
        if (map.doubleClickZoom) map.doubleClickZoom.enable();
        if (map.scrollWheelZoom) map.scrollWheelZoom.enable();
      } else {
        if (map.dragging) map.dragging.disable();
        if (map.touchZoom) map.touchZoom.disable();
        if (map.doubleClickZoom) map.doubleClickZoom.disable();
        if (map.scrollWheelZoom) map.scrollWheelZoom.disable();
      }
    }
  }, [isMapUnlocked, isLeafletReady, mapMode]);

  // Sync / render open points map
  useEffect(() => {
    if (!isLeafletReady || mapMode !== 'osm' || !mapContainerRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    const isEn = language === 'en';
    const dirAttr = isEn ? 'dir="ltr"' : 'dir="rtl"';
    const textAlignClass = isEn ? 'text-left' : 'text-right';

    // Instantiate map if not loaded
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapContainerRef.current, {
        center: [24.4, 46.4],
        zoom: 7,
        zoomControl: true,
        attributionControl: false,
        tap: !L.Browser.mobile,
        dragging: isMapUnlocked,
        touchZoom: isMapUnlocked,
        doubleClickZoom: isMapUnlocked,
        scrollWheelZoom: isMapUnlocked
      });

      // Add high-performance public OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: ''
      }).addTo(mapInstanceRef.current);

      // Register map click listener for dynamic localization edit
      mapInstanceRef.current.on('click', (e: any) => {
        if (isLocationSelectorActiveRef.current && activeProjectRef.current && activeProjectRef.current.id !== -1) {
          onMapClickCallbackRef.current?.(e.latlng.lat, e.latlng.lng);
        }
      });

      // Listen to popup open to bind handlers cleanly without breaking CSP or throwing Script errors
      mapInstanceRef.current.on('popupopen', (e: any) => {
        const popup = e.popup;
        const container = popup.getElement();
        if (!container) return;
        
        // Find inspect button in the opened popup
        const switchBtn = container.querySelector('.switch-to-iframe-btn');
        if (switchBtn) {
          const id = parseInt(switchBtn.getAttribute('data-project-id') || '', 10);
          switchBtn.onclick = () => {
            const foundProject = projectsRef.current.find(p => p.id === id);
            if (foundProject) {
              if (onSelectProjectRef.current) {
                onSelectProjectRef.current(foundProject);
              }
              if (setMapModeRef.current) {
                setMapModeRef.current('iframe');
              }
            }
          };
        }
        
        const openMapsBtn = container.querySelector('.open-maps-btn');
        if (openMapsBtn) {
          const mapUrl = openMapsBtn.getAttribute('data-map-url') || '';
          openMapsBtn.onclick = () => {
            if (mapUrl) {
              try {
                window.open(mapUrl, '_blank', 'noopener,noreferrer');
              } catch (err) {
                console.error("Popup window.open failed", err);
              }
            }
          };
        }
      });
    }

    const map = mapInstanceRef.current;

    // Trigger instant layout size update to prevent gray/white unrendered areas
    if (map) {
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize({ animate: false });
        }
      }, 50);
    }

    // Clear previous vector project points
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Filter projects based on user permissions (this array is passed pre-filtered from App.tsx)
    const allowedProjects = projects || [];

    // Add circle markers representing the projects
    allowedProjects.forEach(p => {
      if (p.id === -1) return; // Skip master map placeholder

      const { lat, lng } = getProjectCoordinates(p);
      const isSelected = p.id === project?.id;

      // Classify color palette: water (blue) vs. wastewater/sewer (green)
      const textToScan = ((p.scope || '') + ' ' + (p.classification || '') + ' ' + (p.name || '')).toLowerCase();
      const isSewage = textToScan.includes('صرف') || textToScan.includes('بيئية') || textToScan.includes('حمأة') || textToScan.includes('معالجة') || textToScan.includes('مياه معالجة');
      const isWater = !isSewage || textToScan.includes('مياه') || textToScan.includes('شرب') || textToScan.includes('خزانات') || textToScan.includes('خزان');
      
      let strokeColor = '#1d4ed8'; // Default blue-700
      let fillColor = '#3b82f6'; // Default blue-500
      
      if (isSewage) {
        strokeColor = '#15803d'; // green-700
        fillColor = '#22c55e'; // green-500
      }

      const markerOptions = {
        radius: isSelected ? 12 : 7.5,
        color: isSelected ? '#ffffff' : strokeColor,
        fillColor: isSelected ? '#f59e0b' : fillColor,
        weight: isSelected ? 3.5 : 2,
        opacity: 1,
        fillOpacity: isSelected ? 1 : 0.9
      };

      // Clean RTL/LTR styling inside Leaflet popups - made very compact for small mobile screens
      const popupHtml = `
        <div ${dirAttr} class="${textAlignClass} font-sans p-0 flex flex-col gap-1.5 w-[210px] sm:w-[255px] select-none">
          <div class="flex flex-wrap items-center gap-1 mb-0.5 justify-start">
            <span class="px-1.5 py-0.5 rounded text-[8.5px] font-black shadow-3xs ${
              isWater ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }">
              ${translateDynamic(p.scope || '')}
            </span>
            <span class="px-1.5 py-0.5 rounded text-[8.5px] font-black bg-slate-100 text-slate-700 border border-slate-200 shadow-3xs">
              ${translateDynamic(p.classification || '')}
            </span>
            <span class="px-1.5 py-0.5 rounded text-[8.5px] font-black shadow-3xs ${
              (p.status || '').includes('جاري') 
                ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                : (p.status || '').includes('مسحوب')
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }">
              ${translateDynamic(p.status || '')}
            </span>
          </div>
          <h5 class="font-black text-[#0F172A] text-[11.5px] sm:text-[12.5px] leading-tight tracking-tight mb-1 ${textAlignClass} break-words">${p.name}</h5>
          
          <div class="text-[9.5px] text-slate-500 space-y-1 mt-0.5 border-t border-slate-100 pt-1.5 leading-normal">
            <div class="flex justify-between items-start gap-1.5 pb-0.5 border-b border-dashed border-slate-100/60"><strong class="text-slate-400 shrink-0 font-bold">${t('map.opNo')}</strong> <span class="font-mono text-slate-800 font-extrabold text-left break-all select-all">${p.operationalNumber}</span></div>
            <div class="flex justify-between items-start gap-1.5 pb-0.5 border-b border-dashed border-slate-100/60"><strong class="text-slate-400 shrink-0 font-bold">${t('map.contractor')}</strong> <span class="text-slate-800 font-extrabold text-left leading-tight">${p.contractor}</span></div>
            <div class="flex justify-between items-start gap-1.5 pb-0.5 border-b border-dashed border-slate-100/60"><strong class="text-slate-400 shrink-0 font-bold">${t('map.consultant')}</strong> <span class="text-slate-800 font-extrabold text-left leading-tight">${p.consultant}</span></div>
            ${p.surveyorName ? `<div class="flex justify-between items-start gap-1.5 pb-0.5 border-b border-dashed border-slate-100/60"><strong class="text-slate-400 shrink-0 font-bold">${t('map.surveyorName')}</strong> <span class="text-slate-800 font-extrabold text-left leading-tight">${p.surveyorName}</span></div>` : ''}
            ${p.surveyorPhone ? `
              <div class="flex justify-between items-center gap-1.5 pb-0.5 border-b border-dashed border-slate-100/60">
                <strong class="text-slate-400 shrink-0 font-bold">${t('map.surveyorPhone')}</strong>
                <a href="${getWhatsAppLink(p.surveyorPhone, p.name, p.operationalNumber)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-emerald-600 font-extrabold font-mono hover:underline bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200" style="text-decoration:none;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="#059669" stroke="none"><path d="M12.031 2c-5.514 0-9.998 4.485-9.998 9.999 0 1.944.557 3.754 1.522 5.295l-1.555 5.706 5.86-1.537c1.472.846 3.179 1.335 4.996 1.335 5.514 0 9.998-4.485 9.998-9.999 0-5.514-4.484-9.999-9.998-9.999zm4.444 14.129c-.279.785-1.427 1.442-1.956 1.488-.507.043-1.166.195-3.832-.888-3.033-1.233-4.949-4.322-5.099-4.522-.15-.2-1.222-1.628-1.222-3.102 0-1.474.772-2.197 1.047-2.493.275-.296.598-.37.797-.37.2 0 .4.002.573.011.183.01.428-.069.67.51.246.589.843 2.059.917 2.208.074.15.123.324.025.523-.099.199-.15.324-.298.498-.148.174-.312.389-.446.523-.148.148-.302.31-.13.606.172.296.766 1.264 1.643 2.046 1.127 1.004 2.077 1.316 2.373 1.464.296.148.47.123.644-.075.174-.199.746-.869.944-1.168.198-.298.396-.248.669-.148.273.099 1.734.818 2.031.966.297.148.495.223.568.347.074.124.074.717-.205 1.502z"/></svg>
                  <span dir="ltr">${p.surveyorPhone}</span>
                </a>
              </div>
            ` : ''}
            <div class="flex justify-between items-start gap-1.5"><strong class="text-slate-400 shrink-0 font-bold">${t('map.region')}</strong> <span class="text-slate-800 font-extrabold text-left">${translateDynamic(p.region || '')}</span></div>
          </div>
          
          <div class="mt-2 pt-1.5 border-t border-slate-100 flex flex-col gap-1">
            <button 
              type="button"
              data-project-id="${p.id}"
              class="switch-to-iframe-btn flex items-center justify-center gap-1 w-full bg-blue-600 hover:bg-blue-500 text-white text-[9.5px] py-1.5 px-2 rounded-lg shadow-xs transition-all text-center cursor-pointer font-black border-0"
              style="text-decoration: none; color: white !important;"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left:2px;"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
              ${t('map.viewAndDetails')}
            </button>
            ${canOpenExternalLinks ? `
            <button 
              type="button"
              data-map-url="${p.mapUrl || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}"
              class="open-maps-btn flex items-center justify-center gap-1 w-full bg-slate-100 hover:bg-slate-200 text-slate-850 text-[9.5px] py-1 px-2 rounded-lg border border-slate-200 transition-all text-center cursor-pointer font-extrabold shadow-3xs"
              style="text-decoration: none;"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left:2px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              ${t('map.openInGoogleMaps')}
            </button>
            ` : ''}
          </div>
        </div>
      `;

      const marker = L.circleMarker([lat, lng], markerOptions)
        .bindPopup(popupHtml, { 
          maxWidth: 260, 
          minWidth: 210, 
          closeButton: false,
          autoPan: true,
          autoPanPadding: [12, 110]
        })
        .addTo(map);

      // Bind interactive click handler so users click on markers to sync sidebar/app details immediately!
      marker.on('click', () => {
        if (onSelectProject) {
          onSelectProject(p);
        }
      });

      markersRef.current.push(marker);

      if (isSelected) {
        setTimeout(() => {
          marker.openPopup();
        }, 120);
      }
    });

    // Draw proposed new location marker if in editing mode and click occurred
    if (pendingCoords) {
      const previewMarkerOptions = {
        radius: 12,
        color: '#EA580C', // Deep Orange border
        fillColor: '#FFEDD5', // Very light orange/cream fill
        weight: 3.5,
        opacity: 1,
        fillOpacity: 0.85,
        className: 'leaflet-active-pulse-glow'
      };

      const previewPopupHtml = `
        <div ${dirAttr} class="${textAlignClass} font-sans p-1.5 min-w-[200px]">
          <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-700 border border-orange-200">
            ${t('map.clickedLocation')}
          </span>
          <h5 class="font-extrabold text-slate-900 text-xs mt-1.5 leading-snug mb-1">${t('map.tempGeoEdit')}</h5>
          <p class="text-[10px] text-slate-500 leading-relaxed mb-2">${t('map.saveCoordsInstruction')}</p>
          <div class="text-[9px] text-slate-500 font-mono space-y-0.5 mt-2 border-t border-slate-100 pt-1.5">
            <div>${t('map.latitude')} <strong class="text-slate-800">${pendingCoords.lat.toFixed(6)}</strong></div>
            <div>${t('map.longitude')} <strong class="text-slate-800">${pendingCoords.lng.toFixed(6)}</strong></div>
          </div>
        </div>
      `;

      const previewMarker = L.circleMarker([pendingCoords.lat, pendingCoords.lng], previewMarkerOptions)
        .bindPopup(previewPopupHtml, { maxWidth: 220, closeButton: false })
        .addTo(map);

      markersRef.current.push(previewMarker);
      setTimeout(() => {
        previewMarker.openPopup();
      }, 100);

      // Focus map viewport on the newly selected point
      map.setView([pendingCoords.lat, pendingCoords.lng], 14, { animate: true });
    } else {
      // Handle view zooming and camera bounds
      if (project && project.id !== -1) {
        // Focus on selected project
        const { lat, lng } = getProjectCoordinates(project);
        map.setView([lat, lng], 13, { animate: true, duration: 0.8 });
      } else {
        // Master view: Center perfectly on the Central Sector [القطاع الأوسط] as shown in the picture
        map.setView([24.4, 46.4], 7, { animate: true });
      }
    }

  }, [isLeafletReady, project, projects, mapMode, pendingCoords]);

  // Clean map instance on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Handle traditional embedded google custom url if user toggled and URL exists
  // Fallback to coordinates on google maps if mapUrl is not defined.
  const embedUrl = project
    ? (project.mapUrl
        ? getEmbeddableMapUrl(project.mapUrl)
        : `https://maps.google.com/maps?q=${getProjectCoordinates(project).lat},${getProjectCoordinates(project).lng}&z=15&output=embed`)
    : null;
  const isMasterMap = !project; // If no project is selected, treat it as the general overview map

  return (
    <div 
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col transition-all duration-300 ${
        isFullscreen ? 'fixed inset-4 z-50 shadow-2xl bg-white dark:bg-slate-900' : 'relative z-10 h-[620px]'
      }`}
    >
      <style>{`
        .leaflet-container {
          font-family: inherit;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 18px !important;
          border: 2px solid #94A3B8 !important; /* Elegant high-contrast border representing premium card container */
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1) !important;
          padding: 0 !important;
          background: #FFFFFF !important;
        }
        .leaflet-popup-content {
          margin: 14px 16px !important;
          width: auto !important;
        }
        .leaflet-popup-tip {
          background: #FFFFFF !important;
          border: 1px solid #94A3B8 !important;
          box-shadow: none !important;
        }
        .leaflet-popup-tip-container {
          display: block;
        }
        .leaflet-active-pulse-glow {
          filter: drop-shadow(0 0 8px #6366f1);
          animation: mapPulseGlow 2s infinite alternate;
        }
        @keyframes mapPulseGlow {
          0% { stroke-width: 3px; fill-opacity: 0.8; }
          100% { stroke-width: 5px; fill-opacity: 1.0; }
        }
        @media (max-width: 639px) {
          .leaflet-top.leaflet-left {
            top: auto !important;
            bottom: 124px !important;
            left: 12px !important;
          }
        }
      `}</style>

      {/* Header Panel */}
      <div className="bg-[#1E293B] text-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/60 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 polish-dot-grid pointer-events-none"></div>
        <div className="flex items-center gap-3 relative z-10 min-w-0">
          <div className="p-2 bg-slate-800 rounded-lg text-blue-400 shrink-0">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className={`text-[10px] leading-[21px] font-bold truncate max-w-[210px] sm:max-w-xs md:max-w-md ${isRtl ? 'text-right' : 'text-left'}`} title={project?.name || t('map.interactiveMap')}>
                {project?.name || t('map.interactiveMap')}
              </h4>
            </div>
          </div>
        </div>

        {/* View mode toggle and full-screen switch */}
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 self-stretch sm:self-auto relative z-10 shrink-0 md:grow-0 justify-end w-full sm:w-auto mt-2 sm:mt-0 select-none">
          {!isMasterMap && project && (
            <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-700/60 shrink-0 shadow-xs">
              <button
                type="button"
                onClick={() => setMapMode('osm')}
                className={`px-1.5 py-1 text-[9px] sm:text-[11px] font-bold rounded transition-all cursor-pointer ${
                  mapMode === 'osm'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
                title={t('map.pointsMap')}
              >
                {t('map.pointsMap')}
              </button>
              <button
                type="button"
                onClick={() => setMapMode('iframe')}
                className={`px-1.5 py-1 text-[9px] sm:text-[11px] font-bold rounded transition-all cursor-pointer ${
                  mapMode === 'iframe'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
                title={t('map.googleMap')}
              >
                {t('map.googleMap')}
              </button>
            </div>
          )}

          {hasWriteAccess && onEditClick && !isMasterMap && project && (
            <button
              onClick={() => onEditClick(project)}
              className="flex items-center gap-1 p-1 px-1.5 sm:px-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-[9px] sm:text-xs font-bold transition-all text-white cursor-pointer shrink-0 shadow-xs"
              title={t('map.edit')}
            >
              <Edit className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0 text-blue-200" />
              <span>{t('map.edit')}</span>
            </button>
          )}

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? t('map.minimize') : t('map.fullscreen')}
            className="p-1 sm:p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors text-slate-300 hover:text-white cursor-pointer shrink-0 flex items-center justify-center animate-pulse-once"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Security and authorization info banners */}

      {/* local notification toast inside map panel */}
      {feedbackMessage && (
        <div className="bg-emerald-600 text-white text-xs px-4 py-2 text-center font-bold animate-in slide-in-from-top duration-300 flex items-center justify-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Google My Maps interactive URL banner */}
      {!isMasterMap && project && (
        <div className="bg-blue-50 dark:bg-slate-800/80 border-b border-blue-100 dark:border-slate-700 px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-blue-900 dark:text-blue-200 gap-2 font-medium">
          <div className={`flex items-center gap-2 ${isRtl ? 'text-right' : 'text-left'} min-w-0 flex-1`}>
            <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="font-bold text-blue-800 dark:text-blue-300 shrink-0">{t('map.previewDetails')}</span>
            <span className="text-slate-600 dark:text-slate-300 text-[11px] font-bold truncate">
              {project.name}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 self-auto block flex-wrap">
            <button
              type="button"
              onClick={() => setShowAutoAnalysisModal(true)}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-black transition-all text-[10px] cursor-pointer shadow-xs flex items-center gap-1 shrink-0 active:scale-95"
              title={t('map.autoAnalysisUnit')}
            >
              <BarChart3 className="h-3 w-3" />
              <span>{t('map.autoAnalysisUnit')}</span>
            </button>

            {canOpenExternalLinks !== false && project.mapUrl && (
              <a
                href={project.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-1 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-slate-700 rounded-lg font-bold transition-all text-[10px] inline-flex items-center gap-1 cursor-pointer"
              >
                <span>{t('map.openAndNavigate')}</span>
              </a>
            )}
            {project.mapUrl && (mapMode !== 'iframe' ? (
              <button
                onClick={() => setMapMode('iframe')}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-extrabold transition-all text-[10px] cursor-pointer shadow-xs"
              >
                {t('map.enablePreview')}
              </button>
            ) : (
              <span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg font-bold text-[10px] flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                {t('map.previewActive')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Map body */}
      <div className="flex-1 bg-slate-100 relative min-h-0">
        {/* Floating map search bar panel */}
        {isLeafletReady && mapMode === 'osm' && (
          <div className={`absolute top-3 ${isRtl ? 'right-3 text-right' : 'left-14 text-left'} z-[1001] font-sans`}>
            {!isSearchExpanded ? (
              <button
                type="button"
                onClick={() => setIsSearchExpanded(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-slate-50 text-blue-600 font-black text-xs rounded-xl border border-slate-200/80 shadow-lg cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                dir={isRtl ? 'rtl' : 'ltr'}
              >
                <Search className="h-4 w-4 text-blue-500 shrink-0" />
                <span>{t('map.search')}</span>
              </button>
            ) : (
              <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col w-[290px] sm:w-[350px] max-w-[calc(100vw-32px)] transition-all duration-300">
                <form onSubmit={handleMapSearch} className="flex items-center gap-1.5 p-2 bg-slate-50 border-b border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSearchExpanded(false);
                      clearSearchMarker();
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 shrink-0 cursor-pointer border-0"
                    title={t('map.closeSearch')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="relative flex-1 min-w-0">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('map.searchPlaceholder')}
                      className={`w-full ${isRtl ? 'text-right pr-2.5 pl-14' : 'text-left pl-2.5 pr-14'} text-xs py-2 bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800 font-bold placeholder-slate-400`}
                      dir={isRtl ? 'rtl' : 'ltr'}
                    />
                    <div className={`absolute ${isRtl ? 'left-1.5' : 'right-1.5'} top-1/2 -translate-y-1/2 flex items-center gap-1`}>
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={clearSearchMarker}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer transition-colors"
                          title={t('map.clearSearch')}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                      <VoiceSearchButton
                        size="sm"
                        onSpeechResult={(text) => setSearchQuery(text)}
                        placeholderHint={t('map.voicePlaceholder')}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white text-xs font-black rounded-lg cursor-pointer shrink-0 transition-colors shadow-xs flex items-center justify-center gap-1 border-0"
                  >
                    {isSearching ? (
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                      <span>{t('map.searchSubmit')}</span>
                    )}
                  </button>
                </form>

                {/* Quick interactive search guide tip */}
                <div className="px-3 py-1.5 bg-blue-500/5 text-[9.5px] text-slate-500 font-bold border-b border-slate-100/80 flex items-center justify-between select-none">
                  <span className="text-blue-700">{t('map.searchTip')}</span>
                  <span className="text-slate-600"> {t('map.searchTipExample')}</span>
                </div>

              {/* Error indicator */}
              {searchError && (
                <div className="p-2.5 px-3 bg-rose-50 border-b border-rose-100 text-[10px] text-rose-700 font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  <p className={`flex-1 leading-normal ${isRtl ? 'text-right' : 'text-left'}`}>{searchError}</p>
                </div>
              )}

              {/* Quick info if active search marker */}
              {activeSearchMarkerCoords && !searchResults.length && !matchingProjects.length && !searchError && (
                <div className="p-2 px-3 bg-purple-50 text-[10px] text-purple-700 font-bold flex items-center justify-between">
                  <span>{t('map.searchResultCoords')}</span>
                  <button 
                    type="button" 
                    onClick={clearSearchMarker} 
                    className="text-purple-900 underline font-bold cursor-pointer hover:text-purple-950 border-0 bg-transparent text-[10px]"
                  >
                    {t('map.cancelSelection')}
                  </button>
                </div>
              )}

              {/* Local projects matched results */}
              {matchingProjects.length > 0 && (
                <div className="flex flex-col max-h-[145px] overflow-y-auto divide-y divide-slate-100 border-b border-slate-105">
                  <div className={`p-1 px-2.5 bg-blue-50 text-[9.5px] font-black text-blue-800 ${isRtl ? 'text-right' : 'text-left'}`}>
                    {t('map.localMatches')} ({matchingProjects.length})
                  </div>
                  {matchingProjects.map((proj) => (
                    <button
                      key={`local-search-${proj.id}`}
                      type="button"
                      onClick={() => {
                        const { lat, lng } = getProjectCoordinates(proj);
                        focusOnCoordinates(lat, lng, proj.name, proj);
                      }}
                      className={`p-2 px-3 ${isRtl ? 'text-right' : 'text-left'} hover:bg-[#F8FAFC] transition-colors flex flex-col w-full text-xs font-semibold text-slate-705 cursor-pointer border-0 bg-transparent`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`truncate text-[11px] leading-tight ${isRtl ? 'text-right' : 'text-left'} flex-1 text-slate-800 font-extrabold`}>{proj.name}</span>
                        <span className="text-[8.5px] shrink-0 font-bold px-1.5 bg-blue-100 text-blue-700 rounded-sm mx-2">{translateDynamic(proj.classification || '')}</span>
                      </div>
                      <span className={`text-[9.5px] text-slate-400 font-bold mt-1 ${isRtl ? 'text-right' : 'text-left'}`}>
                        {t('list.region')}: {translateDynamic(proj.region || '')} | {translateDynamic(proj.scope || '')}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Nominatim dynamic Geocoding API results */}
              {searchResults.length > 0 && (
                <div className="flex flex-col max-h-[165px] overflow-y-auto divide-y divide-slate-100">
                  <div className={`p-1 px-2.5 bg-emerald-50 text-[9.5px] font-black text-emerald-800 ${isRtl ? 'text-right' : 'text-left'}`}>
                    {t('map.geocodingMatches')} ({searchResults.length})
                  </div>
                  {searchResults.map((result: any, idx: number) => (
                    <button
                      key={`geo-search-${idx}`}
                      type="button"
                      onClick={() => {
                        const lat = parseFloat(result.lat);
                        const lng = parseFloat(result.lon);
                        focusOnCoordinates(lat, lng, result.display_name.split(',')[0] || searchQuery);
                      }}
                      className={`p-2 px-3 ${isRtl ? 'text-right' : 'text-left'} hover:bg-[#F8FAFC] transition-colors flex items-start gap-2 w-full text-xs text-slate-700 cursor-pointer border-0 bg-transparent`}
                    >
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className={`font-extrabold truncate text-[11px] text-slate-800 ${isRtl ? 'text-right' : 'text-left'} leading-tight`}>
                          {result.display_name.split(',')[0]}
                        </p>
                        <p className={`text-[9.5px] text-slate-400 truncate ${isRtl ? 'text-right' : 'text-left'} font-medium leading-none mt-1`}>
                          {result.display_name.split(',').slice(1, 4).join(', ')}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
        )}

        {/* Floating map lock helper overlay for perfect page scrolling on mobile/touch screens */}
        {isLeafletReady && mapMode === 'osm' && (
          <div className="absolute top-[90px] left-3 z-[1000] flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setIsMapUnlocked(!isMapUnlocked)}
              title={isMapUnlocked ? t('map.lockScroll') : t('map.unlockScroll')}
              className={`w-10 h-10 rounded-xl shadow-lg border flex items-center justify-center cursor-pointer select-none transition-all active:scale-95 relative ${
                isMapUnlocked
                  ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700 hover:scale-[1.05]'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:scale-[1.05]'
              }`}
            >
              {/* Pulsing Alert Beacon */}
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isMapUnlocked ? 'bg-emerald-400' : 'bg-rose-400'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
                  isMapUnlocked ? 'bg-emerald-500' : 'bg-rose-500'
                }`}></span>
              </span>

              {isMapUnlocked ? (
                <Unlock className="h-5 w-5 shrink-0" />
              ) : (
                <Lock className="h-5 w-5 shrink-0 text-rose-600 animate-pulse" />
              )}
            </button>
          </div>
        )}

        {/* OpenStreetMap dynamic container */}
        <div 
          ref={mapContainerRef} 
          className={`w-full h-full ${mapMode === 'osm' ? 'block' : 'hidden'}`}
          style={{ minHeight: '100%' }}
        />

        {/* Floating map classification legend block - Docked cleanly at the bottom corner */}
        {isLeafletReady && mapMode === 'osm' && (
          <div className={`absolute bottom-1.5 ${isRtl ? 'right-1.5' : 'left-1.5'} z-[1000] max-w-[calc(100%-12px)] sm:max-w-[390px] max-h-[calc(100%-12px)] select-none`} dir={isRtl ? 'rtl' : 'ltr'}>
            {!isLegendExpanded ? (
              <button
                type="button"
                onClick={() => {
                  setIsLegendExpanded(true);
                  if (!activeAnalysisResult && project) {
                    runProjectAnalysis(project);
                  }
                }}
                title={t('legend.title')}
                className="px-3.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 shadow-md flex items-center gap-2 text-blue-600 dark:text-blue-400 transition-all active:scale-95 hover:scale-102 cursor-pointer font-extrabold text-xs"
              >
                <Key className="h-4 w-4 text-amber-500 animate-pulse" />
                <span>{t('map.legendButton')}</span>
                {activeAnalysisResult && (
                  <span className="text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-mono font-bold px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                    {activeAnalysisResult.totalLengthKm} {t('dash.km')}
                  </span>
                )}
              </button>
            ) : (
              <MapLegend
                analysisResult={activeAnalysisResult}
                projectName={project?.name}
                onRunAnalysis={project ? () => runProjectAnalysis(project) : undefined}
                isLoading={isAnalyzingMap}
                compact={true}
                isCollapsible={true}
                defaultExpanded={true}
                onClose={() => setIsLegendExpanded(false)}
              />
            )}
          </div>
        )}

        {/* Traditional Iframe viewer fallback if chosen */}
        {mapMode === 'iframe' && (
          embedUrl ? (
            <div className="w-full h-full relative overflow-hidden bg-slate-900">
              {isIframeLoading && (
                <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-center p-6 z-20 transition-all duration-300">
                  <div className="relative flex items-center justify-center mb-4">
                    <div className="w-16 h-16 rounded-full border-4 border-slate-700 border-t-blue-500 animate-spin"></div>
                    <div className="w-10 h-10 rounded-full border-4 border-slate-705 border-t-emerald-500 animate-spin absolute" style={{ animationDirection: 'reverse', animationDuration: '1.2s' }}></div>
                  </div>
                  <h4 className="text-sm font-extrabold text-white mb-1.5">{t('map.fetchingIframe')}</h4>
                  <p className="text-[11px] text-slate-400 max-w-sm leading-relaxed">
                    {t('map.processing')}
                  </p>
                </div>
              )}
              {/* Visual Crop overlay covering the top and bottom: The top header is pushed up by -56px, and the bottom footer is pushed down by 40px and hidden by overflow-hidden */}
              <iframe
                key={project.id}
                src={embedUrl}
                title={project.name}
                className="absolute left-0 w-full border-0 z-0"
                style={{
                  top: '-56px',
                  height: 'calc(100% + 56px + 40px)'
                }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer"
                onLoad={() => setIsIframeLoading(false)}
              ></iframe>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-50 space-y-3">
              <AlertCircle className="h-10 w-10 text-slate-400" />
              <div className="space-y-1 max-w-xs">
                <h5 className="font-bold text-slate-700 text-sm">{t('map.noExternalLink')}</h5>
                <p className="text-xs text-slate-500">
                  {t('map.noExternalLinkDesc')}
                </p>
              </div>
            </div>
          )
        )}

        {/* If Leaflet library is loading / script injection is pending */}
        {!isLeafletReady && mapMode === 'osm' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-20">
            <div className="text-center space-y-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-500 font-bold">{t('map.loadingTiles')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer statistics and metadata indicators */}
      <div className="bg-slate-50 p-3.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2 font-medium">
        {!isMasterMap ? (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">
              {t('map.supervisingConsultant')}
            </span>
            <span className="text-slate-600 truncate max-w-[200px]">
              {project?.consultant}
            </span>
          </div>
        ) : (
          <div />
        )}
        
        {isMasterMap ? (
          <div className="flex items-center gap-1.5 text-blue-700 font-bold text-[11px] bg-blue-50 border border-blue-100 px-3 py-1 rounded-lg">
            <Sparkles className="h-3.5 w-3.5 animate-pulse text-indigo-600" />
            <span>{t('dash.accordingToPerms')}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            <span>{t('map.classification')} {translateDynamic(project?.classification || '')}</span>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <span>{t('map.status')} <span className="text-emerald-700 font-bold">{translateDynamic(project?.status || '')}</span></span>
          </div>
        )}
      </div>

      {/* Auto Analysis Modal */}
      {showAutoAnalysisModal && project && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className={`bg-white dark:bg-slate-900 rounded-3xl max-w-5xl w-full max-h-[92vh] overflow-y-auto border border-slate-200 dark:border-slate-800 shadow-2xl p-4 sm:p-6 ${isRtl ? 'text-right' : 'text-left'} font-sans relative`} dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-2xl shadow-md shrink-0">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    {t('map.autoAnalysisTitle')}
                    <Sparkles className="h-4 w-4 text-amber-500 animate-pulse" />
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('map.projectLabel')} <span className="font-bold text-blue-600 dark:text-blue-400">{project.name}</span> ({project.operationalNumber || project.id}) • {t('map.autoAnalysisDesc')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAutoAnalysisModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <MyMapsAnalysisPanel
              projects={projects.length > 0 ? projects : [project]}
              selectedProject={project}
              onSelectProject={onSelectProject}
            />
          </div>
        </div>
      )}
    </div>
  );
}
