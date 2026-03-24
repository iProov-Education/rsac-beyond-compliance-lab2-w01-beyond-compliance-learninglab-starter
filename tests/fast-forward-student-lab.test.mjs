import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const scriptUrl = pathToFileURL(path.join(__dirname, '..', 'scripts', 'fast-forward-student-lab.js')).href
const mod = await import(scriptUrl)
const api = mod.default ?? mod

test('normalizeLabId pads single digits and rejects unsupported labs', () => {
  assert.equal(api.normalizeLabId('2'), '02')
  assert.equal(api.normalizeLabId('05'), '05')
  assert.throws(() => api.normalizeLabId('6'), /Invalid lab id/)
})

test('parseArgs understands lab, target, and dry-run', () => {
  assert.deepEqual(api.parseArgs(['--lab', '03', '--target', '/tmp/student', '--dry-run']), {
    lab: '03',
    target: '/tmp/student',
    dryRun: true,
    help: false
  })
})

test('createFastForwardPlan uses starter overrides for Lab 00 and integrated files for Lab 02', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-forward-root-'))
  const starterRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-forward-starter-'))
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-forward-target-'))

  const lab00 = api.createFastForwardPlan(
    { lab: '00', target: targetRoot },
    { repoRoot, starterOverridesRoot: starterRoot }
  )
  const lab02 = api.createFastForwardPlan(
    { lab: '02', target: targetRoot },
    { repoRoot, starterOverridesRoot: starterRoot }
  )

  assert.equal(lab00.sourceKind, 'starter')
  assert.equal(lab00.copies[0].source, path.join(starterRoot, 'issuer/src/index.ts'))
  assert.equal(lab02.sourceKind, 'integrated')
  assert.deepEqual(
    lab02.copies.map((copy) => copy.relPath),
    ['issuer/src/index.ts', 'verifier/src/index.ts', 'bbs-lib/src/index.ts']
  )
})

test('applyFastForwardPlan copies the planned files into the target repo', async () => {
  const repoRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'fast-forward-apply-root-'))
  const starterRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'fast-forward-apply-starter-'))
  const targetRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'fast-forward-apply-target-'))

  try {
    await fsp.writeFile(path.join(targetRoot, 'package.json'), '{"name":"student"}\n', 'utf8')
    await writeFixture(repoRoot, 'issuer/src/index.ts', 'integrated issuer\n')
    await writeFixture(repoRoot, 'verifier/src/index.ts', 'integrated verifier\n')
    await writeFixture(repoRoot, 'bbs-lib/src/index.ts', 'integrated bbs\n')
    await writeFixture(starterRoot, 'issuer/src/index.ts', 'starter issuer\n')
    await writeFixture(starterRoot, 'verifier/src/index.ts', 'starter verifier\n')

    const plan = api.createFastForwardPlan(
      { lab: '02', target: targetRoot },
      { repoRoot, starterOverridesRoot: starterRoot }
    )

    await api.applyFastForwardPlan(plan, {}, fsp)

    assert.equal(await fsp.readFile(path.join(targetRoot, 'issuer/src/index.ts'), 'utf8'), 'integrated issuer\n')
    assert.equal(await fsp.readFile(path.join(targetRoot, 'verifier/src/index.ts'), 'utf8'), 'integrated verifier\n')
    assert.equal(await fsp.readFile(path.join(targetRoot, 'bbs-lib/src/index.ts'), 'utf8'), 'integrated bbs\n')
  } finally {
    await fsp.rm(repoRoot, { recursive: true, force: true })
    await fsp.rm(starterRoot, { recursive: true, force: true })
    await fsp.rm(targetRoot, { recursive: true, force: true })
  }
})

test('formatPlan reminds instructors to verify with the matching lab check', () => {
  const plan = api.createFastForwardPlan(
    { lab: '04', target: '/tmp/student-repo' },
    { repoRoot: '/tmp/instructor', starterOverridesRoot: '/tmp/starter' }
  )
  const text = api.formatPlan(plan, { dryRun: true })

  assert.match(text, /Dry run only/)
  assert.match(text, /pnpm lab:check -- --lab 04 --start --verbose/)
  assert.match(text, /LAB_ID=04 pnpm classroom:check/)
  assert.match(text, /issuance-time gating/i)
})

async function writeFixture(root, relPath, content) {
  const target = path.join(root, relPath)
  await fsp.mkdir(path.dirname(target), { recursive: true })
  await fsp.writeFile(target, content, 'utf8')
}
