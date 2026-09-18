import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TRenderSync } from "@app/hooks/api/secretSyncs/types/render-sync";

type Props = {
  secretSync: TRenderSync;
};

export const RenderSyncOptionsSection = ({ secretSync }: Props) => {
  const {
    syncOptions: { autoRedeployServices }
  } = secretSync;

  return (
    <Detail>
      <DetailLabel>Auto Redeploy Services</DetailLabel>
      <DetailValue>
        <Badge variant={autoRedeployServices ? "success" : "danger"}>
          {autoRedeployServices ? "Enabled" : "Disabled"}
        </Badge>
      </DetailValue>
    </Detail>
  );
};
