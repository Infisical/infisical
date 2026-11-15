import { useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { format } from "date-fns";

import {
  ProjectPermissionHsmConnectorActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { getCaIssuanceCapabilities } from "@app/hooks/api/ca/capabilities";
import { CaStatus, CaType } from "@app/hooks/api/ca/enums";
import { DigiCertCaPurpose } from "@app/hooks/api/ca/types";
import { type HsmKeyAlgorithm, hsmKeyAlgorithmLabels } from "@app/hooks/api/hsmConnectors/types";
import {
  CertKeySource,
  HSM_SUPPORTED_KEY_ALGORITHMS,
  SignerKeyAlgorithm,
  signerKeyAlgorithmLabels,
  SignerMemberRole,
  signerMemberRoleDescriptions,
  signerMemberRoleLabels,
  SignerStatus,
  signerStatusLabels,
  type TSigner,
  type TSignerMember
} from "@app/hooks/api/signers/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { useProjectPermission } from "../../access/permissions";
import { errorMessage } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { AddHsmConnectorSheet } from "../SettingsPage/hsm-connector-wizard";

const DOCS = "https://infisical.com/docs/documentation/platform/pki/code-signing";

export const CODE_SIGNING_DOCS = {
  signers: `${DOCS}/signers`,
  createSigner: `${DOCS}/signers#create-a-signer`,
  editSigner: `${DOCS}/signers#edit-a-signer`,
  policy: `${DOCS}/approvals#configure-the-approval-policy`,
  requestToSign: `${DOCS}/approvals#request-to-sign`,
  preApprove: `${DOCS}/approvals#pre-approve-signing`,
  connect: `${DOCS}/overview`,
  pkcs11: `${DOCS}/pkcs11-module`,
  ksp: `${DOCS}/windows-ksp`
};

export const SIGNERS_PAGE_SIZE = 25;

export const dateOnly = (value: string) => format(new Date(value), "MMM d, yyyy");
export const dateTime = (value: string) => format(new Date(value), "MMM d, yyyy HH:mm");
export const dateTimeSeconds = (value: string) => format(new Date(value), "MMM d, yyyy HH:mm:ss");

const STATUS_TONES: Record<SignerStatus, "ok" | "warn" | "bad" | "outline"> = {
  [SignerStatus.Active]: "ok",
  [SignerStatus.Pending]: "warn",
  [SignerStatus.Failed]: "bad",
  [SignerStatus.Expired]: "bad",
  [SignerStatus.Disabled]: "outline"
};

export const signerStatusNote = (signer: TSigner) => {
  if (signer.status === SignerStatus.Failed && signer.certificateFailureReason)
    return signer.certificateFailureReason;
  if (signer.status === SignerStatus.Pending && signer.certificateFailureReason)
    return `Last attempt failed, retrying. ${signer.certificateFailureReason}`;
  if (signer.status === SignerStatus.Pending && signer.externalOrder)
    return `DigiCert order #${signer.externalOrder.orderId} is awaiting approval. DigiCert sent an approval link to the order's approver, and issuance completes automatically once they approve it.`;
  return undefined;
};

export const SignerStatusBadge = ({ signer }: { signer: TSigner }) => {
  const badge = (
    <Badge tone={STATUS_TONES[signer.status] ?? "outline"} dot>
      {signerStatusLabels[signer.status] ?? signer.status}
    </Badge>
  );
  const note = signerStatusNote(signer);
  return note ? <Tooltip content={note}>{badge}</Tooltip> : badge;
};

export const SIGNER_ROLE_OPTIONS = Object.values(SignerMemberRole).map((role) => ({
  value: role,
  label: signerMemberRoleLabels[role],
  description: signerMemberRoleDescriptions[role]
}));

export type SignerMemberKind = "user" | "identity" | "group";

export const SIGNER_MEMBER_KINDS: { value: SignerMemberKind; label: string; single: string }[] = [
  { value: "user", label: "Users", single: "User" },
  { value: "identity", label: "Machine identities", single: "Machine identity" },
  { value: "group", label: "Groups", single: "Group" }
];

export const memberKind = (member: TSignerMember): SignerMemberKind => {
  if (member.actorUserId) return "user";
  if (member.actorIdentityId) return "identity";
  return "group";
};

export const memberActorId = (member: TSignerMember) =>
  member.actorUserId ?? member.actorIdentityId ?? member.actorGroupId ?? "";

export const memberLabel = (member: TSignerMember) => {
  if (member.actorUserId)
    return (
      member.details?.name ||
      member.details?.username ||
      member.details?.email ||
      member.actorUserId
    );
  if (member.actorIdentityId) return member.details?.name || member.actorIdentityId;
  return member.details?.name || member.details?.slug || member.actorGroupId || "Unknown";
};

export type SignerCaOption = {
  id: string;
  name: string;
  caType: CaType;
  digicert?: { appConnectionId: string; organizationId: number; productNameId: string };
  adcs?: { appConnectionId: string };
};

export const useSignerCaOptions = () => {
  const { data, isPending } = useV4Adapter("certificates").useCertificateAuthorities();
  const options: SignerCaOption[] = (data ?? [])
    .filter((ca) => ca.status === CaStatus.ACTIVE)
    .filter(
      (ca) =>
        [CaType.INTERNAL, CaType.AWS_PCA, CaType.AZURE_AD_CS, CaType.ADCS].includes(ca.type) ||
        (ca.type === CaType.DIGICERT && ca.configuration?.purpose === DigiCertCaPurpose.CodeSigning)
    )
    .map((ca) => ({
      id: ca.id,
      name: ca.name,
      caType: ca.type,
      digicert:
        ca.type === CaType.DIGICERT
          ? {
              appConnectionId: ca.configuration.appConnectionId,
              organizationId: ca.configuration.organizationId,
              productNameId: ca.configuration.productNameId
            }
          : undefined,
      adcs:
        ca.type === CaType.ADCS ? { appConnectionId: ca.configuration.appConnectionId } : undefined
    }));
  return { options, isPending };
};

export type SignerCertDraft = {
  caId: string;
  commonName: string;
  certificateTtlDays: string;
  certificateRenewBeforeDays: string;
  keySource: CertKeySource;
  keyAlgorithm: SignerKeyAlgorithm;
  hsmConnectorId: string;
  externalOrderId: string;
  useExistingKey: boolean;
  hsmKeyLabel: string;
  hsmKeyId: string;
  adcsTemplate: string;
};

export type SignerCertErrors = Partial<Record<keyof SignerCertDraft, string>>;

export const INITIAL_CERT_DRAFT: SignerCertDraft = {
  caId: "",
  commonName: "",
  certificateTtlDays: "365",
  certificateRenewBeforeDays: "",
  keySource: CertKeySource.Infisical,
  keyAlgorithm: SignerKeyAlgorithm.RSA_2048,
  hsmConnectorId: "",
  externalOrderId: "",
  useExistingKey: false,
  hsmKeyLabel: "",
  hsmKeyId: "",
  adcsTemplate: ""
};

export const usesExistingCertificate = (draft: SignerCertDraft) =>
  Boolean(draft.externalOrderId) && draft.useExistingKey;

export const renewBeforeValue = (draft: SignerCertDraft) =>
  draft.certificateRenewBeforeDays.trim() === "" ? null : Number(draft.certificateRenewBeforeDays);

export const isAlgorithmAllowed = (
  algorithm: SignerKeyAlgorithm,
  keySource: CertKeySource,
  minRsaKeyBits?: number,
  currentKeyAlgorithm?: SignerKeyAlgorithm
) => {
  if (algorithm === currentKeyAlgorithm) return true;
  if (keySource === CertKeySource.Hsm && !HSM_SUPPORTED_KEY_ALGORITHMS.includes(algorithm))
    return false;
  if (minRsaKeyBits && algorithm.startsWith("RSA_") && Number(algorithm.slice(4)) < minRsaKeyBits)
    return false;
  return true;
};

const allowedAlgorithms = (
  keySource: CertKeySource,
  minRsaKeyBits?: number,
  currentKeyAlgorithm?: SignerKeyAlgorithm
) =>
  Object.values(SignerKeyAlgorithm).filter((algorithm) =>
    isAlgorithmAllowed(algorithm, keySource, minRsaKeyBits, currentKeyAlgorithm)
  );

export const caCapabilities = (caOptions: SignerCaOption[], caId: string) => {
  const ca = caOptions.find((option) => option.id === caId);
  return { ca, ...getCaIssuanceCapabilities(ca?.caType) };
};

export const pickCa = (
  draft: SignerCertDraft,
  caOptions: SignerCaOption[],
  caId: string
): Partial<SignerCertDraft> => {
  const { requiresHsm, minRsaKeyBits } = caCapabilities(caOptions, caId);
  const keySource = requiresHsm ? CertKeySource.Hsm : draft.keySource;
  return {
    caId,
    externalOrderId: "",
    useExistingKey: false,
    keySource,
    keyAlgorithm: isAlgorithmAllowed(draft.keyAlgorithm, keySource, minRsaKeyBits)
      ? draft.keyAlgorithm
      : (allowedAlgorithms(keySource, minRsaKeyBits)[0] ?? draft.keyAlgorithm)
  };
};

export type HsmKeyLookup = {
  active: boolean;
  pending: boolean;
  keys: { keyId: string; keyAlgorithm: string }[] | undefined;
  choices: { keyId: string; keyAlgorithm: string }[];
  problem?: string;
  hint: string;
  keyIdRequired: boolean;
  unresolved: boolean;
  resolvedKeyId: string;
};

export const useHsmKeyLookup = (
  draft: SignerCertDraft,
  importCheckError?: string
): HsmKeyLookup => {
  const active = draft.keySource === CertKeySource.Hsm && usesExistingCertificate(draft);
  const typed = draft.hsmKeyLabel.trim();
  const [debounced] = useDebounce(typed);
  const {
    data: keys,
    isFetching,
    error
  } = useV4Adapter("codeSigning").useHsmConnectorKeys(draft.hsmConnectorId, debounced, active);
  const pending = isFetching || (Boolean(draft.hsmConnectorId) && debounced !== typed);
  const choices = (keys ?? []).filter((key) => Boolean(key.keyId));
  const canChoose = (keys?.length ?? 0) > 1 && choices.length > 0;
  let hint = "The label of the certificate's private key on the HSM.";
  if (pending) hint = "Looking up the key...";
  else if (keys?.length === 1)
    hint = keys[0].keyId ? `Found the key (ID ${keys[0].keyId}).` : "Found the key.";
  else if (keys && keys.length > 1)
    hint = canChoose
      ? `${keys.length} keys have this label. Select one below.`
      : `${keys.length} keys have this label and none has a key ID. Give the keys unique labels.`;
  let problem: string | undefined;
  if (error) problem = errorMessage(error) ?? "Could not look up the key.";
  else if (keys?.length === 0) problem = "No private key with this label in the connector's slot.";
  else if (importCheckError) problem = importCheckError;
  const keyIdRequired = Boolean(keys && keys.length > 1 && keys.some((key) => key.keyId));
  let resolvedKeyId = draft.hsmKeyId;
  if (keys?.length === 1) resolvedKeyId = keys[0].keyId;
  else if (!choices.some((key) => key.keyId === draft.hsmKeyId)) resolvedKeyId = "";
  return {
    active,
    pending,
    keys,
    choices: canChoose ? choices : [],
    problem,
    hint,
    keyIdRequired,
    unresolved: pending || keys?.length === 0,
    resolvedKeyId
  };
};

const wholeDays = (value: string, min: number, max: number) => {
  const parsed = Number(value);
  if (value.trim() === "" || !Number.isInteger(parsed)) return "Must be a whole number of days";
  if (parsed < min) return `Must be at least ${min} day${min === 1 ? "" : "s"}`;
  if (parsed > max) return `Must be at most ${max} days`;
  return undefined;
};

export const certificateErrors = (
  draft: SignerCertDraft,
  caOptions: SignerCaOption[],
  renewalTtlDays?: number | null
): SignerCertErrors => {
  const errors: SignerCertErrors = {};
  const { ca } = caCapabilities(caOptions, draft.caId);
  if (!draft.caId) errors.caId = "Certificate Authority is required";
  if (ca?.caType === CaType.ADCS && !draft.adcsTemplate.trim())
    errors.adcsTemplate = "Certificate template is required";
  if (!draft.externalOrderId) {
    if (!draft.commonName.trim()) errors.commonName = "Common Name is required";
    else if (draft.commonName.trim().length > 256)
      errors.commonName = "Must be 256 characters or fewer";
    const ttlError = wholeDays(draft.certificateTtlDays, 1, 3650);
    if (ttlError) errors.certificateTtlDays = ttlError;
  }
  if (draft.certificateRenewBeforeDays.trim() !== "") {
    const renewError = wholeDays(draft.certificateRenewBeforeDays, 1, 30);
    const ttl = draft.externalOrderId ? renewalTtlDays : Number(draft.certificateTtlDays);
    if (renewError) errors.certificateRenewBeforeDays = renewError;
    else if (
      !usesExistingCertificate(draft) &&
      ttl != null &&
      !(draft.externalOrderId && renewalTtlDays === undefined) &&
      Number(draft.certificateRenewBeforeDays) >= ttl
    )
      errors.certificateRenewBeforeDays =
        "Renew before must be less than the certificate validity (days).";
  }
  return errors;
};

export const keyErrors = (
  draft: SignerCertDraft,
  lookup: HsmKeyLookup,
  minRsaKeyBits?: number,
  currentKeyAlgorithm?: SignerKeyAlgorithm
): SignerCertErrors => {
  const errors: SignerCertErrors = {};
  if (draft.keySource === CertKeySource.Hsm && !draft.hsmConnectorId)
    errors.hsmConnectorId = "Pick an HSM Connector.";
  if (lookup.active) {
    if (!draft.hsmKeyLabel.trim())
      errors.hsmKeyLabel = "Enter the label of the certificate's private key on the HSM.";
    else if (lookup.unresolved)
      errors.hsmKeyLabel =
        lookup.problem ??
        "Wait for the key lookup, or enter the label of a private key on the HSM.";
    if (lookup.keyIdRequired && !lookup.resolvedKeyId) errors.hsmKeyId = "Select which key to use.";
  } else if (
    !isAlgorithmAllowed(draft.keyAlgorithm, draft.keySource, minRsaKeyBits, currentKeyAlgorithm)
  ) {
    errors.keyAlgorithm =
      draft.keySource === CertKeySource.Hsm
        ? "This algorithm is not supported by HSM-backed keys. Pick RSA-2048, RSA-4096, ECDSA P-256, or ECDSA P-384."
        : "This CA needs a larger RSA key.";
  }
  return errors;
};

type FieldsProps = {
  draft: SignerCertDraft;
  errors: SignerCertErrors;
  patch: (next: Partial<SignerCertDraft>) => void;
};

const DigiCertOrderField = ({
  draft,
  patch,
  digicert
}: FieldsProps & { digicert: NonNullable<SignerCaOption["digicert"]> }) => {
  const { data: orders = [], isPending } = useV4Adapter("codeSigning").useDigiCertOrders(digicert);
  const options = orders.map((order) => ({
    value: String(order.orderId),
    label: `${order.commonName || order.organizationName || "Code signing certificate"} (#${order.orderId})`,
    commonName: order.commonName
  }));
  return (
    <Field
      label="Existing order"
      optional
      description="Use an order you already have instead of creating a new one. The name and validity come from that order. Leave empty to issue a new certificate."
      wide
    >
      <Combobox
        label="Existing order"
        clearable
        clearLabel="Clear existing order"
        loading={isPending}
        placeholder="Issue a new certificate"
        emptyText="No existing orders found."
        options={options}
        value={draft.externalOrderId}
        onValueChange={(next) => {
          const picked = options.find((option) => option.value === next);
          patch({
            externalOrderId: next,
            useExistingKey: next ? draft.useExistingKey : false,
            commonName: picked ? picked.commonName || "Code signing certificate" : draft.commonName
          });
        }}
      />
    </Field>
  );
};

const AdcsTemplateField = ({
  draft,
  errors,
  patch,
  connectionId,
  isEdit
}: FieldsProps & { connectionId: string; isEdit: boolean }) => {
  const { data: templates = [], isPending } = useV4Adapter(
    "certificateAuthorities"
  ).useAdcsTemplates(connectionId, { enabled: Boolean(connectionId) });
  const description = isEdit
    ? "The AD CS template this signer requests. Changing it reissues the certificate."
    : "The AD CS template this signer requests. Use a code-signing template published on your CA.";
  return (
    <Field label="Certificate template" description={description} error={errors.adcsTemplate} wide>
      {templates.length > 0 || isPending ? (
        <Combobox
          label="Certificate template"
          clearable
          loading={isPending}
          placeholder={isPending ? "Loading templates" : "Select a template"}
          invalid={Boolean(errors.adcsTemplate)}
          options={templates.map((template) => ({ value: template.name, label: template.name }))}
          value={draft.adcsTemplate}
          onValueChange={(next) => patch({ adcsTemplate: next })}
        />
      ) : (
        <Input
          value={draft.adcsTemplate}
          placeholder="CodeSigning"
          invalid={Boolean(errors.adcsTemplate)}
          onChange={(event) => patch({ adcsTemplate: event.target.value })}
        />
      )}
    </Field>
  );
};

export const SignerCertificateFields = ({
  draft,
  errors,
  patch,
  caOptions,
  casPending,
  isEdit = false,
  createCaHref
}: FieldsProps & {
  caOptions: SignerCaOption[];
  casPending: boolean;
  isEdit?: boolean;
  createCaHref?: string;
}) => {
  const { ca, supportsExistingOrderReuse } = caCapabilities(caOptions, draft.caId);
  let caDescription = isEdit
    ? "Changing the CA reissues the certificate immediately."
    : "The CA that issues the certificate.";
  if (!casPending && !caOptions.length && createCaHref)
    caDescription = "No active CAs can issue code signing certificates yet. Create one first.";
  return (
    <>
      <Field label="Certificate Authority" description={caDescription} error={errors.caId} wide>
        <Combobox
          label="Certificate Authority"
          loading={casPending}
          invalid={Boolean(errors.caId)}
          placeholder="Select a Certificate Authority"
          emptyText="No active CAs available."
          options={caOptions.map((option) => ({
            value: option.id,
            label: option.name,
            group: option.caType === CaType.INTERNAL ? "Internal CAs" : "External CAs"
          }))}
          value={draft.caId}
          onValueChange={(next) => patch(pickCa(draft, caOptions, next))}
        />
        {!casPending && !caOptions.length && createCaHref && (
          <div>
            <Button variant="link" icon="plus" asChild>
              <a href={createCaHref}>Create a Certificate Authority</a>
            </Button>
          </div>
        )}
      </Field>
      {ca?.caType === CaType.ADCS && (
        <AdcsTemplateField
          draft={draft}
          errors={errors}
          patch={patch}
          connectionId={ca.adcs?.appConnectionId ?? ""}
          isEdit={isEdit}
        />
      )}
      {supportsExistingOrderReuse && ca?.digicert && (
        <DigiCertOrderField draft={draft} errors={errors} patch={patch} digicert={ca.digicert} />
      )}
      {!draft.externalOrderId && (
        <Field
          label="Common Name"
          description={
            isEdit
              ? "The legal name on the certificate. Changing it reissues the certificate."
              : "The legal name shown on the certificate."
          }
          error={errors.commonName}
          wide
        >
          <Input
            value={draft.commonName}
            placeholder="Acme Mobile, Inc."
            invalid={Boolean(errors.commonName)}
            onChange={(event) => patch({ commonName: event.target.value })}
          />
        </Field>
      )}
      {!draft.externalOrderId && (
        <Field
          label="Validity (days)"
          description={
            isEdit
              ? "How long each certificate stays valid. Changing it reissues the certificate."
              : undefined
          }
          error={errors.certificateTtlDays}
        >
          <Input
            type="number"
            min={1}
            max={3650}
            width="sm"
            value={draft.certificateTtlDays}
            placeholder="365"
            invalid={Boolean(errors.certificateTtlDays)}
            onChange={(event) => patch({ certificateTtlDays: event.target.value })}
          />
        </Field>
      )}
      <Field
        label="Renew before (days)"
        optional
        description="Renew this many days before the certificate expires. Leave empty to turn off auto-renewal."
        error={errors.certificateRenewBeforeDays}
      >
        <Input
          type="number"
          min={1}
          max={30}
          width="sm"
          value={draft.certificateRenewBeforeDays}
          placeholder="Off"
          invalid={Boolean(errors.certificateRenewBeforeDays)}
          onChange={(event) => patch({ certificateRenewBeforeDays: event.target.value })}
        />
      </Field>
    </>
  );
};

export const SignerKeyFields = ({
  draft,
  errors,
  patch,
  orgId,
  projectId,
  requiresHsm,
  minRsaKeyBits,
  currentKeyAlgorithm,
  lookup
}: FieldsProps & {
  orgId: string;
  projectId: string;
  requiresHsm: boolean;
  minRsaKeyBits?: number;
  currentKeyAlgorithm?: SignerKeyAlgorithm;
  lookup: HsmKeyLookup;
}) => {
  const { permission } = useProjectPermission(projectId);
  const { data: subscription } = useV4Adapter("codeSigning").useSubscription(orgId);
  const isHsmLicensed = Boolean(subscription?.hsm);
  const { data: connectors = [], isPending: connectorsPending } = useV4Adapter(
    "certificateAuthorities"
  ).useHsmConnectors({ enabled: isHsmLicensed });
  const { data: hsmPlan } = useV4Adapter("certManagerSettings").useHsmPlan(orgId);
  const [adding, setAdding] = useState(false);
  const canAttach = permission.can(
    ProjectPermissionHsmConnectorActions.Attach,
    ProjectPermissionSub.HsmConnectors
  );
  const canCreate =
    canAttach &&
    permission.can(ProjectPermissionHsmConnectorActions.Create, ProjectPermissionSub.HsmConnectors);
  const isHsm = draft.keySource === CertKeySource.Hsm;
  const existing = usesExistingCertificate(draft);
  let hsmReason: string | undefined;
  if (!isHsmLicensed) hsmReason = "Enterprise plan";
  else if (!canAttach) hsmReason = "Requires permission to attach HSM connectors";
  let keySourceHint = "Infisical manages the keypair.";
  if (requiresHsm) keySourceHint = "This CA only issues certificates with an HSM-backed key.";
  else if (isHsm) keySourceHint = "Uses an HSM-backed key.";

  return (
    <>
      <Field label="Key source" description={keySourceHint} wide>
        <Select
          aria-label="Key source"
          value={draft.keySource}
          disabled={requiresHsm}
          options={[
            { value: CertKeySource.Infisical, label: "Infisical", disabled: requiresHsm },
            {
              value: CertKeySource.Hsm,
              label: "HSM",
              disabled: Boolean(hsmReason),
              description: hsmReason
            }
          ]}
          onValueChange={(next) => {
            const keySource = next as CertKeySource;
            patch({
              keySource,
              keyAlgorithm: isAlgorithmAllowed(
                draft.keyAlgorithm,
                keySource,
                minRsaKeyBits,
                currentKeyAlgorithm
              )
                ? draft.keyAlgorithm
                : (allowedAlgorithms(keySource, minRsaKeyBits, currentKeyAlgorithm)[0] ??
                  draft.keyAlgorithm)
            });
          }}
        />
      </Field>
      {isHsm && (
        <Field
          label="HSM connector"
          description="Which HSM connector holds the signing key."
          error={errors.hsmConnectorId}
          wide
        >
          <Combobox
            label="HSM connector"
            loading={connectorsPending && isHsmLicensed}
            invalid={Boolean(errors.hsmConnectorId)}
            placeholder="Select an HSM connector"
            emptyText="No HSM connectors yet."
            options={connectors.map((connector) => ({
              value: connector.id,
              label: connector.name,
              description: `Slot ${connector.slotLabel}`
            }))}
            value={draft.hsmConnectorId}
            onValueChange={(next) => patch({ hsmConnectorId: next })}
          />
          {canCreate && hsmPlan && (
            <div>
              <Button variant="link" icon="plus" onClick={() => setAdding(true)}>
                Add HSM connector
              </Button>
            </div>
          )}
          {hsmPlan && (
            <AddHsmConnectorSheet
              orgId={orgId}
              plan={hsmPlan}
              open={adding}
              onOpenChange={setAdding}
            />
          )}
        </Field>
      )}
      {isHsm && draft.externalOrderId && (
        <Field
          orientation="horizontal"
          label="Use existing key"
          description={
            draft.useExistingKey
              ? "Sign with the certificate already issued in this order and its key on the HSM."
              : "DigiCert issues a new certificate into this order and revokes the current one within 72 hours. After that, the old certificate can no longer be used to sign."
          }
          wide
        >
          <Switch
            aria-label="Use existing key"
            checked={draft.useExistingKey}
            onCheckedChange={(checked) => patch({ useExistingKey: checked })}
          />
        </Field>
      )}
      {isHsm && existing && (
        <Field
          label="Key label"
          description={lookup.hint}
          error={errors.hsmKeyLabel ?? (draft.hsmKeyLabel.trim() ? lookup.problem : undefined)}
          wide
        >
          <Input
            value={draft.hsmKeyLabel}
            placeholder="acme-code-signing-2026"
            invalid={Boolean(errors.hsmKeyLabel || (draft.hsmKeyLabel.trim() && lookup.problem))}
            onChange={(event) => patch({ hsmKeyLabel: event.target.value })}
          />
        </Field>
      )}
      {isHsm && existing && lookup.choices.length > 0 && (
        <Field
          label="Key ID"
          description="The key's CKA_ID on the HSM."
          error={errors.hsmKeyId}
          wide
        >
          <Select
            aria-label="Key ID"
            placeholder="Select a key"
            invalid={Boolean(errors.hsmKeyId)}
            value={lookup.resolvedKeyId || undefined}
            options={lookup.choices.map((key) => ({
              value: key.keyId,
              label: key.keyAlgorithm
                ? `ID ${key.keyId} (${hsmKeyAlgorithmLabels[key.keyAlgorithm as HsmKeyAlgorithm] ?? key.keyAlgorithm})`
                : `ID ${key.keyId}`
            }))}
            onValueChange={(next) => patch({ hsmKeyId: next })}
          />
        </Field>
      )}
      {!existing && (
        <Field
          label="Key algorithm"
          description="RSA is widely compatible. ECDSA is smaller and faster."
          error={errors.keyAlgorithm}
          wide
        >
          <Select
            aria-label="Key algorithm"
            invalid={Boolean(errors.keyAlgorithm)}
            value={draft.keyAlgorithm}
            options={allowedAlgorithms(draft.keySource, minRsaKeyBits, currentKeyAlgorithm).map(
              (algorithm) => ({ value: algorithm, label: signerKeyAlgorithmLabels[algorithm] })
            )}
            onValueChange={(next) => patch({ keyAlgorithm: next as SignerKeyAlgorithm })}
          />
        </Field>
      )}
    </>
  );
};
