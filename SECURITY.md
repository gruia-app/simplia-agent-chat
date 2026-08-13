# Security policy

## Supported versions

Until 1.0, security fixes are applied to the latest published minor release.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting on the repository Security tab. Include affected versions, impact, reproduction steps and any suggested mitigation.

## Trust boundaries

- Provider events and surface payloads are untrusted input.
- A surface renderer must validate its payload before rendering.
- Permission prompts are user input, not authorization. The server must revalidate identity, tenant, pending request, policy and idempotency.
- Filesystem and terminal operations require both provider capability and an explicit grant.
- Unknown surfaces fail closed and must not expose raw payloads by default.
- Secrets and application data must not be placed in chat metadata or client-side fixtures.
