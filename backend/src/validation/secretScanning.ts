import { z } from "zod";

export const CreateInstalLSessionv1 = z.object({
  params: z.object({ organizationId: z.string().trim() })
});

export const LinkInstallationToOrgv1 = z.object({
  body: z.object({
    installationId: z.string(),
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
  body: z.object({ status: z.string().trim() })
});
