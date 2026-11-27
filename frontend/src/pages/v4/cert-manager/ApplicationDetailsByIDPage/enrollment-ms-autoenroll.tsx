import { useId, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Code } from "@infisical/cipher/ui/code";
import { CodeBlock } from "@infisical/cipher/ui/code-block";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { Field, FieldSet } from "@infisical/cipher/ui/field";
import { FileInput } from "@infisical/cipher/ui/file-input";
import { Input } from "@infisical/cipher/ui/input";
import { Item } from "@infisical/cipher/ui/item";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { SheetSections } from "@infisical/cipher/ui/sheet";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Snippet } from "@infisical/cipher/ui/snippet";
import { Switch } from "@infisical/cipher/ui/switch";
import { StatusText, Text } from "@infisical/cipher/ui/text";

import { isInfisicalCloud } from "@app/helpers/platform";
import { bytesToBase64 } from "@app/helpers/string";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection, TCreateAppConnectionDTO } from "@app/hooks/api/appConnections/types";
import {
  MicrosoftAutoenrollmentChannelBindingStatus,
  type TMicrosoftAutoenrollmentEnrollment,
  type TMicrosoftAutoenrollmentGroup,
  type TMicrosoftAutoenrollmentOtherProfile,
  type TPkiApplicationEnrollmentState
} from "@app/hooks/api/pkiApplications/types";

import { useDebounced } from "../../access/org/use-debounced";
import { errorMessage, failed, saved } from "../../access/toast";
import { connectionCreation } from "../../components/app-connection-form";
import { ConnectionCombobox } from "../../components/connection-combobox";
import { useV4Adapter } from "../../data/adapters";
import { CONNECTION_PRESETS } from "../../data/integrations/connection-presets";
import { useRotationConfirmation } from "../../integrations/app-connection-extras";
import {
  countText,
  ENROLLMENT_DOCS,
  type EnrollmentPanelProps,
  type MicrosoftAutoenrollmentDraft,
  parseCount,
  withDraft
} from "./enrollment-model";
import { EnrollmentBody, EnrollmentFooter } from "./enrollment-shared";

const DEFAULT_RENEW_BEFORE_DAYS = 42;
const MAX_RENEW_BEFORE_DAYS = 3650;
const MAX_ALLOWED_GROUPS = 50;
const MAX_GROUP_SEARCH_LENGTH = 64;
const MAX_GROUP_RESULTS = 50;
const MAX_KEYTAB_BYTES = 64 * 1024;
const KEYTAB_FILE_NAME = "infisical.keytab";
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;
const MIN_WINDOWS_RENEWAL_PERIOD_SECONDS = 8 * SECONDS_PER_HOUR;

type Draft = MicrosoftAutoenrollmentDraft;
type ErrorKey = "keytabFile" | "connectionId" | "allowedGroups" | "renewBeforeDays";
type Errors = Partial<Record<ErrorKey, string>>;
type Edit = (patch: Partial<Draft>) => void;

const formatRenewalPeriod = (seconds: number) => {
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const parts = [
    days ? `${days} ${days === 1 ? "day" : "days"}` : null,
    hours ? `${hours} ${hours === 1 ? "hour" : "hours"}` : null
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : "less than an hour";
};

const renewalNoteOf = (initial: TMicrosoftAutoenrollmentEnrollment | null) => {
  const seconds = initial?.effectiveRenewBeforeSeconds;
  if (seconds == null || !initial) return "";
  if (seconds <= MIN_WINDOWS_RENEWAL_PERIOD_SECONDS)
    return " Windows never renews certificates this short-lived, so computers request a new one instead.";
  if (seconds === initial.renewBeforeDays * SECONDS_PER_DAY) return "";
  return ` For this profile, Windows renews ${formatRenewalPeriod(seconds)} before expiry.`;
};

const hostOf = (servicePrincipalName: string) => servicePrincipalName.split("@")[0].toLowerCase();

const reuseCandidateOf = (
  otherProfiles: TMicrosoftAutoenrollmentOtherProfile[],
  initial: TMicrosoftAutoenrollmentEnrollment | null,
  instancePrincipal: string | undefined
) => {
  if (!instancePrincipal) return undefined;
  const current = initial?.servicePrincipalName.toLowerCase();
  return otherProfiles
    .filter(
      (profile) =>
        hostOf(profile.servicePrincipalName) === instancePrincipal &&
        (!initial ||
          profile.servicePrincipalName.toLowerCase() !== current ||
          profile.keyVersion > initial.keyVersion)
    )
    .reduce<TMicrosoftAutoenrollmentOtherProfile | undefined>((best, profile) => {
      if (!best) return profile;
      const isSame = profile.servicePrincipalName.toLowerCase() === current;
      const isBestSame = best.servicePrincipalName.toLowerCase() === current;
      if (isSame !== isBestSame) return isSame ? profile : best;
      return profile.keyVersion > best.keyVersion ? profile : best;
    }, undefined);
};

const KeytabRow = ({ details, actions }: { details: string; actions?: React.ReactNode }) => (
  <Item
    variant="outline"
    icon="file-key"
    mono
    title={KEYTAB_FILE_NAME}
    description={details}
    actions={actions}
  />
);

const LdapConnectionField = ({
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
  const connections = adapter.useLdapConnections(projectId);
  const createConnection = adapter.useCreateLdapConnection();
  const rotation = useRotationConfirmation();
  const creation = connectionCreation({
    preset: CONNECTION_PRESETS[AppConnection.LDAP],
    disabledReason: canCreateConnection
      ? undefined
      : "Your role doesn't allow creating connections",
    create: async ({
      method,
      name,
      description,
      credentials,
      isAutoRotationEnabled,
      rotation: schedule
    }) => {
      if (isAutoRotationEnabled && !(await rotation.confirm()))
        throw new Error("Automatic rotation wasn't turned on, so the connection was not created.");
      try {
        return await createConnection.mutateAsync({
          app: AppConnection.LDAP,
          name,
          method: method as TAppConnection["method"],
          credentials: credentials as TAppConnection["credentials"],
          description: (description as string | undefined)?.trim() || null,
          isAutoRotationEnabled: Boolean(isAutoRotationEnabled),
          rotation: schedule,
          projectId
        } as TCreateAppConnectionDTO);
      } catch (cause) {
        throw new Error(errorMessage(cause) || "The connection was not created. Try again.");
      }
    }
  });
  return (
    <Field
      label="LDAP connection"
      name="connectionId"
      description="Needs an LDAP connection that uses the Active Directory provider. Looks up each computer's DNS name in the domain."
      error={error}
    >
      <ConnectionCombobox
        label="LDAP connection"
        placeholder="Select an LDAP connection"
        connections={connections.data ?? []}
        app={AppConnection.LDAP}
        value={value}
        loading={connections.isPending}
        invalid={Boolean(error)}
        creation={creation}
        onChange={onChange}
      />
      {rotation.dialog}
    </Field>
  );
};

const AllowedGroupsField = ({
  connectionId,
  value,
  error,
  onChange
}: {
  connectionId: string;
  value: TMicrosoftAutoenrollmentGroup[];
  error?: string;
  onChange: (groups: TMicrosoftAutoenrollmentGroup[]) => void;
}) => {
  const adapter = useV4Adapter("pkiApplications");
  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim().slice(0, MAX_GROUP_SEARCH_LENGTH));
  const groups = adapter.useLdapGroups(connectionId || undefined, query || undefined);
  const known = [...value, ...(groups.data?.groups ?? [])].filter(
    (group, index, all) => all.findIndex((entry) => entry.sid === group.sid) === index
  );
  const searchError =
    connectionId && groups.error
      ? errorMessage(groups.error) || "Could not search Active Directory."
      : undefined;
  const shownError = error ?? searchError;
  return (
    <Field
      label="AD groups"
      name="allowedGroups"
      optional
      description="Only computers in one of these groups can enroll. Leave empty to allow every computer in the domain."
      error={shownError}
    >
      <MultiSelect
        label="AD groups"
        placeholder="Search groups by name"
        searchPlaceholder="Search groups by name"
        emptyText={connectionId ? "No groups found" : "Select an LDAP connection first"}
        noMatchText={connectionId ? "No matching groups" : "Select an LDAP connection first"}
        footer={
          groups.data?.isTruncated
            ? `Showing the first ${MAX_GROUP_RESULTS} groups. Type to narrow the search.`
            : undefined
        }
        invalid={Boolean(shownError)}
        options={known.map((group) => ({
          value: group.sid,
          label: group.name,
          description: group.sid
        }))}
        value={value.map((group) => group.sid)}
        loading={groups.isFetching}
        onSearch={setSearch}
        onChange={(sids) =>
          onChange(sids.flatMap((sid) => known.find((group) => group.sid === sid) ?? []))
        }
      />
    </Field>
  );
};

const KeytabSection = ({
  value,
  error,
  initial,
  instancePrincipalName,
  principalError,
  reuseCandidate,
  edit
}: {
  value: Draft;
  error?: string;
  initial: TMicrosoftAutoenrollmentEnrollment | null;
  instancePrincipalName?: string;
  principalError: unknown;
  reuseCandidate?: TMicrosoftAutoenrollmentOtherProfile;
  edit: Edit;
}) => {
  const { reuseFrom, replacingKeytab } = value;
  const uploadShown = !reuseFrom && (!initial || replacingKeytab);
  const otherHost =
    Boolean(initial && instancePrincipalName) &&
    !replacingKeytab &&
    !reuseFrom &&
    hostOf(initial?.servicePrincipalName ?? "") !== instancePrincipalName?.toLowerCase();

  let details: string | undefined;
  if (reuseFrom)
    details = `${reuseFrom.servicePrincipalName}, key version ${reuseFrom.keyVersion}, same as ${reuseFrom.profileName}`;
  else if (initial && !replacingKeytab)
    details = `${initial.servicePrincipalName}, key version ${initial.keyVersion}`;

  const replace = () =>
    edit({
      reuseFrom: null,
      replacingKeytab: true,
      ...(reuseFrom &&
        value.connectionId === reuseFrom.connectionId && {
          connectionId: value.connectionBeforeReuse
        })
    });

  let actions: React.ReactNode;
  if (details)
    actions = (
      <Button variant="outline" size="sm" onClick={replace}>
        Replace
      </Button>
    );
  else if (initial && replacingKeytab)
    actions = (
      <Button
        variant="outline"
        size="sm"
        onClick={() => edit({ keytabFile: null, replacingKeytab: false })}
      >
        Keep current keytab
      </Button>
    );

  let ktpass: React.ReactNode = <Skeleton height={80} />;
  if (instancePrincipalName)
    ktpass = (
      <CodeBlock
        label="Command prompt"
        wrap
        code={`ktpass -princ ${instancePrincipalName}@<REALM> -mapuser <DOMAIN>\\<service-account> -crypto AES256-SHA1 -ptype KRB5_NT_PRINCIPAL -pass * -out ${KEYTAB_FILE_NAME}`}
      />
    );
  else if (principalError)
    ktpass = (
      <Alert tone="bad" title="Could not build the ktpass command">
        {errorMessage(principalError)}
      </Alert>
    );

  return (
    <>
      {uploadShown && !value.keytabFile && reuseCandidate && (
        <FieldSet legend={`Reuse ${reuseCandidate.profileName}'s keytab?`}>
          <KeytabRow
            details={`${reuseCandidate.servicePrincipalName}, key version ${reuseCandidate.keyVersion}`}
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  edit({
                    keytabFile: null,
                    reuseFrom: reuseCandidate,
                    connectionBeforeReuse: value.connectionId,
                    connectionId: reuseCandidate.connectionId
                  })
                }
              >
                Use this keytab
              </Button>
            }
          />
        </FieldSet>
      )}
      <FieldSet
        legend="Kerberos keytab"
        help={
          <DocumentationLink
            href={ENROLLMENT_DOCS.microsoftAutoenrollment}
            subject="Microsoft Autoenrollment"
          />
        }
        actions={actions}
      >
        {details && <KeytabRow details={details} />}
        {otherHost && (
          <Alert tone="warn" title="Keytab is for another host name">
            Computers ask for <Code>{instancePrincipalName}</Code>. Replace the keytab with one for
            that name.
          </Alert>
        )}
        {uploadShown && (
          <Stack gap={12}>
            <Text muted>
              On a domain controller, turn on AES for the service account first. Without it, tickets
              can be encrypted with RC4, which the keytab can&apos;t read.
            </Text>
            <CodeBlock
              label="PowerShell"
              wrap
              code="Set-ADUser <service-account> -KerberosEncryptionType AES128,AES256"
            />
            <Text muted>
              Then run this with your realm and service account, and upload the file it creates.
            </Text>
            {ktpass}
            <StatusText tone="warn" size="sm">
              Running ktpass again for an account breaks the keytabs made earlier for it. Upload the
              new keytab to every profile that uses one.
            </StatusText>
            <Field name="keytabFile" error={error}>
              <FileInput
                accept=".keytab"
                title="Upload keytab"
                hint="The .keytab file the command created"
                aria-label="Upload keytab"
                files={value.keytabFile ? [value.keytabFile] : undefined}
                onFiles={(files) => {
                  if (files[0]) edit({ keytabFile: files[0] });
                }}
                onRemove={() => edit({ keytabFile: null })}
              />
            </Field>
          </Stack>
        )}
      </FieldSet>
    </>
  );
};

const ChannelBindingSection = ({
  initial,
  value,
  edit
}: {
  initial: TMicrosoftAutoenrollmentEnrollment | null;
  value: boolean;
  edit: Edit;
}) => {
  const isCloud = isInfisicalCloud();
  const status = initial?.channelBinding.status;
  return (
    <FieldSet
      legend="TLS channel binding"
      description="Windows ties each sign-in to the HTTPS certificate the computer sees. Sign-ins tied to a different certificate are refused, so a sign-in captured by another site can't be used to get certificates here."
    >
      {!value && status === MicrosoftAutoenrollmentChannelBindingStatus.Unverifiable && (
        <Alert tone="warn" title="Channel bindings can't be checked">
          {isCloud
            ? "Infisical can't check TLS channel bindings right now, so requests are refused. Contact Infisical support."
            : `${initial?.channelBinding.reason} Requests are refused. If this can't be fixed, turn on Skip the channel binding check below.`}
        </Alert>
      )}
      <Switch
        layout="row"
        label="Skip the channel binding check"
        description={`${
          isCloud
            ? "Turn on only if computers reach Infisical through a proxy that inspects HTTPS."
            : "Turn on only if computers reach Infisical through a proxy that inspects HTTPS, or this instance can't check bindings."
        } While it's on, a site that gets a computer to sign in to it can request certificates as that computer.${
          !isCloud && !value && status === MicrosoftAutoenrollmentChannelBindingStatus.NotChecked
            ? ` ${initial?.channelBinding.reason}`
            : ""
        }`}
        checked={value}
        onCheckedChange={(allowAnyChannelBinding) => edit({ allowAnyChannelBinding })}
      />
    </FieldSet>
  );
};

const ReenrollField = ({
  templateName,
  dirty,
  busy,
  onConfirm
}: {
  templateName: string;
  dirty: boolean;
  busy: boolean;
  onConfirm: () => Promise<boolean>;
}) => {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const confirm = async () => {
    setPending(true);
    try {
      if (await onConfirm()) setOpen(false);
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <Field
        label="Re-enroll computers"
        description="Makes every computer that can still enroll request a new certificate the next time it fetches the enrollment policy."
      >
        <Inline>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            disabledReason={
              dirty ? "Save or discard your changes before re-enrolling computers" : undefined
            }
            onClick={() => setOpen(true)}
          >
            Re-enroll all computers
          </Button>
        </Inline>
      </Field>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent icon="alert" pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-enroll all computers for {templateName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every computer that holds a certificate from this profile and can still enroll
              requests a new one the next time it fetches the enrollment policy, which can take up
              to 8 hours. If an approval policy covers the profile, each request waits for approval.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction loading={pending} onClick={confirm}>
              Re-enroll
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const validate = (value: Draft, keytabRequired: boolean, reuseOffered: boolean): Errors => {
  const renew = parseCount(value.renewBeforeDays);
  let keytabFile: string | undefined;
  if (value.keytabFile?.size === 0) keytabFile = "The keytab file is empty.";
  else if (value.keytabFile && value.keytabFile.size > MAX_KEYTAB_BYTES)
    keytabFile = "The keytab must be 64 KB or smaller.";
  else if (keytabRequired && !value.keytabFile && !value.reuseFrom)
    keytabFile = reuseOffered
      ? "Upload a keytab, or select Use this keytab."
      : "Upload the keytab the command created.";
  return {
    keytabFile,
    connectionId: value.connectionId ? undefined : "Select an LDAP connection.",
    allowedGroups:
      value.allowedGroups.length > MAX_ALLOWED_GROUPS
        ? `Select at most ${MAX_ALLOWED_GROUPS} groups.`
        : undefined,
    renewBeforeDays:
      renew === null || Number.isNaN(renew) || renew < 1 || renew > MAX_RENEW_BEFORE_DAYS
        ? `Must be between 1 and ${MAX_RENEW_BEFORE_DAYS}`
        : undefined
  };
};

const initialOf = ({
  microsoftAutoenrollment: initial
}: TPkiApplicationEnrollmentState): Draft => ({
  connectionId: initial?.connectionId ?? "",
  allowedGroups: initial?.allowedGroups ?? [],
  renewBeforeDays: countText(initial?.renewBeforeDays ?? DEFAULT_RENEW_BEFORE_DAYS),
  keytabFile: null,
  reuseFrom: null,
  connectionBeforeReuse: "",
  replacingKeytab: false,
  allowAnyChannelBinding: initial?.allowAnyChannelBinding ?? false
});

export const MicrosoftAutoenrollmentEnrollmentPanel = ({
  applicationId,
  profileId,
  projectId,
  state,
  header,
  body,
  draft,
  onDraft,
  onSaved,
  onCancel,
  busy,
  run,
  canCreateConnection,
  onUpgradeRequired
}: EnrollmentPanelProps<"microsoft-autoenrollment"> & {
  canCreateConnection: boolean;
  onUpgradeRequired?: () => void;
}) => {
  const adapter = useV4Adapter("pkiApplications");
  const set = adapter.useSetMicrosoftAutoenrollmentEnrollment();
  const clear = adapter.useClearMicrosoftAutoenrollmentEnrollment();
  const reenroll = adapter.useReenrollMicrosoftAutoenrollmentComputers();
  const principal = adapter.useMicrosoftAutoenrollmentServicePrincipal(applicationId, profileId);
  const formId = useId();
  const [errors, setErrors] = useState<Errors>({});
  const configured = state.microsoftAutoenrollmentConfigured;
  const initial = state.microsoftAutoenrollment;
  const savedDraft = initialOf(state);
  const { value, change } = withDraft<Draft>(savedDraft, draft, onDraft);
  const instancePrincipalName = principal.data?.servicePrincipalName;
  const reuseCandidate = reuseCandidateOf(
    state.microsoftAutoenrollmentOtherProfiles,
    initial,
    instancePrincipalName?.toLowerCase()
  );

  const edit: Edit = (patch) => {
    setErrors((current) => {
      const next = { ...current };
      (Object.keys(patch) as ErrorKey[]).forEach((key) => delete next[key]);
      if ("reuseFrom" in patch || "replacingKeytab" in patch) delete next.keytabFile;
      return next;
    });
    change(patch);
  };

  const changed = (key: keyof Draft) =>
    !initial || JSON.stringify(value[key]) !== JSON.stringify(savedDraft[key]);

  const submit = async () => {
    const next = validate(value, !initial || value.replacingKeytab, Boolean(reuseCandidate));
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    if (onUpgradeRequired) {
      onUpgradeRequired();
      return;
    }
    try {
      const keytab = value.keytabFile
        ? bytesToBase64(new Uint8Array(await value.keytabFile.arrayBuffer()))
        : undefined;
      await run(() =>
        set.mutateAsync({
          applicationId,
          profileId,
          connectionId: changed("connectionId") ? value.connectionId : undefined,
          allowedGroupSids: changed("allowedGroups")
            ? value.allowedGroups.map((group) => group.sid)
            : undefined,
          renewBeforeDays: changed("renewBeforeDays")
            ? (parseCount(value.renewBeforeDays) ?? undefined)
            : undefined,
          keytab,
          reuseKeytab: value.reuseFrom ? { profileId: value.reuseFrom.profileId } : undefined,
          allowAnyChannelBinding: changed("allowAnyChannelBinding")
            ? value.allowAnyChannelBinding
            : undefined
        })
      );
      saved(configured ? "Microsoft Autoenrollment saved" : "Microsoft Autoenrollment enabled");
      onSaved();
    } catch (error) {
      failed(
        configured
          ? "Couldn't save Microsoft Autoenrollment"
          : "Couldn't enable Microsoft Autoenrollment",
        error
      );
    }
  };

  const reenrollComputers = async () => {
    if (onUpgradeRequired) {
      onUpgradeRequired();
      return true;
    }
    try {
      await run(() => reenroll.mutateAsync({ applicationId, profileId }));
      saved(
        "Computers will request new certificates the next time they fetch the enrollment policy, within 8 hours."
      );
      return true;
    } catch (error) {
      failed("Couldn't re-enroll computers", error);
      return false;
    }
  };

  return (
    <SheetSections
      header={header}
      footer={
        <EnrollmentFooter
          method="microsoft-autoenrollment"
          configured={configured}
          formId={formId}
          dirty={Boolean(draft)}
          pending={busy}
          busy={busy}
          onCancel={onCancel}
          applicationId={applicationId}
          profileId={profileId}
          clear={clear}
          consequence="Computers keep asking this profile for certificates until you remove its enrollment policy URL from Group Policy, and approved requests that computers haven't picked up yet can no longer be collected."
        />
      }
    >
      <EnrollmentBody {...body}>
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={24}>
            {configured && initial && (
              <FieldSet legend="Endpoint">
                <Field
                  label="Enrollment policy URL"
                  description="Add it in Group Policy under Certificate Enrollment Policy, with Windows integrated authentication."
                >
                  <Snippet
                    label="Enrollment policy URL"
                    copyLabel="Copy enrollment policy URL"
                    value={initial.policyUrl}
                  />
                </Field>
                <Field label="Policy ID">
                  <Snippet label="Policy ID" copyLabel="Copy policy ID" value={initial.policyId} />
                </Field>
              </FieldSet>
            )}
            <KeytabSection
              value={value}
              error={errors.keytabFile}
              initial={initial}
              instancePrincipalName={instancePrincipalName}
              principalError={principal.error}
              reuseCandidate={reuseCandidate}
              edit={edit}
            />
            <FieldSet legend="Active Directory">
              <LdapConnectionField
                projectId={projectId}
                canCreateConnection={canCreateConnection}
                value={value.connectionId}
                error={errors.connectionId}
                onChange={(connectionId) => edit({ connectionId })}
              />
            </FieldSet>
            <FieldSet legend="Allowed computers">
              <AllowedGroupsField
                connectionId={value.connectionId}
                value={value.allowedGroups}
                error={errors.allowedGroups}
                onChange={(allowedGroups) => edit({ allowedGroups })}
              />
            </FieldSet>
            <ChannelBindingSection
              initial={initial}
              value={value.allowAnyChannelBinding}
              edit={edit}
            />
            <FieldSet legend="Renewal">
              <Field
                label="Renew before (days)"
                name="renewBeforeDays"
                description={`Days before expiry that Windows renews the certificate.${renewalNoteOf(initial)}`}
                error={errors.renewBeforeDays}
              >
                <Input
                  inputMode="numeric"
                  value={value.renewBeforeDays}
                  invalid={Boolean(errors.renewBeforeDays)}
                  onChange={(event) => edit({ renewBeforeDays: event.target.value })}
                />
              </Field>
              {configured && initial && (
                <ReenrollField
                  templateName={initial.templateName}
                  dirty={Boolean(draft)}
                  busy={busy}
                  onConfirm={reenrollComputers}
                />
              )}
            </FieldSet>
          </Stack>
        </form>
      </EnrollmentBody>
    </SheetSections>
  );
};
