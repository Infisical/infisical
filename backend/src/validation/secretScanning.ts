import { z } from "zod";
import { RiskStatus } from "../ee/models";

export const CreateInstallSessionv1 = z.object({
  params: z.object({ organizationId: z.string().trim() })
});

export const LinkInstallationToOrgv1 = z.object({
  body: z.object({
    installationId: z.string().trim(),
    sessionId: z.string().trim()
  })
});

export const GetOrgInstallStatusv1 = z.object({
  params: z.object({ organizationId: z.string().trim() })
});

export const GetOrgRisksv1 = z.object({
  params: z.object({ organizationId: z.string().trim() })
});

export const UpdateRiskStatusv1 = z.object({
  params: z.object({ organizationId: z.string().trim(), riskId: z.string().trim() }),
  body: z.object({
    status: z.string().refine(value => Object.values(RiskStatus).includes(value as RiskStatus)),
  }),
});
