# Ecosystem rollout

The shared kernel is deliberately smaller than the applications that consume it. Each application owns its data, transport gateway, policies and surface plugins.

| Consumer | Initial surfaces and interactions | First safe rollout |
| --- | --- | --- |
| ACV2 | execution plans, diffs, commands, permissions, deployment evidence | read-only timeline, then approvals in an internal canary |
| Contenido | publication preview, image review, video storyboard, editorial question | draft/review before schedule or publish |
| Newsletter Hub | campaign preview, edition, sequence, audience summary | preview and test-send approval |
| Gestor Gmail | tasks, objectives, documents, linked-email context | read-only project assistant |
| Anvilo / B2BWeb | page preview, section tree, generation progress, deploy approval | preview before publish/deploy |
| INSAIDRv3 | audience, leads, outreach sequence, campaign state | read-only analysis before outreach |
| Facebook Ads | campaign, ad set, creative preview, spend warning | preview before budget mutation |
| Facturación IA | contact, invoice preview, reconciliation table | explicit confirmation before financial mutation |
| SEO | metrics, keyword clusters, audit findings, content brief | read-only analysis and draft briefs |
| Proposia | proposal preview, versions, approval | preview before external delivery |
| Quest2Close | pipeline, opportunity summary, next action | read-only pipeline assistant |
| Analytics/Data | charts, tables, filters and exports | read-only query before saved view/export |

## Adoption gate per application

1. Map native events to protocol fixtures.
2. Register only trusted surface schemas and renderers.
3. Run replay and unknown-payload conformance tests with `runCoreConformance` and, for React hosts, `runWorkspaceMarkupConformance` / `runSurfaceHostMarkupConformance`.
4. Launch read-only behind an application feature flag.
5. Add pending interactions with server-side policy enforcement.
6. Add domain actions one by one with idempotency and audit evidence.
7. Verify browser, API, persistence and rollback independently.

No application should copy the core package into its repository. Consume a pinned package version and keep application plugins local unless they are generic enough to publish separately.
