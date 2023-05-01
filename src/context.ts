import * as core from '@actions/core'
import * as github from '@actions/github'
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
  provenance: string
  push: boolean
  sbom: string
  set: string[]
  source: string
  project: string
  token?: string
  buildxFallback: boolean
  buildPlatform?: string
}

export function getInputs(): Inputs {
  return {
    files: parseCSV(core.getInput('files')),
    workdir: core.getInput('workdir') || '.',
    targets: parseCSV(core.getInput('targets')),
    noCache: core.getBooleanInput('no-cache'),
    pull: core.getBooleanInput('pull'),
    load: core.getBooleanInput('load'),
    provenance: getProvenanceInput(),
    push: core.getBooleanInput('push'),
    sbom: core.getInput('sbom'),
    set: parseCSV(core.getInput('set')),
    source: core.getInput('source'),
    project: core.getInput('project'),
    token: core.getInput('token') || process.env.DEPOT_TOKEN,
    buildxFallback: core.getBooleanInput('buildx-fallback'),
    buildPlatform: core.getInput('build-platform'),
  }
}

let tempDir: string
export function getTempDir(): string {
  if (tempDir) return tempDir
  if (core.getState('tempDir')) return core.getState('tempDir')
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'depot-build-push-').split(path.sep).join(path.posix.sep))
  core.saveState('tempDir', tempDir)
  return tempDir
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

function getProvenanceInput(): string {
  const input = core.getInput('provenance')
  if (!input) return input

  try {
    return core.getBooleanInput('provenance') ? `builder-id=${provenanceBuilderID()}` : 'false'
  } catch {
    return resolveProvenanceAttrs(input)
  }
}

export function resolveProvenanceAttrs(input: string): string {
  // parse attributes from input
  const fields: string[][] = csv.parse(input, {
    relaxColumnCount: true,
    skipEmptyLines: true,
  })[0]

  // check if builder-id attribute exists in the input
  for (const field of fields) {
    const parts = field
      .toString()
      .split(/(?<=^[^=]+?)=/)
      .map((item) => item.trim())
    if (parts[0] == 'builder-id') {
      return input
    }
  }

  // if not add builder-id attribute
  return `${input},builder-id=${provenanceBuilderID()}`
}

function provenanceBuilderID(): string {
  const serverURL = process.env.GITHUB_SERVER_URL || 'https://github.com'
  return `${serverURL}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}`
}
