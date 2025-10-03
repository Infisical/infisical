import { TPkiSync } from "@app/hooks/api/pkiSyncs";

export const getPkiSyncDestinationColValues = (pkiSync: TPkiSync) => {
  const { destination } = pkiSync;

  switch (destination) {
    default:
      return {
        primaryText: pkiSync.name,
        secondaryText: pkiSync.appConnectionName || "Unknown Connection"
      };
  }
};
