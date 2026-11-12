import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TCoolifySync } from "@app/hooks/api/secretSyncs/types/coolify-sync";

type Props = {
  secretSync: TCoolifySync;
};

export const CoolifySyncOptionsSection = ({ secretSync }: Props) => {
  const autoRedeployServices = secretSync.syncOptions?.autoRedeployServices;

  return (
    <Detail>
      <DetailLabel>Auto-Redeploy Services</DetailLabel>
      <DetailValue>
        <Badge variant={autoRedeployServices ? "success" : "danger"}>
          {autoRedeployServices ? "Enabled" : "Disabled"}
        </Badge>
      </DetailValue>
    </Detail>
  );
};
