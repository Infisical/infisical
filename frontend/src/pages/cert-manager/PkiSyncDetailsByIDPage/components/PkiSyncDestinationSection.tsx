/* eslint-disable jsx-a11y/label-has-associated-control */
import { ReactNode } from "react";
import { subject } from "@casl/ability";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { IconButton } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPkiSyncActions } from "@app/context/ProjectPermissionContext/types";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { PkiSync, TPkiSync } from "@app/hooks/api/pkiSyncs";

import {
  AwsCertificateManagerPkiSyncDestinationSection,
  AwsSecretsManagerPkiSyncDestinationSection,
  AzureKeyVaultPkiSyncDestinationSection,
  ChefPkiSyncDestinationSection
} from "./PkiSyncDestinationSection/index";

const GenericFieldLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <p className="text-sm font-medium text-mineshaft-300">{label}</p>
    <div className="text-sm text-mineshaft-300">{children}</div>
  </div>
);

type Props = {
  pkiSync: TPkiSync;
  onEditDestination: VoidFunction;
};

export const PkiSyncDestinationSection = ({ pkiSync, onEditDestination }: Props) => {
  const { destination, subscriberId } = pkiSync;

  const destinationDetails = PKI_SYNC_MAP[destination];

  let DestinationComponents: ReactNode;
  switch (destination) {
    case PkiSync.AwsCertificateManager:
      DestinationComponents = <AwsCertificateManagerPkiSyncDestinationSection pkiSync={pkiSync} />;
      break;
    case PkiSync.AwsSecretsManager:
      DestinationComponents = <AwsSecretsManagerPkiSyncDestinationSection pkiSync={pkiSync} />;
      break;
    case PkiSync.AzureKeyVault:
      DestinationComponents = <AzureKeyVaultPkiSyncDestinationSection pkiSync={pkiSync} />;
      break;
    case PkiSync.Chef:
      DestinationComponents = <ChefPkiSyncDestinationSection pkiSync={pkiSync} />;
      break;
    default:
      // For future destinations, return null (no additional fields to show)
      DestinationComponents = null;
  }

  const permissionSubject = subject(ProjectPermissionSub.PkiSyncs, {
    subscriberId: subscriberId || ""
  });

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="text-lg font-medium text-mineshaft-100">Destination Configuration</h3>
        <ProjectPermissionCan I={ProjectPermissionPkiSyncActions.Edit} a={permissionSubject}>
          {(isAllowed) => (
            <IconButton
              variant="plain"
              colorSchema="secondary"
              isDisabled={!isAllowed}
              ariaLabel="Edit destination"
              onClick={onEditDestination}
            >
              <FontAwesomeIcon icon={faEdit} />
            </IconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="flex w-full flex-wrap gap-8 pt-2">
        <GenericFieldLabel label={`${destinationDetails.name} Connection`}>
          {pkiSync.appConnectionName || "Default Connection"}
        </GenericFieldLabel>
        {DestinationComponents}
      </div>
    </div>
  );
};
