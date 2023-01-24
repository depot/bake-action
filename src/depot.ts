import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as http from '@actions/http-client'
import * as fs from 'fs'
import * as path from 'path'
import type {Inputs} from './context'
import * as context from './context'

const client = new http.HttpClient('depot-build-push-action')

export async function isInstalled(): Promise<boolean> {
  try {
    const {exitCode} = await exec.getExecOutput('depot', [], {ignoreReturnCode: true, silent: true})
    return exitCode === 0
  } catch {
    return false
  }
}

export async function version() {
  await exec.exec('depot', ['version'], {failOnStdErr: false})
}

async function execBake(cmd: string, args: string[], options: exec.ExecOptions) {
  const res = await exec.getExecOutput(cmd, args, options)
  if (res.stderr.length > 0 && res.exitCode != 0) {
    throw new Error(`failed with: ${res.stderr.match(/(.*)\s*$/)?.[0]?.trim() ?? 'unknown error'}`)
  }
}

export async function bake(inputs: Inputs) {
  const defaultContext = context.getDefaultBuildContext()
  const targets = inputs.targets.length > 0 ? inputs.targets : ['default']
  const bakeArgs = [
    ...flag('--file', inputs.files),
    ...flag('--no-cache', inputs.noCache),
    ...flag('--pull', inputs.pull),
    ...flag('--load', inputs.load),
    ...flag('--push', inputs.push),
    ...flag('--set', inputs.set),
    ...flag('--push', inputs.push),
    ...flag('--set', inputs.set),
    ...flag('--metadata-file', getMetadataFile()),
  ]
  const depotArgs = [...flag('--project', inputs.project)]
  const args = [...bakeArgs, ...depotArgs, ...targets]

  // Attempt to exchange GitHub Actions OIDC token for temporary Depot trust relationship token
  let token = inputs.token ?? process.env.DEPOT_TOKEN
  if (!token) {
    try {
      const odicToken = await core.getIDToken('https://depot.dev')
      const res = await client.postJson<{ok: boolean; token: string}>(
        'https://github.depot.dev/auth/oidc/github-actions',
        {token: odicToken},
      )
      if (res.result && res.result.token) {
        token = res.result.token
        core.info(`Exchanged GitHub Actions OIDC token for temporary Depot token`)
      }
    } catch (err) {
      core.info(`Unable to exchange GitHub OIDC token for temporary Depot token: ${err}`)
    }
  }

  try {
    await execBake('depot', ['bake', ...args, defaultContext], {
      cwd: inputs.workdir,
      ignoreReturnCode: true,
      env: {...process.env, ...(token ? {DEPOT_TOKEN: token} : {})},
    })
  } catch (err) {
    throw err
  }
}

function flag(name: string, value: string | string[] | boolean | undefined): string[] {
  if (!value) return []
  if (value === true) return [name]
  if (Array.isArray(value)) return value.flatMap((item) => [name, item])
  return [name, value]
}

function getMetadataFile(): string {
  return path.join(context.getTempDir(), 'metadata-file').split(path.sep).join(path.posix.sep)
}

export function getMetadata(): string | undefined {
  const metadataFile = getMetadataFile()
  if (!fs.existsSync(metadataFile)) return undefined
  const content = fs.readFileSync(metadataFile, {encoding: 'utf-8'}).trim()
  if (content === 'null') return undefined
  return content
}
