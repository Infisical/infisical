import { faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { UserDetailsByIDPage } from "./UserDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/members/$membershipId"
)({
  component: UserDetailsByIDPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Home",
        icon: () => <FontAwesomeIcon icon={faHome} />,
        link: linkOptions({ to: "/organization/secret-manager/overview" })
      },
      {
        label: "Access Control",
        link: linkOptions({ to: "/organization/access-management" })
      },
      {
        label: "Users"
      }
    ]
  })
});
