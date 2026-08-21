/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Secure Serverless KML Proxy Handler for Interactive Maps
 * Provides strict SSRF protection, domain whitelisting, and CORS headers.
 */

export const config = {
  runtime: 'edge', // Fast Edge execution
};

// 🛡️ Strict Domain Whitelist (Only Google My Maps / Earth services)
const ALLOWED_HOSTS = new Set([
  'www.google.com',
  'google.com',
  'maps.google.com',
  'googleusercontent.com',
  'doc-00-50-mymaps.googleusercontent.com',
  'doc-04-50-mymaps.googleusercontent.com',
  'doc-08-50-mymaps.googleusercontent.com',
  'doc-0c-50-mymaps.googleusercontent.com',
  'doc-0g-50-mymaps.googleusercontent.com',
  'doc-0k-50-mymaps.googleusercontent.com',
  'doc-0o-50-mymaps.googleusercontent.com',
  'doc-0s-50-mymaps.googleusercontent.com',
  'doc-10-50-mymaps.googleusercontent.com'
]);

function isIpAddress(host: string): boolean {
  // IPv4 / IPv6 detection
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':') || host.toLowerCase() === 'localhost';
}

function isHostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  
  // 1. Strictly deny any raw IP addresses (prevents SSRF to internal/cloud metadata services)
  if (isIpAddress(host)) {
    return false;
  }

  // 2. Exact match in whitelist
  if (ALLOWED_HOSTS.has(host)) {
    return true;
  }

  // 3. Subdomain match for trusted Google services
  if (host.endsWith('.google.com') || host.endsWith('.googleusercontent.com')) {
    return true;
  }

  return false;
}

export default async function handler(req: Request) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }

  const urlObj = new URL(req.url);
  const targetUrl = urlObj.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing target url parameter' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }

  // 🛡️ Protocol check: HTTPS only
  if (parsedTarget.protocol !== 'https:') {
    return new Response(JSON.stringify({ error: 'Only secure HTTPS endpoints are permitted' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }

  // 🛡️ SSRF Prevention: Validate host against whitelist
  if (!isHostAllowed(parsedTarget.hostname)) {
    return new Response(JSON.stringify({ 
      error: 'Access Denied: Target host is not authorized. Only Google My Maps endpoints are permitted.' 
    }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 seconds timeout

    const upstreamResponse = await fetch(parsedTarget.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/vnd.google-earth.kml+xml, application/xml, text/xml, */*'
      }
    });

    clearTimeout(timeoutId);

    if (!upstreamResponse.ok) {
      return new Response(JSON.stringify({ 
        error: `Upstream service returned status ${upstreamResponse.status}` 
      }), {
        status: upstreamResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff'
        }
      });
    }

    const xmlContent = await upstreamResponse.text();

    return new Response(xmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.google-earth.kml+xml; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 's-maxage=1800, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ 
      error: err.name === 'AbortError' ? 'Upstream request timed out' : 'Failed to fetch upstream KML content' 
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }
}
