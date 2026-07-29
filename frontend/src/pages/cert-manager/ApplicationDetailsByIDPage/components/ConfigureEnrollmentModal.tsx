import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  AlertTriangleIcon,
  EyeIcon,
  EyeOffIcon,
  FileTextIcon,
  Plus,
  RotateCwIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Spinner, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
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
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
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

import { PkiDocsUrls } from "../../pki-docs-urls";

const COPY_RESET_MS = 1000;

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  profile: TPkiApplicationProfile | null;
  initialMethod?: EnrollmentMethod;
};

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const SectionCard = ({
  title,
  actions,
  children,
  className
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  <section
    className={`rounded-md border border-border bg-foreground/[0.02] ${className ?? ""}`.trim()}
  >
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
    <div className="space-y-4 px-4 py-4">{children}</div>
  </section>
);

const CopyableField = ({
  label,
  value,
  helper
}: {
  label: string;
  value: string;
  helper?: React.ReactNode;
}) => {
  const [copied, setCopied] = useToggle(false);
  return (
    <div>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <InputGroup>
        <InputGroupInput value={value} readOnly className="font-mono text-xs" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label={`copy ${label || "value"}`}
            onClick={() => {
              navigator.clipboard.writeText(value);
              setCopied.on();
              setTimeout(() => setCopied.off(), COPY_RESET_MS);
            }}
          >
            <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {helper ? <p className="mt-1 text-xs text-accent">{helper}</p> : null}
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
      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangleIcon className="text-warning" />
            </AlertDialogMedia>
            <AlertDialogTitle>Disable {method} enrollment for this profile?</AlertDialogTitle>
            <AlertDialogDescription>
              Clients using {method} against this profile via this application will stop being able
              to request certificates. Existing certificates remain valid.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" isPending={isPending} onClick={onConfirmed}>
              Disable enrollment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

type ApiForm = { autoRenew: boolean; renewBeforeDays: number | null };

const handleOptionalIntChange =
  (onChange: (next: number | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === "") {
      onChange(null);
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    onChange(Number.isNaN(parsed) ? null : parsed);
  };

const ApiPanel = ({
  applicationId,
  profileId,
  enabled,
  initial,
  onCancelPending,
  onDirtyChange
}: {
  applicationId: string;
  profileId: string;
  enabled: boolean;
  onCancelPending: () => void;
  onDirtyChange: (isDirty: boolean) => void;
  initial: { autoRenew: boolean; renewBeforeDays: number | null } | null;
}) => {
  const setMutation = useSetPkiApplicationApiEnrollment();
  const clearMutation = useClearPkiApplicationApiEnrollment();
  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isDirty }
  } = useForm<ApiForm>({
    defaultValues: {
      autoRenew: initial?.autoRenew ?? false,
      renewBeforeDays: initial?.renewBeforeDays ?? null
    }
  });

  useEffect(() => {
    reset({
      autoRenew: initial?.autoRenew ?? false,
      renewBeforeDays: initial?.renewBeforeDays ?? null
    });
  }, [initial?.autoRenew, initial?.renewBeforeDays, reset]);

  const autoRenew = watch("autoRenew");

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const onSave = handleSubmit(async (values) => {
    try {
      await setMutation.mutateAsync({
        applicationId,
        profileId,
        autoRenew: values.autoRenew,
        renewBeforeDays: values.autoRenew ? (values.renewBeforeDays ?? undefined) : undefined
      });
      reset(values);
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

  const apiEndpointUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/v1/cert-manager/certificates`
      : "/api/v1/cert-manager/certificates";

  return (
    <div className="space-y-5">
      <SectionCard title="Endpoint">
        <CopyableField
          label="API endpoint URL"
          value={apiEndpointUrl}
          helper={
            <>
              POST to this endpoint with <code className="font-mono">applicationId</code>,{" "}
              <code className="font-mono">profileId</code>, and an{" "}
              <code className="font-mono">attributes</code> object (commonName, ttl, etc.) in the
              body to issue a certificate.{" "}
              <a
                href="https://infisical.com/docs/api-reference/endpoints/certificates/create-certificate"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary-400"
              >
                View API reference
              </a>
            </>
          }
        />
      </SectionCard>
      <SectionCard title="Renewal">
        <Controller
          control={control}
          name="autoRenew"
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldContent>
                <Label>Auto-renew</Label>
                <FieldDescription>
                  Automatically renew certificates issued via this profile before they expire.
                </FieldDescription>
              </FieldContent>
              <Switch
                variant="project"
                id="api-auto-renew"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </Field>
          )}
        />
        {autoRenew && (
          <Controller
            control={control}
            name="renewBeforeDays"
            rules={{
              validate: (value) =>
                value === null || (value >= 1 && value <= 365) || "Must be between 1 and 365"
            }}
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Renew before (days)</FieldLabel>
                <FieldContent>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={field.value ?? ""}
                    onChange={handleOptionalIntChange(field.onChange)}
                    placeholder="30"
                    isError={Boolean(error)}
                  />
                </FieldContent>
                {error ? (
                  <FieldError>{error.message ?? "Must be between 1 and 365"}</FieldError>
                ) : null}
                <FieldDescription>How many days before expiry to trigger renewal.</FieldDescription>
              </Field>
            )}
          />
        )}
      </SectionCard>
      <div className="flex justify-end gap-2 pt-2">
        {!enabled && (
          <Button variant="outline" onClick={onCancelPending}>
            Cancel
          </Button>
        )}
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
  initial,
  onCancelPending,
  onDirtyChange
}: {
  applicationId: string;
  profileId: string;
  enabled: boolean;
  onCancelPending: () => void;
  onDirtyChange: (isDirty: boolean) => void;
  initial: { disableBootstrapCaValidation: boolean; estEndpointUrl: string } | null;
}) => {
  const setMutation = useSetPkiApplicationEstEnrollment();
  const clearMutation = useClearPkiApplicationEstEnrollment();
  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty }
  } = useForm<EstForm>({
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

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const onSave = handleSubmit(async (values) => {
    try {
      await setMutation.mutateAsync({
        applicationId,
        profileId,
        passphrase: values.passphrase,
        disableBootstrapCaValidation: values.disableBootstrapCaValidation,
        caChain: values.caChain || undefined
      });
      reset({
        passphrase: "",
        disableBootstrapCaValidation: values.disableBootstrapCaValidation,
        caChain: values.caChain
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
    <div className="space-y-5">
      {enabled && initial?.estEndpointUrl ? (
        <SectionCard title="Endpoint">
          <CopyableField
            label="EST endpoint base URL"
            value={initial.estEndpointUrl}
            helper={
              <>
                Append <code className="font-mono">/simpleenroll</code>,{" "}
                <code className="font-mono">/simplereenroll</code>, or{" "}
                <code className="font-mono">/cacerts</code> depending on the operation.
              </>
            }
          />
        </SectionCard>
      ) : null}
      <SectionCard title="Authentication">
        <Controller
          control={control}
          name="passphrase"
          rules={{ required: !enabled, minLength: 8 }}
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>{enabled ? "New passphrase" : "Passphrase"}</FieldLabel>
              <FieldContent>
                <Input type="password" {...field} placeholder="••••••••" isError={Boolean(error)} />
              </FieldContent>
              <FieldDescription>
                {enabled
                  ? "Leave blank to keep the current passphrase."
                  : "Minimum 8 characters. EST clients authenticate with this passphrase."}
              </FieldDescription>
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
                <TextArea
                  {...field}
                  rows={4}
                  placeholder={
                    "-----BEGIN CERTIFICATE-----\nMIIDdzCCAl+gAwIBAgIUJrK4...\n-----END CERTIFICATE-----"
                  }
                  className="font-mono text-xs"
                />
              </FieldContent>
              <FieldDescription>PEM-encoded chain returned by the EST endpoint.</FieldDescription>
            </Field>
          )}
        />
      </SectionCard>
      <SectionCard title="Advanced options">
        <Controller
          control={control}
          name="disableBootstrapCaValidation"
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldContent>
                <Label>Disable bootstrap CA validation</Label>
                <FieldDescription>
                  Allow EST clients to skip server-certificate validation during enrollment.
                </FieldDescription>
              </FieldContent>
              <Switch
                variant="project"
                id="est-disable-bootstrap"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </Field>
          )}
        />
      </SectionCard>
      <div className="flex justify-end gap-2 pt-2">
        {!enabled && (
          <Button variant="outline" onClick={onCancelPending}>
            Cancel
          </Button>
        )}
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
  initial,
  onCancelPending,
  onDirtyChange
}: {
  applicationId: string;
  profileId: string;
  enabled: boolean;
  onCancelPending: () => void;
  onDirtyChange: (isDirty: boolean) => void;
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
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { isDirty }
  } = useForm<AcmeForm>({
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

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

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
      reset(values);
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
    if (credentials) {
      setCredentials(null);
      return;
    }
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
    <div className="space-y-5">
      {enabled && initial?.directoryUrl ? (
        <SectionCard title="Endpoint">
          <CopyableField
            label="ACME directory URL"
            value={initial.directoryUrl}
            helper="Point your ACME client at this URL to register an account."
          />
        </SectionCard>
      ) : null}
      {enabled && (
        <SectionCard
          title="EAB credentials"
          actions={
            <>
              <Button
                variant="outline"
                size="xs"
                onClick={onReveal}
                isPending={revealMutation.isPending}
              >
                {credentials ? <EyeOffIcon /> : <EyeIcon />}
                {credentials ? "Hide" : "Reveal"}
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={onRotate}
                isPending={rotateMutation.isPending}
              >
                <RotateCwIcon />
                Rotate
              </Button>
            </>
          }
        >
          {credentials ? (
            <>
              <CopyableField label="EAB KID" value={credentials.eabKid} />
              <CopyableField
                label="EAB Secret"
                value={credentials.eabSecret}
                helper="External Account Binding key + secret used by ACME clients to register against this profile."
              />
            </>
          ) : (
            <p className="text-xs text-accent">
              EAB credentials are hidden by default. Reveal them to copy into your ACME client.
            </p>
          )}
        </SectionCard>
      )}
      <SectionCard title="Advanced options">
        <Controller
          control={control}
          name="skipDnsOwnershipVerification"
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldContent>
                <Label>Skip DNS ownership verification</Label>
                <FieldDescription>
                  Skip DNS-01 / HTTP-01 challenge enforcement during enrollment.
                </FieldDescription>
              </FieldContent>
              {skipEab ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* span wrapper lets the tooltip listen for hover on a disabled control */}
                    <span className="inline-flex">
                      <Switch
                        variant="project"
                        id="acme-skip-dns"
                        checked={field.value}
                        onCheckedChange={(v) => {
                          field.onChange(v);
                          if (v) setValue("skipEabBinding", false);
                        }}
                        disabled
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    You can only enable one of these at a time. Disable “Skip EAB binding” first.
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Switch
                  variant="project"
                  id="acme-skip-dns"
                  checked={field.value}
                  onCheckedChange={(v) => {
                    field.onChange(v);
                    if (v) setValue("skipEabBinding", false);
                  }}
                />
              )}
            </Field>
          )}
        />
        <Controller
          control={control}
          name="skipEabBinding"
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldContent>
                <Label>Skip EAB binding</Label>
                <FieldDescription>
                  Allow ACME accounts to register without providing an EAB key.
                </FieldDescription>
              </FieldContent>
              {skipDns ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Switch
                        variant="project"
                        id="acme-skip-eab"
                        checked={field.value}
                        onCheckedChange={(v) => {
                          field.onChange(v);
                          if (v) setValue("skipDnsOwnershipVerification", false);
                        }}
                        disabled
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    You can only enable one of these at a time. Disable “Skip DNS ownership
                    verification” first.
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Switch
                  variant="project"
                  id="acme-skip-eab"
                  checked={field.value}
                  onCheckedChange={(v) => {
                    field.onChange(v);
                    if (v) setValue("skipDnsOwnershipVerification", false);
                  }}
                />
              )}
            </Field>
          )}
        />
      </SectionCard>
      <div className="flex justify-end gap-2 pt-2">
        {!enabled && (
          <Button variant="outline" onClick={onCancelPending}>
            Cancel
          </Button>
        )}
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
  initial,
  onCancelPending,
  onDirtyChange
}: {
  applicationId: string;
  profileId: string;
  profileSlug: string;
  enabled: boolean;
  onCancelPending: () => void;
  onDirtyChange: (isDirty: boolean) => void;
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
  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isDirty }
  } = useForm<{
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

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const onSave = handleSubmit(async (values) => {
    try {
      await setMutation.mutateAsync({ applicationId, profileId, ...values });
      reset({ ...values, challengePassword: "" });
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
    <div className="space-y-5">
      {enabled && initial ? (
        <SectionCard title="Endpoint">
          <CopyableField
            label="SCEP endpoint URL"
            value={initial.scepEndpointUrl}
            helper="Configure your MDM or SCEP client to point at this URL."
          />
          {initial.challengeType === "dynamic" && initial.challengeEndpointUrl ? (
            <CopyableField
              label="Challenge endpoint URL"
              value={initial.challengeEndpointUrl}
              helper="Authenticated POST endpoint to mint a one-time challenge (e.g. the JAMF SCEPChallenge webhook)."
            />
          ) : null}
        </SectionCard>
      ) : null}
      {enabled && initial?.raCertificatePem ? (
        <SectionCard
          title="RA certificate"
          actions={
            <Button
              variant="outline"
              size="xs"
              onClick={() =>
                downloadFile(
                  initial.raCertificatePem,
                  `${profileSlug}-ra-cert.pem`,
                  "application/x-pem-file"
                )
              }
            >
              <FontAwesomeIcon icon={faDownload} />
              Download PEM
            </Button>
          }
        >
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-foreground/[0.04] text-accent">
              <FileTextIcon />
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-sm text-foreground">{profileSlug}-ra-cert.pem</span>
              <span className="text-xs text-accent">
                Expires {raCertExpiresAtLabel ?? "Unknown"}
              </span>
            </div>
          </div>
        </SectionCard>
      ) : null}
      <SectionCard title="Challenge">
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
              <FieldDescription>
                {field.value === "static"
                  ? "All clients present the same shared challenge password."
                  : "Each client requests a fresh, one-time challenge before enrolling."}
              </FieldDescription>
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
                <FieldLabel>{enabled ? "New challenge password" : "Challenge password"}</FieldLabel>
                <FieldContent>
                  <Input
                    type="password"
                    {...field}
                    placeholder="••••••••"
                    isError={Boolean(error)}
                  />
                </FieldContent>
                <FieldDescription>
                  {enabled
                    ? "Leave blank to keep the current challenge password."
                    : "Shared password presented by every SCEP client during enrollment."}
                </FieldDescription>
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
                      inputMode="numeric"
                      value={field.value ?? ""}
                      onChange={handleOptionalIntChange(field.onChange)}
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
                      inputMode="numeric"
                      value={field.value ?? ""}
                      onChange={handleOptionalIntChange(field.onChange)}
                    />
                  </FieldContent>
                </Field>
              )}
            />
          </div>
        )}
      </SectionCard>
      <SectionCard title="Advanced options">
        <Controller
          control={control}
          name="includeCaCertInResponse"
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldContent>
                <Label>Include CA cert in response</Label>
                <FieldDescription>
                  Return the issuing CA certificate inline alongside the issued cert.
                </FieldDescription>
              </FieldContent>
              <Switch
                variant="project"
                id="scep-include-ca"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="allowCertBasedRenewal"
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldContent>
                <Label>Allow cert-based renewal</Label>
                <FieldDescription>
                  Let clients renew using their existing certificate as authentication.
                </FieldDescription>
              </FieldContent>
              <Switch
                variant="project"
                id="scep-cert-renewal"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </Field>
          )}
        />
      </SectionCard>
      <div className="flex justify-end gap-2 pt-2">
        {!enabled && (
          <Button variant="outline" onClick={onCancelPending}>
            Cancel
          </Button>
        )}
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

export type EnrollmentMethod = "api" | "est" | "acme" | "scep";

export const METHOD_LABELS: Record<EnrollmentMethod, string> = {
  api: "API",
  est: "EST",
  acme: "ACME",
  scep: "SCEP"
};

const METHOD_DOCS: Record<EnrollmentMethod, string> = {
  api: PkiDocsUrls.applications.enrollment.api,
  est: PkiDocsUrls.applications.enrollment.est,
  acme: PkiDocsUrls.applications.enrollment.acme,
  scep: PkiDocsUrls.applications.enrollment.scep
};

const MethodDescription = ({ method }: { method: EnrollmentMethod }) => {
  const docLink = (
    <a
      href={METHOD_DOCS[method]}
      target="_blank"
      rel="noopener noreferrer"
      className="underline hover:text-foreground"
    >
      {METHOD_LABELS[method]}
    </a>
  );

  switch (method) {
    case "api":
      return <>Issue certificates manually via the UI or programmatically through the {docLink}.</>;
    case "est":
      return <>Enroll enterprise devices and IoT using the {docLink} protocol.</>;
    case "acme":
      return <>Automate certificate lifecycle with {docLink} clients like Certbot or Caddy.</>;
    case "scep":
      return (
        <>
          Provision device certificates through MDM platforms like Jamf or Intune using {docLink}.
        </>
      );
    default:
      return null;
  }
};

export const ConfigureEnrollmentModal = ({
  isOpen,
  onOpenChange,
  applicationId,
  profile,
  initialMethod
}: Props) => {
  const profileId = profile?.profileId ?? "";
  const { data, isLoading } = useGetPkiApplicationEnrollment(applicationId, profileId);

  const configuredMethods: EnrollmentMethod[] = [];
  if (data?.api) configuredMethods.push("api");
  if (data?.estConfigured) configuredMethods.push("est");
  if (data?.acmeConfigured) configuredMethods.push("acme");
  if (data?.scepConfigured) configuredMethods.push("scep");

  const [pendingMethods, setPendingMethods] = useState<EnrollmentMethod[]>([]);
  const [activeTab, setActiveTab] = useState<EnrollmentMethod | "">("");
  const [isDiscardOpen, setIsDiscardOpen] = useState(false);
  const [dirtyMethods, setDirtyMethods] = useState<Partial<Record<EnrollmentMethod, boolean>>>({});

  const ALL_ORDER: EnrollmentMethod[] = ["api", "est", "acme", "scep"];
  const visibleMethods = ALL_ORDER.filter(
    (m) => configuredMethods.includes(m) || pendingMethods.includes(m)
  );
  const addableMethods = ALL_ORDER.filter(
    (m) => !configuredMethods.includes(m) && !pendingMethods.includes(m)
  );

  useEffect(() => {
    if (!isOpen) {
      setPendingMethods([]);
      setActiveTab("");
      setIsDiscardOpen(false);
      setDirtyMethods({});
    }
  }, [isOpen, profileId]);

  useEffect(() => {
    if (visibleMethods.length === 0) {
      setActiveTab("");
      return;
    }
    if (!activeTab || !visibleMethods.includes(activeTab as EnrollmentMethod)) {
      setActiveTab(
        initialMethod && visibleMethods.includes(initialMethod) ? initialMethod : visibleMethods[0]
      );
    }
  }, [visibleMethods, activeTab, initialMethod]);

  useEffect(() => {
    setPendingMethods((prev) => prev.filter((m) => !configuredMethods.includes(m)));
  }, [data]);

  const handleAdd = (method: EnrollmentMethod) => {
    setPendingMethods((prev) => (prev.includes(method) ? prev : [...prev, method]));
    setActiveTab(method);
  };

  const handleCancelPending = (method: EnrollmentMethod) =>
    setPendingMethods((prev) => prev.filter((m) => m !== method));

  const handleDirtyChange = useCallback(
    (method: EnrollmentMethod, isDirty: boolean) =>
      setDirtyMethods((prev) =>
        Boolean(prev[method]) === isDirty ? prev : { ...prev, [method]: isDirty }
      ),
    []
  );

  const hasUnsavedWork = pendingMethods.length > 0 || Object.values(dirtyMethods).some(Boolean);

  const isUnsaved = (method: EnrollmentMethod) =>
    pendingMethods.includes(method) || Boolean(dirtyMethods[method]);

  const handleOpenChange = (open: boolean) => {
    if (!open && hasUnsavedWork) {
      setIsDiscardOpen(true);
      return;
    }
    onOpenChange(open);
  };

  const handleDiscard = () => {
    setPendingMethods([]);
    setDirtyMethods({});
    setIsDiscardOpen(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] thin-scrollbar max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure enrollment methods for {profile?.profileSlug}</DialogTitle>
          <DialogDescription>
            Enable an enrollment method to allow clients to request certificates using this profile.{" "}
            <a
              href={PkiDocsUrls.applications.enrollment.overview}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Learn more
            </a>
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
                        {isUnsaved(m) && (
                          <span className="ml-1.5 text-xs text-muted">(unsaved)</span>
                        )}
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
                          <span className="text-xs text-accent">
                            <MethodDescription method={m} />
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
                    <span className="font-medium">Add enrollment method</span> above to let clients
                    request certificates from this profile.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                {activeTab && (
                  <p className="text-sm text-accent">
                    <MethodDescription method={activeTab as EnrollmentMethod} />
                  </p>
                )}
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EnrollmentMethod)}>
                  {visibleMethods.includes("api") ? (
                    <TabPanel value="api" className="pb-0 data-[state=inactive]:hidden" forceMount>
                      <ApiPanel
                        applicationId={applicationId}
                        profileId={profileId}
                        enabled={Boolean(data?.api)}
                        initial={data?.api ?? null}
                        onCancelPending={() => handleCancelPending("api")}
                        onDirtyChange={(d) => handleDirtyChange("api", d)}
                      />
                    </TabPanel>
                  ) : null}
                  {visibleMethods.includes("est") ? (
                    <TabPanel value="est" className="pb-0 data-[state=inactive]:hidden" forceMount>
                      <EstPanel
                        applicationId={applicationId}
                        profileId={profileId}
                        enabled={Boolean(data?.estConfigured)}
                        initial={data?.est ?? null}
                        onCancelPending={() => handleCancelPending("est")}
                        onDirtyChange={(d) => handleDirtyChange("est", d)}
                      />
                    </TabPanel>
                  ) : null}
                  {visibleMethods.includes("acme") ? (
                    <TabPanel value="acme" className="pb-0 data-[state=inactive]:hidden" forceMount>
                      <AcmePanel
                        applicationId={applicationId}
                        profileId={profileId}
                        enabled={Boolean(data?.acmeConfigured)}
                        initial={data?.acme ?? null}
                        onCancelPending={() => handleCancelPending("acme")}
                        onDirtyChange={(d) => handleDirtyChange("acme", d)}
                      />
                    </TabPanel>
                  ) : null}
                  {visibleMethods.includes("scep") ? (
                    <TabPanel value="scep" className="pb-0 data-[state=inactive]:hidden" forceMount>
                      <ScepPanel
                        applicationId={applicationId}
                        profileId={profileId}
                        profileSlug={profile?.profileSlug ?? ""}
                        enabled={Boolean(data?.scepConfigured)}
                        initial={data?.scep ?? null}
                        onCancelPending={() => handleCancelPending("scep")}
                        onDirtyChange={(d) => handleDirtyChange("scep", d)}
                      />
                    </TabPanel>
                  ) : null}
                </Tabs>
              </>
            )}
          </>
        )}
      </DialogContent>

      <AlertDialog open={isDiscardOpen} onOpenChange={setIsDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangleIcon className="text-warning" />
            </AlertDialogMedia>
            <AlertDialogTitle>Discard unsaved enrollment methods?</AlertDialogTitle>
            <AlertDialogDescription>
              Enrollment methods you added but have not enabled yet will be discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={handleDiscard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
