---
"simplia-agent-chat": minor
"@simplia/agent-chat-core": minor
"@simplia/agent-chat-react": minor
---

Add tenant usage metering for chat turns and a limit-reached notice contract.

- Core `usage-meter`: `diffChatUsage`, `collectUsageMeterEvents` and `watchChatUsage` derive one `ChatUsageMeterEvent` per thread whose cumulative `usageByThread` changed — `{ threadId, organizationId, delta, usage }` — the chat analogue of the voice metering hook for per-tenant quota pipelines.
- Core `limits`: `ChatLimitNotice` (`quota_exceeded` | `plan_required` | `rate_limited` | `custom`) plus `normalizeChatLimitNotice` — fail-closed validation so a malformed host payload degrades to no notice.
- React: `LimitNoticeBar` (alert + optional CTA) wired into `AgentChatShell` via `limitNotice`/`onLimitAction`; `blocking !== false` disables submitting at the point of the limit while keeping the draft editable. New copy key `limitNoticeLabel` and `.sac-limit-notice` styles.
