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
5. From the reviewed commit already merged into `main`, create and push an annotated GPG- or SSH-signed tag whose name is exactly `v` plus the root `package.json` version (for example, `v0.2.0`). The signing key must be registered with the GitHub account so GitHub reports the tag signature as verified.
6. The `Create GitHub release` workflow rejects lightweight or unverified tags, version mismatches, tags whose target differs from the checkout, and commits not reachable from `origin/main`. It then reruns the complete verification and creates release notes for the existing tag.
7. Upgrade each application by reviewing the diff between its pinned SHA and the new SHA, then updating its dependency and lockfile in a normal PR.

Release tags are human-friendly aliases. Production applications should continue to pin the full commit SHA so a moved tag cannot change installed source.

Example after merging the version commit:

```bash
git switch main
git pull --ff-only origin main
git tag -s "v$(node -p \"require('./package.json').version\")" -m "Simplia Agent Chat $(node -p \"require('./package.json').version\")"
git push origin "v$(node -p \"require('./package.json').version\")"
```

Do not publish a release from a local-only commit or use a lightweight tag. Repository rules should restrict creation and updates of `v*` tags to release maintainers; the workflow's verification is an additional fail-closed gate, not a substitute for tag protection.
