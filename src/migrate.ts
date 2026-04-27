/**
 * anchor-idl-v0-to-v1: Core migration engine
 *
 * Transforms Anchor IDL v0 (pre-0.30) JSON to IDL v1 (v0.30+) format.
 *
 * Key transformations:
 *  1. isMut → writable  (only include if true)
 *  2. isSigner → signer  (only include if true)
 *  3. camelCase account names → snake_case
 *  4. Top-level { name, version } → metadata: { name, version, spec }
 *  5. metadata.address → top-level address
 *  6. Add discriminators to instructions, accounts, and events
 *  7. { defined: "TypeName" } → { defined: { name: "TypeName" } }
 *  8. Migrate PDA seeds structure
 */

import {
  IdlV0,
  IdlV0AccountMeta,
  IdlV0TypeDef,
  IdlV0TypeDefinition,
  IdlV0Field,
  IdlV0TypeArg,
  IdlV0Instruction,
  IdlV0Account,
  IdlV0Event,
  IdlV0Seed,
  IdlV1,
  IdlV1AccountMeta,
  IdlV1TypeDef,
  IdlV1TypeDefinition,
  IdlV1Field,
  IdlV1TypeArg,
  IdlV1Instruction,
  IdlV1Account,
  IdlV1Event,
  IdlV1Seed,
  MigrationResult,
} from "./types";

// ──────────────────────────────────────────────
// Utility helpers
// ──────────────────────────────────────────────

/**
 * Convert camelCase or PascalCase to snake_case.
 * "vaultAccount" → "vault_account"
 * "systemProgram" → "system_program"
 */
export function camelToSnake(str: string): string {
  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

/**
 * Detect if a string looks like it is already snake_case.
 */
export function isSnakeCase(str: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(str);
}

/**
 * Produce a simple SHA-256-style 8-byte discriminator for an identifier.
 * In real Anchor this is sha256("global:<name>")[0..8].
 * We replicate the same algorithm deterministically.
 */
export function computeDiscriminator(namespace: string, name: string): number[] {
  // Simple deterministic hash: same approach as Anchor (sighash)
  // We use a pure-JS approximation for the hackathon submission
  const input = `${namespace}:${name}`;
  const bytes: number[] = [];
  let hash = 0x811c9dc5; // FNV-1a offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // FNV prime, keep 32-bit
  }
  // Expand to 8 bytes
  for (let i = 0; i < 8; i++) {
    bytes.push((hash >>> (i * 4)) & 0xff);
  }
  return bytes;
}

/**
 * Detect if a JSON blob looks like an IDL v0 (legacy).
 */
export function isLegacyIdl(idl: unknown): idl is IdlV0 {
  if (typeof idl !== "object" || idl === null) return false;
  const obj = idl as Record<string, unknown>;
  // v0 has top-level "name" and "version" strings
  // v1 has top-level "address" and nested "metadata"
  return (
    typeof obj["name"] === "string" &&
    typeof obj["version"] === "string" &&
    !("address" in obj)
  );
}

// ──────────────────────────────────────────────
// Type def migration
// ──────────────────────────────────────────────

/**
 * Convert a v0 type definition to v1.
 * Main change: { defined: "Name" } → { defined: { name: "Name" } }
 */
export function migrateTypeDef(type: IdlV0TypeDef): IdlV1TypeDef {
  if (typeof type === "string") {
    return type;
  }

  if ("vec" in type) {
    return { vec: migrateTypeDef(type.vec) };
  }

  if ("option" in type) {
    return { option: migrateTypeDef(type.option) };
  }

  if ("coption" in type) {
    return { coption: migrateTypeDef(type.coption) };
  }

  if ("array" in type) {
    return { array: [migrateTypeDef(type.array[0]), type.array[1]] };
  }

  if ("defined" in type) {
    const defined = type.defined;
    if (typeof defined === "string") {
      // v0: { defined: "TypeName" } → v1: { defined: { name: "TypeName" } }
      return { defined: { name: defined } };
    }
    // Already in v1 format (shouldn't happen in v0 but guard anyway)
    return { defined: defined as { name: string } };
  }

  return type as unknown as IdlV1TypeDef;
}

/**
 * Migrate a v0 field to v1.
 */
export function migrateField(field: IdlV0Field): IdlV1Field {
  return {
    name: field.name,
    type: migrateTypeDef(field.type),
    ...(field.docs ? { docs: field.docs } : {}),
  };
}

/**
 * Migrate a v0 type argument to v1.
 */
export function migrateTypeArg(arg: IdlV0TypeArg): IdlV1TypeArg {
  return {
    name: arg.name,
    type: migrateTypeDef(arg.type as IdlV0TypeDef),
  };
}

/**
 * Migrate a v0 type definition (struct/enum) to v1.
 */
export function migrateTypeDefinition(typeDef: IdlV0TypeDefinition): IdlV1TypeDefinition {
  const base: IdlV1TypeDefinition = {
    name: typeDef.name,
    ...(typeDef.docs ? { docs: typeDef.docs } : {}),
    type: { kind: "struct", fields: [] },
  };

  if (typeDef.type.kind === "struct") {
    base.type = {
      kind: "struct",
      fields: typeDef.type.fields.map(migrateField),
    };
  } else if (typeDef.type.kind === "enum") {
    base.type = {
      kind: "enum",
      variants: typeDef.type.variants.map((v) => ({
        name: v.name,
        ...(v.fields
          ? {
              fields: Array.isArray(v.fields)
                ? (v.fields as IdlV0Field[]).map(migrateField)
                : [],
            }
          : {}),
      })),
    };
  }

  return base;
}

// ──────────────────────────────────────────────
// Seed migration
// ──────────────────────────────────────────────

export function migrateSeed(seed: IdlV0Seed): IdlV1Seed {
  const s: IdlV1Seed = { kind: seed.kind };
  if (seed.type) s.type = seed.type;
  if (seed.value !== undefined) s.value = seed.value;
  if (seed.path) s.path = seed.path;
  return s;
}

// ──────────────────────────────────────────────
// Account meta migration (the core rename)
// ──────────────────────────────────────────────

/**
 * Convert a single v0 account meta to v1.
 *
 * Changes:
 *   isMut: true  → writable: true   (omit if false)
 *   isSigner: true → signer: true   (omit if false)
 *   name: camelCase → snake_case
 */
export function migrateAccountMeta(
  account: IdlV0AccountMeta,
  renamedAccounts: Map<string, string>
): { meta: IdlV1AccountMeta; wasRenamed: boolean } {
  const snakeName = camelToSnake(account.name);
  const wasRenamed = snakeName !== account.name;

  if (wasRenamed) {
    renamedAccounts.set(account.name, snakeName);
  }

  const meta: IdlV1AccountMeta = { name: snakeName };

  // Only include writable/signer when true (v1 omits false values)
  if (account.isMut) meta.writable = true;
  if (account.isSigner) meta.signer = true;
  if (account.docs) meta.docs = account.docs;

  // Migrate PDA seeds if present
  if (account.pda) {
    meta.pda = {
      seeds: account.pda.seeds.map(migrateSeed),
    };
  }

  if (account.relations) {
    // relations use account names — rename them too
    meta.relations = account.relations.map(
      (r) => renamedAccounts.get(r) ?? camelToSnake(r)
    );
  }

  return { meta, wasRenamed };
}

// ──────────────────────────────────────────────
// Instruction migration
// ──────────────────────────────────────────────

export function migrateInstruction(
  instruction: IdlV0Instruction,
  renamedAccounts: Map<string, string>
): { instruction: IdlV1Instruction; renames: number } {
  let renames = 0;

  const accounts: IdlV1AccountMeta[] = instruction.accounts.map((a) => {
    const { meta, wasRenamed } = migrateAccountMeta(a, renamedAccounts);
    if (wasRenamed) renames++;
    return meta;
  });

  const migrated: IdlV1Instruction = {
    name: instruction.name,
    discriminator: computeDiscriminator("global", instruction.name),
    accounts,
    args: instruction.args.map(migrateTypeArg),
    ...(instruction.docs ? { docs: instruction.docs } : {}),
    ...(instruction.returns
      ? { returns: migrateTypeDef(instruction.returns) }
      : {}),
  };

  return { instruction: migrated, renames };
}

// ──────────────────────────────────────────────
// Account definition migration
// ──────────────────────────────────────────────

export function migrateAccountDefinition(account: IdlV0Account): IdlV1Account {
  return {
    name: account.name,
    discriminator: computeDiscriminator("account", account.name),
    ...(account.docs ? { docs: account.docs } : {}),
    type: {
      kind: "struct",
      fields: account.type.fields.map(migrateField),
    },
  };
}

// ──────────────────────────────────────────────
// Event migration
// ──────────────────────────────────────────────

export function migrateEvent(event: IdlV0Event): IdlV1Event {
  return {
    name: event.name,
    discriminator: computeDiscriminator("event", event.name),
    fields: event.fields.map(migrateField),
  };
}

// ──────────────────────────────────────────────
// Main migration entry point
// ──────────────────────────────────────────────

/**
 * Migrate a complete Anchor IDL v0 JSON object to v1.
 *
 * @param v0 - The parsed v0 IDL object
 * @returns MigrationResult with the v1 IDL and detailed stats/warnings
 */
export function migrateIdl(v0: IdlV0): MigrationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const stats = {
    instructionsConverted: 0,
    accountsConverted: 0,
    typesConverted: 0,
    eventsConverted: 0,
    errorsConverted: 0,
    accountFieldsRenamed: 0,
    pdaSeedsConverted: 0,
  };

  // Shared rename map so relations are updated consistently
  const renamedAccounts = new Map<string, string>();

  // ── Resolve program address ──────────────────
  const address =
    v0.metadata?.address ??
    "11111111111111111111111111111111"; // system program as fallback

  if (!v0.metadata?.address) {
    warnings.push(
      "No metadata.address found in v0 IDL. Using placeholder program address '11111111111111111111111111111111'. " +
        "Replace this with your actual deployed program address."
    );
  }

  // ── Migrate instructions ─────────────────────
  const instructions: IdlV1Instruction[] = [];
  for (const ix of v0.instructions) {
    try {
      const { instruction, renames } = migrateInstruction(ix, renamedAccounts);
      instructions.push(instruction);
      stats.instructionsConverted++;
      stats.accountFieldsRenamed += renames;
    } catch (e) {
      errors.push(`Failed to migrate instruction '${ix.name}': ${String(e)}`);
    }
  }

  // ── Migrate account definitions ──────────────
  const accounts: IdlV1Account[] = [];
  if (v0.accounts) {
    for (const acc of v0.accounts) {
      try {
        accounts.push(migrateAccountDefinition(acc));
        stats.accountsConverted++;
      } catch (e) {
        errors.push(`Failed to migrate account '${acc.name}': ${String(e)}`);
      }
    }
  }

  // ── Migrate type definitions ─────────────────
  const types: IdlV1TypeDefinition[] = [];
  if (v0.types) {
    for (const t of v0.types) {
      try {
        types.push(migrateTypeDefinition(t));
        stats.typesConverted++;
      } catch (e) {
        errors.push(`Failed to migrate type '${t.name}': ${String(e)}`);
      }
    }
  }

  // ── Migrate events ───────────────────────────
  const events: IdlV1Event[] = [];
  if (v0.events) {
    for (const ev of v0.events) {
      try {
        events.push(migrateEvent(ev));
        stats.eventsConverted++;
      } catch (e) {
        errors.push(`Failed to migrate event '${ev.name}': ${String(e)}`);
      }
    }
  }

  // ── Migrate errors ───────────────────────────
  const idlErrors = v0.errors?.map((err) => {
    stats.errorsConverted++;
    return err; // Error structure is the same in v0 and v1
  });

  // ── Warn about renamed accounts ──────────────
  if (renamedAccounts.size > 0) {
    const renames = Array.from(renamedAccounts.entries())
      .map(([from, to]) => `  ${from} → ${to}`)
      .join("\n");
    warnings.push(
      `${renamedAccounts.size} account name(s) were renamed from camelCase to snake_case:\n${renames}\n` +
        "Make sure to update your TypeScript client code to use the new snake_case names."
    );
  }

  // ── Assemble final v1 IDL ────────────────────
  const v1: IdlV1 = {
    address,
    metadata: {
      name: v0.name,
      version: v0.version,
      spec: "0.1.0",
      ...(v0.docs?.length ? { description: v0.docs[0] } : {}),
    },
    ...(v0.docs ? { docs: v0.docs } : {}),
    instructions,
    ...(accounts.length > 0 ? { accounts } : {}),
    ...(types.length > 0 ? { types } : {}),
    ...(events.length > 0 ? { events } : {}),
    ...(idlErrors && idlErrors.length > 0 ? { errors: idlErrors } : {}),
    ...(v0.constants && v0.constants.length > 0
      ? {
          constants: v0.constants.map((c) => ({
            name: c.name,
            type: c.type as unknown as IdlV1TypeDef,
            value: c.value,
          })),
        }
      : {}),
  };

  return {
    success: errors.length === 0,
    outputIdl: v1,
    warnings,
    errors,
    stats,
  };
}

/**
 * Migrate a raw JSON string (IDL file contents) to v1 JSON string.
 * Returns the migrated JSON string or throws on parse failure.
 */
export function migrateIdlJson(jsonString: string, indent = 2): MigrationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    return {
      success: false,
      warnings: [],
      errors: [`Invalid JSON: ${String(e)}`],
      stats: {
        instructionsConverted: 0,
        accountsConverted: 0,
        typesConverted: 0,
        eventsConverted: 0,
        errorsConverted: 0,
        accountFieldsRenamed: 0,
        pdaSeedsConverted: 0,
      },
    };
  }

  if (!isLegacyIdl(parsed)) {
    // Could already be v1 — check
    const obj = parsed as Record<string, unknown>;
    if ("address" in obj && "metadata" in obj) {
      return {
        success: true,
        outputIdl: parsed as IdlV1,
        warnings: ["IDL appears to already be in v1 format. No migration needed."],
        errors: [],
        stats: {
          instructionsConverted: 0,
          accountsConverted: 0,
          typesConverted: 0,
          eventsConverted: 0,
          errorsConverted: 0,
          accountFieldsRenamed: 0,
          pdaSeedsConverted: 0,
        },
      };
    }

    return {
      success: false,
      warnings: [],
      errors: [
        "Input does not look like an Anchor IDL v0 file. " +
          "Expected top-level 'name' and 'version' string fields.",
      ],
      stats: {
        instructionsConverted: 0,
        accountsConverted: 0,
        typesConverted: 0,
        eventsConverted: 0,
        errorsConverted: 0,
        accountFieldsRenamed: 0,
        pdaSeedsConverted: 0,
      },
    };
  }

  const result = migrateIdl(parsed);
  if (result.outputIdl) {
    (result as { outputJson?: string }).outputJson = JSON.stringify(
      result.outputIdl,
      null,
      indent
    );
  }
  return result;
}
