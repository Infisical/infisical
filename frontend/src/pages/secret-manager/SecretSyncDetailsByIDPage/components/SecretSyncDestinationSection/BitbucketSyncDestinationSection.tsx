import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TBitbucketSync } from "@app/hooks/api/secretSyncs/types/bitbucket-sync";

type Props = {
  secretSync: TBitbucketSync;
};

export const BitbucketSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { workspace, repository, environment }
  } = secretSync;

  return (
    <>
      <GenericFieldLabel label="Workspace">{workspace}</GenericFieldLabel>
      <GenericFieldLabel label="Repository">{repository}</GenericFieldLabel>
      {environment && (
        <GenericFieldLabel label="Deployment Environment">{environment}</GenericFieldLabel>
      )}
    </>
  );
};
