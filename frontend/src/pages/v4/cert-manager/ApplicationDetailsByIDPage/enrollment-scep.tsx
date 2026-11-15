import { useId, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { Field, FieldSet } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Grid, Stack } from "@infisical/cipher/ui/layout";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { Select } from "@infisical/cipher/ui/select";
import { SheetBody, SheetSections } from "@infisical/cipher/ui/sheet";
import { Snippet } from "@infisical/cipher/ui/snippet";
import { Switch } from "@infisical/cipher/ui/switch";
import { Meta, SmallText } from "@infisical/cipher/ui/text";

import { downloadFile } from "@app/helpers/download";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection, TCreateAppConnectionDTO } from "@app/hooks/api/appConnections/types";
import { isScepRaCaSigningSupported } from "@app/hooks/api/ca/capabilities";
import {
  ScepChallengeType,
  type TPkiApplicationEnrollmentState
} from "@app/hooks/api/pkiApplications/types";

import { errorMessage, failed, saved } from "../../access/toast";
import { connectionCreation } from "../../components/app-connection-form";
import { useV4Adapter } from "../../data/adapters";
import { CONNECTION_PRESETS } from "../../data/integrations/connection-presets";
import {
  countText,
  ENROLLMENT_DOCS,
  type EnrollmentPanelProps,
  parseCount,
  type ScepDraft,
  withDraft
} from "./enrollment-model";
import { EnrollmentFooter } from "./enrollment-shared";

const CHALLENGE_OPTIONS = [
  {
    value: ScepChallengeType.STATIC,
    label: "Static password",
    description: "All clients present the same shared challenge password."
  },
  {
    value: ScepChallengeType.DYNAMIC,
    label: "Dynamic (per client)",
    description: "Each client requests a fresh, one-time challenge before enrolling."
  },
  {
    value: ScepChallengeType.MICROSOFT_INTUNE,
    label: "Microsoft Intune",
    description: "Intune seals its own challenge into each device request and validates it."
  }
];

type ErrorKey =
  | "challengePassword"
  | "validationConnectionId"
  | "dynamicChallengeExpiryMinutes"
  | "dynamicChallengeMaxPending";
type Errors = Partial<Record<ErrorKey, string>>;

type Edit = (patch: Partial<ScepDraft>) => void;

type ScepConfig = NonNullable<TPkiApplicationEnrollmentState["scep"]>;

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

const ScepEndpoints = ({ scep, profileSlug }: { scep: ScepConfig; profileSlug: string }) => (
  <>
    <FieldSet legend="Endpoint">
      <Field
        label="SCEP endpoint URL"
        description="Point your MDM or SCEP client at this URL. For Windows devices, remove /pkiclient.exe from the end."
      >
        <Snippet
          label="SCEP endpoint URL"
          copyLabel="Copy SCEP endpoint URL"
          value={scep.scepEndpointUrl}
        />
      </Field>
      {scep.challengeType === ScepChallengeType.DYNAMIC && scep.challengeEndpointUrl && (
        <Field
          label="Challenge endpoint URL"
          description="Authenticated POST endpoint that mints a one-time challenge, such as the Jamf SCEPChallenge webhook."
        >
          <Snippet
            label="Challenge endpoint URL"
            copyLabel="Copy challenge endpoint URL"
            value={scep.challengeEndpointUrl}
          />
        </Field>
      )}
    </FieldSet>
    {scep.raCertificatePem && (
      <FieldSet
        legend="RA certificate"
        actions={
          <Button
            variant="outline"
            size="sm"
            icon="download"
            onClick={() =>
              downloadFile(
                scep.raCertificatePem,
                `${profileSlug}-ra-cert.pem`,
                "application/x-pem-file"
              )
            }
          >
            Download PEM
          </Button>
        }
      >
        <Stack gap={2}>
          <Meta mono>{profileSlug}-ra-cert.pem</Meta>
          <SmallText muted>
            {scep.raCertExpiresAt
              ? `Expires ${formatDate(scep.raCertExpiresAt)}`
              : "Expiry unknown"}
          </SmallText>
        </Stack>
      </FieldSet>
    )}
  </>
);

const IntuneConnectionField = ({
  projectId,
  canCreateConnection,
  value,
  error,
  onChange
}: {
  projectId: string;
  canCreateConnection: boolean;
  value: string;
  error?: string;
  onChange: (connectionId: string) => void;
}) => {
  const adapter = useV4Adapter("pkiApplications");
  const connections = adapter.useIntuneConnections(projectId);
  const createConnection = adapter.useCreateIntuneConnection();
  const noAccess = !connections.isPending && !connections.data?.length && !canCreateConnection;
  const creation = connectionCreation({
    preset: CONNECTION_PRESETS[AppConnection.MicrosoftIntune],
    disabledReason: canCreateConnection
      ? undefined
      : "Your role doesn't allow creating connections",
    create: async ({ method, name, description, credentials }) => {
      try {
        return await createConnection.mutateAsync({
          app: AppConnection.MicrosoftIntune,
          name,
          method: method as TAppConnection["method"],
          credentials: credentials as TAppConnection["credentials"],
          description: (description as string | undefined)?.trim() || null,
          projectId
        } as TCreateAppConnectionDTO);
      } catch (cause) {
        throw new Error(errorMessage(cause) || "The connection was not created. Try again.");
      }
    }
  });
  return (
    <Field
      label="Microsoft Intune connection"
      description={
        noAccess
          ? "You don't have access to any Microsoft Intune connections. Ask an admin to create one."
          : "Intune validates the subject and SANs of every device request."
      }
      help={
        <DocumentationLink href={ENROLLMENT_DOCS.intune} subject="Microsoft Intune connections" />
      }
      error={error}
    >
      <Combobox
        label="Microsoft Intune connection"
        placeholder="Select a connection"
        options={(connections.data ?? []).map((connection) => ({
          value: connection.id,
          label: connection.name,
          meta: connection.projectId ? undefined : "Organization"
        }))}
        value={value}
        loading={connections.isPending}
        invalid={Boolean(error)}
        creation={creation}
        onChange={onChange}
      />
    </Field>
  );
};

const ChallengeFields = ({
  value,
  errors,
  configured,
  projectId,
  canCreateConnection,
  onChallengeTypeChange,
  edit
}: {
  value: ScepDraft;
  errors: Errors;
  configured: boolean;
  projectId: string;
  canCreateConnection: boolean;
  onChallengeTypeChange: (challengeType: string) => void;
  edit: Edit;
}) => (
  <FieldSet legend="Challenge">
    <Field
      label="Challenge type"
      description={
        CHALLENGE_OPTIONS.find((option) => option.value === value.challengeType)?.description
      }
    >
      <Select
        label="Challenge type"
        value={value.challengeType}
        options={CHALLENGE_OPTIONS.map(({ value: option, label }) => ({ value: option, label }))}
        onChange={onChallengeTypeChange}
      />
    </Field>
    {value.challengeType === ScepChallengeType.MICROSOFT_INTUNE && (
      <IntuneConnectionField
        projectId={projectId}
        canCreateConnection={canCreateConnection}
        value={value.validationConnectionId}
        error={errors.validationConnectionId}
        onChange={(validationConnectionId) => edit({ validationConnectionId })}
      />
    )}
    {value.challengeType === ScepChallengeType.STATIC && (
      <Field
        label="Challenge password"
        description={
          configured
            ? "Enter the current password or a new one to save changes."
            : "Every SCEP client presents this shared password during enrollment."
        }
        error={errors.challengePassword}
      >
        <SecretInput
          value={value.challengePassword}
          invalid={Boolean(errors.challengePassword)}
          autoComplete="new-password"
          onChange={(challengePassword) => edit({ challengePassword })}
        />
      </Field>
    )}
    {value.challengeType === ScepChallengeType.DYNAMIC && (
      <Grid columns={2} gap={16}>
        <Field label="Challenge expiry (minutes)" error={errors.dynamicChallengeExpiryMinutes}>
          <Input
            inputMode="numeric"
            value={value.dynamicChallengeExpiryMinutes}
            invalid={Boolean(errors.dynamicChallengeExpiryMinutes)}
            onChange={(event) => edit({ dynamicChallengeExpiryMinutes: event.target.value })}
          />
        </Field>
        <Field label="Max pending challenges" error={errors.dynamicChallengeMaxPending}>
          <Input
            inputMode="numeric"
            value={value.dynamicChallengeMaxPending}
            invalid={Boolean(errors.dynamicChallengeMaxPending)}
            onChange={(event) => edit({ dynamicChallengeMaxPending: event.target.value })}
          />
        </Field>
      </Grid>
    )}
  </FieldSet>
);

const signRaReasonOf = (state: TPkiApplicationEnrollmentState) => {
  if (!isScepRaCaSigningSupported(state.caType))
    return `Not supported for ${state.caType} certificate authorities`;
  if (state.scepConfigured)
    return "Fixed once SCEP is set up. Disable SCEP and set it up again to change it.";
  return undefined;
};

const AdvancedOptions = ({
  value,
  state,
  edit
}: {
  value: ScepDraft;
  state: TPkiApplicationEnrollmentState;
  edit: Edit;
}) => (
  <FieldSet legend="Advanced options">
    <Switch
      layout="row"
      label="Sign RA certificate with the CA"
      description="Issue the RA certificate from this profile's CA so strict clients such as Apple devices and Microsoft Intune can chain it to a CA they trust."
      checked={isScepRaCaSigningSupported(state.caType) && value.signRaWithCa}
      disabledReason={signRaReasonOf(state)}
      onCheckedChange={(signRaWithCa) => edit({ signRaWithCa })}
    />
    <Switch
      layout="row"
      label="Include CA certificate in response"
      description="Return the issuing CA certificate alongside the issued certificate."
      checked={value.includeCaCertInResponse}
      onCheckedChange={(includeCaCertInResponse) => edit({ includeCaCertInResponse })}
    />
    {value.challengeType !== ScepChallengeType.MICROSOFT_INTUNE && (
      <Switch
        layout="row"
        label="Allow certificate-based renewal"
        description="Let clients renew with their existing certificate as authentication."
        checked={value.allowCertBasedRenewal}
        onCheckedChange={(allowCertBasedRenewal) => edit({ allowCertBasedRenewal })}
      />
    )}
  </FieldSet>
);

const validate = (value: ScepDraft): Errors => {
  const isDynamic = value.challengeType === ScepChallengeType.DYNAMIC;
  return {
    validationConnectionId:
      value.challengeType === ScepChallengeType.MICROSOFT_INTUNE && !value.validationConnectionId
        ? "Select a Microsoft Intune connection"
        : undefined,
    challengePassword:
      value.challengeType === ScepChallengeType.STATIC && !value.challengePassword
        ? "Enter a challenge password"
        : undefined,
    dynamicChallengeExpiryMinutes:
      isDynamic && Number.isNaN(parseCount(value.dynamicChallengeExpiryMinutes))
        ? "Enter a whole number of minutes"
        : undefined,
    dynamicChallengeMaxPending:
      isDynamic && Number.isNaN(parseCount(value.dynamicChallengeMaxPending))
        ? "Enter a whole number"
        : undefined
  };
};

const toPayload = (value: ScepDraft, signRaWithCa: boolean) => {
  const challengeType = value.challengeType as ScepChallengeType;
  if (challengeType === ScepChallengeType.MICROSOFT_INTUNE)
    return {
      challengeType,
      includeCaCertInResponse: value.includeCaCertInResponse,
      allowCertBasedRenewal: false,
      signRaWithCa,
      validationConnectionId: value.validationConnectionId
    };
  return {
    challengeType,
    challengePassword: value.challengePassword || undefined,
    includeCaCertInResponse: value.includeCaCertInResponse,
    allowCertBasedRenewal: value.allowCertBasedRenewal,
    dynamicChallengeExpiryMinutes: parseCount(value.dynamicChallengeExpiryMinutes) ?? undefined,
    dynamicChallengeMaxPending: parseCount(value.dynamicChallengeMaxPending) ?? undefined,
    signRaWithCa
  };
};

const initialOf = ({ scep }: TPkiApplicationEnrollmentState): ScepDraft => ({
  challengeType: scep?.challengeType ?? ScepChallengeType.STATIC,
  challengePassword: "",
  includeCaCertInResponse: scep?.includeCaCertInResponse ?? true,
  allowCertBasedRenewal: scep?.allowCertBasedRenewal ?? true,
  dynamicChallengeExpiryMinutes: countText(scep?.dynamicChallengeExpiryMinutes ?? 60),
  dynamicChallengeMaxPending: countText(scep?.dynamicChallengeMaxPending ?? 100),
  validationConnectionId: scep?.validationConnectionId ?? "",
  signRaWithCa: scep?.signRaWithCa ?? false
});

export const ScepEnrollmentPanel = ({
  applicationId,
  profileId,
  profileSlug,
  projectId,
  state,
  header,
  draft,
  onDraft,
  onSaved,
  onCancel,
  busy,
  run,
  canCreateConnection
}: EnrollmentPanelProps<"scep"> & { canCreateConnection: boolean }) => {
  const adapter = useV4Adapter("pkiApplications");
  const set = adapter.useSetScepEnrollment();
  const clear = adapter.useClearScepEnrollment();
  const formId = useId();
  const [errors, setErrors] = useState<Errors>({});
  const configured = state.scepConfigured;
  const raSigningSupported = isScepRaCaSigningSupported(state.caType);
  const { value, change } = withDraft<ScepDraft>(initialOf(state), draft, onDraft);

  const edit: Edit = (patch) => {
    setErrors((current) => {
      const next = { ...current };
      (Object.keys(patch) as ErrorKey[]).forEach((key) => delete next[key]);
      return next;
    });
    change(patch);
  };

  const submit = async () => {
    const next = validate(value);
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    try {
      await run(() =>
        set.mutateAsync({
          applicationId,
          profileId,
          ...toPayload(value, raSigningSupported && value.signRaWithCa)
        })
      );
      saved(configured ? "SCEP enrollment saved" : "SCEP enrollment enabled");
      onSaved();
    } catch (error) {
      failed(
        configured ? "Couldn't save SCEP enrollment" : "Couldn't enable SCEP enrollment",
        error
      );
    }
  };

  return (
    <SheetSections
      header={header}
      footer={
        <EnrollmentFooter
          method="scep"
          configured={configured}
          formId={formId}
          dirty={Boolean(draft)}
          pending={busy}
          busy={busy}
          onCancel={onCancel}
          applicationId={applicationId}
          profileId={profileId}
          clear={clear}
        />
      }
    >
      <SheetBody>
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={24}>
            {configured && state.scep && (
              <ScepEndpoints scep={state.scep} profileSlug={profileSlug} />
            )}
            <ChallengeFields
              value={value}
              errors={errors}
              configured={configured}
              projectId={projectId}
              canCreateConnection={canCreateConnection}
              edit={edit}
              onChallengeTypeChange={(challengeType) =>
                edit({
                  challengeType,
                  ...(challengeType === ScepChallengeType.MICROSOFT_INTUNE &&
                    !configured &&
                    raSigningSupported && { signRaWithCa: true })
                })
              }
            />
            <AdvancedOptions value={value} state={state} edit={edit} />
          </Stack>
        </form>
      </SheetBody>
    </SheetSections>
  );
};
