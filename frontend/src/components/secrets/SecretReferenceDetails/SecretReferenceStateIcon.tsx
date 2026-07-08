import { type MouseEventHandler } from "react";
import { GitBranchIcon, WorkflowIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

type Props = {
  isConsumer?: boolean;
  isProvider?: boolean;
  className?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

const getSecretReferenceStateLabel = (isConsumer?: boolean, isProvider?: boolean) => {
  if (isConsumer && isProvider) {
    return "This secret references other secrets and is referenced by other secrets";
  }

  if (isConsumer) {
    return "This secret references other secrets";
  }

  return "This secret is referenced by other secrets";
};

export const SecretReferenceStateIcon = ({ isConsumer, isProvider, className, onClick }: Props) => {
  if (!isConsumer && !isProvider) return null;

  const label = getSecretReferenceStateLabel(isConsumer, isProvider);
  const content =
    isConsumer && isProvider ? (
      <>
        <GitBranchIcon className="size-3.5" />
        <span className="absolute right-0.5 bottom-0.5 size-1.5 rounded-full bg-current" />
      </>
    ) : (
      <WorkflowIcon className="size-3.5" />
    );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {onClick ? (
          <button
            type="button"
            aria-label={`${label}. View reference details`}
            className={cn(
              "relative flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted transition-colors hover:bg-container-hover",
              isConsumer && "text-primary",
              isProvider && "text-secret",
              isConsumer && isProvider && "text-project",
              className
            )}
            onClick={onClick}
          >
            {content}
          </button>
        ) : (
          <span
            aria-label={label}
            className={cn(
              "relative flex size-5 shrink-0 items-center justify-center text-muted",
              isConsumer && "text-primary",
              isProvider && "text-secret",
              isConsumer && isProvider && "text-project",
              className
            )}
            role="img"
          >
            {content}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
};
