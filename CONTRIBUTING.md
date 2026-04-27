# Contributing

## Found a pattern that isn't handled?

Open an issue with:
1. The v0 IDL snippet (the input)
2. What the v1 output should look like
3. Which Anchor version introduced the change

We'll add a test case and fix it in the next release.

## Running tests locally

```bash
npm install
npm run build
npm test
```

All 55 tests must pass before any PR is merged.

## Adding a new transformation

1. Add the type change to `src/types.ts`
2. Add the migration logic to `src/migrate.ts`
3. Add a unit test in `test/migrate.test.ts`
4. Add input/expected fixtures if it's a new pattern
5. Run `npm test` — all 55 + your new tests must pass

## Publishing a new version

```bash
# Bump version in package.json and .codemodrc.json
npm run build
npx codemod publish
```
