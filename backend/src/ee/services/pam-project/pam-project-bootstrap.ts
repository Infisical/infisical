import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import { AccessScope, ProjectMembershipRole, ProjectType, ProjectVersion, TableName, TProjects } from "@app/db/schemas";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { PamAccountType } from "../pam/pam-enums";
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
};

export type TDefaultTemplate = {
  name: string;
  type: PamAccountType;
  settings: TPamTemplateSettings;
};

export const DEFAULT_ACCOUNT_TEMPLATES: TDefaultTemplate[] = [
  {
    name: "ssh",
    type: PamAccountType.SSH,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres
    }
  },
  {
    name: "postgres",
    type: PamAccountType.Postgres,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres
    }
  },
  {
    name: "mysql",
    type: PamAccountType.MySQL,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres
    }
  },
  {
    name: "mssql",
    type: PamAccountType.MsSQL,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres
    }
  },
  {
    name: "oracledb",
    type: PamAccountType.OracleDB,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres
    }
  },
  {
    name: "mongodb",
    type: PamAccountType.MongoDB,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres
    }
  },
  {
    name: "redis",
    type: PamAccountType.Redis,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres
    }
  },
  {
    name: "kubernetes",
    type: PamAccountType.Kubernetes,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres
    }
  },
  {
    name: "aws-iam",
    type: PamAccountType.AwsIam,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres
    }
  },
  {
    name: "windows",
    type: PamAccountType.Windows,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres
    }
  },
  {
    name: "windows-ad",
    type: PamAccountType.WindowsAd,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres
    }
  }
];

export const bootstrapPamProject = async (
  { orgId, adminUserIds = [], adminIdentityIds = [] }: TBootstrapInput,
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

  for (const userId of adminUserIds) {
    // eslint-disable-next-line no-await-in-loop
    const membership = await membershipDAL.create(
      {
        scope: AccessScope.Project,
        scopeOrgId: orgId,
        scopeProjectId: project.id,
        actorUserId: userId,
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

  for (const identityId of adminIdentityIds) {
    // eslint-disable-next-line no-await-in-loop
    const membership = await membershipDAL.create(
      {
        scope: AccessScope.Project,
        scopeOrgId: orgId,
        scopeProjectId: project.id,
        actorIdentityId: identityId,
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
