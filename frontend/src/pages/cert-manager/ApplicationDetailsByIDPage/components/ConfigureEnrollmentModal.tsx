import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Plus } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ConfirmActionModal, Spinner, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TextArea
} from "@app/components/v3";
import { downloadFile } from "@app/helpers/download";
import { useToggle } from "@app/hooks";
import { useGetPkiApplicationEnrollment } from "@app/hooks/api/pkiApplications";
import {
  useClearPkiApplicationAcmeEnrollment,
  useClearPkiApplicationApiEnrollment,
  useClearPkiApplicationEstEnrollment,
  useClearPkiApplicationScepEnrollment,
  useRevealPkiApplicationAcmeEabSecret,
  useRotatePkiApplicationAcmeEabSecret,
  useSetPkiApplicationAcmeEnrollment,
  useSetPkiApplicationApiEnrollment,
  useSetPkiApplicationEstEnrollment,
  useSetPkiApplicationScepEnrollment
} from "@app/hooks/api/pkiApplications/mutations";
import { ScepChallengeType, TPkiApplicationProfile } from "@app/hooks/api/pkiApplications/types";

const COPY_RESET_MS = 1000;

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  profile: TPkiApplicationProfile | null;
};

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const CopyableField = ({
  label,
  value,
  helper
}: {
  label: string;
  value: string;
  helper?: string;
}) => {
  const [copied, setCopied] = useToggle(false);
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input value={value} disabled />
        <IconButton
          aria-label={`copy ${label}`}
          variant="outline"
          className="w-10"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied.on();
            setTimeout(() => setCopied.off(), COPY_RESET_MS);
          }}
        >
          <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
        </IconButton>
      </div>
      {helper ? <p className="mt-1 text-xs text-mineshaft-400">{helper}</p> : null}
    </div>
  );
};

const DisableEnrollmentButton = ({
  method,
  onConfirmed,
  isPending
}: {
  method: "API" | "EST" | "ACME" | "SCEP";
  onConfirmed: () => Promise<void>;
  isPending: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setIsOpen(true)} isPending={isPending}>
        Disable
      </Button>
      <ConfirmActionModal
        isOpen={isOpen}
        onChange={setIsOpen}
        confirmKey="disable"
        title={`Disable ${method} enrollment for this profile?`}
        subTitle={`Clients using ${method} against this profile via this Application will stop being able to request certificates. Existing certificates remain valid.`}
        buttonText="Disable enrollment"
        onConfirmed={async () => {
          await onConfirmed();
          setIsOpen(false);
        }}
      />
    </>
  );
};

type ApiForm = { autoRenew: boolean; renewBeforeDays?: number };

const ApiPanel = ({
  applicationId,
  profileId,
  enabled,
  initial
}: {
  applicationId: string;
  profileId: string;
  enabled: boolean;
  initial: { autoRenew: boolean; renewBeforeDays: number | null } | null;
}) => {
  const setMutation = useSetPkiApplicationApiEnrollment();
  const clearMutation = useClearPkiApplicationApiEnrollment();
  const { control, handleSubmit, watch, reset } = useForm<ApiForm>({
    defaultValues: {
      autoRenew: initial?.autoRenew ?? false,
      renewBeforeDays: initial?.renewBeforeDays ?? undefined
    }
  });

  useEffect(() => {
    reset({
      autoRenew: initial?.autoRenew ?? false,
      renewBeforeDays: initial?.renewBeforeDays ?? undefined
    });
  }, [initial?.autoRenew, initial?.renewBeforeDays, reset]);

  const autoRenew = watch("autoRenew");

  const onSave = handleSubmit(async (values) => {
    try {
      await setMutation.mutateAsync({
        applicationId,
        profileId,
        autoRenew: values.autoRenew,
        renewBeforeDays: values.autoRenew ? values.renewBeforeDays : undefined
      });
      createNotification({ type: "success", text: "API enrollment saved" });
    } catch (err) {
      createNotification({ type: "error", text: errorText(err, "Failed to save API enrollment") });
    }
  });

  const onDisable = async () => {
    try {
      await clearMutation.mutateAsync({ applicationId, profileId });
      createNotification({ type: "success", text: "API enrollment disabled" });
    } catch (err) {
      createNotification({
        type: "error",
        text: errorText(err, "Failed to disable API enrollment")
      });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-mineshaft-300">
        API enrollment lets clients request certificates by calling the Infisical API with this
        profile.
      </p>
      <Controller
        control={control}
        name="autoRenew"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4">
            <div>
              <FieldLabel>Auto-renew</FieldLabel>
              <p className="text-xs text-mineshaft-400">
                Automatically renew certificates issued via this profile before they expire.
              </p>
            </div>
            <Switch id="api-auto-renew" checked={field.value} onCheckedChange={field.onChange} />
          </div>
        )}
      />
      {autoRenew && (
        <Controller
          control={control}
          name="renewBeforeDays"
          rules={{ min: 1, max: 365 }}
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Renew before (days)</FieldLabel>
              <FieldContent>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                  }
                  placeholder="30"
                  isError={Boolean(error)}
                />
              </FieldContent>
              {error ? <FieldError>Must be between 1 and 365</FieldError> : null}
              <FieldDescription>How many days before expiry to trigger renewal.</FieldDescription>
            </Field>
          )}
        />
      )}
      <div className="flex justify-end gap-2 pt-2">
        {enabled && (
          <DisableEnrollmentButton
            method="API"
            onConfirmed={onDisable}
            isPending={clearMutation.isPending}
          />
        )}
        <Button variant="project" onClick={onSave} isPending={setMutation.isPending}>
          {enabled ? "Save" : "Enable"}
        </Button>
      </div>
    </div>
  );
};

type EstForm = { passphrase: string; disableBootstrapCaValidation: boolean; caChain?: string };

const EstPanel = ({
  applicationId,
  profileId,
  enabled,
  initial
}: {
  applicationId: string;
  profileId: string;
  enabled: boolean;
  initial: { disableBootstrapCaValidation: boolean; estEndpointUrl: string } | null;
}) => {
  const setMutation = useSetPkiApplicationEstEnrollment();
  const clearMutation = useClearPkiApplicationEstEnrollment();
  const { control, handleSubmit, reset } = useForm<EstForm>({
    defaultValues: {
      passphrase: "",
      disableBootstrapCaValidation: initial?.disableBootstrapCaValidation ?? false,
      caChain: ""
    }
  });

  useEffect(() => {
    reset({
      passphrase: "",
      disableBootstrapCaValidation: initial?.disableBootstrapCaValidation ?? false,
      caChain: ""
    });
  }, [initial?.disableBootstrapCaValidation, reset]);

  const onSave = handleSubmit(async (values) => {
    try {
      await setMutation.mutateAsync({
        applicationId,
        profileId,
        passphrase: values.passphrase,
        disableBootstrapCaValidation: values.disableBootstrapCaValidation,
        caChain: values.caChain || undefined
      });
      createNotification({ type: "success", text: "EST enrollment saved" });
    } catch (err) {
      createNotification({ type: "error", text: errorText(err, "Failed to save EST enrollment") });
    }
  });

  const onDisable = async () => {
    try {
      await clearMutation.mutateAsync({ applicationId, profileId });
      createNotification({ type: "success", text: "EST enrollment disabled" });
    } catch (err) {
      createNotification({
        type: "error",
        text: errorText(err, "Failed to disable EST enrollment")
      });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-mineshaft-300">
        EST clients will authenticate to this profile with the passphrase below.
      </p>
      {enabled && initial?.estEndpointUrl ? (
        <div className="space-y-3 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3">
          <CopyableField
            label="EST endpoint base URL"
            value={initial.estEndpointUrl}
            helper="Append /simpleenroll, /simplereenroll, or /cacerts depending on the operation."
          />
        </div>
      ) : null}
      <Controller
        control={control}
        name="passphrase"
        rules={{ required: !enabled, minLength: 8 }}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              {enabled ? "New passphrase (leave blank to keep current)" : "Passphrase"}
            </FieldLabel>
            <FieldContent>
              <Input type="password" {...field} placeholder="••••••••" isError={Boolean(error)} />
            </FieldContent>
            {error ? <FieldError>Minimum 8 characters</FieldError> : null}
          </Field>
        )}
      />
      <Controller
        control={control}
        name="caChain"
        render={({ field }) => (
          <Field>
            <FieldLabel>CA chain (optional)</FieldLabel>
            <FieldContent>
              <TextArea {...field} rows={3} placeholder="-----BEGIN CERTIFICATE-----..." />
            </FieldContent>
            <FieldDescription>PEM-encoded chain returned by the EST endpoint.</FieldDescription>
          </Field>
        )}
      />
      <Controller
        control={control}
        name="disableBootstrapCaValidation"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4">
            <div>
              <FieldLabel>Disable bootstrap CA validation</FieldLabel>
              <p className="text-xs text-mineshaft-400">
                Allow EST clients to skip server certificate validation during enrollment.
              </p>
            </div>
            <Switch
              id="est-disable-bootstrap"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          </div>
        )}
      />
      <div className="flex justify-end gap-2 pt-2">
        {enabled && (
          <DisableEnrollmentButton
            method="EST"
            onConfirmed={onDisable}
            isPending={clearMutation.isPending}
          />
        )}
        <Button variant="project" onClick={onSave} isPending={setMutation.isPending}>
          {enabled ? "Save" : "Enable"}
        </Button>
      </div>
    </div>
  );
};

type AcmeForm = { skipDnsOwnershipVerification: boolean; skipEabBinding: boolean };

const AcmePanel = ({
  applicationId,
  profileId,
  enabled,
  initial
}: {
  applicationId: string;
  profileId: string;
  enabled: boolean;
  initial: {
    skipDnsOwnershipVerification: boolean;
    skipEabBinding: boolean;
    directoryUrl: string;
  } | null;
}) => {
  const setMutation = useSetPkiApplicationAcmeEnrollment();
  const clearMutation = useClearPkiApplicationAcmeEnrollment();
  const revealMutation = useRevealPkiApplicationAcmeEabSecret();
  const rotateMutation = useRotatePkiApplicationAcmeEabSecret();
  const [credentials, setCredentials] = useState<{ eabKid: string; eabSecret: string } | null>(
    null
  );
  const { control, handleSubmit, watch, setValue, reset } = useForm<AcmeForm>({
    defaultValues: {
      skipDnsOwnershipVerification: initial?.skipDnsOwnershipVerification ?? false,
      skipEabBinding: initial?.skipEabBinding ?? false
    }
  });

  useEffect(() => {
    reset({
      skipDnsOwnershipVerification: initial?.skipDnsOwnershipVerification ?? false,
      skipEabBinding: initial?.skipEabBinding ?? false
    });
  }, [initial?.skipDnsOwnershipVerification, initial?.skipEabBinding, reset]);

  const skipDns = watch("skipDnsOwnershipVerification");
  const skipEab = watch("skipEabBinding");

  const onSave = handleSubmit(async (values) => {
    if (values.skipDnsOwnershipVerification && values.skipEabBinding) {
      createNotification({
        type: "error",
        text: "Pick at most one of: skip DNS ownership verification, skip EAB binding."
      });
      return;
    }
    try {
      await setMutation.mutateAsync({ applicationId, profileId, ...values });
      createNotification({ type: "success", text: "ACME enrollment saved" });
    } catch (err) {
      createNotification({ type: "error", text: errorText(err, "Failed to save ACME enrollment") });
    }
  });

  const onDisable = async () => {
    try {
      await clearMutation.mutateAsync({ applicationId, profileId });
      setCredentials(null);
      createNotification({ type: "success", text: "ACME enrollment disabled" });
    } catch (err) {
      createNotification({
        type: "error",
        text: errorText(err, "Failed to disable ACME enrollment")
      });
    }
  };

  const onReveal = async () => {
    try {
      const data = await revealMutation.mutateAsync({ applicationId, profileId });
      setCredentials({ eabKid: data.eabKid, eabSecret: data.eabSecret });
    } catch (err) {
      createNotification({ type: "error", text: errorText(err, "Failed to reveal EAB secret") });
    }
  };

  const onRotate = async () => {
    try {
      await rotateMutation.mutateAsync({ applicationId, profileId });
      const data = await revealMutation.mutateAsync({ applicationId, profileId });
      setCredentials({ eabKid: data.eabKid, eabSecret: data.eabSecret });
      createNotification({ type: "success", text: "ACME EAB secret rotated" });
    } catch (err) {
      createNotification({ type: "error", text: errorText(err, "Failed to rotate EAB secret") });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-mineshaft-300">
        ACME clients use the EAB credentials below to register an account against this profile.
      </p>
      {enabled && initial?.directoryUrl ? (
        <div className="space-y-3 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3">
          <CopyableField label="ACME directory URL" value={initial.directoryUrl} />
        </div>
      ) : null}
      <p className="text-xs text-mineshaft-400">
        Pick at most one of the two options below — they are mutually exclusive.
      </p>
      <Controller
        control={control}
        name="skipDnsOwnershipVerification"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4">
            <div>
              <FieldLabel>Skip DNS ownership verification</FieldLabel>
              <p className="text-xs text-mineshaft-400">
                Skip DNS-01 / HTTP-01 challenge enforcement. Use only inside trusted networks.
              </p>
            </div>
            <Switch
              id="acme-skip-dns"
              checked={field.value}
              onCheckedChange={(v) => {
                field.onChange(v);
                if (v) setValue("skipEabBinding", false);
              }}
              disabled={skipEab}
            />
          </div>
        )}
      />
      <Controller
        control={control}
        name="skipEabBinding"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4">
            <div>
              <FieldLabel>Skip EAB binding</FieldLabel>
              <p className="text-xs text-mineshaft-400">
                Allow accounts to register without an EAB key. Recommended off in production.
              </p>
            </div>
            <Switch
              id="acme-skip-eab"
              checked={field.value}
              onCheckedChange={(v) => {
                field.onChange(v);
                if (v) setValue("skipDnsOwnershipVerification", false);
              }}
              disabled={skipDns}
            />
          </div>
        )}
      />
      {enabled && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={onReveal} isPending={revealMutation.isPending}>
            Reveal EAB credentials
          </Button>
          <Button variant="outline" onClick={onRotate} isPending={rotateMutation.isPending}>
            Rotate EAB secret
          </Button>
        </div>
      )}
      {credentials && (
        <div className="space-y-3 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3">
          <CopyableField label="EAB KID" value={credentials.eabKid} />
          <CopyableField label="EAB Secret" value={credentials.eabSecret} />
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        {enabled && (
          <DisableEnrollmentButton
            method="ACME"
            onConfirmed={onDisable}
            isPending={clearMutation.isPending}
          />
        )}
        <Button variant="project" onClick={onSave} isPending={setMutation.isPending}>
          {enabled ? "Save" : "Enable"}
        </Button>
      </div>
    </div>
  );
};

const ScepPanel = ({
  applicationId,
  profileId,
  profileSlug,
  enabled,
  initial
}: {
  applicationId: string;
  profileId: string;
  profileSlug: string;
  enabled: boolean;
  initial: {
    challengeType: ScepChallengeType;
    includeCaCertInResponse: boolean;
    allowCertBasedRenewal: boolean;
    dynamicChallengeExpiryMinutes: number | null;
    dynamicChallengeMaxPending: number | null;
    scepEndpointUrl: string;
    challengeEndpointUrl: string | null;
    raCertificatePem: string;
    raCertExpiresAt: string;
  } | null;
}) => {
  const setMutation = useSetPkiApplicationScepEnrollment();
  const clearMutation = useClearPkiApplicationScepEnrollment();
  const { control, handleSubmit, watch, reset } = useForm<{
    challengeType: ScepChallengeType;
    challengePassword?: string;
    includeCaCertInResponse: boolean;
    allowCertBasedRenewal: boolean;
    dynamicChallengeExpiryMinutes?: number;
    dynamicChallengeMaxPending?: number;
  }>({
    defaultValues: {
      challengeType: initial?.challengeType ?? "static",
      challengePassword: "",
      includeCaCertInResponse: initial?.includeCaCertInResponse ?? true,
      allowCertBasedRenewal: initial?.allowCertBasedRenewal ?? true,
      dynamicChallengeExpiryMinutes: initial?.dynamicChallengeExpiryMinutes ?? 60,
      dynamicChallengeMaxPending: initial?.dynamicChallengeMaxPending ?? 100
    }
  });

  useEffect(() => {
    reset({
      challengeType: initial?.challengeType ?? "static",
      challengePassword: "",
      includeCaCertInResponse: initial?.includeCaCertInResponse ?? true,
      allowCertBasedRenewal: initial?.allowCertBasedRenewal ?? true,
      dynamicChallengeExpiryMinutes: initial?.dynamicChallengeExpiryMinutes ?? 60,
      dynamicChallengeMaxPending: initial?.dynamicChallengeMaxPending ?? 100
    });
  }, [
    initial?.challengeType,
    initial?.includeCaCertInResponse,
    initial?.allowCertBasedRenewal,
    initial?.dynamicChallengeExpiryMinutes,
    initial?.dynamicChallengeMaxPending,
    reset
  ]);

  const challengeType = watch("challengeType");

  const onSave = handleSubmit(async (values) => {
    try {
      await setMutation.mutateAsync({ applicationId, profileId, ...values });
      createNotification({ type: "success", text: "SCEP enrollment saved" });
    } catch (err) {
      createNotification({ type: "error", text: errorText(err, "Failed to save SCEP enrollment") });
    }
  });

  const onDisable = async () => {
    try {
      await clearMutation.mutateAsync({ applicationId, profileId });
      createNotification({ type: "success", text: "SCEP enrollment disabled" });
    } catch (err) {
      createNotification({
        type: "error",
        text: errorText(err, "Failed to disable SCEP enrollment")
      });
    }
  };

  const raCertExpiresAtLabel = initial?.raCertExpiresAt
    ? new Date(initial.raCertExpiresAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      })
    : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-mineshaft-300">
        SCEP clients enroll by presenting a challenge password. Use static for shared passwords,
        dynamic for one-time per-client challenges.
      </p>
      {enabled && initial ? (
        <div className="space-y-3 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3">
          <CopyableField
            label="SCEP endpoint URL"
            value={initial.scepEndpointUrl}
            helper="Configure your MDM or SCEP client to point at this URL."
          />
          {initial.challengeType === "dynamic" && initial.challengeEndpointUrl ? (
            <CopyableField
              label="Challenge endpoint URL"
              value={initial.challengeEndpointUrl}
              helper="Authenticated POST endpoint to mint a one-time challenge (e.g., the JAMF SCEPChallenge webhook)."
            />
          ) : null}
          {initial.raCertificatePem ? (
            <div>
              <FieldLabel>RA certificate</FieldLabel>
              <div className="flex items-center justify-between rounded-md border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
                <p className="text-xs text-mineshaft-400">
                  Expires: {raCertExpiresAtLabel ?? "Unknown"}
                </p>
                <IconButton
                  aria-label="download RA certificate"
                  variant="outline"
                  onClick={() =>
                    downloadFile(
                      initial.raCertificatePem,
                      `${profileSlug}-ra-cert.pem`,
                      "application/x-pem-file"
                    )
                  }
                  className="flex w-auto items-center gap-2 px-3"
                >
                  <FontAwesomeIcon icon={faDownload} />
                  <span className="text-sm">Download PEM</span>
                </IconButton>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <Controller
        control={control}
        name="challengeType"
        render={({ field }) => (
          <Field>
            <FieldLabel>Challenge type</FieldLabel>
            <FieldContent>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="static">Static password</SelectItem>
                  <SelectItem value="dynamic">Dynamic (per-client)</SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
        )}
      />
      {challengeType === "static" && (
        <Controller
          control={control}
          name="challengePassword"
          rules={{ required: !enabled }}
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                {enabled
                  ? "New challenge password (leave blank to keep current)"
                  : "Challenge password"}
              </FieldLabel>
              <FieldContent>
                <Input type="password" {...field} placeholder="••••••••" isError={Boolean(error)} />
              </FieldContent>
              {error ? <FieldError>Required</FieldError> : null}
            </Field>
          )}
        />
      )}
      {challengeType === "dynamic" && (
        <div className="grid grid-cols-2 gap-4">
          <Controller
            control={control}
            name="dynamicChallengeExpiryMinutes"
            render={({ field }) => (
              <Field>
                <FieldLabel>Challenge expiry (minutes)</FieldLabel>
                <FieldContent>
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                    }
                  />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="dynamicChallengeMaxPending"
            render={({ field }) => (
              <Field>
                <FieldLabel>Max pending challenges</FieldLabel>
                <FieldContent>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                    }
                  />
                </FieldContent>
              </Field>
            )}
          />
        </div>
      )}
      <Controller
        control={control}
        name="includeCaCertInResponse"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4">
            <div>
              <FieldLabel>Include CA cert in response</FieldLabel>
              <p className="text-xs text-mineshaft-400">
                Return the issuing CA certificate inline alongside the issued cert.
              </p>
            </div>
            <Switch id="scep-include-ca" checked={field.value} onCheckedChange={field.onChange} />
          </div>
        )}
      />
      <Controller
        control={control}
        name="allowCertBasedRenewal"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4">
            <div>
              <FieldLabel>Allow cert-based renewal</FieldLabel>
              <p className="text-xs text-mineshaft-400">
                Let clients renew using their existing certificate as authentication.
              </p>
            </div>
            <Switch id="scep-cert-renewal" checked={field.value} onCheckedChange={field.onChange} />
          </div>
        )}
      />
      <div className="flex justify-end gap-2 pt-2">
        {enabled && (
          <DisableEnrollmentButton
            method="SCEP"
            onConfirmed={onDisable}
            isPending={clearMutation.isPending}
          />
        )}
        <Button variant="project" onClick={onSave} isPending={setMutation.isPending}>
          {enabled ? "Save" : "Enable"}
        </Button>
      </div>
    </div>
  );
};

type EnrollmentMethod = "api" | "est" | "acme" | "scep";

const METHOD_LABELS: Record<EnrollmentMethod, string> = {
  api: "API",
  est: "EST",
  acme: "ACME",
  scep: "SCEP"
};

const METHOD_DESCRIPTIONS: Record<EnrollmentMethod, string> = {
  api: "Clients call the Infisical API directly to request certificates.",
  est: "Clients use the EST protocol (RFC 7030) over HTTPS.",
  acme: "Clients use the ACME protocol (RFC 8555) — same flow as Let's Encrypt.",
  scep: "Network devices use the SCEP protocol over HTTPS."
};

export const ConfigureEnrollmentModal = ({
  isOpen,
  onOpenChange,
  applicationId,
  profile
}: Props) => {
  const profileId = profile?.profileId ?? "";
  const { data, isLoading } = useGetPkiApplicationEnrollment(applicationId, profileId);

  const configuredMethods: EnrollmentMethod[] = [];
  if (data?.api) configuredMethods.push("api");
  if (data?.estConfigured) configuredMethods.push("est");
  if (data?.acmeConfigured) configuredMethods.push("acme");
  if (data?.scepConfigured) configuredMethods.push("scep");

  const [pendingMethod, setPendingMethod] = useState<EnrollmentMethod | null>(null);
  const [activeTab, setActiveTab] = useState<EnrollmentMethod | "">("");

  const ALL_ORDER: EnrollmentMethod[] = ["api", "est", "acme", "scep"];
  const visibleMethods = ALL_ORDER.filter(
    (m) => configuredMethods.includes(m) || pendingMethod === m
  );
  const addableMethods = ALL_ORDER.filter(
    (m) => !configuredMethods.includes(m) && pendingMethod !== m
  );

  useEffect(() => {
    if (!isOpen) {
      setPendingMethod(null);
      setActiveTab("");
    }
  }, [isOpen, profileId]);

  useEffect(() => {
    if (visibleMethods.length === 0) {
      setActiveTab("");
      return;
    }
    if (!activeTab || !visibleMethods.includes(activeTab as EnrollmentMethod)) {
      setActiveTab(visibleMethods[0]);
    }
  }, [visibleMethods, activeTab]);

  useEffect(() => {
    if (pendingMethod && configuredMethods.includes(pendingMethod)) {
      setPendingMethod(null);
    }
  }, [pendingMethod, data]);

  const handleAdd = (method: EnrollmentMethod) => {
    setPendingMethod(method);
    setActiveTab(method);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-visible">
        <DialogHeader>
          <DialogTitle>
            Configure enrollment: <span className="font-mono">{profile?.profileSlug ?? ""}</span>
          </DialogTitle>
          <DialogDescription>
            Enable an enrollment method to allow clients to request certificates from this Profile
            through this Application.
          </DialogDescription>
        </DialogHeader>

        {!profile || isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-border">
              {visibleMethods.length > 0 ? (
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EnrollmentMethod)}>
                  <TabList className="border-b-0">
                    {visibleMethods.map((m) => (
                      <Tab key={m} value={m}>
                        {METHOD_LABELS[m]}
                      </Tab>
                    ))}
                  </TabList>
                </Tabs>
              ) : (
                <div />
              )}
              {addableMethods.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="mb-2">
                      <Plus className="size-4" />
                      Add enrollment method
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {addableMethods.map((m) => (
                      <DropdownMenuItem key={m} onClick={() => handleAdd(m)}>
                        <div className="flex flex-col">
                          <span className="font-medium">{METHOD_LABELS[m]}</span>
                          <span className="text-muted-foreground text-xs">
                            {METHOD_DESCRIPTIONS[m]}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>

            {visibleMethods.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>No enrollment methods configured</EmptyTitle>
                  <EmptyDescription>
                    Click <span className="font-medium">Add enrollment method</span> above to let
                    clients request certificates from this Profile.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EnrollmentMethod)}>
                {visibleMethods.includes("api") ? (
                  <TabPanel value="api">
                    <ApiPanel
                      applicationId={applicationId}
                      profileId={profileId}
                      enabled={Boolean(data?.api)}
                      initial={data?.api ?? null}
                    />
                  </TabPanel>
                ) : null}
                {visibleMethods.includes("est") ? (
                  <TabPanel value="est">
                    <EstPanel
                      applicationId={applicationId}
                      profileId={profileId}
                      enabled={Boolean(data?.estConfigured)}
                      initial={data?.est ?? null}
                    />
                  </TabPanel>
                ) : null}
                {visibleMethods.includes("acme") ? (
                  <TabPanel value="acme">
                    <AcmePanel
                      applicationId={applicationId}
                      profileId={profileId}
                      enabled={Boolean(data?.acmeConfigured)}
                      initial={data?.acme ?? null}
                    />
                  </TabPanel>
                ) : null}
                {visibleMethods.includes("scep") ? (
                  <TabPanel value="scep">
                    <ScepPanel
                      applicationId={applicationId}
                      profileId={profileId}
                      profileSlug={profile?.profileSlug ?? ""}
                      enabled={Boolean(data?.scepConfigured)}
                      initial={data?.scep ?? null}
                    />
                  </TabPanel>
                ) : null}
              </Tabs>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
