import { faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { AdminPage } from "./AdminPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/admin"
)({
  component: AdminPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Home",
        icon: () => <FontAwesomeIcon icon={faHome} />,
        link: linkOptions({ to: "/organization/secret-manager/overview" })
      },
      {
        label: "Admin Console"
      }
    ]
  })
});
