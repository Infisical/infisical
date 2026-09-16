import { useState } from "react";
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

export const QuickSearchSecretCopyButton = ({ environment, secretPath, secretKey, secretValueHidden }: Props) => {
  const { currentProject } = useProject();
  const [isCopied, , setIsCopied] = useTimedReset<boolean>({ initialState: false });
  const [isCopying, setIsCopying] = useState(false);

  const handleCopy = async () => {
    setIsCopying(true);
    try {
      const data = await fetchSecretValue({ environment, secretPath, secretKey, projectId: currentProject.id });
      const value = data.valueOverride ?? data.value;
      if (value === undefined) throw new Error("Secret value is unavailable");
      await navigator.clipboard.writeText(value);
      createNotification({ type: "info", title: "Secret value copied.", text: "" });
      setIsCopied(true);
    } catch {
      createNotification({ type: "error", text: "Could not copy secret value. Check your access and try again." });
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
        {secretValueHidden ? "You do not have permission to view this secret value" : "Copy secret value"}
      </TooltipContent>
    </Tooltip>
  );
};
