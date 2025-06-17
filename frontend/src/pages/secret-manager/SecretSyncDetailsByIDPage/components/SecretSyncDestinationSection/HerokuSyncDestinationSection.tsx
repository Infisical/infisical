import { GenericFieldLabel } from "@app/components/secret-syncs";
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
      <GenericFieldLabel label="App name">{appName}</GenericFieldLabel>
      <GenericFieldLabel label="App Id">{app}</GenericFieldLabel>
    </>
  );
};
