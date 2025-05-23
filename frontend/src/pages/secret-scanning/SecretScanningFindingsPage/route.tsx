import { createFileRoute } from "@tanstack/react-router";

import { SecretScanningFindingsPage } from "./SecretScanningFindingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-scanning/$projectId/_secret-scanning-layout/findings"
)({
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Findings"
        }
      ]
    };
  },
  component: SecretScanningFindingsPage
});
