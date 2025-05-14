import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { PkiCollectionDetailsByIDPage } from "./PkiCollectionDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/cert-manager/$projectId/_cert-manager-layout/pki-collections/$collectionId"
)({
  component: PkiCollectionDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificate Collections",
          link: linkOptions({
            to: "/cert-manager/$projectId/certificates",
            params: {
              projectId: params.projectId
            }
          })
        }
      ]
    };
  }
});
