import { z } from "zod";

export type TMCPActivityLog = {
  id: string;
  projectId: string;
  endpointName: string;
  serverName: string;
  toolName: string;
  actor: string;
  request: unknown;
  response: unknown;
  createdAt: string;
  updatedAt: string;
};

export enum MCPActivityLogDateFilterType {
  Relative = "relative",
  Absolute = "absolute"
}

export const mcpActivityLogFilterFormSchema = z.object({
  endpointName: z.string().optional(),
  serverName: z.string().optional(),
  toolName: z.string().optional(),
  actor: z.string().optional()
});

export const mcpActivityLogDateFilterFormSchema = z
  .object({
    startDate: z.date(),
    endDate: z.date(),
    type: z.nativeEnum(MCPActivityLogDateFilterType),
    relativeModeValue: z.string().optional()
  })
  .superRefine((el, ctx) => {
    if (el.type === MCPActivityLogDateFilterType.Absolute && el.startDate > el.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date cannot be before start date"
      });
    }
  });

export type TMCPActivityLogFilterFormData = z.infer<typeof mcpActivityLogFilterFormSchema>;
export type TMCPActivityLogDateFilterFormData = z.infer<typeof mcpActivityLogDateFilterFormSchema>;
