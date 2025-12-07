import type { Expr, EvalContext } from "./expressions";
import { evalExpr } from "./expressions";

export type ModifierOperation = "add" | "mul" | "set" | "max" | "min";

export interface Modifier {
  id: string;
  targetPath: string;
  operation: ModifierOperation;
  stackingKey?: string;
  priority?: number;
  valueExpression: Expr;
  conditionExpression?: Expr;
}

export interface ApplyModifiersOptions {
  baseState: Record<string, unknown>;
  tags?: string[];
  modifiers: Modifier[];
}

export function applyModifiers(opts: ApplyModifiersOptions): Record<string, unknown> {
  const { baseState, modifiers, tags } = opts;
  const ctx: EvalContext = { state: structuredClone(baseState), tags };

  const applicable: Modifier[] = [];
  for (const m of modifiers) {
    if (!m.conditionExpression) {
      applicable.push(m);
      continue;
    }
    const cond = evalExpr(m.conditionExpression, ctx);
    if (cond) applicable.push(m);
  }

  const groups = new Map<string, Modifier[]>();
  for (const m of applicable) {
    const key = `${m.targetPath}::${m.stackingKey ?? ""}`;
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  }

  const effective: Modifier[] = [];
  for (const [, group] of groups) {
    if (!group[0].stackingKey) {
      effective.push(...group);
      continue;
    }
    let best: Modifier | undefined;
    let bestValue = -Infinity;
    for (const m of group) {
      const valueRaw = evalExpr(m.valueExpression, ctx);
      const value = typeof valueRaw === "number" ? valueRaw : 0;
      const priority = m.priority ?? 0;
      const score = value + priority * 0.001;
      if (!best || score > bestValue) {
        best = m;
        bestValue = score;
      }
    }
    if (best) effective.push(best);
  }

  for (const m of effective) {
    const value = evalExpr(m.valueExpression, ctx);
    applySingleModifier(ctx.state, m.targetPath, m.operation, value);
  }

  return ctx.state;
}

function applySingleModifier(
  state: Record<string, unknown>,
  targetPath: string,
  op: ModifierOperation,
  rawValue: unknown
): void {
  const parts = targetPath.split(".");
  const last = parts.pop();
  if (!last) return;

  let cur: any = state;
  for (const p of parts) {
    if (cur[p] == null || typeof cur[p] !== "object") {
      cur[p] = {};
    }
    cur = cur[p];
  }

  const existing = cur[last];
  const v = typeof rawValue === "number" ? rawValue : 0;

  switch (op) {
    case "add":
      cur[last] = toNumber(existing) + v;
      break;
    case "mul":
      cur[last] = toNumber(existing) * v;
      break;
    case "set":
      cur[last] = v;
      break;
    case "max":
      cur[last] = Math.max(toNumber(existing), v);
      break;
    case "min":
      cur[last] = Math.min(toNumber(existing), v);
      break;
  }
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  return 0;
}

