import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretScanningPage } from "./SecretScanningPage";

const SecretScanningQueryParams = z.object({
  state: z.string().catch(""),
  installation_id: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/secret-scanning/"
)({
  component: SecretScanningPage,
  validateSearch: zodValidator(SecretScanningQueryParams)
});
