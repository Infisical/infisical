import { createFileRoute } from "@tanstack/react-router";

import { useServerConfig } from "@app/context";

import { NotFoundPage } from "../NotFoundPage/NotFoundPage";
import { ShareSecretPage } from "./ShareSecretPage";

const ShareSecretRoute = () => {
  const { config } = useServerConfig();

  if (config.isPublicSecretSharingDisabled) {
    return <NotFoundPage />;
  }

  return <ShareSecretPage />;
};

export const Route = createFileRoute("/share-secret")({
  component: ShareSecretRoute
});
