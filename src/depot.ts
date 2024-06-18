import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'
import * as http from '@actions/http-client'
import * as publicOIDC from '@depot/actions-public-oidc-client'
import {Bake} from '@docker/actions-toolkit/lib/buildx/bake'
import {Build} from '@docker/actions-toolkit/lib/buildx/build'
import {Exec} from '@docker/actions-toolkit/lib/exec'
import {Toolkit} from '@docker/actions-toolkit/lib/toolkit'
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

export async function bake(inputs: Inputs) {
  const gitAuthToken = process.env.BUILDX_BAKE_GIT_AUTH_TOKEN ?? inputs.githubToken
  const targets = inputs.targets.length > 0 ? inputs.targets : ['default']
  const bakeArgs = [
    ...(inputs.source ? [inputs.source] : []),
    ...flag('--file', inputs.files),
    ...flag('--no-cache', inputs.noCache),
    ...flag('--pull', inputs.pull),
    ...flag('--load', inputs.load),
    ...flag('--push', inputs.push),
    ...flag('--sbom', inputs.sbom),
    ...flag('--sbom-dir', inputs.sbomDir),
    ...flag('--set', inputs.set),
    ...flag('--push', inputs.push),
    ...flag('--set', inputs.set),
    ...flag('--metadata-file', getMetadataFile()),
  ]

  const toolkit = new Toolkit()
  const bakedef = await toolkit.buildxBake.getDefinition(
    {
      files: inputs.files,
      load: inputs.load,
      noCache: inputs.noCache,
      overrides: inputs.set,
      provenance: inputs.provenance,
      push: inputs.push,
      sbom: inputs.sbom,
      source: inputs.source,
      targets: inputs.targets,
      githubToken: gitAuthToken,
    },
    {cwd: inputs.workdir},
  )
  if (inputs.provenance) {
    bakeArgs.push('--provenance', inputs.provenance)
  } else if (!Bake.hasDockerExporter(bakedef, inputs.load)) {
    // if provenance not specified and BuildKit version compatible for
    // attestation, set default provenance. Also needs to make sure user
    // doesn't want to explicitly load the image to docker.
    if (github.context.payload.repository?.private ?? false) {
      // if this is a private repository, we set the default provenance
      // attributes being set in buildx: https://github.com/docker/buildx/blob/fb27e3f919dcbf614d7126b10c2bc2d0b1927eb6/build/build.go#L603
      bakeArgs.push('--provenance', Build.resolveProvenanceAttrs(`mode=min,inline-only=true`))
    } else {
      // for a public repository, we set max provenance mode.
      bakeArgs.push('--provenance', Build.resolveProvenanceAttrs(`mode=max`))
    }
  }

  const depotArgs = [
    ...flag('--project', inputs.project),
    ...flag('--build-platform', inputs.buildPlatform),
    ...flag('--lint', inputs.lint),
    ...flag('--lint-fail-on', inputs.lintFailOn),
    ...flag('--save', inputs.save),
  ]
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

  if (!token) {
    const isOSSPullRequest =
      github.context.eventName === 'pull_request' &&
      github.context.payload.repository?.private === false &&
      github.context.payload.pull_request &&
      github.context.payload.pull_request.head?.repo?.full_name !== github.context.payload.repository?.full_name
    if (isOSSPullRequest) {
      try {
        core.info('Attempting to acquire open-source pull request OIDC token')
        const oidcToken = await publicOIDC.getIDToken('https://depot.dev')
        core.info(`Using open-source pull request OIDC token for Depot authentication`)
        token = oidcToken
      } catch (err) {
        core.info(`Unable to exchange open-source pull request OIDC token for temporary Depot token: ${err}`)
      }
    }
  }

  const buildEnv: Record<string, string> = {
    ...process.env,
    BUILDX_BAKE_GIT_AUTH_TOKEN: gitAuthToken,
    ...(token ? {DEPOT_TOKEN: token} : {}),
  }

  try {
    await Exec.getExecOutput('depot', ['bake', ...args], {
      cwd: inputs.workdir,
      env: buildEnv,
      ignoreReturnCode: true,
    }).then((res) => {
      if (res.stderr.length > 0 && res.exitCode != 0) {
        throw new Error(`buildx bake failed with: ${res.stderr.match(/(.*)\s*$/)?.[0]?.trim() ?? 'unknown error'}`)
      }
    })
  } catch (err) {
    const lintFailed = inputs.lint && (err as Error).message?.includes('linting failed')
    if (inputs.buildxFallback && !lintFailed) {
      core.warning(`falling back to buildx: ${err}`)
      await Exec.getExecOutput('docker', ['buildx', 'bake', ...bakeArgs, ...targets], {
        cwd: inputs.workdir,
        env: buildEnv,
      })
    } else {
      throw err
    }
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
