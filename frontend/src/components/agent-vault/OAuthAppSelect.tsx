import { useId } from "react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";

const AUTOMATIC = "automatic";
const OWN_APP = "own-app";

// Who the sign-in uses as its OAuth client: one Infisical registers, or the admin's own app.
export const OAuthAppSelect = ({
  isOwnApp,
  onChange,
  isAutomaticDisabled = false
}: {
  isOwnApp: boolean;
  onChange: (isOwnApp: boolean) => void;
  /** Endpoints typed in by hand have no metadata to register a client with. */
  isAutomaticDisabled?: boolean;
}) => {
  const labelId = useId();
  return (
    <Field>
      <FieldLabel id={labelId}>OAuth App</FieldLabel>
      <FieldContent>
        <Select
          value={isOwnApp ? OWN_APP : AUTOMATIC}
          onValueChange={(value) => onChange(value === OWN_APP)}
        >
          <SelectTrigger aria-labelledby={labelId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={AUTOMATIC} disabled={isAutomaticDisabled}>
              Automatic Setup
            </SelectItem>
            <SelectItem value={OWN_APP}>Custom</SelectItem>
          </SelectContent>
        </Select>
        {isAutomaticDisabled && (
          <FieldDescription>Clear the endpoints to use automatic setup.</FieldDescription>
        )}
      </FieldContent>
    </Field>
  );
};
