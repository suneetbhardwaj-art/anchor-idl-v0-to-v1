#!/usr/bin/env node
/**
 * anchor-idl-v0-to-v1 CLI
 *
 * Usage:
 *   npx anchor-idl-v0-to-v1 <input.json> [output.json]
 *   npx anchor-idl-v0-to-v1 --dir ./idls/
 *
 * Options:
 *   --dry-run     Print results without writing files
 *   --verbose     Show all warnings and stats
 *   --dir <path>  Process all .json files in a directory
 */

import * as fs from "fs";
import * as path from "path";
import { migrateIdlJson } from "./migrate";

interface CliOptions {
  dryRun: boolean;
  verbose: boolean;
  dir?: string;
  input?: string;
  output?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const opts: CliOptions = { dryRun: false, verbose: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") opts.dryRun = true;
    else if (args[i] === "--verbose") opts.verbose = true;
    else if (args[i] === "--dir") opts.dir = args[++i];
    else if (!opts.input) opts.input = args[i];
    else if (!opts.output) opts.output = args[i];
  }

  return opts;
}

function printBanner(): void {
  console.log("\n╔═══════════════════════════════════════════════╗");
  console.log("║   Anchor IDL v0 → v1 Migration Codemod        ║");
  console.log("║   For Anchor v0.30+ compatibility             ║");
  console.log("╚═══════════════════════════════════════════════╝\n");
}

function processFile(inputPath: string, outputPath: string, opts: CliOptions): boolean {
  const absInput = path.resolve(inputPath);

  if (!fs.existsSync(absInput)) {
    console.error(`  ✗ File not found: ${absInput}`);
    return false;
  }

  const jsonString = fs.readFileSync(absInput, "utf-8");
  const result = migrateIdlJson(jsonString);

  const fileName = path.basename(inputPath);

  if (!result.success) {
    console.error(`  ✗ ${fileName}: Migration failed`);
    result.errors.forEach((e) => console.error(`    ERROR: ${e}`));
    return false;
  }

  // Print stats
  const s = result.stats;
  console.log(`  ✓ ${fileName}`);
  console.log(
    `    Instructions: ${s.instructionsConverted} | Accounts: ${s.accountsConverted} | Types: ${s.typesConverted}`
  );
  if (s.accountFieldsRenamed > 0) {
    console.log(`    Account names renamed (camelCase → snake_case): ${s.accountFieldsRenamed}`);
  }

  if (opts.verbose || result.warnings.length > 0) {
    result.warnings.forEach((w) => console.warn(`    ⚠ ${w}`));
  }

  if (!opts.dryRun && result.outputIdl) {
    const absOutput = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(absOutput), { recursive: true });
    fs.writeFileSync(absOutput, JSON.stringify(result.outputIdl, null, 2), "utf-8");
    console.log(`    → Written to: ${absOutput}`);
  } else if (opts.dryRun) {
    console.log(`    → DRY RUN: Would write to: ${outputPath}`);
    if (opts.verbose) {
      console.log(JSON.stringify(result.outputIdl, null, 2));
    }
  }

  return true;
}

function processDirectory(dirPath: string, opts: CliOptions): void {
  const absDir = path.resolve(dirPath);

  if (!fs.existsSync(absDir)) {
    console.error(`Directory not found: ${absDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(absDir).filter((f) => f.endsWith(".json"));

  if (files.length === 0) {
    console.log(`No .json files found in ${absDir}`);
    return;
  }

  console.log(`Processing ${files.length} IDL file(s) in ${absDir}\n`);

  let succeeded = 0;
  let failed = 0;

  for (const file of files) {
    const inputPath = path.join(absDir, file);
    const outputPath = path.join(absDir, "v1", file);

    if (processFile(inputPath, outputPath, opts)) {
      succeeded++;
    } else {
      failed++;
    }
  }

  console.log(`\n─────────────────────────────────────`);
  console.log(`Done! ${succeeded} succeeded, ${failed} failed.`);
  if (!opts.dryRun && succeeded > 0) {
    console.log(`v1 IDLs written to: ${path.join(absDir, "v1")}/`);
  }
}

function main(): void {
  printBanner();
  const opts = parseArgs(process.argv);

  if (opts.dir) {
    processDirectory(opts.dir, opts);
    return;
  }

  if (!opts.input) {
    console.log("Usage:");
    console.log("  npx anchor-idl-v0-to-v1 <input.json> [output.json]");
    console.log("  npx anchor-idl-v0-to-v1 --dir ./idls/");
    console.log("\nOptions:");
    console.log("  --dry-run     Show what would be changed without writing files");
    console.log("  --verbose     Show detailed warnings and output JSON");
    console.log("  --dir <path>  Process all .json files in a directory\n");
    process.exit(0);
  }

  const outputPath =
    opts.output ??
    opts.input.replace(/\.json$/, "") + ".v1.json";

  console.log(`Migrating: ${opts.input}\n`);
  const success = processFile(opts.input, outputPath, opts);
  process.exit(success ? 0 : 1);
}

main();
