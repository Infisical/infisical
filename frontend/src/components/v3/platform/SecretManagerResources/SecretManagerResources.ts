import { ProjectPermissionSub } from "@app/context";

import {
  getProjectPermissionSubjectPresentation,
  type PermissionSubjectColor
} from "../ProjectPermissionSubjects/ProjectPermissionSubjects";

/**
 * Secret Manager resources — overview-row nouns (filters, access requests,
 * path-scoped policy subjects). Icon and color come from
 * `PROJECT_PERMISSION_SUBJECT_PRESENTATION`; this catalog adds slug and the
 * overview-facing name.
 *
 * Not a billing entitlement catalog. Permission *actions* stay on
 * `PROJECT_PERMISSION_OBJECT` / request-access configs.
 */
export const SecretManagerResourceSlug = {
  Folder: "folder",
  DynamicSecret: "dynamic",
  SecretRotation: "rotation",
  SecretImport: "import",
  HoneyToken: "honeyToken",
  ProxiedService: "proxiedService",
  Secret: "secret"
} as const;

export type SecretManagerResourceSlug =
  (typeof SecretManagerResourceSlug)[keyof typeof SecretManagerResourceSlug];

export type SecretManagerResourceColor = PermissionSubjectColor;

export type SecretManagerResource = {
  slug: SecretManagerResourceSlug;
  name: string;
  description: string;
  permissionSubject: ProjectPermissionSub;
  Icon: ReturnType<typeof getProjectPermissionSubjectPresentation>["Icon"];
  color: PermissionSubjectColor;
};

const SECRET_MANAGER_RESOURCE_DEFINITIONS = {
  [SecretManagerResourceSlug.Folder]: {
    slug: SecretManagerResourceSlug.Folder,
    name: "Folders",
    description: "Organize secrets into hierarchical folder structures",
    permissionSubject: ProjectPermissionSub.SecretFolders
  },
  [SecretManagerResourceSlug.DynamicSecret]: {
    slug: SecretManagerResourceSlug.DynamicSecret,
    name: "Dynamic Secrets",
    description: "Configure auto-rotating credentials for databases and services",
    permissionSubject: ProjectPermissionSub.DynamicSecrets
  },
  [SecretManagerResourceSlug.SecretRotation]: {
    slug: SecretManagerResourceSlug.SecretRotation,
    name: "Secret Rotations",
    description: "Configure automatic secret rotation policies",
    permissionSubject: ProjectPermissionSub.SecretRotation
  },
  [SecretManagerResourceSlug.SecretImport]: {
    slug: SecretManagerResourceSlug.SecretImport,
    name: "Secret Imports",
    description: "Import and reference secrets from other environments or projects",
    permissionSubject: ProjectPermissionSub.SecretImports
  },
  [SecretManagerResourceSlug.HoneyToken]: {
    slug: SecretManagerResourceSlug.HoneyToken,
    name: "Honey Tokens",
    description: "Create and manage honey tokens and triggered events",
    permissionSubject: ProjectPermissionSub.HoneyTokens
  },
  [SecretManagerResourceSlug.ProxiedService]: {
    slug: SecretManagerResourceSlug.ProxiedService,
    name: "Proxied Services",
    description: "Manage proxied services and route agent traffic through them",
    permissionSubject: ProjectPermissionSub.ProxiedServices
  },
  [SecretManagerResourceSlug.Secret]: {
    slug: SecretManagerResourceSlug.Secret,
    name: "Secrets",
    description: "Manage secret values, metadata, and access within project environments",
    permissionSubject: ProjectPermissionSub.Secrets
  }
} as const satisfies Record<
  SecretManagerResourceSlug,
  Omit<SecretManagerResource, "Icon" | "color">
>;

const toSecretManagerResource = (
  definition: (typeof SECRET_MANAGER_RESOURCE_DEFINITIONS)[SecretManagerResourceSlug]
): SecretManagerResource => {
  const presentation = getProjectPermissionSubjectPresentation(definition.permissionSubject);

  return {
    ...definition,
    Icon: presentation.Icon,
    color: presentation.color
  };
};

export const SECRET_MANAGER_RESOURCES = {
  [SecretManagerResourceSlug.Folder]: toSecretManagerResource(
    SECRET_MANAGER_RESOURCE_DEFINITIONS[SecretManagerResourceSlug.Folder]
  ),
  [SecretManagerResourceSlug.DynamicSecret]: toSecretManagerResource(
    SECRET_MANAGER_RESOURCE_DEFINITIONS[SecretManagerResourceSlug.DynamicSecret]
  ),
  [SecretManagerResourceSlug.SecretRotation]: toSecretManagerResource(
    SECRET_MANAGER_RESOURCE_DEFINITIONS[SecretManagerResourceSlug.SecretRotation]
  ),
  [SecretManagerResourceSlug.SecretImport]: toSecretManagerResource(
    SECRET_MANAGER_RESOURCE_DEFINITIONS[SecretManagerResourceSlug.SecretImport]
  ),
  [SecretManagerResourceSlug.HoneyToken]: toSecretManagerResource(
    SECRET_MANAGER_RESOURCE_DEFINITIONS[SecretManagerResourceSlug.HoneyToken]
  ),
  [SecretManagerResourceSlug.ProxiedService]: toSecretManagerResource(
    SECRET_MANAGER_RESOURCE_DEFINITIONS[SecretManagerResourceSlug.ProxiedService]
  ),
  [SecretManagerResourceSlug.Secret]: toSecretManagerResource(
    SECRET_MANAGER_RESOURCE_DEFINITIONS[SecretManagerResourceSlug.Secret]
  )
} as const satisfies Record<SecretManagerResourceSlug, SecretManagerResource>;

export const SECRET_MANAGER_RESOURCE_LIST: SecretManagerResource[] = [
  SECRET_MANAGER_RESOURCES[SecretManagerResourceSlug.Folder],
  SECRET_MANAGER_RESOURCES[SecretManagerResourceSlug.DynamicSecret],
  SECRET_MANAGER_RESOURCES[SecretManagerResourceSlug.SecretRotation],
  SECRET_MANAGER_RESOURCES[SecretManagerResourceSlug.SecretImport],
  SECRET_MANAGER_RESOURCES[SecretManagerResourceSlug.HoneyToken],
  SECRET_MANAGER_RESOURCES[SecretManagerResourceSlug.ProxiedService],
  SECRET_MANAGER_RESOURCES[SecretManagerResourceSlug.Secret]
];

const SECRET_MANAGER_RESOURCES_BY_PERMISSION_SUBJECT = Object.fromEntries(
  SECRET_MANAGER_RESOURCE_LIST.map((resource) => [resource.permissionSubject, resource])
) as Partial<Record<ProjectPermissionSub, SecretManagerResource>>;

export const getSecretManagerResource = (slug: SecretManagerResourceSlug): SecretManagerResource =>
  SECRET_MANAGER_RESOURCES[slug];

export const getSecretManagerResourceByPermissionSubject = (
  subject: ProjectPermissionSub
): SecretManagerResource | undefined => SECRET_MANAGER_RESOURCES_BY_PERMISSION_SUBJECT[subject];
