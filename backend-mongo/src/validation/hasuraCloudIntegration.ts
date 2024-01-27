import * as z from "zod";

export const ZGetTenantEnv = z.object({
  data: z.object({
    getTenantEnv: z.object({
      hash: z.string(),
      envVars: z.object({
        environment: z.record(z.any()).optional()
      })
    })
  })
});

export const ZUpdateTenantEnv = z.object({
  data: z.object({
    updateTenantEnv: z.object({
      hash: z.string(),
      envVars: z.record(z.any())
    })
  })
});
