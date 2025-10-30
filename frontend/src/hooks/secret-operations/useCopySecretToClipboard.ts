import { useCallback, useEffect } from "react";

import { createNotification } from "@app/components/notifications";

import { useFetchSecretValue } from "../api/dashboard/queries";
import { TGetSecretValueDTO } from "../api/dashboard/types";
import { useToggle } from "../useToggle";

interface CopySecretHookParams {
  getFetchedValue?: () => string;
  fetchSecretParams: TGetSecretValueDTO;
}

export function useCopySecretToClipBoard({
  getFetchedValue,
  fetchSecretParams
}: CopySecretHookParams) {
  const fetchSecretValue = useFetchSecretValue();
  const [isSecretValueCopied, setIsSecretValueCopied] = useToggle();

  useEffect(() => {
    if (!isSecretValueCopied) {
      return;
    }

    const timer = setTimeout(() => setIsSecretValueCopied.off(), 2000);

    // eslint-disable-next-line consistent-return
    return () => clearTimeout(timer);
  }, [isSecretValueCopied]);

  const copySecretToClipboard = useCallback(async () => {
    if (getFetchedValue) {
      navigator.clipboard.writeText(getFetchedValue());
      setIsSecretValueCopied.on();
      return;
    }

    try {
      const data = await fetchSecretValue(fetchSecretParams);
      navigator.clipboard.writeText(data.valueOverride ?? data.value);
      setIsSecretValueCopied.on();
    } catch (e) {
      console.error(e);
      createNotification({
        type: "error",
        text: "Failed to fetch secret value"
      });
    }
  }, []);

  return { copySecretToClipboard, isSecretValueCopied };
}
