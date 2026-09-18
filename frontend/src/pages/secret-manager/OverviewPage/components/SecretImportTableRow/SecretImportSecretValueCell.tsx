import { ClipboardCheckIcon, CopyIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  IconButton,
  SecretInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { HIDDEN_SECRET_VALUE } from "@app/const/secrets";
import { useProject } from "@app/context";
import { useTimedReset, useToggle } from "@app/hooks";
import { useGetSecretValue } from "@app/hooks/api/dashboard/queries";

import {
  TABLE_ROW_ACTION_BAR_CLASS_NAME,
  TABLE_ROW_ACTION_BUTTON_CLASS_NAME
} from "../tableRowActionStyles";

type Props = {
  secretKey: string;
  environment: string;
  secretPath?: string;
  isEmpty?: boolean;
  isVisible?: boolean;
};

export const SecretImportSecretValueCell = ({
  secretKey,
  environment,
  secretPath = "/",
  isEmpty,
  isVisible
}: Props) => {
  const [isFieldFocused, setIsFieldFocused] = useToggle();
  const [isCopied, , setIsCopied] = useTimedReset<boolean>({ initialState: false });
  const { currentProject } = useProject();

  const canFetchSecretValue = !isEmpty;

  const {
    data: secretValue,
    isPending: isPendingSecretValue,
    isError: isErrorFetchingSecretValue,
    refetch: refetchSecretValue
  } = useGetSecretValue(
    {
      environment,
      secretPath,
      secretKey,
      projectId: currentProject.id
    },
    {
      enabled: (isFieldFocused || isVisible) && canFetchSecretValue
    }
  );

  const isLoadingSecretValue = canFetchSecretValue && isPendingSecretValue;

  const getValue = () => {
    if (isLoadingSecretValue) return HIDDEN_SECRET_VALUE;
    if (isErrorFetchingSecretValue) return "Error loading secret value";
    return secretValue?.value || "";
  };

  const handleCopyValue = async () => {
    try {
      if (secretValue?.value) {
        await navigator.clipboard.writeText(secretValue.value);
      } else {
        const { data, error } = await refetchSecretValue();
        if (error || !data) throw error ?? new Error("No data");
        await navigator.clipboard.writeText(data.value ?? "");
      }
      setIsCopied(true);
      createNotification({
        type: "success",
        text: "Copied secret to clipboard"
      });
    } catch (e) {
      console.error(e);
      createNotification({
        type: "error",
        text: "Failed to fetch secret value."
      });
    }
  };

  return (
    <div className="relative flex items-center gap-2">
      <div className="flex-1">
        <SecretInput
          variant="plain"
          value={getValue()}
          isVisible={isVisible}
          onFocus={() => setIsFieldFocused.on()}
          onBlur={() => setIsFieldFocused.off()}
          isReadOnly
        />
      </div>
      <div
        className={twMerge(
          "absolute top-1/2 -right-1.5 z-20 -translate-y-1/2",
          "flex items-center rounded-md border border-border bg-container-hover px-0.5 py-0.5 shadow-md",
          TABLE_ROW_ACTION_BAR_CLASS_NAME
        )}
      >
        <Tooltip>
          <TooltipTrigger>
            <IconButton
              aria-label={`Copy value for ${secretKey}`}
              variant="ghost"
              size="xs"
              className={TABLE_ROW_ACTION_BUTTON_CLASS_NAME}
              onClick={handleCopyValue}
            >
              {isCopied ? <ClipboardCheckIcon /> : <CopyIcon />}
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>{isCopied ? "Copied" : "Copy value"}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
