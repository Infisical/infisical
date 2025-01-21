import { faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SecretSharingPage } from "./SecretSharingPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/secret-sharing"
)({
  component: SecretSharingPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Home",
        icon: () => <FontAwesomeIcon icon={faHome} />,
        link: linkOptions({ to: "/" })
      },
      {
        label: "secret sharing"
      }
    ]
  })
});
