import { ForbiddenError } from "@casl/ability";

import { TDbClient } from "@app/db";
import { OrganizationActionScope, ProjectType, TableName } from "@app/db/schemas";
import { OrgPermissionCertManagerActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

type TCertManagerInstanceServiceDeps = {
  db: TDbClient;
  orgDAL: Pick<TOrgDALFactory, "findById" | "updateById">;
  projectDAL: Pick<TProjectDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

type TActor = {
  actor: ActorType;
  actorId: string;
  actorAuthMethod: Parameters<TPermissionServiceFactory["getOrgPermission"]>[0]["actorAuthMethod"];
  actorOrgId: string;
};

export type TCertManagerInstanceServiceFactory = ReturnType<typeof certManagerInstanceServiceFactory>;

export const certManagerInstanceServiceFactory = ({
  db,
  orgDAL,
  projectDAL,
  permissionService
}: TCertManagerInstanceServiceDeps) => {
  const getInstanceState = async ({ actor, actorId, actorAuthMethod, actorOrgId }: TActor) => {
    await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    const org = await orgDAL.findById(actorOrgId);
    if (!org) throw new NotFoundError({ message: "Organization not found" });

    const projects = await projectDAL.find({ orgId: actorOrgId, type: ProjectType.CertificateManager });
    const projectsSorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));

    let activeProjectId = org.defaultCertManagerProjectId ?? null;
    if (!activeProjectId && projectsSorted.length === 1) {
      activeProjectId = projectsSorted[0].id;
    }

    return {
      activeProjectId,
      projects: projectsSorted.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        createdAt: p.createdAt
      })),
      isMultiInstance: projectsSorted.length > 1
    };
  };

  const setActiveProject = async ({ actor, actorId, actorAuthMethod, actorOrgId }: TActor, projectId: string) => {
    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionCertManagerActions.ManageInstance,
      OrgPermissionSubjects.CertManager
    );

    const projects = await projectDAL.find({ orgId: actorOrgId, type: ProjectType.CertificateManager });
    const target = projects.find((p) => p.id === projectId);
    if (!target) {
      throw new BadRequestError({
        message: "The selected project is not a Certificate Manager project in this organization."
      });
    }

    const org = await orgDAL.findById(actorOrgId);
    const previousActiveProjectId = org?.defaultCertManagerProjectId ?? null;

    await orgDAL.updateById(actorOrgId, { defaultCertManagerProjectId: projectId });

    return {
      activeProjectId: projectId,
      previousActiveProjectId,
      projectName: target.name
    };
  };

  const listLegacyInstances = async ({ actor, actorId, actorAuthMethod, actorOrgId }: TActor) => {
    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionCertManagerActions.Read,
      OrgPermissionSubjects.CertManager
    );

    const org = await orgDAL.findById(actorOrgId);
    if (!org) throw new NotFoundError({ message: "Organization not found" });

    const projects = await projectDAL.find({ orgId: actorOrgId, type: ProjectType.CertificateManager });
    if (projects.length === 0) {
      return { activeProjectId: org.defaultCertManagerProjectId ?? null, instances: [] };
    }

    const projectIds = projects.map((p) => p.id);
    const replica = db.replicaNode();

    const [certCounts, syncCounts, alertCounts] = await Promise.all([
      replica(TableName.Certificate).whereIn("projectId", projectIds).groupBy("projectId").select("projectId").count(),
      replica(TableName.PkiSync).whereIn("projectId", projectIds).groupBy("projectId").select("projectId").count(),
      replica(TableName.PkiAlertsV2).whereIn("projectId", projectIds).groupBy("projectId").select("projectId").count()
    ]);

    const toMap = (rows: Array<{ projectId: string; count: string | number }>) =>
      new Map(rows.map((r) => [r.projectId, Number(r.count)]));
    const certs = toMap(certCounts as unknown as Array<{ projectId: string; count: string | number }>);
    const syncs = toMap(syncCounts as unknown as Array<{ projectId: string; count: string | number }>);
    const alerts = toMap(alertCounts as unknown as Array<{ projectId: string; count: string | number }>);

    const instances = [...projects]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        createdAt: p.createdAt,
        certificateCount: certs.get(p.id) ?? 0,
        syncCount: syncs.get(p.id) ?? 0,
        alertCount: alerts.get(p.id) ?? 0,
        isActive: p.id === org.defaultCertManagerProjectId
      }));

    return { activeProjectId: org.defaultCertManagerProjectId ?? null, instances };
  };

  return {
    getInstanceState,
    setActiveProject,
    listLegacyInstances
  };
};
