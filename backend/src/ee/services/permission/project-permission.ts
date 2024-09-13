import { AbilityBuilder, createMongoAbility, ForcedSubject, MongoAbility } from "@casl/ability";

import { conditionsMatcher } from "@app/lib/casl";
import { BadRequestError } from "@app/lib/errors";

export enum ProjectPermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum ProjectPermissionSub {
  Role = "role",
  Member = "member",
  Groups = "groups",
  Settings = "settings",
  Integrations = "integrations",
  Webhooks = "webhooks",
  ServiceTokens = "service-tokens",
  Environments = "environments",
  Tags = "tags",
  AuditLogs = "audit-logs",
  IpAllowList = "ip-allowlist",
  Project = "workspace",
  Secrets = "secrets",
  SecretFolders = "secret-folders",
  SecretRollback = "secret-rollback",
  SecretApproval = "secret-approval",
  SecretRotation = "secret-rotation",
  Identity = "identity",
  CertificateAuthorities = "certificate-authorities",
  Certificates = "certificates",
  CertificateTemplates = "certificate-templates",
  PkiAlerts = "pki-alerts",
  PkiCollections = "pki-collections",
  Kms = "kms"
}

type SubjectFields = {
  environment: string;
  secretPath: string;
};

export type ProjectPermissionSet =
  | [
      ProjectPermissionActions,
      ProjectPermissionSub.Secrets | (ForcedSubject<ProjectPermissionSub.Secrets> & SubjectFields)
    ]
  | [
      ProjectPermissionActions,
      ProjectPermissionSub.SecretFolders | (ForcedSubject<ProjectPermissionSub.SecretFolders> & SubjectFields)
    ]
  | [ProjectPermissionActions, ProjectPermissionSub.Role]
  | [ProjectPermissionActions, ProjectPermissionSub.Tags]
  | [ProjectPermissionActions, ProjectPermissionSub.Member]
  | [ProjectPermissionActions, ProjectPermissionSub.Groups]
  | [ProjectPermissionActions, ProjectPermissionSub.Integrations]
  | [ProjectPermissionActions, ProjectPermissionSub.Webhooks]
  | [ProjectPermissionActions, ProjectPermissionSub.AuditLogs]
  | [ProjectPermissionActions, ProjectPermissionSub.Environments]
  | [ProjectPermissionActions, ProjectPermissionSub.IpAllowList]
  | [ProjectPermissionActions, ProjectPermissionSub.Settings]
  | [ProjectPermissionActions, ProjectPermissionSub.ServiceTokens]
  | [ProjectPermissionActions, ProjectPermissionSub.SecretApproval]
  | [ProjectPermissionActions, ProjectPermissionSub.SecretRotation]
  | [ProjectPermissionActions, ProjectPermissionSub.Identity]
  | [ProjectPermissionActions, ProjectPermissionSub.CertificateAuthorities]
  | [ProjectPermissionActions, ProjectPermissionSub.Certificates]
  | [ProjectPermissionActions, ProjectPermissionSub.CertificateTemplates]
  | [ProjectPermissionActions, ProjectPermissionSub.PkiAlerts]
  | [ProjectPermissionActions, ProjectPermissionSub.PkiCollections]
  | [ProjectPermissionActions.Delete, ProjectPermissionSub.Project]
  | [ProjectPermissionActions.Edit, ProjectPermissionSub.Project]
  | [ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback]
  | [ProjectPermissionActions.Create, ProjectPermissionSub.SecretRollback]
  | [ProjectPermissionActions.Edit, ProjectPermissionSub.Kms];

export const fullProjectPermissionSet: [ProjectPermissionActions, ProjectPermissionSub][] = [
  [ProjectPermissionActions.Read, ProjectPermissionSub.Secrets],
  [ProjectPermissionActions.Create, ProjectPermissionSub.Secrets],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.Secrets],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.Secrets],

  [ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval],
  [ProjectPermissionActions.Create, ProjectPermissionSub.SecretApproval],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.SecretApproval],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.SecretApproval],

  [ProjectPermissionActions.Read, ProjectPermissionSub.SecretRotation],
  [ProjectPermissionActions.Create, ProjectPermissionSub.SecretRotation],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.SecretRotation],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.SecretRotation],

  [ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback],
  [ProjectPermissionActions.Create, ProjectPermissionSub.SecretRollback],

  [ProjectPermissionActions.Read, ProjectPermissionSub.Member],
  [ProjectPermissionActions.Create, ProjectPermissionSub.Member],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.Member],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.Member],

  [ProjectPermissionActions.Read, ProjectPermissionSub.Groups],
  [ProjectPermissionActions.Create, ProjectPermissionSub.Groups],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.Groups],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.Groups],

  [ProjectPermissionActions.Read, ProjectPermissionSub.Role],
  [ProjectPermissionActions.Create, ProjectPermissionSub.Role],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.Role],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.Role],

  [ProjectPermissionActions.Read, ProjectPermissionSub.Integrations],
  [ProjectPermissionActions.Create, ProjectPermissionSub.Integrations],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.Integrations],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.Integrations],

  [ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks],
  [ProjectPermissionActions.Create, ProjectPermissionSub.Webhooks],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.Webhooks],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.Webhooks],

  [ProjectPermissionActions.Read, ProjectPermissionSub.Identity],
  [ProjectPermissionActions.Create, ProjectPermissionSub.Identity],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.Identity],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.Identity],

  [ProjectPermissionActions.Read, ProjectPermissionSub.ServiceTokens],
  [ProjectPermissionActions.Create, ProjectPermissionSub.ServiceTokens],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.ServiceTokens],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.ServiceTokens],

  [ProjectPermissionActions.Read, ProjectPermissionSub.Settings],
  [ProjectPermissionActions.Create, ProjectPermissionSub.Settings],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.Settings],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.Settings],

  [ProjectPermissionActions.Read, ProjectPermissionSub.Environments],
  [ProjectPermissionActions.Create, ProjectPermissionSub.Environments],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.Environments],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.Environments],

  [ProjectPermissionActions.Read, ProjectPermissionSub.Tags],
  [ProjectPermissionActions.Create, ProjectPermissionSub.Tags],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.Tags],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.Tags],

  [ProjectPermissionActions.Read, ProjectPermissionSub.AuditLogs],
  [ProjectPermissionActions.Create, ProjectPermissionSub.AuditLogs],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.AuditLogs],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.AuditLogs],

  [ProjectPermissionActions.Read, ProjectPermissionSub.IpAllowList],
  [ProjectPermissionActions.Create, ProjectPermissionSub.IpAllowList],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.IpAllowList],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.IpAllowList],

  // double check if all CRUD are needed for CA and Certificates
  [ProjectPermissionActions.Read, ProjectPermissionSub.CertificateAuthorities],
  [ProjectPermissionActions.Create, ProjectPermissionSub.CertificateAuthorities],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.CertificateAuthorities],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.CertificateAuthorities],

  [ProjectPermissionActions.Read, ProjectPermissionSub.Certificates],
  [ProjectPermissionActions.Create, ProjectPermissionSub.Certificates],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.Certificates],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.Certificates],

  [ProjectPermissionActions.Read, ProjectPermissionSub.CertificateTemplates],
  [ProjectPermissionActions.Create, ProjectPermissionSub.CertificateTemplates],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.CertificateTemplates],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.CertificateTemplates],

  [ProjectPermissionActions.Read, ProjectPermissionSub.PkiAlerts],
  [ProjectPermissionActions.Create, ProjectPermissionSub.PkiAlerts],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.PkiAlerts],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.PkiAlerts],

  [ProjectPermissionActions.Read, ProjectPermissionSub.PkiCollections],
  [ProjectPermissionActions.Create, ProjectPermissionSub.PkiCollections],
  [ProjectPermissionActions.Edit, ProjectPermissionSub.PkiCollections],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.PkiCollections],

  [ProjectPermissionActions.Edit, ProjectPermissionSub.Project],
  [ProjectPermissionActions.Delete, ProjectPermissionSub.Project],

  [ProjectPermissionActions.Edit, ProjectPermissionSub.Kms]
];

const buildAdminPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  // Admins get full access to everything
  fullProjectPermissionSet.forEach((permission) => {
    const [action, subject] = permission;
    can(action, subject);
  });

  return rules;
};

export const projectAdminPermissions = buildAdminPermissionRules();

const buildMemberPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Secrets);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRotation);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretRollback);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Member);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Member);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Groups);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Integrations);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Webhooks);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Identity);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Identity);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Identity);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Identity);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.ServiceTokens);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Settings);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Environments);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Tags);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.AuditLogs);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.IpAllowList);

  // double check if all CRUD are needed for CA and Certificates
  can(ProjectPermissionActions.Read, ProjectPermissionSub.CertificateAuthorities);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Certificates);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Certificates);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Certificates);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Certificates);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.CertificateTemplates);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.PkiAlerts);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.PkiCollections);

  return rules;
};

export const projectMemberPermissions = buildMemberPermissionRules();

const buildViewerPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRotation);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Member);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Groups);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Identity);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.AuditLogs);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.IpAllowList);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.CertificateAuthorities);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Certificates);

  return rules;
};

export const projectViewerPermission = buildViewerPermissionRules();

const buildNoAccessProjectPermission = () => {
  const { rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);
  return rules;
};

export const buildServiceTokenProjectPermission = (
  scopes: Array<{ secretPath: string; environment: string }>,
  permission: string[]
) => {
  const canWrite = permission.includes("write");
  const canRead = permission.includes("read");
  const { can, build } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);
  scopes.forEach(({ secretPath, environment }) => {
    if (canWrite) {
      // TODO: @Akhi
      // @ts-expect-error type
      can(ProjectPermissionActions.Edit, ProjectPermissionSub.Secrets, {
        secretPath: { $glob: secretPath },
        environment
      });
      // @ts-expect-error type
      can(ProjectPermissionActions.Create, ProjectPermissionSub.Secrets, {
        secretPath: { $glob: secretPath },
        environment
      });
      // @ts-expect-error type
      can(ProjectPermissionActions.Delete, ProjectPermissionSub.Secrets, {
        secretPath: { $glob: secretPath },
        environment
      });
    }
    if (canRead) {
      // @ts-expect-error type
      can(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets, {
        secretPath: { $glob: secretPath },
        environment
      });
    }
  });

  return build({ conditionsMatcher });
};

export const projectNoAccessPermissions = buildNoAccessProjectPermission();

/* eslint-disable */

/**
 * Extracts and formats permissions from a CASL Ability object or a raw permission set.
 * @param ability
 * @returns
 */
const extractPermissions = (ability: any) =>
  ability.A.map((permission: any) => `${permission.action}_${permission.subject}`);

/**
 * Compares two sets of permissions to determine if the first set is at least as privileged as the second set.
 * The function checks if all permissions in the second set are contained within the first set and if the first set has equal or more permissions.
 *
 */
export const isAtLeastAsPrivilegedWorkspace = (
  permissions1: MongoAbility<ProjectPermissionSet> | ProjectPermissionSet,
  permissions2: MongoAbility<ProjectPermissionSet> | ProjectPermissionSet
) => {
  const set1 = new Set(extractPermissions(permissions1));
  const set2 = new Set(extractPermissions(permissions2));

  // eslint-disable-next-line
  for (const perm of set2) {
    if (!set1.has(perm)) {
      return false;
    }
  }

  return set1.size >= set2.size;
};

/*
 * Case: The user requests to create a role with permissions that are not valid and not supposed to be used ever.
 * If we don't check for this, we can run into issues where functions like the `isAtLeastAsPrivileged` will not work as expected, because we compare the size of each permission set.
 * If the permission set contains invalid permissions, the size will be different, and result in incorrect results.
 */
export const validateProjectPermissions = (permissions: unknown) => {
  const parsedPermissions =
    typeof permissions === "string" ? (JSON.parse(permissions) as string[]) : (permissions as string[]);

  const flattenedPermissions = [...parsedPermissions];

  for (const perm of flattenedPermissions) {
    const [action, subject] = perm;

    if (
      !fullProjectPermissionSet.find(
        (currentPermission) => currentPermission[0] === action && currentPermission[1] === subject
      )
    ) {
      throw new BadRequestError({
        message: `Permission action ${action} on subject ${subject} is not valid`,
        name: "Create Role"
      });
    }
  }
};

/* eslint-enable */
