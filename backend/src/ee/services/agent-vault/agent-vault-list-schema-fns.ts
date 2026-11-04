import { z } from "zod";

export const refineNoDuplicates = (values: string[], ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${value}" is listed twice.`, path: [index] });
    }
    seen.add(value);
  });
};
