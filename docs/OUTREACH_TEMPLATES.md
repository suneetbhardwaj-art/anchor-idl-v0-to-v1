# Framework Adoption Outreach Templates

Use these to contact Anchor maintainers and get your codemod officially referenced.
This is worth up to $2,000 in the hackathon.

---

## GitHub Issue Template

**Title:** Add codemod for automated IDL v0 → v1 migration

**Body:**

Hi Anchor team 

I've built an automated codemod that migrates Anchor IDL v0 (pre-0.30) JSON files to the new v1 spec. It handles ~95% of the migration deterministically:

- `isMut` → `writable` (omitted when false)
- `isSigner` → `signer` (omitted when false)  
- camelCase account names → snake_case
- `{ defined: "X" }` → `{ defined: { name: "X" } }` for all type references
- Hoists `metadata.address` to top-level `address`
- Restructures `name`/`version` into the `metadata` object
- Adds discriminators to instructions, accounts, and events

**Tested on:** Marinade Finance IDL (Anchor 0.27) — 16 instructions, 47 field renames, 0 false positives.

**Links:**
- GitHub repo: [[link to repo](https://github.com/suneetbhardwaj-art/anchor-idl-v0-to-v1)]
- Codemod registry: `npx codemod anchor-idl-v0-to-v1`

Would you be open to referencing this in the [v0.30 upgrade guide](https://www.anchor-lang.com/release-notes/0.30.0) or the [IDL docs](https://solana.com/developers/guides/advanced/idls)? 

Even a one-line mention like `"For automated migration, try [codemod]"` would be incredibly helpful for the community. Happy to address any feedback!

---

## Discord Message Template (Anchor Discord #tooling channel)

Hey everyone 

I built an automated codemod for the Anchor IDL v0 → v1 migration (the one where `isMut`/`isSigner` became `writable`/`signer` in v0.30).

It handles ~95% of the migration automatically — including the camelCase → snake_case account renames that are easy to miss.

`npx codemod anchor-idl-v0-to-v1 --target ./target/idl/`

Tested on real mainnet IDLs. Repo here: [[link](https://github.com/suneetbhardwaj-art/anchor-idl-v0-to-v1)]

Tagging @[maintainer] — would love your feedback / any edge cases I might have missed!

---

## Twitter/X Post Template

Just shipped an automated codemod for the Anchor IDL v0 → v1 migration 

Tired of manually changing `isMut: true` to `writable: true` across hundreds of accounts? One command handles 95% of it:

```
npx codemod anchor-idl-v0-to-v1 --target ./target/idl/
```

- isMut → writable
- isSigner → signer  
- camelCase → snake_case account names
- Type definition restructuring
- Zero false positives

Built with @codemod_com 

[[link to repo](https://github.com/suneetbhardwaj-art/anchor-idl-v0-to-v1)]

#Solana #Anchor #Web3 #DevTools
