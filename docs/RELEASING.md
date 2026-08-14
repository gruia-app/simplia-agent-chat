# Releasing

The public Git repository is the distribution channel. Applications consume `simplia-agent-chat` from GitHub and pin a reviewed commit SHA, following the same immutable-reference rule used by Simplia's shared CI library.

No npm organization, registry session, package publication or publish token is part of this release process. The root package and every internal workspace package remain `private: true` to make accidental registry publication fail closed.

Compiled `packages/*/dist` files are versioned alongside their sources. `pnpm check` rebuilds them and fails if the committed artifact differs, while the Git-consumer smoke installs with lifecycle scripts disabled. A consumer therefore never needs the repository's workspace toolchain.

## Consumer contract

Add one direct dependency:

```json
{
  "dependencies": {
    "simplia-agent-chat": "github:gruia-app/simplia-agent-chat#<full-commit-sha>"
  }
}
```

Import only the required subpaths:

- `simplia-agent-chat/core`
- `simplia-agent-chat/react`
- `simplia-agent-chat/react/styles.css`
- `simplia-agent-chat/adapters/acv2`

Commit the consumer lockfile. The dependency declaration documents the reviewed revision and the lockfile records the resolved Git commit.

## Creating a release

1. Add a Changeset for public API changes, including the root `simplia-agent-chat` package that consumers install.
2. Run `pnpm check` from a clean checkout.
3. Run `pnpm version-packages` and review the changelog and version.
4. Commit the version change.
5. Create and push a signed `v*` tag for that exact commit.
6. The `Create GitHub release` workflow reruns the complete verification and creates release notes for the existing tag.
7. Upgrade each application by reviewing the diff between its pinned SHA and the new SHA, then updating its dependency and lockfile in a normal PR.

Release tags are human-friendly aliases. Production applications should continue to pin the full commit SHA so a moved tag cannot change installed source.
