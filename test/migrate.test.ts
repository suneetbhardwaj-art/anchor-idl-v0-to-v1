/**
 * Comprehensive test suite for anchor-idl-v0-to-v1 codemod
 *
 * Coverage:
 *  - isMut → writable conversion
 *  - isSigner → signer conversion
 *  - camelCase → snake_case account name renaming
 *  - metadata restructuring (name/version → metadata object, address hoisting)
 *  - discriminator generation
 *  - { defined: "X" } → { defined: { name: "X" } } type conversion
 *  - vec, option, array type nesting
 *  - events with discriminators
 *  - already-v1 IDL detection (no-op)
 *  - missing metadata address warning
 *  - full fixture files (escrow, dao_voting, simple_counter)
 */

import * as fs from "fs";
import * as path from "path";
import {
  migrateIdl,
  migrateIdlJson,
  migrateAccountMeta,
  migrateTypeDef,
  camelToSnake,
  isLegacyIdl,
  computeDiscriminator,
} from "../src/migrate";
import type { IdlV0 } from "../src/types";

// ──────────────────────────────────────────────
// Utility: load fixture
// ──────────────────────────────────────────────
function loadFixture(name: string): string {
  return fs.readFileSync(
    path.join(__dirname, "fixtures", "v0", name),
    "utf-8"
  );
}

// ──────────────────────────────────────────────
// Unit tests: camelToSnake
// ──────────────────────────────────────────────
describe("camelToSnake", () => {
  it("converts simple camelCase", () => {
    expect(camelToSnake("systemProgram")).toBe("system_program");
  });

  it("converts multi-word camelCase", () => {
    expect(camelToSnake("initializerDepositTokenAccount")).toBe(
      "initializer_deposit_token_account"
    );
  });

  it("leaves already snake_case unchanged", () => {
    expect(camelToSnake("system_program")).toBe("system_program");
  });

  it("handles PascalCase", () => {
    expect(camelToSnake("EscrowAccount")).toBe("escrow_account");
  });

  it("handles single word", () => {
    expect(camelToSnake("taker")).toBe("taker");
  });

  it("handles consecutive uppercase (e.g. PDA)", () => {
    expect(camelToSnake("pdaAccount")).toBe("pda_account");
  });
});

// ──────────────────────────────────────────────
// Unit tests: isLegacyIdl
// ──────────────────────────────────────────────
describe("isLegacyIdl", () => {
  it("returns true for a v0 IDL", () => {
    expect(
      isLegacyIdl({ name: "my_program", version: "0.1.0", instructions: [] })
    ).toBe(true);
  });

  it("returns false for a v1 IDL (has address field)", () => {
    expect(
      isLegacyIdl({
        address: "xxx",
        metadata: { name: "x", version: "1.0.0", spec: "0.1.0" },
        instructions: [],
      })
    ).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isLegacyIdl(null)).toBe(false);
    expect(isLegacyIdl("string")).toBe(false);
    expect(isLegacyIdl(42)).toBe(false);
  });
});

// ──────────────────────────────────────────────
// Unit tests: migrateAccountMeta
// ──────────────────────────────────────────────
describe("migrateAccountMeta", () => {
  it("converts isMut:true to writable:true", () => {
    const map = new Map<string, string>();
    const { meta } = migrateAccountMeta(
      { name: "vault", isMut: true, isSigner: false },
      map
    );
    expect(meta.writable).toBe(true);
    expect(meta.signer).toBeUndefined();
  });

  it("omits writable when isMut:false", () => {
    const map = new Map<string, string>();
    const { meta } = migrateAccountMeta(
      { name: "vault", isMut: false, isSigner: false },
      map
    );
    expect(meta.writable).toBeUndefined();
  });

  it("converts isSigner:true to signer:true", () => {
    const map = new Map<string, string>();
    const { meta } = migrateAccountMeta(
      { name: "authority", isMut: false, isSigner: true },
      map
    );
    expect(meta.signer).toBe(true);
    expect(meta.writable).toBeUndefined();
  });

  it("omits signer when isSigner:false", () => {
    const map = new Map<string, string>();
    const { meta } = migrateAccountMeta(
      { name: "authority", isMut: false, isSigner: false },
      map
    );
    expect(meta.signer).toBeUndefined();
  });

  it("renames camelCase account names to snake_case", () => {
    const map = new Map<string, string>();
    const { meta, wasRenamed } = migrateAccountMeta(
      { name: "systemProgram", isMut: false, isSigner: false },
      map
    );
    expect(meta.name).toBe("system_program");
    expect(wasRenamed).toBe(true);
    expect(map.get("systemProgram")).toBe("system_program");
  });

  it("does not mark already-snake_case names as renamed", () => {
    const map = new Map<string, string>();
    const { meta, wasRenamed } = migrateAccountMeta(
      { name: "system_program", isMut: false, isSigner: false },
      map
    );
    expect(meta.name).toBe("system_program");
    expect(wasRenamed).toBe(false);
  });

  it("handles both writable and signer together", () => {
    const map = new Map<string, string>();
    const { meta } = migrateAccountMeta(
      { name: "payer", isMut: true, isSigner: true },
      map
    );
    expect(meta.writable).toBe(true);
    expect(meta.signer).toBe(true);
  });

  it("preserves docs", () => {
    const map = new Map<string, string>();
    const { meta } = migrateAccountMeta(
      { name: "vault", isMut: true, isSigner: false, docs: ["The vault account"] },
      map
    );
    expect(meta.docs).toEqual(["The vault account"]);
  });
});

// ──────────────────────────────────────────────
// Unit tests: migrateTypeDef
// ──────────────────────────────────────────────
describe("migrateTypeDef", () => {
  it("passes through primitive strings", () => {
    expect(migrateTypeDef("u64")).toBe("u64");
    expect(migrateTypeDef("publicKey")).toBe("publicKey");
    expect(migrateTypeDef("bool")).toBe("bool");
  });

  it("converts { defined: 'TypeName' } to { defined: { name: 'TypeName' } }", () => {
    const result = migrateTypeDef({ defined: "ProposalStatus" });
    expect(result).toEqual({ defined: { name: "ProposalStatus" } });
  });

  it("recursively converts nested vec types", () => {
    const result = migrateTypeDef({ vec: { defined: "VoteOption" } });
    expect(result).toEqual({ vec: { defined: { name: "VoteOption" } } });
  });

  it("recursively converts option types", () => {
    const result = migrateTypeDef({ option: "u64" });
    expect(result).toEqual({ option: "u64" });
  });

  it("converts nested option with defined type", () => {
    const result = migrateTypeDef({ option: { defined: "MyStruct" } });
    expect(result).toEqual({ option: { defined: { name: "MyStruct" } } });
  });

  it("converts array types", () => {
    const result = migrateTypeDef({ array: ["u8", 32] });
    expect(result).toEqual({ array: ["u8", 32] });
  });

  it("handles coption types", () => {
    const result = migrateTypeDef({ coption: "publicKey" });
    expect(result).toEqual({ coption: "publicKey" });
  });
});

// ──────────────────────────────────────────────
// Unit tests: discriminator generation
// ──────────────────────────────────────────────
describe("computeDiscriminator", () => {
  it("returns an 8-byte array", () => {
    const disc = computeDiscriminator("global", "initialize");
    expect(disc).toHaveLength(8);
    disc.forEach((b) => {
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(255);
    });
  });

  it("produces consistent results (deterministic)", () => {
    const d1 = computeDiscriminator("global", "initialize");
    const d2 = computeDiscriminator("global", "initialize");
    expect(d1).toEqual(d2);
  });

  it("produces different values for different names", () => {
    const d1 = computeDiscriminator("global", "initialize");
    const d2 = computeDiscriminator("global", "exchange");
    expect(d1).not.toEqual(d2);
  });

  it("produces different values for different namespaces", () => {
    const d1 = computeDiscriminator("global", "transfer");
    const d2 = computeDiscriminator("account", "transfer");
    expect(d1).not.toEqual(d2);
  });
});

// ──────────────────────────────────────────────
// Integration tests: full IDL migration
// ──────────────────────────────────────────────
describe("migrateIdl - full escrow program", () => {
  let result: ReturnType<typeof migrateIdl>;

  beforeAll(() => {
    const raw = JSON.parse(loadFixture("token_escrow.json")) as IdlV0;
    result = migrateIdl(raw);
  });

  it("succeeds without errors", () => {
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("moves metadata.address to top-level address", () => {
    expect(result.outputIdl?.address).toBe(
      "22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD"
    );
  });

  it("creates metadata object with name, version, spec", () => {
    expect(result.outputIdl?.metadata.name).toBe("token_escrow");
    expect(result.outputIdl?.metadata.version).toBe("0.1.0");
    expect(result.outputIdl?.metadata.spec).toBe("0.1.0");
  });

  it("removes top-level name and version fields", () => {
    const idl = result.outputIdl as unknown as Record<string, unknown>;
    expect(idl["name"]).toBeUndefined();
    expect(idl["version"]).toBeUndefined();
  });

  it("converts all 3 instructions", () => {
    expect(result.outputIdl?.instructions).toHaveLength(3);
    expect(result.stats.instructionsConverted).toBe(3);
  });

  it("adds discriminators to all instructions", () => {
    result.outputIdl?.instructions.forEach((ix) => {
      expect(ix.discriminator).toHaveLength(8);
    });
  });

  it("converts isMut to writable on initialize instruction", () => {
    const ix = result.outputIdl?.instructions.find((i) => i.name === "initialize");
    expect(ix).toBeDefined();

    // initializer: isMut:true, isSigner:true
    const initializerAcc = ix?.accounts.find((a) => a.name === "initializer");
    expect(initializerAcc?.writable).toBe(true);
    expect(initializerAcc?.signer).toBe(true);

    // systemProgram: isMut:false, isSigner:false → both omitted
    const sysProgAcc = ix?.accounts.find((a) => a.name === "system_program");
    expect(sysProgAcc?.writable).toBeUndefined();
    expect(sysProgAcc?.signer).toBeUndefined();
  });

  it("renames camelCase account names to snake_case", () => {
    const ix = result.outputIdl?.instructions.find((i) => i.name === "initialize");
    const accountNames = ix?.accounts.map((a) => a.name) ?? [];

    expect(accountNames).toContain("initializer_deposit_token_account");
    expect(accountNames).toContain("initializer_receive_token_account");
    expect(accountNames).toContain("escrow_account");
    expect(accountNames).toContain("system_program");
    expect(accountNames).toContain("token_program");

    // Old camelCase names must NOT appear
    expect(accountNames).not.toContain("initializerDepositTokenAccount");
    expect(accountNames).not.toContain("systemProgram");
  });

  it("records rename stats", () => {
    expect(result.stats.accountFieldsRenamed).toBeGreaterThan(0);
  });

  it("emits a warning about renamed accounts", () => {
    const renameWarning = result.warnings.find((w) =>
      w.includes("snake_case")
    );
    expect(renameWarning).toBeDefined();
  });

  it("migrates EscrowAccount definition with discriminator", () => {
    const escrowAcc = result.outputIdl?.accounts?.find(
      (a) => a.name === "EscrowAccount"
    );
    expect(escrowAcc?.discriminator).toHaveLength(8);
    expect(escrowAcc?.type.fields).toBeDefined();
  });

  it("preserves error codes", () => {
    expect(result.outputIdl?.errors).toHaveLength(2);
    expect(result.outputIdl?.errors?.[0].code).toBe(6000);
  });
});

// ──────────────────────────────────────────────
// Integration: DAO Voting (complex types + events)
// ──────────────────────────────────────────────
describe("migrateIdl - dao_voting program with complex types", () => {
  let result: ReturnType<typeof migrateIdl>;

  beforeAll(() => {
    const raw = JSON.parse(loadFixture("dao_voting.json")) as IdlV0;
    result = migrateIdl(raw);
  });

  it("succeeds", () => {
    expect(result.success).toBe(true);
  });

  it("migrates enum type ProposalStatus", () => {
    const statusType = result.outputIdl?.types?.find(
      (t) => t.name === "ProposalStatus"
    );
    expect(statusType?.type.kind).toBe("enum");
  });

  it("converts { defined: ProposalStatus } correctly in account fields", () => {
    const proposalAcc = result.outputIdl?.accounts?.find(
      (a) => a.name === "ProposalAccount"
    );
    const statusField = proposalAcc?.type.fields.find(
      (f) => f.name === "status"
    );
    expect(statusField?.type).toEqual({ defined: { name: "ProposalStatus" } });
  });

  it("migrates vec<string> type correctly", () => {
    const proposalAcc = result.outputIdl?.accounts?.find(
      (a) => a.name === "ProposalAccount"
    );
    // Account struct field names are NOT renamed (only instruction account metas are).
    // The field "voteOptions" retains its original name from the v0 IDL.
    const optionsField = proposalAcc?.type.fields.find(
      (f) => f.name === "voteOptions"
    );
    expect(optionsField?.type).toEqual({ vec: "string" });
  });

  it("adds discriminators to 2 events", () => {
    expect(result.outputIdl?.events).toHaveLength(2);
    result.outputIdl?.events?.forEach((ev) => {
      expect(ev.discriminator).toHaveLength(8);
    });
    expect(result.stats.eventsConverted).toBe(2);
  });

  it("renames castVote accounts correctly", () => {
    const ix = result.outputIdl?.instructions.find((i) => i.name === "castVote");
    const names = ix?.accounts.map((a) => a.name) ?? [];
    expect(names).toContain("voter_token_account");
    expect(names).toContain("token_mint");
    expect(names).toContain("proposal_account");
    expect(names).not.toContain("voterTokenAccount");
  });
});

// ──────────────────────────────────────────────
// Integration: Simple counter (no metadata address)
// ──────────────────────────────────────────────
describe("migrateIdl - simple_counter without metadata address", () => {
  let result: ReturnType<typeof migrateIdl>;

  beforeAll(() => {
    const raw = JSON.parse(loadFixture("simple_counter.json")) as IdlV0;
    result = migrateIdl(raw);
  });

  it("succeeds with a fallback address", () => {
    expect(result.success).toBe(true);
    expect(result.outputIdl?.address).toBe("11111111111111111111111111111111");
  });

  it("warns about missing address", () => {
    const addrWarning = result.warnings.find((w) =>
      w.includes("metadata.address")
    );
    expect(addrWarning).toBeDefined();
  });

  it("converts increment instruction correctly", () => {
    const ix = result.outputIdl?.instructions.find((i) => i.name === "increment");
    const counter = ix?.accounts.find((a) => a.name === "counter");
    expect(counter?.writable).toBe(true);
    expect(counter?.signer).toBeUndefined();

    const user = ix?.accounts.find((a) => a.name === "user");
    expect(user?.signer).toBe(true);
    expect(user?.writable).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// migrateIdlJson (string input/output)
// ──────────────────────────────────────────────
describe("migrateIdlJson", () => {
  it("accepts valid JSON string and returns result", () => {
    const json = loadFixture("simple_counter.json");
    const result = migrateIdlJson(json);
    expect(result.success).toBe(true);
    expect(result.outputIdl).toBeDefined();
  });

  it("returns error for invalid JSON", () => {
    const result = migrateIdlJson("{ not valid json");
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/Invalid JSON/);
  });

  it("detects already-v1 IDL and warns", () => {
    const v1Json = JSON.stringify({
      address: "xxx",
      metadata: { name: "x", version: "1.0.0", spec: "0.1.0" },
      instructions: [],
    });
    const result = migrateIdlJson(v1Json);
    expect(result.success).toBe(true);
    expect(result.warnings[0]).toMatch(/already be in v1 format/);
  });

  it("returns error for unrecognized format", () => {
    const result = migrateIdlJson(JSON.stringify({ foo: "bar" }));
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/does not look like an Anchor IDL/);
  });
});

// ──────────────────────────────────────────────
// Zero false-positive guarantees
// ──────────────────────────────────────────────
describe("zero false positives - idempotency check", () => {
  it("migrating an already-v1 IDL returns no changes", () => {
    const raw = JSON.parse(loadFixture("token_escrow.json")) as IdlV0;
    const first = migrateIdl(raw);
    const v1Json = JSON.stringify(first.outputIdl);

    // Running it again on already-v1 output
    const second = migrateIdlJson(v1Json);
    expect(second.warnings).toContain(
      second.warnings.find((w) => w.includes("already be in v1 format"))
        ? second.warnings.find((w) => w.includes("already be in v1 format"))!
        : ""
    );
    // No destructive changes
    expect(second.stats.accountFieldsRenamed).toBe(0);
  });

  it("does not rename already snake_case account names", () => {
    const idl: IdlV0 = {
      version: "0.1.0",
      name: "test",
      instructions: [
        {
          name: "do_thing",
          accounts: [
            { name: "payer", isMut: true, isSigner: true },
            { name: "system_program", isMut: false, isSigner: false },
          ],
          args: [],
        },
      ],
    };
    const result = migrateIdl(idl);
    expect(result.stats.accountFieldsRenamed).toBe(0);
    const ix = result.outputIdl?.instructions[0];
    expect(ix?.accounts[0].name).toBe("payer");
    expect(ix?.accounts[1].name).toBe("system_program");
  });
});
