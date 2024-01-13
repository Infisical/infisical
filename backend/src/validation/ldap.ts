import { z } from "zod";

export const GetLdapConfigv1 = z.object({
    query: z.object({ organizationId: z.string().trim() })
});

export const CreateLdapConfigv1 = z.object({
    body: z.object({
        organizationId: z.string().trim(),
        isActive: z.boolean(),
        url: z.string().trim(),
        bindDN: z.string().trim(),
        bindPass: z.string().trim(),
        searchBase: z.string().trim(),
        caCert: z.string().trim().default("")
    })
});

export const UpdateLdapConfigv1 = z.object({
    body: z.object({
        organizationId: z.string().trim(),
        isActive: z.boolean().optional(),
        url: z.string().trim().optional(),
        bindDN: z.string().trim().optional(),
        bindPass: z.string().trim().optional(),
        searchBase: z.string().trim().optional(),
        caCert: z.string().trim().optional()
    })
});
