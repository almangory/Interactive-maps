/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Neon Serverless PostgreSQL Database Connection & Query Adapter
 */

import { neonDb, neonSql, NEON_CONNECTION_STRING } from './utils/neonClient';

export { neonDb, neonSql, NEON_CONNECTION_STRING };
export const db = neonDb;
export const supabase = neonDb;

export function getSharedDbClient(): any {
  return neonDb;
}

export function getSharedSupabaseClient(): any {
  return neonDb;
}

export default neonDb;
