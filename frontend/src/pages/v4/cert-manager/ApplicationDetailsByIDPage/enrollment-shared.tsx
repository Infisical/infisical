import { type ReactNode, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { SheetBody, SheetFooter } from "@infisical/cipher/ui/sheet";

import { failed, saved } from "../../access/toast";
import {
  type EnrollmentBodyProps,
  type EnrollmentMethod,
  METHOD_LABELS,
  methodTitle
} from "./enrollment-model";

export const EnrollmentBody = ({
  children,
  ...panel
}: EnrollmentBodyProps & { children: ReactNode }) => (
  <SheetBody {...panel}>
    <Stack gap={16}>{children}</Stack>
  </SheetBody>
);

type MethodMutation = {
  mutateAsync: (input: { applicationId: string; profileId: string }) => Promise<unknown>;
};

const DisableMethodButton = ({
  method,
  applicationId,
  profileId,
  clear,
  consequence,
  disabled
}: {
  method: EnrollmentMethod;
  applicationId: string;
  profileId: string;
  clear: MethodMutation;
  consequence?: string;
  disabled: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const label = METHOD_LABELS[method];
  const title = methodTitle(method);
  const confirm = async () => {
    setPending(true);
    try {
      await clear.mutateAsync({ applicationId, profileId });
      saved(`${title} disabled`);
      setOpen(false);
    } catch (error) {
      failed(`Couldn't disable ${title}`, error);
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <Button variant="danger-ghost" disabled={disabled} onClick={() => setOpen(true)}>
        Disable {label}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent tone="danger" icon="alert" pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {title}?</AlertDialogTitle>
            <AlertDialogDescription>
              Clients using {label} with this profile through this application can no longer request
              certificates. Certificates already issued stay valid.
              {consequence && ` ${consequence}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" loading={pending} onClick={confirm}>
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const EnrollmentFooter = ({
  method,
  configured,
  formId,
  dirty,
  pending,
  busy,
  onCancel,
  applicationId,
  profileId,
  clear,
  consequence
}: {
  method: EnrollmentMethod;
  configured: boolean;
  formId?: string;
  dirty: boolean;
  pending: boolean;
  busy: boolean;
  onCancel: () => void;
  applicationId: string;
  profileId: string;
  clear: MethodMutation;
  consequence?: string;
}) => (
  <SheetFooter>
    <Inline justify="between">
      <Inline gap={8}>
        {formId && (
          <Button
            variant="primary"
            type="submit"
            form={formId}
            loading={pending}
            disabledReason={configured && !dirty ? "No changes to save" : undefined}
          >
            {configured ? "Save changes" : `Enable ${METHOD_LABELS[method]}`}
          </Button>
        )}
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          {formId ? "Cancel" : "Close"}
        </Button>
      </Inline>
      {configured && (
        <DisableMethodButton
          method={method}
          applicationId={applicationId}
          profileId={profileId}
          clear={clear}
          consequence={consequence}
          disabled={busy}
        />
      )}
    </Inline>
  </SheetFooter>
);
