import { useRef, useState } from "react";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { Textarea } from "@infisical/cipher/ui/textarea";

import { readableFailure, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import type { HsmPlan } from "../../data/cert-manager-settings/contract-hsm";
import {
  DEFAULT_KEY_PREFIX,
  descriptionSchema,
  firstIssue,
  HsmRoutePicker,
  keyPrefixSchema,
  nameSchema,
  NoHsmRouteNotice,
  pinSchema,
  routeIds,
  routeSchema,
  slotLabelSchema,
  useHsmRoutes
} from "./hsm-shared";

const INITIAL = {
  name: "",
  description: "",
  route: "",
  slotLabel: "",
  pin: "",
  keyNamePrefix: DEFAULT_KEY_PREFIX
};

type Draft = typeof INITIAL;
type Errors = Partial<Record<keyof Draft, string>>;

export const AddHsmConnectorSheet = ({
  orgId,
  plan,
  open,
  onOpenChange
}: {
  orgId: string;
  plan: HsmPlan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const create = useV4Adapter("certManagerSettings").useCreateHsmConnector();
  const [draft, setDraft] = useState<Draft>(INITIAL);
  const [errors, setErrors] = useState<Errors>({});
  const [step, setStep] = useState(0);
  const [discarding, setDiscarding] = useState(false);
  const completed = useRef(false);
  const { isPending: routesPending, hasUsableRoute } = useHsmRoutes(plan, draft.route);
  const dirty =
    step > 0 ||
    (Object.keys(INITIAL) as (keyof Draft)[]).some((key) => draft[key] !== INITIAL[key]);

  const set = (key: keyof Draft) => (value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const check = (next: Errors) => {
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  const close = () => {
    setDraft(INITIAL);
    setErrors({});
    setStep(0);
    onOpenChange(false);
  };

  return (
    <>
      <MultiStep
        variant="sheet"
        size="lg"
        title="Add HSM connector"
        open={open}
        step={step}
        onStepChange={setStep}
        onOpenChange={(next) => {
          if (next) {
            onOpenChange(true);
            return;
          }
          if (completed.current) {
            completed.current = false;
            close();
            return;
          }
          if (dirty) {
            setStep(step);
            setDiscarding(true);
            return;
          }
          close();
        }}
        completeLabel="Add HSM connector"
        onComplete={async () => {
          await create
            .mutateAsync({
              name: draft.name,
              description: draft.description.trim() || undefined,
              ...routeIds(draft.route),
              credentials: {
                slotLabel: draft.slotLabel,
                pin: draft.pin,
                keyNamePrefix: draft.keyNamePrefix.trim() || undefined
              }
            })
            .catch(readableFailure("Could not add the HSM connector."));
          saved(`HSM connector ${draft.name} created and verified`);
          completed.current = true;
        }}
        steps={[
          {
            title: "Basics",
            summary: draft.name || undefined,
            validate: () =>
              check({
                name: firstIssue(nameSchema, draft.name),
                description: firstIssue(descriptionSchema, draft.description)
              }),
            content: (
              <Stack gap={16}>
                <Field
                  label="Name"
                  description="Lowercase letters, numbers and dashes."
                  error={errors.name}
                  wide
                >
                  <Input
                    value={draft.name}
                    invalid={Boolean(errors.name)}
                    placeholder="fortanix-prod"
                    autoComplete="off"
                    onChange={(event) => set("name")(event.target.value)}
                  />
                </Field>
                <Field label="Description" optional error={errors.description} wide>
                  <Textarea
                    rows={3}
                    value={draft.description}
                    placeholder="What this HSM is used for, such as the production environment"
                    aria-invalid={Boolean(errors.description) || undefined}
                    onChange={(event) => set("description")(event.target.value)}
                  />
                </Field>
              </Stack>
            )
          },
          {
            title: "Connection",
            description: "Only gateways with PKCS#11 support are listed.",
            validate: () => check({ route: firstIssue(routeSchema, draft.route) }),
            content: (
              <Stack gap={16}>
                <Field
                  label="Gateway"
                  description="Runs inside your network and handles key operations with your HSM."
                  error={errors.route}
                  wide
                >
                  <HsmRoutePicker
                    plan={plan}
                    value={draft.route}
                    invalid={Boolean(errors.route)}
                    onChange={set("route")}
                  />
                </Field>
                {!routesPending && !hasUsableRoute && (
                  <NoHsmRouteNotice orgId={orgId} plan={plan} />
                )}
              </Stack>
            )
          },
          {
            title: "Credentials",
            description:
              "Infisical verifies the slot and PIN against your HSM before saving the connector.",
            validate: () =>
              check({
                slotLabel: firstIssue(slotLabelSchema, draft.slotLabel),
                pin: firstIssue(pinSchema, draft.pin),
                keyNamePrefix: firstIssue(keyPrefixSchema, draft.keyNamePrefix)
              }),
            content: (
              <Stack gap={16}>
                <Field
                  label="Slot label"
                  description="The PKCS#11 token label of the slot to use. Ask your HSM administrator if you're not sure."
                  error={errors.slotLabel}
                  wide
                >
                  <Input
                    mono
                    value={draft.slotLabel}
                    invalid={Boolean(errors.slotLabel)}
                    placeholder="fortanix-prod"
                    autoComplete="off"
                    onChange={(event) => set("slotLabel")(event.target.value)}
                  />
                </Field>
                <Field
                  label="PIN"
                  description="Used to log in to the slot through the gateway."
                  error={errors.pin}
                  wide
                >
                  <SecretInput
                    value={draft.pin}
                    invalid={Boolean(errors.pin)}
                    placeholder="Enter the slot PIN"
                    autoComplete="new-password"
                    onChange={set("pin")}
                  />
                </Field>
                <Field
                  label="Key label prefix"
                  optional
                  description="Added to the label of every key Infisical creates on this HSM, so you can find them in your HSM tooling."
                  error={errors.keyNamePrefix}
                  wide
                >
                  <Input
                    mono
                    value={draft.keyNamePrefix}
                    invalid={Boolean(errors.keyNamePrefix)}
                    placeholder={DEFAULT_KEY_PREFIX}
                    autoComplete="off"
                    onChange={(event) => set("keyNamePrefix")(event.target.value)}
                  />
                </Field>
              </Stack>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        open={discarding}
        onOpenChange={setDiscarding}
        onDiscard={() => {
          setDiscarding(false);
          close();
        }}
        description="Your HSM connector setup will be lost."
      />
    </>
  );
};
