import { useReducer } from "react";
import { CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react";

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
            {showCredential ? <EyeOffIcon /> : <EyeIcon />}
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
            <CopyIcon className={isCopied ? "text-success" : ""} />
          </IconButton>
        </div>
      </FieldContent>
    </Field>
  );
};
