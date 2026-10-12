import { FocusEventHandler, useState } from "react";
import { UseFormRegisterReturn } from "react-hook-form";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@app/components/v3";

type Props = {
  id: string;
  placeholder?: string;
  isError?: boolean;
  registration: UseFormRegisterReturn;
  ariaLabel?: string;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
};

export const ChannelSecretInput = ({
  id,
  placeholder,
  isError,
  registration,
  ariaLabel,
  onFocus,
  onBlur
}: Props) => {
  const [isRevealed, setIsRevealed] = useState(false);

  return (
    <InputGroup>
      <InputGroupInput
        {...registration}
        id={id}
        type={isRevealed ? "text" : "password"}
        placeholder={placeholder}
        autoComplete="off"
        aria-label={ariaLabel}
        aria-invalid={Boolean(isError)}
        onFocus={onFocus}
        onBlur={(event) => {
          registration.onBlur(event);
          onBlur?.(event);
        }}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          aria-label={isRevealed ? "Hide value" : "Reveal value"}
          onClick={() => setIsRevealed((current) => !current)}
        >
          {isRevealed ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
};
