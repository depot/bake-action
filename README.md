# Depot `bake-action` GitHub Action

This action implements the same inputs and outputs as the [`docker/bake-action`](https://github.com/docker/bake-action), but uses the [`depot` CLI](https://github.com/depot/cli) to execute the build.

### Table of Contents

- [Depot `bake-action` GitHub Action](#depot-bake-action-github-action)
  - [Table of Contents](#table-of-contents)
  - [Setup](#setup)
  - [Usage](#usage)
    - [Authentication](#authentication)
    - [Differences from `docker/bake-action`](#differences-from-dockerbake-action)
  - [Inputs](#inputs)
    - [Depot-specific inputs](#depot-specific-inputs)
    - [General inputs](#general-inputs)
  - [Outputs](#outputs)
  - [License](#license)

## Setup

The `depot` CLI will need to be available in your workflow, you can use the [`depot/setup-action`](https://github.com/depot/setup-action) to install it:

```yaml
steps:
  - uses: depot/setup-action@v1
```

## Usage

This action implements the same inputs and outputs as the [`docker/bake-action`](https://github.com/docker/bake-action). You will need to supply your project ID and Depot authentication information, although both can be inferred from the environment. See below for more details.

### Authentication

This action needs a Depot API token to communicate with your project's builders. You can supply this one of three ways. The third, using OIDC, is the preferred method, but you can also supply a token directly.

1. You can supply a user or project API token via the `token` input:

   ```yaml
   steps:
     - uses: depot/bake-action@v1
       with:
         token: ${{ secrets.DEPOT_TOKEN }}
   ```

2. You can supply a user or project API token via the `DEPOT_TOKEN` environment variable:

   ```yaml
   steps:
     - uses: depot/bake-action@v1
       env:
         DEPOT_TOKEN: ${{ secrets.DEPOT_TOKEN }}
   ```

3. Depot supports GitHub's [OpenID Connect](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect) tokens via a trust relationship, so your Actions builds can securely authenticate with your Depot projects without any static access tokens. To configure the trust relationship, visit your Depot project settings, then add your repository and desired workflow config to `Trust Relationships`. Then in your workflow, enable the `id-token: write` permission:

   ```yaml
   permissions:
     # allow issuing OIDC tokens for this workflow run
     id-token: write
     # allow at least reading the repo contents, add other permissions if necessary
     contents: read
   steps:
     # no need to provide a DEPOT_TOKEN
     - uses: depot/bake-action@v1
   ```

### Differences from `docker/bake-action`

1. Authentication — this action needs to authenticate with a Depot API token to communicate with your project's builders (see above).

2. If you have not configured a `depot.json` file with `depot init`, you can explicitly specify your project ID via the `project` input:

   ```yaml
   steps:
     - uses: depot/build-push-action@v1
       with:
         project: abc123xyz
   ```

3. The `builder` input is not supported - this action always runs builds using Depot's hosted builders, if you need to route builds to a local buildx builder, you should use the `docker/build-push-action`.

## Inputs

### Depot-specific inputs

| Name             | Type    | Description                                                                                                                                                                    |
| ---------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `project`        | String  | Depot [project](https://depot.dev/docs/core-concepts#projects) ID to route the image build to your projects builders (default: the `depot.json` file at the root of your repo) |
| `token`          | String  | You must authenticate with the Depot API to communicate with your projects builders ([see Authentication above](#authentication))                                              |
| `build-platform` | String  | The platform to use for the build ( `linux/amd64` or `linux/arm64`)                                                                                                            |
| `lint`           | Bool    | Lint dockerfiles and fail build if any issues are of `error` severity. (default `false`)                                                                                       |
| `lint-fail-on`   | String  | Severity of linter issue to cause the build to fail. (`error`, `warn`, `info`, `none`)                                                                                         |
| `save`           | Boolean | Save the image to the Depot ephemeral registry (for use with the [depot/pull-action](https://github.com/depot/pull-action))                                                    |

### General inputs

The following inputs can be used as `step.with` keys and match the inputs from [`docker/bake-action`](https://github.com/docker/bake-action):

| Name         | Type        | Description                                                                                                                                 |
| ------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `files`      | List/CSV    | List of [bake definition files](https://docs.docker.com/build/bake/reference/)                                                              |
| `workdir`    | String      | Working directory of execution                                                                                                              |
| `targets`    | List/CSV    | List of bake targets (`default` target used if empty)                                                                                       |
| `no-cache`   | Bool        | Do not use cache when building the image (default `false`)                                                                                  |
| `pull`       | Bool        | Always attempt to pull a newer version of the image (default `false`)                                                                       |
| `load`       | Bool        | Load is a shorthand for `--set=*.output=type=docker` (default `false`)                                                                      |
| `provenance` | Bool/String | [Provenance](https://docs.docker.com/build/metadata/attestations/slsa-provenance/) is a shorthand for `--set=*.attest=type=provenance`      |
| `push`       | Bool        | Push is a shorthand for `--set=*.output=type=registry` (default `false`)                                                                    |
| `sbom`       | Bool/String | [SBOM](https://docs.docker.com/build/metadata/attestations/sbom/) is a shorthand for `--set=*.attest=type=sbom`                             |
| `sbom-dir`   | String      | Save all image [SBOM](https://docs.docker.com/build/metadata/attestations/sbom/) to this output directory                                   |
| `set`        | List        | List of [targets values to override](https://docs.docker.com/engine/reference/commandline/buildx_bake/#set) (eg: `targetpattern.key=value`) |

## Outputs

| Name         | Type   | Description           |
| ------------ | ------ | --------------------- |
| `metadata`   | JSON   | Build result metadata |
| `project-id` | String | Depot Project ID      |
| `build-id`   | String | Depot Build ID        |

## License

MIT License, see `LICENSE`.

Code derived from `docker/bake-action` copyright 2013-2018 Docker, Inc., Apache License, Version 2.0.
