import * as React from "react";

import { EMAIL_LIST_DELIMITER, isValidEmail, parseEmailList } from "@app/helpers/email";

import { TagsInput, type TagsInputProps } from "../../generic/TagsInput";

type EmailInputProps = Omit<
  TagsInputProps,
  "value" | "onValueChange" | "validateTag" | "onValidationError" | "getTagError" | "onBlur"
> & {
  value?: readonly string[];
  onValueChange: (emails: string[]) => void;
};

/**
 * The shared multi-address email field. Addresses become chips on Enter, comma, space or blur, and a
 * pasted list is split on commas, semicolons and whitespace. Every value is lowercased and
 * deduplicated, and a malformed address stays as a flagged chip so it can be read and removed.
 * Pair it with `emailListSchema` for the form error; this component only flags.
 */
const EmailInput = React.forwardRef<HTMLInputElement, EmailInputProps>(
  ({ onValueChange, autoComplete = "off", ...props }, ref) => (
    <TagsInput
      ref={ref}
      autoComplete={autoComplete}
      onValueChange={(next) => onValueChange(parseEmailList(next))}
      getTagError={(email) => (isValidEmail(email) ? null : "Not a valid email address")}
      pasteDelimiter={EMAIL_LIST_DELIMITER}
      {...props}
    />
  )
);

EmailInput.displayName = "EmailInput";

export { EmailInput, type EmailInputProps };
