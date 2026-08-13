import { ForbiddenError, MongoAbility, subject } from "@casl/ability";

import {
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { OrgServiceActor, TDynamicSecretWithMetadata } from "@app/lib/types";
import { PersonalOverridesBehavior, SecretImportReferencesBehavior } from "@app/services/secret/secret-types";
import { TSecretV2BridgeServiceFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-service";

import { TDynamicSecretDALFactory } from "../dynamic-secret/dynamic-secret-dal";
import { DynamicSecretProviders } from "../dynamic-secret/providers/models";
import { TLicenseServiceFactory } from "../license/license-service";
import { BROKERABLE_DYNAMIC_SECRETS } from "./proxied-service-brokerable-outputs";

// The actor is a parameter rather than "the caller" because these checks run in two different
// authorities: at configure time as the person saving the service, and at brokering time as the
// person who last saved it (remote) or as the caller (local).
export type TBrokerAuthzDeps = {
  secretV2BridgeService: Pick<TSecretV2BridgeServiceFactory, "getSecrets">;
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "findWithMetadata">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TCredentialRef = {
  secretKey?: string | null;
  dynamicSecretName?: string | null;
  dynamicSecretField?: string | null;
};

// Requires ReadValue (not just DescribeSecret) on each referenced secret: the proxy brokers the value on
// the actor's behalf, so attaching a secret they can't read would let them exfiltrate it on the wire.
export const assertReferencedSecretsReadable = async (
  { secretV2BridgeService }: Pick<TBrokerAuthzDeps, "secretV2BridgeService">,
  {
    actor,
    projectId,
    environment,
    secretPath,
    credentials
  }: {
    actor: OrgServiceActor;
    projectId: string;
    environment: string;
    secretPath: string;
    credentials: TCredentialRef[];
  }
) => {
  const uniqueKeys = [...new Set(credentials.map((c) => c.secretKey).filter((k): k is string => Boolean(k)))];
  if (!uniqueKeys.length) return;

  // viewSecretValue must be true so secretValueHidden reflects real ReadValue access; values are discarded.
  // expandSecretReferences must be true to mirror what the broker fetches at runtime: it resolves each
  // referenced value with expansion on, so the referenced value the broker would send may itself pull in
  // another secret (${OTHER}). Expanding here under the actor's permissions makes getSecrets throw if they
  // can't read a transitively-referenced secret, blocking them from attaching a value they can't fully read.
  const { secrets, imports } = await secretV2BridgeService.getSecrets({
    actor: actor.type,
    actorId: actor.id,
    actorOrgId: actor.orgId,
    actorAuthMethod: actor.authMethod,
    projectId,
    environment,
    path: secretPath,
    keys: uniqueKeys,
    includeImports: true,
    recursive: false,
    viewSecretValue: true,
    throwOnMissingReadValuePermission: false,
    expandSecretReferences: true,
    expandPersonalOverrides: false,
    personalOverridesBehavior: PersonalOverridesBehavior.NeverInclude,
    secretImportReferencesBehavior: SecretImportReferencesBehavior.Relative
  });

  // Folder secrets take precedence over imports at resolution time, so a key hidden in the folder is not
  // readable even if an import would expose it. Imports only return keys the actor can read.
  const readableFolderKeys = new Set(secrets.filter((s) => !s.secretValueHidden).map((s) => s.secretKey));
  const describeOnlyFolderKeys = new Set(secrets.filter((s) => s.secretValueHidden).map((s) => s.secretKey));
  const readableImportKeys = new Set(imports.flatMap((group) => group.secrets.map((s) => s.secretKey)));

  const notReadable: string[] = [];
  const notFound: string[] = [];
  uniqueKeys.forEach((key) => {
    if (readableFolderKeys.has(key)) return;
    if (describeOnlyFolderKeys.has(key)) {
      notReadable.push(key);
      return;
    }
    if (readableImportKeys.has(key)) return;
    notFound.push(key);
  });

  if (notReadable.length) {
    throw new ForbiddenRequestError({
      message: `You do not have permission to read the value of secret(s): ${notReadable.join(", ")}`
    });
  }
  if (notFound.length) {
    throw new BadRequestError({
      message: `Referenced secret(s) not found in folder or its imports: ${notFound.join(", ")}`
    });
  }
};

export const findReferencedDynamicSecrets = async (
  { dynamicSecretDAL }: Pick<TBrokerAuthzDeps, "dynamicSecretDAL">,
  { folderId, credentials }: { folderId: string; credentials: TCredentialRef[] }
) => {
  const names = [...new Set(credentials.map((c) => c.dynamicSecretName).filter((n): n is string => Boolean(n)))];
  if (!names.length) return { names, byName: new Map<string, TDynamicSecretWithMetadata>() };
  const found = await dynamicSecretDAL.findWithMetadata({ folderId, $in: { name: names } });
  return { names, byName: new Map(found.map((ds) => [ds.name, ds])) };
};

export const assertReferencedDynamicSecretsLeasable = async (
  deps: Pick<TBrokerAuthzDeps, "dynamicSecretDAL" | "licenseService">,
  {
    permission,
    orgId,
    environment,
    secretPath,
    folderId,
    credentials
  }: {
    permission: MongoAbility<ProjectPermissionSet>;
    orgId: string;
    environment: string;
    secretPath: string;
    folderId: string;
    credentials: TCredentialRef[];
  }
) => {
  const dynamicCreds = credentials.filter((c) => Boolean(c.dynamicSecretName));
  if (!dynamicCreds.length) return;

  const plan = await deps.licenseService.getPlan(orgId);
  if (!plan.dynamicSecret) {
    throw new BadRequestError({
      message: "Failed to reference a dynamic secret due to plan restriction. Upgrade your plan to use dynamic secrets."
    });
  }

  const { names, byName } = await findReferencedDynamicSecrets(deps, { folderId, credentials: dynamicCreds });
  const missing = names.filter((n) => !byName.has(n));
  if (missing.length) {
    throw new BadRequestError({
      message: `Referenced dynamic secret(s) not found in this folder: ${missing.join(", ")}`
    });
  }

  dynamicCreds.forEach((cred) => {
    const ds = byName.get(cred.dynamicSecretName as string) as TDynamicSecretWithMetadata;

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.Lease,
      subject(ProjectPermissionSub.DynamicSecrets, { environment, secretPath, metadata: ds.metadata })
    );

    const brokerable = BROKERABLE_DYNAMIC_SECRETS[ds.type as DynamicSecretProviders];
    if (!brokerable) {
      throw new BadRequestError({
        message: `Dynamic secret "${ds.name}" (${ds.type}) can't be brokered over HTTP`
      });
    }
    if (!cred.dynamicSecretField || !brokerable.fields.includes(cred.dynamicSecretField)) {
      throw new BadRequestError({
        message: `"${cred.dynamicSecretField}" is not a valid output field for dynamic secret "${ds.name}" (${ds.type}). Allowed: ${brokerable.fields.join(", ") || "none"}`
      });
    }
  });
};

export const decorateCredentialsWithLeaseAccess = async <T extends TCredentialRef>(
  deps: Pick<TBrokerAuthzDeps, "dynamicSecretDAL">,
  {
    permission,
    environment,
    secretPath,
    folderId,
    credentials
  }: {
    permission: MongoAbility<ProjectPermissionSet>;
    environment: string;
    secretPath: string;
    folderId: string;
    credentials: T[];
  }
): Promise<(T & { callerCanLease?: boolean })[]> => {
  const dynamicCreds = credentials.filter((c) => Boolean(c.dynamicSecretName));
  if (!dynamicCreds.length) return credentials;

  const { byName } = await findReferencedDynamicSecrets(deps, { folderId, credentials: dynamicCreds });
  return credentials.map((cred) => {
    if (!cred.dynamicSecretName) return cred;
    const metadata = byName.get(cred.dynamicSecretName)?.metadata ?? [];
    const callerCanLease = permission.can(
      ProjectPermissionDynamicSecretActions.Lease,
      subject(ProjectPermissionSub.DynamicSecrets, { environment, secretPath, metadata })
    );
    return { ...cred, callerCanLease };
  });
};
