import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import { AccessScope, ProjectMembershipRole, ProjectType, ProjectVersion, TableName, TProjects } from "@app/db/schemas";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { accountTypeSupportsSessionLogMasking, PamAccountType } from "../pam/pam-enums";
import { TPamTemplateSettings } from "../pam-account-template/pam-account-template-schemas";
import { PamRecordingStorageBackend } from "../pam-session-recording/pam-recording-enums";

type TBootstrapDeps = {
  projectDAL: Pick<TProjectDALFactory, "create" | "findOne">;
  membershipDAL: Pick<TMembershipDALFactory, "create">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create">;
};

type TBootstrapInput = {
  orgId: string;
  adminUserIds?: string[];
  adminIdentityIds?: string[];
  adminGroupIds?: string[];
};

export type TDefaultTemplate = {
  name: string;
  type: PamAccountType;
  settings: TPamTemplateSettings;
};

const defaultTemplateSettings = (type: PamAccountType): TPamTemplateSettings => ({
  recordingEnabled: true,
  recordingStorageBackend: PamRecordingStorageBackend.Postgres,
  // A seeded template is a new template, so masking starts on, as it does in `create`.
  sessionLogMaskingBuiltInDetection: accountTypeSupportsSessionLogMasking(type)
});

export const DEFAULT_ACCOUNT_TEMPLATES: TDefaultTemplate[] = (
  [
    { name: "ssh", type: PamAccountType.SSH },
    { name: "postgres", type: PamAccountType.Postgres },
    { name: "mysql", type: PamAccountType.MySQL },
    { name: "mssql", type: PamAccountType.MsSQL },
    { name: "oracledb", type: PamAccountType.OracleDB },
    { name: "mongodb", type: PamAccountType.MongoDB },
    { name: "redis", type: PamAccountType.Redis },
    { name: "kubernetes", type: PamAccountType.Kubernetes },
    { name: "aws-iam", type: PamAccountType.AwsIam },
    { name: "gcp-service-account", type: PamAccountType.GcpServiceAccount },
    { name: "azure-cli", type: PamAccountType.AzureCli },
    { name: "windows", type: PamAccountType.Windows },
    { name: "windows-ad", type: PamAccountType.WindowsAd },
    { name: "snowflake", type: PamAccountType.Snowflake }
  ] as const
).map(({ name, type }) => ({ name, type, settings: defaultTemplateSettings(type) }));

export const bootstrapPamProject = async (
  { orgId, adminUserIds = [], adminIdentityIds = [], adminGroupIds = [] }: TBootstrapInput,
  { projectDAL, membershipDAL, membershipRoleDAL }: TBootstrapDeps,
  tx: Knex
): Promise<{ project: TProjects; created: boolean }> => {
  const existing = await projectDAL.findOne({ orgId, type: ProjectType.PAM }, tx);
  if (existing) {
    return { project: existing, created: false };
  }

  const slug = slugify(`pam-${alphaNumericNanoId(4)}`);

  const project = await projectDAL.create(
    {
      name: "Privileged Access Manager",
      slug,
      type: ProjectType.PAM,
      orgId,
      version: ProjectVersion.V3,
      pitVersionLimit: 10
    },
    tx
  );

  const adminActors: Array<{ actorUserId: string } | { actorIdentityId: string } | { actorGroupId: string }> = [
    ...adminUserIds.map((actorUserId) => ({ actorUserId })),
    ...adminIdentityIds.map((actorIdentityId) => ({ actorIdentityId })),
    ...adminGroupIds.map((actorGroupId) => ({ actorGroupId }))
  ];

  for (const actor of adminActors) {
    // eslint-disable-next-line no-await-in-loop
    const membership = await membershipDAL.create(
      {
        scope: AccessScope.Project,
        scopeOrgId: orgId,
        scopeProjectId: project.id,
        ...actor,
        isActive: true
      },
      tx
    );

    // eslint-disable-next-line no-await-in-loop
    await membershipRoleDAL.create(
      {
        membershipId: membership.id,
        role: ProjectMembershipRole.Admin
      },
      tx
    );
  }

  for (const template of DEFAULT_ACCOUNT_TEMPLATES) {
    // eslint-disable-next-line no-await-in-loop
    await tx(TableName.PamAccountTemplate).insert({
      projectId: project.id,
      name: template.name,
      type: template.type,
      settings: template.settings
    });
  }

  return { project, created: true };
};
