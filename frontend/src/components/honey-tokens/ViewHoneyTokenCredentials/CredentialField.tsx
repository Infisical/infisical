import { useId, useReducer } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import {
  CopyButton,
  Field,
  FieldContent,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@app/components/v3";

type Props = {
  label: string;
  value?: string;
};

export const CredentialField = ({ label, value }: Props) => {
  const [showCredential, toggleShowCredential] = useReducer((prev) => !prev, false);
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
          <CopyButton value={value} ariaLabel={`Copy ${label}`} variant="outline" size="md" />
        </div>
      </FieldContent>
    </Field>
  );
};
