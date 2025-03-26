import { createFileRoute } from "@tanstack/react-router";

import { ShareSecretPage } from "./ShareSecretPage";

export const Route = createFileRoute("/share-secret")({
  component: ShareSecretPage
});
