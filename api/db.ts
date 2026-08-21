/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Neon PostgreSQL Serverless API Bridge for Interactive Maps
 * Provides secure, parameterized database access over Edge Runtime.
 */

import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const DEFAULT_NEON_URL = 'postgresql://neondb_owner:npg_1LhjHinE0bfd@ep-wispy-sound-b2iil0ei.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require';

function getDatabaseUrl(): string {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || DEFAULT_NEON_URL;
  }
  return DEFAULT_NEON_URL;
}

const ALLOWED_TABLES = new Set([
  'projects',
  'users',
  'project_reports',
  'archived_project_reports',
  'project_changelogs',
  'notifications',
  'dashboard_project_metrics'
]);

function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}

export default async function handler(req: Request) {
  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  const dbUrl = getDatabaseUrl();
  const sql = neon(dbUrl);

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const table = url.searchParams.get('table') || '';
      
      if (!table || !ALLOWED_TABLES.has(table)) {
        return new Response(JSON.stringify({ error: `Invalid or unauthorized table: ${table}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const safeTable = sanitizeIdentifier(table);
      const orderCol = sanitizeIdentifier(url.searchParams.get('order') || 'created_at');
      const orderDir = url.searchParams.get('ascending') === 'true' ? 'ASC' : 'DESC';
      const limitParam = parseInt(url.searchParams.get('limit') || '500', 10);
      const limit = Math.min(Math.max(1, limitParam), 1000);

      const eqCol = url.searchParams.get('eq_col') ? sanitizeIdentifier(url.searchParams.get('eq_col')!) : null;
      const eqVal = url.searchParams.get('eq_val');

      let queryStr = `SELECT * FROM public.${safeTable}`;
      const params: any[] = [];

      if (eqCol && eqVal !== null) {
        queryStr += ` WHERE ${eqCol} = $1`;
        params.push(eqVal);
      }

      queryStr += ` ORDER BY ${orderCol} ${orderDir} LIMIT ${limit}`;

      const rows = await sql(queryStr, params);

      return new Response(JSON.stringify({ data: rows, error: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { action, table, data, eq_col, eq_val, in_col, in_vals } = body;

      if (!table || !ALLOWED_TABLES.has(table)) {
        return new Response(JSON.stringify({ error: `Invalid or unauthorized table: ${table}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const safeTable = sanitizeIdentifier(table);

      // 1. SELECT Action (POST payload for complex query)
      if (action === 'select') {
        let queryStr = `SELECT * FROM public.${safeTable}`;
        const params: any[] = [];
        const conditions: string[] = [];

        if (eq_col && eq_val !== undefined) {
          params.push(eq_val);
          conditions.push(`${sanitizeIdentifier(eq_col)} = $${params.length}`);
        }

        if (in_col && Array.isArray(in_vals) && in_vals.length > 0) {
          const placeholders = in_vals.map((v) => {
            params.push(v);
            return `$${params.length}`;
          });
          conditions.push(`${sanitizeIdentifier(in_col)} IN (${placeholders.join(', ')})`);
        }

        if (conditions.length > 0) {
          queryStr += ` WHERE ` + conditions.join(' AND ');
        }

        const orderCol = sanitizeIdentifier(body.order || 'created_at');
        const orderDir = body.ascending === true ? 'ASC' : 'DESC';
        const limit = Math.min(Math.max(1, parseInt(body.limit || '500', 10)), 1000);

        queryStr += ` ORDER BY ${orderCol} ${orderDir} LIMIT ${limit}`;

        const rows = await sql(queryStr, params);
        return new Response(JSON.stringify({ data: rows, error: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // 2. INSERT Action
      if (action === 'insert') {
        const records = Array.isArray(data) ? data : [data];
        if (records.length === 0) {
          return new Response(JSON.stringify({ data: [], error: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        const insertedRows: any[] = [];

        for (const row of records) {
          const keys = Object.keys(row).map(sanitizeIdentifier);
          const values = Object.values(row).map(val => typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const colList = keys.join(', ');

          const insertSql = `
            INSERT INTO public.${safeTable} (${colList})
            VALUES (${placeholders})
            RETURNING *;
          `;

          const result = await sql(insertSql, values);
          if (result && result.length > 0) {
            insertedRows.push(result[0]);
          }
        }

        return new Response(JSON.stringify({ data: insertedRows, error: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // 3. UPSERT Action
      if (action === 'upsert') {
        const row = Array.isArray(data) ? data[0] : data;
        const primaryKey = sanitizeIdentifier(body.onConflict || (safeTable === 'projects' ? 'id' : safeTable === 'dashboard_project_metrics' ? 'project_id' : 'id'));
        const keys = Object.keys(row).map(sanitizeIdentifier);
        const values = Object.values(row).map(val => typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const colList = keys.join(', ');

        const updateAssignments = keys
          .filter(k => k !== primaryKey)
          .map(k => `${k} = EXCLUDED.${k}`)
          .join(', ');

        const upsertSql = `
          INSERT INTO public.${safeTable} (${colList})
          VALUES (${placeholders})
          ON CONFLICT (${primaryKey})
          DO UPDATE SET ${updateAssignments}
          RETURNING *;
        `;

        const result = await sql(upsertSql, values);
        return new Response(JSON.stringify({ data: result, error: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // 4. DELETE Action
      if (action === 'delete') {
        const params: any[] = [];
        let whereClause = '';

        if (eq_col && eq_val !== undefined) {
          params.push(eq_val);
          whereClause = `WHERE ${sanitizeIdentifier(eq_col)} = $1`;
        } else if (in_col && Array.isArray(in_vals) && in_vals.length > 0) {
          const placeholders = in_vals.map((v) => {
            params.push(v);
            return `$${params.length}`;
          });
          whereClause = `WHERE ${sanitizeIdentifier(in_col)} IN (${placeholders.join(', ')})`;
        } else {
          return new Response(JSON.stringify({ error: 'Delete requires an eq_col or in_col condition' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        const deleteSql = `DELETE FROM public.${safeTable} ${whereClause} RETURNING id;`;
        const result = await sql(deleteSql, params);
        return new Response(JSON.stringify({ data: result, error: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err: any) {
    console.error('Neon DB API Error:', err);
    return new Response(JSON.stringify({ data: null, error: { message: err?.message || 'Database query error' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
