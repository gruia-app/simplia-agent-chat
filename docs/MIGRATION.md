# Migration guide

This guide is the versioned record of every breaking change to the wire
protocol, surface schemas or package API. Add a dated entry **before** merging
a breaking change — not after release.

## Versioning axes

- **Package semver** — `simplia-agent-chat` and the `packages/*` tarballs follow
  semver through changesets. Breaking API changes are `major` (or `minor` while
  the packages are pre-1.0) and must appear in this file.
- **Wire protocol** — `CHAT_PROTOCOL_VERSION` (currently `1`) is an integer
  major carried by every `ChatEvent` envelope. The reducer rejects any other
  major with `unsupported_protocol`. Bumping it is a breaking change and
  requires an entry here plus consumer rollout notes.
- **Surface schemas** — each `SurfaceBlock.kind` carries its own
  `schemaVersion`. A `surface.patch` applies only against the exact
  `baseRevision`; schema bumps are per-kind and must be listed below with an
  up/down migration note for persisted snapshots and journals.

## Entries

| Date | Version | Change | Migration |
| --- | --- | --- | --- |
| — | protocol `1` / packages `0.1.0` | Baseline. No breaking changes yet. | — |

## Writing a new entry

1. State the exact contract that changes: envelope field, event type, surface
   kind + `schemaVersion`, exported symbol, or default behavior.
2. Give the consumer action: rename, re-map, replay-from-snapshot note, or
   "no action — additive".
3. Note replay/persistence impact: whether stored journals and
   `thread.snapshot` payloads remain valid, and whether `ChatPersistencePort`
   data needs transformation.
4. Keep older entries immutable; corrections are appended, not rewritten.
