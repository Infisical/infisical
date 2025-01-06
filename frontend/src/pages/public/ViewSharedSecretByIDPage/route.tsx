import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ViewSharedSecretByIDPage } from "./ViewSharedSecretByIDPage";

const SharedSecretByIDPageQuerySchema = z.object({
  key: z.string().catch("")
});

export const Route = createFileRoute("/shared/secret/$secretId")({
  component: ViewSharedSecretByIDPage,
  validateSearch: zodValidator(SharedSecretByIDPageQuerySchema),
  search: {
    middlewares: [stripSearchParams({ key: "" })]
  }
});
