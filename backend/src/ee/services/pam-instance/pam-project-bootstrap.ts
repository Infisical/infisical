import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import { AccessScope, ProjectMembershipRole, ProjectType, ProjectVersion, TableName, TProjects } from "@app/db/schemas";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { PamAccountType } from "../pam/pam-enums";
import { TPamTemplateAccessPolicy, TPamTemplateSettings } from "../pam-account-template/pam-template-config-schemas";
import { PamRecordingStorageBackend } from "../pam-session-recording-storage/pam-session-recording-storage-enums";

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
  accessPolicy: TPamTemplateAccessPolicy;
  settings: TPamTemplateSettings;
};

const DEFAULT_ACCESS_POLICY: TPamTemplateAccessPolicy = {
  maxSessionDurationSeconds: 3600,
  requireReason: false,
  requireMfa: false
};

export const DEFAULT_ACCOUNT_TEMPLATES: TDefaultTemplate[] = [
  {
    name: "ssh",
    type: PamAccountType.SSH,
    accessPolicy: DEFAULT_ACCESS_POLICY,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres
    }
  },
  {
    name: "postgres",
    type: PamAccountType.Postgres,
    accessPolicy: DEFAULT_ACCESS_POLICY,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres,
      passwordConstraints: {
        minLength: 16,
        maxLength: 99,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSymbols: false
      }
    }
  },
  {
    name: "mysql",
    type: PamAccountType.MySQL,
    accessPolicy: DEFAULT_ACCESS_POLICY,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres,
      passwordConstraints: {
        minLength: 16,
        maxLength: 80,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSymbols: false
      }
    }
  },
  {
    name: "mssql",
    type: PamAccountType.MsSQL,
    accessPolicy: DEFAULT_ACCESS_POLICY,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres,
      passwordConstraints: {
        minLength: 16,
        maxLength: 128,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSymbols: true
      }
    }
  },
  {
    name: "oracledb",
    type: PamAccountType.OracleDB,
    accessPolicy: DEFAULT_ACCESS_POLICY,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres,
      passwordConstraints: {
        minLength: 16,
        maxLength: 30,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSymbols: true
      }
    }
  },
  {
    name: "mongodb",
    type: PamAccountType.MongoDB,
    accessPolicy: DEFAULT_ACCESS_POLICY,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres,
      passwordConstraints: {
        minLength: 16,
        maxLength: 128,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSymbols: false
      }
    }
  },
  {
    name: "redis",
    type: PamAccountType.Redis,
    accessPolicy: DEFAULT_ACCESS_POLICY,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres,
      passwordConstraints: {
        minLength: 16,
        maxLength: 128,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSymbols: false
      }
    }
  },
  {
    name: "kubernetes",
    type: PamAccountType.Kubernetes,
    accessPolicy: DEFAULT_ACCESS_POLICY,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres
    }
  },
  {
    name: "aws-iam",
    type: PamAccountType.AwsIam,
    accessPolicy: DEFAULT_ACCESS_POLICY,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.Postgres
    }
  },
  {
    name: "windows",
    type: PamAccountType.Windows,
    accessPolicy: DEFAULT_ACCESS_POLICY,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.AwsS3,
      passwordConstraints: {
        minLength: 14,
        maxLength: 127,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSymbols: true
      }
    }
  },
  {
    name: "active-directory",
    type: PamAccountType.ActiveDirectory,
    accessPolicy: DEFAULT_ACCESS_POLICY,
    settings: {
      recordingEnabled: true,
      recordingStorageBackend: PamRecordingStorageBackend.AwsS3,
      passwordConstraints: {
        minLength: 14,
        maxLength: 127,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSymbols: true
      }
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
      name: "Access Management",
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
      accessPolicy: JSON.stringify(template.accessPolicy),
      settings: JSON.stringify(template.settings)
    });
  }

  return { project, created: true };
};
