import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { QoveryVariableType, TQoverySync } from "@app/hooks/api/secretSyncs/types/qovery-sync";

type Props = {
  secretSync: TQoverySync;
};

export const QoverySyncOptionsSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { variableType }
  } = secretSync;

  return (
    <Detail>
      <DetailLabel>Variable Type</DetailLabel>
      <DetailValue>
        {variableType === QoveryVariableType.Variable
          ? "Environment Variable"
          : "Environment Secret"}
      </DetailValue>
    </Detail>
  );
};
