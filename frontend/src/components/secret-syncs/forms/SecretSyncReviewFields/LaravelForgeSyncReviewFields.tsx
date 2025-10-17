import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const LaravelForgeSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.LaravelForge }>();
  const orgName = watch("destinationConfig.orgName");
  const orgSlug = watch("destinationConfig.orgSlug");
  const serverName = watch("destinationConfig.serverName");
  const serverId = watch("destinationConfig.serverId");
  const siteName = watch("destinationConfig.siteName");
  const siteId = watch("destinationConfig.siteId");

  return (
    <>
      <GenericFieldLabel label="Account">{orgName || orgSlug}</GenericFieldLabel>
      <GenericFieldLabel label="Server">{serverName || serverId || "None"}</GenericFieldLabel>
      <GenericFieldLabel label="Site">{siteName || siteId || "None"}</GenericFieldLabel>
    </>
  );
};
