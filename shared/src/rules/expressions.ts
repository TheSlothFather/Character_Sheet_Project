// Minimal JSON-based expression system for Adûrun-style rules.
// This is intentionally constrained (no arbitrary JS) and can be shared
// between backend and frontend.

export type ExprNumberLiteral = {
  type: "number";
  value: number;
};

export type ExprBoolLiteral = {
  type: "bool";
  value: boolean;
};

export type ExprStringLiteral = {
  type: "string";
  value: string;
};

export type ExprRef = {
  type: "ref";
  path: string; // e.g. "attributes.FEAT_OF_STRENGTH.score"
};

export type ExprBinaryOp = {
  type: "op";
  op: "add" | "sub" | "mul" | "div" | "max" | "min";
  left: Expr;
  right: Expr;
};

export type ExprComparison = {
  type: "cmp";
  op: ">" | "<" | ">=" | "<=" | "==" | "!=";
  left: Expr;
  right: Expr;
};

export type ExprLogical = {
  type: "bool-op";
  op: "and" | "or" | "not";
  args: Expr[];
};

export type ExprHasTag = {
  type: "hasTag";
  tag: string;
};

export type ExprIf = {
  type: "if";
  condition: Expr;
  then: Expr;
  else: Expr;
};

export type Expr =
  | ExprNumberLiteral
  | ExprBoolLiteral
  | ExprStringLiteral
  | ExprRef
  | ExprBinaryOp
  | ExprComparison
  | ExprLogical
  | ExprHasTag
  | ExprIf;

export interface EvalContext {
  // Arbitrary nested state: attributes, skills, derived stats, tags, etc.
  // e.g. { attributes: { FEAT_OF_STRENGTH: { score: 50 } }, tags: ["background:Academic"] }
  state: Record<string, unknown>;
  tags?: string[];
}

export function evalExpr(expr: Expr, ctx: EvalContext): unknown {
  switch (expr.type) {
    case "number":
    case "bool":
    case "string":
      return expr.value;
    case "ref":
      return getPath(ctx.state, expr.path);
    case "op": {
      const l = toNumber(evalExpr(expr.left, ctx));
      const r = toNumber(evalExpr(expr.right, ctx));
      switch (expr.op) {
        case "add":
          return l + r;
        case "sub":
          return l - r;
        case "mul":
          return l * r;
        case "div":
          return r === 0 ? 0 : l / r;
        case "max":
          return Math.max(l, r);
        case "min":
          return Math.min(l, r);
      }
      return 0;
    }
    case "cmp": {
      const l = evalExpr(expr.left, ctx) as any;
      const r = evalExpr(expr.right, ctx) as any;
      switch (expr.op) {
        case ">":
          return l > r;
        case "<":
          return l < r;
        case ">=":
          return l >= r;
        case "<=":
          return l <= r;
        case "==":
          return l === r;
        case "!=":
          return l !== r;
      }
      return false;
    }
    case "bool-op": {
      if (expr.op === "not") {
        const v = expr.args[0] ? toBool(evalExpr(expr.args[0], ctx)) : false;
        return !v;
      }
      if (expr.op === "and") {
        for (const a of expr.args) {
          if (!toBool(evalExpr(a, ctx))) return false;
        }
        return true;
      }
      if (expr.op === "or") {
        for (const a of expr.args) {
          if (toBool(evalExpr(a, ctx))) return true;
        }
        return false;
      }
      return false;
    }
    case "hasTag": {
      const tags = ctx.tags || [];
      return tags.includes(expr.tag);
    }
    case "if": {
      const cond = toBool(evalExpr(expr.condition, ctx));
      return cond ? evalExpr(expr.then, ctx) : evalExpr(expr.else, ctx);
    }
  }
}

function getPath(obj: any, path: string): unknown {
  const parts = path.split(".");
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
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

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  return false;
}

