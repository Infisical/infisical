import { PkiSyncData } from "@app/hooks/api/pkiSyncs";

export const getPkiSyncDestinationColValues = (pkiSync: PkiSyncData) => {
  const { destination } = pkiSync;

  switch (destination) {
    default:
      return {
        primaryText: pkiSync.name,
        secondaryText: pkiSync.appConnectionName || "Unknown Connection"
      };
  }
};
