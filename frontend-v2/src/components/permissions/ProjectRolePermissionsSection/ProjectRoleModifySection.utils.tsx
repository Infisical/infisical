import { z } from "zod";

import {
  ProjectPermissionActions,
  ProjectPermissionCmekActions,
  ProjectPermissionSub
} from "@app/context";
import {
  PermissionConditionOperators,
  ProjectPermissionDynamicSecretActions,
  TPermissionCondition,
  TPermissionConditionOperators
} from "@app/context/ProjectPermissionContext/types";
import { TProjectPermission } from "@app/hooks/api/roles/types";

const GeneralPolicyActionSchema = z.object({
  read: z.boolean().optional(),
  edit: z.boolean().optional(),
  delete: z.boolean().optional(),
  create: z.boolean().optional()
});

const CmekPolicyActionSchema = z.object({
  read: z.boolean().optional(),
  edit: z.boolean().optional(),
  delete: z.boolean().optional(),
  create: z.boolean().optional(),
  encrypt: z.boolean().optional(),
  decrypt: z.boolean().optional()
});

const DynamicSecretPolicyActionSchema = z.object({
  [ProjectPermissionDynamicSecretActions.ReadRootCredential]: z.boolean().optional(),
  [ProjectPermissionDynamicSecretActions.EditRootCredential]: z.boolean().optional(),
  [ProjectPermissionDynamicSecretActions.DeleteRootCredential]: z.boolean().optional(),
  [ProjectPermissionDynamicSecretActions.CreateRootCredential]: z.boolean().optional(),
  [ProjectPermissionDynamicSecretActions.Lease]: z.boolean().optional()
});

const SecretRollbackPolicyActionSchema = z.object({
  read: z.boolean().optional(),
  create: z.boolean().optional()
});

const WorkspacePolicyActionSchema = z.object({
  edit: z.boolean().optional(),
  delete: z.boolean().optional()
});

const ConditionSchema = z
  .object({
    operator: z.string(),
    lhs: z.string(),
    rhs: z.string().min(1)
  })
  .array()
  .optional()
  .default([])
  .refine(
    (el) => {
      const lhsOperatorSet = new Set<string>();
      for (let i = 0; i < el.length; i += 1) {
        const { lhs, operator } = el[i];
        if (lhsOperatorSet.has(`${lhs}-${operator}`)) {
          return false;
        }
        lhsOperatorSet.add(`${lhs}-${operator}`);
      }
      return true;
    },
    { message: "Duplicate operator found for a condition" }
  );

export const projectRoleFormSchema = z.object({
  name: z.string().trim(),
  description: z.string().trim().optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine((val) => val !== "custom", { message: "Cannot use custom as its a keyword" }),
  permissions: z
    .object({
      [ProjectPermissionSub.Secrets]: GeneralPolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.SecretFolders]: GeneralPolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.SecretImports]: GeneralPolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.DynamicSecrets]: DynamicSecretPolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.Identity]: GeneralPolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.Member]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Groups]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Role]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Integrations]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Webhooks]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.ServiceTokens]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Settings]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Environments]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.AuditLogs]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.IpAllowList]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.CertificateAuthorities]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Certificates]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.PkiAlerts]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.PkiCollections]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.CertificateTemplates]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.SecretApproval]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.SecretRollback]: SecretRollbackPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Project]: WorkspacePolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Tags]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.SecretRotation]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Kms]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Cmek]: CmekPolicyActionSchema.array().default([])
    })
    .partial()
    .optional()
});

export type TFormSchema = z.infer<typeof projectRoleFormSchema>;

type TConditionalFields =
  | ProjectPermissionSub.Secrets
  | ProjectPermissionSub.SecretFolders
  | ProjectPermissionSub.SecretImports
  | ProjectPermissionSub.DynamicSecrets
  | ProjectPermissionSub.Identity;

export const isConditionalSubjects = (
  subject: ProjectPermissionSub
): subject is TConditionalFields =>
  subject === (ProjectPermissionSub.Secrets as const) ||
  subject === ProjectPermissionSub.DynamicSecrets ||
  subject === ProjectPermissionSub.SecretImports ||
  subject === ProjectPermissionSub.SecretFolders ||
  subject === ProjectPermissionSub.Identity;

const convertCaslConditionToFormOperator = (caslConditions: TPermissionCondition) => {
  const formConditions: z.infer<typeof ConditionSchema> = [];
  Object.entries(caslConditions).forEach(([type, condition]) => {
    if (typeof condition === "string") {
      formConditions.push({
        operator: PermissionConditionOperators.$EQ,
        lhs: type,
        rhs: condition
      });
    } else {
      Object.keys(condition).forEach((conditionOperator) => {
        const rhs = condition[conditionOperator as PermissionConditionOperators];
        formConditions.push({
          operator: conditionOperator,
          lhs: type,
          rhs: typeof rhs === "string" ? rhs : rhs.join(",")
        });
      });
    }
  });
  return formConditions;
};

// convert role permission to form compatible data structure
export const rolePermission2Form = (permissions: TProjectPermission[] = []) => {
  const formVal: Partial<TFormSchema["permissions"]> = {};

  permissions.forEach((permission) => {
    const { subject: caslSub, action, conditions, inverted } = permission;
    const subject = (typeof caslSub === "string" ? caslSub : caslSub[0]) as ProjectPermissionSub;
    if (!action.length) return;

    if (
      [
        ProjectPermissionSub.Secrets,
        ProjectPermissionSub.DynamicSecrets,
        ProjectPermissionSub.SecretFolders,
        ProjectPermissionSub.SecretImports,
        ProjectPermissionSub.Member,
        ProjectPermissionSub.Groups,
        ProjectPermissionSub.Identity,
        ProjectPermissionSub.Role,
        ProjectPermissionSub.Integrations,
        ProjectPermissionSub.Webhooks,
        ProjectPermissionSub.ServiceTokens,
        ProjectPermissionSub.Settings,
        ProjectPermissionSub.Environments,
        ProjectPermissionSub.AuditLogs,
        ProjectPermissionSub.IpAllowList,
        ProjectPermissionSub.CertificateAuthorities,
        ProjectPermissionSub.Certificates,
        ProjectPermissionSub.PkiAlerts,
        ProjectPermissionSub.PkiCollections,
        ProjectPermissionSub.CertificateTemplates,
        ProjectPermissionSub.SecretApproval,
        ProjectPermissionSub.Tags,
        ProjectPermissionSub.SecretRotation,
        ProjectPermissionSub.Kms
      ].includes(subject)
    ) {
      // from above statement we are sure it won't be undefined
      if (isConditionalSubjects(subject)) {
        if (!formVal[subject]) formVal[subject] = [];

        if (subject === ProjectPermissionSub.DynamicSecrets) {
          const canRead = action.includes(ProjectPermissionDynamicSecretActions.ReadRootCredential);
          const canEdit = action.includes(ProjectPermissionDynamicSecretActions.EditRootCredential);
          const canDelete = action.includes(
            ProjectPermissionDynamicSecretActions.DeleteRootCredential
          );
          const canCreate = action.includes(
            ProjectPermissionDynamicSecretActions.CreateRootCredential
          );
          const canLease = action.includes(ProjectPermissionDynamicSecretActions.Lease);

          // from above statement we are sure it won't be undefined
          formVal[subject]!.push({
            [ProjectPermissionDynamicSecretActions.ReadRootCredential]: canRead,
            [ProjectPermissionDynamicSecretActions.CreateRootCredential]: canCreate,
            [ProjectPermissionDynamicSecretActions.EditRootCredential]: canEdit,
            [ProjectPermissionDynamicSecretActions.DeleteRootCredential]: canDelete,
            conditions: conditions ? convertCaslConditionToFormOperator(conditions) : [],
            inverted,
            [ProjectPermissionDynamicSecretActions.Lease]: canLease
          });
          return;
        }
        // for other subjects
        const canRead = action.includes(ProjectPermissionActions.Read);
        const canEdit = action.includes(ProjectPermissionActions.Edit);
        const canDelete = action.includes(ProjectPermissionActions.Delete);
        const canCreate = action.includes(ProjectPermissionActions.Create);

        // remove this condition later
        // keeping when old routes create permission with folder read
        if (
          subject === ProjectPermissionSub.SecretFolders &&
          canRead &&
          !canEdit &&
          !canDelete &&
          !canCreate
        ) {
          return;
        }

        formVal[subject]!.push({
          read: canRead,
          create: canCreate,
          edit: canEdit,
          delete: canDelete,
          conditions: conditions ? convertCaslConditionToFormOperator(conditions) : [],
          inverted
        });
        return;
      }

      // deduplicate multiple rules for other policies
      // because they don't have condition it doesn't make sense for multiple rules
      const canRead = action.includes(ProjectPermissionActions.Read);
      const canEdit = action.includes(ProjectPermissionActions.Edit);
      const canDelete = action.includes(ProjectPermissionActions.Delete);
      const canCreate = action.includes(ProjectPermissionActions.Create);

      if (!formVal[subject]) formVal[subject] = [{}];
      if (canRead) formVal[subject as ProjectPermissionSub.Member]![0].read = true;
      if (canEdit) formVal[subject as ProjectPermissionSub.Member]![0].edit = true;
      if (canCreate) formVal[subject as ProjectPermissionSub.Member]![0].create = true;
      if (canDelete) formVal[subject as ProjectPermissionSub.Member]![0].delete = true;
      return;
    }

    if (subject === ProjectPermissionSub.Project) {
      const canEdit = action.includes(ProjectPermissionActions.Edit);
      const canDelete = action.includes(ProjectPermissionActions.Delete);
      if (!formVal[subject]) formVal[subject] = [{}];

      // from above statement we are sure it won't be undefined
      if (canEdit) formVal[subject as ProjectPermissionSub.Project]![0].edit = true;
      if (canDelete) formVal[subject as ProjectPermissionSub.Member]![0].delete = true;
      return;
    }

    if (subject === ProjectPermissionSub.SecretRollback) {
      const canRead = action.includes(ProjectPermissionActions.Read);
      const canCreate = action.includes(ProjectPermissionActions.Create);
      if (!formVal[subject]) formVal[subject] = [{}];

      // from above statement we are sure it won't be undefined
      if (canRead) formVal[subject as ProjectPermissionSub.Member]![0].read = true;
      if (canCreate) formVal[subject as ProjectPermissionSub.Member]![0].create = true;
      return;
    }

    if (subject === ProjectPermissionSub.Cmek) {
      const canRead = action.includes(ProjectPermissionCmekActions.Read);
      const canEdit = action.includes(ProjectPermissionCmekActions.Edit);
      const canDelete = action.includes(ProjectPermissionCmekActions.Delete);
      const canCreate = action.includes(ProjectPermissionCmekActions.Create);
      const canEncrypt = action.includes(ProjectPermissionCmekActions.Encrypt);
      const canDecrypt = action.includes(ProjectPermissionCmekActions.Decrypt);

      if (!formVal[subject]) formVal[subject] = [{}];

      // from above statement we are sure it won't be undefined
      if (canRead) formVal[subject]![0].read = true;
      if (canEdit) formVal[subject]![0].edit = true;
      if (canCreate) formVal[subject]![0].create = true;
      if (canDelete) formVal[subject]![0].delete = true;
      if (canEncrypt) formVal[subject]![0].encrypt = true;
      if (canDecrypt) formVal[subject]![0].decrypt = true;
    }
  });
  return formVal;
};

const convertFormOperatorToCaslCondition = (
  conditions: { lhs: string; rhs: string; operator: string }[]
) => {
  const caslCondition: Record<string, Partial<TPermissionConditionOperators>> = {};
  conditions.forEach((el) => {
    if (!caslCondition[el.lhs]) caslCondition[el.lhs] = {};
    if (
      el.operator === PermissionConditionOperators.$IN ||
      el.operator === PermissionConditionOperators.$ALL
    ) {
      caslCondition[el.lhs][el.operator] = el.rhs.split(",");
    } else {
      caslCondition[el.lhs][
        el.operator as Exclude<
          PermissionConditionOperators,
          PermissionConditionOperators.$ALL | PermissionConditionOperators.$IN
        >
      ] = el.rhs;
    }
  });
  return caslCondition;
};

export const formRolePermission2API = (formVal: TFormSchema["permissions"]) => {
  const permissions: TProjectPermission[] = [];
  // other than workspace everything else follows same
  // if in future there is a different follow the above on how workspace is done
  Object.entries(formVal || {}).forEach(([subject, rules]) => {
    rules.forEach((actions) => {
      const caslActions = Object.keys(actions).filter(
        (el) => actions?.[el as keyof typeof actions] && el !== "conditions" && el !== "inverted"
      );
      const caslConditions =
        "conditions" in actions
          ? convertFormOperatorToCaslCondition(actions.conditions)
          : undefined;

      permissions.push({
        action: caslActions,
        subject,
        inverted: (actions as { inverted?: boolean })?.inverted,
        conditions: caslConditions
      });
    });
  });
  return permissions;
};

export type TProjectPermissionObject = {
  [K in ProjectPermissionSub]: {
    title: string;
    actions: {
      label: string;
      value: keyof Omit<
        NonNullable<NonNullable<TFormSchema["permissions"]>[K]>[number],
        "conditions" | "inverted"
      >;
    }[];
  };
};

export const PROJECT_PERMISSION_OBJECT: TProjectPermissionObject = {
  [ProjectPermissionSub.Secrets]: {
    title: "Secrets",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.SecretFolders]: {
    title: "Secret Folders",
    actions: [
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.SecretImports]: {
    title: "Secret Imports",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.DynamicSecrets]: {
    title: "Dynamic Secrets",
    actions: [
      {
        label: "Read root credentials",
        value: ProjectPermissionDynamicSecretActions.ReadRootCredential
      },
      {
        label: "Create root credentials",
        value: ProjectPermissionDynamicSecretActions.CreateRootCredential
      },
      {
        label: "Modify root credentials",
        value: ProjectPermissionDynamicSecretActions.EditRootCredential
      },
      {
        label: "Remove root credentials",
        value: ProjectPermissionDynamicSecretActions.DeleteRootCredential
      },
      { label: "Manage Leases", value: ProjectPermissionDynamicSecretActions.Lease }
    ]
  },
  [ProjectPermissionSub.Cmek]: {
    title: "KMS",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" },
      { label: "Encrypt", value: "encrypt" },
      { label: "Decrypt", value: "decrypt" }
    ]
  },
  [ProjectPermissionSub.Kms]: {
    title: "Project KMS Configuration",
    actions: [{ label: "Modify", value: "edit" }]
  },
  [ProjectPermissionSub.Integrations]: {
    title: "Integrations",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.Project]: {
    title: "Project",
    actions: [
      { label: "Update project details", value: "edit" },
      { label: "Delete project", value: "delete" }
    ]
  },
  [ProjectPermissionSub.Role]: {
    title: "Roles",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.Member]: {
    title: "User Management",
    actions: [
      { label: "View all members", value: "read" },
      { label: "Invite members", value: "create" },
      { label: "Edit members", value: "edit" },
      { label: "Remove members", value: "delete" }
    ]
  },
  [ProjectPermissionSub.Identity]: {
    title: "Machine Identity Management",
    actions: [
      { label: "Read", value: "read" },
      { label: "Add", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.Groups]: {
    title: "Group Management",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.Webhooks]: {
    title: "Webhooks",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.ServiceTokens]: {
    title: "Service Tokens",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.Settings]: {
    title: "Settings",
    actions: [
      { label: "Read", value: "read" },
      { label: "Modify", value: "edit" }
    ]
  },
  [ProjectPermissionSub.Environments]: {
    title: "Environment Management",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.Tags]: {
    title: "Tags",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.AuditLogs]: {
    title: "Audit Logs",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.IpAllowList]: {
    title: "IP Allowlist",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.CertificateAuthorities]: {
    title: "Certificate Authorities",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.Certificates]: {
    title: "Certificates",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.CertificateTemplates]: {
    title: "Certificate Templates",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.PkiCollections]: {
    title: "PKI Collections",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.PkiAlerts]: {
    title: "PKI Alerts",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.SecretApproval]: {
    title: "Secret Protect policy",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.SecretRotation]: {
    title: "Secret Rotation",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.SecretRollback]: {
    title: "Secret Rollback",
    actions: [
      { label: "Perform rollback", value: "create" },
      { label: "View", value: "read" }
    ]
  }
};
