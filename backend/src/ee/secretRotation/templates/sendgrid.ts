import { TProviderFunctionTypes, TAssignOp } from "../types";

export const SENDGRID_TEMPLATE = {
  inputs: {
    type: "object" as const,
    properties: {
      admin_api_key: { type: "string" as const },
      scopes: { type: "array", items: { type: "string" as const } }
    },
    required: ["admin_api_key", "scopes"],
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
      type: TProviderFunctionTypes.HTTP as const,
      url: "https://api.sendgrid.com/v3/api_keys",
      method: "POST",
      header: {
        Authorization: "Bearer ${inputs.admin_api_key}"
      },
      body: {
        name: "infisical-${random | 16}",
        scopes: { ref: "inputs.scopes" }
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
      type: TProviderFunctionTypes.HTTP as const,
      url: "https://api.sendgrid.com/v3/api_keys/${internal.api_key_id}",
      header: {
        Authorization: "Bearer ${inputs.admin_api_key}"
      },
      method: "DELETE"
    },
    test: {
      type: TProviderFunctionTypes.HTTP as const,
      url: "https://api.sendgrid.com/v3/api_keys/${internal.api_key_id}",
      header: {
        Authorization: "Bearer ${inputs.admin_api_key}"
      },
      method: "GET"
    }
  }
};
