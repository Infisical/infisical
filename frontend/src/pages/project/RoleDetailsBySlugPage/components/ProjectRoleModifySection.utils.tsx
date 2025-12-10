import { ReactNode } from "react";
import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { z } from "zod";

import { Tooltip } from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionCertificateActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionCmekActions,
  ProjectPermissionSub
} from "@app/context";
import {
  PermissionConditionOperators,
  ProjectPermissionAppConnectionActions,
  ProjectPermissionAuditLogsActions,
  ProjectPermissionCommitsActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionKmipActions,
  ProjectPermissionMemberActions,
  ProjectPermissionPamAccountActions,
  ProjectPermissionPamSessionActions,
  ProjectPermissionPkiSubscriberActions,
  ProjectPermissionPkiSyncActions,
  ProjectPermissionPkiTemplateActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSecretEventActions,
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSecretScanningConfigActions,
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSecretScanningFindingActions,
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSshHostActions,
  TPermissionCondition,
  TPermissionConditionOperators
} from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { TProjectPermission } from "@app/hooks/api/roles/types";

const GeneralPolicyActionSchema = z.object({
  read: z.boolean().optional(),
  edit: z.boolean().optional(),
  delete: z.boolean().optional(),
  create: z.boolean().optional()
});

const AuditLogsPolicyActionSchema = z.object({
  [ProjectPermissionAuditLogsActions.Read]: z.boolean().optional()
});

const CertificatePolicyActionSchema = z.object({
  [ProjectPermissionCertificateActions.Create]: z.boolean().optional(),
  [ProjectPermissionCertificateActions.Delete]: z.boolean().optional(),
  [ProjectPermissionCertificateActions.Edit]: z.boolean().optional(),
  [ProjectPermissionCertificateActions.Read]: z.boolean().optional(),
  [ProjectPermissionCertificateActions.ReadPrivateKey]: z.boolean().optional()
});

const SecretPolicyActionSchema = z.object({
  [ProjectPermissionSecretActions.DescribeAndReadValue]: z.boolean().optional(), // existing read, gives both describe and read value
  [ProjectPermissionSecretActions.DescribeSecret]: z.boolean().optional(),
  [ProjectPermissionSecretActions.ReadValue]: z.boolean().optional(),
  [ProjectPermissionSecretActions.Edit]: z.boolean().optional(),
  [ProjectPermissionSecretActions.Delete]: z.boolean().optional(),
  [ProjectPermissionSecretActions.Create]: z.boolean().optional(),
  [ProjectPermissionSecretActions.Subscribe]: z.boolean().optional()
});

const ApprovalPolicyActionSchema = z.object({
  [ProjectPermissionActions.Read]: z.boolean().optional(),
  [ProjectPermissionActions.Edit]: z.boolean().optional(),
  [ProjectPermissionActions.Delete]: z.boolean().optional(),
  [ProjectPermissionActions.Create]: z.boolean().optional()
});

const CmekPolicyActionSchema = z.object({
  read: z.boolean().optional(),
  edit: z.boolean().optional(),
  delete: z.boolean().optional(),
  create: z.boolean().optional(),
  encrypt: z.boolean().optional(),
  decrypt: z.boolean().optional(),
  sign: z.boolean().optional(),
  verify: z.boolean().optional()
});

const DynamicSecretPolicyActionSchema = z.object({
  [ProjectPermissionDynamicSecretActions.ReadRootCredential]: z.boolean().optional(),
  [ProjectPermissionDynamicSecretActions.EditRootCredential]: z.boolean().optional(),
  [ProjectPermissionDynamicSecretActions.DeleteRootCredential]: z.boolean().optional(),
  [ProjectPermissionDynamicSecretActions.CreateRootCredential]: z.boolean().optional(),
  [ProjectPermissionDynamicSecretActions.Lease]: z.boolean().optional()
});

const SecretSyncPolicyActionSchema = z.object({
  [ProjectPermissionSecretSyncActions.Read]: z.boolean().optional(),
  [ProjectPermissionSecretSyncActions.Create]: z.boolean().optional(),
  [ProjectPermissionSecretSyncActions.Edit]: z.boolean().optional(),
  [ProjectPermissionSecretSyncActions.Delete]: z.boolean().optional(),
  [ProjectPermissionSecretSyncActions.SyncSecrets]: z.boolean().optional(),
  [ProjectPermissionSecretSyncActions.ImportSecrets]: z.boolean().optional(),
  [ProjectPermissionSecretSyncActions.RemoveSecrets]: z.boolean().optional()
});

const PkiSyncPolicyActionSchema = z.object({
  [ProjectPermissionPkiSyncActions.Read]: z.boolean().optional(),
  [ProjectPermissionPkiSyncActions.Create]: z.boolean().optional(),
  [ProjectPermissionPkiSyncActions.Edit]: z.boolean().optional(),
  [ProjectPermissionPkiSyncActions.Delete]: z.boolean().optional(),
  [ProjectPermissionPkiSyncActions.SyncCertificates]: z.boolean().optional(),
  [ProjectPermissionPkiSyncActions.ImportCertificates]: z.boolean().optional(),
  [ProjectPermissionPkiSyncActions.RemoveCertificates]: z.boolean().optional()
});

const CommitPolicyActionSchema = z.object({
  [ProjectPermissionCommitsActions.Read]: z.boolean().optional(),
  [ProjectPermissionCommitsActions.PerformRollback]: z.boolean().optional()
});

const SecretRotationPolicyActionSchema = z.object({
  [ProjectPermissionSecretRotationActions.Read]: z.boolean().optional(),
  [ProjectPermissionSecretRotationActions.ReadGeneratedCredentials]: z.boolean().optional(),
  [ProjectPermissionSecretRotationActions.Create]: z.boolean().optional(),
  [ProjectPermissionSecretRotationActions.Edit]: z.boolean().optional(),
  [ProjectPermissionSecretRotationActions.Delete]: z.boolean().optional(),
  [ProjectPermissionSecretRotationActions.RotateSecrets]: z.boolean().optional()
});

const SecretScanningDataSourcePolicyActionSchema = z.object({
  [ProjectPermissionSecretScanningDataSourceActions.Read]: z.boolean().optional(),
  [ProjectPermissionSecretScanningDataSourceActions.Create]: z.boolean().optional(),
  [ProjectPermissionSecretScanningDataSourceActions.Edit]: z.boolean().optional(),
  [ProjectPermissionSecretScanningDataSourceActions.Delete]: z.boolean().optional(),
  [ProjectPermissionSecretScanningDataSourceActions.ReadScans]: z.boolean().optional(),
  [ProjectPermissionSecretScanningDataSourceActions.ReadResources]: z.boolean().optional(),
  [ProjectPermissionSecretScanningDataSourceActions.TriggerScans]: z.boolean().optional()
});

const SecretScanningFindingPolicyActionSchema = z.object({
  [ProjectPermissionSecretScanningFindingActions.Read]: z.boolean().optional(),
  [ProjectPermissionSecretScanningFindingActions.Update]: z.boolean().optional()
});

const SecretScanningConfigPolicyActionSchema = z.object({
  [ProjectPermissionSecretScanningConfigActions.Read]: z.boolean().optional(),
  [ProjectPermissionSecretScanningConfigActions.Update]: z.boolean().optional()
});

const AppConnectionPolicyActionSchema = z.object({
  [ProjectPermissionAppConnectionActions.Create]: z.boolean().optional(),
  [ProjectPermissionAppConnectionActions.Read]: z.boolean().optional(),
  [ProjectPermissionAppConnectionActions.Edit]: z.boolean().optional(),
  [ProjectPermissionAppConnectionActions.Delete]: z.boolean().optional(),
  [ProjectPermissionAppConnectionActions.Connect]: z.boolean().optional()
});

const KmipPolicyActionSchema = z.object({
  [ProjectPermissionKmipActions.ReadClients]: z.boolean().optional(),
  [ProjectPermissionKmipActions.CreateClients]: z.boolean().optional(),
  [ProjectPermissionKmipActions.UpdateClients]: z.boolean().optional(),
  [ProjectPermissionKmipActions.DeleteClients]: z.boolean().optional(),
  [ProjectPermissionKmipActions.GenerateClientCertificates]: z.boolean().optional()
});

const MemberPolicyActionSchema = z.object({
  [ProjectPermissionMemberActions.Read]: z.boolean().optional(),
  [ProjectPermissionMemberActions.Create]: z.boolean().optional(),
  [ProjectPermissionMemberActions.Edit]: z.boolean().optional(),
  [ProjectPermissionMemberActions.Delete]: z.boolean().optional(),
  [ProjectPermissionMemberActions.GrantPrivileges]: z.boolean().optional(),
  [ProjectPermissionMemberActions.AssumePrivileges]: z.boolean().optional()
});

const IdentityPolicyActionSchema = z.object({
  [ProjectPermissionIdentityActions.Read]: z.boolean().optional(),
  [ProjectPermissionIdentityActions.Create]: z.boolean().optional(),
  [ProjectPermissionIdentityActions.Edit]: z.boolean().optional(),
  [ProjectPermissionIdentityActions.Delete]: z.boolean().optional(),
  [ProjectPermissionIdentityActions.GrantPrivileges]: z.boolean().optional(),
  [ProjectPermissionIdentityActions.AssumePrivileges]: z.boolean().optional(),
  [ProjectPermissionIdentityActions.RevokeAuth]: z.boolean().optional(),
  [ProjectPermissionIdentityActions.GetToken]: z.boolean().optional(),
  [ProjectPermissionIdentityActions.CreateToken]: z.boolean().optional(),
  [ProjectPermissionIdentityActions.DeleteToken]: z.boolean().optional()
});

const GroupPolicyActionSchema = z.object({
  [ProjectPermissionGroupActions.Read]: z.boolean().optional(),
  [ProjectPermissionGroupActions.Create]: z.boolean().optional(),
  [ProjectPermissionGroupActions.Edit]: z.boolean().optional(),
  [ProjectPermissionGroupActions.Delete]: z.boolean().optional(),
  [ProjectPermissionGroupActions.GrantPrivileges]: z.boolean().optional()
});

const SshHostPolicyActionSchema = z.object({
  [ProjectPermissionSshHostActions.Read]: z.boolean().optional(),
  [ProjectPermissionSshHostActions.Create]: z.boolean().optional(),
  [ProjectPermissionSshHostActions.Edit]: z.boolean().optional(),
  [ProjectPermissionSshHostActions.Delete]: z.boolean().optional(),
  [ProjectPermissionSshHostActions.IssueHostCert]: z.boolean().optional()
});

const PkiSubscriberPolicyActionSchema = z.object({
  [ProjectPermissionPkiSubscriberActions.Read]: z.boolean().optional(),
  [ProjectPermissionPkiSubscriberActions.Create]: z.boolean().optional(),
  [ProjectPermissionPkiSubscriberActions.Edit]: z.boolean().optional(),
  [ProjectPermissionPkiSubscriberActions.Delete]: z.boolean().optional(),
  [ProjectPermissionPkiSubscriberActions.IssueCert]: z.boolean().optional(),
  [ProjectPermissionPkiSubscriberActions.ListCerts]: z.boolean().optional()
});

const PkiTemplatePolicyActionSchema = z.object({
  [ProjectPermissionPkiTemplateActions.Read]: z.boolean().optional(),
  [ProjectPermissionPkiTemplateActions.Create]: z.boolean().optional(),
  [ProjectPermissionPkiTemplateActions.Edit]: z.boolean().optional(),
  [ProjectPermissionPkiTemplateActions.Delete]: z.boolean().optional(),
  [ProjectPermissionPkiTemplateActions.IssueCert]: z.boolean().optional(),
  [ProjectPermissionPkiTemplateActions.ListCerts]: z.boolean().optional()
});
const CertificateProfilePolicyActionSchema = z.object({
  [ProjectPermissionCertificateProfileActions.Read]: z.boolean().optional(),
  [ProjectPermissionCertificateProfileActions.Create]: z.boolean().optional(),
  [ProjectPermissionCertificateProfileActions.Edit]: z.boolean().optional(),
  [ProjectPermissionCertificateProfileActions.Delete]: z.boolean().optional(),
  [ProjectPermissionCertificateProfileActions.IssueCert]: z.boolean().optional()
});

const SecretEventsPolicyActionSchema = z.object({
  [ProjectPermissionSecretEventActions.SubscribeCreated]: z.boolean().optional(),
  [ProjectPermissionSecretEventActions.SubscribeUpdated]: z.boolean().optional(),
  [ProjectPermissionSecretEventActions.SubscribeDeleted]: z.boolean().optional(),
  [ProjectPermissionSecretEventActions.SubscribeImportMutations]: z.boolean().optional()
});

const PamAccountPolicyActionSchema = z.object({
  [ProjectPermissionPamAccountActions.Access]: z.boolean().optional(),
  [ProjectPermissionPamAccountActions.Create]: z.boolean().optional(),
  [ProjectPermissionPamAccountActions.Read]: z.boolean().optional(),
  [ProjectPermissionPamAccountActions.Edit]: z.boolean().optional(),
  [ProjectPermissionPamAccountActions.Delete]: z.boolean().optional()
});

const PamSessionPolicyActionSchema = z.object({
  [ProjectPermissionPamSessionActions.Read]: z.boolean().optional()
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
  )
  .refine(
    (val) =>
      val
        .filter(
          (el) => el.lhs === "secretPath" && el.operator !== PermissionConditionOperators.$GLOB
        )
        .every((el) =>
          el.operator === PermissionConditionOperators.$IN
            ? el.rhs.split(",").every((i) => i.trim().startsWith("/"))
            : el.rhs.trim().startsWith("/")
        ),
    { message: "Invalid Secret Path. Must start with '/'" }
  )
  .refine(
    (val) =>
      val
        .filter((el) => el.operator === PermissionConditionOperators.$EQ)
        .every((el) => !el.rhs.includes(",")),
    { message: '"Equal" checks cannot contain comma separated values. Use "IN" operator instead.' }
  )
  .refine(
    (val) =>
      val
        .filter((el) => el.operator === PermissionConditionOperators.$NEQ)
        .every((el) => !el.rhs.includes(",")),
    {
      message:
        '"Not Equal" checks cannot contain comma separated values. Use "IN" operator with "Forbid" instead.'
    }
  );

export const projectRoleFormSchema = z.object({
  name: z.string().trim(),
  description: z.string().trim().nullish(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine((val) => val !== "custom", { message: "Cannot use custom as its a keyword" }),
  permissions: z
    .object({
      [ProjectPermissionSub.Secrets]: SecretPolicyActionSchema.extend({
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
      [ProjectPermissionSub.Identity]: IdentityPolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.SecretSyncs]: SecretSyncPolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.AppConnections]: AppConnectionPolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.PkiSyncs]: PkiSyncPolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),

      [ProjectPermissionSub.Commits]: CommitPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Member]: MemberPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Groups]: GroupPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Role]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Integrations]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Webhooks]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.ServiceTokens]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Settings]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Environments]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.AuditLogs]: AuditLogsPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.IpAllowList]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.CertificateAuthorities]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Certificates]: CertificatePolicyActionSchema.array().default([]),
      [ProjectPermissionSub.PkiSubscribers]: PkiSubscriberPolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.PkiAlerts]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.PkiCollections]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.CertificateTemplates]: PkiTemplatePolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.CertificateProfiles]:
        CertificateProfilePolicyActionSchema.array().default([]),
      [ProjectPermissionSub.SshCertificateAuthorities]: GeneralPolicyActionSchema.array().default(
        []
      ),
      [ProjectPermissionSub.SshCertificates]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.SshCertificateTemplates]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.SshHosts]: SshHostPolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.SshHostGroups]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.SecretApproval]: ApprovalPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.SecretRollback]: SecretRollbackPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Project]: WorkspacePolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Tags]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.SecretRotation]: SecretRotationPolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.Kms]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Cmek]: CmekPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.Kmip]: KmipPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.SecretScanningDataSources]:
        SecretScanningDataSourcePolicyActionSchema.array().default([]),
      [ProjectPermissionSub.SecretScanningFindings]:
        SecretScanningFindingPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.SecretScanningConfigs]:
        SecretScanningConfigPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.SecretEvents]: SecretEventsPolicyActionSchema.extend({
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.PamFolders]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.PamResources]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.PamAccounts]: PamAccountPolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.PamSessions]: PamSessionPolicyActionSchema.array().default([])
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
  | ProjectPermissionSub.PkiSubscribers
  | ProjectPermissionSub.CertificateTemplates
  | ProjectPermissionSub.SshHosts
  | ProjectPermissionSub.SecretRotation
  | ProjectPermissionSub.Identity
  | ProjectPermissionSub.SecretSyncs
  | ProjectPermissionSub.PkiSyncs
  | ProjectPermissionSub.SecretEvents
  | ProjectPermissionSub.AppConnections
  | ProjectPermissionSub.PamAccounts;

export const isConditionalSubjects = (
  subject: ProjectPermissionSub
): subject is TConditionalFields =>
  subject === (ProjectPermissionSub.Secrets as const) ||
  subject === ProjectPermissionSub.DynamicSecrets ||
  subject === ProjectPermissionSub.SecretImports ||
  subject === ProjectPermissionSub.SecretFolders ||
  subject === ProjectPermissionSub.Identity ||
  subject === ProjectPermissionSub.SshHosts ||
  subject === ProjectPermissionSub.SecretRotation ||
  subject === ProjectPermissionSub.PkiSubscribers ||
  subject === ProjectPermissionSub.CertificateTemplates ||
  subject === ProjectPermissionSub.SecretSyncs ||
  subject === ProjectPermissionSub.PkiSyncs ||
  subject === ProjectPermissionSub.SecretEvents ||
  subject === ProjectPermissionSub.AppConnections ||
  subject === ProjectPermissionSub.PamAccounts;

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
        if (Array.isArray(rhs) || typeof rhs === "string") {
          formConditions.push({
            operator: conditionOperator,
            lhs: type,
            rhs: typeof rhs === "string" ? rhs : rhs.join(",")
          });
        } else if (
          conditionOperator === PermissionConditionOperators.$ELEMENTMATCH &&
          type === "metadata"
        ) {
          const deepKeyCondition = rhs.key;
          if (deepKeyCondition) {
            if (typeof deepKeyCondition === "string") {
              formConditions.push({
                operator: PermissionConditionOperators.$EQ,
                lhs: "metadataKey",
                rhs: deepKeyCondition
              });
            } else {
              Object.keys(deepKeyCondition).forEach((keyOperator) => {
                const deepRhs = deepKeyCondition?.[keyOperator as PermissionConditionOperators];
                if (deepRhs && (Array.isArray(deepRhs) || typeof deepRhs === "string")) {
                  formConditions.push({
                    operator: keyOperator,
                    lhs: "metadataKey",
                    rhs: typeof deepRhs === "string" ? deepRhs : deepRhs.join(",")
                  });
                }
              });
            }
          }
          const deepValueCondition = rhs.value;
          if (deepValueCondition) {
            if (typeof deepValueCondition === "string") {
              formConditions.push({
                operator: PermissionConditionOperators.$EQ,
                lhs: "metadataValue",
                rhs: deepValueCondition
              });
            } else {
              Object.keys(deepValueCondition).forEach((keyOperator) => {
                const deepRhs = deepValueCondition?.[keyOperator as PermissionConditionOperators];
                if (deepRhs && (Array.isArray(deepRhs) || typeof deepRhs === "string")) {
                  formConditions.push({
                    operator: keyOperator,
                    lhs: "metadataValue",
                    rhs: typeof deepRhs === "string" ? deepRhs : deepRhs.join(",")
                  });
                }
              });
            }
          }
        }
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
        ProjectPermissionSub.Role,
        ProjectPermissionSub.Integrations,
        ProjectPermissionSub.Webhooks,
        ProjectPermissionSub.ServiceTokens,
        ProjectPermissionSub.Settings,
        ProjectPermissionSub.Environments,
        ProjectPermissionSub.AuditLogs,
        ProjectPermissionSub.IpAllowList,
        ProjectPermissionSub.CertificateAuthorities,
        ProjectPermissionSub.PkiAlerts,
        ProjectPermissionSub.Identity,
        ProjectPermissionSub.PkiCollections,
        ProjectPermissionSub.Tags,
        ProjectPermissionSub.SecretRotation,
        ProjectPermissionSub.Kms,
        ProjectPermissionSub.SshCertificateTemplates,
        ProjectPermissionSub.SshCertificateAuthorities,
        ProjectPermissionSub.SshCertificates,
        ProjectPermissionSub.SshHostGroups,
        ProjectPermissionSub.SecretSyncs,
        ProjectPermissionSub.PkiSyncs,
        ProjectPermissionSub.SecretEvents,
        ProjectPermissionSub.AppConnections,
        ProjectPermissionSub.PamFolders,
        ProjectPermissionSub.PamResources
      ].includes(subject)
    ) {
      // from above statement we are sure it won't be undefined
      if (isConditionalSubjects(subject)) {
        if (!formVal[subject]) formVal[subject] = [];

        if (subject === ProjectPermissionSub.SecretRotation) {
          const canRead = action.includes(ProjectPermissionSecretRotationActions.Read);
          const canReadCredentials = action.includes(
            ProjectPermissionSecretRotationActions.ReadGeneratedCredentials
          );
          const canEdit = action.includes(ProjectPermissionSecretRotationActions.Edit);
          const canDelete = action.includes(ProjectPermissionSecretRotationActions.Delete);
          const canCreate = action.includes(ProjectPermissionSecretRotationActions.Create);
          const canRotate = action.includes(ProjectPermissionSecretRotationActions.RotateSecrets);

          // from above statement we are sure it won't be undefined
          formVal[subject]!.push({
            [ProjectPermissionSecretRotationActions.Read]: canRead,
            [ProjectPermissionSecretRotationActions.ReadGeneratedCredentials]: canReadCredentials,
            [ProjectPermissionSecretRotationActions.Create]: canCreate,
            [ProjectPermissionSecretRotationActions.Edit]: canEdit,
            [ProjectPermissionSecretRotationActions.Delete]: canDelete,
            [ProjectPermissionSecretRotationActions.RotateSecrets]: canRotate,
            conditions: conditions ? convertCaslConditionToFormOperator(conditions) : [],
            inverted
          });
          return;
        }

        if (subject === ProjectPermissionSub.SecretSyncs) {
          const canRead = action.includes(ProjectPermissionSecretSyncActions.Read);
          const canEdit = action.includes(ProjectPermissionSecretSyncActions.Edit);
          const canDelete = action.includes(ProjectPermissionSecretSyncActions.Delete);
          const canCreate = action.includes(ProjectPermissionSecretSyncActions.Create);
          const canSyncSecrets = action.includes(ProjectPermissionSecretSyncActions.SyncSecrets);
          const canImportSecrets = action.includes(
            ProjectPermissionSecretSyncActions.ImportSecrets
          );
          const canRemoveSecrets = action.includes(
            ProjectPermissionSecretSyncActions.RemoveSecrets
          );

          if (!formVal[subject]) formVal[subject] = [{ conditions: [], inverted: false }];

          // from above statement we are sure it won't be undefined
          formVal[subject]!.push({
            [ProjectPermissionSecretSyncActions.Read]: canRead,
            [ProjectPermissionSecretSyncActions.Create]: canCreate,
            [ProjectPermissionSecretSyncActions.Edit]: canEdit,
            [ProjectPermissionSecretSyncActions.Delete]: canDelete,
            [ProjectPermissionSecretSyncActions.SyncSecrets]: canSyncSecrets,
            [ProjectPermissionSecretSyncActions.ImportSecrets]: canImportSecrets,
            [ProjectPermissionSecretSyncActions.RemoveSecrets]: canRemoveSecrets,
            conditions: conditions ? convertCaslConditionToFormOperator(conditions) : [],
            inverted
          });
          return;
        }

        if (subject === ProjectPermissionSub.PkiSyncs) {
          const canRead = action.includes(ProjectPermissionPkiSyncActions.Read);
          const canEdit = action.includes(ProjectPermissionPkiSyncActions.Edit);
          const canDelete = action.includes(ProjectPermissionPkiSyncActions.Delete);
          const canCreate = action.includes(ProjectPermissionPkiSyncActions.Create);
          const canSyncCertificates = action.includes(
            ProjectPermissionPkiSyncActions.SyncCertificates
          );
          const canImportCertificates = action.includes(
            ProjectPermissionPkiSyncActions.ImportCertificates
          );
          const canRemoveCertificates = action.includes(
            ProjectPermissionPkiSyncActions.RemoveCertificates
          );

          if (!formVal[subject]) formVal[subject] = [{ conditions: [], inverted: false }];

          // from above statement we are sure it won't be undefined
          formVal[subject]!.push({
            [ProjectPermissionPkiSyncActions.Read]: canRead,
            [ProjectPermissionPkiSyncActions.Create]: canCreate,
            [ProjectPermissionPkiSyncActions.Edit]: canEdit,
            [ProjectPermissionPkiSyncActions.Delete]: canDelete,
            [ProjectPermissionPkiSyncActions.SyncCertificates]: canSyncCertificates,
            [ProjectPermissionPkiSyncActions.ImportCertificates]: canImportCertificates,
            [ProjectPermissionPkiSyncActions.RemoveCertificates]: canRemoveCertificates,
            conditions: conditions ? convertCaslConditionToFormOperator(conditions) : [],
            inverted
          });
          return;
        }

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

        if (subject === ProjectPermissionSub.Secrets) {
          const canDescribeAndReadValue = action.includes(
            ProjectPermissionSecretActions.DescribeAndReadValue
          );
          const canDescribe = action.includes(ProjectPermissionSecretActions.DescribeSecret);
          const canReadValue = action.includes(ProjectPermissionSecretActions.ReadValue);

          const canEdit = action.includes(ProjectPermissionSecretActions.Edit);
          const canDelete = action.includes(ProjectPermissionSecretActions.Delete);
          const canCreate = action.includes(ProjectPermissionSecretActions.Create);
          const canSubscribe = action.includes(ProjectPermissionSecretActions.Subscribe);

          // from above statement we are sure it won't be undefined
          formVal[subject]!.push({
            describeSecret: canDescribe,
            read: canDescribeAndReadValue,
            readValue: canReadValue,
            create: canCreate,
            edit: canEdit,
            delete: canDelete,
            subscribe: canSubscribe,
            conditions: conditions ? convertCaslConditionToFormOperator(conditions) : [],
            inverted
          });

          return;
        }

        if (subject === ProjectPermissionSub.SecretEvents) {
          const canSubscribeCreate = action.includes(
            ProjectPermissionSecretEventActions.SubscribeCreated
          );
          const canSubscribeUpdate = action.includes(
            ProjectPermissionSecretEventActions.SubscribeUpdated
          );
          const canSubscribeDelete = action.includes(
            ProjectPermissionSecretEventActions.SubscribeDeleted
          );
          const canSubscribeImportMutations = action.includes(
            ProjectPermissionSecretEventActions.SubscribeImportMutations
          );

          // from above statement we are sure it won't be undefined
          formVal[subject]!.push({
            "subscribe-on-created": canSubscribeCreate,
            "subscribe-on-deleted": canSubscribeDelete,
            "subscribe-on-updated": canSubscribeUpdate,
            "subscribe-on-import-mutations": canSubscribeImportMutations,
            conditions: conditions ? convertCaslConditionToFormOperator(conditions) : []
          });

          return;
        }

        if (subject === ProjectPermissionSub.AppConnections) {
          const canCreate = action.includes(ProjectPermissionAppConnectionActions.Create);
          const canRead = action.includes(ProjectPermissionAppConnectionActions.Read);
          const canEdit = action.includes(ProjectPermissionAppConnectionActions.Edit);
          const canDelete = action.includes(ProjectPermissionAppConnectionActions.Delete);
          const canConnect = action.includes(ProjectPermissionAppConnectionActions.Connect);

          // from above statement we are sure it won't be undefined
          formVal[subject]!.push({
            [ProjectPermissionAppConnectionActions.Read]: canRead,
            [ProjectPermissionAppConnectionActions.Create]: canCreate,
            [ProjectPermissionAppConnectionActions.Edit]: canEdit,
            [ProjectPermissionAppConnectionActions.Delete]: canDelete,
            [ProjectPermissionAppConnectionActions.Connect]: canConnect,
            conditions: conditions ? convertCaslConditionToFormOperator(conditions) : [],
            inverted
          });

          return;
        }

        if (subject === ProjectPermissionSub.Identity) {
          const canRead = action.includes(ProjectPermissionIdentityActions.Read);
          const canCreate = action.includes(ProjectPermissionIdentityActions.Create);
          const canEdit = action.includes(ProjectPermissionIdentityActions.Edit);
          const canDelete = action.includes(ProjectPermissionIdentityActions.Delete);
          const canGrantPrivileges = action.includes(
            ProjectPermissionIdentityActions.GrantPrivileges
          );
          const canAssumePrivileges = action.includes(
            ProjectPermissionIdentityActions.AssumePrivileges
          );
          const canRevokeAuth = action.includes(ProjectPermissionIdentityActions.RevokeAuth);
          const canCreateToken = action.includes(ProjectPermissionIdentityActions.CreateToken);
          const canGetToken = action.includes(ProjectPermissionIdentityActions.GetToken);
          const canDeleteToken = action.includes(ProjectPermissionIdentityActions.DeleteToken);

          // from above statement we are sure it won't be undefined
          formVal[subject]!.push({
            [ProjectPermissionIdentityActions.Read]: canRead,
            [ProjectPermissionIdentityActions.Create]: canCreate,
            [ProjectPermissionIdentityActions.Edit]: canEdit,
            [ProjectPermissionIdentityActions.Delete]: canDelete,
            [ProjectPermissionIdentityActions.GrantPrivileges]: canGrantPrivileges,
            [ProjectPermissionIdentityActions.AssumePrivileges]: canAssumePrivileges,
            [ProjectPermissionIdentityActions.RevokeAuth]: canRevokeAuth,
            [ProjectPermissionIdentityActions.CreateToken]: canCreateToken,
            [ProjectPermissionIdentityActions.GetToken]: canGetToken,
            [ProjectPermissionIdentityActions.DeleteToken]: canDeleteToken,
            conditions: conditions ? convertCaslConditionToFormOperator(conditions) : [],
            inverted
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

      if (!formVal[subject]) {
        formVal[subject] = [{ conditions: [] }];
      }
      if (canRead) formVal[subject as ProjectPermissionSub.Member]![0].read = true;
      if (canEdit) formVal[subject as ProjectPermissionSub.Member]![0].edit = true;
      if (canCreate) formVal[subject as ProjectPermissionSub.Member]![0].create = true;
      if (canDelete) formVal[subject as ProjectPermissionSub.Member]![0].delete = true;
      return;
    }

    if (subject === ProjectPermissionSub.Certificates) {
      const canRead = action.includes(ProjectPermissionCertificateActions.Read);
      const canEdit = action.includes(ProjectPermissionCertificateActions.Edit);
      const canDelete = action.includes(ProjectPermissionCertificateActions.Delete);
      const canCreate = action.includes(ProjectPermissionCertificateActions.Create);
      const canReadPrivateKey = action.includes(ProjectPermissionCertificateActions.ReadPrivateKey);

      if (!formVal[subject]) formVal[subject] = [{}];

      // from above statement we are sure it won't be undefined
      if (canRead) formVal[subject]![0].read = true;
      if (canEdit) formVal[subject]![0].edit = true;
      if (canCreate) formVal[subject]![0].create = true;
      if (canDelete) formVal[subject]![0].delete = true;
      if (canReadPrivateKey)
        formVal[subject]![0][ProjectPermissionCertificateActions.ReadPrivateKey] = true;
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

    if (subject === ProjectPermissionSub.SecretApproval) {
      const canCreate = action.includes(ProjectPermissionActions.Create);
      const canDelete = action.includes(ProjectPermissionActions.Delete);
      const canEdit = action.includes(ProjectPermissionActions.Edit);
      const canRead = action.includes(ProjectPermissionActions.Read);

      if (!formVal[subject]) formVal[subject] = [{}];

      // Map actions to the keys defined in ApprovalPolicyActionSchema
      if (canCreate) formVal[subject]![0][ProjectPermissionActions.Create] = true;
      if (canDelete) formVal[subject]![0][ProjectPermissionActions.Delete] = true;
      if (canEdit) formVal[subject]![0][ProjectPermissionActions.Edit] = true;
      if (canRead) formVal[subject]![0][ProjectPermissionActions.Read] = true;
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
      const canSign = action.includes(ProjectPermissionCmekActions.Sign);
      const canVerify = action.includes(ProjectPermissionCmekActions.Verify);

      if (!formVal[subject]) formVal[subject] = [{}];

      // from above statement we are sure it won't be undefined
      if (canRead) formVal[subject]![0].read = true;
      if (canEdit) formVal[subject]![0].edit = true;
      if (canCreate) formVal[subject]![0].create = true;
      if (canDelete) formVal[subject]![0].delete = true;
      if (canEncrypt) formVal[subject]![0].encrypt = true;
      if (canDecrypt) formVal[subject]![0].decrypt = true;
      if (canSign) formVal[subject]![0].sign = true;
      if (canVerify) formVal[subject]![0].verify = true;
      return;
    }

    if (subject === ProjectPermissionSub.Kmip) {
      const canReadClients = action.includes(ProjectPermissionKmipActions.ReadClients);
      const canEditClients = action.includes(ProjectPermissionKmipActions.UpdateClients);
      const canDeleteClients = action.includes(ProjectPermissionKmipActions.DeleteClients);
      const canCreateClients = action.includes(ProjectPermissionKmipActions.CreateClients);
      const canGenerateClientCerts = action.includes(
        ProjectPermissionKmipActions.GenerateClientCertificates
      );

      if (!formVal[subject]) formVal[subject] = [{}];

      // from above statement we are sure it won't be undefined
      if (canReadClients) formVal[subject]![0][ProjectPermissionKmipActions.ReadClients] = true;
      if (canEditClients) formVal[subject]![0][ProjectPermissionKmipActions.UpdateClients] = true;
      if (canCreateClients) formVal[subject]![0][ProjectPermissionKmipActions.CreateClients] = true;
      if (canDeleteClients) formVal[subject]![0][ProjectPermissionKmipActions.DeleteClients] = true;
      if (canGenerateClientCerts)
        formVal[subject]![0][ProjectPermissionKmipActions.GenerateClientCertificates] = true;

      return;
    }

    if (subject === ProjectPermissionSub.Member) {
      const canRead = action.includes(ProjectPermissionMemberActions.Read);
      const canCreate = action.includes(ProjectPermissionMemberActions.Create);
      const canEdit = action.includes(ProjectPermissionMemberActions.Edit);
      const canDelete = action.includes(ProjectPermissionMemberActions.Delete);
      const canGrantPrivileges = action.includes(ProjectPermissionMemberActions.GrantPrivileges);
      const canAssumePrivileges = action.includes(ProjectPermissionMemberActions.AssumePrivileges);

      if (!formVal[subject]) formVal[subject] = [{}];

      // from above statement we are sure it won't be undefined
      if (canRead) formVal[subject]![0][ProjectPermissionMemberActions.Read] = true;
      if (canCreate) formVal[subject]![0][ProjectPermissionMemberActions.Create] = true;
      if (canEdit) formVal[subject]![0][ProjectPermissionMemberActions.Edit] = true;
      if (canDelete) formVal[subject]![0][ProjectPermissionMemberActions.Delete] = true;
      if (canGrantPrivileges)
        formVal[subject]![0][ProjectPermissionMemberActions.GrantPrivileges] = true;
      if (canAssumePrivileges)
        formVal[subject]![0][ProjectPermissionMemberActions.AssumePrivileges] = true;
      return;
    }

    if (subject === ProjectPermissionSub.Groups) {
      const canRead = action.includes(ProjectPermissionGroupActions.Read);
      const canCreate = action.includes(ProjectPermissionGroupActions.Create);
      const canEdit = action.includes(ProjectPermissionGroupActions.Edit);
      const canDelete = action.includes(ProjectPermissionGroupActions.Delete);
      const canGrantPrivileges = action.includes(ProjectPermissionGroupActions.GrantPrivileges);

      if (!formVal[subject]) formVal[subject] = [{}];

      // from above statement we are sure it won't be undefined
      if (canRead) formVal[subject]![0][ProjectPermissionGroupActions.Read] = true;
      if (canCreate) formVal[subject]![0][ProjectPermissionGroupActions.Create] = true;
      if (canEdit) formVal[subject]![0][ProjectPermissionGroupActions.Edit] = true;
      if (canDelete) formVal[subject]![0][ProjectPermissionGroupActions.Delete] = true;
      if (canGrantPrivileges)
        formVal[subject]![0][ProjectPermissionGroupActions.GrantPrivileges] = true;
      return;
    }

    if (subject === ProjectPermissionSub.SecretScanningDataSources) {
      const canRead = action.includes(ProjectPermissionSecretScanningDataSourceActions.Read);
      const canEdit = action.includes(ProjectPermissionSecretScanningDataSourceActions.Edit);
      const canDelete = action.includes(ProjectPermissionSecretScanningDataSourceActions.Delete);
      const canCreate = action.includes(ProjectPermissionSecretScanningDataSourceActions.Create);
      const canReadScans = action.includes(
        ProjectPermissionSecretScanningDataSourceActions.ReadScans
      );
      const canReadResources = action.includes(
        ProjectPermissionSecretScanningDataSourceActions.ReadResources
      );
      const canTriggerScans = action.includes(
        ProjectPermissionSecretScanningDataSourceActions.TriggerScans
      );

      if (!formVal[subject]) formVal[subject] = [{}];

      // from above statement we are sure it won't be undefined
      if (canRead)
        formVal[subject]![0][ProjectPermissionSecretScanningDataSourceActions.Read] = true;
      if (canEdit)
        formVal[subject]![0][ProjectPermissionSecretScanningDataSourceActions.Edit] = true;
      if (canCreate)
        formVal[subject]![0][ProjectPermissionSecretScanningDataSourceActions.Create] = true;
      if (canDelete)
        formVal[subject]![0][ProjectPermissionSecretScanningDataSourceActions.Delete] = true;
      if (canReadScans)
        formVal[subject]![0][ProjectPermissionSecretScanningDataSourceActions.ReadScans] = true;
      if (canReadResources)
        formVal[subject]![0][ProjectPermissionSecretScanningDataSourceActions.ReadResources] = true;
      if (canTriggerScans)
        formVal[subject]![0][ProjectPermissionSecretScanningDataSourceActions.TriggerScans] = true;

      return;
    }

    if (subject === ProjectPermissionSub.SecretScanningFindings) {
      const canRead = action.includes(ProjectPermissionSecretScanningFindingActions.Read);
      const canUpdate = action.includes(ProjectPermissionSecretScanningFindingActions.Update);

      if (!formVal[subject]) formVal[subject] = [{}];

      // from above statement we are sure it won't be undefined
      if (canRead) formVal[subject]![0][ProjectPermissionSecretScanningFindingActions.Read] = true;
      if (canUpdate)
        formVal[subject]![0][ProjectPermissionSecretScanningFindingActions.Update] = true;

      return;
    }

    if (subject === ProjectPermissionSub.SecretScanningConfigs) {
      const canRead = action.includes(ProjectPermissionSecretScanningConfigActions.Read);
      const canUpdate = action.includes(ProjectPermissionSecretScanningConfigActions.Update);

      if (!formVal[subject]) formVal[subject] = [{}];

      // from above statement we are sure it won't be undefined
      if (canRead) formVal[subject]![0][ProjectPermissionSecretScanningConfigActions.Read] = true;
      if (canUpdate)
        formVal[subject]![0][ProjectPermissionSecretScanningConfigActions.Update] = true;

      return;
    }

    if (subject === ProjectPermissionSub.SshHosts) {
      if (!formVal[subject]) formVal[subject] = [];

      formVal[subject]!.push({
        [ProjectPermissionSshHostActions.Edit]: action.includes(
          ProjectPermissionSshHostActions.Edit
        ),
        [ProjectPermissionSshHostActions.Delete]: action.includes(
          ProjectPermissionSshHostActions.Delete
        ),
        [ProjectPermissionSshHostActions.Create]: action.includes(
          ProjectPermissionSshHostActions.Create
        ),
        [ProjectPermissionSshHostActions.Read]: action.includes(
          ProjectPermissionSshHostActions.Read
        ),
        [ProjectPermissionSshHostActions.IssueHostCert]: action.includes(
          ProjectPermissionSshHostActions.IssueHostCert
        ),
        conditions: conditions ? convertCaslConditionToFormOperator(conditions) : [],
        inverted
      });

      return;
    }

    if (subject === ProjectPermissionSub.Commits) {
      const canRead = action.includes(ProjectPermissionCommitsActions.Read);
      const canPerformRollback = action.includes(ProjectPermissionCommitsActions.PerformRollback);

      if (!formVal[subject]) formVal[subject] = [{}];
      if (canRead) formVal[subject]![0][ProjectPermissionCommitsActions.Read] = true;
      if (canPerformRollback)
        formVal[subject]![0][ProjectPermissionCommitsActions.PerformRollback] = true;
      return;
    }

    if (subject === ProjectPermissionSub.PkiSubscribers) {
      if (!formVal[subject]) formVal[subject] = [];

      formVal[subject]!.push({
        [ProjectPermissionPkiSubscriberActions.Edit]: action.includes(
          ProjectPermissionPkiSubscriberActions.Edit
        ),
        [ProjectPermissionPkiSubscriberActions.Delete]: action.includes(
          ProjectPermissionPkiSubscriberActions.Delete
        ),
        [ProjectPermissionPkiSubscriberActions.Create]: action.includes(
          ProjectPermissionPkiSubscriberActions.Create
        ),
        [ProjectPermissionPkiSubscriberActions.Read]: action.includes(
          ProjectPermissionPkiSubscriberActions.Read
        ),
        [ProjectPermissionPkiSubscriberActions.IssueCert]: action.includes(
          ProjectPermissionPkiSubscriberActions.IssueCert
        ),
        [ProjectPermissionPkiSubscriberActions.ListCerts]: action.includes(
          ProjectPermissionPkiSubscriberActions.ListCerts
        ),
        conditions: conditions ? convertCaslConditionToFormOperator(conditions) : [],
        inverted
      });
      return;
    }

    if (subject === ProjectPermissionSub.CertificateTemplates) {
      if (!formVal[subject]) formVal[subject] = [];

      formVal[subject]!.push({
        [ProjectPermissionPkiTemplateActions.Edit]: action.includes(
          ProjectPermissionPkiTemplateActions.Edit
        ),
        [ProjectPermissionPkiTemplateActions.Delete]: action.includes(
          ProjectPermissionPkiTemplateActions.Delete
        ),
        [ProjectPermissionPkiTemplateActions.Create]: action.includes(
          ProjectPermissionPkiTemplateActions.Create
        ),
        [ProjectPermissionPkiTemplateActions.Read]: action.includes(
          ProjectPermissionPkiTemplateActions.Read
        ),
        [ProjectPermissionPkiTemplateActions.IssueCert]: action.includes(
          ProjectPermissionPkiTemplateActions.IssueCert
        ),
        [ProjectPermissionPkiTemplateActions.ListCerts]: action.includes(
          ProjectPermissionPkiTemplateActions.ListCerts
        ),
        conditions: conditions ? convertCaslConditionToFormOperator(conditions) : [],
        inverted
      });

      return;
    }
    if (subject === ProjectPermissionSub.CertificateProfiles) {
      if (!formVal[subject]) formVal[subject] = [];

      formVal[subject]!.push({
        [ProjectPermissionCertificateProfileActions.Edit]: action.includes(
          ProjectPermissionCertificateProfileActions.Edit
        ),
        [ProjectPermissionCertificateProfileActions.Delete]: action.includes(
          ProjectPermissionCertificateProfileActions.Delete
        ),
        [ProjectPermissionCertificateProfileActions.Create]: action.includes(
          ProjectPermissionCertificateProfileActions.Create
        ),
        [ProjectPermissionCertificateProfileActions.Read]: action.includes(
          ProjectPermissionCertificateProfileActions.Read
        ),
        [ProjectPermissionCertificateProfileActions.IssueCert]: action.includes(
          ProjectPermissionCertificateProfileActions.IssueCert
        )
      });

      return;
    }

    if (subject === ProjectPermissionSub.PamAccounts) {
      if (!formVal[subject]) formVal[subject] = [];

      formVal[subject].push({
        [ProjectPermissionPamAccountActions.Access]: action.includes(
          ProjectPermissionPamAccountActions.Access
        ),
        [ProjectPermissionPamAccountActions.Create]: action.includes(
          ProjectPermissionPamAccountActions.Create
        ),
        [ProjectPermissionPamAccountActions.Delete]: action.includes(
          ProjectPermissionPamAccountActions.Delete
        ),
        [ProjectPermissionPamAccountActions.Edit]: action.includes(
          ProjectPermissionPamAccountActions.Edit
        ),
        [ProjectPermissionPamAccountActions.Read]: action.includes(
          ProjectPermissionPamAccountActions.Read
        ),
        conditions: conditions ? convertCaslConditionToFormOperator(conditions) : [],
        inverted
      });
      return;
    }

    if (subject === ProjectPermissionSub.PamSessions) {
      const canRead = action.includes(ProjectPermissionPamSessionActions.Read);

      if (!formVal[subject]) formVal[subject] = [{}];

      // Map actions to the keys defined in ApprovalPolicyActionSchema
      if (canRead) formVal[subject]![0][ProjectPermissionPamAccountActions.Read] = true;
    }
  });

  return formVal;
};

const convertFormOperatorToCaslCondition = (
  conditions: { lhs: string; rhs: string; operator: string }[]
) => {
  const caslCondition: Record<string, Partial<TPermissionConditionOperators>> = {};

  const metadataKeyCondition = conditions.find((condition) => condition.lhs === "metadataKey");
  const metadataValueCondition = conditions.find((condition) => condition.lhs === "metadataValue");

  if (metadataKeyCondition || metadataValueCondition) {
    caslCondition.metadata = {
      [PermissionConditionOperators.$ELEMENTMATCH]: {}
    };

    if (metadataKeyCondition) {
      const operator = metadataKeyCondition.operator as PermissionConditionOperators;
      caslCondition.metadata[PermissionConditionOperators.$ELEMENTMATCH]!.key = {
        [metadataKeyCondition.operator]: [
          PermissionConditionOperators.$IN,
          PermissionConditionOperators.$ALL
        ].includes(operator)
          ? metadataKeyCondition.rhs.split(",")
          : metadataKeyCondition.rhs
      };
    }

    if (metadataValueCondition) {
      const operator = metadataValueCondition.operator as PermissionConditionOperators;
      caslCondition.metadata[PermissionConditionOperators.$ELEMENTMATCH]!.value = {
        [metadataValueCondition.operator]: [
          PermissionConditionOperators.$IN,
          PermissionConditionOperators.$ALL
        ].includes(operator)
          ? metadataValueCondition.rhs.split(",")
          : metadataValueCondition.rhs
      };
    }
  }

  conditions.forEach((el) => {
    // these are special fields and handled above
    if (el.lhs === "metadataKey" || el.lhs === "metadataValue") {
      return;
    }
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
          | PermissionConditionOperators.$ALL
          | PermissionConditionOperators.$IN
          | PermissionConditionOperators.$ELEMENTMATCH
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

export const EXCLUDED_PERMISSION_SUBS = [ProjectPermissionSub.SecretRollback];

export type TProjectPermissionObject = {
  [K in ProjectPermissionSub]: {
    title: string;
    actions: {
      label: string | ReactNode;
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
      {
        label: (
          <div className="flex items-center gap-1.5">
            <p className="opacity-60">
              Read <span className="text-xs opacity-80">(legacy)</span>
            </p>
            <Tooltip
              className="overflow-hidden whitespace-normal"
              content={
                <div>
                  This is a legacy action and will be removed in the future.
                  <br />
                  <br /> You should instead use the{" "}
                  <strong className="font-medium">Describe Secret</strong> and{" "}
                  <strong className="font-medium">Read Value</strong> actions.
                </div>
              }
            >
              <FontAwesomeIcon icon={faWarning} className="mt-1 text-yellow-500" size="sm" />
            </Tooltip>
          </div>
        ),
        value: ProjectPermissionSecretActions.DescribeAndReadValue
      },
      { label: "Describe Secret", value: ProjectPermissionSecretActions.DescribeSecret },
      { label: "Read Value", value: ProjectPermissionSecretActions.ReadValue },
      { label: "Modify", value: ProjectPermissionSecretActions.Edit },
      { label: "Remove", value: ProjectPermissionSecretActions.Delete },
      { label: "Create", value: ProjectPermissionSecretActions.Create }
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
        label: "Read Root Credentials",
        value: ProjectPermissionDynamicSecretActions.ReadRootCredential
      },
      {
        label: "Create Root Credentials",
        value: ProjectPermissionDynamicSecretActions.CreateRootCredential
      },
      {
        label: "Modify Root Credentials",
        value: ProjectPermissionDynamicSecretActions.EditRootCredential
      },
      {
        label: "Remove Root Credentials",
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
      { label: "Decrypt", value: "decrypt" },
      { label: "Sign", value: "sign" },
      { label: "Verify", value: "verify" }
    ]
  },
  [ProjectPermissionSub.Kms]: {
    title: "Project KMS Configuration",
    actions: [{ label: "Modify", value: "edit" }]
  },
  [ProjectPermissionSub.Integrations]: {
    title: "Native Integrations",
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
      { label: "Read", value: ProjectPermissionMemberActions.Read },
      { label: "Add", value: ProjectPermissionMemberActions.Create },
      { label: "Modify", value: ProjectPermissionMemberActions.Edit },
      { label: "Remove", value: ProjectPermissionMemberActions.Delete },
      { label: "Grant Privileges", value: ProjectPermissionMemberActions.GrantPrivileges },
      { label: "Assume Privileges", value: ProjectPermissionMemberActions.AssumePrivileges }
    ]
  },
  [ProjectPermissionSub.Identity]: {
    title: "Machine Identity Management",
    actions: [
      { label: "Read", value: ProjectPermissionIdentityActions.Read },
      { label: "Add", value: ProjectPermissionIdentityActions.Create },
      { label: "Modify", value: ProjectPermissionIdentityActions.Edit },
      { label: "Remove", value: ProjectPermissionIdentityActions.Delete },
      { label: "Grant Privileges", value: ProjectPermissionIdentityActions.GrantPrivileges },
      { label: "Assume Privileges", value: ProjectPermissionIdentityActions.AssumePrivileges },
      { label: "Revoke Auth", value: ProjectPermissionIdentityActions.RevokeAuth },
      { label: "Create Token", value: ProjectPermissionIdentityActions.CreateToken },
      { label: "Get Token", value: ProjectPermissionIdentityActions.GetToken },
      { label: "Delete Token", value: ProjectPermissionIdentityActions.DeleteToken }
    ]
  },
  [ProjectPermissionSub.Groups]: {
    title: "Group Management",
    actions: [
      { label: "Read", value: ProjectPermissionGroupActions.Read },
      { label: "Create", value: ProjectPermissionGroupActions.Create },
      { label: "Modify", value: ProjectPermissionGroupActions.Edit },
      { label: "Remove", value: ProjectPermissionGroupActions.Delete },
      { label: "Grant Privileges", value: ProjectPermissionGroupActions.GrantPrivileges }
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
  [ProjectPermissionSub.Commits]: {
    title: "Commits",
    actions: [
      { label: "View", value: ProjectPermissionCommitsActions.Read },
      { label: "Perform Rollback", value: ProjectPermissionCommitsActions.PerformRollback }
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
    actions: [{ label: "Read", value: ProjectPermissionAuditLogsActions.Read }]
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
      { label: "Read", value: ProjectPermissionCertificateActions.Read },
      { label: "Read Private Key", value: ProjectPermissionCertificateActions.ReadPrivateKey },
      { label: "Create", value: ProjectPermissionCertificateActions.Create },
      { label: "Modify", value: ProjectPermissionCertificateActions.Edit },
      { label: "Remove", value: ProjectPermissionCertificateActions.Delete }
    ]
  },
  [ProjectPermissionSub.CertificateTemplates]: {
    title: "Certificate Templates",
    actions: [
      { label: "Read", value: ProjectPermissionPkiTemplateActions.Read },
      { label: "Create", value: ProjectPermissionPkiTemplateActions.Create },
      { label: "Modify", value: ProjectPermissionPkiTemplateActions.Edit },
      { label: "Remove", value: ProjectPermissionPkiTemplateActions.Delete },
      { label: "Issue Certificates", value: ProjectPermissionPkiTemplateActions.IssueCert },
      { label: "List Certificates", value: ProjectPermissionPkiTemplateActions.ListCerts }
    ]
  },
  [ProjectPermissionSub.CertificateProfiles]: {
    title: "Certificate Profiles",
    actions: [
      { label: "Read", value: ProjectPermissionCertificateProfileActions.Read },
      { label: "Create", value: ProjectPermissionCertificateProfileActions.Create },
      { label: "Modify", value: ProjectPermissionCertificateProfileActions.Edit },
      { label: "Remove", value: ProjectPermissionCertificateProfileActions.Delete },
      { label: "Issue Certificates", value: ProjectPermissionCertificateProfileActions.IssueCert }
    ]
  },
  [ProjectPermissionSub.SshCertificateAuthorities]: {
    title: "SSH Certificate Authorities",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.SshCertificates]: {
    title: "SSH Certificates",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.SshCertificateTemplates]: {
    title: "SSH Certificate Templates",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.SshHosts]: {
    title: "SSH Hosts",
    actions: [
      { label: "Read", value: ProjectPermissionSshHostActions.Read },
      { label: "Create", value: ProjectPermissionSshHostActions.Create },
      { label: "Modify", value: ProjectPermissionSshHostActions.Edit },
      { label: "Remove", value: ProjectPermissionSshHostActions.Delete },
      { label: "Issue Host Certificate", value: ProjectPermissionSshHostActions.IssueHostCert }
    ]
  },
  [ProjectPermissionSub.SshHostGroups]: {
    title: "SSH Host Groups",
    actions: [
      { label: "Read", value: "read" },
      { label: "Create", value: "create" },
      { label: "Modify", value: "edit" },
      { label: "Remove", value: "delete" }
    ]
  },
  [ProjectPermissionSub.PkiSubscribers]: {
    title: "PKI Subscribers",
    actions: [
      { label: "Read", value: ProjectPermissionPkiSubscriberActions.Read },
      { label: "Create", value: ProjectPermissionPkiSubscriberActions.Create },
      { label: "Modify", value: ProjectPermissionPkiSubscriberActions.Edit },
      { label: "Remove", value: ProjectPermissionPkiSubscriberActions.Delete },
      { label: "Issue Certificate", value: ProjectPermissionPkiSubscriberActions.IssueCert },
      { label: "List Certificates", value: ProjectPermissionPkiSubscriberActions.ListCerts }
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
    title: "Secret Approval Policies",
    actions: [
      { label: "Read", value: ProjectPermissionActions.Read },
      { label: "Create", value: ProjectPermissionActions.Create },
      { label: "Modify", value: ProjectPermissionActions.Edit },
      { label: "Remove", value: ProjectPermissionActions.Delete }
    ]
  },
  [ProjectPermissionSub.SecretRotation]: {
    title: "Secret Rotation",
    actions: [
      { label: "Read Config", value: ProjectPermissionSecretRotationActions.Read },
      {
        label: "Read Generated Credentials",
        value: ProjectPermissionSecretRotationActions.ReadGeneratedCredentials
      },
      { label: "Create Config", value: ProjectPermissionSecretRotationActions.Create },
      { label: "Modify Config", value: ProjectPermissionSecretRotationActions.Edit },
      { label: "Remove Config", value: ProjectPermissionSecretRotationActions.Delete },
      { label: "Rotate Secrets", value: ProjectPermissionSecretRotationActions.RotateSecrets }
    ]
  },
  [ProjectPermissionSub.SecretRollback]: {
    title: "Secret Rollback",
    actions: [
      { label: "Perform rollback", value: "create" },
      { label: "View", value: "read" }
    ]
  },
  [ProjectPermissionSub.SecretSyncs]: {
    title: "Secret Syncs",
    actions: [
      { label: "Read", value: ProjectPermissionSecretSyncActions.Read },
      { label: "Create", value: ProjectPermissionSecretSyncActions.Create },
      { label: "Modify", value: ProjectPermissionSecretSyncActions.Edit },
      { label: "Remove", value: ProjectPermissionSecretSyncActions.Delete },
      { label: "Trigger Syncs", value: ProjectPermissionSecretSyncActions.SyncSecrets },
      {
        label: "Import Secrets from Destination",
        value: ProjectPermissionSecretSyncActions.ImportSecrets
      },
      {
        label: "Remove Secrets from Destination",
        value: ProjectPermissionSecretSyncActions.RemoveSecrets
      }
    ]
  },
  [ProjectPermissionSub.PkiSyncs]: {
    title: "Certificate Syncs",
    actions: [
      { label: "Read", value: ProjectPermissionPkiSyncActions.Read },
      { label: "Create", value: ProjectPermissionPkiSyncActions.Create },
      { label: "Modify", value: ProjectPermissionPkiSyncActions.Edit },
      { label: "Remove", value: ProjectPermissionPkiSyncActions.Delete },
      { label: "Trigger Syncs", value: ProjectPermissionPkiSyncActions.SyncCertificates },
      {
        label: "Import Certificates from Destination",
        value: ProjectPermissionPkiSyncActions.ImportCertificates
      },
      {
        label: "Remove Certificates from Destination",
        value: ProjectPermissionPkiSyncActions.RemoveCertificates
      }
    ]
  },
  [ProjectPermissionSub.Kmip]: {
    title: "KMIP",
    actions: [
      {
        label: "Read Clients",
        value: ProjectPermissionKmipActions.ReadClients
      },
      {
        label: "Create Clients",
        value: ProjectPermissionKmipActions.CreateClients
      },
      {
        label: "Modify Clients",
        value: ProjectPermissionKmipActions.UpdateClients
      },
      {
        label: "Delete Clients",
        value: ProjectPermissionKmipActions.DeleteClients
      },
      {
        label: "Generate Client Certificates",
        value: ProjectPermissionKmipActions.GenerateClientCertificates
      }
    ]
  },
  [ProjectPermissionSub.SecretScanningDataSources]: {
    title: "Secret Scanning Data Sources",
    actions: [
      {
        label: "Read Data Sources",
        value: ProjectPermissionSecretScanningDataSourceActions.Read
      },
      {
        label: "Create Data Sources",
        value: ProjectPermissionSecretScanningDataSourceActions.Create
      },
      {
        label: "Modify Data Sources",
        value: ProjectPermissionSecretScanningDataSourceActions.Edit
      },
      {
        label: "Delete Data Sources",
        value: ProjectPermissionSecretScanningDataSourceActions.Delete
      },
      {
        label: "Read Resources",
        value: ProjectPermissionSecretScanningDataSourceActions.ReadResources
      },
      {
        label: "Read Scans",
        value: ProjectPermissionSecretScanningDataSourceActions.ReadScans
      },
      {
        label: "Trigger Scans",
        value: ProjectPermissionSecretScanningDataSourceActions.TriggerScans
      }
    ]
  },
  [ProjectPermissionSub.SecretScanningFindings]: {
    title: "Secret Scanning Findings",
    actions: [
      {
        label: "Read Findings",
        value: ProjectPermissionSecretScanningFindingActions.Read
      },
      {
        label: "Update Findings",
        value: ProjectPermissionSecretScanningFindingActions.Update
      }
    ]
  },
  [ProjectPermissionSub.SecretScanningConfigs]: {
    title: "Secret Scanning Config",
    actions: [
      {
        label: "Read Config",
        value: ProjectPermissionSecretScanningConfigActions.Read
      },
      {
        label: "Update Config",
        value: ProjectPermissionSecretScanningConfigActions.Update
      }
    ]
  },
  [ProjectPermissionSub.SecretEvents]: {
    title: "Secret Events",
    actions: [
      {
        label: "Subscribe on Created",
        value: ProjectPermissionSecretEventActions.SubscribeCreated
      },
      {
        label: "Subscribe on Deleted",
        value: ProjectPermissionSecretEventActions.SubscribeDeleted
      },
      {
        label: "Subscribe on Updated",
        value: ProjectPermissionSecretEventActions.SubscribeUpdated
      },
      {
        label: "Subscribe on Import Mutations",
        value: ProjectPermissionSecretEventActions.SubscribeImportMutations
      }
    ]
  },
  [ProjectPermissionSub.AppConnections]: {
    title: "App Connections",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionAppConnectionActions.Read
      },
      {
        label: "Create",
        value: ProjectPermissionAppConnectionActions.Create
      },
      {
        label: "Update",
        value: ProjectPermissionAppConnectionActions.Edit
      },
      {
        label: "Delete",
        value: ProjectPermissionAppConnectionActions.Delete
      },
      {
        label: "Connect",
        value: ProjectPermissionAppConnectionActions.Connect
      }
    ]
  },
  [ProjectPermissionSub.PamFolders]: {
    title: "Folders",
    actions: [
      { label: "Read", value: ProjectPermissionActions.Read },
      { label: "Create", value: ProjectPermissionActions.Create },
      { label: "Modify", value: ProjectPermissionActions.Edit },
      { label: "Remove", value: ProjectPermissionActions.Delete }
    ]
  },
  [ProjectPermissionSub.PamResources]: {
    title: "Resources",
    actions: [
      { label: "Read", value: ProjectPermissionActions.Read },
      { label: "Create", value: ProjectPermissionActions.Create },
      { label: "Modify", value: ProjectPermissionActions.Edit },
      { label: "Remove", value: ProjectPermissionActions.Delete }
    ]
  },
  [ProjectPermissionSub.PamAccounts]: {
    title: "Accounts",
    actions: [
      { label: "Access", value: ProjectPermissionPamAccountActions.Access },
      { label: "Read", value: ProjectPermissionPamAccountActions.Read },
      { label: "Create", value: ProjectPermissionPamAccountActions.Create },
      { label: "Modify", value: ProjectPermissionPamAccountActions.Edit },
      { label: "Remove", value: ProjectPermissionPamAccountActions.Delete }
    ]
  },
  [ProjectPermissionSub.PamSessions]: {
    title: "Sessions",
    actions: [{ label: "Read", value: ProjectPermissionPamSessionActions.Read }]
  }
};

const SharedPermissionSubjects = {
  [ProjectPermissionSub.AuditLogs]: true,
  [ProjectPermissionSub.Groups]: true,
  [ProjectPermissionSub.Member]: true,
  [ProjectPermissionSub.Identity]: true,
  [ProjectPermissionSub.Project]: true,
  [ProjectPermissionSub.Role]: true,
  [ProjectPermissionSub.Settings]: true
};

const SecretsManagerPermissionSubjects = (enabled = false) => ({
  [ProjectPermissionSub.SecretFolders]: enabled,
  [ProjectPermissionSub.SecretImports]: enabled,
  [ProjectPermissionSub.DynamicSecrets]: enabled,
  [ProjectPermissionSub.Secrets]: enabled,
  [ProjectPermissionSub.SecretApproval]: enabled,
  [ProjectPermissionSub.Integrations]: enabled,
  [ProjectPermissionSub.SecretSyncs]: enabled,
  [ProjectPermissionSub.Kms]: enabled,
  [ProjectPermissionSub.Environments]: enabled,
  [ProjectPermissionSub.Tags]: enabled,
  [ProjectPermissionSub.Webhooks]: enabled,
  [ProjectPermissionSub.IpAllowList]: enabled,
  [ProjectPermissionSub.SecretRollback]: enabled,
  [ProjectPermissionSub.SecretRotation]: enabled,
  [ProjectPermissionSub.ServiceTokens]: enabled,
  [ProjectPermissionSub.Commits]: enabled,
  [ProjectPermissionSub.SecretEvents]: enabled
});

const KmsPermissionSubjects = (enabled = false) => ({
  [ProjectPermissionSub.Cmek]: enabled,
  [ProjectPermissionSub.Kmip]: enabled
});

const CertificateManagerPermissionSubjects = (enabled = false) => ({
  [ProjectPermissionSub.PkiCollections]: enabled,
  [ProjectPermissionSub.PkiAlerts]: enabled,
  [ProjectPermissionSub.PkiSubscribers]: enabled,
  [ProjectPermissionSub.PkiSyncs]: enabled,
  [ProjectPermissionSub.CertificateAuthorities]: enabled,
  [ProjectPermissionSub.CertificateTemplates]: enabled,
  [ProjectPermissionSub.CertificateProfiles]: enabled,
  [ProjectPermissionSub.Certificates]: enabled
});

const SshPermissionSubjects = (enabled = false) => ({
  [ProjectPermissionSub.SshCertificateAuthorities]: enabled,
  [ProjectPermissionSub.SshCertificates]: enabled,
  [ProjectPermissionSub.SshCertificateTemplates]: enabled,
  [ProjectPermissionSub.SshHosts]: enabled,
  [ProjectPermissionSub.SshHostGroups]: enabled
});

const SecretScanningSubject = (enabled = false) => ({
  [ProjectPermissionSub.SecretScanningDataSources]: enabled,
  [ProjectPermissionSub.SecretScanningFindings]: enabled,
  [ProjectPermissionSub.SecretScanningConfigs]: enabled
});

const PamPermissionSubjects = (enabled = false) => ({
  [ProjectPermissionSub.PamFolders]: enabled,
  [ProjectPermissionSub.PamResources]: enabled,
  [ProjectPermissionSub.PamAccounts]: enabled,
  [ProjectPermissionSub.PamSessions]: enabled
});

// scott: this structure ensures we don't forget to add project permissions to their relevant project type
export const ProjectTypePermissionSubjects: Record<
  ProjectType,
  Record<ProjectPermissionSub, boolean>
> = {
  [ProjectType.SecretManager]: {
    ...SharedPermissionSubjects,
    ...SecretsManagerPermissionSubjects(true),
    ...KmsPermissionSubjects(),
    ...CertificateManagerPermissionSubjects(),
    ...SshPermissionSubjects(),
    ...SecretScanningSubject(),
    ...PamPermissionSubjects(),
    [ProjectPermissionSub.AppConnections]: true
  },
  [ProjectType.KMS]: {
    ...SharedPermissionSubjects,
    ...KmsPermissionSubjects(true),
    ...SecretsManagerPermissionSubjects(),
    ...CertificateManagerPermissionSubjects(),
    ...SshPermissionSubjects(),
    ...SecretScanningSubject(),
    ...PamPermissionSubjects(),
    [ProjectPermissionSub.AppConnections]: false
  },
  [ProjectType.CertificateManager]: {
    ...SharedPermissionSubjects,
    ...CertificateManagerPermissionSubjects(true),
    ...KmsPermissionSubjects(),
    ...SecretsManagerPermissionSubjects(),
    ...SshPermissionSubjects(),
    ...SecretScanningSubject(),
    ...PamPermissionSubjects(),
    [ProjectPermissionSub.AppConnections]: true
  },
  [ProjectType.SSH]: {
    ...SharedPermissionSubjects,
    ...SshPermissionSubjects(true),
    ...CertificateManagerPermissionSubjects(),
    ...KmsPermissionSubjects(),
    ...SecretsManagerPermissionSubjects(),
    ...SecretScanningSubject(),
    ...PamPermissionSubjects(),
    [ProjectPermissionSub.AppConnections]: false
  },
  [ProjectType.SecretScanning]: {
    ...SharedPermissionSubjects,
    ...SecretScanningSubject(true),
    ...SshPermissionSubjects(),
    ...CertificateManagerPermissionSubjects(),
    ...KmsPermissionSubjects(),
    ...SecretsManagerPermissionSubjects(),
    ...PamPermissionSubjects(),
    [ProjectPermissionSub.AppConnections]: true
  },
  [ProjectType.PAM]: {
    ...SharedPermissionSubjects,
    ...SecretScanningSubject(),
    ...SshPermissionSubjects(),
    ...CertificateManagerPermissionSubjects(),
    ...KmsPermissionSubjects(),
    ...SecretsManagerPermissionSubjects(),
    ...PamPermissionSubjects(true),
    [ProjectPermissionSub.AppConnections]: false
  },
  [ProjectType.AI]: {
    ...SharedPermissionSubjects,
    ...SecretsManagerPermissionSubjects(),
    ...KmsPermissionSubjects(),
    ...CertificateManagerPermissionSubjects(),
    ...SshPermissionSubjects(),
    ...SecretScanningSubject(),
    ...PamPermissionSubjects(),
    [ProjectPermissionSub.AppConnections]: false
  }
};

export type RoleTemplate = {
  id: string;
  name: string;
  description: string;
  permissions: { subject: ProjectPermissionSub; actions: string[] }[];
};

const projectManagerTemplate = (
  additionalPermissions: RoleTemplate["permissions"] = []
): RoleTemplate => ({
  id: "project-manager",
  name: "Project Management Policies",
  description: "Grants access to manage project members and settings",
  permissions: [
    {
      subject: ProjectPermissionSub.AuditLogs,
      actions: Object.values(ProjectPermissionAuditLogsActions)
    },
    {
      subject: ProjectPermissionSub.Groups,
      actions: Object.values(ProjectPermissionGroupActions)
    },
    {
      subject: ProjectPermissionSub.Member,
      actions: Object.values(ProjectPermissionMemberActions)
    },
    {
      subject: ProjectPermissionSub.Identity,
      actions: Object.values(ProjectPermissionIdentityActions)
    },
    {
      subject: ProjectPermissionSub.Project,
      actions: [ProjectPermissionActions.Edit, ProjectPermissionActions.Delete]
    },
    { subject: ProjectPermissionSub.Role, actions: Object.values(ProjectPermissionActions) },
    {
      subject: ProjectPermissionSub.Settings,
      actions: [ProjectPermissionActions.Read, ProjectPermissionActions.Edit]
    },
    ...additionalPermissions
  ]
});

export const RoleTemplates: Record<ProjectType, RoleTemplate[]> = {
  [ProjectType.SSH]: [
    {
      id: "ssh-viewer",
      name: "SSH Viewing Policies",
      description: "Grants read access to SSH certificates and hosts",
      permissions: [
        {
          subject: ProjectPermissionSub.SshCertificateAuthorities,
          actions: [ProjectPermissionActions.Read]
        },
        {
          subject: ProjectPermissionSub.SshCertificates,
          actions: [ProjectPermissionActions.Read]
        },
        {
          subject: ProjectPermissionSub.SshCertificateTemplates,
          actions: [ProjectPermissionActions.Read]
        },
        {
          subject: ProjectPermissionSub.SshHosts,
          actions: [ProjectPermissionSshHostActions.Read]
        },
        {
          subject: ProjectPermissionSub.SshHostGroups,
          actions: [ProjectPermissionActions.Read]
        }
      ]
    },
    {
      id: "ssh-cert-editor",
      name: "SSH Certificate Editing Policies",
      description: "Grants read and edit access to SSH certificates",
      permissions: [
        {
          subject: ProjectPermissionSub.SshCertificateAuthorities,
          actions: Object.values(ProjectPermissionActions)
        },
        {
          subject: ProjectPermissionSub.SshCertificates,
          actions: Object.values(ProjectPermissionActions)
        },
        {
          subject: ProjectPermissionSub.SshCertificateTemplates,
          actions: Object.values(ProjectPermissionActions)
        }
      ]
    },
    {
      id: "ssh-host-editor",
      name: "SSH Host Editing Policies",
      description: "Grants read and edit access to SSH hosts",
      permissions: [
        {
          subject: ProjectPermissionSub.SshHosts,
          actions: Object.values(ProjectPermissionSshHostActions)
        },
        {
          subject: ProjectPermissionSub.SshHostGroups,
          actions: Object.values(ProjectPermissionActions)
        }
      ]
    },
    projectManagerTemplate()
  ],
  [ProjectType.KMS]: [
    {
      id: "kms-viewer",
      name: "KMS Viewing Policies",
      description: "Grants read access to KMS keys and KMIP clients",
      permissions: [
        {
          subject: ProjectPermissionSub.Cmek,
          actions: [ProjectPermissionCmekActions.Read]
        },
        {
          subject: ProjectPermissionSub.Kmip,
          actions: [ProjectPermissionKmipActions.ReadClients]
        }
      ]
    },
    {
      id: "key-editor",
      name: "KMS Key Editing Policies",
      description: "Grants read and edit access to KMS keys",
      permissions: [
        {
          subject: ProjectPermissionSub.Cmek,
          actions: Object.values(ProjectPermissionCmekActions)
        }
      ]
    },
    {
      id: "kmip-editor",
      name: "KMIP Client Editing Policies",
      description: "Grants read and edit access to KMIP clients",
      permissions: [
        {
          subject: ProjectPermissionSub.Kmip,
          actions: Object.values(ProjectPermissionKmipActions)
        }
      ]
    },
    projectManagerTemplate()
  ],
  [ProjectType.CertificateManager]: [
    {
      id: "cert-viewer",
      name: "Certificate Viewing Policies",
      description: "Grants read access to certificates and related resources",
      permissions: [
        {
          subject: ProjectPermissionSub.PkiCollections,
          actions: [ProjectPermissionActions.Read]
        },
        {
          subject: ProjectPermissionSub.PkiAlerts,
          actions: [ProjectPermissionActions.Read]
        },
        {
          subject: ProjectPermissionSub.CertificateAuthorities,
          actions: [ProjectPermissionActions.Read]
        },
        {
          subject: ProjectPermissionSub.CertificateTemplates,
          actions: [ProjectPermissionActions.Read]
        },
        {
          subject: ProjectPermissionSub.Certificates,
          actions: [
            ProjectPermissionCertificateActions.Read,
            ProjectPermissionCertificateActions.ReadPrivateKey
          ]
        },
        {
          subject: ProjectPermissionSub.PkiSyncs,
          actions: [ProjectPermissionPkiSyncActions.Read]
        },
        {
          subject: ProjectPermissionSub.CertificateProfiles,
          actions: [ProjectPermissionCertificateProfileActions.Read]
        }
      ]
    },
    {
      id: "cert-editor",
      name: "Certificate Editing Policies",
      description: "Grants read and edit access to certificates and related resources",
      permissions: [
        {
          subject: ProjectPermissionSub.PkiCollections,
          actions: Object.values(ProjectPermissionActions)
        },
        {
          subject: ProjectPermissionSub.PkiAlerts,
          actions: Object.values(ProjectPermissionActions)
        },
        {
          subject: ProjectPermissionSub.CertificateAuthorities,
          actions: Object.values(ProjectPermissionActions)
        },
        {
          subject: ProjectPermissionSub.CertificateTemplates,
          actions: Object.values(ProjectPermissionActions)
        },
        {
          subject: ProjectPermissionSub.Certificates,
          actions: Object.values(ProjectPermissionCertificateActions)
        },
        {
          subject: ProjectPermissionSub.PkiSyncs,
          actions: Object.values(ProjectPermissionPkiSyncActions)
        },
        {
          subject: ProjectPermissionSub.CertificateProfiles,
          actions: Object.values(ProjectPermissionCertificateProfileActions)
        }
      ]
    },
    projectManagerTemplate()
  ],
  [ProjectType.SecretScanning]: [
    {
      id: "scanning-viewer",
      name: "Secret Scanning Viewing Policies",
      description: "Grants read access to data sources and findings",
      permissions: [
        {
          subject: ProjectPermissionSub.SecretScanningDataSources,
          actions: [
            ProjectPermissionSecretScanningDataSourceActions.Read,
            ProjectPermissionSecretScanningDataSourceActions.ReadResources,
            ProjectPermissionSecretScanningDataSourceActions.ReadScans
          ]
        },
        {
          subject: ProjectPermissionSub.SecretScanningFindings,
          actions: [ProjectPermissionSecretScanningFindingActions.Read]
        },
        {
          subject: ProjectPermissionSub.SecretScanningConfigs,
          actions: [ProjectPermissionSecretScanningConfigActions.Read]
        }
      ]
    },
    {
      id: "scanning-editor",
      name: "Secret Scanning Editing Policies",
      description: "Grants read and edit access to data sources and findings",
      permissions: [
        {
          subject: ProjectPermissionSub.SecretScanningDataSources,
          actions: Object.values(ProjectPermissionSecretScanningDataSourceActions)
        },
        {
          subject: ProjectPermissionSub.SecretScanningFindings,
          actions: Object.values(ProjectPermissionSecretScanningFindingActions)
        },
        {
          subject: ProjectPermissionSub.SecretScanningConfigs,
          actions: [ProjectPermissionSecretScanningConfigActions.Read]
        }
      ]
    },
    projectManagerTemplate([
      {
        subject: ProjectPermissionSub.SecretScanningConfigs,
        actions: Object.values(ProjectPermissionSecretScanningConfigActions)
      }
    ])
  ],
  [ProjectType.SecretManager]: [
    {
      id: "secret-viewer",
      name: "Secret Viewing Policies",
      description: "Grants read access to secrets and related resources",
      permissions: [
        {
          subject: ProjectPermissionSub.SecretRollback,
          actions: [ProjectPermissionActions.Read]
        },
        {
          subject: ProjectPermissionSub.SecretImports,
          actions: [ProjectPermissionActions.Read]
        },
        {
          subject: ProjectPermissionSub.Secrets,
          actions: [
            ProjectPermissionSecretActions.DescribeSecret,
            ProjectPermissionSecretActions.ReadValue
          ]
        },
        {
          subject: ProjectPermissionSub.DynamicSecrets,
          actions: [ProjectPermissionDynamicSecretActions.ReadRootCredential]
        },
        {
          subject: ProjectPermissionSub.Environments,
          actions: [ProjectPermissionActions.Read]
        },
        {
          subject: ProjectPermissionSub.Tags,
          actions: [ProjectPermissionActions.Read]
        },
        {
          subject: ProjectPermissionSub.SecretRotation,
          actions: [ProjectPermissionSecretRotationActions.Read]
        },
        {
          subject: ProjectPermissionSub.Integrations,
          actions: [ProjectPermissionActions.Read]
        },
        {
          subject: ProjectPermissionSub.SecretSyncs,
          actions: [ProjectPermissionSecretSyncActions.Read]
        },
        {
          subject: ProjectPermissionSub.Commits,
          actions: [ProjectPermissionCommitsActions.Read]
        }
      ]
    },
    {
      id: "secret-editor",
      name: "Secret Editing Policies",
      description: "Grants read and edit access to secrets and related resources",
      permissions: [
        {
          subject: ProjectPermissionSub.Environments,
          actions: Object.values(ProjectPermissionActions)
        },
        {
          subject: ProjectPermissionSub.DynamicSecrets,
          actions: Object.values(ProjectPermissionDynamicSecretActions)
        },
        {
          subject: ProjectPermissionSub.Secrets,
          actions: [
            ProjectPermissionSecretActions.DescribeSecret,
            ProjectPermissionSecretActions.ReadValue,
            ProjectPermissionSecretActions.Edit,
            ProjectPermissionSecretActions.Create,
            ProjectPermissionSecretActions.Delete
          ]
        },
        {
          subject: ProjectPermissionSub.SecretRollback,
          actions: [ProjectPermissionActions.Read, ProjectPermissionActions.Create]
        },
        {
          subject: ProjectPermissionSub.Tags,
          actions: Object.values(ProjectPermissionActions)
        },
        {
          subject: ProjectPermissionSub.SecretImports,
          actions: Object.values(ProjectPermissionActions)
        },
        {
          subject: ProjectPermissionSub.SecretRotation,
          actions: Object.values(ProjectPermissionSecretRotationActions)
        },
        {
          subject: ProjectPermissionSub.SecretFolders,
          actions: [
            ProjectPermissionActions.Create,
            ProjectPermissionActions.Edit,
            ProjectPermissionActions.Delete
          ]
        },
        {
          subject: ProjectPermissionSub.Integrations,
          actions: Object.values(ProjectPermissionActions)
        },
        {
          subject: ProjectPermissionSub.SecretSyncs,
          actions: Object.values(ProjectPermissionSecretSyncActions)
        },
        {
          subject: ProjectPermissionSub.Commits,
          actions: Object.values(ProjectPermissionCommitsActions)
        }
      ]
    },
    projectManagerTemplate([
      {
        subject: ProjectPermissionSub.IpAllowList,
        actions: Object.values(ProjectPermissionActions)
      },
      {
        subject: ProjectPermissionSub.Kms,
        actions: [ProjectPermissionActions.Edit]
      },
      {
        subject: ProjectPermissionSub.SecretApproval,
        actions: Object.values(ProjectPermissionActions)
      },
      {
        subject: ProjectPermissionSub.ServiceTokens,
        actions: Object.values(ProjectPermissionActions)
      },
      {
        subject: ProjectPermissionSub.Webhooks,
        actions: Object.values(ProjectPermissionActions)
      }
    ])
  ],
  [ProjectType.PAM]: [
    {
      id: "pam-viewer",
      name: "PAM Viewing Policies",
      description: "Grants read access to PAM accounts and resources",
      permissions: [
        {
          subject: ProjectPermissionSub.PamFolders,
          actions: [ProjectPermissionActions.Read]
        },
        {
          subject: ProjectPermissionSub.PamResources,
          actions: [ProjectPermissionActions.Read]
        },
        {
          subject: ProjectPermissionSub.PamAccounts,
          actions: [ProjectPermissionPamAccountActions.Read]
        }
      ]
    },
    {
      id: "pam-accessor",
      name: "PAM Accessing Policies",
      description: "Grants the right to access all PAM accounts",
      permissions: [
        {
          subject: ProjectPermissionSub.PamAccounts,
          actions: [
            ProjectPermissionPamAccountActions.Access,
            ProjectPermissionPamAccountActions.Read
          ]
        }
      ]
    },
    {
      id: "pam-editor",
      name: "PAM Editing Policies",
      description: "Grants read and edit access to PAM accounts and resources",
      permissions: [
        {
          subject: ProjectPermissionSub.PamFolders,
          actions: Object.values(ProjectPermissionActions)
        },
        {
          subject: ProjectPermissionSub.PamResources,
          actions: Object.values(ProjectPermissionActions)
        },
        {
          subject: ProjectPermissionSub.PamAccounts,
          actions: [
            ProjectPermissionPamAccountActions.Read,
            ProjectPermissionPamAccountActions.Edit,
            ProjectPermissionPamAccountActions.Create,
            ProjectPermissionPamAccountActions.Delete
          ]
        }
      ]
    },
    projectManagerTemplate()
  ],
  [ProjectType.AI]: [
    projectManagerTemplate()
  ]
};
