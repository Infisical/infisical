import { z } from "zod";

export enum CreateProjectIdentityMode {
  Create = "create",
  Assign = "assign"
}

export const createProjectIdentitySchema = z
  .object({
    mode: z.nativeEnum(CreateProjectIdentityMode),
    name: z.string().optional(),
    identity: z.object({ id: z.string(), name: z.string() }).optional(),
    role: z.object({ slug: z.string(), name: z.string() }),
    // Ids of the policy templates selected in the optional section; permissions are
    // derived from these as a union at submit time.
    templateIds: z.array(z.string()).default([])
  })
  .superRefine((data, ctx) => {
    if (data.mode === CreateProjectIdentityMode.Create && !data.name?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["name"], message: "Required" });
    }
    if (data.mode === CreateProjectIdentityMode.Assign && !data.identity?.id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["identity"], message: "Required" });
    }
  });

export type TCreateProjectIdentityForm = z.infer<typeof createProjectIdentitySchema>;
