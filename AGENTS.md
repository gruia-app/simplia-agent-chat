# Agent contribution guide

## Commands

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm --dir examples/react-lab build
```

## Boundaries

- Keep the core provider-neutral.
- Put application-specific transports in adapter packages.
- Keep business renderers and mutations in consuming applications.
- Do not treat provider capability as a permission grant.
- Do not expose raw unknown surface payloads.
- Preserve deterministic replay, event idempotency and surface revisions.
- Public API changes require tests, documentation and a changeset.

Never add credentials, customer data, internal URLs or production fixtures. Browser servers and watchers launched on Windows must remain hidden.
