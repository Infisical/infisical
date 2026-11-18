import { ComponentProps, forwardRef, useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

type Props = Omit<ComponentProps<typeof InputGroupInput>, "type">;

// Masked and revealed the way the service sheet's SecretInput is: in CSS rather than type="password", so browsers and
// password managers don't offer saved passwords for an OAuth app's secret.
export const ClientSecretInput = forwardRef<HTMLInputElement, Props>(
  ({ className, onChange, ...props }, ref) => {
    const [isVisible, setIsVisible] = useState(false);
    const [hasValue, setHasValue] = useState(false);
    return (
      <InputGroup>
        <InputGroupInput
          ref={ref}
          className={cn(!isVisible && "[-webkit-text-security:disc]", className)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-form-type="other"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          onChange={(event) => {
            setHasValue(Boolean(event.target.value));
            // An emptied field masks again, since what is typed next may be a real secret.
            if (!event.target.value) setIsVisible(false);
            onChange?.(event);
          }}
          {...props}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            isDisabled={!hasValue}
            aria-label={`${isVisible ? "Hide" : "Show"} client secret`}
            onClick={() => setIsVisible((prev) => !prev)}
          >
            {isVisible ? <EyeOffIcon /> : <EyeIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    );
  }
);

ClientSecretInput.displayName = "ClientSecretInput";
