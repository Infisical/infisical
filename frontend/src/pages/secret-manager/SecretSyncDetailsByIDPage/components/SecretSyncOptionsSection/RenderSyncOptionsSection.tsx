import { GenericFieldLabel } from "@app/components/secret-syncs";
import { Badge } from "@app/components/v2";
import { TRenderSync } from "@app/hooks/api/secretSyncs/render-sync";

type Props = {
  secretSync: TRenderSync;
};

export const RenderSyncOptionsSection = ({ secretSync }: Props) => {
  const {
    syncOptions: { autoRedeployServices }
  } = secretSync;

  return (
    <div>
      {autoRedeployServices ? (
        <GenericFieldLabel label="Auto Redeploy Services">
          <Badge variant="success">Enabled</Badge>
        </GenericFieldLabel>
      ) : (
        <GenericFieldLabel label="Auto Redeploy Services">
          <Badge variant="danger">Disabled</Badge>
        </GenericFieldLabel>
      )}
    </div>
  );
};
