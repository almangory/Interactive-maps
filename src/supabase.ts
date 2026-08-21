/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Neon PostgreSQL Database Connection & Client Adapter
 * Replaces legacy Supabase with High-Performance Serverless Neon PostgreSQL.
 */

import { neonDb, neonSql, NEON_CONNECTION_STRING } from './utils/neonClient';

export { neonDb, neonSql, NEON_CONNECTION_STRING };

// Export seamless compatibility instances
export const supabase: any = neonDb;

export function getSharedSupabaseClient(): any {
  return neonDb;
}

export default neonDb;
