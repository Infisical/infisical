import { z } from "zod";

export const GetCloudProductsV1 = z.object({
  query: z.object({
    "billing-cycle": z.enum(["monthly", "yearly"])
  })
});
