import { useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Textarea } from "@infisical/cipher/ui/textarea";

import { getCaIssuanceCapabilities } from "@app/hooks/api/ca/capabilities";
import { CaType } from "@app/hooks/api/ca/enums";
import { CertKeySource, SignerKeyAlgorithm, type TSigner } from "@app/hooks/api/signers/types";
import { slugSchema } from "@app/lib/schemas";

import { readableFailure } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import {
  caCapabilities,
  certificateErrors,
  CODE_SIGNING_DOCS,
  INITIAL_CERT_DRAFT,
  keyErrors,
  renewBeforeValue,
  type SignerCertDraft,
  type SignerCertErrors,
  SignerCertificateFields,
  SignerKeyFields,
  useHsmKeyLookup,
  usesExistingCertificate,
  useSignerCaOptions
} from "../CodeSigningPage/signer-shared";

const nameSchema = slugSchema({ min: 1, max: 64, field: "Name" });

const EditSheet = ({
  orgId,
  signer,
  onClose
}: {
  orgId: string;
  signer: TSigner;
  onClose: () => void;
}) => {
  const adapter = useV4Adapter("codeSigning");
  const updateSigner = adapter.useUpdateSigner();
  const reissue = adapter.useReissueSignerCertificate();
  const importCertificate = adapter.useImportSignerCertificate();
  const { options: caOptions, isPending: casPending } = useSignerCaOptions();
  const signerCaType = caOptions.find((option) => option.id === signer.caId)?.caType;
  const currentKeySource = getCaIssuanceCapabilities(signerCaType).requiresHsm
    ? CertKeySource.Hsm
    : ((signer.certificateKeySource as CertKeySource | undefined) ?? CertKeySource.Infisical);
  const currentHsmConnectorId = signer.certificateHsmConnectorId ?? "";
  const currentKeyAlgorithm =
    (signer.keyAlgorithm as SignerKeyAlgorithm | undefined) ?? SignerKeyAlgorithm.RSA_2048;
  const signerAdcsTemplate =
    signer.externalCaConfig?.caType === CaType.ADCS ? (signer.externalCaConfig.template ?? "") : "";
  const [initial] = useState<SignerCertDraft>(() => ({
    ...INITIAL_CERT_DRAFT,
    caId: signer.caId ?? "",
    commonName: signer.commonName ?? "",
    certificateTtlDays: String(signer.certificateTtlDays ?? 365),
    certificateRenewBeforeDays:
      signer.certificateRenewBeforeDays == null ? "" : String(signer.certificateRenewBeforeDays),
    keySource: currentKeySource,
    keyAlgorithm: currentKeyAlgorithm,
    hsmConnectorId: currentHsmConnectorId,
    adcsTemplate: signerAdcsTemplate
  }));
  const [step, setStep] = useState(0);
  const [name, setName] = useState(signer.name);
  const [description, setDescription] = useState(signer.description ?? "");
  const [nameError, setNameError] = useState<string>();
  const [cert, setCert] = useState<SignerCertDraft>(initial);
  const [errors, setErrors] = useState<SignerCertErrors>({});
  const submitting = useRef(false);
  const lookup = useHsmKeyLookup(cert);
  const { ca, requiresHsm, minRsaKeyBits } = caCapabilities(caOptions, cert.caId);
  const isAdcs = ca?.caType === CaType.ADCS;

  const sameKeyLocation =
    cert.keySource === currentKeySource &&
    cert.hsmConnectorId === currentHsmConnectorId &&
    cert.caId === (signer.caId ?? "");
  const keepAlgorithm = sameKeyLocation ? currentKeyAlgorithm : undefined;
  const caSwap = Boolean(cert.caId) && cert.caId !== signer.caId;
  const subjectChanged =
    cert.commonName !== (signer.commonName ?? "") ||
    Number(cert.certificateTtlDays) !== (signer.certificateTtlDays ?? 0);
  const keySourceChanged =
    cert.keySource !== currentKeySource ||
    (cert.keySource === CertKeySource.Hsm && cert.hsmConnectorId !== currentHsmConnectorId);
  const keyAlgorithmChanged = cert.keyAlgorithm !== currentKeyAlgorithm;
  const fromOrder = Boolean(cert.externalOrderId);
  const existing = usesExistingCertificate(cert);
  const adcsTemplateChanged = isAdcs && cert.adcsTemplate.trim() !== signerAdcsTemplate;
  const shouldReissue =
    caSwap ||
    subjectChanged ||
    keySourceChanged ||
    keyAlgorithmChanged ||
    fromOrder ||
    adcsTemplateChanged;

  const dirty =
    name !== signer.name ||
    description !== (signer.description ?? "") ||
    JSON.stringify(cert) !== JSON.stringify(initial);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: onClose
  });

  const patch = (next: Partial<SignerCertDraft>) => {
    setCert((current) => ({ ...current, ...next }));
    setErrors((current) => {
      const cleared = { ...current };
      (Object.keys(next) as (keyof SignerCertDraft)[]).forEach((key) => delete cleared[key]);
      return cleared;
    });
  };

  const save = async () => {
    const nameChanged = name.trim() !== signer.name;
    const descriptionChanged = description.trim() !== (signer.description ?? "");
    const nextRenew = renewBeforeValue(cert);
    const renewChanged = nextRenew !== (signer.certificateRenewBeforeDays ?? null);
    submitting.current = true;
    try {
      if (existing) {
        await importCertificate
          .mutateAsync({
            signerId: signer.id,
            caId: cert.caId,
            externalOrderId: cert.externalOrderId,
            certificate: {
              hsmConnectorId: cert.hsmConnectorId,
              hsmKeyLabel: cert.hsmKeyLabel.trim(),
              hsmKeyId: lookup.resolvedKeyId || undefined
            },
            certificateRenewBeforeDays: renewChanged ? nextRenew : undefined
          })
          .catch(readableFailure("Couldn't switch the signer to the order's certificate."));
      } else if (shouldReissue) {
        let externalConfiguration;
        if (cert.externalOrderId)
          externalConfiguration = { reissueFromExternalOrderId: cert.externalOrderId };
        else if (isAdcs)
          externalConfiguration = { template: cert.adcsTemplate.trim() || undefined };
        const keyChanged = keySourceChanged || keyAlgorithmChanged;
        await reissue
          .mutateAsync({
            signerId: signer.id,
            caId: cert.caId,
            commonName: !fromOrder && subjectChanged ? cert.commonName.trim() : undefined,
            certificateTtlDays:
              !fromOrder && subjectChanged ? Number(cert.certificateTtlDays) : undefined,
            keyAlgorithm: keyChanged ? cert.keyAlgorithm : undefined,
            certificate: keyChanged
              ? {
                  keySource: cert.keySource,
                  hsmConnectorId:
                    cert.keySource === CertKeySource.Hsm ? cert.hsmConnectorId : undefined
                }
              : undefined,
            externalConfiguration
          })
          .catch(readableFailure("Couldn't reissue the certificate."));
      }
      const renewSavedByImport = existing && renewChanged;
      if (nameChanged || descriptionChanged || (renewChanged && !renewSavedByImport))
        await updateSigner
          .mutateAsync({
            signerId: signer.id,
            name: nameChanged ? name.trim() : undefined,
            description: descriptionChanged ? description.trim() || null : undefined,
            certificateRenewBeforeDays: renewChanged && !renewSavedByImport ? nextRenew : undefined
          })
          .catch(readableFailure("Couldn't update the signer."));
      onClose();
    } finally {
      submitting.current = false;
    }
  };

  let completeLabel = "Save";
  if (shouldReissue && !existing) completeLabel = "Save and reissue";
  let keyNote: string | undefined;
  if (existing)
    keyNote = "Saving switches the signer to the certificate already issued in this order.";
  else if (shouldReissue)
    keyNote =
      "Saving reissues the certificate immediately, and the signer switches to the new certificate.";

  return (
    <>
      <MultiStep
        variant="sheet"
        size="lg"
        title={`Edit ${signer.name}`}
        description={<DocumentationLink href={CODE_SIGNING_DOCS.editSigner} subject="Signers" />}
        open
        step={step}
        onStepChange={setStep}
        onOpenChange={(next) => {
          if (next || submitting.current) return;
          requestDiscard();
        }}
        completeLabel={completeLabel}
        onComplete={save}
        steps={[
          {
            title: "Basics",
            summary: name || undefined,
            description: "Changing these doesn't affect the certificate.",
            validate: () => {
              const parsed = nameSchema.safeParse(name);
              setNameError(parsed.success ? undefined : parsed.error.issues[0]?.message);
              return parsed.success;
            },
            content: (
              <Stack gap={16}>
                <Field label="Name" description="Lowercase, with dashes." error={nameError} wide>
                  <Input
                    value={name}
                    autoComplete="off"
                    invalid={Boolean(nameError)}
                    onChange={(event) => {
                      setName(event.target.value);
                      setNameError(undefined);
                    }}
                  />
                </Field>
                <Field label="Description" optional wide>
                  <Textarea
                    value={description}
                    rows={3}
                    maxLength={256}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>
              </Stack>
            )
          },
          {
            title: "Certificate",
            summary: ca?.name,
            validate: () => {
              const next = certificateErrors(cert, caOptions, signer.certificateTtlDays ?? null);
              setErrors(next);
              return !Object.keys(next).length;
            },
            content: (
              <Stack gap={16}>
                <SignerCertificateFields
                  draft={cert}
                  errors={errors}
                  patch={patch}
                  caOptions={caOptions}
                  casPending={casPending}
                  isEdit
                />
              </Stack>
            )
          },
          {
            title: "Signing key",
            description: keyNote,
            validate: () => {
              const next = keyErrors(cert, lookup, minRsaKeyBits, keepAlgorithm);
              setErrors(next);
              return !Object.keys(next).length;
            },
            content: (
              <Stack gap={16}>
                <SignerKeyFields
                  draft={cert}
                  errors={errors}
                  patch={patch}
                  orgId={orgId}
                  projectId={signer.projectId}
                  requiresHsm={requiresHsm}
                  minRsaKeyBits={minRsaKeyBits}
                  currentKeyAlgorithm={keepAlgorithm}
                  lookup={lookup}
                />
              </Stack>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        title="Discard changes?"
        description="Your changes to this signer will be lost."
      />
    </>
  );
};

export const EditSignerSheet = ({
  open,
  orgId,
  signer,
  onClose
}: {
  open: boolean;
  orgId: string;
  signer: TSigner;
  onClose: () => void;
}) => (open ? <EditSheet orgId={orgId} signer={signer} onClose={onClose} /> : null);
