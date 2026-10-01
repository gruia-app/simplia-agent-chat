/* eslint-disable */
/**
 * GENERADO — no editar a mano.
 * Fuente: schema/*.schema.json (JSON Schema draft 2020-12, SPEC-CHAT-F1-R687 rev 2).
 * Regenerar: pnpm --filter @simplia/agent-chat-contract run generate
 */

/** Fuente: schema/audit-event.schema.json */
export const AUDIT_EVENT_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://gruia.dev/schemas/agent-chat/audit-event.schema.json",
  "title": "AuditEvent",
  "description": "SPEC-CHAT-F1-R687 rev 2 §6 (contrato con PLAT, F2). No incluye input, preview ni contenido.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "event_id",
    "ts",
    "org_id",
    "app_key",
    "user_id",
    "tool",
    "proposal_id",
    "change_id",
    "payload_hash",
    "action",
    "via",
    "client_id",
    "client_verified",
    "confirm_channel",
    "confirm_effective",
    "denied_layer",
    "cost_estimate",
    "cost_actual",
    "cost_unit",
    "result",
    "error_code"
  ],
  "$defs": {
    "nonEmptyString": {
      "type": "string",
      "minLength": 1
    }
  },
  "properties": {
    "schema_version": {
      "const": 1
    },
    "event_id": {
      "$ref": "#/$defs/nonEmptyString",
      "description": "Id de deduplicación para entrega at-least-once (§6)."
    },
    "ts": {
      "type": "string",
      "format": "date-time"
    },
    "org_id": {
      "$ref": "#/$defs/nonEmptyString"
    },
    "app_key": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*$",
      "maxLength": 64
    },
    "user_id": {
      "$ref": "#/$defs/nonEmptyString"
    },
    "tool": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$"
    },
    "proposal_id": {
      "$ref": "#/$defs/nonEmptyString"
    },
    "change_id": {
      "anyOf": [
        {
          "$ref": "#/$defs/nonEmptyString"
        },
        {
          "type": "null"
        }
      ]
    },
    "payload_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "action": {
      "enum": [
        "proposed",
        "accepted",
        "applied",
        "reverted",
        "compensated",
        "discarded",
        "expired",
        "denied"
      ]
    },
    "via": {
      "enum": [
        "ui",
        "mcp",
        "cli"
      ],
      "description": "SPEC rev 4 §9.6: canal por el que llegó la acción."
    },
    "client_id": {
      "anyOf": [
        {
          "$ref": "#/$defs/nonEmptyString"
        },
        {
          "type": "null"
        }
      ],
      "description": "Client_id OAuth del cliente MCP/CLI (null en vía ui)."
    },
    "client_verified": {
      "anyOf": [
        {
          "type": "boolean"
        },
        {
          "type": "null"
        }
      ],
      "description": "Si el client_id está en la allowlist de clientes verificados."
    },
    "confirm_channel": {
      "anyOf": [
        {
          "enum": [
            "ui",
            "review_url",
            "elicitation",
            "cli_tty"
          ]
        },
        {
          "type": "null"
        }
      ],
      "description": "Canal por el que el usuario confirmó (null si no hubo confirmación)."
    },
    "confirm_effective": {
      "enum": [
        "none",
        "card",
        "strong"
      ]
    },
    "denied_layer": {
      "anyOf": [
        {
          "enum": [
            "entitlement",
            "role",
            "policy",
            "token"
          ]
        },
        {
          "type": "null"
        }
      ]
    },
    "cost_estimate": {
      "type": "number"
    },
    "cost_actual": {
      "anyOf": [
        {
          "type": "number"
        },
        {
          "type": "null"
        }
      ]
    },
    "cost_unit": {
      "enum": [
        "credits",
        "money_cents"
      ]
    },
    "result": {
      "enum": [
        "ok",
        "error"
      ]
    },
    "error_code": {
      "anyOf": [
        {
          "$ref": "#/$defs/nonEmptyString"
        },
        {
          "type": "null"
        }
      ]
    }
  }
} as const;

/** Fuente: schema/change-record.schema.json */
export const CHANGE_RECORD_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://gruia.dev/schemas/agent-chat/change-record.schema.json",
  "title": "ChangeRecord",
  "description": "SPEC-CHAT-F1-R687 rev 3. Registro del cambio aplicado: apply → change_id (§3), revert/compensate sobre change_id dentro de undo.window_s (§3/§4), enlace con AuditEvent §6 (proposal_id, payload_hash, cost_actual, cost_unit).",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "change_id",
    "proposal_id",
    "tool",
    "app_key",
    "org_id",
    "user_id",
    "payload_hash",
    "applied_at",
    "state",
    "undo_mode",
    "undo_window_s",
    "undone_at",
    "cost_actual",
    "cost_unit"
  ],
  "$defs": {
    "uuid": {
      "type": "string",
      "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
    },
    "nonEmptyString": {
      "type": "string",
      "minLength": 1
    }
  },
  "properties": {
    "change_id": {
      "$ref": "#/$defs/nonEmptyString"
    },
    "proposal_id": {
      "$ref": "#/$defs/uuid"
    },
    "tool": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$"
    },
    "app_key": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*$",
      "maxLength": 64
    },
    "org_id": {
      "$ref": "#/$defs/nonEmptyString"
    },
    "user_id": {
      "$ref": "#/$defs/nonEmptyString"
    },
    "payload_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "applied_at": {
      "type": "string",
      "format": "date-time"
    },
    "state": {
      "enum": [
        "applied",
        "reverted",
        "compensated"
      ]
    },
    "undo_mode": {
      "enum": [
        "revert",
        "compensate",
        "none"
      ],
      "description": "Copia del ToolSpec.undo.mode vigente al aplicar."
    },
    "undo_window_s": {
      "type": "integer",
      "minimum": 0,
      "description": "Copia del ToolSpec.undo.window_s; revert solo es válido dentro de esta ventana (§3)."
    },
    "undone_at": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "null"
        }
      ],
      "description": "Marca de tiempo del revert/compensate, o null si el cambio sigue aplicado."
    },
    "cost_actual": {
      "anyOf": [
        {
          "type": "number"
        },
        {
          "type": "null"
        }
      ],
      "description": "Coste real del apply, para el cost_actual de AuditEvent (§6)."
    },
    "cost_unit": {
      "anyOf": [
        {
          "enum": [
            "credits",
            "money_cents"
          ]
        },
        {
          "type": "null"
        }
      ],
      "description": "Unidad del coste, coherente con AuditEvent §6. Null si no hubo coste."
    }
  }
} as const;

/** Fuente: schema/proposal-ref.schema.json */
export const PROPOSAL_REF_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://gruia.dev/schemas/agent-chat/proposal-ref.schema.json",
  "title": "ProposalRef",
  "description": "SPEC-CHAT-F1-R687 rev 4/5 §9.2: structuredContent que devuelve una herramienta de escritura proyectada a MCP. review_url lleva SOLO el proposal_id, nunca un token.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "proposal_id",
    "tool",
    "diff",
    "estimate",
    "confirm_effective",
    "effect",
    "expires_at",
    "review_url"
  ],
  "properties": {
    "proposal_id": {
      "type": "string",
      "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
    },
    "tool": {
      "type": "string",
      "minLength": 1
    },
    "diff": {
      "description": "Diff estructurado (preview) sin efectos."
    },
    "estimate": {
      "anyOf": [
        {
          "type": "object"
        },
        {
          "type": "number"
        },
        {
          "type": "null"
        }
      ]
    },
    "confirm_effective": {
      "enum": [
        "none",
        "card",
        "strong"
      ]
    },
    "effect": {
      "enum": [
        "read",
        "reversible",
        "irreversible"
      ]
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
    },
    "review_url": {
      "type": "string",
      "minLength": 1
    }
  }
} as const;

/** Fuente: schema/proposal.schema.json */
export const PROPOSAL_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://gruia.dev/schemas/agent-chat/proposal.schema.json",
  "title": "Proposal",
  "description": "SPEC-CHAT-F1-R687 rev 2 §3 (normativo). Las transiciones de estado válidas se aplican en el servidor (§3); este esquema solo fija la forma del documento.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "tool",
    "input",
    "payload_hash",
    "preview",
    "estimate",
    "confirm_effective",
    "state",
    "created_at",
    "expires_at",
    "supersedes",
    "plan_id",
    "step",
    "change_id",
    "org_id",
    "user_id",
    "thread_id"
  ],
  "$defs": {
    "uuid": {
      "type": "string",
      "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
    },
    "nonEmptyString": {
      "type": "string",
      "minLength": 1
    }
  },
  "properties": {
    "id": {
      "$ref": "#/$defs/uuid"
    },
    "tool": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$"
    },
    "input": {
      "description": "Entrada de la herramienta tal como se propuso (forma libre, validada contra el input_schema de la ToolSpec en el servidor)."
    },
    "payload_hash": {
      "type": "string",
      "description": "sha256 del JSON canónico RFC 8785 de {tool, input}.",
      "pattern": "^[0-9a-f]{64}$"
    },
    "preview": {
      "description": "Diff estructurado de campos, texto o filas devuelto por preview(input); forma libre."
    },
    "estimate": {
      "description": "Estimación devuelta por estimate(input); forma libre."
    },
    "confirm_effective": {
      "enum": [
        "none",
        "card",
        "strong"
      ],
      "description": "Confirmación efectiva decidida por el servidor (puede escalar card→strong por umbral de coste, §2)."
    },
    "state": {
      "enum": [
        "proposed",
        "modified",
        "accepted",
        "discarded",
        "expired",
        "applied",
        "reverted"
      ]
    },
    "created_at": {
      "type": "string",
      "format": "date-time"
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
    },
    "supersedes": {
      "anyOf": [
        {
          "$ref": "#/$defs/uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "plan_id": {
      "anyOf": [
        {
          "$ref": "#/$defs/uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "step": {
      "anyOf": [
        {
          "type": "integer",
          "minimum": 0
        },
        {
          "type": "null"
        }
      ]
    },
    "change_id": {
      "anyOf": [
        {
          "$ref": "#/$defs/nonEmptyString"
        },
        {
          "type": "null"
        }
      ]
    },
    "org_id": {
      "$ref": "#/$defs/nonEmptyString"
    },
    "user_id": {
      "$ref": "#/$defs/nonEmptyString"
    },
    "thread_id": {
      "$ref": "#/$defs/nonEmptyString"
    }
  }
} as const;

/** Fuente: schema/tool-spec.schema.json */
export const TOOL_SPEC_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://gruia.dev/schemas/agent-chat/tool-spec.schema.json",
  "title": "ToolSpec",
  "description": "SPEC-CHAT-F1-R687 rev 2 §2 (normativo). Las reglas cruzadas effect↔confirm↔undo y cost↔estimator se validan en código (validateToolSpecRules), no en este esquema.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "name",
    "description",
    "input_schema",
    "effect",
    "cost",
    "confirm",
    "undo",
    "app_key"
  ],
  "properties": {
    "name": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$"
    },
    "description": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500
    },
    "input_schema": {
      "type": "object",
      "description": "JSON Schema de objeto que describe la entrada de la herramienta."
    },
    "output_schema": {
      "type": "object",
      "description": "SPEC rev 4 §2: JSON Schema del resultado. Obligatorio si effect=read; en escritura es fijo: el esquema ProposalRef (regla cruzada)."
    },
    "effect": {
      "enum": [
        "read",
        "reversible",
        "irreversible"
      ]
    },
    "cost": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "estimator"
      ],
      "properties": {
        "kind": {
          "enum": [
            "none",
            "credits",
            "money"
          ]
        },
        "estimator": {
          "type": "boolean"
        }
      }
    },
    "confirm": {
      "enum": [
        "none",
        "card",
        "strong"
      ]
    },
    "undo": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "mode",
        "window_s",
        "grace_s"
      ],
      "properties": {
        "mode": {
          "enum": [
            "revert",
            "compensate",
            "none"
          ]
        },
        "window_s": {
          "type": "integer",
          "minimum": 0
        },
        "grace_s": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "app_key": {
      "type": "string",
      "description": "Clave canónica del registry del kernel.",
      "pattern": "^[a-z][a-z0-9_]*$",
      "maxLength": 64
    }
  }
} as const;

/** Fuente: schema/view-event.schema.json */
export const VIEW_EVENT_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://gruia.dev/schemas/agent-chat/view-event.schema.json",
  "title": "ViewEvent",
  "description": "SPEC-CHAT-F1-R687 rev 3. Eventos breves del contexto de la vista clásica: la selección actual y los cambios manuales recientes (M-CHAT-CENTRIC §1.1/§1.5). Nunca volcados completos.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "event_id",
    "ts",
    "kind",
    "view",
    "target",
    "summary",
    "thread_id",
    "org_id",
    "user_id"
  ],
  "$defs": {
    "nonEmptyString": {
      "type": "string",
      "minLength": 1
    }
  },
  "properties": {
    "event_id": {
      "$ref": "#/$defs/nonEmptyString"
    },
    "ts": {
      "type": "string",
      "format": "date-time"
    },
    "kind": {
      "enum": [
        "selection",
        "manual_edit"
      ],
      "description": "selection = selección actual de la vista clásica; manual_edit = cambio manual reciente (M §1.1, §1.5)."
    },
    "view": {
      "$ref": "#/$defs/nonEmptyString",
      "description": "Identificador de la vista clásica que emite el evento."
    },
    "target": {
      "anyOf": [
        {
          "$ref": "#/$defs/nonEmptyString"
        },
        {
          "type": "null"
        }
      ],
      "description": "Elemento afectado dentro de la vista (p. ej. «paso 2»), o null."
    },
    "summary": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500,
      "description": "Descripción breve para el contexto del modelo («has cambiado el asunto del paso 2»). Nunca un volcado completo."
    },
    "thread_id": {
      "$ref": "#/$defs/nonEmptyString"
    },
    "org_id": {
      "$ref": "#/$defs/nonEmptyString"
    },
    "user_id": {
      "$ref": "#/$defs/nonEmptyString"
    }
  }
} as const;

export const SCHEMAS = {
  "audit-event": AUDIT_EVENT_SCHEMA,
  "change-record": CHANGE_RECORD_SCHEMA,
  "proposal-ref": PROPOSAL_REF_SCHEMA,
  "proposal": PROPOSAL_SCHEMA,
  "tool-spec": TOOL_SPEC_SCHEMA,
  "view-event": VIEW_EVENT_SCHEMA,
} as const;

export type ContractEntityName = keyof typeof SCHEMAS;
