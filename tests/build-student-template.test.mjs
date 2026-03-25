import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildScript = path.join(
  repoRoot,
  'learninglab-world-class-implementation-kit',
  'overlays',
  'instructor-repo',
  'scripts',
  'build-student-template.mjs'
)

test('build-student-template keeps student wallet docs but excludes instructor-only wallet docs', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'student-template-'))
  const outDir = path.join(tmpRoot, 'template')

  try {
    await execFileAsync('node', [buildScript, '--source', repoRoot, '--out', outDir], {
      cwd: repoRoot
    })

    await assertPathExists(path.join(outDir, 'labs', 'README-lab-06-mobile-wallets.md'))
    await assertPathExists(path.join(outDir, 'STUDENT_WALLET_RUNBOOK.md'))
    await assertPathExists(path.join(outDir, 'WORKING_SOLUTIONS.md'))
    await assertPathExists(path.join(outDir, 'scripts', 'fast-forward-student-lab.js'))
    await assertPathExists(path.join(outDir, 'scripts', 'build-take-home-bundle.js'))

    await assertPathMissing(path.join(outDir, 'WALLET_FORKS.md'))
    await assertPathMissing(path.join(outDir, 'VILLAGE_DEMO_CONDUCTOR.md'))
    await assertPathMissing(path.join(outDir, 'COURSE_CLASSROOM.md'))
    await assertPathMissing(path.join(outDir, 'instructor-cheatsheets'))
    await assertPathMissing(path.join(outDir, 'LAB2-W01-Beyond_Compliance_A_Hands-On_Lab_for_Privacy-First_Digital_Identity.key'))
    await assertPathMissing(path.join(outDir, 'wallet-ios'))
    await assertPathMissing(path.join(outDir, 'wallet-android'))

    const studentReadme = await fs.readFile(path.join(outDir, 'README.md'), 'utf8')
    assert.match(studentReadme, /Optional Lab 06/)
    assert.match(studentReadme, /STUDENT_WALLET_RUNBOOK/)
    assert.match(studentReadme, /WORKING_SOLUTIONS/)
    assert.doesNotMatch(studentReadme, /WALLET_FORKS\.md/)
    assert.doesNotMatch(studentReadme, /VILLAGE_DEMO_CONDUCTOR\.md/)
    assert.doesNotMatch(studentReadme, /COURSE_CLASSROOM\.md/)
    assert.doesNotMatch(studentReadme, /wallet-ios/)
    assert.doesNotMatch(studentReadme, /wallet-android/)

    const walletRunbook = await fs.readFile(path.join(outDir, 'STUDENT_WALLET_RUNBOOK.md'), 'utf8')
    assert.match(walletRunbook, /node scripts\/setup-wallet-forks\.js --platform ios/)
    assert.match(walletRunbook, /clones the workshop forks/i)
    assert.match(walletRunbook, /not the untouched upstream vanilla wallets/i)
    assert.match(walletRunbook, /use your laptop, not the Codespace/i)
    assert.match(walletRunbook, /https:\/\/<codespace-name>-3001\.app\.github\.dev/)
    assert.doesNotMatch(walletRunbook, /\/Users\/johansellstrom\//)

    const walletBuildGuide = await fs.readFile(path.join(outDir, 'BUILD_THE_WALLET.md'), 'utf8')
    assert.match(walletBuildGuide, /johan-sellstrom\/eudi-app-ios-wallet-ui/)
    assert.match(walletBuildGuide, /already contain the iProov presentation-gate work/i)

    const workingSolutions = await fs.readFile(path.join(outDir, 'WORKING_SOLUTIONS.md'), 'utf8')
    assert.match(workingSolutions, /fast-forward-student-lab\.js/)
    assert.match(workingSolutions, /Peeking is allowed/i)
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true })
  }
})

async function assertPathExists(target) {
  await fs.access(target)
}

async function assertPathMissing(target) {
  await assert.rejects(() => fs.access(target))
}
