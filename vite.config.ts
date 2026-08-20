import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'app-logo.jpg', 'app-logo.png'],
        manifest: {
          name: 'تطبيق الخرائط التفاعلية - NWC',
          short_name: 'الخرائط التفاعلية',
          description: 'منظومة الخرائط التفاعلية واستخراج البيانات وتحليل أطوال الشبكات والتصاريح',
          theme_color: '#1e40af',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'any',
          lang: 'ar',
          dir: 'rtl',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: '/apple-touch-icon.png',
              sizes: '180x180',
              type: 'image/png'
            }
          ]
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024
        },
        devOptions: {
          enabled: true
        }
      }),
      {
        name: 'kml-proxy-middleware',
        configureServer(server) {
          server.middlewares.use('/api/fetch-kml', async (req, res) => {
            try {
              const reqUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
              const targetUrl = reqUrl.searchParams.get('url');
              if (!targetUrl) {
                res.statusCode = 400;
                res.end('Missing url parameter');
                return;
              }

              // 🛡️ Strict SSRF Protection: Validate target URL domain & protocol
              let parsedTarget: URL;
              try {
                parsedTarget = new URL(targetUrl);
              } catch {
                res.statusCode = 400;
                res.end('Invalid target URL format');
                return;
              }

              if (parsedTarget.protocol !== 'https:' && parsedTarget.protocol !== 'http:') {
                res.statusCode = 403;
                res.end('Forbidden: Only HTTP/HTTPS protocols are allowed');
                return;
              }

              const hostname = parsedTarget.hostname.toLowerCase();

              // Block private and loopback IP addresses / hostnames
              const isPrivateHost = 
                hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname === '0.0.0.0' ||
                hostname === '::1' ||
                hostname.startsWith('10.') ||
                hostname.startsWith('192.168.') ||
                hostname === '169.254.169.254' ||
                /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

              if (isPrivateHost) {
                res.statusCode = 403;
                res.end('Forbidden: Access to private and local network resources is blocked (SSRF Protection)');
                return;
              }

              // Whitelist allowed Google Maps & trusted GIS domains
              const isAllowedDomain = 
                hostname === 'google.com' ||
                hostname.endsWith('.google.com') ||
                hostname === 'googleusercontent.com' ||
                hostname.endsWith('.googleusercontent.com') ||
                hostname === 'maps.googleapis.com' ||
                hostname === 'earth.google.com';

              if (!isAllowedDomain) {
                res.statusCode = 403;
                res.end('Forbidden: Target domain is not permitted for KML fetching');
                return;
              }

              const response = await fetch(targetUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
              });

              if (!response.ok) {
                res.statusCode = response.status;
                res.end(`Failed to fetch from target: ${response.statusText}`);
                return;
              }

              const xmlText = await response.text();
              res.setHeader('Content-Type', 'application/xml; charset=utf-8');
              res.setHeader('X-Content-Type-Options', 'nosniff');
              res.end(xmlText);
            } catch (err: any) {
              res.statusCode = 500;
              res.end(err?.message || 'Server error proxying KML');
            }
          });
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
