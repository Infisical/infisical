import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TSpaceliftSync } from "@app/hooks/api/secretSyncs/types/spacelift-sync";

type Props = {
  secretSync: TSpaceliftSync;
};

export const SpaceliftSyncOptionsSection = ({ secretSync }: Props) => {
  const {
    syncOptions: { writeOnly }
  } = secretSync;

  return (
    <Detail>
      <DetailLabel>Mark as Secret</DetailLabel>
      <DetailValue>
        <Badge variant={writeOnly ? "success" : "neutral"}>
          {writeOnly ? "Enabled" : "Disabled"}
        </Badge>
      </DetailValue>
    </Detail>
  );
};
