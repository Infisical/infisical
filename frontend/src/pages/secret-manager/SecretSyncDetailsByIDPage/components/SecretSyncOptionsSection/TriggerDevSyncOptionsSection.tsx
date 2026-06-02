import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TTriggerDevSync } from "@app/hooks/api/secretSyncs/types/trigger-dev-sync";

type Props = {
  secretSync: TTriggerDevSync;
};

export const TriggerDevSyncOptionsSection = ({ secretSync }: Props) => {
  const {
    syncOptions: { secret }
  } = secretSync;

  return (
    <Detail>
      <DetailLabel>Mark Variables As Secret</DetailLabel>
      <DetailValue>
        <Badge variant={secret ? "success" : "danger"}>{secret ? "Enabled" : "Disabled"}</Badge>
      </DetailValue>
    </Detail>
  );
};
