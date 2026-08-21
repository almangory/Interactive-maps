/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Cloudflare Pages Functions Handler for /api/fetch-kml
 */

import handler from '../../api/fetch-kml';

export async function onRequest(context: { request: Request }) {
  return handler(context.request);
}
