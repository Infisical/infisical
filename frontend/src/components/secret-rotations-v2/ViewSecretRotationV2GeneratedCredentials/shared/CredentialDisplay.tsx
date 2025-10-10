import { useReducer } from "react";
import { faCheck, faCopy, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { GenericFieldLabel, IconButton, Tooltip } from "@app/components/v2";
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
    <GenericFieldLabel label={label}>
      {children ? (
        <div className="text-mineshaft-100 flex w-full items-center gap-1">
          {showCredential ? children : "****************************"}
          <Tooltip content={`Copy ${label}`}>
            <IconButton
              onClick={() => {
                setCopyCredential(children);
                navigator.clipboard.writeText(children);
              }}
              ariaLabel="Copy credential"
              variant="plain"
              size="xs"
            >
              <FontAwesomeIcon icon={isCopyingCredential ? faCheck : faCopy} />
            </IconButton>
          </Tooltip>
          {isSensitive && (
            <Tooltip content={`Show ${label}`}>
              <IconButton
                variant="plain"
                size="xs"
                onClick={toggleShowCredential}
                ariaLabel={`${showCredential ? "Hide" : "Show"} credential`}
              >
                <FontAwesomeIcon icon={faEyeSlash} />
              </IconButton>
            </Tooltip>
          )}
        </div>
      ) : null}
    </GenericFieldLabel>
  );
};
