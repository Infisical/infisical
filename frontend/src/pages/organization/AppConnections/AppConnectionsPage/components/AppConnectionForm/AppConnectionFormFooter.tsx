import { useFormContext } from "react-hook-form";

import { Button, DialogFooter, SheetFooter } from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";

import { useAppConnectionForm, useAppConnectionFormDirtyState } from "./AppConnectionFormContext";

type Props = {
  submitLabel: string;
  /** OR-ed with the default `isSubmitting || !isDirty` disabled logic. */
  isDisabled?: boolean;
  /**
   * When true, the submit button does not require the form to be dirty. Used by forms that blank
   * out secrets on edit and must allow re-submitting an unchanged form (e.g. OAuth reconnects).
   */
  allowPristineSubmit?: boolean;
  /** Disables Cancel and submit while a save the form started outside its submit is in flight. */
  isLocked?: boolean;
};

export const AppConnectionFormFooter = ({
  submitLabel,
  isDisabled,
  allowPristineSubmit,
  isLocked = false
}: Props) => {
  const { onCancel, layout } = useAppConnectionForm();
  const {
    formState: { isSubmitting, isDirty }
  } = useFormContext();
  const scopeVariant = useScopeVariant();

  useAppConnectionFormDirtyState(isDirty);

  const isSubmitDisabled =
    isSubmitting || (!isDirty && !allowPristineSubmit) || isDisabled || isLocked;
  const isCancelDisabled = isSubmitting || isLocked;

  if (layout === "dialog")
    return (
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} isDisabled={isCancelDisabled}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="neutral"
          isPending={isSubmitting}
          isDisabled={isSubmitDisabled}
        >
          {submitLabel}
        </Button>
      </DialogFooter>
    );

  return (
    <SheetFooter className="sticky bottom-0 -mx-4 items-center border-t bg-popover">
      <Button type="button" variant="ghost" onClick={onCancel} isDisabled={isCancelDisabled}>
        Cancel
      </Button>
      <Button
        type="submit"
        variant={scopeVariant}
        isPending={isSubmitting}
        isDisabled={isSubmitDisabled}
      >
        {submitLabel}
      </Button>
    </SheetFooter>
  );
};
