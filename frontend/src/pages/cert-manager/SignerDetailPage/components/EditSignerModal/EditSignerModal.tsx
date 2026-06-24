import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { useListCasByProjectId } from "@app/hooks/api/ca";
import { CaStatus, CaType } from "@app/hooks/api/ca/enums";
import { useListHsmConnectors } from "@app/hooks/api/hsmConnectors";
import {
  CertKeySource,
  SignerKeyAlgorithm,
  SignerStatus,
  TSigner,
  useReissueSignerCertificate,
  useUpdateSigner
} from "@app/hooks/api/signers";

import { PkiDocsUrls } from "../../../pki-docs-urls";
import { BasicsStep } from "./BasicsStep";
import { CertificateStep } from "./CertificateStep";
import { BasicsForm, basicsSchema, CertificateForm, certificateSchema } from "./schemas";
import { CaOption, STEPS } from "./types";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  signer: TSigner;
};

export const EditSignerModal = ({ isOpen, onOpenChange, signer }: Props) => {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const cas = useListCasByProjectId();
  const updateSigner = useUpdateSigner();
  const reissueCertificate = useReissueSignerCertificate();
  const { subscription } = useSubscription();
  const { data: hsmConnectors = [], isPending: isHsmConnectorsLoading } = useListHsmConnectors({
    enabled: Boolean(subscription?.hsm)
  });

  const currentKeySource =
    (signer.certificateKeySource as CertKeySource | undefined) ?? CertKeySource.Infisical;
  const currentHsmConnectorId = signer.certificateHsmConnectorId ?? null;
  const currentKeyAlgorithm =
    (signer.keyAlgorithm as SignerKeyAlgorithm | undefined) ?? SignerKeyAlgorithm.RSA_2048;

  const caOptions: CaOption[] = useMemo(() => {
    const list = cas.data ?? [];
    return list
      .filter((ca) => ca.status === CaStatus.ACTIVE)
      .filter(
        (ca) =>
          ca.type === CaType.INTERNAL ||
          ca.type === CaType.AWS_PCA ||
          ca.type === CaType.AZURE_AD_CS
      )
      .map((ca) => ({
        id: ca.id,
        name: ca.name,
        groupType: ca.type === CaType.INTERNAL ? "internal" : "external"
      }));
  }, [cas.data]);

  const basicsForm = useForm<BasicsForm>({
    resolver: zodResolver(basicsSchema),
    values: { name: signer.name, description: signer.description ?? "" }
  });

  const canEditSubject =
    signer.status === SignerStatus.Pending || signer.status === SignerStatus.Failed;

  const certificateForm = useForm<CertificateForm>({
    resolver: zodResolver(certificateSchema),
    values: {
      caId: signer.caId ?? "",
      certificateRenewBeforeDays: signer.certificateRenewBeforeDays ?? null,
      commonName: signer.commonName ?? "",
      certificateTtlDays: signer.certificateTtlDays ?? 365,
      keySource: currentKeySource,
      keyAlgorithm: currentKeyAlgorithm,
      hsmConnectorId: currentHsmConnectorId
    }
  });

  const hsmConnectorOptions = useMemo(
    () =>
      hsmConnectors.map((c) => ({
        id: c.id,
        name: c.name,
        slotLabel: c.slotLabel
      })),
    [hsmConnectors]
  );

  const watchedCaId = certificateForm.watch("caId");
  const watchedCommonName = certificateForm.watch("commonName");
  const watchedTtl = certificateForm.watch("certificateTtlDays");
  const watchedKeySource = certificateForm.watch("keySource");
  const watchedHsmConnectorId = certificateForm.watch("hsmConnectorId");

  const caSwap = Boolean(watchedCaId) && watchedCaId !== signer.caId;
  const subjectChanged =
    canEditSubject &&
    ((watchedCommonName ?? "") !== (signer.commonName ?? "") ||
      (watchedTtl ?? 0) !== (signer.certificateTtlDays ?? 0));
  const keySourceChanged =
    watchedKeySource !== currentKeySource ||
    (watchedKeySource === CertKeySource.Hsm &&
      (watchedHsmConnectorId ?? null) !== currentHsmConnectorId);
  const shouldReissue = caSwap || subjectChanged || keySourceChanged;

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setStep(0);
      basicsForm.reset({ name: signer.name, description: signer.description ?? "" });
      certificateForm.reset({
        caId: signer.caId ?? "",
        certificateRenewBeforeDays: signer.certificateRenewBeforeDays ?? null,
        commonName: signer.commonName ?? "",
        certificateTtlDays: signer.certificateTtlDays ?? 365,
        keySource: currentKeySource,
        keyAlgorithm: currentKeyAlgorithm,
        hsmConnectorId: currentHsmConnectorId
      });
    }
    onOpenChange(open);
  };

  const onSave = async () => {
    setSubmitting(true);
    try {
      const basics = basicsForm.getValues();
      const cert = certificateForm.getValues();

      const nameChanged = basics.name !== signer.name;
      const descChanged = (basics.description || "") !== (signer.description ?? "");
      const currentRenew = signer.certificateRenewBeforeDays ?? null;
      const nextRenew = cert.certificateRenewBeforeDays ?? null;
      const renewChanged = nextRenew !== currentRenew;

      if (shouldReissue) {
        await reissueCertificate.mutateAsync({
          signerId: signer.id,
          caId: cert.caId,
          commonName: canEditSubject && subjectChanged ? cert.commonName : undefined,
          certificateTtlDays:
            canEditSubject && subjectChanged ? cert.certificateTtlDays : undefined,
          keyAlgorithm: keySourceChanged ? cert.keyAlgorithm : undefined,
          certificate: keySourceChanged
            ? {
                keySource: cert.keySource,
                hsmConnectorId:
                  cert.keySource === CertKeySource.Hsm
                    ? (cert.hsmConnectorId ?? undefined)
                    : undefined
              }
            : undefined
        });
      }

      if (nameChanged || descChanged || renewChanged) {
        await updateSigner.mutateAsync({
          signerId: signer.id,
          name: nameChanged ? basics.name : undefined,
          description: descChanged ? basics.description || null : undefined,
          certificateRenewBeforeDays: renewChanged ? nextRenew : undefined
        });
      }

      handleOpenChange(false);
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update signer"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = async () => {
    if (step === 0) {
      const ok = await basicsForm.trigger();
      if (!ok) return;
      setStep(1);
      return;
    }
    if (step === 1) {
      const ok = await certificateForm.trigger();
      if (!ok) return;
      await onSave();
    }
  };

  const goBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;
  // eslint-disable-next-line no-nested-ternary
  const ctaLabel = isLast ? (shouldReissue ? "Save and reissue" : "Save") : "Continue";

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-[1100px]">
        <SheetHeader className="border-b">
          <SheetTitle>
            <div className="flex w-full items-start gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-warning/10 text-warning">
                <ShieldIcon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-x-2 text-mineshaft-300">
                  Edit Signer
                  <DocumentationLinkBadge href={PkiDocsUrls.codeSigning.signers.edit} />
                </div>
                <p className="text-sm leading-4 text-mineshaft-400">
                  Update the signer&apos;s name, validity, and certificate authority.
                </p>
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <aside className="flex w-60 shrink-0 flex-col border-r border-border px-5 py-6">
              <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
                Edit steps
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
                <CertificateStep
                  form={certificateForm}
                  caOptions={caOptions}
                  isCasLoading={cas.isPending}
                  commonName={signer.commonName ?? signer.certificateCommonName ?? "—"}
                  certificateTtlDays={signer.certificateTtlDays ?? null}
                  hsmConnectorOptions={hsmConnectorOptions}
                  isHsmConnectorsLoading={isHsmConnectorsLoading}
                  caSwap={caSwap}
                  canEditSubject={canEditSubject}
                  keySourceChanged={keySourceChanged}
                />
              )}
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
            <span className="text-xs text-muted">
              {shouldReissue ? "Saving will reissue the certificate immediately." : ""}
            </span>
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
