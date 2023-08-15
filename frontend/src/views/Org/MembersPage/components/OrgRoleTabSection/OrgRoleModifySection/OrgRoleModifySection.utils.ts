/* eslint-disable no-param-reassign */
import { z } from "zod";

import { TPermission } from "@app/hooks/api/roles/types";

const PERMISSION_ACTIONS = ["read", "create", "edit", "delete"] as const;

const generalPermissionSchema = z.object({
  read: z.boolean().optional(),
  edit: z.boolean().optional(),
  delete: z.boolean().optional(),
  create: z.boolean().optional()
});

export const formSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  slug: z.string(),
  permissions: z.object({
    workspace: z.record(generalPermissionSchema),
    member: generalPermissionSchema,
    role: generalPermissionSchema,
    settings: generalPermissionSchema,
    "service-account": generalPermissionSchema,
    "incident-contact": generalPermissionSchema,
    sso: generalPermissionSchema,
    billing: generalPermissionSchema
  })
});

export type TFormSchema = z.infer<typeof formSchema>;

const api2FormWorkspace = (
  formVal: TFormSchema["permissions"]["workspace"],
  permission: TPermission
) => {
  if (permission.subject !== "workspace") return;
  const isCustomRule = Boolean(permission?.condition?.id);
  // full access
  if (isCustomRule && !formVal?.custom) {
    formVal.custom = { read: true, edit: true, delete: true, create: true };
  }

  const workspaceId = permission?.condition?.id || "all";
  // initalize
  if (!formVal?.[workspaceId]) {
    formVal[workspaceId] = { read: false, edit: false, create: false, delete: false };
  }
  formVal[workspaceId][permission.action] = true;
};

// convert role permission to form compatiable  data structure
export const rolePermission2Form = (permissions: TPermission[] = []) => {
  const formVal: TFormSchema["permissions"] = {
    workspace: {},
    billing: {},
    settings: {},
    role: {},
    sso: {},
    member: {},
    "service-account": {},
    "incident-contact": {}
  };

  permissions.forEach((permission) => {
    switch (permission.subject) {
      case "workspace":
        api2FormWorkspace(formVal?.workspace, permission);
        break;
      default:
        // everything else follows same pattern
        // formVal[settings][read | write] = true
        formVal[permission.subject as keyof TFormSchema["permissions"]][permission.action] = true;
        break;
    }
  });

  return formVal;
};

const form2ApiWorkspace = (
  permissions: TPermission[],
  workspace: TFormSchema["permissions"]["workspace"]
) => {
  const isFullAccess = PERMISSION_ACTIONS.every((action) => workspace?.all?.[action]);
  // if any of them is set in all push it without any  condition
  PERMISSION_ACTIONS.forEach((action) => {
    if (workspace?.all?.[action]) permissions.push({ action, subject: "workspace" });
  });

  if (!isFullAccess) {
    Object.keys(workspace)
      .filter((id) => id !== "all" && id !== "custom") // remove all and custom for iter
      .forEach((workspaceId) => {
        const actions = Object.keys(workspace[workspaceId]) as ["read", "edit", "create", "delete"];
        actions.forEach((action) => {
          // if not full access for an action
          if (!workspace?.all?.[action] && workspace[workspaceId][action]) {
            permissions.push({ action, subject: "workspace", condition: { id: workspaceId } });
          }
        });
      });
  }
};

export const formRolePermission2API = (formVal: TFormSchema["permissions"]) => {
  const permissions: TPermission[] = [];
  if (formVal?.workspace) {
    // easy deep copy
    form2ApiWorkspace(permissions, JSON.parse(JSON.stringify(formVal.workspace)));
  }
  // other than workspace everything else follows same
  // if in future there is a different follow the above on how workspace is done
  const { workspace, ...rules } = formVal;
  (Object.keys(rules) as Array<keyof typeof rules>).forEach((rule) => {
    // all these type annotations are due to Object.keys of ts cannot infer and put it just a string[]
    // quite annoying i know
    const actions = Object.keys(rules[rule]) as Array<
      keyof z.infer<typeof generalPermissionSchema>
    >;
    actions.forEach((action) => {
      if (rules[rule][action]) {
        permissions.push({ action, subject: rule });
      }
    });
  });
  return permissions;
};
