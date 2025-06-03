import { faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SecretScanningSettingsPage } from "./SecretScanningSettingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/secret-scanning/settings"
)({
  component: SecretScanningSettingsPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Products",
        icon: () => <FontAwesomeIcon icon={faHome} />
      },
      {
        label: "Secret Scanning",
        link: linkOptions({ to: "/organization/secret-scanning/overview" })
      },
      {
        label: "Settings"
      }
    ]
  })
});
