# Releasing

The packages use Changesets and are published together from the public repository.

## Before release

1. Ensure every public change has an appropriate changeset.
2. Run `pnpm check` from a clean checkout.
3. Run `pnpm version-packages` and review versions, changelogs and internal dependency ranges.
4. Commit the version changes and create a signed release tag.
5. Run the protected `Publish packages` workflow.

The workflow builds and tests all packages, validates tarball contents, then publishes with npm provenance. Publish core before packages that depend on it; Changesets handles the workspace graph.

## Required repository configuration

- public GitHub repository under the chosen owner;
- dedicated `npm` GitHub environment, with deployment protection enabled before the first publish;
- npm trusted-publisher entries for all three packages, bound to `gruia-app/simplia-agent-chat`, `release.yml`, environment `npm`, and the `npm publish` action;
- branch protection requiring CI on Node 20 and 22;
- private vulnerability reporting enabled.

The release workflow uses npm trusted publishing through GitHub OIDC and does not read a long-lived publish token. It requires Node 24 and fails before install if the bundled npm CLI is older than 11.5.1.

## Residual external release gates

Ownership of the `@simplia` npm scope is an unresolved external requirement. This repository does not claim that ownership. Package-name availability in the public registry is not ownership. Confirm who owns `@simplia` and that these package names can be published there before the first release.

Trusted publishers are configured from each package's settings on npmjs.com. If npm requires the package to exist before that setting is available, an authenticated scope owner must perform the one-time first publication from a clean checkout, then immediately configure the trusted publisher and stop using the bootstrap credential.

The publish workflow keeps `id-token: write` and the protected `npm` environment. npm generates provenance automatically for trusted publishes from the public repository. `contents: write` is required so Changesets can push the release tag.
