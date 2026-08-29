import { useId, useReducer } from "react";
import { CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldLabel,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";

type Props = {
  label: string;
  value?: string;
};

export const CredentialField = ({ label, value }: Props) => {
  const [showCredential, toggleShowCredential] = useReducer((prev) => !prev, false);
  const [, isCopied, setCopied] = useTimedReset<boolean>({ initialState: false });
  const inputId = useId();

  if (!value) return null;

  return (
    <Field>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <FieldContent>
        <div className="flex items-center gap-2">
          <InputGroup className="flex-1">
            <InputGroupInput
              id={inputId}
              value={value}
              type={showCredential ? "text" : "password"}
              readOnly
              className="font-mono"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label={`${showCredential ? "Hide" : "Show"} ${label}`}
                onClick={toggleShowCredential}
              >
                {showCredential ? <EyeOffIcon /> : <EyeIcon />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
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
