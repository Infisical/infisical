import { createFileRoute, linkOptions } from "@tanstack/react-router";

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
          link: linkOptions({ to: "/admin" })
        },
        {
          label: "Encryption",
          link: linkOptions({
            to: "/admin/encryption"
          })
        }
      ]
    };
  }
});
