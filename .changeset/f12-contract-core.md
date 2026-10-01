"@simplia/agent-chat-core": minor
---

F1.2 del plan chat-céntrico (SPEC-CHAT-F1-R687 rev 2 §3, §7): core TS del contrato, sin DOM.

- `proposal-machine`: máquina de estados de §3 — todas las transiciones válidas/inválidas (`InvalidTransitionError` → 409), `modify` descarta la origen con `supersedes`, `discard` sobre `accepted` solo en gracia, `revert` solo dentro de `undo.window_s` (`UndoWindowExpiredError`).
- `confirm-policy`: escalado `card`→`strong` por umbral de coste (solo sube), y guarda `assertIrreversibleAck` (§4: `strong` exige `ack_irreversible=true`).
- `diff-model`: diff estructurado de campos/texto/filas para `preview(input)`.
- `panels`: modelos puros de Memoria, Plan y BYO con reducers idempotentes.
- `agent-server-client`: cliente HTTP de §5 (fetch inyectable, errores `{code,message}` 400/403/404/409/410/422 → `AgentServerError`).
- Gate de cobertura F1.2 (`test:coverage`): ≥90% líneas en los 5 módulos (hoy 100%).
