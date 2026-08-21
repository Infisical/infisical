import { createFileRoute } from "@tanstack/react-router";

import { EncryptionPage } from "./EncryptionPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/admin/_admin-layout/encryption"
)({
  component: EncryptionPage,
  beforeLoad: async () => {
    return {
      breadcrumbs: [
        {
          label: "Admin",
          link: { to: "/admin" as const }
        },
        {
          label: "Encryption",
          link: { to: "/admin/encryption" as const }
        }
      ]
    };
  }
});
