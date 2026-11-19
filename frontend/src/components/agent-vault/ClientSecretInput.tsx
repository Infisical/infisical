import { ComponentProps, forwardRef, useEffect, useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

type Props = Omit<ComponentProps<typeof InputGroupInput>, "type" | "value"> & { value?: string };

// Masked and revealed the way the service sheet's SecretInput is: in CSS rather than type="password", so browsers and
// password managers don't offer saved passwords for an OAuth app's secret. Controlled, so the reveal button follows
// the form's value even when the form restores or resets it.
export const ClientSecretInput = forwardRef<HTMLInputElement, Props>(
  ({ className, value = "", onChange, ...props }, ref) => {
    const [isVisible, setIsVisible] = useState(false);
    // An emptied field masks again, typed out or cleared by the form after a sign-in, since what comes next may be a
    // real secret.
    useEffect(() => {
      if (!value) setIsVisible(false);
    }, [value]);
    return (
      <InputGroup>
        <InputGroupInput
          ref={ref}
          value={value}
          className={cn(!isVisible && "[-webkit-text-security:disc]", className)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-form-type="other"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          onChange={onChange}
          {...props}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            isDisabled={!value}
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
