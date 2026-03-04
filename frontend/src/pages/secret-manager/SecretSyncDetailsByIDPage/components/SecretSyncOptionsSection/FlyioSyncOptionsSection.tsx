import { GenericFieldLabel } from "@app/components/secret-syncs";
import { Badge } from "@app/components/v3";
import { TFlyioSync } from "@app/hooks/api/secretSyncs/types/flyio-sync";

type Props = {
  secretSync: TFlyioSync;
};

export const FlyioSyncOptionsSection = ({ secretSync }: Props) => {
  const {
    syncOptions: { autoRedeploy }
  } = secretSync;

  return (
    <GenericFieldLabel label="Auto Redeploy On Secret Change">
      <Badge variant={autoRedeploy ? "success" : "danger"}>
        {autoRedeploy ? "Enabled" : "Disabled"}
      </Badge>
    </GenericFieldLabel>
  );
};
