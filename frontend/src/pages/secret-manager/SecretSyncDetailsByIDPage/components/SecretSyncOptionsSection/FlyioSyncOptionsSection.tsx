import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TFlyioSync } from "@app/hooks/api/secretSyncs/types/flyio-sync";

type Props = {
  secretSync: TFlyioSync;
};

export const FlyioSyncOptionsSection = ({ secretSync }: Props) => {
  const {
    syncOptions: { autoRedeploy }
  } = secretSync;

  return (
    <Detail>
      <DetailLabel>Auto Redeploy On Secret Change</DetailLabel>
      <DetailValue>
        <Badge variant={autoRedeploy ? "success" : "danger"}>
          {autoRedeploy ? "Enabled" : "Disabled"}
        </Badge>
      </DetailValue>
    </Detail>
  );
};
