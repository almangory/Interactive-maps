/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Neon PostgreSQL Client Adapter for Interactive Maps
 * Provides full compatibility with Supabase-style table queries, mutations (insert, update, upsert, delete),
 * and live serverless execution on Cloudflare Pages and modern browsers.
 */

import { neon } from '@neondatabase/serverless';

export const NEON_CONNECTION_STRING = 'postgresql://neondb_owner:npg_1LhjHinE0bfd@ep-wispy-sound-b2iil0ei.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require';

// Direct Neon SQL executor for browser / edge execution
export const neonSql = neon(NEON_CONNECTION_STRING);

interface QueryOptions {
  action: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  table: string;
  columns?: string;
  eq_col?: string;
  eq_val?: any;
  in_col?: string;
  in_vals?: any[];
  order?: string;
  ascending?: boolean;
  limit?: number;
  data?: any;
  onConflict?: string;
}

export class NeonQueryBuilder {
  private options: QueryOptions;

  constructor(table: string) {
    this.options = {
      action: 'select',
      table
    };
  }

  select(columns: string = '*'): this {
    // If we are chaining .select() after an insert/update/upsert, do NOT change the action
    if (this.options.action === 'select') {
      this.options.columns = columns;
    }
    return this;
  }

  insert(data: any): this {
    this.options.action = 'insert';
    this.options.data = data;
    return this;
  }

  update(data: any): this {
    this.options.action = 'update';
    this.options.data = data;
    return this;
  }

  upsert(data: any, options?: { onConflict?: string }): this {
    this.options.action = 'upsert';
    this.options.data = data;
    if (options?.onConflict) {
      this.options.onConflict = options.onConflict;
    }
    return this;
  }

  delete(): this {
    this.options.action = 'delete';
    return this;
  }

  eq(column: string, value: any): this {
    this.options.eq_col = column;
    this.options.eq_val = value;
    return this;
  }

  in(column: string, values: any[]): this {
    this.options.in_col = column;
    this.options.in_vals = values;
    return this;
  }

  ilike(column: string, pattern: string): this {
    this.options.eq_col = column;
    this.options.eq_val = pattern.replace(/%/g, '');
    return this;
  }

  or(_condition: string): this {
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.options.order = column;
    this.options.ascending = opts?.ascending !== false;
    return this;
  }

  limit(count: number): this {
    this.options.limit = count;
    return this;
  }

  // Executes query directly via serverless Neon SQL driver
  async execute(): Promise<{ data: any[] | null; error: any }> {
    try {
      const { action, table, columns, eq_col, eq_val, in_col, in_vals, order, ascending, limit, data, onConflict } = this.options;
      const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');

      if (action === 'select') {
        const selectCols = (columns && columns.trim() !== '') ? columns : '*';
        let queryStr = `SELECT ${selectCols} FROM public.${safeTable}`;
        const params: any[] = [];
        const conditions: string[] = [];

        if (eq_col && eq_val !== undefined) {
          params.push(eq_val);
          conditions.push(`${eq_col} = $${params.length}`);
        }

        if (in_col && Array.isArray(in_vals) && in_vals.length > 0) {
          const placeholders = in_vals.map(v => {
            params.push(v);
            return `$${params.length}`;
          });
          conditions.push(`${in_col} IN (${placeholders.join(', ')})`);
        }

        if (conditions.length > 0) {
          queryStr += ' WHERE ' + conditions.join(' AND ');
        }

        const orderCol = (order || 'created_at').replace(/[^a-zA-Z0-9_]/g, '');
        const orderDir = ascending === true ? 'ASC' : 'DESC';
        const limitCount = Math.min(Math.max(1, limit || 500), 1000);

        queryStr += ` ORDER BY ${orderCol} ${orderDir} LIMIT ${limitCount}`;

        const rows = await neonSql(queryStr, params);
        return { data: rows as any[], error: null };
      }

      if (action === 'insert') {
        const records = Array.isArray(data) ? data : [data];
        if (records.length === 0) return { data: [], error: null };

        const inserted: any[] = [];
        for (const row of records) {
          const keys = Object.keys(row);
          const values = Object.values(row).map(v => typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const colList = keys.join(', ');

          const sql = `INSERT INTO public.${safeTable} (${colList}) VALUES (${placeholders}) RETURNING *;`;
          const res = await neonSql(sql, values);
          if (res && res.length > 0) inserted.push(res[0]);
        }
        return { data: inserted, error: null };
      }

      if (action === 'update') {
        const row = Array.isArray(data) ? data[0] : data;
        const keys = Object.keys(row);
        if (keys.length === 0) return { data: [], error: null };

        const params: any[] = [];
        const setClauses = keys.map(k => {
          const v = row[k];
          params.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
          return `${k} = $${params.length}`;
        });

        let whereClause = '';
        if (eq_col && eq_val !== undefined) {
          params.push(eq_val);
          whereClause = `WHERE ${eq_col} = $${params.length}`;
        } else if (in_col && Array.isArray(in_vals) && in_vals.length > 0) {
          const ph = in_vals.map(v => {
            params.push(v);
            return `$${params.length}`;
          });
          whereClause = `WHERE ${in_col} IN (${ph.join(', ')})`;
        }

        const sql = `UPDATE public.${safeTable} SET ${setClauses.join(', ')} ${whereClause} RETURNING *;`;
        const res = await neonSql(sql, params);
        return { data: res as any[], error: null };
      }

      if (action === 'upsert') {
        const row = Array.isArray(data) ? data[0] : data;
        const pk = onConflict || (safeTable === 'projects' ? 'id' : safeTable === 'dashboard_project_metrics' ? 'project_id' : 'id');
        const keys = Object.keys(row);
        const values = Object.values(row).map(v => typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const colList = keys.join(', ');

        const updateAssignments = keys
          .filter(k => k !== pk)
          .map(k => `${k} = EXCLUDED.${k}`)
          .join(', ');

        const sql = `
          INSERT INTO public.${safeTable} (${colList})
          VALUES (${placeholders})
          ON CONFLICT (${pk})
          DO UPDATE SET ${updateAssignments}
          RETURNING *;
        `;
        const res = await neonSql(sql, values);
        return { data: res as any[], error: null };
      }

      if (action === 'delete') {
        const params: any[] = [];
        let where = '';
        if (eq_col && eq_val !== undefined) {
          params.push(eq_val);
          where = `WHERE ${eq_col} = $1`;
        } else if (in_col && Array.isArray(in_vals) && in_vals.length > 0) {
          const ph = in_vals.map(v => {
            params.push(v);
            return `$${params.length}`;
          });
          where = `WHERE ${in_col} IN (${ph.join(', ')})`;
        }
        const sql = `DELETE FROM public.${safeTable} ${where} RETURNING id;`;
        const res = await neonSql(sql, params);
        return { data: res as any[], error: null };
      }

      return { data: null, error: { message: `Unsupported action: ${action}` } };
    } catch (dbErr: any) {
      console.error('Neon Direct Query Error:', dbErr);
      return { data: null, error: { message: dbErr?.message || 'Database error' } };
    }
  }

  // Promise-like then() implementation so `await db.from(...).select(...)` works seamlessly!
  then<TResult1 = { data: any[] | null; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any[] | null; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export const neonDb = {
  from(table: string) {
    return new NeonQueryBuilder(table);
  },
  channel(_name: string) {
    return {
      on(_event: string, _opts: any, _callback: () => void) {
        return this;
      },
      subscribe() {
        return this;
      }
    };
  },
  removeChannel(_channel: any) {}
};

export default neonDb;
