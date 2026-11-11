import { TDbClient } from "@app/db";
import { ProjectType, TableName } from "@app/db/schemas";
import {
  OrgPermissionCertManagerActions,
  OrgPermissionSubjects,
  TOrganizationsDomain
} from "@app/domains/platform/organizations/ce/module";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TActorInput } from "@app/lib/types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

type TCertManagerInstanceServiceDeps = {
  db: TDbClient;
  orgDAL: Pick<TOrgDALFactory, "findById" | "updateById">;
  projectDAL: Pick<TProjectDALFactory, "find">;
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission">;
};

export type TCertManagerInstanceServiceFactory = ReturnType<typeof certManagerInstanceServiceFactory>;

export const certManagerInstanceServiceFactory = ({
  db,
  orgDAL,
  projectDAL,
  organizationsDomain
}: TCertManagerInstanceServiceDeps) => {
  const getInstanceState = async ({ actor }: TActorInput) => {
    await organizationsDomain.getOrgPermission({ actor });

    const org = await orgDAL.findById(actor.org.id);
    if (!org) throw new NotFoundError({ message: "Organization not found" });

    const projects = await projectDAL.find({ orgId: actor.org.id, type: ProjectType.CertificateManager });
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

  const setActiveProject = async ({ actor }: TActorInput, projectId: string) => {
    const permission = await organizationsDomain.getOrgPermission({ actor });

    permission.assert({
      action: OrgPermissionCertManagerActions.ManageInstance,
      subject: OrgPermissionSubjects.CertManager
    });

    const projects = await projectDAL.find({ orgId: actor.org.id, type: ProjectType.CertificateManager });
    const target = projects.find((p) => p.id === projectId);
    if (!target) {
      throw new BadRequestError({
        message: "The selected project is not a Certificate Manager project in this organization."
      });
    }

    const org = await orgDAL.findById(actor.org.id);
    const previousActiveProjectId = org?.defaultCertManagerProjectId ?? null;

    await orgDAL.updateById(actor.org.id, { defaultCertManagerProjectId: projectId });

    return {
      activeProjectId: projectId,
      previousActiveProjectId,
      projectName: target.name
    };
  };

  const listLegacyInstances = async ({ actor }: TActorInput) => {
    const permission = await organizationsDomain.getOrgPermission({ actor });

    permission.assert({ action: OrgPermissionCertManagerActions.Read, subject: OrgPermissionSubjects.CertManager });

    const org = await orgDAL.findById(actor.org.id);
    if (!org) throw new NotFoundError({ message: "Organization not found" });

    const projects = await projectDAL.find({ orgId: actor.org.id, type: ProjectType.CertificateManager });
    if (projects.length === 0) {
      return { activeProjectId: org.defaultCertManagerProjectId ?? null, instances: [] };
    }

    const projectIds = projects.map((p) => p.id);
    const replica = db.replicaNode();

    const [certCounts, syncCounts, alertCounts] = await Promise.all([
      replica(TableName.Certificate)
        .whereIn("projectId", projectIds)
        .whereNull("deletedAt")
        .groupBy("projectId")
        .select("projectId")
        .count(),
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
