import { createFileRoute } from "@tanstack/react-router";

import { PkiCollectionDetailsByIDPage } from "./PkiCollectionDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/cert-manager/$projectId/_cert-manager-layout/pki-collections/$collectionId"
)({
  component: PkiCollectionDetailsByIDPage
});
