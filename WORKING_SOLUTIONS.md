# Working Solutions

Use this when you are stuck, want to compare your work with a known-good lesson state, or want to jump straight to the working implementation for the current lab.

This workshop is not graded. Peeking is allowed.

This fast-forward guide covers Labs `00` through `05`. Optional Lab `06` does not have a one-command fast-forward path here.

## Fastest path

From your repo root, run the fast-forward helper for the lab you want:

```bash
node scripts/fast-forward-student-lab.js --lab 00 --target .
node scripts/fast-forward-student-lab.js --lab 01 --target .
node scripts/fast-forward-student-lab.js --lab 02 --target .
node scripts/fast-forward-student-lab.js --lab 03 --target .
node scripts/fast-forward-student-lab.js --lab 04 --target .
node scripts/fast-forward-student-lab.js --lab 05 --target .
```

If you want to see what will change before writing files:

```bash
node scripts/fast-forward-student-lab.js --lab 03 --target . --dry-run
```

## After you fast-forward

Run the matching lab check:

```bash
pnpm lab:check -- --lab 00 --start --verbose
pnpm lab:check -- --lab 01 --start --verbose
pnpm lab:check -- --lab 02 --start --verbose
pnpm lab:check -- --lab 03 --start --verbose
pnpm lab:check -- --lab 04 --start --verbose
pnpm lab:check -- --lab 05 --start --verbose
```

Equivalent form:

```bash
LAB_ID=03 pnpm classroom:check
```

If you already have `pnpm dev` running in another terminal, use `--no-start` instead:

```bash
pnpm lab:check -- --lab 03 --no-start --verbose
```

If `3001` or `3002` are busy and you want an isolated smoke run, use different ports:

```bash
ISSUER_BASE_URL=http://127.0.0.1:3101 VERIFIER_BASE_URL=http://127.0.0.1:3102 pnpm lab:check -- --lab 03 --start --verbose
```

## Important note

- Lab 00 restores the starter scaffold.
- Labs 01-05 copy the working integrated files for that lesson edit surface.
- Those integrated files may already contain later-lab behavior around the exact lesson logic, so always verify with the matching `pnpm lab:check` command or `LAB_ID`.

## Which files get replaced

- Lab 00: `issuer/src/index.ts`, `verifier/src/index.ts`
- Lab 01: `issuer/src/index.ts`, `verifier/src/index.ts`
- Lab 02: `issuer/src/index.ts`, `verifier/src/index.ts`, `bbs-lib/src/index.ts`
- Lab 03: `issuer/src/index.ts`, `verifier/src/index.ts`
- Lab 04: `issuer/src/index.ts`, `verifier/src/index.ts`
- Lab 05: `issuer/src/index.ts`, `verifier/src/index.ts`

## When to use this

- You want to keep moving and understand the flow instead of debugging every step live.
- You want a clean baseline before trying the lab again.
- You want to compare your implementation with the working one side by side.
