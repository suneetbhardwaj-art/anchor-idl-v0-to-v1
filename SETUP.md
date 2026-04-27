# Setup & Usage Guide

## Requirements

- **Node.js** v18 or higher — download from https://nodejs.org
- **npm** v8 or higher (comes with Node.js)

Check your version:
```
node --version
npm --version
```

---

## Step 1 — Install dependencies

Open your terminal (PowerShell on Windows, Terminal on Mac/Linux) inside the project folder:

```
npm install
```

---

## Step 2 — Build the project

```
npm run build
```

You should see no errors. A `dist/` folder will be created.

---

## Step 3 — Run the tests

```
npm test
```

Expected output:
```
Tests: 55 passed, 55 total
```

---

## Step 4 — Migrate your IDL files

**Migrate a single file:**
```
node dist/cli.js path/to/myprogram.json path/to/myprogram.v1.json
```

**Migrate all JSON files in a folder:**
```
node dist/cli.js --dir ./target/idl/
```

**Preview without writing any files:**
```
node dist/cli.js --dry-run --verbose path/to/myprogram.json
```

---

## Troubleshooting

### "SyntaxError: missing ) after argument list"
You have an older Node.js version. Update to Node.js v18+.

### "Cannot find module" errors
Run `npm install` first, then `npm run build`, then `npm test`.

### "'tsc' is not recognized"
Run `npm install` — this installs TypeScript locally.

### Tests fail on Windows with path errors
Make sure you're running commands from inside the `anchor-idl-migration` folder.
