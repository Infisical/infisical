import { faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SecretManagerSettingsPage } from "./SecretManagerSettingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/secret-manager/settings"
)({
  component: SecretManagerSettingsPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Products",
        icon: () => <FontAwesomeIcon icon={faHome} />
      },
      {
        label: "Secret Management",
        link: linkOptions({ to: "/organization/secret-manager/overview" })
      },
      {
        label: "Settings"
      }
    ]
  })
});
