/* eslint-disable jsx-a11y/label-has-associated-control */
import { F5BigIpProfileType, TF5BigIpPkiSync } from "@app/hooks/api/pkiSyncs/types/f5-big-ip-sync";

const GenericFieldLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <p className="text-sm font-medium text-mineshaft-300">{label}</p>
    <div className="text-sm text-mineshaft-300">{children}</div>
  </div>
);

const PROFILE_TYPE_LABELS: Record<F5BigIpProfileType, string> = {
  [F5BigIpProfileType.None]: "None",
  [F5BigIpProfileType.ClientSsl]: "Client SSL Profile",
  [F5BigIpProfileType.ServerSsl]: "Server SSL Profile"
};

type Props = {
  pkiSync: TF5BigIpPkiSync;
};

export const F5BigIpPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const { partition, profileType, profileName, createProfileIfMissing, parentProfile } =
    pkiSync.destinationConfig;
  const resolvedProfileType = profileType ?? F5BigIpProfileType.None;
  const hasProfileBinding = resolvedProfileType !== F5BigIpProfileType.None;

  return (
    <>
      <GenericFieldLabel label="Partition">{partition || "Common"}</GenericFieldLabel>
      <GenericFieldLabel label="Profile Binding">
        {PROFILE_TYPE_LABELS[resolvedProfileType]}
      </GenericFieldLabel>
      {hasProfileBinding && profileName ? (
        <GenericFieldLabel
          label={
            resolvedProfileType === F5BigIpProfileType.ServerSsl
              ? "Server SSL Profile Name"
              : "Client SSL Profile Name"
          }
        >
          {profileName}
        </GenericFieldLabel>
      ) : null}
      {hasProfileBinding && createProfileIfMissing ? (
        <GenericFieldLabel label="Create profile if missing">Yes</GenericFieldLabel>
      ) : null}
      {hasProfileBinding && createProfileIfMissing && parentProfile ? (
        <GenericFieldLabel label="Parent Profile">{parentProfile}</GenericFieldLabel>
      ) : null}
    </>
  );
};
