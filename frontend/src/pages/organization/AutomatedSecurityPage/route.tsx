import { faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { AutomatedSecurityPage } from "./AutomatedSecurityPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/automated-security"
)({
  component: AutomatedSecurityPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Home",
        icon: () => <FontAwesomeIcon icon={faHome} />,
        link: linkOptions({ to: "/organization/secret-manager/overview" })
      },
      {
        label: "Automated Security Page"
      }
    ]
  })
});
