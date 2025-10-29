import { useCallback, useContext } from "react";
import { useFetchSecretValue } from "../api/dashboard/queries";
import { TGetSecretValueDTO } from "../api/dashboard/types"
import { HandleCreateSharedSecretPopupOpenContext } from "@app/pages/organization/SecretSharingPage/components/ShareSecret/ShareSecretModalProvider";

interface CreateSharedSecretParams {
    getFetchedValue?: () => string | undefined
    fetchSecretParams?: TGetSecretValueDTO
}


export function useCreateSharedSecretPopup({getFetchedValue, fetchSecretParams}: CreateSharedSecretParams) {
    const fetchSecretValue = useFetchSecretValue();

  const handleOpenPopup = useContext(HandleCreateSharedSecretPopupOpenContext)

    const createSharedSecret = useCallback(async () => {
        let value = getFetchedValue?.()

        if(typeof value !== "string" && fetchSecretParams) {
            const data = await fetchSecretValue(fetchSecretParams);
            value = data.valueOverride ?? data.value
        }

        handleOpenPopup?.(value || "")
    }, [])

    return createSharedSecret
}

