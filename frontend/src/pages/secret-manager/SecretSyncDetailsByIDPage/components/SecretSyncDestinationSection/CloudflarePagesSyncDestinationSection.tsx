import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TCloudflarePagesSync } from "@app/hooks/api/secretSyncs/types/cloudflare-pages-sync";

type Props = {
  secretSync: TCloudflarePagesSync;
};

export const CloudflarePagesSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { projectName, environment }
  } = secretSync;

  return (
    <>
      <GenericFieldLabel label="Project">{projectName}</GenericFieldLabel>
      <GenericFieldLabel label="Environment">{environment}</GenericFieldLabel>
    </>
  );
};
