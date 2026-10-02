/**
 * Structural JSON diff for per-player views (DECISIONS D10).
 * A patch is computed from an already-filtered view, so it can never carry
 * more than the full snapshot would.
 */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };
export type Path = (string | number)[];
export type PatchOp = { op: 'set'; path: Path; value: unknown } | { op: 'del'; path: Path };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function diff(
  prev: unknown,
  next: unknown,
  path: Path = [],
  out: PatchOp[] = [],
): PatchOp[] {
  if (Object.is(prev, next)) return out;
  if (Array.isArray(prev) && Array.isArray(next)) {
    if (prev.length !== next.length) {
      out.push({ op: 'set', path, value: next });
      return out;
    }
    next.forEach((item, i) => diff(prev[i], item, [...path, i], out));
    return out;
  }
  if (isObject(prev) && isObject(next)) {
    for (const key of Object.keys(prev)) {
      if (!(key in next)) out.push({ op: 'del', path: [...path, key] });
    }
    for (const [key, value] of Object.entries(next)) {
      if (key in prev) diff(prev[key], value, [...path, key], out);
      else out.push({ op: 'set', path: [...path, key], value });
    }
    return out;
  }
  out.push({ op: 'set', path, value: next });
  return out;
}

function cloneShallow(v: unknown): Record<string | number, unknown> {
  if (Array.isArray(v)) return [...(v as unknown[])] as unknown as Record<number, unknown>;
  if (isObject(v)) return { ...v };
  return {};
}

/** Applies ops immutably: untouched branches keep their identity (good for React). */
export function applyPatch<T>(target: T, ops: readonly PatchOp[]): T {
  let root: unknown = target;
  for (const op of ops) root = applyOne(root, op, 0);
  return root as T;
}

function applyOne(node: unknown, op: PatchOp, depth: number): unknown {
  if (depth === op.path.length) return op.op === 'set' ? op.value : undefined;
  const key = op.path[depth] as string | number;
  const copy = cloneShallow(node);
  if (depth === op.path.length - 1 && op.op === 'del') {
    if (Array.isArray(copy)) copy.splice(key as number, 1);
    else Reflect.deleteProperty(copy, key);
    return copy;
  }
  copy[key] = applyOne(copy[key], op, depth + 1);
  return copy;
}
