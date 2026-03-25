#!/usr/bin/env node
/*
 * Instructor helper for the one-repo + LAB_ID GitHub Classroom model.
 *
 * Uses `gh api` so the operator can rely on existing GitHub CLI auth instead
 * of wiring tokens directly into this repo. Supports one repo or a file of
 * repos, and can dry-run before making changes.
 */

const { readFileSync } = require('node:fs')
const { spawnSync } = require('node:child_process')

function printUsage() {
  console.log(`Usage:
  node scripts/set-lab-id.js --repo owner/name --lab 01
  node scripts/set-lab-id.js --repos-file repos.txt --lab 03
  node scripts/set-lab-id.js --classroom-csv accepted_assignments.csv --lab 02

Options:
  --repo <owner/name>        Target one repository (repeatable)
  --repos-file <path>        Text file with one owner/name per line
  --classroom-csv <path>     CSV export containing repo URLs or owner/name slugs
  --lab <00-05>              Lab to set as LAB_ID
  --dry-run                  Print the planned actions without calling GitHub
  --help                     Show this message
`)
}

function parseArgs(argv) {
  const out = {
    repos: [],
    reposFile: null,
    classroomCsv: null,
    lab: null,
    dryRun: false,
    help: false
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--repo') out.repos.push(argv[++i])
    else if (arg.startsWith('--repo=')) out.repos.push(arg.split('=')[1])
    else if (arg === '--repos-file') out.reposFile = argv[++i]
    else if (arg.startsWith('--repos-file=')) out.reposFile = arg.split('=')[1]
    else if (arg === '--classroom-csv') out.classroomCsv = argv[++i]
    else if (arg.startsWith('--classroom-csv=')) out.classroomCsv = arg.split('=')[1]
    else if (arg === '--lab') out.lab = argv[++i]
    else if (arg.startsWith('--lab=')) out.lab = arg.split('=')[1]
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return out
}

function normalizeLabId(raw) {
  const value = String(raw || '').trim().replace(/^lab-?/i, '')
  if (!/^\d{1,2}$/.test(value)) throw new Error(`Invalid lab id: ${raw}`)
  const normalized = value.padStart(2, '0')
  if (!['00', '01', '02', '03', '04', '05'].includes(normalized)) {
    throw new Error(`Invalid lab id: ${raw}`)
  }
  return normalized
}

function parseRepoList(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && char === ',') {
      row.push(cell)
      cell = ''
      continue
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += char
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows.filter((cells) => cells.some((value) => value.trim() !== ''))
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function extractRepoSlug(value) {
  const text = String(value || '').trim()
  if (!text) return null

  const githubUrlMatch = text.match(/github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git|\/|$)/i)
  if (githubUrlMatch) return `${githubUrlMatch[1]}/${githubUrlMatch[2]}`

  const slugMatch = text.match(/\b([^/\s]+\/[^/\s]+)\b/)
  if (slugMatch) return slugMatch[1]

  return null
}

function extractReposFromCsv(text) {
  const rows = parseCsv(text)
  if (rows.length === 0) return []

  const headers = rows[0].map(normalizeHeader)
  const preferredColumns = new Set(
    headers
      .map((header, index) => ({ header, index }))
      .filter(({ header }) =>
        header.includes('repository') ||
        header.includes('repo') ||
        header.includes('assignment url') ||
        header.includes('submission url')
      )
      .map(({ index }) => index)
  )

  const repos = []

  for (const row of rows.slice(1)) {
    const candidateIndexes = preferredColumns.size > 0
      ? [...preferredColumns]
      : row.map((_, index) => index)

    for (const index of candidateIndexes) {
      const repo = extractRepoSlug(row[index])
      if (repo) {
        repos.push(repo)
        break
      }
    }
  }

  return repos
}

function resolveRepos(args) {
  const repos = [...args.repos]
  if (args.reposFile) {
    repos.push(...parseRepoList(readFileSync(args.reposFile, 'utf8')))
  }
  if (args.classroomCsv) {
    repos.push(...extractReposFromCsv(readFileSync(args.classroomCsv, 'utf8')))
  }
  const unique = [...new Set(repos)]
  if (unique.length === 0) throw new Error('Provide --repo, --repos-file, or --classroom-csv')
  for (const repo of unique) {
    if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) throw new Error(`Invalid repo slug: ${repo}`)
  }
  return unique
}

function formatGhError(result) {
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
}

function runGh(args) {
  return spawnSync('gh', args, { encoding: 'utf8' })
}

function ensureGhAvailable() {
  const result = runGh(['--version'])
  if (result.status !== 0) {
    throw new Error('GitHub CLI `gh` is required and was not found in PATH')
  }
}

function variableExists(repo) {
  const result = runGh(['api', `repos/${repo}/actions/variables/LAB_ID`])
  return result.status === 0
}

function updateVariable(repo, labId) {
  return runGh([
    'api',
    '--method',
    'PATCH',
    `repos/${repo}/actions/variables/LAB_ID`,
    '-f',
    `name=LAB_ID`,
    '-f',
    `value=${labId}`
  ])
}

function createVariable(repo, labId) {
  return runGh([
    'api',
    '--method',
    'POST',
    `repos/${repo}/actions/variables`,
    '-f',
    'name=LAB_ID',
    '-f',
    `value=${labId}`
  ])
}

function setLabIdForRepo(repo, labId) {
  const exists = variableExists(repo)
  const result = exists ? updateVariable(repo, labId) : createVariable(repo, labId)
  if (result.status !== 0) {
    throw new Error(`Failed to set LAB_ID on ${repo}\n${formatGhError(result)}`)
  }
  return exists ? 'updated' : 'created'
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return
  }

  const labId = normalizeLabId(args.lab)
  const repos = resolveRepos(args)

  if (args.dryRun) {
    for (const repo of repos) {
      console.log(`[dry-run] would set LAB_ID=${labId} on ${repo}`)
    }
    return
  }

  ensureGhAvailable()

  for (const repo of repos) {
    const action = setLabIdForRepo(repo, labId)
    console.log(`${action} LAB_ID=${labId} on ${repo}`)
  }
}

if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error('[set-lab-id] FAILED:', err?.message || err)
    process.exitCode = 1
  }
}

module.exports = {
  createVariable,
  ensureGhAvailable,
  extractRepoSlug,
  extractReposFromCsv,
  formatGhError,
  normalizeLabId,
  parseCsv,
  parseArgs,
  parseRepoList,
  resolveRepos,
  runGh,
  setLabIdForRepo,
  updateVariable,
  variableExists
}
