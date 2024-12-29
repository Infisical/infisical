/* eslint-disable no-param-reassign */
import { z } from "zod";

import { OrgPermissionSubjects } from "@app/context";
import { TPermission } from "@app/hooks/api/roles/types";

const generalPermissionSchema = z
  .object({
    read: z.boolean().optional(),
    edit: z.boolean().optional(),
    delete: z.boolean().optional(),
    create: z.boolean().optional()
  })
  .optional();

const adminConsolePermissionSchmea = z
  .object({
    "access-all-projects": z.boolean().optional()
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
      groups: generalPermissionSchema,
      role: generalPermissionSchema,
      settings: generalPermissionSchema,
      "service-account": generalPermissionSchema,
      "incident-contact": generalPermissionSchema,
      "secret-scanning": generalPermissionSchema,
      sso: generalPermissionSchema,
      scim: generalPermissionSchema,
      ldap: generalPermissionSchema,
      billing: generalPermissionSchema,
      identity: generalPermissionSchema,
      "organization-admin-console": adminConsolePermissionSchmea,
      [OrgPermissionSubjects.Kms]: generalPermissionSchema,
      [OrgPermissionSubjects.ProjectTemplates]: generalPermissionSchema
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
