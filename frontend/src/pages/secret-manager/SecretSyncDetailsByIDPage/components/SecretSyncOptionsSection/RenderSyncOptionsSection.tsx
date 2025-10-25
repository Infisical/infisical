import { GenericFieldLabel } from "@app/components/secret-syncs";
import { Badge } from "@app/components/v3";
import { TRenderSync } from "@app/hooks/api/secretSyncs/types/render-sync";

type Props = {
  secretSync: TRenderSync;
};

export const RenderSyncOptionsSection = ({ secretSync }: Props) => {
  const {
    syncOptions: { autoRedeployServices }
  } = secretSync;

  return (
    <GenericFieldLabel label="Auto Redeploy Services">
      <Badge variant={autoRedeployServices ? "success" : "danger"}>
        {autoRedeployServices ? "Enabled" : "Disabled"}
      </Badge>
    </GenericFieldLabel>
  );
};
