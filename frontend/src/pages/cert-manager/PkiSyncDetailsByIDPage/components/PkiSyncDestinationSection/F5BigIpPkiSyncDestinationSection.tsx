import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { F5BigIpProfileType, TF5BigIpPkiSync } from "@app/hooks/api/pkiSyncs/types/f5-big-ip-sync";

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
      <Detail>
        <DetailLabel>Partition</DetailLabel>
        <DetailValue>{partition || "Common"}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Profile Binding</DetailLabel>
        <DetailValue>{PROFILE_TYPE_LABELS[resolvedProfileType]}</DetailValue>
      </Detail>
      {hasProfileBinding && profileName ? (
        <Detail>
          <DetailLabel>
            {resolvedProfileType === F5BigIpProfileType.ServerSsl
              ? "Server SSL Profile Name"
              : "Client SSL Profile Name"}
          </DetailLabel>
          <DetailValue>{profileName}</DetailValue>
        </Detail>
      ) : null}
      {hasProfileBinding && createProfileIfMissing ? (
        <Detail>
          <DetailLabel>Create profile if missing</DetailLabel>
          <DetailValue>Yes</DetailValue>
        </Detail>
      ) : null}
      {hasProfileBinding && createProfileIfMissing && parentProfile ? (
        <Detail>
          <DetailLabel>Parent Profile</DetailLabel>
          <DetailValue>{parentProfile}</DetailValue>
        </Detail>
      ) : null}
    </>
  );
};
