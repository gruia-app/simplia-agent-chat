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
- npm scope ownership for `@simplia`;
- protected `npm` GitHub environment;
- `NPM_TOKEN` until trusted publishing is configured;
- branch protection requiring CI on Node 20 and 22;
- private vulnerability reporting enabled.

The package names are currently unclaimed in the public npm registry. Availability is not ownership; confirm the `@simplia` scope before the first release.
