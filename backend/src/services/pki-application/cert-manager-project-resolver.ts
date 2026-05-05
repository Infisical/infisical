import { ProjectType } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

type TResolverDeps = {
  orgDAL: Pick<TOrgDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "find" | "findById">;
};

export const resolveCertManagerProjectId = async (
  { orgDAL, projectDAL }: TResolverDeps,
  actorOrgId: string
): Promise<string> => {
  const projects = await projectDAL.find({ orgId: actorOrgId, type: ProjectType.CertificateManager });

  if (projects.length === 1) return projects[0].id;

  if (projects.length === 0) {
    throw new BadRequestError({
      message:
        "This organization has no Cert Manager project. Contact your administrator; one should have been created automatically."
    });
  }

  const org = await orgDAL.findById(actorOrgId);
  if (!org) {
    throw new BadRequestError({ message: "Organization not found." });
  }
  if (org.defaultCertManagerProjectId) return org.defaultCertManagerProjectId;

  throw new BadRequestError({
    message:
      "This organization has multiple Cert Manager projects but no default is set. An org Admin must set the default in the Cert Manager settings."
  });
};

export type TCertManagerProjectResolverFactory = ReturnType<typeof certManagerProjectResolverFactory>;

export const certManagerProjectResolverFactory = (deps: TResolverDeps) => ({
  resolve: (actorOrgId: string) => resolveCertManagerProjectId(deps, actorOrgId),
  isCertManagerProject: async (projectId: string): Promise<boolean> => {
    const project = await deps.projectDAL.findById(projectId);
    return project?.type === ProjectType.CertificateManager;
  }
});
