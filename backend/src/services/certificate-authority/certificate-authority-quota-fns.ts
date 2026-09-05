import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";

export type TCertificateAuthorityQuotaDeps = {
  projectDAL: Pick<TProjectDALFactory, "findById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "countCasByOrgId" | "countInternalCasByOrgId">;
};

// Enforced where the CA row is written rather than in createCertificateAuthority alone: the still-live
// POST /cert-manager/ca route calls internalCertificateAuthorityService.createCa directly, so a check
// that only sat in the former was bypassable.
//
// Two independent caps, whichever binds first: maxCas covers every type, maxInternalCas covers
// INTERNAL only. A tier sets one and leaves the other null.
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

  // A contract granting more internal CAs than total CAs is a License Server misconfiguration; honour
  // the larger grant. Guarded on both being numbers because the free tier leaves maxInternalCas null
  // while capping maxCas at 1, so treating null as unlimited would lift that cap.
  const maxCas =
    typeof plan.maxCas === "number" && typeof plan.maxInternalCas === "number"
      ? Math.max(plan.maxCas, plan.maxInternalCas)
      : plan.maxCas;

  if (typeof maxCas === "number") {
    const used = await deps.certificateAuthorityDAL.countCasByOrgId(project.orgId);
    if (used >= maxCas) {
      throw new BadRequestError({
        message: `Failed to create certificate authority due to plan limit reached (${used} of ${maxCas} certificate authorities). Upgrade plan to add more certificate authorities.`
      });
    }
  }

  if (isInternal && typeof plan.maxInternalCas === "number") {
    const used = await deps.certificateAuthorityDAL.countInternalCasByOrgId(project.orgId);
    if (used >= plan.maxInternalCas) {
      throw new BadRequestError({
        message: `Failed to create internal certificate authority due to plan limit reached (${used} of ${plan.maxInternalCas} internal certificate authorities). Upgrade plan to add more internal certificate authorities.`
      });
    }
  }
};
