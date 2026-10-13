import { useState } from "react";
import { isAxiosError } from "axios";
import { CheckIcon, CopyIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { IconButton, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { useProject } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { fetchSecretValue } from "@app/hooks/api/dashboard/queries";

type Props = {
  environment: string;
  secretPath: string;
  secretKey: string;
  secretValueHidden: boolean;
};

export const QuickSearchSecretCopyButton = ({
  environment,
  secretPath,
  secretKey,
  secretValueHidden
}: Props) => {
  const { currentProject } = useProject();
  const [isCopied, , setIsCopied] = useTimedReset<boolean>({ initialState: false });
  const [isCopying, setIsCopying] = useState(false);

  const handleCopy = async () => {
    setIsCopying(true);
    try {
      const data = await fetchSecretValue({
        environment,
        secretPath,
        secretKey,
        projectId: currentProject.id
      }).catch((error: unknown) => {
        let message = "Could not load the secret value. Try again.";
        if (isAxiosError<{ message?: string }>(error)) {
          if (error.response?.status === 403) {
            message = "You do not have permission to read this secret value.";
          }
          if (
            typeof error.response?.data?.message === "string" &&
            error.response.data.message.trim()
          ) {
            message = error.response.data.message;
          }
        }
        createNotification({ type: "error", text: message });
      });
      if (!data) return;
      const value = data.valueOverride ?? data.value;
      if (value === undefined) {
        createNotification({
          type: "error",
          text: "Secret value is unavailable. Refresh the results and try again."
        });
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        createNotification({
          type: "error",
          text: "Could not write to the clipboard. Check your browser's clipboard permissions and try again."
        });
        return;
      }
      createNotification({ type: "info", title: "Secret value copied.", text: "" });
      setIsCopied(true);
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          variant="ghost"
          className="mr-2"
          size="xs"
          isDisabled={secretValueHidden || isCopying}
          aria-label="Copy secret value"
          onClick={(e) => {
            e.stopPropagation();
            handleCopy();
          }}
        >
          {isCopied ? <CheckIcon /> : <CopyIcon />}
        </IconButton>
      </TooltipTrigger>
      <TooltipContent>
        {secretValueHidden
          ? "You do not have permission to view this secret value"
          : "Copy secret value"}
      </TooltipContent>
    </Tooltip>
  );
};
