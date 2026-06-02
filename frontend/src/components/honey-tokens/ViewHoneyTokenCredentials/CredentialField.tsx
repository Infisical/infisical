import { useReducer } from "react";
import { faCopy, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Field, FieldContent, FieldLabel, IconButton, Input } from "@app/components/v3";
import { useTimedReset } from "@app/hooks";

type Props = {
  label: string;
  value?: string;
};

export const CredentialField = ({ label, value }: Props) => {
  const [showCredential, toggleShowCredential] = useReducer((prev) => !prev, false);
  const [, isCopied, setCopied] = useTimedReset<boolean>({ initialState: false });

  if (!value) return null;

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldContent>
        <div className="flex items-center gap-2">
          <Input
            value={value}
            type={showCredential ? "text" : "password"}
            readOnly
            className="flex-1 font-mono"
          />
          <IconButton
            aria-label={`${showCredential ? "Hide" : "Show"} ${label}`}
            variant="outline"
            size="md"
            onClick={toggleShowCredential}
          >
            <FontAwesomeIcon icon={showCredential ? faEyeSlash : faEye} />
          </IconButton>
          <IconButton
            aria-label={`Copy ${label}`}
            variant="outline"
            size="md"
            onClick={() => {
              navigator.clipboard.writeText(value);
              setCopied(true);
            }}
          >
            <FontAwesomeIcon icon={faCopy} className={isCopied ? "text-green-500" : ""} />
          </IconButton>
        </div>
      </FieldContent>
    </Field>
  );
};
