import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TChecklySync } from "@app/hooks/api/secretSyncs/types/checkly-sync";

type Props = {
  secretSync: TChecklySync;
};

export const ChecklySyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Account</DetailLabel>
        <DetailValue>{destinationConfig.accountName}</DetailValue>
      </Detail>
      {destinationConfig.groupId && (
        <Detail>
          <DetailLabel>Group</DetailLabel>
          <DetailValue>{destinationConfig.groupName}</DetailValue>
        </Detail>
      )}
    </>
  );
};
