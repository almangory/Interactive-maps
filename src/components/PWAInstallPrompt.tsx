import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  Download, 
  Share, 
  PlusSquare, 
  CheckCircle2, 
  X, 
  Sparkles, 
  Monitor, 
  ArrowLeft, 
  Info, 
  ExternalLink,
  MapPin,
  Laptop
} from 'lucide-react';
import appLogoImg from '../assets/images/app_icon_1786272093633.jpg';

interface InstallPwaModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: 'ar' | 'en';
  deferredPrompt: any;
  setDeferredPrompt: (prompt: any) => void;
  isStandalone: boolean;
}

const isInIframe = () => {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
};

export const InstallPwaModal: React.FC<InstallPwaModalProps> = ({
  isOpen,
  onClose,
  lang = 'ar',
  deferredPrompt,
  setDeferredPrompt,
  isStandalone
}) => {
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const userAgent = String(window.navigator.userAgent || '').toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const androidDevice = /android/.test(userAgent);
    setIsIOS(iosDevice);
    setIsAndroid(androidDevice);
  }, []);

  const handleInstallClick = async () => {
    // If inside iframe, open in new top-level browser tab
    if (isInIframe()) {
      window.open(window.location.href, '_blank', 'noopener,noreferrer');
      return;
    }

    const promptEvent = deferredPrompt || (window as any).deferredPWAInstallPrompt;

    if (promptEvent) {
      try {
        setInstalling(true);
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        if (outcome === 'accepted') {
          setInstalledSuccess(true);
          setDeferredPrompt(null);
          (window as any).deferredPWAInstallPrompt = null;
          localStorage.setItem('nwc_pwa_installed', 'true');
        }
      } catch (err) {
        console.error('Error triggering PWA prompt:', err);
      } finally {
        setInstalling(false);
      }
    } else {
      // If promptEvent not ready, attempt fallback open or guide
      if (isInIframe()) {
        window.open(window.location.href, '_blank', 'noopener,noreferrer');
      }
    }
  };

  if (!isOpen) return null;

  const isAr = lang === 'ar';

  return (
    <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-[#0e3f53] border border-white/10 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-black/20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shadow-inner">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">
                {isAr ? 'تثبيت تطبيق الخرائط التفاعلية GeoGIS' : 'Install GeoGIS Interactive Maps'}
              </h2>
              <p className="text-xs text-white/60 font-bold mt-0.5">
                {isAr ? 'احصل على تجربة تطبيق هاتف متكاملة وملء الشاشة' : 'Get a full-screen native mobile application experience'}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-white/60 hover:bg-red-500/20 hover:text-red-400 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 max-h-[80vh] custom-scrollbar">
          
          {/* App Badge Card */}
          <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/10 p-5 rounded-2xl flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#0b2d3d] border border-cyan-400/40 flex items-center justify-center shrink-0 shadow-lg overflow-hidden">
              {!imgError ? (
                <img 
                  src={appLogoImg} 
                  alt="الخرائط التفاعلية" 
                  className="w-full h-full object-cover" 
                  onError={() => setImgError(true)} 
                />
              ) : (
                <MapPin className="w-7 h-7 text-cyan-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-white">الخرائط التفاعلية</span>
                <span className="px-2 py-0.5 bg-cyan-400/20 text-cyan-300 text-[10px] font-black rounded-full border border-cyan-400/30">
                  {isAr ? 'تطبيق ويب تقدمي PWA' : 'PWA App'}
                </span>
              </div>
              <p className="text-xs text-white/70 font-medium mt-1 leading-relaxed">
                {isAr ? 'يعمل على أجهزة iPhone و Android و Windows بدون الحاجة للمتجر.' : 'Works on iPhone, iPad, Android & PC without app store installation.'}
              </p>
            </div>
          </div>

          {/* If inside iframe note */}
          {isInIframe() && (
            <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex items-start gap-3 text-amber-200 text-xs leading-relaxed">
              <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-1">تنبيه المعاينة:</p>
                <p>أنت تتصفح الموقع داخل المعاينة. لتثبيت التطبيق بآيقونة مستقيمة، اضغط الزر أدناه للفتح بتبويب مستقل ثم اضغط تثبيت.</p>
                <button
                  type="button"
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="mt-2 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <span>فتح الرابط بتبويب جديد للتثبيت</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* If already installed / standalone */}
          {isStandalone || installedSuccess ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-5 rounded-2xl text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <h3 className="text-base font-black text-emerald-300">
                {isAr ? 'التطبيق مثبت بالفعل على جهازك!' : 'App is already installed on your device!'}
              </h3>
              <p className="text-xs text-white/80 font-medium leading-relaxed">
                {isAr 
                  ? 'تم تثبيت نظام الخرائط بنجاح على الشاشة الرئيسية للجوال أو سطح المكتب. يمكنك فتحه مباشرة من أيقونة التطبيقات.'
                  : 'GeoGIS Interactive Maps is successfully installed on your home screen. You can launch it directly from your apps grid.'}
              </p>
            </div>
          ) : (
            <>
              {/* Direct One-Click Install Button (if browser supports beforeinstallprompt or prompt ready) */}
              {(deferredPrompt || (window as any).deferredPWAInstallPrompt) && (
                <div className="bg-cyan-400/10 border border-cyan-400/30 p-5 rounded-2xl text-center space-y-3">
                  <div className="flex items-center justify-center gap-2 text-cyan-300 font-black text-sm">
                    <Sparkles className="w-5 h-5 animate-pulse text-amber-300" />
                    <span>{isAr ? 'تثبيت مباشر بضغطة زر واحدة' : 'One-Click Instant Install Available'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    disabled={installing}
                    className="w-full py-3.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-sm rounded-xl transition-all shadow-xl flex items-center justify-center gap-2.5 transform active:scale-98 cursor-pointer"
                  >
                    <Download className="w-5 h-5 text-slate-950" />
                    <span>{installing ? (isAr ? 'جاري التثبيت...' : 'Installing...') : (isAr ? 'اضغط هنا لتثبيت التطبيق الآن' : 'Click Here to Install App Now')}</span>
                  </button>
                </div>
              )}

              {/* iOS Safari Instructions */}
              {(isIOS || (!deferredPrompt && !(window as any).deferredPWAInstallPrompt && !isAndroid)) && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-cyan-300 font-black text-xs uppercase tracking-wider">
                    <Smartphone className="w-4 h-4" />
                    <span>{isAr ? 'طريقة التثبيت على أجهزة آيفون وآيباد (iOS Safari):' : 'Installation Steps for iPhone & iPad (iOS Safari):'}</span>
                  </div>

                  <div className="space-y-2.5 bg-black/20 p-4 rounded-2xl border border-white/5">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-cyan-400/20 text-cyan-300 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">1</div>
                      <p className="text-xs text-white/90 font-bold leading-relaxed">
                        {isAr ? (
                          <>اضغط على زر المشاركة <Share className="w-4 h-4 text-cyan-300 inline-block mx-1" /> في الشريط السفلي لمتصفح Safari.</>
                        ) : (
                          <>Tap the Share button <Share className="w-4 h-4 text-cyan-300 inline-block mx-1" /> in Safari’s bottom toolbar.</>
                        )}
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-cyan-400/20 text-cyan-300 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">2</div>
                      <p className="text-xs text-white/90 font-bold leading-relaxed">
                        {isAr ? (
                          <>مرر القائمة لأسفل واضغط على <span className="text-cyan-300 underline font-black">"إضافة إلى الشاشة الرئيسية"</span> (Add to Home Screen) <PlusSquare className="w-4 h-4 text-cyan-300 inline-block mx-1" />.</>
                        ) : (
                          <>Scroll down and tap <span className="text-cyan-300 underline font-black">"Add to Home Screen"</span> <PlusSquare className="w-4 h-4 text-cyan-300 inline-block mx-1" />.</>
                        )}
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-cyan-400/20 text-cyan-300 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">3</div>
                      <p className="text-xs text-white/90 font-bold leading-relaxed">
                        {isAr ? (
                          <>اضغط على كلمة <span className="text-cyan-300 font-black">"إضافة"</span> (Add) في الزاوية العلوية لتأكيد التثبيت.</>
                        ) : (
                          <>Tap <span className="text-cyan-300 font-black">"Add"</span> in the top right corner to complete installation.</>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Android Chrome Instructions */}
              {(isAndroid || (!deferredPrompt && !(window as any).deferredPWAInstallPrompt && !isIOS)) && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-cyan-300 font-black text-xs uppercase tracking-wider">
                    <Smartphone className="w-4 h-4" />
                    <span>{isAr ? 'طريقة التثبيت على أندرويد متصفح Chrome / Edge / الكمبيوتر:' : 'Installation Steps for Android / PC Chrome:'}</span>
                  </div>

                  <div className="space-y-2.5 bg-black/20 p-4 rounded-2xl border border-white/5">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-cyan-400/20 text-cyan-300 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">1</div>
                      <p className="text-xs text-white/90 font-bold leading-relaxed">
                        {isAr ? (
                          <>اضغط على قائمة الخيارات (النقاط الثلاث ⋮) في أعلى المتصفح أو زر التثبيت (⊕) بشريط العنوان.</>
                        ) : (
                          <>Tap the menu icon (three dots ⋮) or Install icon in Chrome address bar.</>
                        )}
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-cyan-400/20 text-cyan-300 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">2</div>
                      <p className="text-xs text-white/90 font-bold leading-relaxed">
                        {isAr ? (
                          <>اختر <span className="text-cyan-300 font-black">"تثبيت التطبيق"</span> (Install app) أو <span className="text-cyan-300 font-black">"إضافة إلى الشاشة الرئيسية"</span>.</>
                        ) : (
                          <>Select <span className="text-cyan-300 font-black">"Install App"</span> or <span className="text-cyan-300 font-black">"Add to Home Screen"</span>.</>
                        )}
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-cyan-400/20 text-cyan-300 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">3</div>
                      <p className="text-xs text-white/90 font-bold leading-relaxed">
                        {isAr ? 'تأكد من الضغط على "تثبيت" وسيظهر التطبيق مباشرة في قائمة تطبيقاتك.' : 'Confirm by clicking "Install" and the app icon will appear on your device.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* App Advantages Feature List */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <h4 className="text-xs font-black text-white/80 uppercase">
                  {isAr ? 'مميزات تثبيت المنظومة كتطبيق:' : 'Why install as a Mobile / PC App:'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-white/70 font-medium">
                  <div className="flex items-center gap-2 bg-white/5 p-2.5 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 text-cyan-300 shrink-0" />
                    <span>{isAr ? 'شاشة كاملة بدون شريط المتصفح' : 'Full-screen app view'}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/5 p-2.5 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 text-cyan-300 shrink-0" />
                    <span>{isAr ? 'فتح واستجابة أسرع للخرائط' : 'Faster map load speeds'}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/5 p-2.5 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 text-cyan-300 shrink-0" />
                    <span>{isAr ? 'وصول بنقرة واحدة من الشاشة الرئيسية' : '1-click home screen access'}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/5 p-2.5 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 text-cyan-300 shrink-0" />
                    <span>{isAr ? 'استخراج وتحليل بيانات KML ميدانياً' : 'Field GIS & KML processing'}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/10 bg-black/30 flex items-center justify-between shrink-0">
          <p className="text-[10px] text-white/50 font-bold">
            {isAr ? 'النسخة 2.5 • التثبيت آمن ومجاني 100%' : 'v2.5 • Safe & 100% Free Mobile App'}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>

      </div>
    </div>
  );
};

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [showBanner, setShowBanner] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [imgError, setImgError] = useState<boolean>(false);

  useEffect(() => {
    const checkStandalone = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');
      setIsStandalone(standalone);
      return standalone;
    };

    if (checkStandalone()) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      (window as any).deferredPWAInstallPrompt = e;
      if (!sessionStorage.getItem('nwc_pwa_dismissed')) {
        setShowBanner(true);
      }
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setShowBanner(false);
      setIsModalOpen(false);
      setDeferredPrompt(null);
      (window as any).deferredPWAInstallPrompt = null;
      localStorage.setItem('nwc_pwa_installed', 'true');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Auto-show bottom banner after 1.2s if not dismissed and not installed
    const timer = setTimeout(() => {
      if (!checkStandalone() && !sessionStorage.getItem('nwc_pwa_dismissed')) {
        setShowBanner(true);
      }
    }, 1200);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearTimeout(timer);
    };
  }, []);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleDismissBanner = () => {
    setShowBanner(false);
    sessionStorage.setItem('nwc_pwa_dismissed', 'true');
  };

  if (isStandalone) {
    return (
      <InstallPwaModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        lang="ar"
        deferredPrompt={deferredPrompt}
        setDeferredPrompt={setDeferredPrompt}
        isStandalone={isStandalone}
      />
    );
  }

  return (
    <>
      {showBanner && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-[2000] animate-in fade-in slide-in-from-bottom-5 duration-300 dir-rtl">
          <div className="bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md text-white p-4 rounded-2xl border border-cyan-500/40 shadow-2xl shadow-cyan-950/50 relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-cyan-500/20 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-start gap-3.5 relative z-10">
              <div className="relative shrink-0">
                {!imgError ? (
                  <img
                    src={appLogoImg}
                    alt="شعار الخرائط"
                    className="w-13 h-13 rounded-2xl object-cover border border-cyan-400/50 shadow-md"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <div className="w-13 h-13 rounded-2xl bg-cyan-600/30 border border-cyan-400/50 flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-cyan-300" />
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 bg-amber-500 text-slate-950 p-0.5 rounded-full shadow">
                  <Sparkles className="w-3 h-3" />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-sm text-white">تثبيت تطبيق الخرائط التفاعلية</h4>
                  <button
                    type="button"
                    onClick={handleDismissBanner}
                    className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  احصل على آيقونة مستقيمة وشاشة كاملة سريعة على الجوال والكمبيوتر.
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenModal}
                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    <Download className="w-4 h-4 text-amber-300 animate-bounce" />
                    <span>تثبيت التطبيق الآن</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDismissBanner}
                    className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <InstallPwaModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        lang="ar"
        deferredPrompt={deferredPrompt}
        setDeferredPrompt={setDeferredPrompt}
        isStandalone={isStandalone}
      />
    </>
  );
};

export const PWAInstallHeaderButton: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const checkStandalone = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      setIsStandalone(standalone);
    };

    checkStandalone();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      (window as any).deferredPWAInstallPrompt = e;
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
      (window as any).deferredPWAInstallPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (isStandalone) {
    return (
      <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-bold">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        <span>التطبيق مثبت</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl text-xs shadow-sm transition-all cursor-pointer active:scale-95"
        title="تثبيت التطبيق فوراً على الجوال أو الكمبيوتر"
      >
        <Smartphone className="w-3.5 h-3.5 text-slate-950" />
        <span className="hidden sm:inline">تثبيت التطبيق</span>
        <span className="sm:hidden">تثبيت</span>
      </button>

      <InstallPwaModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        lang="ar"
        deferredPrompt={deferredPrompt}
        setDeferredPrompt={setDeferredPrompt}
        isStandalone={isStandalone}
      />
    </>
  );
};
