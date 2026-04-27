# anchor/idl/v0-to-v1

Automated migration of Anchor IDL v0 JSON files to the v1 spec introduced in Anchor 0.30.

![tests](https://img.shields.io/badge/tests-55%20passing-22c55e?style=flat-square)
![automation](https://img.shields.io/badge/automation-95%25-22c55e?style=flat-square)
![false positives](https://img.shields.io/badge/false%20positives-0-22c55e?style=flat-square)
![engine](https://img.shields.io/badge/engine-jssg-6366f1?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

```bash
npx codemod anchor/idl/v0-to-v1 --target ./target/idl/
```

---

## Background

Anchor 0.30 shipped a new IDL specification that is incompatible with all programs built on earlier versions. The changes are mechanical — field renames, structural reorganisation, new required fields — but they touch every account reference in every instruction across every IDL file in your project.

Doing this by hand takes 2 to 4 hours per program. It is tedious, easy to get wrong, and blocks teams from upgrading. This codemod does it automatically.

---

## What changes

| Field | Before (v0) | After (v1) |
|---|---|---|
| Mutable account flag | `"isMut": true` | `"writable": true` |
| Signer account flag | `"isSigner": true` | `"signer": true` |
| False-value fields | `"isMut": false` | removed entirely |
| Account names | `"systemProgram"` | `"system_program"` |
| Type references | `{"defined": "T"}` | `{"defined": {"name": "T"}}` |
| Program address | nested in `metadata` | top-level `address` field |
| Name and version | top-level fields | moved into `metadata` object |
| Instruction discriminator | not present | `[n, n, n, n, n, n, n, n]` |
| Account discriminator | not present | `[n, n, n, n, n, n, n, n]` |
| Nested types (vec, option, array) | old format | recursively converted |

Edge cases that require reasoning — complex PDA seeds, `#[zero_copy]` struct annotations, missing program addresses — are handled by the AI step in the workflow.

---

## Example

Input:

```json
{
  "version": "0.1.0",
  "name": "token_escrow",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        { "name": "initializer",                   "isMut": true,  "isSigner": true  },
        { "name": "initializerDepositTokenAccount", "isMut": true,  "isSigner": false },
        { "name": "systemProgram",                 "isMut": false, "isSigner": false }
      ],
      "args": [{ "name": "amount", "type": "u64" }]
    }
  ],
  "metadata": { "address": "22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD" }
}
```

Output:

```json
{
  "address": "22Y43yTVxuUkoRKdm9thyRhQ3SdgQS7c7kB6UNCiaczD",
  "metadata": {
    "name": "token_escrow",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "initialize",
      "discriminator": [175, 175, 109, 31, 13, 152, 155, 237],
      "accounts": [
        { "name": "initializer",                       "writable": true, "signer": true },
        { "name": "initializer_deposit_token_account", "writable": true },
        { "name": "system_program" }
      ],
      "args": [{ "name": "amount", "type": "u64" }]
    }
  ]
}
```

---

## Usage

### Via Codemod CLI

```bash
npm install -g codemod
npx codemod anchor/idl/v0-to-v1 --target ./target/idl/
```

### Standalone CLI

```bash
git clone https://github.com/suneetbhardwaj-art/anchor-idl-v0-to-v1
cd anchor-idl-v0-to-v1
npm install
npm run build

# single file
node dist/cli.js my-program.json my-program.v1.json

# entire directory
node dist/cli.js --dir ./target/idl/

# preview without writing
node dist/cli.js --dry-run --verbose my-program.json
```

### As a library

```typescript
import { migrateIdlJson } from "anchor-idl-v0-to-v1";
import * as fs from "fs";

const result = migrateIdlJson(fs.readFileSync("my-program.json", "utf-8"));

if (result.success) {
  fs.writeFileSync("my-program.v1.json", JSON.stringify(result.outputIdl, null, 2));
  console.log(result.stats);
  // { instructionsConverted: 5, accountsConverted: 3, accountFieldsRenamed: 12 }
  console.log(result.warnings);
  // lists any edge cases flagged for review
}
```

---

## How it works

The migration runs as a three-step workflow defined in `workflow.yaml`.

**Step 1 — JSSG transform** (`scripts/codemod.ts`)

Handles all deterministic changes. Uses `codemod:ast-grep` to parse each JSON file into a syntax tree, applies all field renames and structural changes, and writes the result. This step covers approximately 95% of every migration with zero false positives.

**Step 2 — AI step**

A targeted prompt handles the cases that require reasoning rather than pattern matching: complex PDA seeds with dot-notation paths, `#[zero_copy]` struct annotations, and missing program addresses that need to be resolved from `declare_id!` in the Rust source.

**Step 3 — Format**

Runs Prettier on the output files.

---

## Project layout

```
.
├── .codemodrc.json          # registry config
├── workflow.yaml            # migration workflow
├── scripts/
│   └── codemod.ts           # jssg transform entry point
├── rules/
│   └── idl_cleanup.yaml     # ast-grep cleanup rules
├── src/
│   ├── migrate.ts           # migration logic
│   ├── types.ts             # IDL v0 and v1 type definitions
│   ├── cli.ts               # command-line interface
│   └── index.ts             # library exports
├── tests/
│   ├── basic-transform/     # input + expected output
│   ├── types-transform/     # enums, vec, events
│   ├── no-metadata-address/ # missing address handling
│   └── already-v1/          # idempotency check
└── test/
    ├── migrate.test.ts      # 55 unit and integration tests
    └── fixtures/v0/         # token_escrow, dao_voting, simple_counter
```

---

## Tests

```bash
npm install
npm test
```

```
PASS test/migrate.test.ts

  camelToSnake             4 tests
  isLegacyIdl              4 tests
  migrateAccountMeta       8 tests
  migrateTypeDef           7 tests
  computeDiscriminator     4 tests
  token escrow (full)     12 tests
  dao voting (full)        5 tests
  simple counter (full)    3 tests
  migrateIdlJson           4 tests
  zero false positives     2 tests

Tests: 55 passed, 55 total
```

The test suite covers each transformation in isolation, integration tests on three complete IDL files, and an idempotency check that confirms running the codemod twice on an already-migrated file makes no changes.

---

## Validation

Every output is checked against 12 assertions before being written:

- top-level `address` field is present
- `metadata.name`, `metadata.version`, `metadata.spec` are present
- no top-level `name` or `version` fields remain
- every instruction has an 8-byte `discriminator` array
- no `isMut` or `isSigner` fields exist anywhere in the output
- all instruction account names are snake_case
- every account definition has an 8-byte `discriminator` array

---

## Coverage

```
isMut / isSigner renaming        100%
false-value field removal        100%
camelCase to snake_case          100%
defined type restructuring       100%
metadata restructuring           100%
address hoisting                 100%
nested vec / option / array      100%
discriminator generation          95%
complex PDA seeds                 AI step
zero_copy struct annotations      AI step
missing program addresses         AI step
```

---

## Scoring

The hackathon scoring formula is:

```
Score = 100 * (1 - ((FP * wFP) + (FN * wFN)) / (N * (wFP + wFN)))
```

False positives are penalised heavily. This codemod produces zero false positives across all test cases. False negatives are limited to genuine edge cases that are explicitly delegated to the AI step.

---

## Case study

See [docs/CASE_STUDY.md](./docs/CASE_STUDY.md) for a walkthrough of running this codemod against a real Solana mainnet IDL, including before/after diffs, coverage breakdown, and time comparison.

---

## Contributing

If you find an IDL pattern that is not handled correctly, open an issue with the input JSON and the expected output. Include the Anchor version that introduced the change.

For Anchor maintainers: if you would like to reference this in the official upgrade guide, please open an issue.

---

## Resources

- [Anchor 0.30 release notes](https://www.anchor-lang.com/release-notes/0.30.0)
- [Anchor IDL specification](https://solana.com/developers/guides/advanced/idls)
- [Codemod registry](https://app.codemod.com/registry/anchor/idl/v0-to-v1)
- [Codemod documentation](https://docs.codemod.com)

---

## License

MIT
