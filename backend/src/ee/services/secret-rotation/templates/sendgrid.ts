/* eslint-disable no-template-curly-in-string  */
import { TAssignOp, TProviderFunctionTypes } from "./types";

export const SENDGRID_TEMPLATE = {
  type: TProviderFunctionTypes.HTTP as const,
  inputs: {
    type: "object" as const,
    properties: {
      admin_api_key: { type: "string" as const, desc: "Sendgrid admin api key to create new keys" },
      api_key_scopes: {
        type: "array",
        items: { type: "string" as const },
        desc: "Scopes for created tokens by rotation(Array)"
      }
    },
    required: ["admin_api_key", "api_key_scopes"],
    additionalProperties: false
  },
  outputs: {
    api_key: { type: "string" }
  },
  internal: {
    api_key_id: { type: "string" }
  },
  functions: {
    set: {
      url: "https://api.sendgrid.com/v3/api_keys",
      method: "POST",
      header: {
        Authorization: "Bearer ${inputs.admin_api_key}"
      },
      body: {
        name: "infisical-${random | 16}",
        scopes: { ref: "inputs.api_key_scopes" }
      },
      setter: {
        "outputs.api_key": {
          assign: TAssignOp.JmesPath as const,
          path: "api_key"
        },
        "internal.api_key_id": {
          assign: TAssignOp.JmesPath as const,
          path: "api_key_id"
        }
      }
    },
    remove: {
      url: "https://api.sendgrid.com/v3/api_keys/${internal.api_key_id}",
      header: {
        Authorization: "Bearer ${inputs.admin_api_key}"
      },
      method: "DELETE"
    },
    test: {
      url: "https://api.sendgrid.com/v3/api_keys/${internal.api_key_id}",
      header: {
        Authorization: "Bearer ${inputs.admin_api_key}"
      },
      method: "GET"
    }
  }
};
