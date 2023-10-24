import { z } from "zod";

export const CreateAPIKeyV3 = z.object({
    body: z.object({
        name: z.string().trim()
    })
});

export const UpdateAPIKeyV3 = z.object({
    params: z.object({
        apiKeyDataId: z.string().trim()
    }),
    body: z.object({
        name: z.string().trim()
    })
});

export const DeleteAPIKeyV3 = z.object({
    params: z.object({
        apiKeyDataId: z.string().trim()
    })
});