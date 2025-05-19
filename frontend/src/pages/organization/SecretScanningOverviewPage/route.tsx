import { faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SecretScanningOverviewPage } from "./SecretScanningOverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/secret-scanning/overview"
)({
  component: SecretScanningOverviewPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Products",
        icon: () => <FontAwesomeIcon icon={faHome} />
      },
      {
        label: "Secret Scanning",
        link: linkOptions({ to: "/organization/secret-scanning/overview" })
      }
    ]
  })
});
