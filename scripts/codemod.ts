/**
 * anchor/idl/v0-to-v1 — JSSG Transform
 *
 * Uses the official codemod:ast-grep API (jssg runtime).
 * Transforms Anchor IDL v0 JSON files to v1 format.
 *
 * Real jssg API: Transform<LANG> from "codemod:ast-grep"
 * Returns: modified source string | null (no change)
 */

import type { Transform } from "codemod:ast-grep";

// ─────────────────────────────────────────────────────
// Helpers (self-contained — no imports from src/ needed
// because jssg runs in QuickJS, not Node.js)
// ─────────────────────────────────────────────────────

function camelToSnake(str: string): string {
  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function computeDiscriminator(namespace: string, name: string): number[] {
  const input = `${namespace}:${name}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return Array.from({ length: 8 }, (_, i) => (hash >>> (i * 4)) & 0xff);
}

function migrateTypeDef(type: unknown): unknown {
  if (typeof type === "string") return type;
  if (typeof type !== "object" || type === null) return type;
  const t = type as Record<string, unknown>;
  if ("vec" in t)     return { vec:    migrateTypeDef(t.vec) };
  if ("option" in t)  return { option: migrateTypeDef(t.option) };
  if ("coption" in t) return { coption: migrateTypeDef(t.coption) };
  if ("array" in t)   return { array: [(migrateTypeDef((t.array as unknown[])[0])), (t.array as unknown[])[1]] };
  if ("defined" in t) {
    return typeof t.defined === "string"
      ? { defined: { name: t.defined } }
      : type; // already v1
  }
  return type;
}

function migrateField(f: Record<string, unknown>) {
  return { name: f.name, type: migrateTypeDef(f.type), ...(f.docs ? { docs: f.docs } : {}) };
}

function migrateAccountMeta(a: Record<string, unknown>) {
  const out: Record<string, unknown> = { name: camelToSnake(a.name as string) };
  if (a.isMut)    out.writable = true;
  if (a.isSigner) out.signer   = true;
  if (a.docs)     out.docs     = a.docs;
  if (a.pda) {
    const pda = a.pda as Record<string, unknown>;
    out.pda = { seeds: (pda.seeds as unknown[]).map((s: unknown) => s) };
  }
  return out;
}

function migrateInstruction(ix: Record<string, unknown>) {
  return {
    name: ix.name,
    discriminator: computeDiscriminator("global", ix.name as string),
    accounts: (ix.accounts as Record<string, unknown>[]).map(migrateAccountMeta),
    args: (ix.args as Record<string, unknown>[]).map((a) => ({
      name: a.name,
      type: migrateTypeDef(a.type),
    })),
    ...(ix.docs ? { docs: ix.docs } : {}),
    ...(ix.returns ? { returns: migrateTypeDef(ix.returns) } : {}),
  };
}

function migrateAccount(acc: Record<string, unknown>) {
  const type = acc.type as Record<string, unknown>;
  return {
    name: acc.name,
    discriminator: computeDiscriminator("account", acc.name as string),
    ...(acc.docs ? { docs: acc.docs } : {}),
    type: {
      kind: "struct",
      fields: (type.fields as Record<string, unknown>[]).map(migrateField),
    },
  };
}

function migrateEvent(ev: Record<string, unknown>) {
  return {
    name: ev.name,
    discriminator: computeDiscriminator("event", ev.name as string),
    fields: (ev.fields as Record<string, unknown>[]).map(migrateField),
  };
}

function migrateTypeDefinition(t: Record<string, unknown>) {
  const type = t.type as Record<string, unknown>;
  const out: Record<string, unknown> = {
    name: t.name,
    ...(t.docs ? { docs: t.docs } : {}),
  };
  if (type.kind === "struct") {
    out.type = { kind: "struct", fields: (type.fields as Record<string, unknown>[]).map(migrateField) };
  } else if (type.kind === "enum") {
    out.type = {
      kind: "enum",
      variants: (type.variants as Record<string, unknown>[]).map((v) => ({
        name: v.name,
        ...(v.fields ? { fields: (v.fields as Record<string, unknown>[]).map(migrateField) } : {}),
      })),
    };
  } else {
    out.type = type;
  }
  return out;
}

// ─────────────────────────────────────────────────────
// Main transform — this is what jssg calls per file
// ─────────────────────────────────────────────────────

const transform: Transform = (root) => {
  const filename = root.filename();

  // Only process .json files
  if (!filename.endsWith(".json")) return null;

  // Skip well-known non-IDL config files
  const base = filename.split("/").pop() ?? filename;
  const skip = ["package.json", "package-lock.json", "tsconfig.json",
                 ".prettierrc.json", ".eslintrc.json", "anchor.toml"];
  if (skip.includes(base)) return null;

  const source = root.source();

  // Fast pre-check: v0 IDLs always have "isMut" or "isSigner"
  if (!source.includes('"isMut"') && !source.includes('"isSigner"')) return null;

  // Parse
  let v0: Record<string, unknown>;
  try {
    v0 = JSON.parse(source);
  } catch {
    return null;
  }

  // Must be v0 shape: top-level name + version strings, no address
  if (typeof v0.name !== "string" || typeof v0.version !== "string" || "address" in v0) {
    return null;
  }

  // ── Build v1 ──
  const metadata = v0.metadata as Record<string, unknown> | undefined;

  const v1: Record<string, unknown> = {
    address: metadata?.address ?? "11111111111111111111111111111111",
    metadata: {
      name: v0.name,
      version: v0.version,
      spec: "0.1.0",
    },
    instructions: (v0.instructions as Record<string, unknown>[]).map(migrateInstruction),
  };

  if (v0.accounts)  v1.accounts  = (v0.accounts  as Record<string, unknown>[]).map(migrateAccount);
  if (v0.types)     v1.types     = (v0.types     as Record<string, unknown>[]).map(migrateTypeDefinition);
  if (v0.events)    v1.events    = (v0.events    as Record<string, unknown>[]).map(migrateEvent);
  if (v0.errors)    v1.errors    = v0.errors;
  if (v0.constants) v1.constants = v0.constants;

  return JSON.stringify(v1, null, 2);
};

export default transform;
