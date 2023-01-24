import * as core from '@actions/core'
import * as github from '@actions/github'
import * as crypto from 'crypto'
import * as csv from 'csv-parse/sync'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export interface Inputs {
  files: string[]
  workdir: string
  targets: string[]
  noCache: boolean
  pull: boolean
  load: boolean
  push: boolean
  set: string[]
  source: string
  project: string
  token?: string
}

export function getInputs(): Inputs {
  return {
    files: parseCSV(core.getInput('files')),
    workdir: core.getInput('workdir') || '.',
    targets: parseCSV(core.getInput('targets')),
    noCache: core.getBooleanInput('no-cache'),
    pull: core.getBooleanInput('pull'),
    load: core.getBooleanInput('load'),
    push: core.getBooleanInput('push'),
    set: parseCSV(core.getInput('set')),
    source: core.getInput('source'),
    project: core.getInput('project'),
    token: core.getInput('token') || process.env.DEPOT_TOKEN,
  }
}

let defaultContext: string
export function getDefaultBuildContext(): string {
  if (defaultContext) return defaultContext
  const gitServer = process.env.GITHUB_SERVER_URL || 'https://github.com'
  const ref = resolveRef()
  defaultContext = `${gitServer}/${github.context.repo.owner}/${github.context.repo.repo}.git#${ref}`
  return defaultContext
}

function resolveRef(): string {
  let ref = github.context.ref
  if (github.context.sha && ref && !ref.startsWith('refs/')) ref = `refs/heads/${github.context.ref}`
  if (github.context.sha && !ref.startsWith(`refs/pull/`)) ref = github.context.sha
  return ref
}

let tempDir: string
export function getTempDir(): string {
  if (tempDir) return tempDir
  if (core.getState('tempDir')) return core.getState('tempDir')
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'depot-build-push-').split(path.sep).join(path.posix.sep))
  core.saveState('tempDir', tempDir)
  return tempDir
}

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
export function getTempFile(): string {
  let tries = 0
  while (tries < 20) {
    let random
    try {
      random = crypto.randomBytes(16)
    } catch {
      random = crypto.pseudoRandomBytes(16)
    }

    const chars = []
    for (let i = 0; i < 10; i++) {
      chars.push(alphabet[random.readUInt8(i) % alphabet.length])
    }

    const filename = path.join(getTempDir(), chars.join(''))
    if (!fs.existsSync(filename)) return filename
    tries += 1
  }

  throw new Error('Unable to generate a temporary file')
}

export const isPost = !!core.getState('isPost')
if (!isPost) {
  core.saveState('isPost', 'true')
}

function parseCSV(source: string): string[] {
  source = source.trim()

  if (source === '') return []

  const items: string[][] = csv.parse(source, {
    columns: false,
    relaxColumnCount: true,
    relaxQuotes: true,
    skipEmptyLines: true,
  })

  return items
    .flatMap((i) => i)
    .map((i) => i.trim())
    .filter((i) => i)
}
