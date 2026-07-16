import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { ShieldIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DocumentationLinkBadge,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Stepper,
  StepperList,
  StepperStep
} from "@app/components/v3";
import { useSubscription } from "@app/context";
import { useCreateCa } from "@app/hooks/api/ca";
import { CaStatus, CaType, InternalCaType } from "@app/hooks/api/ca/enums";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { useListHsmConnectors } from "@app/hooks/api/hsmConnectors";
import { CertKeySource } from "@app/hooks/api/signers";

import { PkiDocsUrls } from "../../../pki-docs-urls";
import { BasicsStep } from "./BasicsStep";
import { DistributionStep } from "./DistributionStep";
import { KeyValidityStep } from "./KeyValidityStep";
import { CaWizardForm, caWizardSchema } from "./schemas";
import { SubjectStep } from "./SubjectStep";
import { STEPS } from "./types";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

const getDateTenYearsFromToday = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 10);
  return format(date, "yyyy-MM-dd");
};

const DEFAULT_VALUES: CaWizardForm = {
  name: "",
  type: InternalCaType.ROOT,
  organization: "",
  ou: "",
  country: "",
  province: "",
  locality: "",
  commonName: "",
  keySource: CertKeySource.Infisical,
  hsmConnectorId: null,
  keyAlgorithm: CertKeyAlgorithm.RSA_2048,
  notAfter: getDateTenYearsFromToday(),
  maxPathLength: "-1",
  disableManagedCrlDistributionPointUrl: false,
  crlDistributionPointUrls: []
};

const STEP_FIELDS: (keyof CaWizardForm)[][] = [
  ["name", "type"],
  ["commonName", "organization", "ou", "country", "province", "locality"],
  ["keySource", "hsmConnectorId", "keyAlgorithm", "notAfter", "maxPathLength"],
  ["crlDistributionPointUrls"]
];

export const CreateCaWizard = ({ isOpen, onOpenChange }: Props) => {
  const [step, setStep] = useState(0);
  const { subscription } = useSubscription();
  const createCa = useCreateCa();

  const { data: hsmConnectors = [], isPending: isHsmConnectorsLoading } = useListHsmConnectors({
    enabled: Boolean(subscription?.hsm)
  });

  const hsmConnectorOptions = useMemo(
    () => hsmConnectors.map((c) => ({ id: c.id, name: c.name, slotLabel: c.slotLabel })),
    [hsmConnectors]
  );

  const form = useForm<CaWizardForm>({
    resolver: zodResolver(caWizardSchema),
    defaultValues: DEFAULT_VALUES
  });

  const reset = () => {
    setStep(0);
    form.reset(DEFAULT_VALUES);
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const onCreate = async () => {
    const values = form.getValues();
    const isRoot = values.type === InternalCaType.ROOT;
    try {
      await createCa.mutateAsync({
        name: values.name,
        type: CaType.INTERNAL,
        status: CaStatus.ACTIVE,
        configuration: {
          type: values.type,
          commonName: values.commonName,
          organization: values.organization,
          ou: values.ou,
          country: values.country,
          province: values.province,
          locality: values.locality,
          keyAlgorithm: values.keyAlgorithm,
          keySource: values.keySource,
          hsmConnectorId:
            values.keySource === CertKeySource.Hsm
              ? (values.hsmConnectorId ?? undefined)
              : undefined,
          maxPathLength: Number(values.maxPathLength),
          ...(isRoot ? { notAfter: values.notAfter } : {}),
          crlDistributionPointUrls: values.crlDistributionPointUrls.map(({ value }) => value),
          disableManagedCrlDistributionPointUrl: values.disableManagedCrlDistributionPointUrl
        }
      });

      createNotification({ text: "Successfully created CA", type: "success" });
      handleClose(false);
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to create CA"
      });
    }
  };

  const isLast = step === STEPS.length - 1;

  const goNext = async () => {
    const ok = await form.trigger(STEP_FIELDS[step]);
    if (!ok) return;
    if (isLast) {
      await onCreate();
      return;
    }
    setStep((s) => s + 1);
  };

  const goBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const currentStep = STEPS[step];
  const ctaLabel = isLast ? "Create CA" : "Continue";

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-[1500px]">
        <SheetHeader className="border-b">
          <SheetTitle>
            <div className="flex w-full items-start gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-project/10 text-project">
                <ShieldIcon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-x-2 text-mineshaft-300">
                  Create Internal CA
                  <DocumentationLinkBadge href={PkiDocsUrls.ca.internal} />
                </div>
                <p className="text-sm leading-4 text-mineshaft-400">
                  A private Certificate Authority hosted by Infisical, with its signing key managed
                  by Infisical or kept in your HSM.
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

              {step === 0 && <BasicsStep form={form} />}
              {step === 1 && <SubjectStep form={form} />}
              {step === 2 && (
                <KeyValidityStep
                  form={form}
                  hsmConnectorOptions={hsmConnectorOptions}
                  isHsmConnectorsLoading={isHsmConnectorsLoading}
                />
              )}
              {step === 3 && <DistributionStep form={form} />}
            </div>

            <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
              <div className="mb-auto">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                    Step {step + 1} · {currentStep.rightLabel}
                  </p>
                  <DocumentationLinkBadge href={currentStep.docsUrl} />
                </div>
                <p className="mt-4 text-sm font-semibold text-foreground">What this step does</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {currentStep.rightDescription}
                </p>
              </div>
            </aside>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
            <span className="text-xs text-muted" />
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted">
                Step {step + 1} of {STEPS.length}
              </span>
              {step > 0 && (
                <Button variant="outline" onClick={goBack}>
                  Back
                </Button>
              )}
              <Button variant="project" onClick={goNext} isPending={createCa.isPending}>
                {ctaLabel}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
