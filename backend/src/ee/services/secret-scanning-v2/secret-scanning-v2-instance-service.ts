import { ProjectType } from "@app/db/schemas";
import { TOrganizationsDomain } from "@app/domains/platform/organizations/ce/module";
import { TActorInput } from "@app/lib/types";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TSecretScanningV2ProjectResolverFactory } from "./secret-scanning-v2-project-resolver";

type TSecretScanningV2InstanceServiceDeps = {
  projectDAL: Pick<TProjectDALFactory, "find">;
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission">;
  secretScanningV2ProjectResolver: Pick<TSecretScanningV2ProjectResolverFactory, "resolve">;
};

export type TSecretScanningV2InstanceServiceFactory = ReturnType<typeof secretScanningV2InstanceServiceFactory>;

export const secretScanningV2InstanceServiceFactory = ({
  projectDAL,
  organizationsDomain,
  secretScanningV2ProjectResolver
}: TSecretScanningV2InstanceServiceDeps) => {
  // Token validation only checks membership, so this is what applies SSO enforcement and the other
  // org access rules before anything is read or lazily created.
  const $assertOrgAccess = async ({ actor }: TActorInput) => {
    await organizationsDomain.getOrgPermission({ actor });
  };

  const resolveActiveProjectId = async ({ actor }: TActorInput) => {
    await $assertOrgAccess({ actor });
    return secretScanningV2ProjectResolver.resolve(actor.org.id);
  };

  const getInstanceState = async ({ actor }: TActorInput) => {
    await $assertOrgAccess({ actor });
    const actorOrgId = actor.org.id;

    // Newest first, matching the resolver: the newest project is the active one.
    const projects = await projectDAL.find(
      { orgId: actorOrgId, type: ProjectType.SecretScanning },
      { sort: [["createdAt", "desc"]] }
    );

    return {
      activeProjectId: projects.length ? projects[0].id : null,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        createdAt: p.createdAt
      })),
      isMultiInstance: projects.length > 1
    };
  };

  return {
    resolveActiveProjectId,
    getInstanceState
  };
};
