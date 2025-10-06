import { GenericFieldLabel } from "@app/components/secret-syncs";
import { Badge } from "@app/components/v2";
import { TCoolifySync } from "@app/hooks/api/secretSyncs/types/coolify-sync";

type Props = {
  secretSync: TCoolifySync;
};

export const CoolifySyncOptionsSection = ({ secretSync }: Props) => {
  const {
    syncOptions: { autoRedeployServices }
  } = secretSync;

  return (
    <GenericFieldLabel label="Auto Redeploy Applications">
      <Badge variant={autoRedeployServices ? "success" : "danger"}>
        {autoRedeployServices ? "Enabled" : "Disabled"}
      </Badge>
    </GenericFieldLabel>
  );
};
