# SPEC-CHAT-F1 · Contrato ToolSpec/Proposal y paquete v2 (CEO-PSAAS-R687), rev 2 (incorpora PLAT-PSAAS-R687-02-REPLY 1-11)
Dueño: Producto SaaS. Revisa: PLAT (el contrato del que depende F2). Fuente aprobada: ceo/opus/M-CHAT-CENTRIC.md §1.1-1.7 y §5 (sha256 55abc38710d1). Si algo choca con esta SPEC, manda esta SPEC; si choca con M, se corrige esta SPEC.
Repo: gruia-app/simplia-agent-chat (monorepo pnpm). Versión: 2.0.0-alpha.N hasta el cierre de F1. Los consumidores fijan por commit, como hoy.

## 1. Paquetes
| Paquete | Contenido |
|---|---|
| `packages/contract` | JSON Schema (draft 2020-12) de `ToolSpec`, `Proposal`, `ChangeRecord`, `AuditEvent` y `ViewEvent`. Fixtures válidas e inválidas en `fixtures/contract/`. Es la única fuente de verdad del contrato: los tipos TS y los modelos Python se generan o se validan contra estos esquemas. |
| `packages/core` | TS sin DOM: máquina de estados de la propuesta, modelo del diff, políticas de confirmación, modelo de los paneles (Memoria, Plan, BYO) y cliente HTTP del contrato de servidor (§5). |
| `packages/react` | Componentes accesibles sobre core: log de chat, tarjeta, diff, alertdialog, toast de deshacer, paneles. |
| `packages/element` | Web component `<gruia-agent-chat>` sobre core, para plantillas Django. Sin dependencia de React. |
| `servers/python` (`gruia_agent_tools`) y `servers/ts` (`@gruia/agent-tools-server`) | Registro de herramientas, almacén de propuestas, log de cambios, idempotencia y token de aplicación. Almacenamiento mediante interfaz, con implementación de referencia en SQL (Postgres y SQLite para tests). |

## 2. ToolSpec (normativo)
Campos obligatorios, sin campos extra (`additionalProperties: false`):
- `name`: `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$` (espacio de nombres por app, p. ej. `campanas.lanzar`).
- `description` (1-500 caracteres); `input_schema` (JSON Schema de objeto).
- `effect`: `read` | `reversible` | `irreversible`.
- `cost`: `{ "kind": "none"|"credits"|"money", "estimator": bool }`. Si `kind` no es `none`, `estimator` debe ser true.
- `confirm`: `none` | `card` | `strong`. Reglas del validador: `read` ⇒ `none`; `reversible` ⇒ `card` o `strong`; `irreversible` ⇒ `strong`.
- `undo`: `{ "mode": "revert"|"compensate"|"none", "window_s": int ≥ 0, "grace_s": int ≥ 0 }`. `irreversible` ⇒ `mode` `none` o `compensate`. `grace_s` es la cola retrasada previa a la ejecución (envíos de email: 30-120).
- `app_key`: clave canónica del registry del kernel.
Implementación por herramienta en el backend de la app: `estimate(input)`, `preview(input)` (diff estructurado y sin efectos), `apply(input, idempotency_key)` → `change_id`, `revert(change_id)` o `compensate(change_id)`.
Escalado por coste: si `estimate` supera el umbral de la organización, `card` pasa a `strong` en el servidor. La interfaz solo refleja lo que diga el servidor.

## 3. Proposal (normativo)
Campos: `id` (uuid), `tool`, `input`, `payload_hash` (sha256 del JSON canónico RFC 8785 de `{tool, input}`), `preview`, `estimate`, `confirm_effective`, `state`, `created_at`, `expires_at`, `supersedes` (id o null), `plan_id` y `step` (o null), `change_id` (o null), `org_id`, `user_id` y `thread_id`.
Estados y transiciones permitidas (cualquier otra devuelve 409):
- `proposed` → `modified` | `accepted` | `discarded` | `expired`.
- `modified`: crea una propuesta nueva con `supersedes`; la anterior pasa a `discarded`.
- `accepted` → `applied` | `expired` (el periodo de gracia se cancela con `discarded`).
- `applied` → `reverted`, solo dentro de `undo.window_s`.
Una propuesta de un plan se acepta paso a paso; cada paso lleva su propio `confirm_effective`.

## 4. Seguridad del apply (normativo)
- **Token de aplicación**: un solo uso, ligado a `(proposal_id, payload_hash, user_id, org_id, app_key)`, con un TTL de 120 s o menos. Solo lo emite el endpoint de UI `POST /proposals/{id}/accept`, autenticado con la sesión del usuario y con CSRF. Nunca entra en el contexto del modelo ni en herramientas que el modelo pueda invocar. El servidor guarda solo `sha256(token)`, lo compara en tiempo constante y lo consume de forma atómica (compare-and-set).
- **Resultado de `apply`**:
  - Si la propuesta ya está `applied` y llega el mismo token que se consumió, responde 200 con el mismo `change_id` (idempotencia).
  - En cualquier otro caso de token ausente, consumido, caducado, con hash distinto o ligado a otra org o app, responde 403.
  - Si `confirm_effective=strong` y falta `ack_irreversible=true`, responde 403.
- **Recalcular el coste**: `apply` vuelve a calcular `estimate`. Si ha subido por encima de lo aceptado (tolerancia configurable, 0 por defecto) o eso cambia `confirm_effective`, responde 409 y hay que volver a proponer. Nunca se ejecuta con un coste que el usuario no ha visto.
- **Tres capas, fail-closed y en orden** (entitlement → rol → política), validadas en el servidor en cada apply. Si el kernel no responde, se deniega. La caché de decisiones del entitlement dura como máximo 60 s. Cada denegación emite un AuditEvent `denied` con `denied_layer`. Hasta F2, el entitlement es un stub que por defecto deniega.
- **Idempotencia**: `idempotency_key = proposal_id`.
- **Gracia** (`grace_s > 0`): la ejecución diferida la dispara el servidor (cola o job), nunca el cliente. Si durante la gracia llega un `discarded`, se cancela sin efectos y queda auditado.
- **revert y compensate**: exigen sesión, CSRF y un token propio de un solo uso ligado a `change_id` (lo emite `POST /agent/changes/{change_id}/revert-token`). `compensate` sobre algo irreversible exige además `strong` y `ack_irreversible=true`.
- **Cero parseo de texto libre**: el paquete no ofrece ninguna utilidad que convierta texto del modelo en acción. Hay un test que lo garantiza (busca `[ACTION:` y equivalentes y falla si los encuentra).
- **Memoria**: escribir en memoria es una herramienta más (`memoria.recordar`, con `effect=reversible` y `confirm=card`).

## 5. Contrato HTTP entre el paquete y el backend de la app
`GET /agent/tools` (herramientas del contexto actual), `POST /agent/proposals` (desde el bucle del modelo; ejecuta `preview` y `estimate`), `POST /agent/proposals/{id}/modify`, `POST /agent/proposals/{id}/accept` (devuelve el token), `POST /agent/proposals/{id}/apply`, `POST /agent/proposals/{id}/discard`, `POST /agent/changes/{change_id}/revert-token`, `POST /agent/changes/{change_id}/revert` (o `/compensate`) y `GET /agent/proposals?thread_id=`. Los errores van en JSON `{code, message}`, con los códigos 400, 403, 404, 409, 410 (caducada) y 422.

## 6. AuditEvent (contrato con PLAT, F2)
`{ schema_version: 1, event_id, ts, org_id, app_key, user_id, tool, proposal_id, change_id|null, payload_hash, action: proposed|accepted|applied|reverted|compensated|discarded|expired|denied, confirm_effective, denied_layer: entitlement|role|policy|token|null, cost_estimate, cost_actual|null, cost_unit: credits|money_cents, result: ok|error, error_code|null }`. No incluye input, preview ni contenido.
- **Entrega**: at-least-once, con deduplicación por `event_id`. Los eventos `applied`, `reverted` y `compensated` se escriben en un outbox local dentro de la misma transacción que el efecto, para que ninguno se pierda aunque el sink esté caído.
- **Sink**: hasta F2 es configurable (log JSON). En F2 pasa a `POST /v1/audit/events` del gateway del kernel, en lotes de hasta 100, con respuesta 202 e idempotente por `event_id`, autenticado con el token de servicio de la app. En el kernel es una tabla append-only con RLS por `org_id`.

## 7. Aceptación por bloque
- **F1.1**: esquemas y fixtures. Las válidas pasan y las inválidas fallan con el error esperado; incluye un test de las reglas cruzadas de §2. Los tipos TS se generan desde el esquema y el test falla si hay deriva.
- **F1.2**: tests de la máquina de estados (todas las transiciones de §3, válidas y no válidas), escalado de confirm y tipos exhaustivos. Cobertura de core ≥ 90 %.
- **F1.3**: una demo que reproduce M-prototipo.html; qa.cjs adaptado 22/22 y axe sin violaciones; `role=log`, foco y `prefers-reduced-motion` según M §1.6.
- **F1.4**: la demo Django mínima (o HTML estático) con el web component pasa el mismo subconjunto de qa y axe.
- **F1.5 y F1.6**: la misma batería de tests de paridad sobre los mismos fixtures. Tests de token: reuso, hash distinto, otra org u otra app, caducado, strong sin ack, llamada desde el contexto del modelo, apply doble idempotente según §4 (mismo token sobre `applied` → 200 con el mismo change_id), dos apply concurrentes con el mismo token (uno 200 y otro 403), coste recalculado al alza → 409, kernel caído → denied, discarded durante la gracia → sin efectos, token de revert, revert fuera de ventana y outbox con el sink caído. El sink de auditoría emite exactamente los campos de §6.
- **Todas**: pr-head verde en el head exacto, sin merge por el ejecutor y con revisión cruzada de Luna. PLAT revisa F1.1 y F1.5.

## 8. Decisiones de PLAT para F2 (R687-02, 9-11)
- **Entitlement chat_tools**: una fila en el kernel por `(org_id, app_key)` con `{enabled, tools_allow: ["*"|"app.tool"...], max_effect: read|reversible|irreversible, byo_llm, cost_threshold: {credits: int|null, money_cents: int|null}}`. La librería lo consulta con `GET /v1/entitlements/{org_id}/{app_key}` y el token de servicio de la app (el modelo svc-<app> con allowlist de T2), no con el JWT de sesión.
- **Sink**: ver §6.
- **Umbral de coste**: vive en el kernel, dentro del entitlement. La app puede ser más estricta, nunca más laxa.
- **Validación en `apply`**: además de lo anterior, el servidor comprueba `tools_allow` y `max_effect`.
