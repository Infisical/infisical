import { useCallback, useContext } from "react";

import { HandleCreateSharedSecretPopupOpenContext } from "@app/pages/organization/SecretSharingPage/components/ShareSecret/ShareSecretModalProvider";

import { useFetchSecretValue } from "../api/dashboard/queries";
import { TGetSecretValueDTO } from "../api/dashboard/types";

interface CreateSharedSecretParams {
  getFetchedValue?: () => string | undefined;
  fetchSecretParams?: TGetSecretValueDTO;
}

export function useCreateSharedSecretPopup({
  getFetchedValue,
  fetchSecretParams
}: CreateSharedSecretParams) {
  const fetchSecretValue = useFetchSecretValue();

  const handleOpenPopup = useContext(HandleCreateSharedSecretPopupOpenContext);

  const createSharedSecret = useCallback(async () => {
    let value = getFetchedValue?.();

    if (typeof value !== "string" && fetchSecretParams) {
      const data = await fetchSecretValue(fetchSecretParams);
      value = data.valueOverride ?? data.value;
    }

    handleOpenPopup?.(value || "");
  }, [getFetchedValue, fetchSecretParams, fetchSecretValue, handleOpenPopup]);

  return createSharedSecret;
}
