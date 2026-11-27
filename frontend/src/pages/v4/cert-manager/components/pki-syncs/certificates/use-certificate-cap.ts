import { getPkiSyncCertificateCap } from "@app/components/pki-syncs/forms/pki-sync-filter-fns";
import type { PkiSync } from "@app/hooks/api/pkiSyncs/enums";

import { useDraftValue } from "../fields";
import { usePkiSyncOption } from "../shared";

export const useFormCertificateCap = () => {
  const destination = useDraftValue<PkiSync>("destination");
  const syncOptions = useDraftValue<Record<string, unknown> | undefined>("syncOptions");
  const destinationConfig = useDraftValue<Record<string, unknown> | undefined>("destinationConfig");
  const { syncOption } = usePkiSyncOption(destination);
  return getPkiSyncCertificateCap({
    destinationMaxCertificates: syncOption?.maxCertificates,
    syncOptions,
    destinationConfig
  });
};
