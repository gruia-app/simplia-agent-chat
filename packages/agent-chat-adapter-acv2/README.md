# @simplia/agent-chat-adapter-acv2

Optional adapter for ACV2 durable run events and the ACV2 provider capability profiles.

```bash
pnpm add @simplia/agent-chat-core @simplia/agent-chat-adapter-acv2
```

```ts
import { acv2PmAdapter } from "@simplia/agent-chat-adapter-acv2";

const events = acv2PmAdapter.normalize(durableEvent, context);
```

Capability support does not grant filesystem or terminal permission. Consumers must negotiate grants independently.

Apache-2.0.
