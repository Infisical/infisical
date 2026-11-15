import { useState } from "react";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";

import { PostQuantumCertificatesUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import {
  ProjectPermissionHsmConnectorActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { InternalCaType } from "@app/hooks/api/ca/enums";
import type {
  TCreateCertificateAuthorityDTO,
  TUnifiedCertificateAuthority
} from "@app/hooks/api/ca/types";
import { certKeyAlgorithms, isPqcAlgorithm } from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { CertKeySource } from "@app/hooks/api/signers/types";

import { readableFailure, saved } from "../../access/toast";
import { useConnectionCreation } from "../../components/connection-creation";
import { useV4Adapter } from "../../data/adapters";
import type { CaPlan } from "../../data/certificate-authorities/contract";
import { useUpgradeGate } from "../../license/useUpgradeGate";
import { AddHsmConnectorSheet } from "../SettingsPage/hsm-connector-wizard";
import {
  type CaDraft,
  initialDraft,
  KEY_SOURCE_DESCRIPTIONS,
  PATH_LENGTHS,
  SUBJECT_FIELDS,
  supports,
  toCreateCaDto,
  validateBasics,
  validateDistribution,
  validateKey,
  validateSubject
} from "./create-ca";
import { type FieldErrors, hasErrors } from "./crl";
import { CrlUrlsField, CrlValidityField } from "./crl-fields";
import { useCaScope } from "./scope";

type StepProps = {
  draft: CaDraft;
  errors: FieldErrors;
  set: <K extends keyof CaDraft>(key: K, value: CaDraft[K]) => void;
  patch: (next: Partial<CaDraft>) => void;
};

const BasicsStep = ({ draft, errors, set }: StepProps) => (
  <Stack gap={16}>
    <Field
      label="Name"
      description="A unique slug used to reference this CA."
      error={errors.name}
      wide
    >
      <Input
        value={draft.name}
        invalid={Boolean(errors.name)}
        placeholder="my-internal-ca"
        autoComplete="off"
        onChange={(event) => set("name", event.target.value)}
      />
    </Field>
    <Field
      label="CA type"
      description={
        draft.type === InternalCaType.ROOT
          ? "Self-signed and active immediately."
          : "Created pending a certificate. Generate its CSR and have a parent CA sign it."
      }
      wide
    >
      <Select
        aria-label="CA type"
        value={draft.type}
        options={[
          { value: InternalCaType.ROOT, label: "Root" },
          { value: InternalCaType.INTERMEDIATE, label: "Intermediate" }
        ]}
        onValueChange={(next) => set("type", next as InternalCaType)}
      />
    </Field>
  </Stack>
);

const SubjectStep = ({ draft, errors, patch }: StepProps) => (
  <Stack gap={16}>
    {SUBJECT_FIELDS.map(({ key, label, placeholder }) => {
      const error = key === "commonName" ? errors.commonName : undefined;
      return (
        <Field key={key} label={label} error={error} wide>
          <Input
            value={draft[key]}
            placeholder={placeholder}
            invalid={Boolean(error)}
            onChange={(event) => patch({ [key]: event.target.value })}
          />
        </Field>
      );
    })}
  </Stack>
);

const hsmOptionReason = (plan: CaPlan | undefined, canAttach: boolean) => {
  if (!plan?.hsm) return "Enterprise plan";
  return canAttach ? undefined : "Requires permission to attach HSM connectors";
};

const KeySourceField = ({ draft, patch, plan }: StepProps & { plan?: CaPlan }) => {
  const { permission } = useCaScope();
  const canAttach = permission.can(
    ProjectPermissionHsmConnectorActions.Attach,
    ProjectPermissionSub.HsmConnectors
  );
  const hsmReason = hsmOptionReason(plan, canAttach);
  return (
    <Field label="Key source" description={KEY_SOURCE_DESCRIPTIONS[draft.keySource]} wide>
      <Select
        aria-label="Key source"
        value={draft.keySource}
        options={[
          { value: CertKeySource.Infisical, label: "Infisical" },
          {
            value: CertKeySource.Hsm,
            label: "HSM",
            disabled: Boolean(hsmReason),
            description: hsmReason
          },
          {
            value: CertKeySource.AwsKms,
            label: "AWS KMS",
            disabled: !plan?.pkiAwsKmsSigning,
            description: plan?.pkiAwsKmsSigning ? undefined : "Enterprise plan"
          }
        ]}
        onValueChange={(next) => {
          const source = next as CertKeySource;
          patch({
            keySource: source,
            keyAlgorithm: supports(source, draft.keyAlgorithm)
              ? draft.keyAlgorithm
              : CertKeyAlgorithm.ECDSA_P256
          });
        }}
      />
    </Field>
  );
};

const HsmConnectorField = ({
  draft,
  errors,
  set,
  orgId,
  plan
}: StepProps & { orgId: string; plan?: CaPlan }) => {
  const { permission } = useCaScope();
  const { data: connectors = [], isPending } = useV4Adapter(
    "certificateAuthorities"
  ).useHsmConnectors({ enabled: Boolean(plan?.hsm) });
  const { data: hsmPlan } = useV4Adapter("certManagerSettings").useHsmPlan(orgId);
  const [adding, setAdding] = useState(false);
  const canAdd =
    Boolean(plan?.hsm && hsmPlan) &&
    permission.can(
      ProjectPermissionHsmConnectorActions.Attach,
      ProjectPermissionSub.HsmConnectors
    ) &&
    permission.can(ProjectPermissionHsmConnectorActions.Create, ProjectPermissionSub.HsmConnectors);
  return (
    <Field
      label="HSM connector"
      description="The HSM where Infisical generates the CA signing key."
      error={errors.hsmConnectorId}
      wide
    >
      <Combobox
        label="HSM connector"
        value={draft.hsmConnectorId}
        loading={isPending}
        invalid={Boolean(errors.hsmConnectorId)}
        placeholder="Select an HSM connector"
        emptyText="No HSM connectors yet. Add one in Cert Manager settings."
        options={connectors.map((connector) => ({
          value: connector.id,
          label: connector.name,
          description: connector.slotLabel
        }))}
        onValueChange={(next) => set("hsmConnectorId", next)}
      />
      {canAdd && (
        <div>
          <Button variant="link" icon="plus" onClick={() => setAdding(true)}>
            Add HSM connector
          </Button>
        </div>
      )}
      {hsmPlan && (
        <AddHsmConnectorSheet orgId={orgId} plan={hsmPlan} open={adding} onOpenChange={setAdding} />
      )}
    </Field>
  );
};

const AwsKeyFields = ({ draft, errors, set, projectId }: StepProps & { projectId: string }) => {
  const { data: connections = [], isPending } = useV4Adapter(
    "certificateAuthorities"
  ).useAvailableConnections(AppConnection.AWS, projectId);
  const [created, setCreated] = useState<{ id: string; name: string }>();
  const creation = useConnectionCreation(AppConnection.AWS, projectId, (connection) => {
    setCreated(connection);
    set("appConnectionId", connection.id);
  });
  const options = [
    ...connections,
    ...(created && !connections.some((entry) => entry.id === created.id) ? [created] : [])
  ].map((connection) => ({ value: connection.id, label: connection.name }));
  return (
    <>
      <Field
        label="AWS connection"
        description="Infisical uses it to create the key and send signing requests."
        error={errors.appConnectionId}
        wide
      >
        <Combobox
          label="AWS connection"
          value={draft.appConnectionId}
          loading={isPending}
          invalid={Boolean(errors.appConnectionId)}
          placeholder="Select an AWS connection"
          emptyText="No AWS connections yet."
          options={options}
          creation={creation}
          onValueChange={(next) => set("appConnectionId", next)}
        />
      </Field>
      <Field
        label="Region"
        description="The AWS region where the CA signing key is created."
        error={errors.region}
        wide
      >
        <Combobox
          label="Region"
          value={draft.region}
          invalid={Boolean(errors.region)}
          placeholder="Select a region"
          options={AWS_REGIONS.map((region) => ({
            value: region.slug,
            label: region.name,
            meta: region.slug
          }))}
          onValueChange={(next) => set("region", next)}
        />
      </Field>
    </>
  );
};

const KeyAlgorithmField = ({ draft, errors, set, plan }: StepProps & { plan?: CaPlan }) => {
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const pqcLocked = !plan?.pkiPqc;
  return (
    <Field label="Key algorithm" error={errors.keyAlgorithm} wide>
      <Select
        aria-label="Key algorithm"
        value={draft.keyAlgorithm}
        invalid={Boolean(errors.keyAlgorithm)}
        options={certKeyAlgorithms
          .filter(({ value }) => supports(draft.keySource, value))
          .map(({ label, value }) => ({
            value,
            label,
            description: isPqcAlgorithm(value) && pqcLocked ? "Enterprise plan" : undefined
          }))}
        onValueChange={(next) => {
          if (isPqcAlgorithm(next) && pqcLocked) {
            openUpgradeGate({
              intent: PostQuantumCertificatesUpgradeIntent,
              paywallKey: "cert-manager.ca-key-algorithm"
            });
            return;
          }
          set("keyAlgorithm", next as CertKeyAlgorithm);
        }}
      />
      {upgradeGate}
    </Field>
  );
};

const RootValidityFields = ({ draft, errors, set }: StepProps) => (
  <>
    <Field
      label="Valid until"
      description="When the self-signed root CA certificate expires."
      error={errors.notAfter}
      wide
    >
      <Input
        type="date"
        width="sm"
        value={draft.notAfter}
        invalid={Boolean(errors.notAfter)}
        onChange={(event) => set("notAfter", event.target.value)}
      />
    </Field>
    <Field
      label="Path length"
      description="How many intermediate CAs may follow this CA in the chain. -1 means no limit."
      wide
    >
      <Select
        aria-label="Path length"
        width="xs"
        value={draft.maxPathLength}
        options={PATH_LENGTHS}
        onValueChange={(next) => set("maxPathLength", next)}
      />
    </Field>
  </>
);

const KeyStep = (props: StepProps & { orgId: string; projectId: string; plan?: CaPlan }) => {
  const { draft } = props;
  return (
    <Stack gap={16}>
      <KeySourceField {...props} />
      {draft.keySource === CertKeySource.Hsm && <HsmConnectorField {...props} />}
      {draft.keySource === CertKeySource.AwsKms && <AwsKeyFields {...props} />}
      <KeyAlgorithmField {...props} />
      {draft.type === InternalCaType.ROOT && <RootValidityFields {...props} />}
    </Stack>
  );
};

const OcspLabel = ({ locked }: { locked: boolean }) => (
  <Inline gap={8} align="center">
    Enable OCSP
    {locked && (
      <Badge size="sm" tone="info">
        Enterprise
      </Badge>
    )}
  </Inline>
);

const DistributionStep = ({ draft, errors, set, patch, plan }: StepProps & { plan?: CaPlan }) => (
  <Stack gap={16}>
    <Switch
      layout="row"
      label={<OcspLabel locked={!plan?.pkiOcsp} />}
      description="Issued certificates carry an OCSP responder URL that answers revocation checks for them."
      checked={draft.isOcspEnabled}
      disabledReason={plan?.pkiOcsp ? undefined : "OCSP is on the Enterprise plan"}
      onCheckedChange={(checked) => set("isOcspEnabled", checked)}
    />
    <Switch
      layout="row"
      label="Disable managed CRL URL"
      description="Leave the Infisical-managed CRL endpoint out of issued certificates, so only the custom URLs below are included."
      checked={draft.disableManagedCrlDistributionPointUrl}
      onCheckedChange={(checked) => set("disableManagedCrlDistributionPointUrl", checked)}
    />
    <CrlUrlsField
      urls={draft.crlDistributionPointUrls}
      errors={errors}
      locked={!plan?.caCrl}
      onChange={(urls) => patch({ crlDistributionPointUrls: urls })}
    />
    <CrlValidityField
      value={draft.crlValidityDays}
      error={errors.crlValidityDays}
      locked={!plan?.caCrl}
      onChange={(value) => set("crlValidityDays", value)}
    />
  </Stack>
);

const useCreateCaDraft = (plan?: CaPlan) => {
  const [draft, setDraft] = useState<CaDraft>(() => initialDraft(plan));
  const [errors, setErrors] = useState<FieldErrors>({});
  const patch = (next: Partial<CaDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setErrors({});
  };
  const set = <K extends keyof CaDraft>(key: K, value: CaDraft[K]) =>
    patch({ [key]: value } as Partial<CaDraft>);
  const check = (validate: (draft: CaDraft) => FieldErrors) => {
    const next = validate(draft);
    setErrors(next);
    return !hasErrors(next);
  };
  const reset = () => {
    setDraft(initialDraft(plan));
    setErrors({});
  };
  const changed = JSON.stringify(draft) !== JSON.stringify(initialDraft(plan));
  return { stepProps: { draft, errors, set, patch }, check, reset, changed };
};

export const CreateCaSheet = ({
  orgId,
  projectId,
  open,
  onOpenChange,
  onCreated
}: {
  orgId: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (ca: TUnifiedCertificateAuthority) => void;
}) => {
  const adapter = useV4Adapter("certificateAuthorities");
  const { data: plan } = adapter.useCaPlan(orgId);
  const create = adapter.useCreateCa();
  const { stepProps, check, reset, changed } = useCreateCaDraft(plan);
  const { draft } = stepProps;
  const [step, setStep] = useState(0);
  const [discarding, setDiscarding] = useState(false);

  const close = () => {
    reset();
    setStep(0);
    onOpenChange(false);
  };

  const requestClose = () => (step > 0 || changed ? setDiscarding(true) : close());

  const submit = async () => {
    const created = await create
      .mutateAsync(toCreateCaDto(draft) as TCreateCertificateAuthorityDTO)
      .catch(readableFailure("Could not create the CA."));
    saved(`CA ${draft.name} created`);
    close();
    onCreated?.(created);
  };

  return (
    <>
      <MultiStep
        variant="sheet"
        size="lg"
        title="Create internal CA"
        open={open}
        step={step}
        onStepChange={setStep}
        onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}
        completeLabel="Create CA"
        onComplete={submit}
        steps={[
          {
            title: "Basics",
            summary: draft.name || undefined,
            validate: () => check(validateBasics),
            content: <BasicsStep {...stepProps} />
          },
          {
            title: "Subject",
            description:
              "The distinguished name embedded in the CA certificate. Set at least one field.",
            summary: draft.commonName || draft.organization || undefined,
            validate: () => check(validateSubject),
            content: <SubjectStep {...stepProps} />
          },
          {
            title: "Key and validity",
            summary: certKeyAlgorithms.find(({ value }) => value === draft.keyAlgorithm)?.label,
            validate: () => check(validateKey),
            content: <KeyStep {...stepProps} orgId={orgId} projectId={projectId} plan={plan} />
          },
          {
            title: "Distribution",
            description: "How clients check whether certificates from this CA are revoked.",
            validate: () => check(validateDistribution),
            content: <DistributionStep {...stepProps} plan={plan} />
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
        description="Your certificate authority setup will be lost."
      />
    </>
  );
};
