import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretSharingPage } from "./SecretSharingPage";

const SecretSharingQueryParams = z.object({
  selectedTab: z.string().catch("").default("share-secret")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/secret-sharing/"
)({
  component: SecretSharingPage,

  validateSearch: zodValidator(SecretSharingQueryParams),
  search: {
    middlewares: [stripSearchParams({ selectedTab: "" })]
  },
  context: () => ({
    breadcrumbs: [
      {
        label: "Secret Sharing"
      }
    ]
  })
});
