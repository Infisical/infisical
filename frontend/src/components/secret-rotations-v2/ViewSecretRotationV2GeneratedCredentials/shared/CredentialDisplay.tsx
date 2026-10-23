import { useReducer } from "react";
import { faCheck, faCopy, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
    <Detail className="min-w-0">
      <DetailLabel>{label}</DetailLabel>
      {children ? (
        <DetailValue className="flex w-full min-w-0 items-center gap-1">
          <span className="min-w-0 flex-1 truncate" title={showCredential ? children : undefined}>
            {showCredential ? children : "****************************"}
          </span>
          <span className="flex-shrink-0">
            <Tooltip hoverable delayDuration={50}>
              <TooltipTrigger asChild>
                <IconButton
                  onClick={() => {
                    setCopyCredential(children);
                    navigator.clipboard.writeText(children);
                  }}
                  aria-label="Copy credential"
                  variant="ghost"
                  size="xs"
                >
                  <FontAwesomeIcon icon={isCopyingCredential ? faCheck : faCopy} />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>{`Copy ${label}`}</TooltipContent>
            </Tooltip>
          </span>
          {isSensitive && (
            <span className="flex-shrink-0">
              <Tooltip hoverable delayDuration={50}>
                <TooltipTrigger asChild>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    onClick={toggleShowCredential}
                    aria-label={`${showCredential ? "Hide" : "Show"} credential`}
                  >
                    <FontAwesomeIcon icon={faEyeSlash} />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>{`Show ${label}`}</TooltipContent>
              </Tooltip>
            </span>
          )}
        </DetailValue>
      ) : (
        <DetailValue className="text-muted italic">None</DetailValue>
      )}
    </Detail>
  );
};
