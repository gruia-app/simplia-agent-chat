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

<!-- ACV2:JENKINS-LANES:START -->
## Jenkins: prioridad y gasto

- Al crear un pull request, publicalo siempre como ready for review; no lo abras como draft.
- Por defecto usa la via ordinaria: PRs y ramas esperan 120 segundos; la rama por defecto espera 600 segundos para agrupar merges y deploys antes de asignar un worker.
- Usa la via rapida solo cuando el usuario pida rapidez explicitamente o exista un bucle activo de correccion y verificacion. El trigger debe ser autenticado y auditado, con `lane=urgent`, `actor`, `reason` y `delay=0sec` a traves de `/api/v1/jenkins-debug/retrigger`.
- La via rapida solo elimina la espera: no omite tests, seguridad, freshness, deploy lock ni el retiro de ejecuciones obsoletas.
- Las flotas `ordinary`, `urgent` y `xlarge` mantienen scale-to-zero. No solicites para ellas nodos calientes, warm leases ni prewarming; la via rapida conserva el cold start si no hay capacidad.
- Unicamente `simplia-priority-execution`, declarado por Roberto y vigente en el ledger server-side, puede usar el pool Jenkins aislado `priority-verification`: 1 CCX33 caliente y hasta 2 bursts de 2 horas, con retirada tras 15 minutos ociosos. Solo verification/deploy, nunca agentes. Requiere excepcion de politica + library/pin desplegados y readback, SHA exacto, alerta EUR 8 y proyeccion all-in rolling-24h <= EUR 10; por encima exige nueva aprobacion durable de Roberto. Si falta cualquier prueba, warm=0 y fail closed. No modifica las otras flotas.
- No marques automaticamente el trabajo de Codex como urgente ni uses el tamano pequeno del PR, titulo, labels o autor como senal suficiente.
<!-- ACV2:JENKINS-LANES:END -->

<!-- ACV2:TOKEN-EFFICIENCY:START -->
## Eficiencia de tokens y delegacion

- El agente principal de la sesion es coordinador: define objetivo, prioriza, decide y verifica. No investiga ni implementa por si mismo lo que pueda delegar.
- Delega con la skill `llm-delegate` (`scripts/delegate_workflow.py`): Luna (`gpt-5.6-luna`) para investigacion, busqueda, resumenes, clasificacion y revision rutinaria; Terra (`gpt-5.6-terra`) para fixes acotados con tests en worktree aislado; Sol (`gpt-5.6-sol`) solo para arquitectura, ambiguedad o adjudicacion; GLM Flash via Pi para lo mecanico. Lanza Codex con la cuenta que tenga cuota (`CODEX_HOME`).
- El coordinador retiene secretos, hosts remotos, cambios en produccion, decisiones irreversibles y la verificacion final de artefactos, diffs, tests y efectos externos. Un workflow completado no autoriza commit, push, merge, deploy ni envios.
- No leas docs, runbooks, skills, diffs completos, logs ni artefactos enteros al contexto principal: pide a una hoja Luna un resumen acotado o el veredicto con evidencia. Lecturas directas solo por rango o grep con `head`/`cut`.
- Contexto delegado acotado; no pases el historial completo por defecto. Cada hoja recibe solo su prompt cerrado, las entradas necesarias y el contrato de salida.
- Prohibido sondear con turnos LLM o esperas cortas. Arranca una vez, guarda el `run_id` y espera en background o con un unico wait durable (>=60s).
- Presupuesto por turno del coordinador: 8 llamadas a herramientas (12 con justificacion), 80K tokens de contexto, 1 compactacion y <=20K tokens de resultados de herramientas. Al agotarlo, resume o delega antes de seguir.
- Declara presupuestos explicitos por workflow (nodos, concurrencia, tiempo, coste) y para al agotarlos; `max_turns_reached` y `cost_limit_reached` son agotamiento, no exito.
- Trabajo simple y acotado: usa el modelo capaz mas barato y el razonamiento minimo suficiente. Evidencia concisa; no pegues logs, trazas ni salidas completas.
- Contabiliza solo deltas propios de generacion/turno; no atribuyas totales acumulados del padre. Cache y reasoning se registran aparte del output generado.
<!-- ACV2:TOKEN-EFFICIENCY:END -->
