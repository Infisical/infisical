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
import { CertStatus } from "@app/hooks/api/certificates/enums";
import {
  CertKeySource,
  getOpenCertificateRequest,
  SignerKeyAlgorithm,
  SignerStatus,
  type TReissueSignerCertificateDTO,
  type TSigner,
  type TUpdateSignerDTO
} from "@app/hooks/api/signers/types";
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
  SignerStatusBadge,
  useHsmKeyLookup,
  usesExistingCertificate,
  useSignerCaOptions
} from "../CodeSigningPage/signer-shared";
import { stepAside } from "../components/step-aside";

const nameSchema = slugSchema({ min: 1, max: 64, field: "Name" });

type CurrentKey = {
  keySource: CertKeySource;
  hsmConnectorId: string;
  keyAlgorithm: SignerKeyAlgorithm;
  adcsTemplate: string;
};

const currentKeyFor = (signer: TSigner, caType?: CaType): CurrentKey => ({
  keySource: getCaIssuanceCapabilities(caType).requiresHsm
    ? CertKeySource.Hsm
    : ((signer.certificateKeySource as CertKeySource | undefined) ?? CertKeySource.Infisical),
  hsmConnectorId: signer.certificateHsmConnectorId ?? "",
  keyAlgorithm:
    (signer.keyAlgorithm as SignerKeyAlgorithm | undefined) ?? SignerKeyAlgorithm.RSA_2048,
  adcsTemplate:
    signer.externalCaConfig?.caType === CaType.ADCS ? (signer.externalCaConfig.template ?? "") : ""
});

const isSameKeyLocation = (signer: TSigner, cert: SignerCertDraft, current: CurrentKey) =>
  cert.keySource === current.keySource &&
  cert.hsmConnectorId === current.hsmConnectorId &&
  cert.caId === (signer.caId ?? "");

const editRestrictions = (signer: TSigner) => {
  const isNameOnly = signer.status === SignerStatus.RevocationPending;
  return {
    isNameOnly,
    isCertificateRevoked:
      !isNameOnly &&
      (signer.status === SignerStatus.Revoked || signer.certificateStatus === CertStatus.REVOKED)
  };
};

const initialDraftFor = (signer: TSigner, current: CurrentKey): SignerCertDraft => ({
  ...INITIAL_CERT_DRAFT,
  caId: signer.caId ?? "",
  commonName: signer.commonName ?? "",
  certificateTtlDays: String(signer.certificateTtlDays ?? 365),
  certificateRenewBeforeDays:
    signer.certificateRenewBeforeDays == null ? "" : String(signer.certificateRenewBeforeDays),
  keySource: current.keySource,
  keyAlgorithm: current.keyAlgorithm,
  hsmConnectorId: current.hsmConnectorId,
  adcsTemplate: current.adcsTemplate
});

const certificateChanges = (
  signer: TSigner,
  cert: SignerCertDraft,
  current: CurrentKey,
  isAdcs: boolean
) => {
  const subject =
    cert.commonName !== (signer.commonName ?? "") ||
    Number(cert.certificateTtlDays) !== (signer.certificateTtlDays ?? 0);
  const key =
    cert.keySource !== current.keySource ||
    (cert.keySource === CertKeySource.Hsm && cert.hsmConnectorId !== current.hsmConnectorId) ||
    cert.keyAlgorithm !== current.keyAlgorithm;
  const fromOrder = Boolean(cert.externalOrderId);
  const adcsTemplate = isAdcs && cert.adcsTemplate.trim() !== current.adcsTemplate;
  const caSwap = Boolean(cert.caId) && cert.caId !== signer.caId;
  return { subject, key, fromOrder, any: caSwap || subject || key || fromOrder || adcsTemplate };
};

const reissueRequest = (
  signerId: string,
  cert: SignerCertDraft,
  isAdcs: boolean,
  changes: ReturnType<typeof certificateChanges>
): TReissueSignerCertificateDTO => {
  let externalConfiguration;
  if (cert.externalOrderId)
    externalConfiguration = { reissueFromExternalOrderId: cert.externalOrderId };
  else if (isAdcs) externalConfiguration = { template: cert.adcsTemplate.trim() || undefined };
  const subjectChanged = !changes.fromOrder && changes.subject;
  return {
    signerId,
    caId: cert.caId,
    commonName: subjectChanged ? cert.commonName.trim() : undefined,
    certificateTtlDays: subjectChanged ? Number(cert.certificateTtlDays) : undefined,
    keyAlgorithm: changes.key ? cert.keyAlgorithm : undefined,
    certificate: changes.key
      ? {
          keySource: cert.keySource,
          hsmConnectorId: cert.keySource === CertKeySource.Hsm ? cert.hsmConnectorId : undefined
        }
      : undefined,
    externalConfiguration
  };
};

const basicsUpdate = (
  signer: TSigner,
  name: string,
  description: string,
  nextRenew: number | null
): TUpdateSignerDTO | null => {
  const nameChanged = name.trim() !== signer.name;
  const descriptionChanged = description.trim() !== (signer.description ?? "");
  const renewChanged = nextRenew !== (signer.certificateRenewBeforeDays ?? null);
  if (!nameChanged && !descriptionChanged && !renewChanged) return null;
  return {
    signerId: signer.id,
    name: nameChanged ? name.trim() : undefined,
    description: descriptionChanged ? description.trim() || null : undefined,
    certificateRenewBeforeDays: renewChanged ? nextRenew : undefined
  };
};

const signingKeyNote = ({
  existing,
  isCertificateRevoked,
  shouldReissue,
  hasOpenRequest
}: {
  existing: boolean;
  isCertificateRevoked: boolean;
  shouldReissue: boolean;
  hasOpenRequest: boolean;
}) => {
  if (existing)
    return "Saving switches the signer to the certificate already issued in this order.";
  if (isCertificateRevoked)
    return shouldReissue
      ? "The certificate was revoked. Saving reissues it with a new key, and the signer can sign again once it's issued."
      : "The certificate was revoked. Saving keeps the signer revoked. To sign again, use Reissue certificate.";
  if (!shouldReissue) return undefined;
  return hasOpenRequest
    ? "Saving cancels the renewal in progress and reissues the certificate immediately."
    : "Saving reissues the certificate immediately, and the signer switches to the new certificate.";
};

const BasicsFields = ({
  name,
  description,
  nameError,
  onNameChange,
  onDescriptionChange
}: {
  name: string;
  description: string;
  nameError?: string;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
}) => (
  <Stack gap={16}>
    <Field label="Name" description="Lowercase, with dashes." error={nameError} wide>
      <Input
        value={name}
        autoComplete="off"
        invalid={Boolean(nameError)}
        onChange={(event) => onNameChange(event.target.value)}
      />
    </Field>
    <Field label="Description" optional wide>
      <Textarea
        value={description}
        rows={3}
        maxLength={256}
        onChange={(event) => onDescriptionChange(event.target.value)}
      />
    </Field>
  </Stack>
);

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
  const currentKey = currentKeyFor(
    signer,
    caOptions.find((option) => option.id === signer.caId)?.caType
  );
  const [initial] = useState<SignerCertDraft>(() => initialDraftFor(signer, currentKey));
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

  const keepAlgorithm = isSameKeyLocation(signer, cert, currentKey)
    ? currentKey.keyAlgorithm
    : undefined;
  const changes = certificateChanges(signer, cert, currentKey, isAdcs);
  const existing = usesExistingCertificate(cert);
  const { isNameOnly, isCertificateRevoked } = editRestrictions(signer);
  const shouldReissue = !isNameOnly && changes.any;

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
        await reissue
          .mutateAsync(reissueRequest(signer.id, cert, isAdcs, changes))
          .catch(readableFailure("Couldn't reissue the certificate."));
      }
      const update = basicsUpdate(
        signer,
        name,
        description,
        existing ? (signer.certificateRenewBeforeDays ?? null) : nextRenew
      );
      if (update)
        await updateSigner
          .mutateAsync(update)
          .catch(readableFailure("Couldn't update the signer."));
      onClose();
    } finally {
      submitting.current = false;
    }
  };

  let completeLabel = "Save";
  if (shouldReissue && !existing) completeLabel = "Save and reissue";
  const keyNote = signingKeyNote({
    existing,
    isCertificateRevoked,
    shouldReissue,
    hasOpenRequest: Boolean(getOpenCertificateRequest(signer))
  });

  const basicsStep = {
    title: "Basics",
    summary: name || undefined,
    description: isNameOnly
      ? "This signer is being revoked, so only its name and description can change."
      : undefined,
    aside: stepAside("Changing the name or description doesn't affect the certificate."),
    validate: () => {
      const parsed = nameSchema.safeParse(name);
      setNameError(parsed.success ? undefined : parsed.error.issues[0]?.message);
      return parsed.success;
    },
    content: (
      <BasicsFields
        name={name}
        description={description}
        nameError={nameError}
        onNameChange={(next) => {
          setName(next);
          setNameError(undefined);
        }}
        onDescriptionChange={setDescription}
      />
    )
  };

  return (
    <>
      <MultiStep
        variant="sheet"
        layout="aside"
        title={`Edit ${signer.name}`}
        badges={
          <>
            <SignerStatusBadge signer={signer} />
            <DocumentationLink href={CODE_SIGNING_DOCS.editSigner} subject="Signers" />
          </>
        }
        open
        step={step}
        onStepChange={setStep}
        onOpenChange={(next) => {
          if (next || submitting.current) return;
          requestDiscard();
        }}
        completeLabel={completeLabel}
        onComplete={save}
        steps={
          isNameOnly
            ? [basicsStep]
            : [
                basicsStep,
                {
                  title: "Certificate",
                  summary: ca?.name,
                  validate: () => {
                    const next = certificateErrors(
                      cert,
                      caOptions,
                      signer.certificateTtlDays ?? null
                    );
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
                  aside: stepAside(
                    "Changing the key source or algorithm reissues the certificate with a new key. Some CAs require a key held in an HSM."
                  ),
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
                        canUseExistingCertificate={!isCertificateRevoked}
                      />
                    </Stack>
                  )
                }
              ]
        }
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
