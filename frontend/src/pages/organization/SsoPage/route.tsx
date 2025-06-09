import { faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SsoPage } from "./SsoPage";

const SettingsPageQueryParams = z.object({
  selectedTab: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/sso"
)({
  component: SsoPage,
  validateSearch: zodValidator(SettingsPageQueryParams),
  search: {
    middlewares: [stripSearchParams({ selectedTab: "" })]
  },
  context: () => ({
    breadcrumbs: [
      {
        label: "Home",
        icon: () => <FontAwesomeIcon icon={faHome} />,
        link: linkOptions({ to: "/" })
      },
      {
        label: "Single Sign-On (SSO)"
      }
    ]
  })
});
