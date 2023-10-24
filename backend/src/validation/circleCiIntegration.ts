import * as z from "zod";

export const ZCircleCiMe = z.object({
  followed_projects: z.array(
    z.object({
      name: z.string(),
      slug: z.string()
    })
  )
});
