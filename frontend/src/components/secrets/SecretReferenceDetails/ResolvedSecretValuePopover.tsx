import { useEffect } from "react";
import { AxiosError } from "axios";
import { ClipboardCheckIcon, CopyIcon, LinkIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SecretInput,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { useGetSecretReferenceTree } from "@app/hooks/api";
import { ApiErrorTypes, TApiErrors } from "@app/hooks/api/types";

type Props = {
  environment: string;
  secretPath: string;
  secretKey: string;
};

type PopoverProps = Props & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDisabled?: boolean;
};

const ResolvedValueContent = ({ environment, secretPath, secretKey }: Props) => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";
  const [isCopied, , setIsCopied] = useTimedReset<boolean>({ initialState: false });

  const { data, isPending, isError, error } = useGetSecretReferenceTree({
    secretPath,
    environmentSlug: environment,
    projectId,
    secretKey
  });

  if (isPending) {
    return (
      <div className="p-3">
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  if (isError) {
    const axiosError = error instanceof AxiosError ? error : undefined;
    const apiError = axiosError?.response?.data as TApiErrors | undefined;
    const isForbidden = apiError?.error === ApiErrorTypes.CustomForbiddenError;

    return (
      <p className="p-3 text-sm text-danger">
        {isForbidden
          ? "You do not have permission to view one of the referenced secrets."
          : "Failed to resolve secret value."}
      </p>
    );
  }

  const handleCopy = async () => {
    try {
      await window.navigator.clipboard.writeText(data?.value ?? "");
      setIsCopied(true);
    } catch {
      // swallow; clipboard unavailable
    }
  };

  return (
    <div className="relative">
      <SecretInput
        aria-label="Resolved secret value"
        containerClassName="min-h-9 py-2 pr-10 pl-3 font-mono"
        isReadOnly
        isVisible
        value={data?.value ?? ""}
        variant="plain"
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            variant="ghost-muted"
            size="xs"
            className="absolute top-1/2 right-2 -translate-y-1/2"
            onClick={handleCopy}
            aria-label="Copy resolved value"
          >
            {isCopied ? <ClipboardCheckIcon /> : <CopyIcon />}
          </IconButton>
        </TooltipTrigger>
        <TooltipContent>{isCopied ? "Copied" : "Copy"}</TooltipContent>
      </Tooltip>
    </div>
  );
};

export const ResolvedSecretValuePopover = ({
  environment,
  secretPath,
  secretKey,
  open,
  onOpenChange,
  isDisabled
}: PopoverProps) => {
  useEffect(() => {
    if (isDisabled && open) onOpenChange(false);
  }, [isDisabled, open, onOpenChange]);

  return (
    <Popover open={open && !isDisabled} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <IconButton
              variant="ghost-muted"
              size="xs"
              className={twMerge(
                "absolute -top-1 -left-1",
                isDisabled && "cursor-not-allowed opacity-50"
              )}
              aria-label="View resolved secret value"
              aria-disabled={isDisabled}
              onClick={(e) => {
                e.stopPropagation();
                if (isDisabled) e.preventDefault();
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <LinkIcon />
            </IconButton>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {isDisabled ? "Save pending changes to view resolved value" : "View resolved value"}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        className="w-96 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {open && (
          <ResolvedValueContent
            environment={environment}
            secretPath={secretPath}
            secretKey={secretKey}
          />
        )}
      </PopoverContent>
    </Popover>
  );
};
