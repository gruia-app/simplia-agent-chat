# Contributing

Thank you for improving Simplia Agent Chat.

## Development

Requirements: Node.js 20 or newer and pnpm 9 or newer.

```bash
pnpm install --frozen-lockfile
pnpm check
```

Add tests for protocol, reducer or adapter changes. UI changes should include an accessibility assertion and a real browser check when interaction or layout changes.

## Pull requests

- Keep provider-specific behavior behind adapters.
- Do not grant a capability merely because a provider advertises it.
- Treat unknown external payloads as untrusted input.
- Preserve event idempotency and revision checks.
- Document user-visible or public API changes in `CHANGELOG.md`.
- Do not include credentials, customer data or private application payloads in fixtures.

By contributing, you agree that your contribution is licensed under Apache-2.0.
