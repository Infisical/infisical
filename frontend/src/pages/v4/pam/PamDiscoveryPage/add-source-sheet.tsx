import { useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { RadioGroup, RadioGroupCard } from "@infisical/cipher/ui/radio-group";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";

import type { PamDiscoveryType } from "@app/hooks/api/pam";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { SourceFields } from "./config-fields";
import { emptySourceForm, sourceFormErrors, sourcePayload } from "./source-form";

export const AddSourceSheet = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const pam = useV4Adapter("pam");
  const { data: types = [] } = pam.useDiscoveryTypes();
  const createSource = pam.useCreateDiscoverySource();
  const [type, setType] = useState<PamDiscoveryType>();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState(emptySourceForm);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isDirty = step === 2 && JSON.stringify(form) !== JSON.stringify(emptySourceForm());
  const reset = () => {
    setType(undefined);
    setStep(1);
    setForm(emptySourceForm());
    setSubmitted(false);
  };
  const close = () => {
    reset();
    onOpenChange(false);
  };
  const guard = useDiscardChangesGuard({ isDirty, onDiscard: close });
  const errors = type && submitted ? sourceFormErrors(type, form) : {};

  const submit = async () => {
    if (!type) return;
    setSubmitted(true);
    if (Object.keys(sourceFormErrors(type, form)).length) return;
    setSubmitting(true);
    try {
      await createSource.mutateAsync({ discoveryType: type, ...sourcePayload(type, form) });
      saved(`Discovery source "${form.name.trim()}" created`);
      close();
    } catch (error) {
      failed("Could not create the discovery source", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (next) onOpenChange(true);
          else guard.requestDiscard();
        }}
      >
        <SheetContent size="md" pending={submitting}>
          <SheetHeader>
            <SheetTitle>Add discovery source</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {step === 1 || !type ? (
              <RadioGroup
                aria-label="Source type"
                value={type ?? ""}
                onValueChange={(value) => setType(value as PamDiscoveryType)}
              >
                {types.map((option) => (
                  <RadioGroupCard
                    key={option.type}
                    value={option.type}
                    title={option.name}
                    media={<ProviderIcon icon={option.icon} alt="" size="sm" />}
                  />
                ))}
              </RadioGroup>
            ) : (
              <SourceFields
                type={type}
                form={form}
                errors={errors}
                onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
              />
            )}
          </SheetBody>
          <SheetFooter>
            {step === 1 ? (
              <>
                <Button variant="outline" onClick={guard.requestDiscard}>
                  Cancel
                </Button>
                <Button
                  variant="accent"
                  disabledReason={type ? undefined : "Pick a source type first"}
                  onClick={() => setStep(2)}
                >
                  Next
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button variant="accent" loading={submitting} onClick={submit}>
                  Add source
                </Button>
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        {...guard.discardDialogProps}
        title="Discard source setup?"
        description="Your progress creating this discovery source will be lost."
      />
    </>
  );
};
