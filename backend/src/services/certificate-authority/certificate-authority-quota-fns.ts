import { PlanLimit, TLicenseService } from "@app/domains/platform/license/ce/module";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { isInstanceWidePkiQuota } from "@app/services/certificate-common/certificate-quota-scope";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";

export type TCertificateAuthorityQuotaDeps = {
  projectDAL: Pick<TProjectDALFactory, "findById">;
  licenseService: TLicenseService;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "countCasByOrgId" | "countInternalCasByOrgId">;
};

// Enforced where the CA row is written rather than in createCertificateAuthority alone: the still-live
// POST /cert-manager/ca route calls internalCertificateAuthorityService.createCa directly, so a check
// that only sat in the former was bypassable.
//
// Two independent caps, whichever binds first: maxCas covers every type, maxInternalCas covers
// INTERNAL only. A tier sets one and leaves the other null. Both count the root org's tree, or the
// whole instance under a self-hosted license (isInstanceWidePkiQuota).
export const assertCertificateAuthorityQuota = async ({
  projectId,
  isInternal,
  deps
}: {
  projectId: string;
  isInternal: boolean;
  deps: TCertificateAuthorityQuotaDeps;
}): Promise<void> => {
  const project = await deps.projectDAL.findById(projectId);
  if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });

  const plan = await deps.licenseService.getPlan(project.orgId);
  const isInstanceWide = isInstanceWidePkiQuota(deps.licenseService);
  const countOrgId = isInstanceWide ? null : project.orgId;
  const scopeNote = isInstanceWide ? " across this instance" : "";

  if (plan.isLimited(PlanLimit.CertificateAuthorities)) {
    const used = await deps.certificateAuthorityDAL.countCasByOrgId(countOrgId);
    if (plan.exceeds(PlanLimit.CertificateAuthorities, used)) {
      throw new BadRequestError({
        message: `Failed to create certificate authority due to plan limit reached (${used} of ${plan.limit(PlanLimit.CertificateAuthorities)} certificate authorities${scopeNote}). Upgrade plan to add more certificate authorities.`
      });
    }
  }

  if (isInternal && plan.isLimited(PlanLimit.InternalCertificateAuthorities)) {
    const used = await deps.certificateAuthorityDAL.countInternalCasByOrgId(countOrgId);
    if (plan.exceeds(PlanLimit.InternalCertificateAuthorities, used)) {
      throw new BadRequestError({
        message: `Failed to create internal certificate authority due to plan limit reached (${used} of ${plan.limit(PlanLimit.InternalCertificateAuthorities)} internal certificate authorities${scopeNote}). Upgrade plan to add more internal certificate authorities.`
      });
    }
  }
};
