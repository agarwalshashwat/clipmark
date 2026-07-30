/**
 * Test doubles for webapp handler unit tests (no DB, no network).
 *
 * - makeFakeSupabase: a chainable query-builder mock whose terminal awaits
 *   resolve to whatever a `responder(ctx)` returns, and which records every call
 *   so tests can assert what the handler tried to do.
 * - fakeDodo: a minimal Dodo client whose webhooks.unwrap either returns a
 *   preset event or throws (invalid signature).
 * - makeRequest: build a NextRequest with headers/body/url for a handler.
 */
import { NextRequest } from 'next/server';

export type FakeOp = 'select' | 'insert' | 'update' | 'delete';

export interface FakeCtx {
  table: string;
  op: FakeOp;
  payload?: unknown;
  filters: Array<[string, string, unknown]>; // [method, column, value]
  single: boolean;
  maybeSingle: boolean;
  head: boolean;
  count?: string;
}

export interface FakeResult {
  data?: unknown;
  error?: { message?: string; code?: string } | null;
  count?: number | null;
}

export type Responder = (ctx: FakeCtx) => FakeResult;

/** Build a fake Supabase client + a record of all finalized calls. */
export function makeFakeSupabase(responder: Responder) {
  const calls: FakeCtx[] = [];

  function builder(table: string) {
    const ctx: FakeCtx = {
      table,
      op: 'select',
      filters: [],
      single: false,
      maybeSingle: false,
      head: false,
    };

    const finalize = (): Promise<FakeResult> => {
      calls.push(ctx);
      return Promise.resolve(responder(ctx) ?? {});
    };

    const chain: Record<string, unknown> = {
      select(_cols?: unknown, opts?: { head?: boolean; count?: string }) {
        if (opts?.head) ctx.head = true;
        if (opts?.count) ctx.count = opts.count;
        return chain;
      },
      insert(payload: unknown) {
        ctx.op = 'insert';
        ctx.payload = payload;
        return chain;
      },
      update(payload: unknown) {
        ctx.op = 'update';
        ctx.payload = payload;
        return chain;
      },
      upsert(payload: unknown) {
        ctx.op = 'update';
        ctx.payload = payload;
        return chain;
      },
      delete() {
        ctx.op = 'delete';
        return chain;
      },
      eq(col: string, val: unknown) {
        ctx.filters.push(['eq', col, val]);
        return chain;
      },
      neq(col: string, val: unknown) {
        ctx.filters.push(['neq', col, val]);
        return chain;
      },
      single() {
        ctx.single = true;
        return finalize();
      },
      maybeSingle() {
        ctx.maybeSingle = true;
        return finalize();
      },
      // Make the builder awaitable at any point (for queries without single()).
      then(onF: (v: FakeResult) => unknown, onR?: (e: unknown) => unknown) {
        return finalize().then(onF, onR);
      },
    };
    return chain;
  }

  return { client: { from: (t: string) => builder(t) } as never, calls };
}

/** Fake Dodo client: unwrap returns `event` unless `throwOnUnwrap` is set. */
export function fakeDodo(opts: { event?: unknown; throwOnUnwrap?: boolean }) {
  return {
    webhooks: {
      unwrap() {
        if (opts.throwOnUnwrap) throw new Error('invalid signature');
        return opts.event;
      },
    },
  } as never;
}

/** Fake Dodo discounts client: create() returns a preset discount_id (no real Dodo API calls). */
export function fakeDodoDiscounts(discountId = 'discount_test') {
  return {
    discounts: {
      create() {
        return Promise.resolve({ discount_id: discountId });
      },
    },
  } as never;
}

/** Build a NextRequest for a handler under test. */
export function makeRequest(opts: {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): NextRequest {
  return new NextRequest(opts.url ?? 'http://localhost/api/test', {
    method: opts.method ?? 'POST',
    headers: opts.headers ?? {},
    body: opts.body,
  });
}
