import { useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable } from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Select } from "@infisical/cipher/ui/select";
import { Textarea } from "@infisical/cipher/ui/textarea";

import { CaType } from "@app/hooks/api/ca/enums";
import {
  CertKeySource,
  SignerMemberRole,
  signerMemberRoleLabels,
  type TSignerExternalConfiguration
} from "@app/hooks/api/signers/types";
import { slugSchema } from "@app/lib/schemas";

import { errorMessage, readableFailure } from "../../access/toast";
import { Muted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { orgHref } from "../../links";
import { type PickedSignerMembers, SignerAddMemberDialog } from "./add-member-dialog";
import {
  type ApproverOption,
  type PolicyLimits,
  PolicyLimitsFields,
  policyProblem,
  type PolicyStepDraft,
  PolicyStepsEditor,
  policyStepsPayload
} from "./policy-editor";
import {
  caCapabilities,
  certificateErrors,
  CODE_SIGNING_DOCS,
  INITIAL_CERT_DRAFT,
  keyErrors,
  renewBeforeValue,
  SIGNER_MEMBER_KINDS,
  SIGNER_ROLE_OPTIONS,
  SignerCertDraft,
  SignerCertErrors,
  SignerCertificateFields,
  SignerKeyFields,
  type SignerMemberKind,
  useHsmKeyLookup,
  usesExistingCertificate,
  useSignerCaOptions
} from "./signer-shared";

type PendingMember = { kind: SignerMemberKind; id: string; label: string; role: SignerMemberRole };

const nameSchema = slugSchema({ min: 1, max: 64, field: "Name" });

const kindLabel = (kind: SignerMemberKind) =>
  SIGNER_MEMBER_KINDS.find((entry) => entry.value === kind)?.single ?? kind;

const CreateSheet = ({
  orgId,
  projectId,
  onClose
}: {
  orgId: string;
  projectId: string;
  onClose: () => void;
}) => {
  const adapter = useV4Adapter("codeSigning");
  const create = adapter.useCreateSigner();
  const checkImport = adapter.useCheckSignerCertificateImport();
  const { user } = useV4Session();
  const { options: caOptions, isPending: casPending } = useSignerCaOptions();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [cert, setCert] = useState<SignerCertDraft>(INITIAL_CERT_DRAFT);
  const [certErrors, setCertErrors] = useState<SignerCertErrors>({});
  const [importCheckError, setImportCheckError] = useState<string>();
  const [members, setMembers] = useState<PendingMember[]>([]);
  const [addingMember, setAddingMember] = useState(false);
  const [policySteps, setPolicySteps] = useState<PolicyStepDraft[]>([]);
  const [limits, setLimits] = useState<PolicyLimits>({
    maxSignings: null,
    maxWindowDuration: null
  });
  const submitting = useRef(false);
  const lookup = useHsmKeyLookup(cert, importCheckError);
  const { requiresHsm, minRsaKeyBits } = caCapabilities(caOptions, cert.caId);
  const dirty =
    step > 0 ||
    Boolean(name || description) ||
    JSON.stringify(cert) !== JSON.stringify(INITIAL_CERT_DRAFT) ||
    members.length > 0 ||
    policySteps.length > 0;
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: onClose
  });

  const patchCert = (next: Partial<SignerCertDraft>) => {
    setCert((current) => ({ ...current, ...next }));
    setCertErrors((current) => {
      const cleared = { ...current };
      (Object.keys(next) as (keyof SignerCertDraft)[]).forEach((key) => delete cleared[key]);
      return cleared;
    });
    setImportCheckError(undefined);
  };

  const approverOptions: ApproverOption[] = [
    { value: user.id, label: user.name || user.email, kind: "user" },
    ...members
      .filter((member) => member.role !== SignerMemberRole.Auditor && member.kind !== "identity")
      .map((member) => ({
        value: member.id,
        label: member.label,
        kind: member.kind as "user" | "group"
      }))
  ];
  const policyIssue = policyProblem(policySteps, limits);

  const addMembers = ({ kind, members: picked, role }: PickedSignerMembers) =>
    setMembers((current) => [
      ...current,
      ...picked.map((member) => ({ kind, id: member.id, label: member.label, role }))
    ]);

  const submit = async () => {
    const existing = usesExistingCertificate(cert);
    const caType = caOptions.find((option) => option.id === cert.caId)?.caType;
    let externalConfiguration: TSignerExternalConfiguration | undefined;
    if (cert.externalOrderId)
      externalConfiguration = existing
        ? { importFromExternalOrderId: cert.externalOrderId }
        : { reissueFromExternalOrderId: cert.externalOrderId };
    else if (caType === CaType.ADCS && cert.adcsTemplate.trim())
      externalConfiguration = { template: cert.adcsTemplate.trim() };
    submitting.current = true;
    try {
      await create
        .mutateAsync({
          projectId,
          name: name.trim(),
          description: description.trim() || undefined,
          caId: cert.caId,
          commonName: existing ? undefined : cert.commonName.trim(),
          certificateTtlDays: existing ? undefined : Number(cert.certificateTtlDays),
          certificateRenewBeforeDays: renewBeforeValue(cert),
          keyAlgorithm: existing ? undefined : cert.keyAlgorithm,
          members: members.map((member) => ({
            kind: member.kind,
            id: member.id,
            role: member.role
          })),
          approvalPolicy: policySteps.length
            ? { steps: policyStepsPayload(policySteps), constraints: limits }
            : undefined,
          certificate:
            cert.keySource === CertKeySource.Hsm && cert.hsmConnectorId
              ? {
                  keySource: CertKeySource.Hsm,
                  hsmConnectorId: cert.hsmConnectorId,
                  hsmKeyLabel: existing ? cert.hsmKeyLabel.trim() : undefined,
                  hsmKeyId: existing && lookup.resolvedKeyId ? lookup.resolvedKeyId : undefined
                }
              : undefined,
          externalConfiguration
        })
        .catch(readableFailure("Couldn't create the signer."));
      onClose();
    } finally {
      submitting.current = false;
    }
  };

  return (
    <>
      <MultiStep
        variant="sheet"
        size="lg"
        title="Create signer"
        description={<DocumentationLink href={CODE_SIGNING_DOCS.createSigner} subject="Signers" />}
        open
        step={step}
        onStepChange={setStep}
        onOpenChange={(next) => {
          if (next || submitting.current) return;
          requestDiscard();
        }}
        completeLabel="Create signer"
        onComplete={submit}
        steps={[
          {
            title: "Basics",
            summary: name || undefined,
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
                    placeholder="mobile-app-prod"
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
                    placeholder="What this signer signs, like iOS and Android production bundles"
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>
              </Stack>
            )
          },
          {
            title: "Certificate",
            summary: caOptions.find((option) => option.id === cert.caId)?.name,
            validate: () => {
              const next = certificateErrors(cert, caOptions);
              setCertErrors(next);
              return !Object.keys(next).length;
            },
            content: (
              <Stack gap={16}>
                <SignerCertificateFields
                  draft={cert}
                  errors={certErrors}
                  patch={patchCert}
                  caOptions={caOptions}
                  casPending={casPending}
                  createCaHref={orgHref(orgId, "/cert-manager/certificate-authorities")}
                />
              </Stack>
            )
          },
          {
            title: "Signing key",
            validate: async () => {
              const next = keyErrors(cert, lookup, minRsaKeyBits);
              setCertErrors(next);
              if (Object.keys(next).length) return false;
              if (!usesExistingCertificate(cert)) return true;
              try {
                await checkImport.mutateAsync({
                  caId: cert.caId,
                  externalOrderId: cert.externalOrderId,
                  certificate: {
                    hsmConnectorId: cert.hsmConnectorId,
                    hsmKeyLabel: cert.hsmKeyLabel.trim(),
                    hsmKeyId: lookup.resolvedKeyId || undefined
                  }
                });
                return true;
              } catch (error) {
                const message =
                  errorMessage(error) ?? "Could not check the key against the certificate.";
                setImportCheckError(message);
                return { message };
              }
            },
            content: (
              <Stack gap={16}>
                <SignerKeyFields
                  draft={cert}
                  errors={certErrors}
                  patch={patchCert}
                  orgId={orgId}
                  projectId={projectId}
                  requiresHsm={requiresHsm}
                  minRsaKeyBits={minRsaKeyBits}
                  lookup={lookup}
                />
              </Stack>
            )
          },
          {
            title: "Members",
            summary: members.length ? `${members.length + 1} members` : undefined,
            description:
              "Administrators manage the signer, operators sign artifacts, and auditors read activity but can't sign.",
            content: (
              <Stack gap={12}>
                <Inline justify="end">
                  <Button variant="outline" icon="user-plus" onClick={() => setAddingMember(true)}>
                    Add members
                  </Button>
                </Inline>
                <DataTable
                  label="Signer members"
                  rows={[
                    {
                      kind: "user" as const,
                      id: user.id,
                      label: user.name || user.email,
                      role: SignerMemberRole.Administrator
                    },
                    ...members
                  ]}
                  getRowId={(member) => `${member.kind}:${member.id}`}
                  rowLabel={(member) => member.label}
                  columns={[
                    {
                      id: "member",
                      header: "Member",
                      primary: true,
                      grow: true,
                      render: (member) => member.label,
                      text: (member) => member.label,
                      secondary: (member) => (member.id === user.id ? "You" : undefined)
                    },
                    {
                      id: "type",
                      header: "Type",
                      width: 160,
                      render: (member) => <Badge tone="outline">{kindLabel(member.kind)}</Badge>
                    },
                    {
                      id: "role",
                      header: "Role",
                      width: 180,
                      render: (member) =>
                        member.id === user.id && member.kind === "user" ? (
                          <Muted>{signerMemberRoleLabels[SignerMemberRole.Administrator]}</Muted>
                        ) : (
                          <Select
                            size="sm"
                            aria-label={`Role for ${member.label}`}
                            options={SIGNER_ROLE_OPTIONS}
                            value={member.role}
                            onValueChange={(role) =>
                              setMembers((current) =>
                                current.map((entry) =>
                                  entry.kind === member.kind && entry.id === member.id
                                    ? { ...entry, role: role as SignerMemberRole }
                                    : entry
                                )
                              )
                            }
                          />
                        )
                    }
                  ]}
                  rowActions={{
                    renderMenu: (member) => {
                      const isSelf = member.id === user.id && member.kind === "user";
                      return (
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={isSelf}
                          description={isSelf ? "You're added as an administrator" : undefined}
                          onSelect={() =>
                            setMembers((current) =>
                              current.filter(
                                (entry) => !(entry.kind === member.kind && entry.id === member.id)
                              )
                            )
                          }
                        >
                          <Icon name="trash" />
                          Remove member
                        </DropdownMenuItem>
                      );
                    }
                  }}
                />
              </Stack>
            )
          },
          {
            title: "Approval policy",
            description:
              "When approval is on, members ask before signing. Steps run in order, and limits cap how much each approval allows.",
            disabledReason: policyIssue,
            content: (
              <Stack gap={24}>
                <PolicyStepsEditor
                  steps={policySteps}
                  onChange={setPolicySteps}
                  approverOptions={approverOptions}
                  emptyApproversText="Add users or groups as members in the previous step first."
                />
                {policySteps.length > 0 && (
                  <Field
                    group
                    label="What an approval allows"
                    description="At least one limit is required."
                  >
                    <PolicyLimitsFields limits={limits} onChange={setLimits} />
                  </Field>
                )}
              </Stack>
            )
          }
        ]}
      />
      {addingMember && (
        <SignerAddMemberDialog
          orgId={orgId}
          projectId={projectId}
          excludeUserId={user.id}
          taken={new Set(members.map((member) => `${member.kind}:${member.id}`))}
          onSubmit={addMembers}
          onClose={() => setAddingMember(false)}
        />
      )}
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        title="Discard signer?"
        description="Your signer setup will be lost."
      />
    </>
  );
};

export const CreateSignerSheet = ({
  open,
  orgId,
  projectId,
  onClose
}: {
  open: boolean;
  orgId: string;
  projectId: string;
  onClose: () => void;
}) => (open ? <CreateSheet orgId={orgId} projectId={projectId} onClose={onClose} /> : null);
