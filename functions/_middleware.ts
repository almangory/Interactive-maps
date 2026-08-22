/**
 * @license
 * Cloudflare Pages Geo-Restriction Middleware
 * Restricts all incoming traffic to the Kingdom of Saudi Arabia (SA) with a luxury custom notification screen.
 */

interface Env {
  // Add any binding if needed
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, next } = context;
  const cf = (request as any).cf;
  const country = cf?.country; // e.g. "SA", "US", "GB", "AE"
  const city = cf?.city || '';
  const ip = request.headers.get('cf-connecting-ip') || '';
  const rayId = request.headers.get('cf-ray') || '';

  // 1. Allow local development, undefined country, or Saudi Arabia ("SA")
  if (!country || country === 'SA' || country === 'T1' || country === 'XX') {
    return next();
  }

  // 2. Allow specific assets or bypass if needed (favicon, robots, manifest)
  const url = new URL(request.url);
  if (
    url.pathname.startsWith('/icons/') || 
    url.pathname === '/favicon.ico' || 
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/sw.js'
  ) {
    return next();
  }

  // 3. Return luxury branded Geo-Restricted Access Page
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>وصول مقيد جغرافياً | نظام الخرائط التفاعلية</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Tajawal', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    body {
      background: radial-gradient(circle at 50% 20%, #0d2137 0%, #07111e 60%, #040910 100%);
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      position: relative;
      overflow-x: hidden;
    }
    
    /* Background Ambient Glows */
    .glow-1 {
      position: absolute;
      top: -10%;
      right: 15%;
      width: 450px;
      height: 450px;
      background: radial-gradient(circle, rgba(14, 165, 233, 0.15) 0%, rgba(0, 0, 0, 0) 70%);
      border-radius: 50%;
      pointer-events: none;
      z-index: 0;
    }
    .glow-2 {
      position: absolute;
      bottom: -10%;
      left: 15%;
      width: 450px;
      height: 450px;
      background: radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, rgba(0, 0, 0, 0) 70%);
      border-radius: 50%;
      pointer-events: none;
      z-index: 0;
    }

    .card {
      position: relative;
      z-index: 10;
      max-width: 620px;
      width: 100%;
      background: rgba(13, 27, 42, 0.82);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 28px;
      padding: 2.75rem 2.25rem;
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px rgba(14, 165, 233, 0.1);
      text-align: center;
      animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* Emblems & Icons */
    .icon-wrapper {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 90px;
      height: 90px;
      border-radius: 26px;
      background: linear-gradient(135deg, rgba(30, 58, 138, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%);
      border: 1px solid rgba(59, 130, 246, 0.3);
      box-shadow: 0 12px 30px rgba(0, 82, 204, 0.25);
      margin-bottom: 1.75rem;
    }
    .icon-wrapper svg {
      width: 46px;
      height: 46px;
      color: #38bdf8;
    }
    .pulse-beacon {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 16px;
      height: 16px;
      background-color: #f43f5e;
      border-radius: 50%;
      box-shadow: 0 0 12px #f43f5e;
      animation: pulse 1.8s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(244, 63, 94, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(244, 63, 94, 0); }
    }

    .badge-saudi {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
      font-size: 0.75rem;
      font-weight: 800;
      padding: 0.35rem 0.9rem;
      border-radius: 9999px;
      margin-bottom: 1.25rem;
      letter-spacing: 0.3px;
    }

    h1 {
      font-size: 1.55rem;
      font-weight: 900;
      color: #ffffff;
      line-height: 1.35;
      margin-bottom: 0.75rem;
      letter-spacing: -0.3px;
    }

    .desc-ar {
      font-size: 0.95rem;
      color: #94a3b8;
      line-height: 1.7;
      margin-bottom: 1.25rem;
      font-weight: 500;
    }

    .desc-en {
      font-size: 0.8rem;
      color: #64748b;
      line-height: 1.6;
      margin-bottom: 1.75rem;
      direction: ltr;
      font-weight: 400;
    }

    /* Diagnostics Card */
    .diagnostic-box {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 18px;
      padding: 1.25rem;
      margin-bottom: 1.75rem;
      text-align: right;
    }
    .diag-title {
      font-size: 0.75rem;
      font-weight: 800;
      color: #cbd5e1;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .diag-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
      font-size: 0.75rem;
    }
    @media (max-width: 480px) {
      .diag-grid { grid-template-columns: 1fr; }
      .card { padding: 2rem 1.25rem; }
      h1 { font-size: 1.35rem; }
    }
    .diag-item {
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 0.6rem 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .diag-label {
      color: #64748b;
      font-size: 0.68rem;
      font-weight: 600;
    }
    .diag-value {
      color: #f1f5f9;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 0.8rem;
      direction: ltr;
      text-align: left;
    }
    .country-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #f43f5e;
      font-weight: 800;
    }

    /* Help & Actions */
    .help-text {
      font-size: 0.78rem;
      color: #94a3b8;
      background: rgba(245, 158, 11, 0.08);
      border: 1px solid rgba(245, 158, 11, 0.25);
      border-radius: 14px;
      padding: 0.85rem 1rem;
      line-height: 1.6;
      margin-bottom: 1.75rem;
      text-align: right;
    }
    .help-text strong {
      color: #fbbf24;
    }

    .btn-reload {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 0.95rem 1.5rem;
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      color: #ffffff;
      font-size: 0.95rem;
      font-weight: 800;
      border: none;
      border-radius: 16px;
      cursor: pointer;
      box-shadow: 0 10px 25px rgba(2, 132, 199, 0.35);
      transition: all 0.2s ease;
      text-decoration: none;
    }
    .btn-reload:hover {
      background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
      transform: translateY(-2px);
      box-shadow: 0 14px 30px rgba(2, 132, 199, 0.45);
    }
    .btn-reload:active {
      transform: translateY(0);
    }

    .footer {
      margin-top: 1.5rem;
      font-size: 0.72rem;
      color: #475569;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="glow-1"></div>
  <div class="glow-2"></div>

  <div class="card">
    <!-- Icon with Pulse -->
    <div class="icon-wrapper">
      <div class="pulse-beacon"></div>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M12 8v4"/>
        <path d="M12 16h.01"/>
      </svg>
    </div>

    <!-- Badge -->
    <div>
      <span class="badge-saudi">
        <span>🛡️</span>
        <span>النطاق الجغرافي المعتمد: المملكة العربية السعودية (KSA)</span>
      </span>
    </div>

    <!-- Main Title -->
    <h1>نظام الخرائط التفاعلية - وصول مقيد جغرافياً</h1>
    <p class="desc-ar">
      عذراً، الوصول إلى بوابة الخرائط التفاعلية ومشاريع البنية التحتية متاح ومخصص حصرياً للاتصالات الواردة من <strong>داخل المملكة العربية السعودية</strong> لضمان حماية وسرية البيانات الوطنية.
    </p>
    <p class="desc-en">
      Access to this GIS portal is strictly restricted to authorized network connections originating within the Kingdom of Saudi Arabia (SA).
    </p>

    <!-- Diagnostic Details -->
    <div class="diagnostic-box">
      <div class="diag-title">
        <svg style="width: 14px; height: 14px; color: #38bdf8;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <span>بيانات الاتصال المكتشفة (Connection Diagnostics):</span>
      </div>
      <div class="diag-grid">
        <div class="diag-item">
          <span class="diag-label">الدولة المكتشفة (Detected Country):</span>
          <span class="diag-value country-tag">🚫 ${country || 'غير معروفة'} ${city ? '(' + city + ')' : ''}</span>
        </div>
        <div class="diag-item">
          <span class="diag-label">عنوان الـ IP (Client IP):</span>
          <span class="diag-value">${ip || 'Unavailable'}</span>
        </div>
        <div class="diag-item" style="grid-column: span 2;">
          <span class="diag-label">معرّف الطلب الأمني (Cloudflare Ray ID):</span>
          <span class="diag-value">${rayId || 'CF-EDGE-' + Date.now()}</span>
        </div>
      </div>
    </div>

    <!-- Help Notice -->
    <div class="help-text">
      <strong>💡 لموظفي واستشاريي المشاريع أثناء السفر أو المهام الخارجية:</strong><br>
      إذا كنت أحد المستخدمين المصرح لهم وتسافر خارج المملكة، يرجى تفعيل الاتصال عبر الشبكة الافتراضية السعودية المعتمدة (<strong>Saudi VPN</strong>) أو مراجعة إدارة تقنية المعلومات لإدراج عنوانك ضمن الاستثناءات المعتمدة.
    </div>

    <!-- Action Button -->
    <button class="btn-reload" onclick="window.location.reload()">
      <svg style="width: 18px; height: 18px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"></polyline>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
      </svg>
      <span>إعادة التحقق من الاتصال (Retry Connection)</span>
    </button>

    <div class="footer">
      نظام إدارة ومتابعة الخرائط التفاعلية للمشاريع • الإدارة العامة للمشاريع
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 403,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
};
