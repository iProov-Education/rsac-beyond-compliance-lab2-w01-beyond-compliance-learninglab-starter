import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
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
})
