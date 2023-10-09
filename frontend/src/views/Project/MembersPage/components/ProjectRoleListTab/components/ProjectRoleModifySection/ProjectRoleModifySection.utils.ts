/* eslint-disable no-param-reassign */
import { z } from "zod";

import { ProjectPermissionSub } from "@app/context";
import { TProjectPermission } from "@app/hooks/api/roles/types";

const generalPermissionSchema = z
  .object({
    read: z.boolean().optional(),
    edit: z.boolean().optional(),
    delete: z.boolean().optional(),
    create: z.boolean().optional()
  })
  .optional();

const multiEnvPermissionSchema = z
  .object({
    secretPath: z.string().trim().optional(),
    read: z.boolean().optional(),
    edit: z.boolean().optional(),
    delete: z.boolean().optional(),
    create: z.boolean().optional()
  })
  .optional();

const PERMISSION_ACTIONS = ["read", "create", "edit", "delete"] as const;

export const formSchema = z.object({
  name: z.string().trim(),
  description: z.string().trim().optional(),
  slug: z.string().trim(),
  permissions: z
    .object({
      secrets: z.record(multiEnvPermissionSchema).optional(),
      member: generalPermissionSchema,
      role: generalPermissionSchema,
      integrations: generalPermissionSchema,
      webhooks: generalPermissionSchema,
      "service-tokens": generalPermissionSchema,
      settings: generalPermissionSchema,
      environments: generalPermissionSchema,
      tags: generalPermissionSchema,
      "audit-logs": generalPermissionSchema,
      "ip-allowlist": generalPermissionSchema,
      // akhilmhdh: refactor all keys like below
      [ProjectPermissionSub.SecretApproval]: generalPermissionSchema,
      workspace: z
        .object({
          edit: z.boolean().optional(),
          delete: z.boolean().optional()
        })
        .optional(),
      "secret-rollback": z
        .object({
          read: z.boolean().optional(),
          create: z.boolean().optional()
        })
        .optional()
    })
    .optional()
});

export type TFormSchema = z.infer<typeof formSchema>;

const multiEnvApi2Form = (
  formVal: Record<string, { secretPath?: string } & { [key: string]: boolean }>,
  permission: TProjectPermission
) => {
  const isCustomRule = Boolean(permission?.conditions?.environment);
  // full access
  if (isCustomRule && formVal && !formVal?.custom) {
    formVal.custom = { read: true, edit: true, delete: true, create: true };
  }

  const secretEnv = permission?.conditions?.environment || "all";
  const secretPath = permission?.conditions?.secretPath?.$glob;
  // initialize
  if (formVal && !formVal?.[secretEnv]) {
    formVal[secretEnv] = { read: false, edit: false, create: false, delete: false, secretPath };
  }

  formVal[secretEnv][permission.action] = true;
};

// convert role permission to form compatiable  data structure
export const rolePermission2Form = (permissions: TProjectPermission[] = []) => {
  // any because if it set it as form type due to the discriminated union type of ts
  // i would have to write a if loop with both conditions same
  const formVal: Record<string, any> = {};

  permissions.forEach((permission) => {
    const { subject, action } = permission;
    if (!formVal?.[subject]) formVal[subject] = {};

    if (subject === "secrets") {
      multiEnvApi2Form(formVal[subject], permission);
    } else {
      // everything else follows same pattern
      // formVal[settings][read | write] = true
      formVal[subject][action] = true;
    }
  });

  return formVal;
};

const multiEnvForm2Api = (
  permissions: TProjectPermission[],
  formVal: Record<string, { secretPath?: string } & { [key: string]: boolean }>,
  subject: "secrets"
) => {
  if (!formVal) return;

  const isFullAccess = PERMISSION_ACTIONS.every((action) => formVal?.all?.[action]);
  // if any of them is set in all push it without any  condition
  PERMISSION_ACTIONS.forEach((action) => {
    if (formVal?.all?.[action]) permissions.push({ action, subject });
  });

  if (!isFullAccess) {
    Object.keys(formVal || {})
      .filter((id) => id !== "all" && id !== "custom") // remove all and custom for iter
      .forEach((slug) => {
        const actions = Object.keys(formVal?.[slug] || {}) as [
          "read",
          "edit",
          "create",
          "delete",
          "secretPath"
        ];
        actions.forEach((action) => {
          // if not full access for an action
          if (!formVal?.all?.[action] && action !== "secretPath" && formVal?.[slug]?.[action]) {
            const conditions: Record<string, unknown> = { environment: slug };
            if (formVal[slug]?.secretPath)
              conditions.secretPath = { $glob: formVal?.[slug]?.secretPath };

            permissions.push({ action, subject, conditions });
          }
        });
      });
  }
};

export const formRolePermission2API = (formVal: TFormSchema["permissions"]) => {
  const permissions: TProjectPermission[] = [];
  // other than workspace everything else follows same
  // if in future there is a different follow the above on how workspace is done
  Object.entries(formVal || {}).forEach(([rule, actions]) => {
    if (rule === "secrets") {
      multiEnvForm2Api(permissions, JSON.parse(JSON.stringify(actions || {})), rule);
    } else {
      Object.entries(actions).forEach(([action, isAllowed]) => {
        if (isAllowed) {
          permissions.push({ subject: rule, action });
        }
      });
    }
  });
  return permissions;
};
