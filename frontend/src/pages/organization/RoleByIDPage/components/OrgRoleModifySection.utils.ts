/* eslint-disable no-param-reassign */
import { z } from "zod";

import { OrgPermissionSubjects } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionAppConnectionActions,
  OrgPermissionGroupActions,
  OrgPermissionIdentityActions,
  OrgPermissionKmipActions,
  OrgPermissionSecretShareAction
} from "@app/context/OrgPermissionContext/types";
import { TPermission } from "@app/hooks/api/roles/types";

const generalPermissionSchema = z
  .object({
    read: z.boolean().optional(),
    edit: z.boolean().optional(),
    delete: z.boolean().optional(),
    create: z.boolean().optional()
  })
  .optional();

const appConnectionsPermissionSchema = z
  .object({
    [OrgPermissionAppConnectionActions.Read]: z.boolean().optional(),
    [OrgPermissionAppConnectionActions.Edit]: z.boolean().optional(),
    [OrgPermissionAppConnectionActions.Create]: z.boolean().optional(),
    [OrgPermissionAppConnectionActions.Delete]: z.boolean().optional(),
    [OrgPermissionAppConnectionActions.Connect]: z.boolean().optional()
  })
  .optional();

const kmipPermissionSchema = z
  .object({
    [OrgPermissionKmipActions.Proxy]: z.boolean().optional(),
    [OrgPermissionKmipActions.Setup]: z.boolean().optional()
  })
  .optional();

const identityPermissionSchema = z
  .object({
    [OrgPermissionIdentityActions.Read]: z.boolean().optional(),
    [OrgPermissionIdentityActions.Edit]: z.boolean().optional(),
    [OrgPermissionIdentityActions.Delete]: z.boolean().optional(),
    [OrgPermissionIdentityActions.Create]: z.boolean().optional(),
    [OrgPermissionIdentityActions.GrantPrivileges]: z.boolean().optional(),
    [OrgPermissionIdentityActions.RevokeAuth]: z.boolean().optional(),
    [OrgPermissionIdentityActions.CreateToken]: z.boolean().optional(),
    [OrgPermissionIdentityActions.GetToken]: z.boolean().optional(),
    [OrgPermissionIdentityActions.DeleteToken]: z.boolean().optional()
  })
  .optional();

const groupPermissionSchema = z
  .object({
    [OrgPermissionGroupActions.Read]: z.boolean().optional(),
    [OrgPermissionGroupActions.Create]: z.boolean().optional(),
    [OrgPermissionGroupActions.Edit]: z.boolean().optional(),
    [OrgPermissionGroupActions.Delete]: z.boolean().optional(),
    [OrgPermissionGroupActions.GrantPrivileges]: z.boolean().optional(),
    [OrgPermissionGroupActions.AddMembers]: z.boolean().optional(),
    [OrgPermissionGroupActions.RemoveMembers]: z.boolean().optional()
  })
  .optional();

const orgGatewayPermissionSchema = z
  .object({
    [OrgGatewayPermissionActions.ListGateways]: z.boolean().optional(),
    [OrgGatewayPermissionActions.EditGateways]: z.boolean().optional(),
    [OrgGatewayPermissionActions.DeleteGateways]: z.boolean().optional(),
    [OrgGatewayPermissionActions.CreateGateways]: z.boolean().optional()
  })
  .optional();

const adminConsolePermissionSchmea = z
  .object({
    "access-all-projects": z.boolean().optional()
  })
  .optional();

const secretSharingPermissionSchema = z
  .object({
    [OrgPermissionSecretShareAction.ManageSettings]: z.boolean().optional()
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
      workspace: z
        .object({
          create: z.boolean().optional()
        })
        .optional(),

      "audit-logs": generalPermissionSchema,
      member: generalPermissionSchema,
      groups: groupPermissionSchema,
      role: generalPermissionSchema,
      settings: generalPermissionSchema,
      "service-account": generalPermissionSchema,
      "incident-contact": generalPermissionSchema,
      "secret-scanning": generalPermissionSchema,
      sso: generalPermissionSchema,
      scim: generalPermissionSchema,
      [OrgPermissionSubjects.GithubOrgSync]: generalPermissionSchema,
      ldap: generalPermissionSchema,
      billing: generalPermissionSchema,
      identity: identityPermissionSchema,
      "organization-admin-console": adminConsolePermissionSchmea,
      [OrgPermissionSubjects.Kms]: generalPermissionSchema,
      [OrgPermissionSubjects.ProjectTemplates]: generalPermissionSchema,
      "app-connections": appConnectionsPermissionSchema,
      kmip: kmipPermissionSchema,
      gateway: orgGatewayPermissionSchema,
      "secret-share": secretSharingPermissionSchema
    })
    .optional()
});

export type TFormSchema = z.infer<typeof formSchema>;

// convert role permission to form compatiable  data structure
export const rolePermission2Form = (permissions: TPermission[] = []) => {
  // any because if it set it as form type due to the discriminated union type of ts
  // i would have to write a if loop with both conditions same
  const formVal: Record<string, any> = {};
  permissions.forEach((permission) => {
    const { subject, action } = permission;
    if (!formVal?.[subject]) formVal[subject] = {};
    formVal[subject][action] = true;
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
