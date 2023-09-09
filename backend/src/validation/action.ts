import { z } from "zod";

export const GetActionV1 = z.object({
  params: z.object({
    actionId: z.string().trim()
  })
});

export const AddUserActionV1 = z.object({
  body: z.object({
    action: z.string().trim()
  })
});

export const GetUserActionV1 = z.object({
  query: z.object({
    action: z.string().trim()
  })
});
