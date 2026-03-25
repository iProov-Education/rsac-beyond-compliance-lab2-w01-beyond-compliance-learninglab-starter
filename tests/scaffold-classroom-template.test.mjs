import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const scriptUrl = pathToFileURL(path.join(__dirname, '..', 'scripts', 'scaffold-classroom-template.js')).href
const mod = await import(scriptUrl)
const api = mod.default ?? mod

test('shouldExclude keeps instructor cheat sheets out of the classroom template', () => {
  const dirEntry = { isSymbolicLink() { return false } }
  assert.equal(api.shouldExclude('instructor-cheatsheets', dirEntry), true)
  assert.equal(api.ROOT_EXCLUDES.has('instructor-cheatsheets'), true)
})

test('shouldExclude still allows normal student docs', () => {
  const fileEntry = { isSymbolicLink() { return false } }
  assert.equal(api.shouldExclude('README.md', fileEntry), false)
  assert.equal(api.shouldExclude('WORKING_SOLUTIONS.md', fileEntry), false)
  assert.equal(api.shouldExclude('scripts/fast-forward-student-lab.js', fileEntry), false)
  assert.equal(api.shouldExclude('scripts/build-take-home-bundle.js', fileEntry), false)
})

test('generated classroom template includes the fast-forward helper and working solutions guide', async () => {
  await fs.access(path.join(repoRoot, 'classroom-template', 'scripts', 'fast-forward-student-lab.js'))
  await fs.access(path.join(repoRoot, 'classroom-template', 'scripts', 'build-take-home-bundle.js'))
  const guide = await fs.readFile(path.join(repoRoot, 'classroom-template', 'WORKING_SOLUTIONS.md'), 'utf8')
  assert.match(guide, /fast-forward-student-lab\.js/)
  assert.match(guide, /Peeking is allowed/i)
})
