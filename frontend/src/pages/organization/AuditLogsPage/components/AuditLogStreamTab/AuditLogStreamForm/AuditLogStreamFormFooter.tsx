import { useFormContext } from "react-hook-form";

import { Button, SheetFooter } from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";

import { useAuditLogStreamForm } from "./AuditLogStreamFormContext";

type Props = {
  submitLabel: string;
  /** OR-ed with the default `isSubmitting || !isDirty` disabled logic. */
  isDisabled?: boolean;
  /**
   * When true, the submit button does not require the form to be dirty. Used by forms that blank
   * out credentials on edit and must allow re-submitting an unchanged form.
   */
  allowPristineSubmit?: boolean;
};

export const AuditLogStreamFormFooter = ({
  submitLabel,
  isDisabled,
  allowPristineSubmit
}: Props) => {
  const { onCancel } = useAuditLogStreamForm();
  const {
    formState: { isSubmitting, isDirty }
  } = useFormContext();
  const scopeVariant = useScopeVariant();

  return (
    <SheetFooter className="sticky bottom-0 -mx-4 items-center border-t bg-popover">
      <Button
        type="submit"
        variant={scopeVariant}
        isPending={isSubmitting}
        isDisabled={isSubmitting || (!isDirty && !allowPristineSubmit) || isDisabled}
      >
        {submitLabel}
      </Button>
      <Button type="button" variant="outline" onClick={onCancel} isDisabled={isSubmitting}>
        Cancel
      </Button>
    </SheetFooter>
  );
};
