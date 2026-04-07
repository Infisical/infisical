import { ClipboardCheckIcon, CopyIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { SecretInput } from "@app/components/v2";
import { Tooltip, TooltipContent, TooltipTrigger, UnstableIconButton } from "@app/components/v3";
import { useProject } from "@app/context";
import { useTimedReset, useToggle } from "@app/hooks";
import { useGetSecretValue } from "@app/hooks/api/dashboard/queries";
import { HIDDEN_SECRET_VALUE } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

type Props = {
  secretKey: string;
  environment: string;
  secretPath?: string;
  isEmpty?: boolean;
};

export const SecretImportSecretValueCell = ({
  secretKey,
  environment,
  secretPath = "/",
  isEmpty
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
      enabled: isFieldFocused && canFetchSecretValue
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
        const { data } = await refetchSecretValue();
        await navigator.clipboard.writeText(data?.value ?? "");
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
          value={getValue()}
          onFocus={() => setIsFieldFocused.on()}
          onBlur={() => setIsFieldFocused.off()}
          isReadOnly
        />
      </div>
      <div
        className={twMerge(
          "absolute top-1/2 -right-1.5 z-20 -translate-y-1/2",
          "flex items-center rounded-md border border-border bg-container-hover px-0.5 py-0.5 shadow-md",
          "pointer-events-none opacity-0 transition-all duration-300",
          "group-hover:pointer-events-auto group-hover:gap-1 group-hover:opacity-100"
        )}
      >
        <Tooltip>
          <TooltipTrigger>
            <UnstableIconButton
              variant="ghost"
              size="xs"
              className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7"
              onClick={handleCopyValue}
            >
              {isCopied ? <ClipboardCheckIcon /> : <CopyIcon />}
            </UnstableIconButton>
          </TooltipTrigger>
          <TooltipContent>{isCopied ? "Copied" : "Copy value"}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
