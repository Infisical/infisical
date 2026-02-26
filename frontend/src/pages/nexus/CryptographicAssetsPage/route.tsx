import { createFileRoute } from "@tanstack/react-router";

import { CryptographicAssetsPage } from "./CryptographicAssetsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/nexus/$projectId/_nexus-layout/cryptographic-assets"
)({
  component: CryptographicAssetsPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Cryptographic Assets"
        }
      ]
    };
  }
});
