import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const scriptUrl = pathToFileURL(path.join(__dirname, '..', 'scripts', 'build-take-home-bundle.js')).href
const mod = await import(scriptUrl)
const api = mod.default ?? mod

test('parseArgs defaults to a zipped take-home bundle under dist/take-home', () => {
  assert.deepEqual(api.parseArgs([]), {
    source: null,
    out: null,
    name: 'LearningLab-working-project',
    clean: true,
    zip: true,
    help: false
  })
})

test('shouldSkip excludes instructor-only roots but keeps student-safe docs', () => {
  const dirEntry = { isSymbolicLink() { return false } }
  const fileEntry = { isSymbolicLink() { return false } }

  assert.equal(api.shouldSkip('instructor-cheatsheets', dirEntry), true)
  assert.equal(api.shouldSkip('.github', dirEntry), true)
  assert.equal(api.shouldSkip('COURSE_CLASSROOM.md', fileEntry), true)
  assert.equal(api.shouldSkip('README.md', fileEntry), false)
  assert.equal(api.shouldSkip('WORKING_SOLUTIONS.md', fileEntry), false)
  assert.equal(api.shouldSkip('scripts/build-take-home-bundle.js', fileEntry), false)
})

test('buildTakeHomeBundle copies the integrated repo but strips instructor-only material', async () => {
  const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'take-home-source-'))
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'take-home-out-'))

  try {
    await writeFixture(sourceRoot, 'package.json', '{"name":"learninglab"}\n')
    await writeFixture(sourceRoot, 'README.md', '# Demo\n')
    await writeFixture(sourceRoot, 'WORKING_SOLUTIONS.md', '# Working Solutions\n')
    await writeFixture(sourceRoot, 'issuer/src/index.ts', 'export const issuer = true\n')
    await writeFixture(sourceRoot, 'tests/example.test.mjs', 'export {}\n')
    await writeFixture(sourceRoot, 'instructor-cheatsheets/lab-01.md', 'secret\n')
    await writeFixture(sourceRoot, 'COURSE_CLASSROOM.md', 'instructor only\n')
    await writeFixture(sourceRoot, 'STATUS.md', 'status\n')
    await writeFixture(sourceRoot, '.github/workflows/classroom.yml', 'workflow\n')
    await writeFixture(sourceRoot, '.env', 'SECRET=1\n')
    await writeFixture(sourceRoot, 'client_secret_demo.apps.googleusercontent.com.json', '{}\n')
    await writeFixture(sourceRoot, 'dist/old/file.txt', 'stale\n')

    const result = await api.buildTakeHomeBundle({
      source: sourceRoot,
      out: outRoot,
      name: 'DemoBundle',
      zip: false
    })

    assert.equal(result.zipPath, null)
    await fs.access(path.join(result.bundleRoot, 'package.json'))
    await fs.access(path.join(result.bundleRoot, 'README.md'))
    await fs.access(path.join(result.bundleRoot, 'WORKING_SOLUTIONS.md'))
    await fs.access(path.join(result.bundleRoot, 'issuer', 'src', 'index.ts'))
    await fs.access(path.join(result.bundleRoot, 'tests', 'example.test.mjs'))
    await fs.access(path.join(result.bundleRoot, 'TAKE_HOME_BUNDLE_GENERATED.md'))

    await assert.rejects(() => fs.access(path.join(result.bundleRoot, 'instructor-cheatsheets')))
    await assert.rejects(() => fs.access(path.join(result.bundleRoot, 'COURSE_CLASSROOM.md')))
    await assert.rejects(() => fs.access(path.join(result.bundleRoot, 'STATUS.md')))
    await assert.rejects(() => fs.access(path.join(result.bundleRoot, '.github')))
    await assert.rejects(() => fs.access(path.join(result.bundleRoot, '.env')))
    await assert.rejects(() => fs.access(path.join(result.bundleRoot, 'client_secret_demo.apps.googleusercontent.com.json')))
    await assert.rejects(() => fs.access(path.join(result.bundleRoot, 'dist')))

    const marker = await fs.readFile(path.join(result.bundleRoot, 'TAKE_HOME_BUNDLE_GENERATED.md'), 'utf8')
    assert.match(marker, /student-safe export/i)
    assert.match(marker, /integrated working LearningLab repo/i)
  } finally {
    await fs.rm(sourceRoot, { recursive: true, force: true })
    await fs.rm(outRoot, { recursive: true, force: true })
  }
})

test('createZipArchive shells out to zip with the bundle directory name', () => {
  let invocation = null
  const zipPath = api.createZipArchive('/tmp/take-home/DemoBundle', '/tmp/take-home/DemoBundle.zip', (cmd, args, options) => {
    invocation = { cmd, args, options }
    return { status: 0, stdout: '', stderr: '' }
  })

  assert.equal(zipPath, '/tmp/take-home/DemoBundle.zip')
  assert.deepEqual(invocation, {
    cmd: 'zip',
    args: ['-qr', '/tmp/take-home/DemoBundle.zip', 'DemoBundle'],
    options: {
      cwd: '/tmp/take-home',
      encoding: 'utf8'
    }
  })
})

async function writeFixture(root, relPath, content) {
  const target = path.join(root, relPath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content, 'utf8')
}
