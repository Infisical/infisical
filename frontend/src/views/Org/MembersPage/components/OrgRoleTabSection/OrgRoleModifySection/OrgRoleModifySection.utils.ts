/* eslint-disable no-param-reassign */
import * as yup from "yup";

import { TPermission } from "@app/hooks/api/roles/types";

const PERMISSION_ACTIONS = ["read", "create", "edit", "delete"] as const;

export const formSchema = yup.object({
  name: yup.string().required().label("Name"),
  description: yup.string(),
  slug: yup.string().required().label("Slug"),
  permissions: yup.object({
    workspace: yup.lazy((val) =>
      yup.object(
        Object.fromEntries(
          Object.entries(val || {}).map(([k]) => [
            k,
            yup.object({
              read: yup.bool(),
              edit: yup.bool(),
              delete: yup.bool(),
              create: yup.bool()
            })
          ])
        )
      )
    )
  })
});

export type TFormSchema = yup.InferType<typeof formSchema>;

const api2FormWorkspace = (
  formVal: TFormSchema["permissions"]["workspace"],
  permission: TPermission
) => {
  if (permission.subject !== "workspace") return;
  const isCustomRule = Boolean(permission?.condition?.id);
  if (isCustomRule && !formVal?.custom) {
    formVal.custom = { read: true, edit: true, delete: true, create: true };
  }

  const workspaceId = permission?.condition?.id || "all";
  if (!formVal?.[workspaceId])
    formVal[workspaceId] = { read: false, edit: false, create: false, delete: false };
  formVal[workspaceId][permission.action] = true;
};

// convert role permission to form compatiable  data structure
export const rolePermission2Form = (permissions: TPermission[] = []) => {
  const formVal: TFormSchema["permissions"] = {
    workspace: {}
  };

  permissions.forEach((permission) => {
    api2FormWorkspace(formVal?.workspace, permission);
  });

  return formVal;
};

const form2ApiWorkspace = (
  permissions: TPermission[],
  workspace: TFormSchema["permissions"]["workspace"]
) => {
  const isFullAccess = PERMISSION_ACTIONS.every((action) => workspace?.all?.[action]);

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
  // easy deep copy
  if (formVal?.workspace)
    form2ApiWorkspace(permissions, JSON.parse(JSON.stringify(formVal.workspace)));
  return permissions;
};
