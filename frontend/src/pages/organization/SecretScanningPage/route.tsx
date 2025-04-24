import { faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretScanningPage } from "./SecretScanningPage";

const SecretScanningQueryParams = z.object({
  state: z.string().catch(""),
  installation_id: z.coerce.string().optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/secret-scanning"
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
        label: "Home",
        icon: () => <FontAwesomeIcon icon={faHome} />,
        link: linkOptions({ to: "/" })
      },
      {
        label: "Secret Scanning"
      }
    ]
  })
});
