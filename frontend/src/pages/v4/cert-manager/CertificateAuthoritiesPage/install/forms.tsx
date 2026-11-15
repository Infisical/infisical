import { type FormEvent, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Snippet } from "@infisical/cipher/ui/snippet";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { format } from "date-fns";

import { downloadTxtFile } from "@app/helpers/download";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { caTypeToNameMap } from "@app/hooks/api/ca/constants";
import { CaSigningConfigType, CaStatus, CaType } from "@app/hooks/api/ca/enums";

import { errorMessage, failed, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { useConnectionCreation } from "../../../secret-manager/OverviewPage/secrets/flows/connection-creation";

const PATH_LENGTH_OPTIONS = [-1, 0, 1, 2, 3];

export type InstallFormProps = {
  caId: string;
  projectId: string;
  formId: string;
  onPendingChange: (pending: boolean) => void;
  onDone: () => void;
};

const pathOptions = (values: number[]) =>
  values.map((value) => ({ value: String(value), label: String(value) }));

export const useLockedPathLength = (caId: string) => {
  const { data: ca } = useV4Adapter("certificateAuthorities").useCa({
    caId,
    type: CaType.INTERNAL
  });
  const stored = ca?.type === CaType.INTERNAL ? ca.configuration.maxPathLength : undefined;
  return typeof stored === "number" && stored >= 0 ? stored : undefined;
};

const PathLengthField = ({
  value,
  onChange,
  locked,
  error,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  locked?: number;
  error?: string;
  placeholder?: string;
}) => (
  <Field
    label="Path length"
    description={
      locked !== undefined
        ? "Matches this CA's current certificate and can't be changed."
        : "How many intermediate CAs may follow this CA in the chain. -1 means no limit."
    }
    error={error}
  >
    <Select
      aria-label="Path length"
      value={value}
      placeholder={placeholder}
      invalid={Boolean(error)}
      disabled={locked !== undefined}
      options={pathOptions(locked !== undefined ? [locked] : PATH_LENGTH_OPTIONS)}
      onValueChange={(next) => next && onChange(next)}
    />
  </Field>
);

const submitWith =
  (run: () => Promise<boolean>, onPendingChange: (pending: boolean) => void) =>
  async (event: FormEvent) => {
    event.preventDefault();
    onPendingChange(true);
    await run().finally(() => onPendingChange(false));
  };

const isValidDate = (value: string) => Boolean(value) && !Number.isNaN(new Date(value).getTime());

const middleDate = (end: string) =>
  format(new Date((Date.now() + new Date(end).getTime()) / 2), "yyyy-MM-dd");

export const InternalInstallForm = ({
  caId,
  projectId,
  formId,
  onPendingChange,
  onDone
}: InstallFormProps) => {
  const adapter = useV4Adapter("certificateAuthorities");
  const { data: cas = [], isPending } = adapter.useProjectCas({
    projectId,
    status: CaStatus.ACTIVE
  });
  const generate = adapter.useGenerateCaCertificate();
  const parents = cas.filter(
    (entry) => entry.id !== caId && entry.status === CaStatus.ACTIVE && entry.maxPathLength
  );
  const [parentCaId, setParentCaId] = useState("");
  const parent = parents.find((entry) => entry.id === parentCaId) ?? parents[0];
  const parentMax = parent?.maxPathLength ?? 0;
  const [notAfter, setNotAfter] = useState<string>();
  const [maxPathLength, setMaxPathLength] = useState<string>();
  const [errors, setErrors] = useState<{ parent?: string; notAfter?: string }>({});
  const validUntil = notAfter ?? (parent?.notAfter ? middleDate(parent.notAfter) : "");
  const pathLength = maxPathLength ?? String(parentMax === -1 ? 3 : Math.max(parentMax - 1, 0));
  const pathChoices =
    parentMax === -1 ? PATH_LENGTH_OPTIONS : Array.from({ length: parentMax }, (_, index) => index);

  return (
    <form
      id={formId}
      noValidate
      onSubmit={submitWith(async () => {
        const next = {
          parent: parent ? undefined : "Select a parent CA",
          notAfter: isValidDate(validUntil) ? undefined : "Enter a valid date"
        };
        setErrors(next);
        if (next.parent || next.notAfter || !parent) return false;
        try {
          await generate.mutateAsync({
            caId,
            parentCaId: parent.id,
            maxPathLength: Number(pathLength),
            notAfter: validUntil,
            notBefore: new Date().toISOString()
          });
        } catch (error) {
          failed("Failed to install the CA certificate", error);
          return false;
        }
        saved("Certificate installed for the intermediate CA");
        onDone();
        return true;
      }, onPendingChange)}
    >
      <Stack gap={16}>
        <Field label="Parent CA" error={errors.parent}>
          {isPending ? (
            <Skeleton height={32} />
          ) : (
            <Select
              aria-label="Parent CA"
              placeholder="Select a parent CA"
              value={parent?.id ?? ""}
              invalid={Boolean(errors.parent)}
              options={parents.map((entry) => ({
                value: entry.id,
                label: entry.friendlyName || entry.commonName || entry.id,
                description: `${caTypeToNameMap[entry.type]}: ${entry.dn}`
              }))}
              onValueChange={(next) => {
                setParentCaId(next);
                setNotAfter(undefined);
                setMaxPathLength(undefined);
              }}
            />
          )}
        </Field>
        <Field label="Valid until" error={errors.notAfter}>
          <Input
            type="date"
            value={validUntil}
            invalid={Boolean(errors.notAfter)}
            onChange={(event) => setNotAfter(event.target.value)}
          />
        </Field>
        <Field label="Path length">
          <Select
            aria-label="Path length"
            value={pathLength}
            options={pathOptions(pathChoices)}
            onValueChange={setMaxPathLength}
          />
        </Field>
      </Stack>
    </form>
  );
};

export const ManualInstallForm = ({ caId, formId, onPendingChange, onDone }: InstallFormProps) => {
  const adapter = useV4Adapter("certificateAuthorities");
  const locked = useLockedPathLength(caId);
  const [chosenPathLength, setChosenPathLength] = useState("");
  const maxPathLength = locked !== undefined ? String(locked) : chosenPathLength;
  const [certificate, setCertificate] = useState("");
  const [certificateChain, setCertificateChain] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const {
    data: csr,
    isPending: csrPending,
    error: csrError
  } = adapter.useCaCsr(caId, locked !== undefined ? undefined : Number(maxPathLength), {
    enabled: maxPathLength !== ""
  });
  const importCertificate = adapter.useImportCaCertificate();

  return (
    <form
      id={formId}
      noValidate
      onSubmit={submitWith(async () => {
        const next = {
          maxPathLength: maxPathLength ? undefined : "Select a path length",
          certificate: certificate.trim() ? undefined : "Paste the signed certificate",
          certificateChain: certificateChain.trim() ? undefined : "Paste the certificate chain"
        };
        setErrors(next);
        if (Object.values(next).some(Boolean) || !csr) return false;
        try {
          await importCertificate.mutateAsync({ caId, certificate, certificateChain });
        } catch (error) {
          failed("Failed to install the CA certificate", error);
          return false;
        }
        saved("Certificate installed for the CA");
        onDone();
        return true;
      }, onPendingChange)}
    >
      <Stack gap={16}>
        <PathLengthField
          value={maxPathLength}
          onChange={setChosenPathLength}
          locked={locked}
          error={errors.maxPathLength}
          placeholder="Select a path length"
        />
        {maxPathLength !== "" && (
          <Field
            label="Certificate signing request"
            description="Sign it with your own CA, then paste the result below."
            wide
            help={
              <Button
                variant="ghost"
                size="icon"
                icon="download"
                iconOnly
                disabledReason={csr ? undefined : "The CSR is still being generated"}
                onClick={() => csr && downloadTxtFile("csr.pem", csr)}
              >
                Download CSR
              </Button>
            }
          >
            {csr && (
              <Snippet label="Certificate signing request" value={csr} maxLines={6} size="sm" />
            )}
            {!csr && csrPending && <Skeleton height={96} />}
            {!csr && !csrPending && csrError ? (
              <Alert tone="bad">
                {errorMessage(csrError) ?? "The CSR could not be generated."}
              </Alert>
            ) : null}
          </Field>
        )}
        <Field label="Certificate body" error={errors.certificate} wide>
          <Textarea
            mono
            rows={6}
            value={certificate}
            placeholder="PEM-encoded certificate"
            aria-invalid={Boolean(errors.certificate) || undefined}
            onChange={(event) => setCertificate(event.target.value)}
          />
        </Field>
        <Field label="Certificate chain" error={errors.certificateChain} wide>
          <Textarea
            mono
            rows={6}
            value={certificateChain}
            placeholder="PEM-encoded certificate chain"
            aria-invalid={Boolean(errors.certificateChain) || undefined}
            onChange={(event) => setCertificateChain(event.target.value)}
          />
        </Field>
      </Stack>
    </form>
  );
};

export const ConnectionField = ({
  app,
  projectId,
  label,
  value,
  error,
  description,
  disabled,
  onChange
}: {
  app: AppConnection;
  projectId: string;
  label: string;
  value: string;
  error?: string;
  description?: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}) => {
  const { data: connections = [], isPending } = useV4Adapter(
    "certificateAuthorities"
  ).useAvailableConnections(app, projectId);
  const creation = useConnectionCreation(app, projectId, (connection) => onChange(connection.id));
  return (
    <Field label={label} description={description} error={error}>
      <Combobox
        label={label}
        value={value}
        disabled={disabled}
        loading={isPending}
        invalid={Boolean(error)}
        placeholder="Select a connection"
        emptyText="No connections yet."
        options={connections.map((connection) => ({
          value: connection.id,
          label: connection.name
        }))}
        creation={creation}
        onValueChange={onChange}
      />
    </Field>
  );
};

const validityError = (value: string) =>
  value && (!Number.isInteger(Number(value)) || Number(value) < 1)
    ? "Must be at least 1 day"
    : undefined;

const useAutomatedInstall = (
  caId: string,
  type: CaSigningConfigType,
  install: (dto: { caId: string; maxPathLength?: number }) => Promise<unknown>,
  provider: string
) => {
  const adapter = useV4Adapter("certificateAuthorities");
  const { data: existing } = adapter.useCaSigningConfig(caId, { enabled: Boolean(caId) });
  const create = adapter.useCreateCaSigningConfig();
  const update = adapter.useUpdateCaSigningConfig();
  return async (
    appConnectionId: string,
    destinationConfig: Record<string, unknown>,
    maxPathLength: string
  ) => {
    try {
      if (existing?.type === type)
        await update.mutateAsync({ caId, appConnectionId, destinationConfig });
      else await create.mutateAsync({ caId, type, appConnectionId, destinationConfig });
      await install({ caId, maxPathLength: Number(maxPathLength) });
    } catch (error) {
      failed(`Failed to install the certificate via ${provider}`, error);
      return false;
    }
    saved("Certificate installation queued");
    return true;
  };
};

const usePathLength = (caId: string) => {
  const locked = useLockedPathLength(caId);
  const [chosen, setChosen] = useState("-1");
  return { locked, value: locked !== undefined ? String(locked) : chosen, setValue: setChosen };
};

export const VenafiInstallForm = ({
  caId,
  projectId,
  formId,
  onPendingChange,
  onDone
}: InstallFormProps) => {
  const adapter = useV4Adapter("certificateAuthorities");
  const install = adapter.useInstallCaCertificateVenafi();
  const run = useAutomatedInstall(caId, CaSigningConfigType.VENAFI, install.mutateAsync, "Venafi");
  const [appConnectionId, setAppConnectionId] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [issuingTemplateId, setIssuingTemplateId] = useState("");
  const [validityPeriod, setValidityPeriod] = useState("");
  const path = usePathLength(caId);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const { data: applications = [], isPending: applicationsPending } = adapter.useVenafiApplications(
    appConnectionId,
    { enabled: Boolean(appConnectionId) }
  );
  const { data: templates = [], isPending: templatesPending } = adapter.useVenafiIssuingTemplates(
    appConnectionId,
    applicationId,
    { enabled: Boolean(appConnectionId && applicationId) }
  );

  return (
    <form
      id={formId}
      noValidate
      onSubmit={submitWith(async () => {
        const next = {
          appConnectionId: appConnectionId ? undefined : "Select a Venafi connection",
          applicationId: applicationId ? undefined : "Select an application",
          issuingTemplateId: issuingTemplateId ? undefined : "Select an issuing template",
          validityPeriod: validityError(validityPeriod)
        };
        setErrors(next);
        if (Object.values(next).some(Boolean)) return false;
        const ok = await run(
          appConnectionId,
          {
            applicationId,
            issuingTemplateId,
            ...(validityPeriod && { validityPeriod: Number(validityPeriod) })
          },
          path.value
        );
        if (ok) onDone();
        return ok;
      }, onPendingChange)}
    >
      <Stack gap={16}>
        <ConnectionField
          app={AppConnection.Venafi}
          projectId={projectId}
          label="Venafi connection"
          value={appConnectionId}
          error={errors.appConnectionId}
          onChange={(id) => {
            setAppConnectionId(id);
            setApplicationId("");
            setIssuingTemplateId("");
          }}
        />
        <Field label="Application" error={errors.applicationId}>
          <Combobox
            label="Application"
            value={applicationId}
            disabled={!appConnectionId}
            loading={Boolean(appConnectionId) && applicationsPending}
            invalid={Boolean(errors.applicationId)}
            placeholder={appConnectionId ? "Select an application" : "Select a connection first"}
            options={applications.map((entry) => ({ value: entry.id, label: entry.name }))}
            onValueChange={(next) => {
              setApplicationId(next);
              setIssuingTemplateId("");
            }}
          />
        </Field>
        <Field label="Issuing template" error={errors.issuingTemplateId}>
          <Combobox
            label="Issuing template"
            value={issuingTemplateId}
            disabled={!applicationId}
            loading={Boolean(applicationId) && templatesPending}
            invalid={Boolean(errors.issuingTemplateId)}
            placeholder={
              applicationId ? "Select an issuing template" : "Select an application first"
            }
            options={templates.map((entry) => ({ value: entry.id, label: entry.name }))}
            onValueChange={setIssuingTemplateId}
          />
        </Field>
        <Field
          label="Validity period (days)"
          optional
          description="How many days the certificate is valid."
          error={errors.validityPeriod}
        >
          <Input
            type="number"
            min={1}
            value={validityPeriod}
            placeholder="365"
            invalid={Boolean(errors.validityPeriod)}
            onChange={(event) => setValidityPeriod(event.target.value)}
          />
        </Field>
        <PathLengthField value={path.value} onChange={path.setValue} locked={path.locked} />
      </Stack>
    </form>
  );
};

export const AzureAdcsInstallForm = ({
  caId,
  projectId,
  formId,
  onPendingChange,
  onDone
}: InstallFormProps) => {
  const adapter = useV4Adapter("certificateAuthorities");
  const install = adapter.useInstallCaCertificateAdcs();
  const run = useAutomatedInstall(
    caId,
    CaSigningConfigType.AZURE_ADCS,
    install.mutateAsync,
    "Azure AD CS"
  );
  const [appConnectionId, setAppConnectionId] = useState("");
  const [template, setTemplate] = useState("");
  const [validityPeriod, setValidityPeriod] = useState("");
  const path = usePathLength(caId);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const { data: templates = [], isPending: templatesPending } = adapter.useAzureAdcsTemplates(
    appConnectionId,
    { enabled: Boolean(appConnectionId) }
  );

  return (
    <form
      id={formId}
      noValidate
      onSubmit={submitWith(async () => {
        const next = {
          appConnectionId: appConnectionId ? undefined : "Select an Azure AD CS connection",
          template: template ? undefined : "Select a certificate template",
          validityPeriod: validityError(validityPeriod)
        };
        setErrors(next);
        if (Object.values(next).some(Boolean)) return false;
        const ok = await run(
          appConnectionId,
          { template, ...(validityPeriod && { validityPeriod: Number(validityPeriod) }) },
          path.value
        );
        if (ok) onDone();
        return ok;
      }, onPendingChange)}
    >
      <Stack gap={16}>
        <ConnectionField
          app={AppConnection.AzureADCS}
          projectId={projectId}
          label="Azure AD CS connection"
          value={appConnectionId}
          error={errors.appConnectionId}
          onChange={(id) => {
            setAppConnectionId(id);
            setTemplate("");
          }}
        />
        <Field label="Certificate template" error={errors.template}>
          <Combobox
            label="Certificate template"
            value={template}
            disabled={!appConnectionId}
            loading={Boolean(appConnectionId) && templatesPending}
            invalid={Boolean(errors.template)}
            placeholder={appConnectionId ? "Select a template" : "Select a connection first"}
            options={templates.map((entry) => ({ value: entry, label: entry }))}
            onValueChange={setTemplate}
          />
        </Field>
        <Field
          label="Validity period (days)"
          optional
          description="How many days the certificate is valid."
          error={errors.validityPeriod}
        >
          <Input
            type="number"
            min={1}
            value={validityPeriod}
            placeholder="365"
            invalid={Boolean(errors.validityPeriod)}
            onChange={(event) => setValidityPeriod(event.target.value)}
          />
        </Field>
        <PathLengthField value={path.value} onChange={path.setValue} locked={path.locked} />
      </Stack>
    </form>
  );
};

export const AdcsNativeInstallForm = ({
  caId,
  projectId,
  formId,
  onPendingChange,
  onDone
}: InstallFormProps) => {
  const adapter = useV4Adapter("certificateAuthorities");
  const install = adapter.useInstallCaCertificateAdcsNative();
  const run = useAutomatedInstall(caId, CaSigningConfigType.ADCS, install.mutateAsync, "ADCS");
  const [appConnectionId, setAppConnectionId] = useState("");
  const [template, setTemplate] = useState("");
  const path = usePathLength(caId);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const { data: templates = [], isPending: templatesPending } = adapter.useAdcsTemplates(
    appConnectionId,
    { enabled: Boolean(appConnectionId) }
  );
  const loadingTemplates = Boolean(appConnectionId) && templatesPending;

  return (
    <form
      id={formId}
      noValidate
      onSubmit={submitWith(async () => {
        const next = {
          appConnectionId: appConnectionId ? undefined : "Select a Microsoft ADCS connection",
          template: template.trim() ? undefined : "Enter a certificate template"
        };
        setErrors(next);
        if (Object.values(next).some(Boolean)) return false;
        const ok = await run(appConnectionId, { template: template.trim() }, path.value);
        if (ok) onDone();
        return ok;
      }, onPendingChange)}
    >
      <Stack gap={16}>
        <ConnectionField
          app={AppConnection.ADCS}
          projectId={projectId}
          label="Microsoft ADCS connection"
          value={appConnectionId}
          error={errors.appConnectionId}
          onChange={(id) => {
            setAppConnectionId(id);
            setTemplate("");
          }}
        />
        {templates.length > 0 || loadingTemplates ? (
          <Field label="Certificate template" error={errors.template}>
            <Combobox
              label="Certificate template"
              value={template}
              disabled={loadingTemplates}
              loading={loadingTemplates}
              invalid={Boolean(errors.template)}
              placeholder={loadingTemplates ? "Loading templates" : "Select a template"}
              options={templates.map((entry) => ({ value: entry.name, label: entry.name }))}
              onValueChange={setTemplate}
            />
          </Field>
        ) : (
          <Field
            label="Certificate template"
            description="The subordinate CA template name, for example SubCA."
            error={errors.template}
          >
            <Input
              value={template}
              placeholder="SubCA"
              invalid={Boolean(errors.template)}
              onChange={(event) => setTemplate(event.target.value)}
            />
          </Field>
        )}
        <PathLengthField value={path.value} onChange={path.setValue} locked={path.locked} />
      </Stack>
    </form>
  );
};
