import { z } from "zod";

import { GiteaSyncListItemSchema } from "./gitea-sync-schemas";

export type TGiteaSyncListItem = z.infer<typeof GiteaSyncListItemSchema>;
