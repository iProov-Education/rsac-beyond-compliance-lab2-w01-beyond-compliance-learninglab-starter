#!/usr/bin/env node
/*
 * Read-only instructor helper for the one-repo + LAB_ID GitHub Classroom model.
 *
 * Reports the current LAB_ID and latest Classroom workflow result on main for
 * each target repo so an instructor can see who is ready to advance.
 */

const { spawnSync } = require('node:child_process')
const { resolveRepos } = require('./set-lab-id.js')

const LAB_SEQUENCE = ['00', '01', '02', '03', '04', '05']

function printUsage() {
  console.log(`Usage:
  node scripts/classroom-progress.js --repo owner/name
  node scripts/classroom-progress.js --classroom-csv accepted_assignments.csv

Options:
  --repo <owner/name>        Target one repository (repeatable)
  --repos-file <path>        Text file with one owner/name per line
  --classroom-csv <path>     CSV export containing repo URLs or owner/name slugs
  --workflow <file>          Workflow file to inspect (default: classroom.yml)
  --only-ready               Show only repos ready to advance
  --json                     Emit JSON instead of tab-separated text
  --help                     Show this message
`)
}

function parseArgs(argv) {
  const out = {
    repos: [],
    reposFile: null,
    classroomCsv: null,
    workflow: 'classroom.yml',
    onlyReady: false,
    json: false,
    help: false
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--only-ready') out.onlyReady = true
    else if (arg === '--json') out.json = true
    else if (arg === '--repo') out.repos.push(argv[++i])
    else if (arg.startsWith('--repo=')) out.repos.push(arg.split('=')[1])
    else if (arg === '--repos-file') out.reposFile = argv[++i]
    else if (arg.startsWith('--repos-file=')) out.reposFile = arg.split('=')[1]
    else if (arg === '--classroom-csv') out.classroomCsv = argv[++i]
    else if (arg.startsWith('--classroom-csv=')) out.classroomCsv = arg.split('=')[1]
    else if (arg === '--workflow') out.workflow = argv[++i]
    else if (arg.startsWith('--workflow=')) out.workflow = arg.split('=')[1]
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return out
}

function getNextLabId(currentLabId) {
  const index = LAB_SEQUENCE.indexOf(currentLabId)
  if (index === -1 || index === LAB_SEQUENCE.length - 1) return null
  return LAB_SEQUENCE[index + 1]
}

function summarizeRepoProgress(repo, currentLabId, latestRun, error) {
  const nextLabId = getNextLabId(currentLabId)
  const status = latestRun?.status || ''
  const conclusion = latestRun?.conclusion || ''

  if (error) {
    return {
      repo,
      currentLabId: currentLabId || '',
      nextLabId: nextLabId || '',
      latestStatus: status,
      latestConclusion: conclusion,
      readyToAdvance: false,
      reason: error,
      runUrl: latestRun?.html_url || ''
    }
  }

  if (!currentLabId) {
    return {
      repo,
      currentLabId: '',
      nextLabId: '',
      latestStatus: status,
      latestConclusion: conclusion,
      readyToAdvance: false,
      reason: 'LAB_ID is not set',
      runUrl: latestRun?.html_url || ''
    }
  }

  if (!latestRun) {
    return {
      repo,
      currentLabId,
      nextLabId: nextLabId || '',
      latestStatus: '',
      latestConclusion: '',
      readyToAdvance: false,
      reason: 'No classroom.yml run found on main',
      runUrl: ''
    }
  }

  if (status !== 'completed') {
    return {
      repo,
      currentLabId,
      nextLabId: nextLabId || '',
      latestStatus: status,
      latestConclusion: conclusion,
      readyToAdvance: false,
      reason: `Latest run is ${status}`,
      runUrl: latestRun.html_url || ''
    }
  }

  if (conclusion !== 'success') {
    return {
      repo,
      currentLabId,
      nextLabId: nextLabId || '',
      latestStatus: status,
      latestConclusion: conclusion,
      readyToAdvance: false,
      reason: `Latest run concluded ${conclusion || 'without a result'}`,
      runUrl: latestRun.html_url || ''
    }
  }

  if (!nextLabId) {
    return {
      repo,
      currentLabId,
      nextLabId: '',
      latestStatus: status,
      latestConclusion: conclusion,
      readyToAdvance: false,
      reason: 'Final lab already reached',
      runUrl: latestRun.html_url || ''
    }
  }

  return {
    repo,
    currentLabId,
    nextLabId,
    latestStatus: status,
    latestConclusion: conclusion,
    readyToAdvance: true,
    reason: 'Latest run passed on main',
    runUrl: latestRun.html_url || ''
  }
}

function formatGhError(result) {
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
}

function isNotFound(result) {
  return result.status !== 0 && /404|not found/i.test(formatGhError(result))
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

function fetchLabId(repo) {
  const result = runGh(['api', `repos/${repo}/actions/variables/LAB_ID`])
  if (result.status === 0) {
    const payload = JSON.parse(result.stdout || '{}')
    return payload.value || null
  }

  if (isNotFound(result)) return null
  throw new Error(`Failed to read LAB_ID for ${repo}\n${formatGhError(result)}`)
}

function fetchLatestWorkflowRun(repo, workflow) {
  const endpoint = `repos/${repo}/actions/workflows/${workflow}/runs?branch=main&per_page=1`
  const result = runGh(['api', endpoint])
  if (result.status === 0) {
    const payload = JSON.parse(result.stdout || '{}')
    return payload.workflow_runs?.[0] || null
  }

  if (isNotFound(result)) return null
  throw new Error(`Failed to read workflow runs for ${repo}\n${formatGhError(result)}`)
}

function formatProgressTable(items) {
  const headers = [
    'repo',
    'current_lab',
    'next_lab',
    'ready',
    'status',
    'conclusion',
    'reason',
    'run_url'
  ]

  const rows = items.map((item) => [
    item.repo,
    item.currentLabId,
    item.nextLabId,
    item.readyToAdvance ? 'yes' : 'no',
    item.latestStatus,
    item.latestConclusion,
    item.reason,
    item.runUrl
  ])

  return [headers, ...rows]
    .map((row) => row.map((value) => String(value || '').replace(/\s+/g, ' ').trim()).join('\t'))
    .join('\n')
}

function collectProgress(repos, workflow) {
  return repos.map((repo) => {
    let currentLabId = null

    try {
      currentLabId = fetchLabId(repo)
      const latestRun = fetchLatestWorkflowRun(repo, workflow)
      return summarizeRepoProgress(repo, currentLabId, latestRun, null)
    } catch (err) {
      return summarizeRepoProgress(repo, currentLabId, null, err?.message || String(err))
    }
  })
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return
  }

  const repos = resolveRepos(args)
  ensureGhAvailable()

  const progress = collectProgress(repos, args.workflow)
  const filtered = args.onlyReady ? progress.filter((item) => item.readyToAdvance) : progress

  if (args.json) {
    console.log(JSON.stringify(filtered, null, 2))
    return
  }

  console.log(formatProgressTable(filtered))
}

if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error('[classroom-progress] FAILED:', err?.message || err)
    process.exitCode = 1
  }
}

module.exports = {
  collectProgress,
  formatProgressTable,
  getNextLabId,
  parseArgs,
  summarizeRepoProgress
}
