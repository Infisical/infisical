import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheckIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Stepper,
  StepperList,
  StepperStep
} from "@app/components/v3";
import { useListGatewayPools } from "@app/hooks/api/gateway-pools";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import { useCreateHsmConnector } from "@app/hooks/api/hsmConnectors";

import { AccessStep } from "./AccessStep";
import { BasicsStep } from "./BasicsStep";
import { HostStep, ReachedFromOption } from "./HostStep";
import {
  AccessForm,
  accessSchema,
  BasicsForm,
  basicsSchema,
  HostForm,
  hostSchema
} from "./schemas";
import { INITIAL_WIZARD_STATE, STEPS, WizardState } from "./types";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const CreateHsmConnectorWizard = ({ isOpen, onOpenChange }: Props) => {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL_WIZARD_STATE);
  const [submitting, setSubmitting] = useState(false);

  const { data: gateways = [], isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());
  const { data: pools = [], isPending: isPoolsLoading } = useListGatewayPools();
  const createMutation = useCreateHsmConnector();

  const reachedFromOptions: ReachedFromOption[] = useMemo(() => {
    const gatewayOptions: ReachedFromOption[] = gateways
      .filter((g) => !g.isV1)
      .filter((g) => g.capabilities?.pkcs11 === true)
      .map((g) => ({ value: `gateway:${g.id}`, label: g.name, group: "gateway" as const }));
    const poolOptions: ReachedFromOption[] = pools.map((p) => ({
      value: `pool:${p.id}`,
      label: p.name,
      group: "pool" as const
    }));
    return [...gatewayOptions, ...poolOptions];
  }, [gateways, pools]);

  const basicsForm = useForm<BasicsForm>({
    resolver: zodResolver(basicsSchema),
    values: { name: state.name, description: state.description.trim() || undefined }
  });
  const hostForm = useForm<HostForm>({
    resolver: zodResolver(hostSchema),
    values: { reachedFrom: state.reachedFrom }
  });
  const accessForm = useForm<AccessForm>({
    resolver: zodResolver(accessSchema),
    values: {
      slotLabel: state.slotLabel,
      pin: state.pin,
      keyNamePrefix: state.keyNamePrefix || undefined
    }
  });

  const reset = () => {
    setStep(0);
    setState(INITIAL_WIZARD_STATE);
    basicsForm.reset({ name: "", description: undefined });
    hostForm.reset({ reachedFrom: "" });
    accessForm.reset({ slotLabel: "", pin: "", keyNamePrefix: "infisical-" });
  };

  const handleClose = (open: boolean) => {
    if (!open && submitting) return;
    if (!open) reset();
    onOpenChange(open);
  };

  const onCreate = async (finalState: WizardState) => {
    setSubmitting(true);
    try {
      const [kind, id] = finalState.reachedFrom.split(":");
      await createMutation.mutateAsync({
        name: finalState.name,
        description: finalState.description.trim() || undefined,
        gatewayId: kind === "gateway" ? id : undefined,
        gatewayPoolId: kind === "pool" ? id : undefined,
        credentials: {
          slotLabel: finalState.slotLabel,
          pin: finalState.pin,
          keyNamePrefix: finalState.keyNamePrefix?.trim() || undefined
        }
      });
      createNotification({
        type: "success",
        text: `HSM Connector "${finalState.name}" created and verified.`
      });
      handleClose(false);
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to create HSM Connector"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = async () => {
    if (step === 0) {
      const ok = await basicsForm.trigger();
      if (!ok) return;
      const values = basicsForm.getValues();
      setState((prev) => ({
        ...prev,
        name: values.name,
        description: values.description ?? ""
      }));
      setStep(1);
      return;
    }
    if (step === 1) {
      const ok = await hostForm.trigger();
      if (!ok) return;
      const values = hostForm.getValues();
      setState((prev) => ({ ...prev, reachedFrom: values.reachedFrom }));
      setStep(2);
      return;
    }
    if (step === 2) {
      const ok = await accessForm.trigger();
      if (!ok) return;
      const values = accessForm.getValues();
      const finalState: WizardState = {
        ...state,
        slotLabel: values.slotLabel,
        pin: values.pin,
        keyNamePrefix: values.keyNamePrefix ?? ""
      };
      setState(finalState);
      await onCreate(finalState);
    }
  };

  const goBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const dirty = step > 0 || state.name !== "";
  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const ctaLabel = isLast ? "Add HSM Connector" : "Continue";

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-[1500px]">
        <SheetHeader className="border-b">
          <SheetTitle>
            <div className="flex w-full items-start gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-project/10 text-project">
                <ShieldCheckIcon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-x-2 text-mineshaft-300">
                  Add HSM Connector
                </div>
                <p className="text-sm leading-4 text-mineshaft-400">
                  Register a hardware security module so Infisical can route key operations through
                  it.
                </p>
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <aside className="flex w-60 shrink-0 flex-col border-r border-border px-5 py-6">
              <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
                Setup steps
              </p>
              <Stepper
                activeStep={step}
                orientation="vertical"
                onStepChange={(i) => {
                  if (i < step) setStep(i);
                }}
              >
                <StepperList>
                  {STEPS.map((s, i) => (
                    <StepperStep
                      key={s.name}
                      index={i}
                      title={s.name}
                      description={s.shortDescription}
                    />
                  ))}
                </StepperList>
              </Stepper>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col gap-y-2 overflow-y-auto px-8 py-6">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-foreground">{currentStep.title}</h2>
                <p className="mt-1 text-sm text-muted">{currentStep.subtitle}</p>
              </div>

              {step === 0 && <BasicsStep form={basicsForm} />}
              {step === 1 && (
                <HostStep
                  form={hostForm}
                  options={reachedFromOptions}
                  isLoading={isGatewaysLoading || isPoolsLoading}
                />
              )}
              {step === 2 && <AccessStep form={accessForm} />}
            </div>

            <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
              <div>
                <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                  Step {step + 1} · {currentStep.rightLabel}
                </p>
                <p className="mt-4 text-sm font-semibold text-foreground">What this step does</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {currentStep.rightDescription}
                </p>
              </div>

              <div className="mt-auto space-y-3">
                {isLast && (
                  <p className="text-xs leading-relaxed text-muted">
                    Infisical runs a Verify against your HSM before saving. A wrong PIN, slot, or
                    unreachable Gateway will surface here.
                  </p>
                )}
              </div>
            </aside>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
            <span className="text-xs text-muted">{dirty ? "Unsaved changes" : ""}</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted">
                Step {step + 1} of {STEPS.length}
              </span>
              {step > 0 && (
                <Button variant="outline" onClick={goBack}>
                  Back
                </Button>
              )}
              <Button variant="project" onClick={goNext} isPending={submitting}>
                {ctaLabel}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
