/**
 * GENERADO — no editar a mano.
 * Fuente: schema/*.schema.json (JSON Schema draft 2020-12, SPEC-CHAT-F1-R687 rev 2).
 * Regenerar: pnpm --filter @simplia/agent-chat-contract run generate
 */
/** Fuente: schema/audit-event.schema.json */
export declare const AUDIT_EVENT_SCHEMA: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly $id: "https://gruia.dev/schemas/agent-chat/audit-event.schema.json";
    readonly title: "AuditEvent";
    readonly description: "SPEC-CHAT-F1-R687 rev 2 §6 (contrato con PLAT, F2). No incluye input, preview ni contenido.";
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["schema_version", "event_id", "ts", "org_id", "app_key", "user_id", "tool", "proposal_id", "change_id", "payload_hash", "action", "via", "client_id", "client_verified", "confirm_channel", "confirm_effective", "denied_layer", "cost_estimate", "cost_actual", "cost_unit", "result", "error_code"];
    readonly $defs: {
        readonly nonEmptyString: {
            readonly type: "string";
            readonly minLength: 1;
        };
    };
    readonly properties: {
        readonly schema_version: {
            readonly const: 1;
        };
        readonly event_id: {
            readonly $ref: "#/$defs/nonEmptyString";
            readonly description: "Id de deduplicación para entrega at-least-once (§6).";
        };
        readonly ts: {
            readonly type: "string";
            readonly format: "date-time";
        };
        readonly org_id: {
            readonly $ref: "#/$defs/nonEmptyString";
        };
        readonly app_key: {
            readonly type: "string";
            readonly pattern: "^[a-z][a-z0-9_]*$";
            readonly maxLength: 64;
        };
        readonly user_id: {
            readonly $ref: "#/$defs/nonEmptyString";
        };
        readonly tool: {
            readonly type: "string";
            readonly pattern: "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$";
        };
        readonly proposal_id: {
            readonly $ref: "#/$defs/nonEmptyString";
        };
        readonly change_id: {
            readonly anyOf: readonly [{
                readonly $ref: "#/$defs/nonEmptyString";
            }, {
                readonly type: "null";
            }];
        };
        readonly payload_hash: {
            readonly type: "string";
            readonly pattern: "^[0-9a-f]{64}$";
        };
        readonly action: {
            readonly enum: readonly ["proposed", "accepted", "applied", "reverted", "compensated", "discarded", "expired", "denied"];
        };
        readonly via: {
            readonly enum: readonly ["ui", "mcp", "cli"];
            readonly description: "SPEC rev 4 §9.6: canal por el que llegó la acción.";
        };
        readonly client_id: {
            readonly anyOf: readonly [{
                readonly $ref: "#/$defs/nonEmptyString";
            }, {
                readonly type: "null";
            }];
            readonly description: "Client_id OAuth del cliente MCP/CLI (null en vía ui).";
        };
        readonly client_verified: {
            readonly anyOf: readonly [{
                readonly type: "boolean";
            }, {
                readonly type: "null";
            }];
            readonly description: "Si el client_id está en la allowlist de clientes verificados.";
        };
        readonly confirm_channel: {
            readonly anyOf: readonly [{
                readonly enum: readonly ["ui", "review_url", "elicitation", "cli_tty"];
            }, {
                readonly type: "null";
            }];
            readonly description: "Canal por el que el usuario confirmó (null si no hubo confirmación).";
        };
        readonly confirm_effective: {
            readonly enum: readonly ["none", "card", "strong"];
        };
        readonly denied_layer: {
            readonly anyOf: readonly [{
                readonly enum: readonly ["entitlement", "role", "policy", "token"];
            }, {
                readonly type: "null";
            }];
        };
        readonly cost_estimate: {
            readonly type: "number";
        };
        readonly cost_actual: {
            readonly anyOf: readonly [{
                readonly type: "number";
            }, {
                readonly type: "null";
            }];
        };
        readonly cost_unit: {
            readonly enum: readonly ["credits", "money_cents"];
        };
        readonly result: {
            readonly enum: readonly ["ok", "error"];
        };
        readonly error_code: {
            readonly anyOf: readonly [{
                readonly $ref: "#/$defs/nonEmptyString";
            }, {
                readonly type: "null";
            }];
        };
    };
};
/** Fuente: schema/change-record.schema.json */
export declare const CHANGE_RECORD_SCHEMA: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly $id: "https://gruia.dev/schemas/agent-chat/change-record.schema.json";
    readonly title: "ChangeRecord";
    readonly description: "SPEC-CHAT-F1-R687 rev 3. Registro del cambio aplicado: apply → change_id (§3), revert/compensate sobre change_id dentro de undo.window_s (§3/§4), enlace con AuditEvent §6 (proposal_id, payload_hash, cost_actual, cost_unit).";
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["change_id", "proposal_id", "tool", "app_key", "org_id", "user_id", "payload_hash", "applied_at", "state", "undo_mode", "undo_window_s", "undone_at", "cost_actual", "cost_unit"];
    readonly $defs: {
        readonly uuid: {
            readonly type: "string";
            readonly pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
        };
        readonly nonEmptyString: {
            readonly type: "string";
            readonly minLength: 1;
        };
    };
    readonly properties: {
        readonly change_id: {
            readonly $ref: "#/$defs/nonEmptyString";
        };
        readonly proposal_id: {
            readonly $ref: "#/$defs/uuid";
        };
        readonly tool: {
            readonly type: "string";
            readonly pattern: "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$";
        };
        readonly app_key: {
            readonly type: "string";
            readonly pattern: "^[a-z][a-z0-9_]*$";
            readonly maxLength: 64;
        };
        readonly org_id: {
            readonly $ref: "#/$defs/nonEmptyString";
        };
        readonly user_id: {
            readonly $ref: "#/$defs/nonEmptyString";
        };
        readonly payload_hash: {
            readonly type: "string";
            readonly pattern: "^[0-9a-f]{64}$";
        };
        readonly applied_at: {
            readonly type: "string";
            readonly format: "date-time";
        };
        readonly state: {
            readonly enum: readonly ["applied", "reverted", "compensated"];
        };
        readonly undo_mode: {
            readonly enum: readonly ["revert", "compensate", "none"];
            readonly description: "Copia del ToolSpec.undo.mode vigente al aplicar.";
        };
        readonly undo_window_s: {
            readonly type: "integer";
            readonly minimum: 0;
            readonly description: "Copia del ToolSpec.undo.window_s; revert solo es válido dentro de esta ventana (§3).";
        };
        readonly undone_at: {
            readonly anyOf: readonly [{
                readonly type: "string";
                readonly format: "date-time";
            }, {
                readonly type: "null";
            }];
            readonly description: "Marca de tiempo del revert/compensate, o null si el cambio sigue aplicado.";
        };
        readonly cost_actual: {
            readonly anyOf: readonly [{
                readonly type: "number";
            }, {
                readonly type: "null";
            }];
            readonly description: "Coste real del apply, para el cost_actual de AuditEvent (§6).";
        };
        readonly cost_unit: {
            readonly anyOf: readonly [{
                readonly enum: readonly ["credits", "money_cents"];
            }, {
                readonly type: "null";
            }];
            readonly description: "Unidad del coste, coherente con AuditEvent §6. Null si no hubo coste.";
        };
    };
};
/** Fuente: schema/proposal-ref.schema.json */
export declare const PROPOSAL_REF_SCHEMA: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly $id: "https://gruia.dev/schemas/agent-chat/proposal-ref.schema.json";
    readonly title: "ProposalRef";
    readonly description: "SPEC-CHAT-F1-R687 rev 4/5 §9.2: structuredContent que devuelve una herramienta de escritura proyectada a MCP. review_url lleva SOLO el proposal_id, nunca un token.";
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["proposal_id", "tool", "diff", "estimate", "confirm_effective", "effect", "expires_at", "review_url"];
    readonly properties: {
        readonly proposal_id: {
            readonly type: "string";
            readonly pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
        };
        readonly tool: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly diff: {
            readonly description: "Diff estructurado (preview) sin efectos.";
        };
        readonly estimate: {
            readonly anyOf: readonly [{
                readonly type: "object";
            }, {
                readonly type: "number";
            }, {
                readonly type: "null";
            }];
        };
        readonly confirm_effective: {
            readonly enum: readonly ["none", "card", "strong"];
        };
        readonly effect: {
            readonly enum: readonly ["read", "reversible", "irreversible"];
        };
        readonly expires_at: {
            readonly type: "string";
            readonly format: "date-time";
        };
        readonly review_url: {
            readonly type: "string";
            readonly minLength: 1;
        };
    };
};
/** Fuente: schema/proposal.schema.json */
export declare const PROPOSAL_SCHEMA: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly $id: "https://gruia.dev/schemas/agent-chat/proposal.schema.json";
    readonly title: "Proposal";
    readonly description: "SPEC-CHAT-F1-R687 rev 2 §3 (normativo). Las transiciones de estado válidas se aplican en el servidor (§3); este esquema solo fija la forma del documento.";
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["id", "tool", "input", "payload_hash", "preview", "estimate", "confirm_effective", "state", "created_at", "expires_at", "supersedes", "plan_id", "step", "change_id", "org_id", "user_id", "thread_id"];
    readonly $defs: {
        readonly uuid: {
            readonly type: "string";
            readonly pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
        };
        readonly nonEmptyString: {
            readonly type: "string";
            readonly minLength: 1;
        };
    };
    readonly properties: {
        readonly id: {
            readonly $ref: "#/$defs/uuid";
        };
        readonly tool: {
            readonly type: "string";
            readonly pattern: "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$";
        };
        readonly input: {
            readonly description: "Entrada de la herramienta tal como se propuso (forma libre, validada contra el input_schema de la ToolSpec en el servidor).";
        };
        readonly payload_hash: {
            readonly type: "string";
            readonly description: "sha256 del JSON canónico RFC 8785 de {tool, input}.";
            readonly pattern: "^[0-9a-f]{64}$";
        };
        readonly preview: {
            readonly description: "Diff estructurado de campos, texto o filas devuelto por preview(input); forma libre.";
        };
        readonly estimate: {
            readonly description: "Estimación devuelta por estimate(input); forma libre.";
        };
        readonly confirm_effective: {
            readonly enum: readonly ["none", "card", "strong"];
            readonly description: "Confirmación efectiva decidida por el servidor (puede escalar card→strong por umbral de coste, §2).";
        };
        readonly state: {
            readonly enum: readonly ["proposed", "modified", "accepted", "discarded", "expired", "applied", "reverted"];
        };
        readonly created_at: {
            readonly type: "string";
            readonly format: "date-time";
        };
        readonly expires_at: {
            readonly type: "string";
            readonly format: "date-time";
        };
        readonly supersedes: {
            readonly anyOf: readonly [{
                readonly $ref: "#/$defs/uuid";
            }, {
                readonly type: "null";
            }];
        };
        readonly plan_id: {
            readonly anyOf: readonly [{
                readonly $ref: "#/$defs/uuid";
            }, {
                readonly type: "null";
            }];
        };
        readonly step: {
            readonly anyOf: readonly [{
                readonly type: "integer";
                readonly minimum: 0;
            }, {
                readonly type: "null";
            }];
        };
        readonly change_id: {
            readonly anyOf: readonly [{
                readonly $ref: "#/$defs/nonEmptyString";
            }, {
                readonly type: "null";
            }];
        };
        readonly org_id: {
            readonly $ref: "#/$defs/nonEmptyString";
        };
        readonly user_id: {
            readonly $ref: "#/$defs/nonEmptyString";
        };
        readonly thread_id: {
            readonly $ref: "#/$defs/nonEmptyString";
        };
    };
};
/** Fuente: schema/tool-spec.schema.json */
export declare const TOOL_SPEC_SCHEMA: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly $id: "https://gruia.dev/schemas/agent-chat/tool-spec.schema.json";
    readonly title: "ToolSpec";
    readonly description: "SPEC-CHAT-F1-R687 rev 2 §2 (normativo). Las reglas cruzadas effect↔confirm↔undo y cost↔estimator se validan en código (validateToolSpecRules), no en este esquema.";
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["name", "description", "input_schema", "effect", "cost", "confirm", "undo", "app_key"];
    readonly properties: {
        readonly name: {
            readonly type: "string";
            readonly pattern: "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$";
        };
        readonly description: {
            readonly type: "string";
            readonly minLength: 1;
            readonly maxLength: 500;
        };
        readonly input_schema: {
            readonly type: "object";
            readonly description: "JSON Schema de objeto que describe la entrada de la herramienta.";
        };
        readonly output_schema: {
            readonly type: "object";
            readonly description: "SPEC rev 4 §2: JSON Schema del resultado. Obligatorio si effect=read; en escritura es fijo: el esquema ProposalRef (regla cruzada).";
        };
        readonly effect: {
            readonly enum: readonly ["read", "reversible", "irreversible"];
        };
        readonly cost: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["kind", "estimator"];
            readonly properties: {
                readonly kind: {
                    readonly enum: readonly ["none", "credits", "money"];
                };
                readonly estimator: {
                    readonly type: "boolean";
                };
            };
        };
        readonly confirm: {
            readonly enum: readonly ["none", "card", "strong"];
        };
        readonly undo: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["mode", "window_s", "grace_s"];
            readonly properties: {
                readonly mode: {
                    readonly enum: readonly ["revert", "compensate", "none"];
                };
                readonly window_s: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
                readonly grace_s: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
            };
        };
        readonly app_key: {
            readonly type: "string";
            readonly description: "Clave canónica del registry del kernel.";
            readonly pattern: "^[a-z][a-z0-9_]*$";
            readonly maxLength: 64;
        };
    };
};
/** Fuente: schema/view-event.schema.json */
export declare const VIEW_EVENT_SCHEMA: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly $id: "https://gruia.dev/schemas/agent-chat/view-event.schema.json";
    readonly title: "ViewEvent";
    readonly description: "SPEC-CHAT-F1-R687 rev 3. Eventos breves del contexto de la vista clásica: la selección actual y los cambios manuales recientes (M-CHAT-CENTRIC §1.1/§1.5). Nunca volcados completos.";
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["event_id", "ts", "kind", "view", "target", "summary", "thread_id", "org_id", "user_id"];
    readonly $defs: {
        readonly nonEmptyString: {
            readonly type: "string";
            readonly minLength: 1;
        };
    };
    readonly properties: {
        readonly event_id: {
            readonly $ref: "#/$defs/nonEmptyString";
        };
        readonly ts: {
            readonly type: "string";
            readonly format: "date-time";
        };
        readonly kind: {
            readonly enum: readonly ["selection", "manual_edit"];
            readonly description: "selection = selección actual de la vista clásica; manual_edit = cambio manual reciente (M §1.1, §1.5).";
        };
        readonly view: {
            readonly $ref: "#/$defs/nonEmptyString";
            readonly description: "Identificador de la vista clásica que emite el evento.";
        };
        readonly target: {
            readonly anyOf: readonly [{
                readonly $ref: "#/$defs/nonEmptyString";
            }, {
                readonly type: "null";
            }];
            readonly description: "Elemento afectado dentro de la vista (p. ej. «paso 2»), o null.";
        };
        readonly summary: {
            readonly type: "string";
            readonly minLength: 1;
            readonly maxLength: 500;
            readonly description: "Descripción breve para el contexto del modelo («has cambiado el asunto del paso 2»). Nunca un volcado completo.";
        };
        readonly thread_id: {
            readonly $ref: "#/$defs/nonEmptyString";
        };
        readonly org_id: {
            readonly $ref: "#/$defs/nonEmptyString";
        };
        readonly user_id: {
            readonly $ref: "#/$defs/nonEmptyString";
        };
    };
};
export declare const SCHEMAS: {
    readonly "audit-event": {
        readonly $schema: "https://json-schema.org/draft/2020-12/schema";
        readonly $id: "https://gruia.dev/schemas/agent-chat/audit-event.schema.json";
        readonly title: "AuditEvent";
        readonly description: "SPEC-CHAT-F1-R687 rev 2 §6 (contrato con PLAT, F2). No incluye input, preview ni contenido.";
        readonly type: "object";
        readonly additionalProperties: false;
        readonly required: readonly ["schema_version", "event_id", "ts", "org_id", "app_key", "user_id", "tool", "proposal_id", "change_id", "payload_hash", "action", "via", "client_id", "client_verified", "confirm_channel", "confirm_effective", "denied_layer", "cost_estimate", "cost_actual", "cost_unit", "result", "error_code"];
        readonly $defs: {
            readonly nonEmptyString: {
                readonly type: "string";
                readonly minLength: 1;
            };
        };
        readonly properties: {
            readonly schema_version: {
                readonly const: 1;
            };
            readonly event_id: {
                readonly $ref: "#/$defs/nonEmptyString";
                readonly description: "Id de deduplicación para entrega at-least-once (§6).";
            };
            readonly ts: {
                readonly type: "string";
                readonly format: "date-time";
            };
            readonly org_id: {
                readonly $ref: "#/$defs/nonEmptyString";
            };
            readonly app_key: {
                readonly type: "string";
                readonly pattern: "^[a-z][a-z0-9_]*$";
                readonly maxLength: 64;
            };
            readonly user_id: {
                readonly $ref: "#/$defs/nonEmptyString";
            };
            readonly tool: {
                readonly type: "string";
                readonly pattern: "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$";
            };
            readonly proposal_id: {
                readonly $ref: "#/$defs/nonEmptyString";
            };
            readonly change_id: {
                readonly anyOf: readonly [{
                    readonly $ref: "#/$defs/nonEmptyString";
                }, {
                    readonly type: "null";
                }];
            };
            readonly payload_hash: {
                readonly type: "string";
                readonly pattern: "^[0-9a-f]{64}$";
            };
            readonly action: {
                readonly enum: readonly ["proposed", "accepted", "applied", "reverted", "compensated", "discarded", "expired", "denied"];
            };
            readonly via: {
                readonly enum: readonly ["ui", "mcp", "cli"];
                readonly description: "SPEC rev 4 §9.6: canal por el que llegó la acción.";
            };
            readonly client_id: {
                readonly anyOf: readonly [{
                    readonly $ref: "#/$defs/nonEmptyString";
                }, {
                    readonly type: "null";
                }];
                readonly description: "Client_id OAuth del cliente MCP/CLI (null en vía ui).";
            };
            readonly client_verified: {
                readonly anyOf: readonly [{
                    readonly type: "boolean";
                }, {
                    readonly type: "null";
                }];
                readonly description: "Si el client_id está en la allowlist de clientes verificados.";
            };
            readonly confirm_channel: {
                readonly anyOf: readonly [{
                    readonly enum: readonly ["ui", "review_url", "elicitation", "cli_tty"];
                }, {
                    readonly type: "null";
                }];
                readonly description: "Canal por el que el usuario confirmó (null si no hubo confirmación).";
            };
            readonly confirm_effective: {
                readonly enum: readonly ["none", "card", "strong"];
            };
            readonly denied_layer: {
                readonly anyOf: readonly [{
                    readonly enum: readonly ["entitlement", "role", "policy", "token"];
                }, {
                    readonly type: "null";
                }];
            };
            readonly cost_estimate: {
                readonly type: "number";
            };
            readonly cost_actual: {
                readonly anyOf: readonly [{
                    readonly type: "number";
                }, {
                    readonly type: "null";
                }];
            };
            readonly cost_unit: {
                readonly enum: readonly ["credits", "money_cents"];
            };
            readonly result: {
                readonly enum: readonly ["ok", "error"];
            };
            readonly error_code: {
                readonly anyOf: readonly [{
                    readonly $ref: "#/$defs/nonEmptyString";
                }, {
                    readonly type: "null";
                }];
            };
        };
    };
    readonly "change-record": {
        readonly $schema: "https://json-schema.org/draft/2020-12/schema";
        readonly $id: "https://gruia.dev/schemas/agent-chat/change-record.schema.json";
        readonly title: "ChangeRecord";
        readonly description: "SPEC-CHAT-F1-R687 rev 3. Registro del cambio aplicado: apply → change_id (§3), revert/compensate sobre change_id dentro de undo.window_s (§3/§4), enlace con AuditEvent §6 (proposal_id, payload_hash, cost_actual, cost_unit).";
        readonly type: "object";
        readonly additionalProperties: false;
        readonly required: readonly ["change_id", "proposal_id", "tool", "app_key", "org_id", "user_id", "payload_hash", "applied_at", "state", "undo_mode", "undo_window_s", "undone_at", "cost_actual", "cost_unit"];
        readonly $defs: {
            readonly uuid: {
                readonly type: "string";
                readonly pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
            };
            readonly nonEmptyString: {
                readonly type: "string";
                readonly minLength: 1;
            };
        };
        readonly properties: {
            readonly change_id: {
                readonly $ref: "#/$defs/nonEmptyString";
            };
            readonly proposal_id: {
                readonly $ref: "#/$defs/uuid";
            };
            readonly tool: {
                readonly type: "string";
                readonly pattern: "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$";
            };
            readonly app_key: {
                readonly type: "string";
                readonly pattern: "^[a-z][a-z0-9_]*$";
                readonly maxLength: 64;
            };
            readonly org_id: {
                readonly $ref: "#/$defs/nonEmptyString";
            };
            readonly user_id: {
                readonly $ref: "#/$defs/nonEmptyString";
            };
            readonly payload_hash: {
                readonly type: "string";
                readonly pattern: "^[0-9a-f]{64}$";
            };
            readonly applied_at: {
                readonly type: "string";
                readonly format: "date-time";
            };
            readonly state: {
                readonly enum: readonly ["applied", "reverted", "compensated"];
            };
            readonly undo_mode: {
                readonly enum: readonly ["revert", "compensate", "none"];
                readonly description: "Copia del ToolSpec.undo.mode vigente al aplicar.";
            };
            readonly undo_window_s: {
                readonly type: "integer";
                readonly minimum: 0;
                readonly description: "Copia del ToolSpec.undo.window_s; revert solo es válido dentro de esta ventana (§3).";
            };
            readonly undone_at: {
                readonly anyOf: readonly [{
                    readonly type: "string";
                    readonly format: "date-time";
                }, {
                    readonly type: "null";
                }];
                readonly description: "Marca de tiempo del revert/compensate, o null si el cambio sigue aplicado.";
            };
            readonly cost_actual: {
                readonly anyOf: readonly [{
                    readonly type: "number";
                }, {
                    readonly type: "null";
                }];
                readonly description: "Coste real del apply, para el cost_actual de AuditEvent (§6).";
            };
            readonly cost_unit: {
                readonly anyOf: readonly [{
                    readonly enum: readonly ["credits", "money_cents"];
                }, {
                    readonly type: "null";
                }];
                readonly description: "Unidad del coste, coherente con AuditEvent §6. Null si no hubo coste.";
            };
        };
    };
    readonly "proposal-ref": {
        readonly $schema: "https://json-schema.org/draft/2020-12/schema";
        readonly $id: "https://gruia.dev/schemas/agent-chat/proposal-ref.schema.json";
        readonly title: "ProposalRef";
        readonly description: "SPEC-CHAT-F1-R687 rev 4/5 §9.2: structuredContent que devuelve una herramienta de escritura proyectada a MCP. review_url lleva SOLO el proposal_id, nunca un token.";
        readonly type: "object";
        readonly additionalProperties: false;
        readonly required: readonly ["proposal_id", "tool", "diff", "estimate", "confirm_effective", "effect", "expires_at", "review_url"];
        readonly properties: {
            readonly proposal_id: {
                readonly type: "string";
                readonly pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
            };
            readonly tool: {
                readonly type: "string";
                readonly minLength: 1;
            };
            readonly diff: {
                readonly description: "Diff estructurado (preview) sin efectos.";
            };
            readonly estimate: {
                readonly anyOf: readonly [{
                    readonly type: "object";
                }, {
                    readonly type: "number";
                }, {
                    readonly type: "null";
                }];
            };
            readonly confirm_effective: {
                readonly enum: readonly ["none", "card", "strong"];
            };
            readonly effect: {
                readonly enum: readonly ["read", "reversible", "irreversible"];
            };
            readonly expires_at: {
                readonly type: "string";
                readonly format: "date-time";
            };
            readonly review_url: {
                readonly type: "string";
                readonly minLength: 1;
            };
        };
    };
    readonly proposal: {
        readonly $schema: "https://json-schema.org/draft/2020-12/schema";
        readonly $id: "https://gruia.dev/schemas/agent-chat/proposal.schema.json";
        readonly title: "Proposal";
        readonly description: "SPEC-CHAT-F1-R687 rev 2 §3 (normativo). Las transiciones de estado válidas se aplican en el servidor (§3); este esquema solo fija la forma del documento.";
        readonly type: "object";
        readonly additionalProperties: false;
        readonly required: readonly ["id", "tool", "input", "payload_hash", "preview", "estimate", "confirm_effective", "state", "created_at", "expires_at", "supersedes", "plan_id", "step", "change_id", "org_id", "user_id", "thread_id"];
        readonly $defs: {
            readonly uuid: {
                readonly type: "string";
                readonly pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
            };
            readonly nonEmptyString: {
                readonly type: "string";
                readonly minLength: 1;
            };
        };
        readonly properties: {
            readonly id: {
                readonly $ref: "#/$defs/uuid";
            };
            readonly tool: {
                readonly type: "string";
                readonly pattern: "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$";
            };
            readonly input: {
                readonly description: "Entrada de la herramienta tal como se propuso (forma libre, validada contra el input_schema de la ToolSpec en el servidor).";
            };
            readonly payload_hash: {
                readonly type: "string";
                readonly description: "sha256 del JSON canónico RFC 8785 de {tool, input}.";
                readonly pattern: "^[0-9a-f]{64}$";
            };
            readonly preview: {
                readonly description: "Diff estructurado de campos, texto o filas devuelto por preview(input); forma libre.";
            };
            readonly estimate: {
                readonly description: "Estimación devuelta por estimate(input); forma libre.";
            };
            readonly confirm_effective: {
                readonly enum: readonly ["none", "card", "strong"];
                readonly description: "Confirmación efectiva decidida por el servidor (puede escalar card→strong por umbral de coste, §2).";
            };
            readonly state: {
                readonly enum: readonly ["proposed", "modified", "accepted", "discarded", "expired", "applied", "reverted"];
            };
            readonly created_at: {
                readonly type: "string";
                readonly format: "date-time";
            };
            readonly expires_at: {
                readonly type: "string";
                readonly format: "date-time";
            };
            readonly supersedes: {
                readonly anyOf: readonly [{
                    readonly $ref: "#/$defs/uuid";
                }, {
                    readonly type: "null";
                }];
            };
            readonly plan_id: {
                readonly anyOf: readonly [{
                    readonly $ref: "#/$defs/uuid";
                }, {
                    readonly type: "null";
                }];
            };
            readonly step: {
                readonly anyOf: readonly [{
                    readonly type: "integer";
                    readonly minimum: 0;
                }, {
                    readonly type: "null";
                }];
            };
            readonly change_id: {
                readonly anyOf: readonly [{
                    readonly $ref: "#/$defs/nonEmptyString";
                }, {
                    readonly type: "null";
                }];
            };
            readonly org_id: {
                readonly $ref: "#/$defs/nonEmptyString";
            };
            readonly user_id: {
                readonly $ref: "#/$defs/nonEmptyString";
            };
            readonly thread_id: {
                readonly $ref: "#/$defs/nonEmptyString";
            };
        };
    };
    readonly "tool-spec": {
        readonly $schema: "https://json-schema.org/draft/2020-12/schema";
        readonly $id: "https://gruia.dev/schemas/agent-chat/tool-spec.schema.json";
        readonly title: "ToolSpec";
        readonly description: "SPEC-CHAT-F1-R687 rev 2 §2 (normativo). Las reglas cruzadas effect↔confirm↔undo y cost↔estimator se validan en código (validateToolSpecRules), no en este esquema.";
        readonly type: "object";
        readonly additionalProperties: false;
        readonly required: readonly ["name", "description", "input_schema", "effect", "cost", "confirm", "undo", "app_key"];
        readonly properties: {
            readonly name: {
                readonly type: "string";
                readonly pattern: "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$";
            };
            readonly description: {
                readonly type: "string";
                readonly minLength: 1;
                readonly maxLength: 500;
            };
            readonly input_schema: {
                readonly type: "object";
                readonly description: "JSON Schema de objeto que describe la entrada de la herramienta.";
            };
            readonly output_schema: {
                readonly type: "object";
                readonly description: "SPEC rev 4 §2: JSON Schema del resultado. Obligatorio si effect=read; en escritura es fijo: el esquema ProposalRef (regla cruzada).";
            };
            readonly effect: {
                readonly enum: readonly ["read", "reversible", "irreversible"];
            };
            readonly cost: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["kind", "estimator"];
                readonly properties: {
                    readonly kind: {
                        readonly enum: readonly ["none", "credits", "money"];
                    };
                    readonly estimator: {
                        readonly type: "boolean";
                    };
                };
            };
            readonly confirm: {
                readonly enum: readonly ["none", "card", "strong"];
            };
            readonly undo: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["mode", "window_s", "grace_s"];
                readonly properties: {
                    readonly mode: {
                        readonly enum: readonly ["revert", "compensate", "none"];
                    };
                    readonly window_s: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly grace_s: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                };
            };
            readonly app_key: {
                readonly type: "string";
                readonly description: "Clave canónica del registry del kernel.";
                readonly pattern: "^[a-z][a-z0-9_]*$";
                readonly maxLength: 64;
            };
        };
    };
    readonly "view-event": {
        readonly $schema: "https://json-schema.org/draft/2020-12/schema";
        readonly $id: "https://gruia.dev/schemas/agent-chat/view-event.schema.json";
        readonly title: "ViewEvent";
        readonly description: "SPEC-CHAT-F1-R687 rev 3. Eventos breves del contexto de la vista clásica: la selección actual y los cambios manuales recientes (M-CHAT-CENTRIC §1.1/§1.5). Nunca volcados completos.";
        readonly type: "object";
        readonly additionalProperties: false;
        readonly required: readonly ["event_id", "ts", "kind", "view", "target", "summary", "thread_id", "org_id", "user_id"];
        readonly $defs: {
            readonly nonEmptyString: {
                readonly type: "string";
                readonly minLength: 1;
            };
        };
        readonly properties: {
            readonly event_id: {
                readonly $ref: "#/$defs/nonEmptyString";
            };
            readonly ts: {
                readonly type: "string";
                readonly format: "date-time";
            };
            readonly kind: {
                readonly enum: readonly ["selection", "manual_edit"];
                readonly description: "selection = selección actual de la vista clásica; manual_edit = cambio manual reciente (M §1.1, §1.5).";
            };
            readonly view: {
                readonly $ref: "#/$defs/nonEmptyString";
                readonly description: "Identificador de la vista clásica que emite el evento.";
            };
            readonly target: {
                readonly anyOf: readonly [{
                    readonly $ref: "#/$defs/nonEmptyString";
                }, {
                    readonly type: "null";
                }];
                readonly description: "Elemento afectado dentro de la vista (p. ej. «paso 2»), o null.";
            };
            readonly summary: {
                readonly type: "string";
                readonly minLength: 1;
                readonly maxLength: 500;
                readonly description: "Descripción breve para el contexto del modelo («has cambiado el asunto del paso 2»). Nunca un volcado completo.";
            };
            readonly thread_id: {
                readonly $ref: "#/$defs/nonEmptyString";
            };
            readonly org_id: {
                readonly $ref: "#/$defs/nonEmptyString";
            };
            readonly user_id: {
                readonly $ref: "#/$defs/nonEmptyString";
            };
        };
    };
};
export type ContractEntityName = keyof typeof SCHEMAS;
//# sourceMappingURL=schemas.d.ts.map