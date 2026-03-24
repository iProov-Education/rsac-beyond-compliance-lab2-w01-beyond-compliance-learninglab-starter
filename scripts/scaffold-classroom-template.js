#!/usr/bin/env node
/*
 * Build a sanitized student template repo in ./classroom-template.
 *
 * Why this exists:
 * - GitHub Classroom expects a "clean" student-facing repo that contains
 *   only what learners need to complete labs. This script makes a
 *   reproducible, auditable copy instead of relying on manual curation.
 * - We intentionally exclude internal planning docs and secrets to avoid
 *   accidental leaks when the template is published publicly.
 *
 * Usage:
 *   node scripts/scaffold-classroom-template.js [--clean]
 *
 * Notes:
 * - The output is a standalone folder that can be pushed to a new repo.
 * - This script does not mutate the source tree besides writing output.
 */

const fs = require('node:fs/promises')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'classroom-template')
const CLEAN = process.argv.includes('--clean')

// Instructor-only or operational docs that should not ship to students.
// Keeping them out of the template reduces confusion and protects
// internal planning notes that are not part of the lab content.
const ROOT_EXCLUDES = new Set([
  'AGENTS.md',
  'CONSENT_BUDGETS.md',
  'COURSE_CLASSROOM.md',
  'CURRENT_PLAN.md',
  'instructor-cheatsheets',
  'LAB2-W01-Beyond_Compliance_A_Hands-On_Lab_for_Privacy-First_Digital_Identity.key',
  'LAB_ARTIFACT_PLAN.md',
  'LESSON_RUNBOOK.md',
  'learninglab-world-class-implementation-kit',
  'RESUME.md',
  'STATUS.md',
  'SUBMISSION.md',
  'VILLAGE_DEMO_CONDUCTOR.md',
  'WALLET_FORKS.md',
  'wallet-android',
  'wallet-ios'
])

// Directories that should never be copied into a student template:
// - .git: avoids nesting repos and leaking commit history
// - node_modules/dist/etc.: build artifacts and caches are not source
// - .turbo/.next: framework cache output that is regenerated locally
const EXCLUDE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  '.turbo',
  '.next',
  'coverage'
])

// Platform or tooling noise that provides no value to students.
const EXCLUDE_FILES = new Set([
  '.DS_Store'
])

const SENSITIVE_FILE_PREFIXES = [
  'client_secret_'
]

function toPosix(p) {
  return p.split(path.sep).join('/')
}

function shouldExclude(relPath, entry) {
  const normalized = toPosix(relPath)
  if (!normalized || normalized === '.') return false

  // Never copy the output back into itself; it would grow recursively.
  if (normalized === 'classroom-template' || normalized.startsWith('classroom-template/')) return true

  const base = path.basename(relPath)

  if (EXCLUDE_DIRS.has(base)) return true
  if (EXCLUDE_FILES.has(base)) return true
  if (SENSITIVE_FILE_PREFIXES.some((prefix) => base.startsWith(prefix))) return true

  // .env files may contain secrets or environment-specific tokens.
  // We exclude them to avoid credential leakage in the public template.
  if (base === '.env' || base.startsWith('.env.')) return true
  // Log files can contain local paths or sensitive debug output.
  if (base.endsWith('.log')) return true

  // Drop instructor-only docs at the repo root.
  if (ROOT_EXCLUDES.has(normalized)) return true

  // Keep .github (workflow) and .gitignore: these are intentional
  // parts of the student template.

  // Avoid symlinks so we don't copy unintended files outside ROOT.
  if (entry?.isSymbolicLink?.()) return true

  return false
}

async function ensureClean() {
  if (!CLEAN) return
  // Explicitly remove the output dir to guarantee a clean, fresh copy.
  await fs.rm(OUT_DIR, { recursive: true, force: true })
}

async function copyDir(srcDir, destDir) {
  await fs.mkdir(destDir, { recursive: true })

  const entries = await fs.readdir(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name)
    const relPath = path.relative(ROOT, srcPath)

    if (shouldExclude(relPath, entry)) continue

    const destPath = path.join(destDir, entry.name)

    if (entry.isDirectory()) {
      // Recurse to preserve the original directory layout.
      await copyDir(srcPath, destPath)
      continue
    }

    if (entry.isFile()) {
      // Preserve file mode so executable scripts remain runnable.
      await fs.copyFile(srcPath, destPath)
      const stat = await fs.stat(srcPath)
      await fs.chmod(destPath, stat.mode)
    }
  }
}

async function ensureTemplateGitignore() {
  const target = path.join(OUT_DIR, '.gitignore')
  try {
    await fs.access(target)
    return
  } catch (_) {
    // continue to write
  }

  // Provide a minimal, conservative .gitignore if the source repo did
  // not include one. This keeps student repos clean by default.
  const content = [
    'node_modules/',
    '.env',
    '.env.*',
    'dist/',
    'coverage/',
    '*.log',
    '.DS_Store'
  ].join('\n') + '\n'

  await fs.writeFile(target, content, 'utf8')
}

async function main() {
  await ensureClean()
  await copyDir(ROOT, OUT_DIR)
  await ensureTemplateGitignore()
  console.log(`[classroom-template] Ready at ${path.relative(ROOT, OUT_DIR)}`)
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[classroom-template] FAILED:', err?.message || err)
    process.exitCode = 1
  })
}

module.exports = {
  ROOT_EXCLUDES,
  shouldExclude
}
