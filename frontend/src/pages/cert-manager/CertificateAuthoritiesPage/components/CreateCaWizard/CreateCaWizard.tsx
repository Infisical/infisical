import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DiscardChangesAlertDialog,
  DocumentationLinkBadge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Stepper,
  StepperList,
  StepperStep
} from "@app/components/v3";
import { useProject, useSubscription } from "@app/context";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useCreateCa } from "@app/hooks/api/ca";
import { CaStatus, CaType, InternalCaType } from "@app/hooks/api/ca/enums";
import { TUnifiedCertificateAuthority } from "@app/hooks/api/ca/types";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { useListHsmConnectors } from "@app/hooks/api/hsmConnectors";
import { CertKeySource } from "@app/hooks/api/signers";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

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
  onComplete?: (createdCA: TUnifiedCertificateAuthority) => void | Promise<void>;
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
  appConnectionId: null,
  region: null,
  keyAlgorithm: CertKeyAlgorithm.ECDSA_P256,
  notAfter: getDateTenYearsFromToday(),
  maxPathLength: "-1",
  isOcspEnabled: false,
  disableManagedCrlDistributionPointUrl: false,
  crlDistributionPointUrls: []
};

const STEP_FIELDS: (keyof CaWizardForm)[][] = [
  ["name", "type"],
  ["commonName", "organization", "ou", "country", "province", "locality"],
  [
    "keySource",
    "hsmConnectorId",
    "appConnectionId",
    "region",
    "keyAlgorithm",
    "notAfter",
    "maxPathLength"
  ],
  ["crlDistributionPointUrls"]
];

export const CreateCaWizard = ({ isOpen, onOpenChange, onComplete }: Props) => {
  const [step, setStep] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const { subscription } = useSubscription();
  const createCa = useCreateCa();
  const isPending = createCa.isPending || isCompleting;

  const { data: hsmConnectors = [], isPending: isHsmConnectorsLoading } = useListHsmConnectors({
    enabled: Boolean(subscription?.hsm)
  });

  const hsmConnectorOptions = useMemo(
    () => hsmConnectors.map((c) => ({ id: c.id, name: c.name, slotLabel: c.slotLabel })),
    [hsmConnectors]
  );

  const { currentProject } = useProject();
  const { data: awsConnections = [], isPending: isAwsConnectionsLoading } =
    useListAvailableAppConnections(AppConnection.AWS, currentProject.id, {
      enabled: isOpen && Boolean(subscription?.pkiAwsKmsSigning)
    });

  const buildDefaultValues = (): CaWizardForm => ({
    ...DEFAULT_VALUES,
    isOcspEnabled: Boolean(subscription?.pkiOcsp)
  });

  const form = useForm<CaWizardForm>({
    resolver: zodResolver(caWizardSchema),
    defaultValues: buildDefaultValues()
  });

  const reset = () => {
    setStep(0);
    form.reset(buildDefaultValues());
  };

  const { isDiscardDialogOpen, setIsDiscardDialogOpen, requestDiscard, confirmDiscard } =
    useDiscardChangesGuard({
      isDirty: form.formState.isDirty || step > 0,
      onDiscard: () => {
        reset();
        onOpenChange(false);
      }
    });
  const handleClose = (open: boolean) => {
    if (isPending) return;
    if (open) onOpenChange(true);
    else requestDiscard();
  };

  const onCreate = async () => {
    const values = form.getValues();
    const isRoot = values.type === InternalCaType.ROOT;
    try {
      const createdCA = await createCa.mutateAsync({
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
          ...(values.keySource === CertKeySource.AwsKms && {
            appConnectionId: values.appConnectionId ?? undefined,
            region: values.region ?? undefined
          }),
          maxPathLength: Number(values.maxPathLength),
          ...(isRoot ? { notAfter: values.notAfter } : {}),
          crlDistributionPointUrls: values.crlDistributionPointUrls.map(({ value }) => value),
          disableManagedCrlDistributionPointUrl: values.disableManagedCrlDistributionPointUrl,
          isOcspEnabled: values.isOcspEnabled
        }
      });

      createNotification({ text: "Successfully created CA", type: "success" });
      setIsCompleting(true);
      await onComplete?.(createdCA);
      reset();
      onOpenChange(false);
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to create CA"
      });
    } finally {
      setIsCompleting(false);
    }
  };

  const isLast = step === STEPS.length - 1;

  const goNext = async () => {
    if (isPending) return;
    const ok = await form.trigger(STEP_FIELDS[step]);
    if (!ok) return;
    if (isLast) {
      await onCreate();
      return;
    }
    setStep((s) => s + 1);
  };

  const goBack = () => {
    if (step > 0 && !isPending) setStep((s) => s - 1);
  };

  const currentStep = STEPS[step];
  const ctaLabel = isLast ? "Create CA" : "Continue";

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleClose}>
        <SheetContent size="workspace" isPending={isPending}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              Create Internal CA
              <DocumentationLinkBadge href={PkiDocsUrls.ca.internal} />
            </SheetTitle>
            <SheetDescription>
              A private Certificate Authority hosted by Infisical, with its signing key managed by
              Infisical, kept in your HSM, or kept in AWS KMS.
            </SheetDescription>
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
                    if (i < step && !isPending) setStep(i);
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

              <fieldset
                disabled={isPending}
                className="flex min-w-0 flex-1 flex-col gap-y-2 overflow-y-auto px-8 py-6"
              >
                <div className="mb-6">
                  <h2 className="text-lg font-normal text-foreground">{currentStep.title}</h2>
                  <p className="mt-1 text-sm text-muted">{currentStep.subtitle}</p>
                </div>

                {step === 0 && <BasicsStep form={form} />}
                {step === 1 && <SubjectStep form={form} />}
                {step === 2 && (
                  <KeyValidityStep
                    form={form}
                    hsmConnectorOptions={hsmConnectorOptions}
                    isHsmConnectorsLoading={isHsmConnectorsLoading}
                    awsConnectionOptions={awsConnections}
                    isAwsConnectionsLoading={isAwsConnectionsLoading}
                  />
                )}
                {step === 3 && <DistributionStep form={form} />}
              </fieldset>

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

            <SheetFooter className="items-center justify-end border-t">
              {step > 0 && (
                <Button
                  variant="outline"
                  className="mr-auto"
                  onClick={goBack}
                  isDisabled={isPending}
                >
                  Back
                </Button>
              )}
              <span className="text-xs text-muted">
                Step {step + 1} of {STEPS.length}
              </span>
              <Button variant="ghost" onClick={() => handleClose(false)} isDisabled={isPending}>
                Cancel
              </Button>
              <Button variant="project" onClick={goNext} isPending={isPending}>
                {ctaLabel}
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your certificate authority setup changes will be lost."
      />
    </>
  );
};
