#!/usr/bin/env node
const fs = require('node:fs/promises')
const path = require('node:path')

const REPO_ROOT = path.resolve(__dirname, '..')
const STARTER_OVERRIDES_ROOT = path.join(
  REPO_ROOT,
  'learninglab-world-class-implementation-kit',
  'overlays',
  'instructor-repo',
  'starter-overrides'
)

const INTEGRATED_LAB_FILES = ['issuer/src/index.ts', 'verifier/src/index.ts']

const LAB_CONFIG = {
  '00': {
    source: 'starter',
    files: ['issuer/src/index.ts', 'verifier/src/index.ts'],
    summary: 'Restore the starter scaffold used for Lab 00.',
    verify: 'pnpm lab:check -- --lab 00 --start --verbose',
    extraNotes: [
      'Lab 00 is the scaffold checkpoint, not the final integrated implementation.',
      'This plan restores the starter overrides rather than the integrated source files.'
    ]
  },
  '01': {
    source: 'integrated',
    files: INTEGRATED_LAB_FILES,
    summary: 'Copy the known-good SD-JWT issuer and verifier implementation.',
    verify: 'pnpm lab:check -- --lab 01 --start --verbose',
    extraNotes: [
      'The copied files include later-lab behavior, so always verify with the matching Lab 01 check.',
      'Main already contains the integrated end state; LAB_ID is what narrows grading to the lesson.'
    ]
  },
  '02': {
    source: 'integrated',
    files: [...INTEGRATED_LAB_FILES, 'bbs-lib/src/index.ts'],
    summary: 'Copy the known-good BBS issuer, verifier, and helper implementation.',
    verify: 'pnpm lab:check -- --lab 02 --start --verbose',
    extraNotes: [
      'Lab 02 fast-forward includes bbs-lib because that helper is part of the lesson edit surface.',
      'The Lab 02 checker disables the later integrated iProov requirement on purpose.'
    ]
  },
  '03': {
    source: 'integrated',
    files: INTEGRATED_LAB_FILES,
    summary: 'Copy the known-good verifier fetch path and integrated runtime files for OHTTP.',
    verify: 'pnpm lab:check -- --lab 03 --start --verbose',
    extraNotes: [
      'The Lab 03 checker starts the local relay stub and injects the env flags for you.',
      'If you run pnpm dev manually instead, you still need USE_OHTTP=true and OHTTP_RELAY_URL set in the student repo.'
    ]
  },
  '04': {
    source: 'integrated',
    files: INTEGRATED_LAB_FILES,
    summary: 'Copy the known-good liveness-gated issuer and verifier implementation.',
    verify: 'pnpm lab:check -- --lab 04 --start --verbose',
    extraNotes: [
      'Lab 04 verification relies on the integrated files plus the lab-check compatibility shim.',
      'The checker restores issuance-time gating so the lesson stays focused on liveness.'
    ]
  },
  '05': {
    source: 'integrated',
    files: INTEGRATED_LAB_FILES,
    summary: 'Copy the known-good revocation-aware issuer and verifier implementation.',
    verify: 'pnpm lab:check -- --lab 05 --start --verbose',
    extraNotes: [
      'Run pnpm --filter status-list run generate in the student repo if the status-list file was deleted or corrupted.',
      'The copied files already include the final integrated revocation path.'
    ]
  }
}

function normalizeLabId(raw) {
  const digits = String(raw || '').match(/\d+/g)?.join('') || ''
  const padded = digits.padStart(2, '0')
  if (!/^\d{2}$/.test(padded) || Number(padded) < 0 || Number(padded) > 5) {
    throw new Error(`Invalid lab id: ${raw}. Expected 00 through 05.`)
  }
  return padded
}

function parseArgs(argv) {
  const out = {
    lab: null,
    target: null,
    dryRun: false,
    help: false
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--lab') out.lab = normalizeLabId(argv[++i])
    else if (arg.startsWith('--lab=')) out.lab = normalizeLabId(arg.split('=')[1])
    else if (arg === '--target') out.target = argv[++i]
    else if (arg.startsWith('--target=')) out.target = arg.split('=')[1]
    else if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--help' || arg === '-h') out.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return out
}

function resolveSourceRoot(kind, roots = {}) {
  if (kind === 'starter') return path.resolve(roots.starterOverridesRoot || STARTER_OVERRIDES_ROOT)
  return path.resolve(roots.repoRoot || REPO_ROOT)
}

function createFastForwardPlan(input, roots = {}) {
  const lab = normalizeLabId(input.lab)
  const config = LAB_CONFIG[lab]
  if (!config) {
    throw new Error(`No fast-forward plan is defined for lab ${lab}`)
  }

  const repoRoot = path.resolve(roots.repoRoot || REPO_ROOT)
  const sourceRoot = resolveSourceRoot(config.source, roots)
  const targetRoot = path.resolve(input.target)

  if (targetRoot === repoRoot) {
    throw new Error('Refusing to fast-forward the instructor repo itself. Point --target at a separate student repo checkout.')
  }

  return {
    lab,
    targetRoot,
    sourceKind: config.source,
    summary: config.summary,
    verify: config.verify,
    extraNotes: config.extraNotes,
    copies: config.files.map((relPath) => ({
      relPath,
      source: path.join(sourceRoot, relPath),
      destination: path.join(targetRoot, relPath)
    }))
  }
}

async function ensureTargetRepo(targetRoot, fsApi = fs) {
  const manifest = path.join(targetRoot, 'package.json')
  try {
    await fsApi.access(manifest)
  } catch {
    throw new Error(`Target repo does not look like a LearningLab checkout: missing ${manifest}`)
  }
}

async function applyFastForwardPlan(plan, options = {}, fsApi = fs) {
  const dryRun = options.dryRun === true

  await ensureTargetRepo(plan.targetRoot, fsApi)

  for (const copy of plan.copies) {
    const stat = await fsApi.stat(copy.source)
    if (dryRun) continue
    await fsApi.mkdir(path.dirname(copy.destination), { recursive: true })
    await fsApi.copyFile(copy.source, copy.destination)
    await fsApi.chmod(copy.destination, stat.mode)
  }

  return plan
}

function formatPlan(plan, options = {}) {
  const dryRun = options.dryRun === true
  const lines = [
    `Lab ${plan.lab} fast-forward`,
    '',
    plan.summary,
    '',
    dryRun ? 'Dry run only. No files were written.' : 'Files copied into the target repo:',
    ...plan.copies.map((copy) => `- ${copy.relPath}`),
    '',
    'Next steps:',
    `- In the student repo, run: ${plan.verify}`,
    `- If you prefer the Classroom-equivalent check, run: LAB_ID=${plan.lab} pnpm classroom:check`,
    '- Keep pnpm dev running in one terminal and use a second terminal for curls or lab-check output.',
    '',
    'Notes:',
    ...plan.extraNotes.map((note) => `- ${note}`)
  ]

  return lines.join('\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.lab || !args.target) {
    console.log(`Usage:
  node scripts/fast-forward-student-lab.js --lab <00-05> --target </path/to/student-repo> [--dry-run]

Examples:
  node scripts/fast-forward-student-lab.js --lab 02 --target ~/dev/student-repo
  node scripts/fast-forward-student-lab.js --lab 04 --target ~/dev/student-repo --dry-run
`)
    return
  }

  const plan = createFastForwardPlan(args)
  await applyFastForwardPlan(plan, { dryRun: args.dryRun })
  console.log(formatPlan(plan, { dryRun: args.dryRun }))
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[fast-forward-student-lab] FAILED:', error?.message || error)
    process.exitCode = 1
  })
}

module.exports = {
  LAB_CONFIG,
  REPO_ROOT,
  STARTER_OVERRIDES_ROOT,
  normalizeLabId,
  parseArgs,
  createFastForwardPlan,
  applyFastForwardPlan,
  ensureTargetRepo,
  formatPlan
}
