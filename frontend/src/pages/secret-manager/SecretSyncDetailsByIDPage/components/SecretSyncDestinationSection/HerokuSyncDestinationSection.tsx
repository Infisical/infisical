import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { THerokuSync } from "@app/hooks/api/secretSyncs/types/heroku-sync";

type Props = {
  secretSync: THerokuSync;
};

export const HerokuSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { app, appName }
  } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>App Name</DetailLabel>
        <DetailValue>{appName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>App ID</DetailLabel>
        <DetailValue>{app}</DetailValue>
      </Detail>
    </>
  );
};
