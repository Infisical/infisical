import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretScanningPage } from "./SecretScanningPage";

const SecretScanningQueryParams = z.object({
  state: z.string().catch(""),
  installation_id: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/secret-scanning"
)({
  component: SecretScanningPage,
  validateSearch: zodValidator(SecretScanningQueryParams),
  search: {
    middlewares: [
      stripSearchParams({
        installation_id: "",
        state: ""
      })
    ]
  }
});
