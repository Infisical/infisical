import { useReducer } from "react";
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react";

import {
  Detail,
  DetailLabel,
  DetailValue,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";

type Props = {
  children?: string;
  label: string;
  isSensitive?: boolean;
};

export const CredentialDisplay = ({ children, label, isSensitive }: Props) => {
  const [showCredential, toggleShowCredential] = useReducer((prev) => !prev, !isSensitive);

  const [, isCopyingCredential, setCopyCredential] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  return (
    <Detail>
      <DetailLabel>{label}</DetailLabel>
      {children ? (
        <DetailValue className="flex w-full min-w-0 items-center gap-1">
          <span className="min-w-0 flex-1 truncate" title={showCredential ? children : undefined}>
            {showCredential ? children : "****************************"}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                type="button"
                variant="ghost"
                size="xs"
                aria-label={`Copy ${label}`}
                onClick={() => {
                  setCopyCredential(children);
                  navigator.clipboard.writeText(children);
                }}
              >
                {isCopyingCredential ? <CheckIcon /> : <CopyIcon />}
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>Copy {label}</TooltipContent>
          </Tooltip>
          {isSensitive && (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  aria-label={`${showCredential ? "Hide" : "Show"} ${label}`}
                  onClick={toggleShowCredential}
                >
                  {showCredential ? <EyeOffIcon /> : <EyeIcon />}
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>
                {showCredential ? "Hide" : "Show"} {label}
              </TooltipContent>
            </Tooltip>
          )}
        </DetailValue>
      ) : null}
    </Detail>
  );
};
