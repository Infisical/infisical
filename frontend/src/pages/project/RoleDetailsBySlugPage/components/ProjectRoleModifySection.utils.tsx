import { z } from "zod";

import {
  ProjectPermissionActions,
  ProjectPermissionCertificateActions,
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionCertificatePolicyActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionCmekActions,
  ProjectPermissionSub
} from "@app/context";
import {
  PermissionConditionOperators,
  ProjectPermissionAppConnectionActions,
  ProjectPermissionApprovalRequestActions,
  ProjectPermissionApprovalRequestGrantActions,
  ProjectPermissionAuditLogsActions,
  ProjectPermissionCommitsActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionKmipActions,
  ProjectPermissionMcpEndpointActions,
  ProjectPermissionMemberActions,
  ProjectPermissionPamAccountActions,
  ProjectPermissionPamSessionActions,
  ProjectPermissionPkiCertificateInstallationActions,
  ProjectPermissionPkiDiscoveryActions,
  ProjectPermissionPkiSubscriberActions,
  ProjectPermissionPkiSyncActions,
  ProjectPermissionPkiTemplateActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSecretApprovalRequestActions,
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
  [ProjectPermissionCertificateActions.ReadPrivateKey]: z.boolean().optional(),
  [ProjectPermissionCertificateActions.Import]: z.boolean().optional()
});

const CertificateAuthorityPolicyActionSchema = z.object({
  [ProjectPermissionCertificateAuthorityActions.Create]: z.boolean().optional(),
  [ProjectPermissionCertificateAuthorityActions.Delete]: z.boolean().optional(),
  [ProjectPermissionCertificateAuthorityActions.Edit]: z.boolean().optional(),
  [ProjectPermissionCertificateAuthorityActions.Read]: z.boolean().optional(),
  [ProjectPermissionCertificateAuthorityActions.IssueCACertificate]: z.boolean().optional(),
  [ProjectPermissionCertificateAuthorityActions.SignIntermediate]: z.boolean().optional()
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
  [ProjectPermissionCmekActions.Read]: z.boolean().optional(),
  [ProjectPermissionCmekActions.Edit]: z.boolean().optional(),
  [ProjectPermissionCmekActions.Delete]: z.boolean().optional(),
  [ProjectPermissionCmekActions.Create]: z.boolean().optional(),
  [ProjectPermissionCmekActions.Encrypt]: z.boolean().optional(),
  [ProjectPermissionCmekActions.Decrypt]: z.boolean().optional(),
  [ProjectPermissionCmekActions.Sign]: z.boolean().optional(),
  [ProjectPermissionCmekActions.Verify]: z.boolean().optional(),
  [ProjectPermissionCmekActions.ExportPrivateKey]: z.boolean().optional()
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
  [ProjectPermissionPkiSubscriberActions.ListCerts]: z.boolean().optional()
});

const PkiTemplatePolicyActionSchema = z.object({
  [ProjectPermissionPkiTemplateActions.Read]: z.boolean().optional(),
  [ProjectPermissionPkiTemplateActions.Create]: z.boolean().optional(),
  [ProjectPermissionPkiTemplateActions.Edit]: z.boolean().optional(),
  [ProjectPermissionPkiTemplateActions.Delete]: z.boolean().optional(),
  [ProjectPermissionPkiTemplateActions.ListCerts]: z.boolean().optional()
});
const CertificateProfilePolicyActionSchema = z.object({
  [ProjectPermissionCertificateProfileActions.Read]: z.boolean().optional(),
  [ProjectPermissionCertificateProfileActions.Create]: z.boolean().optional(),
  [ProjectPermissionCertificateProfileActions.Edit]: z.boolean().optional(),
  [ProjectPermissionCertificateProfileActions.Delete]: z.boolean().optional(),
  [ProjectPermissionCertificateProfileActions.IssueCert]: z.boolean().optional(),
  [ProjectPermissionCertificateProfileActions.RevealAcmeEabSecret]: z.boolean().optional(),
  [ProjectPermissionCertificateProfileActions.RotateAcmeEabSecret]: z.boolean().optional()
});

const CertificatePolicyPolicyActionSchema = z.object({
  [ProjectPermissionCertificatePolicyActions.Read]: z.boolean().optional(),
  [ProjectPermissionCertificatePolicyActions.Create]: z.boolean().optional(),
  [ProjectPermissionCertificatePolicyActions.Edit]: z.boolean().optional(),
  [ProjectPermissionCertificatePolicyActions.Delete]: z.boolean().optional()
});

const SecretEventsPolicyActionSchema = z.object({
  [ProjectPermissionSecretEventActions.SubscribeToCreationEvents]: z.boolean().optional(),
  [ProjectPermissionSecretEventActions.SubscribeToUpdateEvents]: z.boolean().optional(),
  [ProjectPermissionSecretEventActions.SubscribeToDeletionEvents]: z.boolean().optional(),
  [ProjectPermissionSecretEventActions.SubscribeToImportMutationEvents]: z.boolean().optional()
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

const McpEndpointPolicyActionSchema = z.object({
  [ProjectPermissionMcpEndpointActions.Read]: z.boolean().optional(),
  [ProjectPermissionMcpEndpointActions.Create]: z.boolean().optional(),
  [ProjectPermissionMcpEndpointActions.Edit]: z.boolean().optional(),
  [ProjectPermissionMcpEndpointActions.Delete]: z.boolean().optional(),
  [ProjectPermissionMcpEndpointActions.Connect]: z.boolean().optional()
});

const McpServerPolicyActionSchema = z.object({
  [ProjectPermissionActions.Read]: z.boolean().optional(),
  [ProjectPermissionActions.Create]: z.boolean().optional(),
  [ProjectPermissionActions.Edit]: z.boolean().optional(),
  [ProjectPermissionActions.Delete]: z.boolean().optional()
});

const McpActivityLogPolicyActionSchema = z.object({
  [ProjectPermissionActions.Read]: z.boolean().optional()
});

const ApprovalRequestPolicyActionSchema = z.object({
  [ProjectPermissionApprovalRequestActions.Read]: z.boolean().optional(),
  [ProjectPermissionApprovalRequestActions.Create]: z.boolean().optional()
});

const ApprovalRequestGrantPolicyActionSchema = z.object({
  [ProjectPermissionApprovalRequestGrantActions.Read]: z.boolean().optional(),
  [ProjectPermissionApprovalRequestGrantActions.Revoke]: z.boolean().optional()
});

const SecretApprovalRequestPolicyActionSchema = z.object({
  [ProjectPermissionSecretApprovalRequestActions.Read]: z.boolean().optional()
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
      [ProjectPermissionSub.CertificateAuthorities]: CertificateAuthorityPolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.Certificates]: CertificatePolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.PkiSubscribers]: PkiSubscriberPolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.PkiAlerts]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.PkiCollections]: GeneralPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.PkiDiscovery]: z
        .object({
          read: z.boolean().optional(),
          create: z.boolean().optional(),
          edit: z.boolean().optional(),
          delete: z.boolean().optional(),
          "run-scan": z.boolean().optional()
        })
        .array()
        .default([]),
      [ProjectPermissionSub.PkiCertificateInstallations]: z
        .object({
          read: z.boolean().optional(),
          edit: z.boolean().optional(),
          delete: z.boolean().optional()
        })
        .array()
        .default([]),
      [ProjectPermissionSub.CertificateTemplates]: PkiTemplatePolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.CertificateProfiles]: CertificateProfilePolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.CertificatePolicies]: CertificatePolicyPolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
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
      [ProjectPermissionSub.SecretEventSubscriptions]: SecretEventsPolicyActionSchema.extend({
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
      [ProjectPermissionSub.PamSessions]: PamSessionPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.McpEndpoints]: McpEndpointPolicyActionSchema.extend({
        inverted: z.boolean().optional(),
        conditions: ConditionSchema
      })
        .array()
        .default([]),
      [ProjectPermissionSub.McpServers]: McpServerPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.McpActivityLogs]: McpActivityLogPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.ApprovalRequests]: ApprovalRequestPolicyActionSchema.array().default(
        []
      ),
      [ProjectPermissionSub.ApprovalRequestGrants]:
        ApprovalRequestGrantPolicyActionSchema.array().default([]),
      [ProjectPermissionSub.SecretApprovalRequest]:
        SecretApprovalRequestPolicyActionSchema.array().default([])
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
  | ProjectPermissionSub.CertificateAuthorities
  | ProjectPermissionSub.Certificates
  | ProjectPermissionSub.CertificateProfiles
  | ProjectPermissionSub.CertificatePolicies
  | ProjectPermissionSub.SshHosts
  | ProjectPermissionSub.SecretRotation
  | ProjectPermissionSub.Identity
  | ProjectPermissionSub.SecretSyncs
  | ProjectPermissionSub.PkiSyncs
  | ProjectPermissionSub.SecretEventSubscriptions
  | ProjectPermissionSub.AppConnections
  | ProjectPermissionSub.PamAccounts
  | ProjectPermissionSub.McpEndpoints;

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
  subject === ProjectPermissionSub.CertificateAuthorities ||
  subject === ProjectPermissionSub.Certificates ||
  subject === ProjectPermissionSub.CertificateProfiles ||
  subject === ProjectPermissionSub.CertificatePolicies ||
  subject === ProjectPermissionSub.SecretSyncs ||
  subject === ProjectPermissionSub.PkiSyncs ||
  subject === ProjectPermissionSub.SecretEventSubscriptions ||
  subject === ProjectPermissionSub.AppConnections ||
  subject === ProjectPermissionSub.PamAccounts ||
  subject === ProjectPermissionSub.McpEndpoints;

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
        ProjectPermissionSub.SecretEventSubscriptions,
        ProjectPermissionSub.AppConnections,
        ProjectPermissionSub.PamFolders,
        ProjectPermissionSub.PamResources,
        ProjectPermissionSub.McpEndpoints,
        ProjectPermissionSub.McpServers,
        ProjectPermissionSub.McpActivityLogs
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

        if (subject === ProjectPermissionSub.SecretEventSubscriptions) {
          const canSubscribeCreate = action.includes(
            ProjectPermissionSecretEventActions.SubscribeToCreationEvents
          );
          const canSubscribeUpdate = action.includes(
            ProjectPermissionSecretEventActions.SubscribeToUpdateEvents
          );
          const canSubscribeDelete = action.includes(
            ProjectPermissionSecretEventActions.SubscribeToDeletionEvents
          );
          const canSubscribeImportMutations = action.includes(
            ProjectPermissionSecretEventActions.SubscribeToImportMutationEvents
          );

          // from above statement we are sure it won't be undefined
          formVal[subject]!.push({
            "subscribe-to-creation-events": canSubscribeCreate,
            "subscribe-to-deletion-events": canSubscribeDelete,
            "subscribe-to-update-events": canSubscribeUpdate,
            "subscribe-to-import-mutation-events": canSubscribeImportMutations,
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

        if (subject === ProjectPermissionSub.CertificateAuthorities) {
          const canRead = action.includes(ProjectPermissionCertificateAuthorityActions.Read);
          const canCreate = action.includes(ProjectPermissionCertificateAuthorityActions.Create);
          const canEdit = action.includes(ProjectPermissionCertificateAuthorityActions.Edit);
          const canDelete = action.includes(ProjectPermissionCertificateAuthorityActions.Delete);
          const canIssue = action.includes(
            ProjectPermissionCertificateAuthorityActions.IssueCACertificate
          );
          const canSignIntermediate = action.includes(
            ProjectPermissionCertificateAuthorityActions.SignIntermediate
          );

          // from above statement we are sure it won't be undefined
          formVal[subject]!.push({
            [ProjectPermissionCertificateAuthorityActions.Read]: canRead,
            [ProjectPermissionCertificateAuthorityActions.Create]: canCreate,
            [ProjectPermissionCertificateAuthorityActions.Edit]: canEdit,
            [ProjectPermissionCertificateAuthorityActions.Delete]: canDelete,
            [ProjectPermissionCertificateAuthorityActions.IssueCACertificate]: canIssue,
            [ProjectPermissionCertificateAuthorityActions.SignIntermediate]: canSignIntermediate,
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
      const canImport = action.includes(ProjectPermissionCertificateActions.Import);
      const canReadPrivateKey = action.includes(ProjectPermissionCertificateActions.ReadPrivateKey);

      if (!formVal[subject]) formVal[subject] = [];

      // from above statement we are sure it won't be undefined
      formVal[subject]!.push({
        [ProjectPermissionCertificateActions.Read]: canRead,
        [ProjectPermissionCertificateActions.Edit]: canEdit,
        [ProjectPermissionCertificateActions.Create]: canCreate,
        [ProjectPermissionCertificateActions.Delete]: canDelete,
        [ProjectPermissionCertificateActions.ReadPrivateKey]: canReadPrivateKey,
        [ProjectPermissionCertificateActions.Import]: canImport,
        conditions: conditions ? convertCaslConditionToFormOperator(conditions) : [],
        inverted
      });
      return;
    }

    if (subject === ProjectPermissionSub.PkiDiscovery) {
      const canRead = action.includes(ProjectPermissionPkiDiscoveryActions.Read);
      const canCreate = action.includes(ProjectPermissionPkiDiscoveryActions.Create);
      const canEdit = action.includes(ProjectPermissionPkiDiscoveryActions.Edit);
      const canDelete = action.includes(ProjectPermissionPkiDiscoveryActions.Delete);
      const canRunScan = action.includes(ProjectPermissionPkiDiscoveryActions.RunScan);

      if (!formVal[subject]) formVal[subject] = [{}];

      if (canRead) formVal[subject]![0][ProjectPermissionPkiDiscoveryActions.Read] = true;
      if (canCreate) formVal[subject]![0][ProjectPermissionPkiDiscoveryActions.Create] = true;
      if (canEdit) formVal[subject]![0][ProjectPermissionPkiDiscoveryActions.Edit] = true;
      if (canDelete) formVal[subject]![0][ProjectPermissionPkiDiscoveryActions.Delete] = true;
      if (canRunScan) formVal[subject]![0][ProjectPermissionPkiDiscoveryActions.RunScan] = true;
      return;
    }

    if (subject === ProjectPermissionSub.PkiCertificateInstallations) {
      const canRead = action.includes(ProjectPermissionPkiCertificateInstallationActions.Read);
      const canEdit = action.includes(ProjectPermissionPkiCertificateInstallationActions.Edit);
      const canDelete = action.includes(ProjectPermissionPkiCertificateInstallationActions.Delete);

      if (!formVal[subject]) formVal[subject] = [{}];

      if (canRead)
        formVal[subject]![0][ProjectPermissionPkiCertificateInstallationActions.Read] = true;
      if (canEdit)
        formVal[subject]![0][ProjectPermissionPkiCertificateInstallationActions.Edit] = true;
      if (canDelete)
        formVal[subject]![0][ProjectPermissionPkiCertificateInstallationActions.Delete] = true;
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
      const canExportPrivateKey = action.includes(ProjectPermissionCmekActions.ExportPrivateKey);

      if (!formVal[subject]) formVal[subject] = [{}];

      // from above statement we are sure it won't be undefined
      if (canRead) formVal[subject]![0][ProjectPermissionCmekActions.Read] = true;
      if (canEdit) formVal[subject]![0][ProjectPermissionCmekActions.Edit] = true;
      if (canCreate) formVal[subject]![0][ProjectPermissionCmekActions.Create] = true;
      if (canDelete) formVal[subject]![0][ProjectPermissionCmekActions.Delete] = true;
      if (canEncrypt) formVal[subject]![0][ProjectPermissionCmekActions.Encrypt] = true;
      if (canDecrypt) formVal[subject]![0][ProjectPermissionCmekActions.Decrypt] = true;
      if (canSign) formVal[subject]![0][ProjectPermissionCmekActions.Sign] = true;
      if (canVerify) formVal[subject]![0][ProjectPermissionCmekActions.Verify] = true;
      if (canExportPrivateKey)
        formVal[subject]![0][ProjectPermissionCmekActions.ExportPrivateKey] = true;
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
        ),
        [ProjectPermissionCertificateProfileActions.RevealAcmeEabSecret]: action.includes(
          ProjectPermissionCertificateProfileActions.RevealAcmeEabSecret
        ),
        [ProjectPermissionCertificateProfileActions.RotateAcmeEabSecret]: action.includes(
          ProjectPermissionCertificateProfileActions.RotateAcmeEabSecret
        ),
        conditions: conditions ? convertCaslConditionToFormOperator(conditions) : [],
        inverted
      });

      return;
    }

    if (subject === ProjectPermissionSub.CertificatePolicies) {
      if (!formVal[subject]) formVal[subject] = [];

      formVal[subject]!.push({
        [ProjectPermissionCertificatePolicyActions.Edit]: action.includes(
          ProjectPermissionCertificatePolicyActions.Edit
        ),
        [ProjectPermissionCertificatePolicyActions.Delete]: action.includes(
          ProjectPermissionCertificatePolicyActions.Delete
        ),
        [ProjectPermissionCertificatePolicyActions.Create]: action.includes(
          ProjectPermissionCertificatePolicyActions.Create
        ),
        [ProjectPermissionCertificatePolicyActions.Read]: action.includes(
          ProjectPermissionCertificatePolicyActions.Read
        ),
        conditions: conditions ? convertCaslConditionToFormOperator(conditions) : [],
        inverted
      });

      return;
    }

    if (subject === ProjectPermissionSub.PamAccounts) {
      if (!formVal[subject]) formVal[subject] = [];

      formVal[subject]!.push({
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

    if (subject === ProjectPermissionSub.McpEndpoints) {
      const canRead = action.includes(ProjectPermissionMcpEndpointActions.Read);
      const canCreate = action.includes(ProjectPermissionMcpEndpointActions.Create);
      const canEdit = action.includes(ProjectPermissionMcpEndpointActions.Edit);
      const canDelete = action.includes(ProjectPermissionMcpEndpointActions.Delete);
      const canConnect = action.includes(ProjectPermissionMcpEndpointActions.Connect);

      if (!formVal[subject]) formVal[subject] = [];

      formVal[subject]!.push({
        [ProjectPermissionMcpEndpointActions.Read]: canRead,
        [ProjectPermissionMcpEndpointActions.Create]: canCreate,
        [ProjectPermissionMcpEndpointActions.Edit]: canEdit,
        [ProjectPermissionMcpEndpointActions.Delete]: canDelete,
        [ProjectPermissionMcpEndpointActions.Connect]: canConnect,
        conditions: conditions ? convertCaslConditionToFormOperator(conditions) : [],
        inverted
      });
    }

    if (subject === ProjectPermissionSub.McpServers) {
      const canRead = action.includes(ProjectPermissionActions.Read);
      const canCreate = action.includes(ProjectPermissionActions.Create);
      const canEdit = action.includes(ProjectPermissionActions.Edit);
      const canDelete = action.includes(ProjectPermissionActions.Delete);

      if (!formVal[subject]) formVal[subject] = [{}];

      if (canRead) formVal[subject]![0][ProjectPermissionActions.Read] = true;
      if (canCreate) formVal[subject]![0][ProjectPermissionActions.Create] = true;
      if (canEdit) formVal[subject]![0][ProjectPermissionActions.Edit] = true;
      if (canDelete) formVal[subject]![0][ProjectPermissionActions.Delete] = true;
    }

    if (subject === ProjectPermissionSub.McpActivityLogs) {
      const canRead = action.includes(ProjectPermissionActions.Read);

      if (!formVal[subject]) formVal[subject] = [{}];

      if (canRead) formVal[subject]![0][ProjectPermissionActions.Read] = true;
    }

    if (subject === ProjectPermissionSub.ApprovalRequests) {
      const canRead = action.includes(ProjectPermissionApprovalRequestActions.Read);
      const canCreate = action.includes(ProjectPermissionApprovalRequestActions.Create);

      if (!formVal[subject]) formVal[subject] = [{}];

      if (canRead) formVal[subject]![0][ProjectPermissionApprovalRequestActions.Read] = true;
      if (canCreate) formVal[subject]![0][ProjectPermissionApprovalRequestActions.Create] = true;
    }

    if (subject === ProjectPermissionSub.ApprovalRequestGrants) {
      const canRead = action.includes(ProjectPermissionApprovalRequestGrantActions.Read);
      const canRevoke = action.includes(ProjectPermissionApprovalRequestGrantActions.Revoke);

      if (!formVal[subject]) formVal[subject] = [{}];

      if (canRead) formVal[subject]![0][ProjectPermissionApprovalRequestGrantActions.Read] = true;
      if (canRevoke)
        formVal[subject]![0][ProjectPermissionApprovalRequestGrantActions.Revoke] = true;
    }

    if (subject === ProjectPermissionSub.SecretApprovalRequest) {
      const canRead = action.includes(ProjectPermissionSecretApprovalRequestActions.Read);

      if (!formVal[subject]) formVal[subject] = [{}];

      if (canRead) formVal[subject]![0][ProjectPermissionSecretApprovalRequestActions.Read] = true;
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
    description: string;
    actions: {
      label: string;
      description: string;
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
    description: "Manage secret values, metadata, and access within project environments",
    actions: [
      {
        label: "Read (legacy)",
        description:
          "This is a legacy action and will be removed in the future. Use Describe Secret and Read Value instead.",
        value: ProjectPermissionSecretActions.DescribeAndReadValue
      },
      {
        label: "Describe Secret",
        description:
          "View secret metadata (name, tags, etc.) without revealing the actual secret value",
        value: ProjectPermissionSecretActions.DescribeSecret
      },
      {
        label: "Read Value",
        description: "Access and view the actual secret value",
        value: ProjectPermissionSecretActions.ReadValue
      },
      {
        label: "Modify",
        description: "Edit existing secrets and their values",
        value: ProjectPermissionSecretActions.Edit
      },
      {
        label: "Remove",
        description: "Delete secrets from the project",
        value: ProjectPermissionSecretActions.Delete
      },
      {
        label: "Create",
        description: "Create new secrets in the project",
        value: ProjectPermissionSecretActions.Create
      }
    ]
  },
  [ProjectPermissionSub.SecretFolders]: {
    title: "Secret Folders",
    description: "Organize secrets into hierarchical folder structures",
    actions: [
      { label: "Create", value: "create", description: "Create new folders to organize secrets" },
      { label: "Modify", value: "edit", description: "Rename or modify folder properties" },
      { label: "Remove", value: "delete", description: "Delete folders and their contents" }
    ]
  },
  [ProjectPermissionSub.SecretImports]: {
    title: "Secret Imports",
    description: "Import and reference secrets from other environments or projects",
    actions: [
      { label: "Read", value: "read", description: "View imported secrets from other projects" },
      { label: "Create", value: "create", description: "Set up new secret imports" },
      { label: "Modify", value: "edit", description: "Change import configuration" },
      { label: "Remove", value: "delete", description: "Remove secret imports" }
    ]
  },
  [ProjectPermissionSub.DynamicSecrets]: {
    title: "Dynamic Secrets",
    description: "Configure auto-rotating credentials for databases and services",
    actions: [
      {
        label: "Read Root Credentials",
        value: ProjectPermissionDynamicSecretActions.ReadRootCredential,
        description: "View the root credentials used for dynamic secret generation"
      },
      {
        label: "Create Root Credentials",
        value: ProjectPermissionDynamicSecretActions.CreateRootCredential,
        description: "Configure new root credentials for dynamic secrets"
      },
      {
        label: "Modify Root Credentials",
        value: ProjectPermissionDynamicSecretActions.EditRootCredential,
        description: "Update existing root credentials configuration"
      },
      {
        label: "Remove Root Credentials",
        value: ProjectPermissionDynamicSecretActions.DeleteRootCredential,
        description: "Delete root credentials configuration"
      },
      {
        label: "Manage Leases",
        value: ProjectPermissionDynamicSecretActions.Lease,
        description: "Create and revoke dynamic secret leases"
      }
    ]
  },
  [ProjectPermissionSub.Cmek]: {
    title: "KMS",
    description: "Manage encryption keys and cryptographic operations",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionCmekActions.Read,
        description: "View KMS keys and their metadata"
      },
      {
        label: "Create",
        value: ProjectPermissionCmekActions.Create,
        description: "Create new KMS encryption keys"
      },
      {
        label: "Modify",
        value: ProjectPermissionCmekActions.Edit,
        description: "Update KMS key configuration"
      },
      {
        label: "Remove",
        value: ProjectPermissionCmekActions.Delete,
        description: "Delete KMS keys"
      },
      {
        label: "Encrypt",
        value: ProjectPermissionCmekActions.Encrypt,
        description: "Use KMS keys to encrypt data"
      },
      {
        label: "Decrypt",
        value: ProjectPermissionCmekActions.Decrypt,
        description: "Use KMS keys to decrypt data"
      },
      {
        label: "Sign",
        value: ProjectPermissionCmekActions.Sign,
        description: "Create cryptographic signatures using KMS keys"
      },
      {
        label: "Verify",
        value: ProjectPermissionCmekActions.Verify,
        description: "Verify signatures using KMS keys"
      },
      {
        label: "Export Private Key",
        value: ProjectPermissionCmekActions.ExportPrivateKey,
        description: "Export the private key from KMS (sensitive operation)"
      }
    ]
  },
  [ProjectPermissionSub.Kms]: {
    title: "Project KMS Configuration",
    description: "Configure key management system settings for the project",
    actions: [
      {
        label: "Modify",
        value: "edit",
        description: "Change KMS configuration settings for the project"
      }
    ]
  },
  [ProjectPermissionSub.Integrations]: {
    title: "Native Integrations",
    description: "Connect secrets to third-party services and platforms",
    actions: [
      { label: "Read", value: "read", description: "View configured integrations" },
      {
        label: "Create",
        value: "create",
        description: "Set up new integrations with external services"
      },
      { label: "Modify", value: "edit", description: "Update integration configuration" },
      { label: "Remove", value: "delete", description: "Delete integrations" }
    ]
  },
  [ProjectPermissionSub.Project]: {
    title: "Project",
    description: "Manage project settings, details, and lifecycle",
    actions: [
      {
        label: "Update project details",
        value: "edit",
        description: "Modify project name, description, and settings"
      },
      {
        label: "Delete project",
        value: "delete",
        description: "Permanently delete the entire project"
      }
    ]
  },
  [ProjectPermissionSub.Role]: {
    title: "Roles",
    description: "Define and configure custom permission roles",
    actions: [
      { label: "Read", value: "read", description: "View roles and their permissions" },
      { label: "Create", value: "create", description: "Create new custom roles" },
      { label: "Modify", value: "edit", description: "Update role permissions and policies" },
      { label: "Remove", value: "delete", description: "Delete custom roles" }
    ]
  },
  [ProjectPermissionSub.Member]: {
    title: "User Management",
    description: "Manage project member access and role assignments",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionMemberActions.Read,
        description: "View project members and their roles"
      },
      {
        label: "Add",
        value: ProjectPermissionMemberActions.Create,
        description: "Invite new users to the project"
      },
      {
        label: "Modify",
        value: ProjectPermissionMemberActions.Edit,
        description: "Change user roles and permissions"
      },
      {
        label: "Remove",
        value: ProjectPermissionMemberActions.Delete,
        description: "Remove users from the project"
      },
      {
        label: "Grant Privileges",
        value: ProjectPermissionMemberActions.GrantPrivileges,
        description: "Grant temporary elevated privileges to users"
      },
      {
        label: "Assume Privileges",
        value: ProjectPermissionMemberActions.AssumePrivileges,
        description: "Temporarily assume another user's privileges"
      }
    ]
  },
  [ProjectPermissionSub.Identity]: {
    title: "Machine Identity Management",
    description: "Manage machine identities and their access to secrets",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionIdentityActions.Read,
        description: "View machine identities and their configuration"
      },
      {
        label: "Add",
        value: ProjectPermissionIdentityActions.Create,
        description: "Create new machine identities for automation"
      },
      {
        label: "Modify",
        value: ProjectPermissionIdentityActions.Edit,
        description: "Update machine identity settings"
      },
      {
        label: "Remove",
        value: ProjectPermissionIdentityActions.Delete,
        description: "Delete machine identities"
      },
      {
        label: "Grant Privileges",
        value: ProjectPermissionIdentityActions.GrantPrivileges,
        description: "Grant temporary elevated privileges to machine identities"
      },
      {
        label: "Assume Privileges",
        value: ProjectPermissionIdentityActions.AssumePrivileges,
        description: "Temporarily assume another identity's privileges"
      },
      {
        label: "Revoke Auth",
        value: ProjectPermissionIdentityActions.RevokeAuth,
        description: "Revoke authentication for a machine identity"
      },
      {
        label: "Create Token",
        value: ProjectPermissionIdentityActions.CreateToken,
        description: "Generate access tokens for machine identities"
      },
      {
        label: "Get Token",
        value: ProjectPermissionIdentityActions.GetToken,
        description: "View existing access tokens"
      },
      {
        label: "Delete Token",
        value: ProjectPermissionIdentityActions.DeleteToken,
        description: "Revoke access tokens"
      }
    ]
  },
  [ProjectPermissionSub.Groups]: {
    title: "Group Management",
    description: "Organize users into groups for bulk permission management",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionGroupActions.Read,
        description: "View groups and their members"
      },
      {
        label: "Create",
        value: ProjectPermissionGroupActions.Create,
        description: "Create new user groups"
      },
      {
        label: "Modify",
        value: ProjectPermissionGroupActions.Edit,
        description: "Update group membership and settings"
      },
      {
        label: "Remove",
        value: ProjectPermissionGroupActions.Delete,
        description: "Delete groups"
      },
      {
        label: "Grant Privileges",
        value: ProjectPermissionGroupActions.GrantPrivileges,
        description: "Grant temporary elevated privileges to groups"
      }
    ]
  },
  [ProjectPermissionSub.Webhooks]: {
    title: "Webhooks",
    description: "Configure automated notifications for secret events",
    actions: [
      { label: "Read", value: "read", description: "View configured webhooks" },
      {
        label: "Create",
        value: "create",
        description: "Set up new webhooks for event notifications"
      },
      { label: "Modify", value: "edit", description: "Update webhook configuration and triggers" },
      { label: "Remove", value: "delete", description: "Delete webhooks" }
    ]
  },
  [ProjectPermissionSub.ServiceTokens]: {
    title: "Service Tokens",
    description: "Create and manage tokens for programmatic access",
    actions: [
      { label: "Read", value: "read", description: "View service tokens" },
      {
        label: "Create",
        value: "create",
        description: "Generate new service tokens for API access"
      },
      { label: "Modify", value: "edit", description: "Update service token configuration" },
      { label: "Remove", value: "delete", description: "Revoke service tokens" }
    ]
  },
  [ProjectPermissionSub.Settings]: {
    title: "Settings",
    description: "Configure project-level settings and preferences",
    actions: [
      { label: "Read", value: "read", description: "View project settings" },
      { label: "Modify", value: "edit", description: "Change project settings and configuration" }
    ]
  },
  [ProjectPermissionSub.Environments]: {
    title: "Environment Management",
    description: "Create and manage project environments",
    actions: [
      { label: "Read", value: "read", description: "View environments (dev, staging, prod, etc.)" },
      { label: "Create", value: "create", description: "Create new environments" },
      { label: "Modify", value: "edit", description: "Update environment configuration" },
      { label: "Remove", value: "delete", description: "Delete environments" }
    ]
  },
  [ProjectPermissionSub.Commits]: {
    title: "Commits",
    description: "View and manage secret version history",
    actions: [
      {
        label: "View",
        value: ProjectPermissionCommitsActions.Read,
        description: "View secret change history and commits"
      },
      {
        label: "Perform Rollback",
        value: ProjectPermissionCommitsActions.PerformRollback,
        description: "Rollback secrets to a previous commit"
      }
    ]
  },
  [ProjectPermissionSub.Tags]: {
    title: "Tags",
    description: "Organize and categorize secrets with labels",
    actions: [
      { label: "Read", value: "read", description: "View secret tags" },
      { label: "Create", value: "create", description: "Create new tags for organizing secrets" },
      { label: "Modify", value: "edit", description: "Update tag properties" },
      { label: "Remove", value: "delete", description: "Delete tags" }
    ]
  },
  [ProjectPermissionSub.AuditLogs]: {
    title: "Audit Logs",
    description: "View project activity and audit trail",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionAuditLogsActions.Read,
        description: "View audit logs and security events"
      }
    ]
  },
  [ProjectPermissionSub.IpAllowList]: {
    title: "IP Allowlist",
    description: "Restrict project access by IP address",
    actions: [
      { label: "Read", value: "read", description: "View IP allowlist configuration" },
      { label: "Create", value: "create", description: "Add IP addresses to the allowlist" },
      { label: "Modify", value: "edit", description: "Update IP allowlist entries" },
      { label: "Remove", value: "delete", description: "Remove IP addresses from the allowlist" }
    ]
  },
  [ProjectPermissionSub.CertificateAuthorities]: {
    title: "Certificate Authorities",
    description: "Manage PKI root and intermediate certificate authorities",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionCertificateAuthorityActions.Read,
        description: "View certificate authorities and their configuration"
      },
      {
        label: "Create",
        value: ProjectPermissionCertificateAuthorityActions.Create,
        description: "Create new certificate authorities"
      },
      {
        label: "Modify",
        value: ProjectPermissionCertificateAuthorityActions.Edit,
        description: "Update certificate authority settings"
      },
      {
        label: "Remove",
        value: ProjectPermissionCertificateAuthorityActions.Delete,
        description: "Delete certificate authorities"
      },
      {
        label: "Issue CA Certificate",
        value: ProjectPermissionCertificateAuthorityActions.IssueCACertificate,
        description: "Issue certificates from a certificate authority"
      },
      {
        label: "Sign Intermediate",
        value: ProjectPermissionCertificateAuthorityActions.SignIntermediate,
        description: "Sign intermediate CA certificates"
      }
    ]
  },
  [ProjectPermissionSub.Certificates]: {
    title: "Certificates",
    description: "Issue and manage X.509 certificates",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionCertificateActions.Read,
        description: "View certificates and their metadata"
      },
      {
        label: "Read Private Key",
        value: ProjectPermissionCertificateActions.ReadPrivateKey,
        description: "Access and view certificate private keys (sensitive operation)"
      },
      {
        label: "Import",
        value: ProjectPermissionCertificateActions.Import,
        description: "Import existing certificates into the system"
      },
      {
        label: "Modify",
        value: ProjectPermissionCertificateActions.Edit,
        description: "Update certificate properties"
      },
      {
        label: "Remove",
        value: ProjectPermissionCertificateActions.Delete,
        description: "Delete certificates"
      }
    ]
  },
  [ProjectPermissionSub.CertificateTemplates]: {
    title: "Certificate Templates",
    description: "Define templates for certificate issuance",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionPkiTemplateActions.Read,
        description: "View certificate templates and their configuration"
      },
      {
        label: "Create",
        value: ProjectPermissionPkiTemplateActions.Create,
        description: "Create new certificate templates"
      },
      {
        label: "Modify",
        value: ProjectPermissionPkiTemplateActions.Edit,
        description: "Update certificate template settings"
      },
      {
        label: "Remove",
        value: ProjectPermissionPkiTemplateActions.Delete,
        description: "Delete certificate templates"
      },
      {
        label: "List Certificates",
        value: ProjectPermissionPkiTemplateActions.ListCerts,
        description: "View certificates issued from a template"
      }
    ]
  },
  [ProjectPermissionSub.CertificateProfiles]: {
    title: "Certificate Profiles",
    description: "Configure certificate profile settings",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionCertificateProfileActions.Read,
        description: "View certificate profiles and their configuration"
      },
      {
        label: "Create",
        value: ProjectPermissionCertificateProfileActions.Create,
        description: "Create new certificate profiles"
      },
      {
        label: "Modify",
        value: ProjectPermissionCertificateProfileActions.Edit,
        description: "Update certificate profile settings"
      },
      {
        label: "Remove",
        value: ProjectPermissionCertificateProfileActions.Delete,
        description: "Delete certificate profiles"
      },
      {
        label: "Request Certificates",
        value: ProjectPermissionCertificateProfileActions.IssueCert,
        description: "Request new certificates using a profile"
      }
    ]
  },
  [ProjectPermissionSub.CertificatePolicies]: {
    title: "Certificate Policies",
    description: "Define policies for certificate lifecycle management",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionCertificatePolicyActions.Read,
        description: "View certificate policies and their rules"
      },
      {
        label: "Create",
        value: ProjectPermissionCertificatePolicyActions.Create,
        description: "Create new certificate policies"
      },
      {
        label: "Modify",
        value: ProjectPermissionCertificatePolicyActions.Edit,
        description: "Update certificate policy rules"
      },
      {
        label: "Remove",
        value: ProjectPermissionCertificatePolicyActions.Delete,
        description: "Delete certificate policies"
      }
    ]
  },
  [ProjectPermissionSub.SshCertificateAuthorities]: {
    title: "SSH Certificate Authorities",
    description: "Manage SSH CA for signing host and user certificates",
    actions: [
      { label: "Read", value: "read", description: "View SSH certificate authorities" },
      { label: "Create", value: "create", description: "Create new SSH certificate authorities" },
      { label: "Modify", value: "edit", description: "Update SSH CA configuration" },
      { label: "Remove", value: "delete", description: "Delete SSH certificate authorities" }
    ]
  },
  [ProjectPermissionSub.SshCertificates]: {
    title: "SSH Certificates",
    description: "Issue and manage SSH user certificates",
    actions: [
      { label: "Read", value: "read", description: "View SSH certificates" },
      { label: "Create", value: "create", description: "Issue new SSH certificates" },
      { label: "Modify", value: "edit", description: "Update SSH certificate properties" },
      { label: "Remove", value: "delete", description: "Revoke SSH certificates" }
    ]
  },
  [ProjectPermissionSub.SshCertificateTemplates]: {
    title: "SSH Certificate Templates",
    description: "Define templates for SSH certificate issuance",
    actions: [
      { label: "Read", value: "read", description: "View SSH certificate templates" },
      { label: "Create", value: "create", description: "Create new SSH certificate templates" },
      { label: "Modify", value: "edit", description: "Update SSH template configuration" },
      { label: "Remove", value: "delete", description: "Delete SSH certificate templates" }
    ]
  },
  [ProjectPermissionSub.SshHosts]: {
    title: "SSH Hosts",
    description: "Manage SSH host certificates and access",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionSshHostActions.Read,
        description: "View SSH hosts and their configuration"
      },
      {
        label: "Create",
        value: ProjectPermissionSshHostActions.Create,
        description: "Register new SSH hosts"
      },
      {
        label: "Modify",
        value: ProjectPermissionSshHostActions.Edit,
        description: "Update SSH host settings"
      },
      {
        label: "Remove",
        value: ProjectPermissionSshHostActions.Delete,
        description: "Remove SSH hosts"
      },
      {
        label: "Issue Host Certificate",
        value: ProjectPermissionSshHostActions.IssueHostCert,
        description: "Issue host certificates for SSH hosts"
      }
    ]
  },
  [ProjectPermissionSub.SshHostGroups]: {
    title: "SSH Host Groups",
    description: "Organize SSH hosts into groups",
    actions: [
      { label: "Read", value: "read", description: "View SSH host groups" },
      { label: "Create", value: "create", description: "Create new SSH host groups" },
      { label: "Modify", value: "edit", description: "Update SSH host group membership" },
      { label: "Remove", value: "delete", description: "Delete SSH host groups" }
    ]
  },
  [ProjectPermissionSub.PkiSubscribers]: {
    title: "PKI Subscribers",
    description: "Manage entities that receive certificates",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionPkiSubscriberActions.Read,
        description: "View PKI subscribers and their details"
      },
      {
        label: "Create",
        value: ProjectPermissionPkiSubscriberActions.Create,
        description: "Register new PKI subscribers"
      },
      {
        label: "Modify",
        value: ProjectPermissionPkiSubscriberActions.Edit,
        description: "Update subscriber configuration"
      },
      {
        label: "Remove",
        value: ProjectPermissionPkiSubscriberActions.Delete,
        description: "Remove PKI subscribers"
      },
      {
        label: "List Certificates",
        value: ProjectPermissionPkiSubscriberActions.ListCerts,
        description: "View certificates associated with a subscriber"
      }
    ]
  },
  [ProjectPermissionSub.PkiCollections]: {
    title: "PKI Collections",
    description: "Organize certificates into collections",
    actions: [
      { label: "Read", value: "read", description: "View PKI collections" },
      { label: "Create", value: "create", description: "Create new certificate collections" },
      { label: "Modify", value: "edit", description: "Update collection properties" },
      { label: "Remove", value: "delete", description: "Delete PKI collections" }
    ]
  },
  [ProjectPermissionSub.PkiAlerts]: {
    title: "PKI Alerts",
    description: "Configure certificate expiration and renewal alerts",
    actions: [
      { label: "Read", value: "read", description: "View PKI alerts and notifications" },
      { label: "Create", value: "create", description: "Set up new certificate expiration alerts" },
      { label: "Modify", value: "edit", description: "Update alert configuration" },
      { label: "Remove", value: "delete", description: "Delete PKI alerts" }
    ]
  },
  [ProjectPermissionSub.SecretApproval]: {
    title: "Secret Approval Policies",
    description: "Define approval workflows for secret access",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionActions.Read,
        description: "View secret approval policies"
      },
      {
        label: "Create",
        value: ProjectPermissionActions.Create,
        description: "Create new approval policies for secret changes"
      },
      {
        label: "Modify",
        value: ProjectPermissionActions.Edit,
        description: "Update approval policy rules"
      },
      {
        label: "Remove",
        value: ProjectPermissionActions.Delete,
        description: "Delete approval policies"
      }
    ]
  },
  [ProjectPermissionSub.SecretRotation]: {
    title: "Secret Rotation",
    description: "Configure automatic secret rotation policies",
    actions: [
      {
        label: "Read Config",
        value: ProjectPermissionSecretRotationActions.Read,
        description: "View secret rotation configurations"
      },
      {
        label: "Read Generated Credentials",
        value: ProjectPermissionSecretRotationActions.ReadGeneratedCredentials,
        description: "Access rotated credential values"
      },
      {
        label: "Create Config",
        value: ProjectPermissionSecretRotationActions.Create,
        description: "Set up new secret rotation schedules"
      },
      {
        label: "Modify Config",
        value: ProjectPermissionSecretRotationActions.Edit,
        description: "Update rotation configuration"
      },
      {
        label: "Remove Config",
        value: ProjectPermissionSecretRotationActions.Delete,
        description: "Delete rotation configurations"
      },
      {
        label: "Rotate Secrets",
        value: ProjectPermissionSecretRotationActions.RotateSecrets,
        description: "Manually trigger secret rotation"
      }
    ]
  },
  [ProjectPermissionSub.SecretRollback]: {
    title: "Secret Rollback",
    description: "Restore secrets to previous versions",
    actions: [
      {
        label: "Perform rollback",
        value: "create",
        description: "Rollback secrets to a previous version"
      },
      { label: "View", value: "read", description: "View rollback history" }
    ]
  },
  [ProjectPermissionSub.SecretSyncs]: {
    title: "Secret Syncs",
    description: "Sync secrets across environments and projects",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionSecretSyncActions.Read,
        description: "View secret sync configurations"
      },
      {
        label: "Create",
        value: ProjectPermissionSecretSyncActions.Create,
        description: "Set up new secret syncs to external destinations"
      },
      {
        label: "Modify",
        value: ProjectPermissionSecretSyncActions.Edit,
        description: "Update sync configuration"
      },
      {
        label: "Remove",
        value: ProjectPermissionSecretSyncActions.Delete,
        description: "Delete secret sync configurations"
      },
      {
        label: "Trigger Syncs",
        value: ProjectPermissionSecretSyncActions.SyncSecrets,
        description: "Manually trigger secret synchronization"
      },
      {
        label: "Import Secrets from Destination",
        value: ProjectPermissionSecretSyncActions.ImportSecrets,
        description: "Import secrets from the sync destination"
      },
      {
        label: "Remove Secrets from Destination",
        value: ProjectPermissionSecretSyncActions.RemoveSecrets,
        description: "Remove synced secrets from the destination"
      }
    ]
  },
  [ProjectPermissionSub.PkiSyncs]: {
    title: "Certificate Syncs",
    description: "Sync certificates across PKI instances",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionPkiSyncActions.Read,
        description: "View certificate sync configurations"
      },
      {
        label: "Create",
        value: ProjectPermissionPkiSyncActions.Create,
        description: "Set up new certificate syncs"
      },
      {
        label: "Modify",
        value: ProjectPermissionPkiSyncActions.Edit,
        description: "Update sync configuration"
      },
      {
        label: "Remove",
        value: ProjectPermissionPkiSyncActions.Delete,
        description: "Delete certificate sync configurations"
      },
      {
        label: "Trigger Syncs",
        value: ProjectPermissionPkiSyncActions.SyncCertificates,
        description: "Manually trigger certificate synchronization"
      },
      {
        label: "Import Certificates from Destination",
        value: ProjectPermissionPkiSyncActions.ImportCertificates,
        description: "Import certificates from the sync destination"
      },
      {
        label: "Remove Certificates from Destination",
        value: ProjectPermissionPkiSyncActions.RemoveCertificates,
        description: "Remove synced certificates from the destination"
      }
    ]
  },
  [ProjectPermissionSub.PkiDiscovery]: {
    title: "PKI Discovery",
    description: "Discover and inventory certificates",
    actions: [
      {
        label: "Read",
        value: "read",
        description: "View PKI discovery configurations and results"
      },
      { label: "Create", value: "create", description: "Set up new PKI discovery scans" },
      { label: "Modify", value: "edit", description: "Update discovery configuration" },
      { label: "Remove", value: "delete", description: "Delete PKI discovery configurations" },
      { label: "Run Scan", value: "run-scan", description: "Trigger a certificate discovery scan" }
    ]
  },
  [ProjectPermissionSub.PkiCertificateInstallations]: {
    title: "Certificate Installations",
    description: "Install certificates to target systems",
    actions: [
      { label: "Read", value: "read", description: "View certificate installation records" },
      { label: "Modify", value: "edit", description: "Update installation properties" },
      { label: "Remove", value: "delete", description: "Remove certificate installation records" }
    ]
  },
  [ProjectPermissionSub.Kmip]: {
    title: "KMIP",
    description: "Manage keys via KMIP protocol",
    actions: [
      {
        label: "Read Clients",
        value: ProjectPermissionKmipActions.ReadClients,
        description: "View KMIP clients and their configuration"
      },
      {
        label: "Create Clients",
        value: ProjectPermissionKmipActions.CreateClients,
        description: "Register new KMIP clients"
      },
      {
        label: "Modify Clients",
        value: ProjectPermissionKmipActions.UpdateClients,
        description: "Update KMIP client settings"
      },
      {
        label: "Delete Clients",
        value: ProjectPermissionKmipActions.DeleteClients,
        description: "Remove KMIP clients"
      },
      {
        label: "Generate Client Certificates",
        value: ProjectPermissionKmipActions.GenerateClientCertificates,
        description: "Generate authentication certificates for KMIP clients"
      }
    ]
  },
  [ProjectPermissionSub.SecretScanningDataSources]: {
    title: "Secret Scanning Data Sources",
    description: "Configure data sources for secret scanning",
    actions: [
      {
        label: "Read Data Sources",
        value: ProjectPermissionSecretScanningDataSourceActions.Read,
        description: "View configured data sources for secret scanning"
      },
      {
        label: "Create Data Sources",
        value: ProjectPermissionSecretScanningDataSourceActions.Create,
        description: "Add new repositories or sources to scan"
      },
      {
        label: "Modify Data Sources",
        value: ProjectPermissionSecretScanningDataSourceActions.Edit,
        description: "Update data source configuration"
      },
      {
        label: "Delete Data Sources",
        value: ProjectPermissionSecretScanningDataSourceActions.Delete,
        description: "Remove data sources from scanning"
      },
      {
        label: "Read Resources",
        value: ProjectPermissionSecretScanningDataSourceActions.ReadResources,
        description: "View discovered resources within data sources"
      },
      {
        label: "Read Scans",
        value: ProjectPermissionSecretScanningDataSourceActions.ReadScans,
        description: "View scan history and results"
      },
      {
        label: "Trigger Scans",
        value: ProjectPermissionSecretScanningDataSourceActions.TriggerScans,
        description: "Manually initiate secret scanning"
      }
    ]
  },
  [ProjectPermissionSub.SecretScanningFindings]: {
    title: "Secret Scanning Findings",
    description: "View and manage detected secret exposures",
    actions: [
      {
        label: "Read Findings",
        value: ProjectPermissionSecretScanningFindingActions.Read,
        description: "View detected secrets and vulnerabilities"
      },
      {
        label: "Update Findings",
        value: ProjectPermissionSecretScanningFindingActions.Update,
        description: "Mark findings as resolved or false positive"
      }
    ]
  },
  [ProjectPermissionSub.SecretScanningConfigs]: {
    title: "Secret Scanning Config",
    description: "Configure secret scanning rules and settings",
    actions: [
      {
        label: "Read Config",
        value: ProjectPermissionSecretScanningConfigActions.Read,
        description: "View secret scanning configuration"
      },
      {
        label: "Update Config",
        value: ProjectPermissionSecretScanningConfigActions.Update,
        description: "Modify scanning rules and settings"
      }
    ]
  },
  [ProjectPermissionSub.SecretEventSubscriptions]: {
    title: "Secret Event Subscriptions",
    description: "Subscribe to secret lifecycle events",
    actions: [
      {
        label: "Subscribe to Creation Events",
        value: ProjectPermissionSecretEventActions.SubscribeToCreationEvents,
        description: "Receive notifications when secrets are created"
      },
      {
        label: "Subscribe to Deletion Events",
        value: ProjectPermissionSecretEventActions.SubscribeToDeletionEvents,
        description: "Receive notifications when secrets are deleted"
      },
      {
        label: "Subscribe to Update Events",
        value: ProjectPermissionSecretEventActions.SubscribeToUpdateEvents,
        description: "Receive notifications when secrets are updated"
      },
      {
        label: "Subscribe to Import Mutation Events",
        value: ProjectPermissionSecretEventActions.SubscribeToImportMutationEvents,
        description: "Receive notifications when secret imports change"
      }
    ]
  },
  [ProjectPermissionSub.AppConnections]: {
    title: "App Connections",
    description: "Connect applications to access secrets",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionAppConnectionActions.Read,
        description: "View configured app connections"
      },
      {
        label: "Create",
        value: ProjectPermissionAppConnectionActions.Create,
        description: "Set up new connections to external applications"
      },
      {
        label: "Update",
        value: ProjectPermissionAppConnectionActions.Edit,
        description: "Modify app connection settings"
      },
      {
        label: "Delete",
        value: ProjectPermissionAppConnectionActions.Delete,
        description: "Remove app connections"
      },
      {
        label: "Connect",
        value: ProjectPermissionAppConnectionActions.Connect,
        description: "Establish connections to external applications"
      }
    ]
  },
  [ProjectPermissionSub.PamFolders]: {
    title: "Folders",
    description: "Organize PAM resources into folders",
    actions: [
      { label: "Read", value: ProjectPermissionActions.Read, description: "View PAM folders" },
      {
        label: "Create",
        value: ProjectPermissionActions.Create,
        description: "Create new PAM folders"
      },
      {
        label: "Modify",
        value: ProjectPermissionActions.Edit,
        description: "Update folder properties"
      },
      { label: "Remove", value: ProjectPermissionActions.Delete, description: "Delete PAM folders" }
    ]
  },
  [ProjectPermissionSub.PamResources]: {
    title: "Resources",
    description: "Manage privileged access resources",
    actions: [
      { label: "Read", value: ProjectPermissionActions.Read, description: "View PAM resources" },
      {
        label: "Create",
        value: ProjectPermissionActions.Create,
        description: "Add new resources to PAM"
      },
      {
        label: "Modify",
        value: ProjectPermissionActions.Edit,
        description: "Update resource configuration"
      },
      {
        label: "Remove",
        value: ProjectPermissionActions.Delete,
        description: "Remove PAM resources"
      }
    ]
  },
  [ProjectPermissionSub.PamAccounts]: {
    title: "Accounts",
    description: "Manage privileged account credentials",
    actions: [
      {
        label: "Access",
        value: ProjectPermissionPamAccountActions.Access,
        description: "Connect to and use PAM accounts"
      },
      {
        label: "Read",
        value: ProjectPermissionPamAccountActions.Read,
        description: "View PAM account details"
      },
      {
        label: "Create",
        value: ProjectPermissionPamAccountActions.Create,
        description: "Create new PAM accounts"
      },
      {
        label: "Modify",
        value: ProjectPermissionPamAccountActions.Edit,
        description: "Update PAM account settings"
      },
      {
        label: "Remove",
        value: ProjectPermissionPamAccountActions.Delete,
        description: "Delete PAM accounts"
      }
    ]
  },
  [ProjectPermissionSub.PamSessions]: {
    title: "Sessions",
    description: "View and manage privileged access sessions",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionPamSessionActions.Read,
        description: "View PAM session history and recordings"
      }
    ]
  },
  [ProjectPermissionSub.ApprovalRequests]: {
    title: "Approval Requests",
    description: "Manage and respond to access approval requests",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionApprovalRequestActions.Read,
        description: "View pending approval requests"
      },
      {
        label: "Create",
        value: ProjectPermissionApprovalRequestActions.Create,
        description: "Submit new approval requests"
      }
    ]
  },
  [ProjectPermissionSub.ApprovalRequestGrants]: {
    title: "Approval Request Grants",
    description: "Grant or deny approval requests for access",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionApprovalRequestGrantActions.Read,
        description: "View granted approval requests"
      },
      {
        label: "Revoke",
        value: ProjectPermissionApprovalRequestGrantActions.Revoke,
        description: "Revoke previously granted approvals"
      }
    ]
  },
  [ProjectPermissionSub.McpEndpoints]: {
    title: "MCP Endpoints",
    description: "Manage Model Context Protocol endpoints",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionMcpEndpointActions.Read,
        description: "View MCP endpoints"
      },
      {
        label: "Create",
        value: ProjectPermissionMcpEndpointActions.Create,
        description: "Create new MCP endpoints"
      },
      {
        label: "Modify",
        value: ProjectPermissionMcpEndpointActions.Edit,
        description: "Update endpoint configuration"
      },
      {
        label: "Remove",
        value: ProjectPermissionMcpEndpointActions.Delete,
        description: "Delete MCP endpoints"
      },
      {
        label: "Connect",
        value: ProjectPermissionMcpEndpointActions.Connect,
        description: "Connect to MCP endpoints"
      }
    ]
  },
  [ProjectPermissionSub.McpServers]: {
    title: "MCP Servers",
    description: "Configure MCP server connections",
    actions: [
      { label: "Read", value: ProjectPermissionActions.Read, description: "View MCP servers" },
      {
        label: "Create",
        value: ProjectPermissionActions.Create,
        description: "Register new MCP servers"
      },
      {
        label: "Modify",
        value: ProjectPermissionActions.Edit,
        description: "Update server configuration"
      },
      { label: "Remove", value: ProjectPermissionActions.Delete, description: "Remove MCP servers" }
    ]
  },
  [ProjectPermissionSub.McpActivityLogs]: {
    title: "MCP Activity Logs",
    description: "View MCP endpoint activity and usage",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionActions.Read,
        description: "View MCP activity and access logs"
      }
    ]
  },
  [ProjectPermissionSub.SecretApprovalRequest]: {
    title: "Secret Approval Requests",
    description: "Approve or deny requests to access secrets",
    actions: [
      {
        label: "Read",
        value: ProjectPermissionSecretApprovalRequestActions.Read,
        description: "View pending secret change requests"
      }
    ]
  }
};

const SharedPermissionSubjects = {
  [ProjectPermissionSub.AuditLogs]: true,
  [ProjectPermissionSub.Groups]: true,
  [ProjectPermissionSub.Member]: true,
  [ProjectPermissionSub.Identity]: true,
  [ProjectPermissionSub.Project]: true,
  [ProjectPermissionSub.Role]: true,
  [ProjectPermissionSub.Settings]: true,
  [ProjectPermissionSub.ApprovalRequests]: true,
  [ProjectPermissionSub.ApprovalRequestGrants]: true
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
  [ProjectPermissionSub.SecretEventSubscriptions]: enabled,
  [ProjectPermissionSub.SecretApprovalRequest]: enabled
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
  [ProjectPermissionSub.CertificateTemplates]: false, // Hidden from UI, accessible via API only
  [ProjectPermissionSub.CertificateProfiles]: enabled,
  [ProjectPermissionSub.CertificatePolicies]: enabled,
  [ProjectPermissionSub.Certificates]: enabled,
  [ProjectPermissionSub.PkiDiscovery]: enabled,
  [ProjectPermissionSub.PkiCertificateInstallations]: enabled
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

const AiPermissionSubjects = (enabled = false) => ({
  [ProjectPermissionSub.McpEndpoints]: enabled,
  [ProjectPermissionSub.McpServers]: enabled,
  [ProjectPermissionSub.McpActivityLogs]: enabled
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
    ...AiPermissionSubjects(),
    [ProjectPermissionSub.AppConnections]: true,
    // Approval Requests / Grants are not used in Secret Manager (secret approvals use SecretApproval policy)
    [ProjectPermissionSub.ApprovalRequests]: false,
    [ProjectPermissionSub.ApprovalRequestGrants]: false
  },
  [ProjectType.KMS]: {
    ...SharedPermissionSubjects,
    ...KmsPermissionSubjects(true),
    ...SecretsManagerPermissionSubjects(),
    ...CertificateManagerPermissionSubjects(),
    ...SshPermissionSubjects(),
    ...SecretScanningSubject(),
    ...PamPermissionSubjects(),
    ...AiPermissionSubjects(),
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
    ...AiPermissionSubjects(),
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
    ...AiPermissionSubjects(),
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
    ...AiPermissionSubjects(),
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
    ...AiPermissionSubjects(),
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
    ...AiPermissionSubjects(true),
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
  [ProjectType.AI]: [projectManagerTemplate()]
};
