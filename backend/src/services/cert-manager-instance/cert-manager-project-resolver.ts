import { ProjectType } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

type TResolverDeps = {
  orgDAL: Pick<TOrgDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "find" | "findById">;
};

const resolveCertManagerProjectId = async (
  { orgDAL, projectDAL }: TResolverDeps,
  actorOrgId: string
): Promise<string> => {
  const projects = await projectDAL.find({ orgId: actorOrgId, type: ProjectType.CertificateManager });

  if (projects.length === 1) return projects[0].id;

  if (projects.length === 0) {
    throw new BadRequestError({
      message: "This organization has no Certificate Manager project. Contact your administrator."
    });
  }

  const org = await orgDAL.findById(actorOrgId);
  if (!org) {
    throw new BadRequestError({ message: "Organization not found." });
  }
  if (org.defaultCertManagerProjectId) return org.defaultCertManagerProjectId;

  return "";
};

export type TCertManagerProjectResolverFactory = ReturnType<typeof certManagerProjectResolverFactory>;

const getActiveCertManagerProjectId = async (
  { orgDAL, projectDAL }: TResolverDeps,
  actorOrgId: string
): Promise<string | null> => {
  const projects = await projectDAL.find({ orgId: actorOrgId, type: ProjectType.CertificateManager });
  if (projects.length === 1) return projects[0].id;
  if (projects.length === 0) return null;
  const org = await orgDAL.findById(actorOrgId);
  return org?.defaultCertManagerProjectId ?? null;
};

export const certManagerProjectResolverFactory = (deps: TResolverDeps) => ({
  resolve: (actorOrgId: string) => resolveCertManagerProjectId(deps, actorOrgId),
  isCertManagerProject: async (projectId: string, expectedOrgId: string): Promise<boolean> => {
    const project = await deps.projectDAL.findById(projectId);
    if (!project) return false;
    if (project.orgId !== expectedOrgId) return false;
    return project.type === ProjectType.CertificateManager;
  },
  getActiveProjectId: (actorOrgId: string) => getActiveCertManagerProjectId(deps, actorOrgId)
});
