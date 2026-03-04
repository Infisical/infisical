import { ClipboardCheckIcon, CopyIcon } from "lucide-react";

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
    isError: isErrorFetchingSecretValue
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
    const value = getValue();
    if (value && value !== HIDDEN_SECRET_VALUE) {
      await navigator.clipboard.writeText(value);
      setIsCopied(true);
      createNotification({
        type: "success",
        text: "Copied secret to clipboard"
      });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <SecretInput
          value={getValue()}
          onFocus={() => setIsFieldFocused.on()}
          onBlur={() => setIsFieldFocused.off()}
          isReadOnly
        />
      </div>
      <Tooltip>
        <TooltipTrigger>
          <UnstableIconButton
            variant="ghost"
            size="xs"
            className="w-0 overflow-hidden border-0 opacity-0 group-hover:w-7 group-hover:opacity-100"
            onClick={handleCopyValue}
          >
            {isCopied ? <ClipboardCheckIcon /> : <CopyIcon />}
          </UnstableIconButton>
        </TooltipTrigger>
        <TooltipContent>{isCopied ? "Copied" : "Copy value"}</TooltipContent>
      </Tooltip>
    </div>
  );
};
