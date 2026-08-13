# Changesets

Every pull request that changes a public package should include a changeset:

```bash
pnpm changeset
```

Choose the affected packages and describe the public behavior change. Documentation-only and test-only changes do not require a changeset unless they correct the documented public contract.
