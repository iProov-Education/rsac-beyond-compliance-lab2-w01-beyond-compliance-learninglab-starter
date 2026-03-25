#!/usr/bin/env node
/*
 * Instructor helper that advances repos by LAB_ID.
 *
 * Default behavior is instructor-controlled progression: if a repo is on the
 * requested --from lab, it can be advanced whether or not the latest run
 * passed. Use --only-ready to restore pass-first advancement.
 *
 * Default mode is dry-run. Use --apply to actually change LAB_ID values.
 */

const { normalizeLabId, ensureGhAvailable, resolveRepos, setLabIdForRepo } = require('./set-lab-id.js')
const { collectProgress } = require('./classroom-progress.js')

function printUsage() {
  console.log(`Usage:
  node scripts/classroom-advance.js --classroom-csv accepted_assignments.csv --from 01
  node scripts/classroom-advance.js --classroom-csv accepted_assignments.csv --from 01 --only-ready
  node scripts/classroom-advance.js --repo owner/name --from 02 --apply

Options:
  --repo <owner/name>        Target one repository (repeatable)
  --repos-file <path>        Text file with one owner/name per line
  --classroom-csv <path>     CSV export containing repo URLs or owner/name slugs
  --from <00-05>             Only advance repos currently on this LAB_ID
  --workflow <file>          Workflow file to inspect (default: classroom.yml)
  --only-ready               Advance only repos whose latest run passed
  --apply                    Perform the LAB_ID updates (default is dry-run)
  --json                     Emit JSON instead of tab-separated text
  --help                     Show this message
`)
}

function parseArgs(argv) {
  const out = {
    repos: [],
    reposFile: null,
    classroomCsv: null,
    from: null,
    workflow: 'classroom.yml',
    onlyReady: false,
    apply: false,
    json: false,
    help: false
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--apply') out.apply = true
    else if (arg === '--json') out.json = true
    else if (arg === '--repo') out.repos.push(argv[++i])
    else if (arg.startsWith('--repo=')) out.repos.push(arg.split('=')[1])
    else if (arg === '--repos-file') out.reposFile = argv[++i]
    else if (arg.startsWith('--repos-file=')) out.reposFile = arg.split('=')[1]
    else if (arg === '--classroom-csv') out.classroomCsv = argv[++i]
    else if (arg.startsWith('--classroom-csv=')) out.classroomCsv = arg.split('=')[1]
    else if (arg === '--from') out.from = argv[++i]
    else if (arg.startsWith('--from=')) out.from = arg.split('=')[1]
    else if (arg === '--workflow') out.workflow = argv[++i]
    else if (arg.startsWith('--workflow=')) out.workflow = arg.split('=')[1]
    else if (arg === '--only-ready') out.onlyReady = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return out
}

function buildAdvancePlan(progress, fromLabId, options = {}) {
  const onlyReady = Boolean(options.onlyReady)
  return progress
    .filter((item) => !fromLabId || item.currentLabId === fromLabId)
    .filter((item) => item.nextLabId)
    .filter((item) => !onlyReady || item.readyToAdvance)
    .map((item) => ({
      repo: item.repo,
      fromLabId: item.currentLabId,
      toLabId: item.nextLabId,
      runUrl: item.runUrl,
      reason: item.reason
    }))
}

function formatAdvancePlan(items) {
  const headers = ['repo', 'from_lab', 'to_lab', 'reason', 'run_url']
  const rows = items.map((item) => [
    item.repo,
    item.fromLabId,
    item.toLabId,
    item.reason,
    item.runUrl
  ])

  return [headers, ...rows]
    .map((row) => row.map((value) => String(value || '').replace(/\s+/g, ' ').trim()).join('\t'))
    .join('\n')
}

function applyAdvancePlan(plan) {
  return plan.map((item) => {
    const action = setLabIdForRepo(item.repo, item.toLabId)
    return {
      ...item,
      action
    }
  })
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return
  }

  const fromLabId = args.from ? normalizeLabId(args.from) : null
  const repos = resolveRepos(args)
  ensureGhAvailable()

  const progress = collectProgress(repos, args.workflow)
  const plan = buildAdvancePlan(progress, fromLabId, { onlyReady: args.onlyReady })

  if (args.apply && !fromLabId && plan.length > 1) {
    throw new Error('Refusing to advance multiple repos without --from; scope the cohort explicitly')
  }

  const result = args.apply ? applyAdvancePlan(plan) : plan

  if (args.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  console.log(formatAdvancePlan(result))
}

if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error('[classroom-advance] FAILED:', err?.message || err)
    process.exitCode = 1
  }
}

module.exports = {
  applyAdvancePlan,
  buildAdvancePlan,
  formatAdvancePlan,
  parseArgs
}
