import { z } from "zod";

export const SessionLogsPageSchema = z.object({
  logs: z.array(z.unknown()),
  hasMore: z.boolean(),
  batchCount: z.number()
});
