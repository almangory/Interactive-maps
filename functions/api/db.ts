/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Cloudflare Pages Functions Handler for /api/db (Neon PostgreSQL)
 */

import handler from '../../api/db';

export async function onRequest(context: { request: Request; env: Record<string, string> }) {
  // If Cloudflare environment variables exist, pass them
  if (context.env) {
    if (context.env.DATABASE_URL) {
      (process.env as any) = process.env || {};
      process.env.DATABASE_URL = context.env.DATABASE_URL;
    }
    if (context.env.NEON_DATABASE_URL) {
      (process.env as any) = process.env || {};
      process.env.NEON_DATABASE_URL = context.env.NEON_DATABASE_URL;
    }
  }
  return handler(context.request);
}
