#!/usr/bin/env node
const fs = require('node:fs/promises')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const REPO_ROOT = path.resolve(__dirname, '..')
const DEFAULT_OUT_ROOT = path.join(REPO_ROOT, 'dist', 'take-home')
const DEFAULT_BUNDLE_NAME = 'LearningLab-working-project'

const EXCLUDE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.next',
  '.turbo'
])

const EXCLUDE_ROOT_ITEMS = new Set([
  '.github',
  'AGENTS.md',
  'classroom-template',
  'COURSE_CLASSROOM.md',
  'instructor-cheatsheets',
  'LAB2-W01-Beyond_Compliance_A_Hands-On_Lab_for_Privacy-First_Digital_Identity.key',
  'LESSON_RUNBOOK.md',
  'learninglab-world-class-implementation-kit',
  'STATUS.md',
  'VILLAGE_DEMO_CONDUCTOR.md',
  'WALLET_FORKS.md',
  'wallet-android',
  'wallet-ios'
])

const EXCLUDE_FILES = new Set([
  '.DS_Store'
])

const SENSITIVE_FILE_PREFIXES = [
  'client_secret_'
]

function normalizePath(input) {
  return String(input || '').split(path.sep).join('/')
}

function parseArgs(argv) {
  const out = {
    source: null,
    out: null,
    name: DEFAULT_BUNDLE_NAME,
    clean: true,
    zip: true,
    help: false
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--source') out.source = argv[++i]
    else if (arg.startsWith('--source=')) out.source = arg.split('=')[1]
    else if (arg === '--out') out.out = argv[++i]
    else if (arg.startsWith('--out=')) out.out = arg.split('=')[1]
    else if (arg === '--name') out.name = argv[++i]
    else if (arg.startsWith('--name=')) out.name = arg.split('=')[1]
    else if (arg === '--clean') out.clean = true
    else if (arg === '--no-clean') out.clean = false
    else if (arg === '--zip') out.zip = true
    else if (arg === '--no-zip') out.zip = false
    else if (arg === '--help' || arg === '-h') out.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  if (!String(out.name || '').trim()) {
    throw new Error('Bundle name must not be empty')
  }

  return out
}

function createSkipPrefixes(sourceRoot, candidates) {
  const prefixes = new Set()
  for (const candidate of candidates) {
    if (!candidate) continue
    const relPath = path.relative(sourceRoot, candidate)
    if (!relPath || relPath === '.' || relPath.startsWith('..')) continue
    prefixes.add(normalizePath(relPath))
  }
  return prefixes
}

function shouldSkip(relPath, entry, options = {}) {
  const normalized = normalizePath(relPath)
  if (!normalized || normalized === '.') return false

  const base = path.basename(normalized)
  const skipPrefixes = options.skipPrefixes || new Set()
  for (const prefix of skipPrefixes) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) return true
  }

  if (EXCLUDE_ROOT_ITEMS.has(normalized)) return true
  if (EXCLUDE_DIRS.has(base)) return true
  if (EXCLUDE_FILES.has(base)) return true
  if (SENSITIVE_FILE_PREFIXES.some((prefix) => base.startsWith(prefix))) return true
  if (base === '.env' || base.startsWith('.env.')) return true
  if (base.endsWith('.log')) return true
  if (entry.isSymbolicLink?.()) return true

  return false
}

async function copyTree(srcDir, destDir, rootDir, options = {}, fsApi = fs) {
  await fsApi.mkdir(destDir, { recursive: true })
  const entries = await fsApi.readdir(srcDir, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name)
    const relPath = path.relative(rootDir, srcPath)
    const destPath = path.join(destDir, entry.name)

    if (shouldSkip(relPath, entry, options)) continue

    if (entry.isDirectory()) {
      await copyTree(srcPath, destPath, rootDir, options, fsApi)
      continue
    }

    if (entry.isFile()) {
      await fsApi.mkdir(path.dirname(destPath), { recursive: true })
      await fsApi.copyFile(srcPath, destPath)
      const stat = await fsApi.stat(srcPath)
      await fsApi.chmod(destPath, stat.mode)
    }
  }
}

async function writeGeneratedMarker(bundleRoot, metadata, fsApi = fs) {
  const markerPath = path.join(bundleRoot, 'TAKE_HOME_BUNDLE_GENERATED.md')
  const lines = [
    '# Take-home bundle generated',
    '',
    `Generated from: ${metadata.sourceRoot}`,
    `Bundle name: ${metadata.bundleName}`,
    `Generated at: ${metadata.generatedAt}`,
    '',
    'This directory is a student-safe export of the integrated working LearningLab repo.',
    'Instructor-only materials, classroom-only operations docs, secrets, and local build artifacts are intentionally excluded.',
    ''
  ]
  await fsApi.writeFile(markerPath, lines.join('\n'), 'utf8')
}

function createZipArchive(bundleRoot, zipPath, zipRunner = spawnSync) {
  const cwd = path.dirname(bundleRoot)
  const bundleName = path.basename(bundleRoot)
  const result = zipRunner('zip', ['-qr', zipPath, bundleName], {
    cwd,
    encoding: 'utf8'
  })

  if (result?.error?.code === 'ENOENT') {
    throw new Error('zip command not found. Install zip or rerun with --no-zip.')
  }

  if (result?.status !== 0) {
    const detail = [result?.stderr, result?.stdout].filter(Boolean).join('\n').trim()
    throw new Error(`zip command failed${detail ? `: ${detail}` : ''}`)
  }

  return zipPath
}

function formatResult(result) {
  const lines = [
    'Take-home bundle ready',
    '',
    `Directory: ${result.bundleRoot}`,
    result.zipPath ? `Zip: ${result.zipPath}` : 'Zip: skipped (--no-zip)',
    '',
    'This bundle contains the integrated working repo state with student-safe docs and excludes instructor-only materials.',
    'Share the zip directly, or upload it to Drive/GitHub Releases and hand out the download link or QR code at the end of the session.'
  ]
  return lines.join('\n')
}

async function buildTakeHomeBundle(input = {}, deps = {}) {
  const fsApi = deps.fsApi || fs
  const zipRunner = deps.zipRunner || spawnSync
  const sourceRoot = path.resolve(input.source || REPO_ROOT)
  const outRoot = path.resolve(input.out || DEFAULT_OUT_ROOT)
  const bundleName = String(input.name || DEFAULT_BUNDLE_NAME).trim()
  const bundleRoot = path.join(outRoot, bundleName)
  const zipPath = input.zip === false ? null : path.join(outRoot, `${bundleName}.zip`)

  if (input.clean !== false) {
    await fsApi.rm(bundleRoot, { recursive: true, force: true })
    if (zipPath) await fsApi.rm(zipPath, { force: true })
  }

  await fsApi.mkdir(outRoot, { recursive: true })

  const skipPrefixes = createSkipPrefixes(sourceRoot, [outRoot, bundleRoot, zipPath])
  await copyTree(sourceRoot, bundleRoot, sourceRoot, { skipPrefixes }, fsApi)
  await writeGeneratedMarker(
    bundleRoot,
    {
      sourceRoot,
      bundleName,
      generatedAt: new Date().toISOString()
    },
    fsApi
  )

  if (zipPath) {
    createZipArchive(bundleRoot, zipPath, zipRunner)
  }

  return {
    sourceRoot,
    outRoot,
    bundleName,
    bundleRoot,
    zipPath
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`Usage:
  pnpm take-home:bundle
  node scripts/build-take-home-bundle.js [--source <repo>] [--out <dir>] [--name <bundle-name>] [--no-zip]

Defaults:
  --source ./
  --out ./dist/take-home
  --name ${DEFAULT_BUNDLE_NAME}
  --clean true
  --zip true
`)
    return
  }

  const result = await buildTakeHomeBundle(args)
  console.log(formatResult(result))
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[build-take-home-bundle] FAILED:', error?.message || error)
    process.exitCode = 1
  })
}

module.exports = {
  DEFAULT_BUNDLE_NAME,
  DEFAULT_OUT_ROOT,
  EXCLUDE_DIRS,
  EXCLUDE_ROOT_ITEMS,
  EXCLUDE_FILES,
  SENSITIVE_FILE_PREFIXES,
  REPO_ROOT,
  parseArgs,
  shouldSkip,
  copyTree,
  createZipArchive,
  writeGeneratedMarker,
  buildTakeHomeBundle,
  formatResult
}
