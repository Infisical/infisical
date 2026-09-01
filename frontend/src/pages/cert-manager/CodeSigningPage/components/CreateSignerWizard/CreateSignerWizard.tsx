import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PenTool } from "lucide-react";

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
import { useOrganization, useSubscription, useUser } from "@app/context";
import { getCaIssuanceCapabilities, useListCasByProjectId } from "@app/hooks/api/ca";
import { CaStatus, CaType } from "@app/hooks/api/ca/enums";
import { DigiCertCaPurpose } from "@app/hooks/api/ca/types";
import { useListHsmConnectors } from "@app/hooks/api/hsmConnectors";
import { useGetOrganizationGroups } from "@app/hooks/api/organization";
import { useListProjectIdentityMemberships } from "@app/hooks/api/projectIdentityMembership";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  CertKeySource,
  SignerKeyAlgorithm,
  SignerMemberRole,
  useCreateSigner
} from "@app/hooks/api/signers";
import { useGetOrgUsers } from "@app/hooks/api/users";

import { SignerKeyStep } from "../../../components/SignerKeyStep";
import { PkiDocsUrls } from "../../../pki-docs-urls";
import { ApprovalPolicyStep } from "./ApprovalPolicyStep";
import { BasicsStep } from "./BasicsStep";
import { CertificateStep } from "./CertificateStep";
import { MembersStep } from "./MembersStep";
import { BasicsForm, basicsSchema, CertificateForm, certificateSchema } from "./schemas";
import { CaOption, INITIAL_WIZARD_STATE, MemberOption, STEPS, WizardState } from "./types";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
};

export const CreateSignerWizard = ({ isOpen, onOpenChange, projectId }: Props) => {
  const { currentOrg } = useOrganization();
  const { user } = useUser();
  const orgId = currentOrg?.id ?? "";

  const creatorLabel =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.username ||
    user.email ||
    user.id;

  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL_WIZARD_STATE);
  const [submitting, setSubmitting] = useState(false);

  const cas = useListCasByProjectId();
  const usersQuery = useGetOrgUsers(orgId);
  const identitiesQuery = useListProjectIdentityMemberships({
    projectId,
    projectType: ProjectType.CertificateManager,
    limit: 1000
  });
  const groupsQuery = useGetOrganizationGroups(orgId);
  const { subscription } = useSubscription();
  const { data: hsmConnectors = [], isPending: isHsmConnectorsLoading } = useListHsmConnectors({
    enabled: Boolean(subscription?.hsm)
  });

  const createSigner = useCreateSigner();

  const caOptions: CaOption[] = useMemo(() => {
    const list = cas.data ?? [];
    return list
      .filter((ca) => ca.status === CaStatus.ACTIVE)
      .filter((ca) => {
        if (ca.type === CaType.INTERNAL) return true;
        if (ca.type === CaType.AWS_PCA) return true;
        if (ca.type === CaType.AZURE_AD_CS) return true;
        if (ca.type === CaType.ADCS) return true;
        if (ca.type === CaType.DIGICERT) {
          return ca.configuration?.purpose === DigiCertCaPurpose.CodeSigning;
        }
        return false;
      })
      .map((ca) => ({
        id: ca.id,
        name: ca.name,
        groupType: ca.type === CaType.INTERNAL ? "internal" : "external",
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
          ca.type === CaType.ADCS
            ? { appConnectionId: ca.configuration.appConnectionId }
            : undefined
      }));
  }, [cas.data]);

  const userOptions: MemberOption[] = useMemo(() => {
    const users = usersQuery.data ?? [];
    return users.map((u) => ({
      value: u.user.id,
      label:
        [u.user.firstName, u.user.lastName].filter(Boolean).join(" ").trim() ||
        u.user.username ||
        u.user.email ||
        u.user.id
    }));
  }, [usersQuery.data]);

  const identityOptions: MemberOption[] = useMemo(() => {
    const memberships = identitiesQuery.data?.identityMemberships ?? [];
    return memberships.map((im) => ({ value: im.identity.id, label: im.identity.name }));
  }, [identitiesQuery.data]);

  const groupOptions: MemberOption[] = useMemo(() => {
    const groups = groupsQuery.data ?? [];
    return groups.map((g) => ({ value: g.id, label: g.name }));
  }, [groupsQuery.data]);

  const hsmConnectorOptions = useMemo(
    () =>
      hsmConnectors.map((c) => ({
        id: c.id,
        name: c.name,
        slotLabel: c.slotLabel
      })),
    [hsmConnectors]
  );

  const basicsForm = useForm<BasicsForm>({
    resolver: zodResolver(basicsSchema),
    values: { name: state.name, description: state.description || undefined }
  });

  const certificateForm = useForm<CertificateForm>({
    resolver: zodResolver(certificateSchema),
    values: {
      caId: state.caId,
      commonName: state.commonName,
      certificateTtlDays: state.certificateTtlDays,
      certificateRenewBeforeDays: state.certificateRenewBeforeDays,
      keyAlgorithm: state.keyAlgorithm,
      keySource: state.keySource,
      hsmConnectorId: state.hsmConnectorId,
      reissueFromExternalOrderId: state.reissueFromExternalOrderId,
      adcsTemplate: state.adcsTemplate
    }
  });

  const selectedCaId = certificateForm.watch("caId");
  const selectedCa = caOptions.find((o) => o.id === selectedCaId) ?? null;
  const caCaps = getCaIssuanceCapabilities(selectedCa?.caType);

  useEffect(() => {
    if (caCaps.requiresHsm && certificateForm.getValues("keySource") !== CertKeySource.Hsm) {
      certificateForm.setValue("keySource", CertKeySource.Hsm, { shouldValidate: false });
    }
  }, [caCaps.requiresHsm, certificateForm]);

  const reset = () => {
    setStep(0);
    setState(INITIAL_WIZARD_STATE);
    basicsForm.reset({ name: "", description: undefined });
    certificateForm.reset({
      caId: "",
      commonName: "",
      certificateTtlDays: 365,
      certificateRenewBeforeDays: null,
      keyAlgorithm: SignerKeyAlgorithm.RSA_2048,
      keySource: CertKeySource.Infisical,
      hsmConnectorId: null,
      reissueFromExternalOrderId: null,
      adcsTemplate: ""
    });
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const onCreate = async () => {
    setSubmitting(true);
    try {
      const approvalPolicy =
        state.policySteps.length > 0
          ? {
              steps: state.policySteps.map((s, idx) => ({
                stepNumber: idx + 1,
                name: s.name.trim() || null,
                requiredApprovals: Math.max(1, s.requiredApprovals),
                approverUserIds: s.approverUserIds,
                approverGroupIds: s.approverGroupIds
              })),
              constraints: {
                maxSignings: state.maxSignings,
                maxWindowDuration: state.maxWindowDuration
              }
            }
          : undefined;

      const certificate =
        state.keySource === CertKeySource.Hsm && state.hsmConnectorId
          ? {
              keySource: CertKeySource.Hsm,
              hsmConnectorId: state.hsmConnectorId
            }
          : undefined;

      const selectedCaType = caOptions.find((o) => o.id === state.caId)?.caType;
      let externalConfiguration;
      if (state.reissueFromExternalOrderId) {
        externalConfiguration = {
          caType: CaType.DIGICERT,
          reissueFromExternalOrderId: state.reissueFromExternalOrderId
        } as const;
      } else if (selectedCaType === CaType.ADCS && state.adcsTemplate.trim()) {
        externalConfiguration = {
          caType: CaType.ADCS,
          template: state.adcsTemplate.trim()
        } as const;
      }

      await createSigner.mutateAsync({
        projectId,
        name: state.name,
        description: state.description || undefined,
        caId: state.caId,
        commonName: state.commonName,
        certificateTtlDays: state.certificateTtlDays,
        certificateRenewBeforeDays: state.certificateRenewBeforeDays,
        keyAlgorithm: state.keyAlgorithm,
        members: state.pendingMembers.map((m) => ({
          kind: m.kind,
          id: m.id,
          role: m.role
        })),
        approvalPolicy,
        certificate,
        externalConfiguration
      });

      handleClose(false);
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to create signer"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isLast = step === STEPS.length - 1;

  const persistCertificateForm = () => {
    const values = certificateForm.getValues();
    setState((prev) => ({
      ...prev,
      caId: values.caId,
      commonName: values.commonName,
      certificateTtlDays: values.certificateTtlDays,
      certificateRenewBeforeDays: values.certificateRenewBeforeDays,
      keyAlgorithm: values.keyAlgorithm,
      keySource: values.keySource,
      hsmConnectorId: values.hsmConnectorId ?? null,
      reissueFromExternalOrderId: values.reissueFromExternalOrderId ?? null,
      adcsTemplate: values.adcsTemplate ?? ""
    }));
  };

  const goNext = async () => {
    if (step === 0) {
      const ok = await basicsForm.trigger();
      if (!ok) return;
      const values = basicsForm.getValues();
      setState((prev) => ({ ...prev, name: values.name, description: values.description ?? "" }));
      setStep(1);
      return;
    }
    if (step === 1) {
      const ok = await certificateForm.trigger([
        "caId",
        "commonName",
        "certificateTtlDays",
        "certificateRenewBeforeDays",
        "reissueFromExternalOrderId"
      ]);
      if (!ok) return;
      if (
        selectedCa?.caType === CaType.ADCS &&
        !certificateForm.getValues("adcsTemplate")?.trim()
      ) {
        certificateForm.setError("adcsTemplate", { message: "Certificate template is required" });
        return;
      }
      persistCertificateForm();
      setStep(2);
      return;
    }
    if (step === 2) {
      const ok = await certificateForm.trigger(["keySource", "keyAlgorithm", "hsmConnectorId"]);
      if (!ok) return;
      persistCertificateForm();
      setStep(3);
      return;
    }
    if (step === 3) {
      setStep(4);
      return;
    }
    if (step === 4) {
      await onCreate();
    }
  };

  const goBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const dirty =
    step > 0 ||
    state.name !== "" ||
    state.commonName !== "" ||
    state.pendingMembers.length > 0 ||
    state.policySteps.length > 0;

  const currentStep = STEPS[step];
  const ctaLabel = isLast ? "Create Signer" : "Continue";
  const firstEmptyPolicyStepIndex = state.policySteps.findIndex(
    (s) => s.approverUserIds.length + s.approverGroupIds.length === 0
  );
  const hasEmptyPolicyStep = firstEmptyPolicyStepIndex >= 0;
  const missingConstraints =
    state.policySteps.length > 0 && !state.maxSignings && !state.maxWindowDuration;
  const ctaDisabled = isLast && (hasEmptyPolicyStep || missingConstraints);

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-[1500px]">
        <SheetHeader className="border-b">
          <SheetTitle>
            <div className="flex w-full items-start gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-project/10 text-project">
                <PenTool className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-x-2 text-mineshaft-300">
                  Create Signer
                  <DocumentationLinkBadge href={PkiDocsUrls.codeSigning.signers.create} />
                </div>
                <p className="text-sm leading-4 text-mineshaft-400">
                  A code-signing certificate with the members and approval policy that govern its
                  use.
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
                <CertificateStep
                  form={certificateForm}
                  caOptions={caOptions}
                  isCasLoading={cas.isPending}
                />
              )}
              {step === 2 && (
                <SignerKeyStep
                  control={certificateForm.control}
                  requiresHsm={caCaps.requiresHsm}
                  minRsaKeyBits={caCaps.minRsaKeyBits}
                  hsmConnectorOptions={hsmConnectorOptions}
                  isHsmConnectorsLoading={isHsmConnectorsLoading}
                />
              )}
              {step === 3 && (
                <MembersStep
                  userOptions={userOptions.filter((u) => u.value !== user.id)}
                  identityOptions={identityOptions}
                  groupOptions={groupOptions}
                  state={state}
                  setState={setState}
                  isUsersLoading={usersQuery.isPending}
                  isIdentitiesLoading={identitiesQuery.isPending}
                  isGroupsLoading={groupsQuery.isPending}
                  creator={{ id: user.id, label: creatorLabel }}
                />
              )}
              {step === 4 && (
                <ApprovalPolicyStep
                  state={state}
                  setState={setState}
                  approverOptions={[
                    { value: user.id, label: creatorLabel, kind: "user" as const },
                    ...state.pendingMembers
                      .filter((m) => m.role !== SignerMemberRole.Auditor)
                      .filter((m) => m.kind === "user" || m.kind === "group")
                      .map((m) => ({
                        value: m.id,
                        label: m.label,
                        kind: m.kind as "user" | "group"
                      }))
                  ]}
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
              {/* eslint-disable-next-line no-nested-ternary */}
              {hasEmptyPolicyStep
                ? `Step ${firstEmptyPolicyStepIndex + 1} needs at least one approver, or remove it.`
                : // eslint-disable-next-line no-nested-ternary
                  missingConstraints
                  ? "Set at least one of 'signatures per approval' or 'signing window'."
                  : dirty
                    ? "Unsaved changes"
                    : ""}
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
              <Button
                variant="project"
                onClick={goNext}
                isPending={submitting}
                isDisabled={ctaDisabled}
              >
                {ctaLabel}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
