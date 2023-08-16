/* eslint-disable no-param-reassign */
import { z } from "zod";

import { TPermission } from "@app/hooks/api/roles/types";

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
    workspace: z.object({
      read: z.boolean().optional(),
      create: z.boolean().optional()
    }),
    member: generalPermissionSchema,
    role: generalPermissionSchema,
    settings: generalPermissionSchema,
    "service-account": generalPermissionSchema,
    "incident-contact": generalPermissionSchema,
    "secret-scanning": generalPermissionSchema,
    sso: generalPermissionSchema,
    billing: generalPermissionSchema
  })
});

export type TFormSchema = z.infer<typeof formSchema>;

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
    "incident-contact": {},
    "secret-scanning": {}
  };

  permissions.forEach((permission) => {
    // akhilmhdh: this is typecast as workspace key else i would need an if loop with same condition on both side
    formVal[permission.subject][permission.action as keyof typeof formVal.workspace] = true;
  });

  return formVal;
};

export const formRolePermission2API = (formVal: TFormSchema["permissions"]) => {
  const permissions: TPermission[] = [];
  (Object.keys(formVal) as Array<keyof typeof formVal>).forEach((rule) => {
    // all these type annotations are due to Object.keys of ts cannot infer and put it just a string[]
    // quite annoying i know
    const actions = Object.keys(formVal[rule]) as Array<
      keyof z.infer<typeof generalPermissionSchema>
    >;

    actions.forEach((action) => {
      // akhilmhdh: set it as any due to the union type bug i would end up writing an if else with same condition on both side
      if (formVal[rule][action as keyof typeof formVal.workspace]) {
        permissions.push({ subject: rule, action } as any);
      }
    });
  });
  return permissions;
};
