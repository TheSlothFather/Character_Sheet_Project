/**
 * Mock Supabase Client for Combat V2 Testing
 *
 * Extends the existing MockSupabaseClient pattern from psionicsSkillTree.test.tsx
 * with auth.getUser() and auth.onAuthStateChange() support.
 */

import { setSupabaseClient } from "../../api/supabaseClient";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type TableData = Record<string, unknown[]>;

export interface MockUser {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  aud?: string;
  created_at?: string;
}

export interface MockSupabaseConfig {
  user: MockUser | null;
  tables?: TableData;
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK QUERY (chainable Supabase query builder)
// ═══════════════════════════════════════════════════════════════════════════

class MockQuery<T> {
  private data: unknown[];
  private filter: { column: string; value: unknown } | null = null;

  constructor(
    private table: string,
    private tables: TableData
  ) {
    this.data = tables[table] ?? [];
  }

  select(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filter = { column, value };
    this.data = (this.tables[this.table] ?? []).filter((row: any) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown): this {
    this.data = (this.data ?? []).filter((row: any) => row[column] !== value);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.data = (this.data ?? []).filter((row: any) => values.includes(row[column]));
    return this;
  }

  order(_column?: string, _options?: { ascending?: boolean }): this {
    return this;
  }

  limit(count: number): this {
    this.data = (this.data ?? []).slice(0, count);
    return this;
  }

  range(from: number, to: number): this {
    this.data = (this.data ?? []).slice(from, to + 1);
    return this;
  }

  single() {
    return Promise.resolve({
      data: this.data[0] ?? null,
      error: this.data[0] ? null : { message: "No rows found" },
    });
  }

  maybeSingle() {
    return Promise.resolve({ data: this.data[0] ?? null, error: null });
  }

  insert(payload: unknown): this {
    const rows = Array.isArray(payload) ? payload : [payload];
    if (!this.tables[this.table]) this.tables[this.table] = [];
    rows.forEach((row: any) => {
      const nextId = row.id ?? `id-${this.tables[this.table].length + 1}`;
      this.tables[this.table].push({ ...row, id: nextId });
    });
    this.data = rows.map((row: any, idx) => ({
      ...row,
      id: row.id ?? `id-${this.tables[this.table].length - rows.length + idx + 1}`,
    }));
    return this;
  }

  update(payload: unknown): this {
    if (!this.tables[this.table]) this.tables[this.table] = [];
    this.tables[this.table] = this.tables[this.table].map((row: any) =>
      this.filter && row[this.filter.column] === this.filter.value ? { ...row, ...payload } : row
    );
    this.data = this.tables[this.table].filter((row: any) =>
      this.filter ? row[this.filter.column] === this.filter.value : true
    );
    return this;
  }

  upsert(payload: unknown, _options?: { onConflict?: string }): this {
    // Simplified upsert: just insert for testing
    return this.insert(payload);
  }

  delete(): Promise<{ data: null; error: null }> {
    if (this.filter) {
      this.tables[this.table] = (this.tables[this.table] ?? []).filter(
        (row: any) => row[this.filter!.column] !== this.filter!.value
      );
    }
    return Promise.resolve({ data: null, error: null });
  }

  then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: { data: T[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    const result = { data: this.data as T[], error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK SUPABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════

export class MockSupabaseClientForCombat {
  private user: MockUser | null;
  private tables: TableData;
  private authStateCallbacks: Set<Function> = new Set();

  constructor(config: MockSupabaseConfig) {
    this.user = config.user;
    this.tables = config.tables ?? {};
  }

  auth = {
    getUser: async () => {
      if (!this.user) {
        return {
          data: { user: null },
          error: { message: "Not authenticated", status: 401 },
        };
      }
      return { data: { user: this.user }, error: null };
    },

    getSession: async () => {
      if (!this.user) {
        return { data: { session: null }, error: null };
      }
      return {
        data: {
          session: {
            user: this.user,
            access_token: "mock-access-token",
            refresh_token: "mock-refresh-token",
            expires_at: Date.now() + 3600000,
          },
        },
        error: null,
      };
    },

    onAuthStateChange: (callback: Function) => {
      this.authStateCallbacks.add(callback);

      // Immediately call with current state
      const event = this.user ? "SIGNED_IN" : "SIGNED_OUT";
      const session = this.user
        ? {
            user: this.user,
            access_token: "mock-access-token",
            refresh_token: "mock-refresh-token",
          }
        : null;

      // Call async to match real behavior
      queueMicrotask(() => callback(event, session));

      return {
        data: {
          subscription: {
            unsubscribe: () => {
              this.authStateCallbacks.delete(callback);
            },
          },
        },
      };
    },

    signInWithPassword: async (_credentials: { email: string; password: string }) => {
      if (this.user) {
        return { data: { user: this.user, session: {} }, error: null };
      }
      return { data: { user: null, session: null }, error: { message: "Invalid credentials" } };
    },

    signOut: async () => {
      const previousUser = this.user;
      this.user = null;

      // Notify listeners
      if (previousUser) {
        this.authStateCallbacks.forEach((cb) => cb("SIGNED_OUT", null));
      }

      return { error: null };
    },

    signInAnonymously: async () => {
      const anonUser: MockUser = {
        id: `anon-${Date.now()}`,
        email: undefined,
        app_metadata: { provider: "anonymous" },
      };
      this.user = anonUser;
      return { data: { user: anonUser, session: {} }, error: null };
    },
  };

  from(table: string) {
    return new MockQuery(table, this.tables);
  }

  /**
   * Update the mock user (for testing auth state changes)
   */
  setUser(user: MockUser | null): void {
    const previousUser = this.user;
    this.user = user;

    // Notify listeners of auth state change
    const event = user ? "SIGNED_IN" : "SIGNED_OUT";
    const session = user
      ? {
          user,
          access_token: "mock-access-token",
          refresh_token: "mock-refresh-token",
        }
      : null;

    if (user !== previousUser) {
      this.authStateCallbacks.forEach((cb) => cb(event, session));
    }
  }

  /**
   * Update tables data
   */
  setTables(tables: TableData): void {
    this.tables = tables;
  }

  /**
   * Add data to a specific table
   */
  addToTable(table: string, rows: unknown[]): void {
    if (!this.tables[table]) {
      this.tables[table] = [];
    }
    this.tables[table].push(...rows);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTALL / UNINSTALL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

let mockClient: MockSupabaseClientForCombat | null = null;

/**
 * Install a mock Supabase client for testing.
 * Call this in beforeEach.
 */
export function installMockSupabase(config: MockSupabaseConfig): MockSupabaseClientForCombat {
  // Set env vars to prevent errors
  (globalThis as any).__SUPABASE_ENV__ = {
    VITE_SUPABASE_URL: "http://localhost:54321",
    VITE_SUPABASE_ANON_KEY: "mock-anon-key",
  };

  mockClient = new MockSupabaseClientForCombat(config);
  setSupabaseClient(mockClient as any);

  return mockClient;
}

/**
 * Uninstall the mock Supabase client.
 * Call this in afterEach.
 */
export function uninstallMockSupabase(): void {
  setSupabaseClient(null as any);
  delete (globalThis as any).__SUPABASE_ENV__;
  mockClient = null;
}

/**
 * Get the current mock client (for test assertions)
 */
export function getMockSupabaseClient(): MockSupabaseClientForCombat | null {
  return mockClient;
}
