import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const LaravelForgeSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.LaravelForge }>();
  const orgName = watch("destinationConfig.orgName");
  const orgSlug = watch("destinationConfig.orgSlug");
  const serverName = watch("destinationConfig.serverName");
  const serverId = watch("destinationConfig.serverId");
  const siteName = watch("destinationConfig.siteName");
  const siteId = watch("destinationConfig.siteId");

  const server = serverName || serverId;
  const site = siteName || siteId;

  return (
    <>
      <Detail>
        <DetailLabel>Account</DetailLabel>
        <DetailValue>{orgName || orgSlug}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Server</DetailLabel>
        {server ? (
          <DetailValue>{server}</DetailValue>
        ) : (
          <DetailValue className="text-muted">—</DetailValue>
        )}
      </Detail>
      <Detail>
        <DetailLabel>Site</DetailLabel>
        {site ? (
          <DetailValue>{site}</DetailValue>
        ) : (
          <DetailValue className="text-muted">—</DetailValue>
        )}
      </Detail>
    </>
  );
};
