import { z } from "zod";

import { AppConnection } from "../app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { GiteaConnectionMethod } from "./gitea-connection-enums";

export const GiteaConnectionListItemSchema = z
  .object({
    name: z.literal("Gitea"),
    app: z.literal(AppConnection.Gitea),
    methods: z.nativeEnum(GiteaConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Gitea] }));
