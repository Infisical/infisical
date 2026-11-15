import { useId, useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";

import { ProjectPermissionCertificateAuthorityActions } from "@app/context/ProjectPermissionContext/types";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { CaSigningConfigType } from "@app/hooks/api/ca/enums";
import type { TCaSigningConfig } from "@app/hooks/api/ca/queries";
import type { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { ConnectionField } from "../CertificateAuthoritiesPage/install/forms";
import { caBlock, useCaScope } from "../CertificateAuthoritiesPage/scope";

const SIGNING_LABELS: Record<CaSigningConfigType, string> = {
  [CaSigningConfigType.INTERNAL]: "Internal (Infisical CA)",
  [CaSigningConfigType.MANUAL]: "Manual",
  [CaSigningConfigType.VENAFI]: "Venafi TLS Protect Cloud",
  [CaSigningConfigType.AZURE_ADCS]: "Azure AD CS (Web Enrollment)",
  [CaSigningConfigType.ADCS]: "ADCS"
};

const EDITABLE = new Set([
  CaSigningConfigType.VENAFI,
  CaSigningConfigType.AZURE_ADCS,
  CaSigningConfigType.ADCS
]);

const text = (value: unknown) => (typeof value === "string" ? value : "");

const draftOf = (config: TCaSigningConfig) => ({
  appConnectionId: config.appConnectionId ?? "",
  applicationId: text(config.destinationConfig?.applicationId),
  issuingTemplateId: text(config.destinationConfig?.issuingTemplateId),
  template: text(config.destinationConfig?.template),
  validityPeriod:
    typeof config.destinationConfig?.validityPeriod === "number"
      ? String(config.destinationConfig.validityPeriod)
      : ""
});

type Draft = ReturnType<typeof draftOf>;
type Errors = Partial<Record<keyof Draft, string>>;

const CONNECTIONS = {
  [CaSigningConfigType.VENAFI]: { app: AppConnection.Venafi, label: "Venafi connection" },
  [CaSigningConfigType.AZURE_ADCS]: {
    app: AppConnection.AzureADCS,
    label: "Azure AD CS connection"
  }
} as Partial<Record<CaSigningConfigType, { app: AppConnection; label: string }>>;

const ADCS_CONNECTION = { app: AppConnection.ADCS, label: "ADCS connection" };

const validityIssue = (validity: string) =>
  validity && (!Number.isInteger(Number(validity)) || Number(validity) < 1)
    ? "Must be at least 1 day"
    : undefined;

const validateSigning = (draft: Draft, isVenafi: boolean): Errors => ({
  appConnectionId: draft.appConnectionId ? undefined : "Pick a connection",
  applicationId: isVenafi && !draft.applicationId ? "Pick an application" : undefined,
  issuingTemplateId: isVenafi && !draft.issuingTemplateId ? "Pick an issuing template" : undefined,
  template: !isVenafi && !draft.template ? "Pick a certificate template" : undefined,
  validityPeriod: validityIssue(draft.validityPeriod.trim())
});

const toDestinationConfig = (draft: Draft, type: CaSigningConfigType) => {
  const validity = draft.validityPeriod.trim();
  const validityConfig = validity ? { validityPeriod: Number(validity) } : {};
  if (type === CaSigningConfigType.VENAFI)
    return {
      applicationId: draft.applicationId,
      issuingTemplateId: draft.issuingTemplateId,
      ...validityConfig
    };
  return {
    template: draft.template,
    ...(type === CaSigningConfigType.AZURE_ADCS && validityConfig)
  };
};

type FieldsProps = {
  draft: Draft;
  errors: Errors;
  patch: (next: Partial<Draft>) => void;
};

const VenafiFields = ({ draft, errors, patch }: FieldsProps) => {
  const adapter = useV4Adapter("certificateAuthorities");
  const hasConnection = Boolean(draft.appConnectionId);
  const hasApplication = Boolean(draft.applicationId);
  const applications = adapter.useVenafiApplications(draft.appConnectionId, {
    enabled: hasConnection
  });
  const issuingTemplates = adapter.useVenafiIssuingTemplates(
    draft.appConnectionId,
    draft.applicationId,
    { enabled: hasConnection && hasApplication }
  );
  return (
    <>
      <Field label="Application" error={errors.applicationId} wide>
        <Combobox
          label="Application"
          value={draft.applicationId}
          disabled={!hasConnection}
          loading={hasConnection && applications.isPending}
          invalid={Boolean(errors.applicationId)}
          placeholder={hasConnection ? "Select an application" : "Pick a connection first"}
          options={(applications.data ?? []).map((application) => ({
            value: application.id,
            label: application.name
          }))}
          onValueChange={(next) => patch({ applicationId: next, issuingTemplateId: "" })}
        />
      </Field>
      <Field label="Issuing template" error={errors.issuingTemplateId} wide>
        <Combobox
          label="Issuing template"
          value={draft.issuingTemplateId}
          disabled={!hasApplication}
          loading={hasApplication && issuingTemplates.isPending}
          invalid={Boolean(errors.issuingTemplateId)}
          placeholder={hasApplication ? "Select an issuing template" : "Pick an application first"}
          options={(issuingTemplates.data ?? []).map((template) => ({
            value: template.id,
            label: template.name
          }))}
          onValueChange={(next) => patch({ issuingTemplateId: next })}
        />
      </Field>
    </>
  );
};

const useTemplateOptions = (isAzure: boolean, connectionId: string) => {
  const adapter = useV4Adapter("certificateAuthorities");
  const azure = adapter.useAzureAdcsTemplates(connectionId, {
    enabled: isAzure && Boolean(connectionId)
  });
  const adcs = adapter.useAdcsTemplates(connectionId, {
    enabled: !isAzure && Boolean(connectionId)
  });
  if (isAzure)
    return {
      options: (azure.data ?? []).map((template) => ({ value: template, label: template })),
      isPending: azure.isPending
    };
  return {
    options: (adcs.data ?? []).map((template) => ({ value: template.name, label: template.name })),
    isPending: adcs.isPending
  };
};

const TemplateField = ({ draft, errors, patch, isAzure }: FieldsProps & { isAzure: boolean }) => {
  const hasConnection = Boolean(draft.appConnectionId);
  const templates = useTemplateOptions(isAzure, draft.appConnectionId);
  return (
    <Field label="Certificate template" error={errors.template} wide>
      <Combobox
        label="Certificate template"
        value={draft.template}
        disabled={!hasConnection}
        loading={hasConnection && templates.isPending}
        invalid={Boolean(errors.template)}
        placeholder={hasConnection ? "Select a template" : "Pick a connection first"}
        options={templates.options}
        onValueChange={(next) => patch({ template: next })}
      />
    </Field>
  );
};

const ValidityField = ({ draft, errors, patch }: FieldsProps) => (
  <Field
    label="Validity period (days)"
    optional
    description="How many days the CA certificate is valid."
    error={errors.validityPeriod}
  >
    <Input
      type="number"
      width="xs"
      min={1}
      placeholder="365"
      value={draft.validityPeriod}
      invalid={Boolean(errors.validityPeriod)}
      onChange={(event) => patch({ validityPeriod: event.target.value })}
    />
  </Field>
);

const EditSigningSheet = ({
  caId,
  projectId,
  config,
  open,
  onClose
}: {
  caId: string;
  projectId: string;
  config: TCaSigningConfig;
  open: boolean;
  onClose: () => void;
}) => {
  const update = useV4Adapter("certificateAuthorities").useUpdateCaSigningConfig();
  const formId = useId();
  const [draft, setDraft] = useState(() => draftOf(config));
  const [errors, setErrors] = useState<Errors>({});
  const isVenafi = config.type === CaSigningConfigType.VENAFI;
  const isAzure = config.type === CaSigningConfigType.AZURE_ADCS;
  const connection = CONNECTIONS[config.type] ?? ADCS_CONNECTION;
  const fieldsProps = {
    draft,
    errors,
    patch: (next: Partial<Draft>) => {
      setDraft((current) => ({ ...current, ...next }));
      setErrors({});
    }
  };

  const submit = async () => {
    const next = validateSigning(draft, isVenafi);
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    try {
      await update.mutateAsync({
        caId,
        appConnectionId: draft.appConnectionId,
        destinationConfig: toDestinationConfig(draft, config.type)
      });
      saved("Signing configuration updated");
      onClose();
    } catch (error) {
      failed("Could not update the signing configuration", error);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && !update.isPending && onClose()}>
      <SheetContent pending={update.isPending}>
        <SheetHeader>
          <SheetTitle>Edit signing configuration</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form
            id={formId}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Stack gap={16}>
              <ConnectionField
                app={connection.app}
                projectId={projectId}
                label={connection.label}
                value={draft.appConnectionId}
                error={errors.appConnectionId}
                onChange={(id) =>
                  fieldsProps.patch({
                    appConnectionId: id,
                    applicationId: "",
                    issuingTemplateId: "",
                    template: ""
                  })
                }
              />
              {isVenafi ? (
                <VenafiFields {...fieldsProps} />
              ) : (
                <TemplateField {...fieldsProps} isAzure={isAzure} />
              )}
              {(isVenafi || isAzure) && <ValidityField {...fieldsProps} />}
            </Stack>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button variant="primary" type="submit" form={formId} loading={update.isPending}>
            Save
          </Button>
          <Button variant="outline" disabled={update.isPending} onClick={onClose}>
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export const SigningConfigCard = ({
  ca,
  config
}: {
  ca: TInternalCertificateAuthority;
  config: TCaSigningConfig;
}) => {
  const { permission, projectId } = useCaScope();
  const [editing, setEditing] = useState(false);
  const destination = config.destinationConfig ?? {};
  const validity =
    typeof destination.validityPeriod === "number" ? `${destination.validityPeriod} days` : null;
  const items =
    config.type === CaSigningConfigType.VENAFI
      ? [
          ["Application ID", <code key="app">{text(destination.applicationId)}</code>] as const,
          [
            "Issuing template ID",
            <code key="tmpl">{text(destination.issuingTemplateId)}</code>
          ] as const,
          ...(validity ? [["Validity period", validity] as const] : [])
        ]
      : [
          ...(config.type === CaSigningConfigType.AZURE_ADCS ||
          config.type === CaSigningConfigType.ADCS
            ? [["Certificate template", text(destination.template)] as const]
            : []),
          ...(validity && config.type === CaSigningConfigType.AZURE_ADCS
            ? [["Validity period", validity] as const]
            : [])
        ];
  return (
    <Card
      variant="framed"
      title="Signing configuration"
      action={
        EDITABLE.has(config.type) && (
          <Button
            variant="ghost"
            size="icon"
            icon="pencil"
            iconOnly
            disabledReason={caBlock(
              permission,
              ProjectPermissionCertificateAuthorityActions.Edit,
              ca.name
            )}
            onClick={() => setEditing(true)}
          >
            Edit signing configuration
          </Button>
        )
      }
    >
      <DataList
        variant="props"
        density="compact"
        items={[
          [
            "Signing method",
            <Badge
              key="method"
              size="sm"
              tone={config.type === CaSigningConfigType.INTERNAL ? "info" : "outline"}
            >
              {SIGNING_LABELS[config.type] ?? config.type}
            </Badge>
          ],
          ...items
        ]}
      />
      {editing && (
        <EditSigningSheet
          caId={ca.id}
          projectId={projectId}
          config={config}
          open={editing}
          onClose={() => setEditing(false)}
        />
      )}
    </Card>
  );
};
