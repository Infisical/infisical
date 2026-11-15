import { z } from "zod";

import { AppConnection } from "@app/hooks/api/appConnections/enums";

export const appConnectionsSearch = z.object({
  connectionId: z.string().optional(),
  connectionName: z.string().optional(),
  addConnectionApp: z.nativeEnum(AppConnection).optional()
});
