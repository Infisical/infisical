/* eslint-disable no-param-reassign */
import { z } from "zod";

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
const MULTI_ENV_KEY = ["secrets", "folders", "secret-imports"] as const;

export const formSchema = z.object({
  name: z.string().trim(),
  description: z.string().trim().optional(),
  slug: z.string().trim(),
  permissions: z.object({
    secrets: z.record(multiEnvPermissionSchema).optional(),
    folders: z.record(multiEnvPermissionSchema).optional(),
    "secret-imports": z.record(multiEnvPermissionSchema).optional(),
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
});

export type TFormSchema = z.infer<typeof formSchema>;

const multiEnvApi2Form = (
  formVal: TFormSchema["permissions"]["secrets"],
  permission: TProjectPermission
) => {
  const isCustomRule = Boolean(permission?.conditions?.environment);
  // full access
  if (isCustomRule && formVal && !formVal?.custom) {
    formVal.custom = { read: true, edit: true, delete: true, create: true };
  }

  const secretEnv = permission?.conditions?.environment || "all";
  const secretPath = permission?.conditions?.secretPath;
  // initialize
  if (formVal && !formVal?.[secretEnv]) {
    formVal[secretEnv] = { read: false, edit: false, create: false, delete: false, secretPath };
  }
  formVal![secretEnv]![permission.action] = true;
};

// convert role permission to form compatiable  data structure
export const rolePermission2Form = (permissions: TProjectPermission[] = []) => {
  const formVal: Partial<TFormSchema["permissions"]> = {};

  permissions.forEach((permission) => {
    const { subject, action } = permission;
    if (!formVal?.[subject]) formVal[subject] = {};

    if (["secrets", "folders", "secret-imports"].includes(subject)) {
      multiEnvApi2Form(formVal[subject] as TFormSchema["permissions"]["secrets"], permission);
    } else {
      // everything else follows same pattern
      // formVal[settings][read | write] = true
      formVal[
        subject as keyof Omit<
          TFormSchema["permissions"],
          "secrets" | "workspace" | "secret-rollback"
        >
      ]![action] = true;
    }
  });

  return formVal;
};

const multiEnvForm2Api = (
  permissions: TProjectPermission[],
  formVal: TFormSchema["permissions"]["secrets"],
  subject: (typeof MULTI_ENV_KEY)[number]
) => {
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
            if (formVal[slug]?.secretPath) conditions.secretPath = formVal?.[slug]?.secretPath;

            permissions.push({ action, subject, conditions });
          }
        });
      });
  }
};

export const formRolePermission2API = (formVal: TFormSchema["permissions"]) => {
  const permissions: TProjectPermission[] = [];
  MULTI_ENV_KEY.forEach((formName) => {
    multiEnvForm2Api(permissions, JSON.parse(JSON.stringify(formVal[formName] || {})), formName);
  });
  // other than workspace everything else follows same
  // if in future there is a different follow the above on how workspace is done
  (Object.keys(formVal) as Array<keyof typeof formVal>)
    .filter((key) => !["secret-imports", "folders", "secrets"].includes(key))
    .forEach((rule) => {
      // all these type annotations are due to Object.keys of ts cannot infer and put it just a string[]
      // quite annoying i know
      const actions = Object.keys(formVal[rule] || {}) as Array<
        keyof z.infer<typeof generalPermissionSchema>
      >;
      actions.forEach((action) => {
        // akhilmhdh: set it as any due to the union type bug i would end up writing an if else with same condition on both side
        if (formVal[rule]?.[action as keyof typeof formVal.workspace]) {
          permissions.push({ subject: rule, action } as any);
        }
      });
    });
  return permissions;
};
