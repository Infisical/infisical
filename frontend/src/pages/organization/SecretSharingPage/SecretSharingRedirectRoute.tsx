import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

// Secret Sharing moved under the Secret Manager product. Keep the old org-level URL working
// for bookmarks and the request link emailed by the backend (secret-sharing-service).
const LegacySecretSharingQueryParams = z.object({
  selectedTab: z.string().optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/secret-sharing"
)({
  validateSearch: LegacySecretSharingQueryParams,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/organizations/$orgId/projects/secret-management/secret-sharing",
      params: { orgId: params.orgId },
      search
    });
  }
});
