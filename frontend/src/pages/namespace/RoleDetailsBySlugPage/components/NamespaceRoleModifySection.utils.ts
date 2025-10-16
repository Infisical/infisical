/* eslint-disable no-param-reassign */
import { z } from "zod";

import {
  NamespacePermissionAppConnectionActions,
  NamespacePermissionAuditLogsActions,
  NamespacePermissionGroupActions,
  NamespacePermissionIdentityActions,
  NamespacePermissionMachineIdentityAuthTemplateActions,
  NamespacePermissionMemberActions,
  NamespacePermissionNamespaceActions,
  NamespacePermissionSubjects
} from "@app/context/NamespacePermissionContext/types";
import { TNamespacePermission } from "@app/hooks/api/namespaceRoles";
import { TPermission } from "@app/hooks/api/roles/types";

const generalPermissionSchema = z
  .object({
    read: z.boolean().optional(),
    edit: z.boolean().optional(),
    delete: z.boolean().optional(),
    create: z.boolean().optional()
  })
  .optional();

const auditLogsPermissionSchema = z
  .object({
    [NamespacePermissionAuditLogsActions.Read]: z.boolean().optional()
  })
  .optional();

const memberPermissionSchema = z
  .object({
    [NamespacePermissionMemberActions.Read]: z.boolean().optional(),
    [NamespacePermissionMemberActions.Edit]: z.boolean().optional(),
    [NamespacePermissionMemberActions.Create]: z.boolean().optional(),
    [NamespacePermissionMemberActions.Delete]: z.boolean().optional(),
    [NamespacePermissionMemberActions.GrantPrivileges]: z.boolean().optional()
  })
  .optional();

const groupPolicyActionSchema = z
  .object({
    [NamespacePermissionGroupActions.Read]: z.boolean().optional(),
    [NamespacePermissionGroupActions.Create]: z.boolean().optional(),
    [NamespacePermissionGroupActions.Edit]: z.boolean().optional(),
    [NamespacePermissionGroupActions.Delete]: z.boolean().optional(),
    [NamespacePermissionGroupActions.GrantPrivileges]: z.boolean().optional(),
    [NamespacePermissionGroupActions.AddMembers]: z.boolean().optional(),
    [NamespacePermissionGroupActions.RemoveMembers]: z.boolean().optional()
  })
  .optional();

const appConnectionsPermissionSchema = z
  .object({
    [NamespacePermissionAppConnectionActions.Read]: z.boolean().optional(),
    [NamespacePermissionAppConnectionActions.Edit]: z.boolean().optional(),
    [NamespacePermissionAppConnectionActions.Create]: z.boolean().optional(),
    [NamespacePermissionAppConnectionActions.Delete]: z.boolean().optional(),
    [NamespacePermissionAppConnectionActions.Connect]: z.boolean().optional()
  })
  .optional();

const namespacePermissionSchema = z
  .object({
    [NamespacePermissionNamespaceActions.Edit]: z.boolean().optional(),
    [NamespacePermissionNamespaceActions.Delete]: z.boolean().optional()
  })
  .optional();

const identityPermissionSchema = z
  .object({
    [NamespacePermissionIdentityActions.Read]: z.boolean().optional(),
    [NamespacePermissionIdentityActions.Edit]: z.boolean().optional(),
    [NamespacePermissionIdentityActions.Delete]: z.boolean().optional(),
    [NamespacePermissionIdentityActions.Create]: z.boolean().optional(),
    [NamespacePermissionIdentityActions.GrantPrivileges]: z.boolean().optional(),
    [NamespacePermissionIdentityActions.RevokeAuth]: z.boolean().optional(),
    [NamespacePermissionIdentityActions.CreateToken]: z.boolean().optional(),
    [NamespacePermissionIdentityActions.GetToken]: z.boolean().optional(),
    [NamespacePermissionIdentityActions.DeleteToken]: z.boolean().optional()
  })
  .optional();

const machineIdentityAuthTemplatePermissionSchema = z
  .object({
    [NamespacePermissionMachineIdentityAuthTemplateActions.ListTemplates]: z.boolean().optional(),
    [NamespacePermissionMachineIdentityAuthTemplateActions.EditTemplates]: z.boolean().optional(),
    [NamespacePermissionMachineIdentityAuthTemplateActions.DeleteTemplates]: z.boolean().optional(),
    [NamespacePermissionMachineIdentityAuthTemplateActions.CreateTemplates]: z.boolean().optional(),
    [NamespacePermissionMachineIdentityAuthTemplateActions.UnlinkTemplates]: z.boolean().optional(),
    [NamespacePermissionMachineIdentityAuthTemplateActions.AttachTemplates]: z.boolean().optional()
  })
  .optional();

export const formSchema = z.object({
  name: z.string().trim(),
  description: z.string().trim().optional(),
  slug: z
    .string()
    .trim()
    .refine((val) => val !== "custom", { message: "Cannot use custom as its a keyword" }),
  permissions: z
    .object({
      project: z
        .object({
          create: z.boolean().optional()
        })
        .optional(),
      "audit-logs": auditLogsPermissionSchema,
      member: memberPermissionSchema,
      groups: groupPolicyActionSchema,
      role: generalPermissionSchema,
      settings: generalPermissionSchema,
      "secret-scanning": generalPermissionSchema,
      identity: identityPermissionSchema,
      "app-connections": appConnectionsPermissionSchema,
      [NamespacePermissionSubjects.ProjectTemplates]: generalPermissionSchema,
      "machine-identity-auth-template": machineIdentityAuthTemplatePermissionSchema,
      namespace: namespacePermissionSchema
    })
    .optional()
});

export type TFormSchema = z.infer<typeof formSchema>;

// convert role permission to form compatiable  data structure
export const rolePermission2Form = (permissions: TNamespacePermission[] = []) => {
  // any because if it set it as form type due to the discriminated union type of ts
  // i would have to write a if loop with both conditions same
  const formVal: Record<string, any> = {};
  permissions.forEach((permission) => {
    const { action, subject } = permission;

    if (!formVal?.[subject]) formVal[subject] = {};
    if (Array.isArray(action)) {
      action.forEach((el) => {
        formVal[subject][el] = true;
      });
    } else {
      formVal[subject][action] = true;
    }
  });

  return formVal;
};

export const formRolePermission2API = (formVal: TFormSchema["permissions"]) => {
  const permissions: TPermission[] = [];
  Object.entries(formVal || {}).forEach(([rule, actions]) => {
    Object.entries(actions).forEach(([action, isAllowed]) => {
      if (isAllowed) {
        permissions.push({ subject: rule, action });
      }
    });
  });

  return permissions;
};
