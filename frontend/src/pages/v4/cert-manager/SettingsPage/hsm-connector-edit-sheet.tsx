import { useId, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { z } from "zod";

import type { THsmConnector } from "@app/hooks/api/hsmConnectors/types";

import { saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import type { HsmPlan } from "../../data/cert-manager-settings/contract-hsm";
import {
  descriptionSchema,
  firstIssue,
  HsmRoutePicker,
  keyPrefixSchema,
  nameSchema,
  pinSchema,
  routeIds,
  routeOf,
  routeSchema,
  slotLabelSchema
} from "./hsm-shared";

const draftOf = (connector: THsmConnector) => ({
  name: connector.name,
  description: connector.description ?? "",
  route: routeOf(connector),
  slotLabel: connector.slotLabel,
  keyNamePrefix: connector.keyNamePrefix ?? "",
  pin: ""
});

type Draft = ReturnType<typeof draftOf>;
type Errors = Partial<Record<keyof Draft, string>>;

const EditForm = ({
  connector,
  plan,
  onClose
}: {
  connector: THsmConnector;
  plan: HsmPlan;
  onClose: () => void;
}) => {
  const update = useV4Adapter("certManagerSettings").useUpdateHsmConnector();
  const formId = useId();
  const initial = draftOf(connector);
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const currentRoute = initial.route;
  const routingChanged =
    Boolean(currentRoute) && Boolean(draft.route) && draft.route !== currentRoute;
  const dirty = (Object.keys(initial) as (keyof Draft)[]).some(
    (key) => draft[key] !== initial[key]
  );
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: onClose
  });

  const set = (key: keyof Draft) => (value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async () => {
    const next: Errors = {
      name: firstIssue(nameSchema, draft.name),
      description: firstIssue(descriptionSchema, draft.description),
      route: firstIssue(routeSchema, draft.route),
      slotLabel: firstIssue(slotLabelSchema, draft.slotLabel),
      keyNamePrefix: firstIssue(keyPrefixSchema, draft.keyNamePrefix),
      pin:
        routingChanged && !draft.pin
          ? "Re-enter the PIN to confirm the new gateway. Sending the stored PIN to a gateway that hasn't been verified would expose it."
          : firstIssue(pinSchema.or(z.literal("")), draft.pin)
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const description = draft.description.trim();
    const keyNamePrefix = draft.keyNamePrefix.trim();
    const credentials = {
      ...(draft.slotLabel !== connector.slotLabel && { slotLabel: draft.slotLabel }),
      ...(keyNamePrefix !== (connector.keyNamePrefix ?? "") && { keyNamePrefix }),
      ...(draft.pin && { pin: draft.pin })
    };
    setPending(true);
    try {
      await update.mutateAsync({
        connectorId: connector.id,
        name: draft.name !== connector.name ? draft.name : undefined,
        description: description !== (connector.description ?? "") ? description : undefined,
        ...routeIds(draft.route),
        credentials: Object.keys(credentials).length > 0 ? credentials : undefined
      });
      saved(`HSM connector ${draft.name} updated`);
      onClose();
    } catch {
      setPending(false);
    }
  };

  return (
    <>
      <Sheet open onOpenChange={(next) => !next && requestDiscard()}>
        <SheetContent pending={pending}>
          <SheetHeader>
            <SheetTitle>Edit HSM connector</SheetTitle>
            <SheetDescription>
              Changing the gateway, slot or PIN runs a verify against your HSM before saving.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <form
              id={formId}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <Stack gap={16}>
                <Field
                  label="Name"
                  description="Lowercase letters, numbers and dashes."
                  error={errors.name}
                >
                  <Input
                    value={draft.name}
                    invalid={Boolean(errors.name)}
                    autoComplete="off"
                    onChange={(event) => set("name")(event.target.value)}
                  />
                </Field>
                <Field label="Description" optional error={errors.description}>
                  <Textarea
                    rows={2}
                    value={draft.description}
                    aria-invalid={Boolean(errors.description) || undefined}
                    onChange={(event) => set("description")(event.target.value)}
                  />
                </Field>
                <Field
                  label="Gateway"
                  description="The gateway or gateway pool that reaches the HSM over PKCS#11."
                  error={errors.route}
                >
                  <HsmRoutePicker
                    plan={plan}
                    value={draft.route}
                    invalid={Boolean(errors.route)}
                    onChange={set("route")}
                  />
                </Field>
                <Field label="Slot label" error={errors.slotLabel}>
                  <Input
                    mono
                    value={draft.slotLabel}
                    invalid={Boolean(errors.slotLabel)}
                    autoComplete="off"
                    onChange={(event) => set("slotLabel")(event.target.value)}
                  />
                </Field>
                <Field
                  label="Key label prefix"
                  optional
                  description="Added to the label of every key Infisical creates on this HSM."
                  error={errors.keyNamePrefix}
                >
                  <Input
                    mono
                    value={draft.keyNamePrefix}
                    invalid={Boolean(errors.keyNamePrefix)}
                    autoComplete="off"
                    onChange={(event) => set("keyNamePrefix")(event.target.value)}
                  />
                </Field>
                <Field
                  label="PIN"
                  optional={!routingChanged}
                  description={
                    routingChanged
                      ? "Required because the gateway changed. Re-enter the PIN so Infisical can verify it on the new route."
                      : "Leave blank to keep the current PIN, or enter a new one to rotate it."
                  }
                  error={errors.pin}
                >
                  <SecretInput
                    value={draft.pin}
                    invalid={Boolean(errors.pin)}
                    autoComplete="new-password"
                    onChange={set("pin")}
                  />
                </Field>
              </Stack>
            </form>
          </SheetBody>
          <SheetFooter>
            <Button variant="primary" type="submit" form={formId} loading={pending}>
              Save changes
            </Button>
            <Button variant="outline" onClick={requestDiscard} disabled={pending}>
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your changes to this HSM connector will be lost."
      />
    </>
  );
};

export const EditHsmConnectorSheet = ({
  connector,
  plan,
  onClose
}: {
  connector?: THsmConnector;
  plan: HsmPlan;
  onClose: () => void;
}) =>
  connector ? (
    <EditForm key={connector.id} connector={connector} plan={plan} onClose={onClose} />
  ) : null;
