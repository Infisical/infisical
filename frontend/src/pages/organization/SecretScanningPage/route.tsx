import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretScanningPage } from "./SecretScanningPage";

const SecretScanningQueryParams = z.object({
  state: z.string().catch(""),
  installation_id: z.coerce.string().optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/secret-scanning"
)({
  validateSearch: zodValidator(SecretScanningQueryParams),
  component: SecretScanningPage,
  search: {
    middlewares: [
      stripSearchParams({
        installation_id: "",
        state: ""
      })
    ]
  },
  context: () => ({
    breadcrumbs: [
      {
        label: "home",
        link: linkOptions({ to: "/" })
      },
      {
        label: "secret scanning"
      }
    ]
  })
});
