import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosError } from "axios";
import {
  AlertTriangleIcon,
  EyeIcon,
  EyeOffIcon,
  FileKeyIcon,
  FileTextIcon,
  Plus,
  RotateCwIcon,
  TriangleAlertIcon
} from "lucide-react";
import { z } from "zod";

import { useConnectionCreation } from "@app/components/app-connections/useConnectionCreation";
import {
  CertificateEnrollmentUpgradeIntent,
  useUpgradeGate
} from "@app/components/license/UpgradeGate";
import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  CodeBlock,
  Combobox,
  DiscardChangesAlertDialog,
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
  FileDropzone,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { downloadFile } from "@app/helpers/download";
import { isInfisicalCloud } from "@app/helpers/platform";
import { bytesToBase64 } from "@app/helpers/string";
import { useDebounce, useDiscardChangesGuard, useToggle } from "@app/hooks";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useLdapConnectionListGroups } from "@app/hooks/api/appConnections/ldap";
import { isScepRaCaSigningSupported } from "@app/hooks/api/ca/capabilities";
import { CaType } from "@app/hooks/api/ca/enums";
import { enrollmentTypeToNameMap } from "@app/hooks/api/certificates/constants";
import {
  useGetMicrosoftAutoenrollmentServicePrincipal,
  useGetPkiApplicationEnrollment
} from "@app/hooks/api/pkiApplications";
import {
  useClearPkiApplicationAcmeEnrollment,
  useClearPkiApplicationApiEnrollment,
  useClearPkiApplicationEstEnrollment,
  useClearPkiApplicationMicrosoftAutoenrollmentEnrollment,
  useReenrollPkiApplicationMicrosoftAutoenrollmentComputers,
  useClearPkiApplicationScepEnrollment,
  useRevealPkiApplicationAcmeEabSecret,
  useRotatePkiApplicationAcmeEabSecret,
  useSetPkiApplicationAcmeEnrollment,
  useSetPkiApplicationApiEnrollment,
  useSetPkiApplicationEstEnrollment,
  useSetPkiApplicationMicrosoftAutoenrollmentEnrollment,
  useSetPkiApplicationScepEnrollment
} from "@app/hooks/api/pkiApplications/mutations";
import {
  MicrosoftAutoenrollmentChannelBindingStatus,
  ScepChallengeType,
  TMicrosoftAutoenrollmentEnrollment,
  TMicrosoftAutoenrollmentGroup,
  TMicrosoftAutoenrollmentOtherProfile,
  TPkiApplicationProfile
} from "@app/hooks/api/pkiApplications/types";

import { PkiDocsUrls } from "../../pki-docs-urls";

const COPY_RESET_MS = 1000;

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  profile: TPkiApplicationProfile | null;
  initialMethod?: EnrollmentMethod;
};

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
  <Card className={className}>
    <CardHeader>
      <CardTitle role="heading" aria-level={3}>
        {title}
      </CardTitle>
      {actions ? <CardAction className="flex items-center gap-2">{actions}</CardAction> : null}
    </CardHeader>
    <CardContent className="space-y-4">{children}</CardContent>
  </Card>
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

const ConfirmActionButton = ({
  label,
  title,
  description,
  confirmLabel,
  confirmVariant,
  triggerSize,
  onConfirmed,
  isPending,
  isDisabled = false
}: {
  label: string;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  confirmVariant: "project" | "danger";
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  onConfirmed: () => Promise<void>;
  isPending: boolean;
  isDisabled?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const isActionPending = isPending || isConfirming;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={triggerSize}
        onClick={() => setIsOpen(true)}
        isDisabled={isActionPending || isDisabled}
      >
        {label}
      </Button>
      <AlertDialog open={isOpen} onOpenChange={setIsOpen} isPending={isActionPending}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangleIcon className="text-warning" />
            </AlertDialogMedia>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isActionPending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant={confirmVariant}
              isPending={isActionPending}
              isDisabled={isActionPending}
              onClick={async () => {
                if (isActionPending) return;
                setIsConfirming(true);
                try {
                  await onConfirmed();
                  setIsOpen(false);
                } catch {
                  // oxlint-disable-next-line no-useless-return
                  return;
                } finally {
                  setIsConfirming(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const DisableEnrollmentButton = ({
  method,
  consequence,
  onConfirmed,
  isPending
}: {
  method: "API" | "EST" | "ACME" | "SCEP" | "Microsoft Autoenrollment";
  consequence?: string;
  onConfirmed: () => Promise<void>;
  isPending: boolean;
}) => (
  <ConfirmActionButton
    label="Disable"
    title={`Disable ${method === "Microsoft Autoenrollment" ? method : `${method} enrollment`} for this profile?`}
    description={`Clients using ${method} against this profile via this application will stop being able to request certificates.${consequence ? ` ${consequence}` : ""}`}
    confirmLabel="Disable Enrollment"
    confirmVariant="danger"
    onConfirmed={onConfirmed}
    isPending={isPending}
  />
);

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
  onDirtyChange,
  onPendingChange
}: {
  applicationId: string;
  profileId: string;
  enabled: boolean;
  onCancelPending: () => void;
  onDirtyChange: (method: EnrollmentMethod, isDirty: boolean) => void;
  onPendingChange: (method: EnrollmentMethod, isPending: boolean) => void;
  initial: { autoRenew: boolean; renewBeforeDays: number | null } | null;
}) => {
  const setMutation = useSetPkiApplicationApiEnrollment();
  const clearMutation = useClearPkiApplicationApiEnrollment();
  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isDirty, isSubmitting }
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

  const isPending = setMutation.isPending || clearMutation.isPending || isSubmitting;
  useEffect(() => {
    onDirtyChange("api", isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => {
    onPendingChange("api", isPending);
  }, [isPending, onPendingChange]);
  useEffect(
    () => () => {
      onDirtyChange("api", false);
      onPendingChange("api", false);
    },
    [onDirtyChange, onPendingChange]
  );

  const onSave = handleSubmit(async (values) => {
    if (setMutation.isPending || clearMutation.isPending) return;
    await setMutation.mutateAsync({
      applicationId,
      profileId,
      autoRenew: values.autoRenew,
      renewBeforeDays: values.autoRenew ? (values.renewBeforeDays ?? undefined) : undefined
    });
    reset(values);
    createNotification({ type: "success", text: "API enrollment saved" });
  });

  const onDisable = async () => {
    await clearMutation.mutateAsync({ applicationId, profileId });

    createNotification({ type: "success", text: "API enrollment disabled" });
  };

  const apiEndpointUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/v1/cert-manager/certificates`
      : "/api/v1/cert-manager/certificates";

  return (
    <form className="contents" onSubmit={(event) => onSave(event).catch(() => undefined)}>
      <fieldset
        disabled={isPending}
        className="min-h-0 thin-scrollbar flex-1 space-y-5 overflow-y-auto p-4"
      >
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
                  className="font-medium text-project"
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
                <Toggle
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
                      ref={field.ref}
                      name={field.name}
                      onBlur={field.onBlur}
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
                  <FieldDescription>
                    How many days before expiry to trigger renewal.
                  </FieldDescription>
                </Field>
              )}
            />
          )}
        </SectionCard>
      </fieldset>
      <SheetFooter className="justify-end border-t">
        {enabled && (
          <DisableEnrollmentButton method="API" onConfirmed={onDisable} isPending={isPending} />
        )}
        <Button type="button" variant="ghost" onClick={onCancelPending} isDisabled={isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="project"
          isPending={setMutation.isPending || isSubmitting}
          isDisabled={isPending}
        >
          {enabled ? "Save" : "Enable"}
        </Button>
      </SheetFooter>
    </form>
  );
};

type EstForm = { passphrase: string; disableBootstrapCaValidation: boolean; caChain?: string };

const EstPanel = ({
  applicationId,
  profileId,
  enabled,
  initial,
  onCancelPending,
  onDirtyChange,
  onPendingChange
}: {
  applicationId: string;
  profileId: string;
  enabled: boolean;
  onCancelPending: () => void;
  onDirtyChange: (method: EnrollmentMethod, isDirty: boolean) => void;
  onPendingChange: (method: EnrollmentMethod, isPending: boolean) => void;
  initial: { disableBootstrapCaValidation: boolean; estEndpointUrl: string } | null;
}) => {
  const setMutation = useSetPkiApplicationEstEnrollment();
  const clearMutation = useClearPkiApplicationEstEnrollment();
  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty, isSubmitting }
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

  const isPending = setMutation.isPending || clearMutation.isPending || isSubmitting;
  useEffect(() => {
    onDirtyChange("est", isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => {
    onPendingChange("est", isPending);
  }, [isPending, onPendingChange]);
  useEffect(
    () => () => {
      onDirtyChange("est", false);
      onPendingChange("est", false);
    },
    [onDirtyChange, onPendingChange]
  );

  const onSave = handleSubmit(async (values) => {
    if (setMutation.isPending || clearMutation.isPending) return;
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
  });

  const onDisable = async () => {
    await clearMutation.mutateAsync({ applicationId, profileId });

    createNotification({ type: "success", text: "EST enrollment disabled" });
  };

  return (
    <form className="contents" onSubmit={(event) => onSave(event).catch(() => undefined)}>
      <fieldset
        disabled={isPending}
        className="min-h-0 thin-scrollbar flex-1 space-y-5 overflow-y-auto p-4"
      >
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
                  <Input
                    type="password"
                    {...field}
                    placeholder="••••••••"
                    isError={Boolean(error)}
                  />
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
                <Toggle
                  variant="project"
                  id="est-disable-bootstrap"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </Field>
            )}
          />
        </SectionCard>
      </fieldset>
      <SheetFooter className="justify-end border-t">
        {enabled && (
          <DisableEnrollmentButton method="EST" onConfirmed={onDisable} isPending={isPending} />
        )}
        <Button type="button" variant="ghost" onClick={onCancelPending} isDisabled={isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="project"
          isPending={setMutation.isPending || isSubmitting}
          isDisabled={isPending}
        >
          {enabled ? "Save" : "Enable"}
        </Button>
      </SheetFooter>
    </form>
  );
};

type AcmeForm = { skipDnsOwnershipVerification: boolean; skipEabBinding: boolean };

const AcmePanel = ({
  applicationId,
  profileId,
  enabled,
  initial,
  onCancelPending,
  onDirtyChange,
  onPendingChange
}: {
  applicationId: string;
  profileId: string;
  enabled: boolean;
  onCancelPending: () => void;
  onDirtyChange: (method: EnrollmentMethod, isDirty: boolean) => void;
  onPendingChange: (method: EnrollmentMethod, isPending: boolean) => void;
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
    formState: { isDirty, isSubmitting }
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

  const isPending =
    setMutation.isPending ||
    clearMutation.isPending ||
    isSubmitting ||
    revealMutation.isPending ||
    rotateMutation.isPending;
  useEffect(() => {
    onDirtyChange("acme", isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => {
    onPendingChange("acme", isPending);
  }, [isPending, onPendingChange]);
  useEffect(
    () => () => {
      onDirtyChange("acme", false);
      onPendingChange("acme", false);
    },
    [onDirtyChange, onPendingChange]
  );

  const onSave = handleSubmit(async (values) => {
    if (
      setMutation.isPending ||
      clearMutation.isPending ||
      revealMutation.isPending ||
      rotateMutation.isPending
    )
      return;
    if (values.skipDnsOwnershipVerification && values.skipEabBinding) {
      createNotification({
        type: "error",
        text: "Pick at most one of: skip DNS ownership verification, skip EAB binding."
      });
      return;
    }
    await setMutation.mutateAsync({ applicationId, profileId, ...values });
    reset(values);
    createNotification({ type: "success", text: "ACME enrollment saved" });
  });

  const onDisable = async () => {
    await clearMutation.mutateAsync({ applicationId, profileId });
    setCredentials(null);
    createNotification({ type: "success", text: "ACME enrollment disabled" });
  };

  const onReveal = async () => {
    if (credentials) {
      setCredentials(null);
      return;
    }
    const data = await revealMutation.mutateAsync({ applicationId, profileId });
    setCredentials({ eabKid: data.eabKid, eabSecret: data.eabSecret });
  };

  const onRotate = async () => {
    await rotateMutation.mutateAsync({ applicationId, profileId });
    const data = await revealMutation.mutateAsync({ applicationId, profileId });
    setCredentials({ eabKid: data.eabKid, eabSecret: data.eabSecret });
    createNotification({ type: "success", text: "ACME EAB secret rotated" });
  };

  return (
    <form className="contents" onSubmit={(event) => onSave(event).catch(() => undefined)}>
      <fieldset
        disabled={isPending}
        className="min-h-0 thin-scrollbar flex-1 space-y-5 overflow-y-auto p-4"
      >
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
                  onClick={() => onReveal().catch(() => undefined)}
                  isPending={revealMutation.isPending}
                >
                  {credentials ? <EyeOffIcon /> : <EyeIcon />}
                  {credentials ? "Hide" : "Reveal"}
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => onRotate().catch(() => undefined)}
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
                        <Toggle
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
                  <Toggle
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
                        <Toggle
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
                  <Toggle
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
      </fieldset>
      <SheetFooter className="justify-end border-t">
        {enabled && (
          <DisableEnrollmentButton method="ACME" onConfirmed={onDisable} isPending={isPending} />
        )}
        <Button type="button" variant="ghost" onClick={onCancelPending} isDisabled={isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="project"
          isPending={setMutation.isPending || isSubmitting}
          isDisabled={isPending}
        >
          {enabled ? "Save" : "Enable"}
        </Button>
      </SheetFooter>
    </form>
  );
};

const ScepPanel = ({
  applicationId,
  profileId,
  profileSlug,
  enabled,
  caType,
  initial,
  onCancelPending,
  onDirtyChange,
  onPendingChange
}: {
  applicationId: string;
  profileId: string;
  profileSlug: string;
  enabled: boolean;
  caType: CaType;
  onCancelPending: () => void;
  onDirtyChange: (method: EnrollmentMethod, isDirty: boolean) => void;
  onPendingChange: (method: EnrollmentMethod, isPending: boolean) => void;
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
    validationConnectionId: string | null;
    signRaWithCa: boolean;
  } | null;
}) => {
  const { currentProject } = useProject();
  const setMutation = useSetPkiApplicationScepEnrollment();
  const clearMutation = useClearPkiApplicationScepEnrollment();
  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { isDirty, isSubmitting }
  } = useForm<{
    challengeType: ScepChallengeType;
    challengePassword?: string;
    includeCaCertInResponse: boolean;
    allowCertBasedRenewal: boolean;
    dynamicChallengeExpiryMinutes?: number;
    dynamicChallengeMaxPending?: number;
    validationConnectionId?: string;
    signRaWithCa: boolean;
  }>({
    defaultValues: {
      challengeType: initial?.challengeType ?? ScepChallengeType.STATIC,
      challengePassword: "",
      includeCaCertInResponse: initial?.includeCaCertInResponse ?? true,
      allowCertBasedRenewal: initial?.allowCertBasedRenewal ?? true,
      dynamicChallengeExpiryMinutes: initial?.dynamicChallengeExpiryMinutes ?? 60,
      dynamicChallengeMaxPending: initial?.dynamicChallengeMaxPending ?? 100,
      validationConnectionId: initial?.validationConnectionId ?? undefined,
      signRaWithCa: initial?.signRaWithCa ?? false
    }
  });

  useEffect(() => {
    reset({
      challengeType: initial?.challengeType ?? ScepChallengeType.STATIC,
      challengePassword: "",
      includeCaCertInResponse: initial?.includeCaCertInResponse ?? true,
      allowCertBasedRenewal: initial?.allowCertBasedRenewal ?? true,
      dynamicChallengeExpiryMinutes: initial?.dynamicChallengeExpiryMinutes ?? 60,
      dynamicChallengeMaxPending: initial?.dynamicChallengeMaxPending ?? 100,
      validationConnectionId: initial?.validationConnectionId ?? undefined,
      signRaWithCa: initial?.signRaWithCa ?? false
    });
  }, [
    initial?.challengeType,
    initial?.includeCaCertInResponse,
    initial?.allowCertBasedRenewal,
    initial?.dynamicChallengeExpiryMinutes,
    initial?.dynamicChallengeMaxPending,
    initial?.validationConnectionId,
    initial?.signRaWithCa,
    reset
  ]);

  const challengeType = watch("challengeType");
  const isIntune = challengeType === ScepChallengeType.MICROSOFT_INTUNE;
  const isScepConfigured = Boolean(initial);
  const raCaSigningSupported = isScepRaCaSigningSupported(caType);

  const { permission } = useProjectPermission();
  const canCreateConnection = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );
  const connectionCreation = useConnectionCreation(AppConnection.MicrosoftIntune, (connection) =>
    setValue("validationConnectionId", connection.id, { shouldDirty: true, shouldValidate: true })
  );

  useEffect(() => {
    if (isIntune && !isScepConfigured && raCaSigningSupported) setValue("signRaWithCa", true);
  }, [isIntune, isScepConfigured, raCaSigningSupported, setValue]);

  const { data: intuneConnections, isPending: isIntuneConnectionsLoading } =
    useListAvailableAppConnections(AppConnection.MicrosoftIntune, currentProject.id, {
      enabled: isIntune
    });

  const isPending = setMutation.isPending || clearMutation.isPending || isSubmitting;
  useEffect(() => {
    onDirtyChange("scep", isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => {
    onPendingChange("scep", isPending);
  }, [isPending, onPendingChange]);
  useEffect(
    () => () => {
      onDirtyChange("scep", false);
      onPendingChange("scep", false);
    },
    [onDirtyChange, onPendingChange]
  );

  const onSave = handleSubmit(async (values) => {
    if (setMutation.isPending || clearMutation.isPending) return;
    const signRaWithCa = raCaSigningSupported && values.signRaWithCa;
    const payload = isIntune
      ? {
          applicationId,
          profileId,
          challengeType: values.challengeType,
          includeCaCertInResponse: values.includeCaCertInResponse,
          // Cert-based renewal would bypass Intune's per-request validation, so it is always off.
          allowCertBasedRenewal: false,
          signRaWithCa,
          validationConnectionId: values.validationConnectionId
        }
      : { applicationId, profileId, ...values, signRaWithCa, validationConnectionId: undefined };
    await setMutation.mutateAsync(payload);
    reset({ ...values, challengePassword: "" });
    createNotification({ type: "success", text: "SCEP enrollment saved" });
  });

  const onDisable = async () => {
    await clearMutation.mutateAsync({ applicationId, profileId });
    createNotification({ type: "success", text: "SCEP enrollment disabled" });
  };

  const raCertExpiresAtLabel = initial?.raCertExpiresAt
    ? new Date(initial.raCertExpiresAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      })
    : null;

  return (
    <form className="contents" onSubmit={(event) => onSave(event).catch(() => undefined)}>
      <fieldset
        disabled={isPending}
        className="min-h-0 thin-scrollbar flex-1 space-y-5 overflow-y-auto p-4"
      >
        {enabled && initial ? (
          <SectionCard title="Endpoint">
            <CopyableField
              label="SCEP endpoint URL"
              value={initial.scepEndpointUrl}
              helper="Configure your MDM or SCEP client to point at this URL. For Windows devices, remove /pkiclient.exe from the end."
            />
            {initial.challengeType === ScepChallengeType.DYNAMIC && initial.challengeEndpointUrl ? (
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
                      <SelectItem value={ScepChallengeType.STATIC}>Static password</SelectItem>
                      <SelectItem value={ScepChallengeType.DYNAMIC}>
                        Dynamic (per-client)
                      </SelectItem>
                      <SelectItem value={ScepChallengeType.MICROSOFT_INTUNE}>
                        Microsoft Intune
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
                <FieldDescription>
                  {(() => {
                    if (field.value === ScepChallengeType.STATIC)
                      return "All clients present the same shared challenge password.";
                    if (field.value === ScepChallengeType.DYNAMIC)
                      return "Each client requests a fresh, one-time challenge before enrolling.";
                    return "Requests are validated with Microsoft Intune, which seals its own challenge into each device request.";
                  })()}
                </FieldDescription>
              </Field>
            )}
          />
          {isIntune && (
            <Controller
              control={control}
              name="validationConnectionId"
              rules={{ required: true }}
              render={({
                field: { value, onChange, onBlur, name, ref },
                fieldState: { error }
              }) => {
                const selected = intuneConnections?.find((c) => c.id === value) ?? null;
                return (
                  <Field>
                    <FieldLabel htmlFor="scep-intune-connection">
                      Microsoft Intune connection
                    </FieldLabel>
                    <FieldContent>
                      <Combobox
                        ref={ref}
                        id="scep-intune-connection"
                        name={name}
                        onBlur={onBlur}
                        isDisabled={isPending}
                        value={selected}
                        isError={Boolean(error)}
                        isLoading={isIntuneConnectionsLoading}
                        onValueChange={(newValue) => {
                          onChange(newValue?.id ?? undefined);
                        }}
                        options={intuneConnections ?? []}
                        placeholder="Select connection..."
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                        creation={connectionCreation}
                      />
                    </FieldContent>
                    <FieldDescription>
                      Selecting the connection is all that is required. The transaction and
                      certificate request arrive in the device request, and the expected subject and
                      SAN are validated by Intune. See the{" "}
                      <a
                        href={PkiDocsUrls.appConnections.microsoftIntune}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-project hover:text-project"
                      >
                        setup guide
                      </a>{" "}
                      for what to configure on the Intune side.
                    </FieldDescription>
                    {!isIntuneConnectionsLoading &&
                    !intuneConnections?.length &&
                    !canCreateConnection ? (
                      <FieldDescription className="text-warning">
                        You do not have access to any Microsoft Intune Connections. Contact an admin
                        to create one.
                      </FieldDescription>
                    ) : null}
                    {error ? (
                      <FieldError>A Microsoft Intune connection is required.</FieldError>
                    ) : null}
                  </Field>
                );
              }}
            />
          )}
          {challengeType === ScepChallengeType.STATIC && (
            <Controller
              control={control}
              name="challengePassword"
              rules={{ required: !enabled }}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>
                    {enabled ? "New challenge password" : "Challenge password"}
                  </FieldLabel>
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
          {challengeType === ScepChallengeType.DYNAMIC && (
            <div className="grid grid-cols-2 gap-4">
              <Controller
                control={control}
                name="dynamicChallengeExpiryMinutes"
                render={({ field }) => (
                  <Field>
                    <FieldLabel>Challenge expiry (minutes)</FieldLabel>
                    <FieldContent>
                      <Input
                        ref={field.ref}
                        name={field.name}
                        onBlur={field.onBlur}
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
                        ref={field.ref}
                        name={field.name}
                        onBlur={field.onBlur}
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
            name="signRaWithCa"
            render={({ field }) => (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <FieldLabel>Sign RA certificate with the CA</FieldLabel>
                  <p className="text-xs text-accent">
                    Issue the SCEP RA certificate from this profile&apos;s CA so clients can build a
                    chain to a CA they already trust. Required by strict clients such as Apple and
                    Microsoft Intune, which reject a self-signed RA. Only available for internal
                    certificate authorities.
                  </p>
                </div>
                {raCaSigningSupported && !isScepConfigured ? (
                  <Toggle
                    variant="project"
                    id="scep-sign-ra-with-ca"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Toggle
                          variant="project"
                          id="scep-sign-ra-with-ca"
                          checked={raCaSigningSupported && field.value}
                          disabled
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {raCaSigningSupported
                        ? "Cannot be changed once SCEP enrollment is set up. Disable SCEP enrollment and set it up again to change it."
                        : `Not supported for ${caType} certificate authorities.`}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          />
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
                <Toggle
                  variant="project"
                  id="scep-include-ca"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </Field>
            )}
          />
          {!isIntune && (
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
                  <Toggle
                    variant="project"
                    id="scep-cert-renewal"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </Field>
              )}
            />
          )}
        </SectionCard>
      </fieldset>
      <SheetFooter className="justify-end border-t">
        {enabled && (
          <DisableEnrollmentButton method="SCEP" onConfirmed={onDisable} isPending={isPending} />
        )}
        <Button type="button" variant="ghost" onClick={onCancelPending} isDisabled={isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="project"
          isPending={setMutation.isPending || isSubmitting}
          isDisabled={isPending}
        >
          {enabled ? "Save" : "Enable"}
        </Button>
      </SheetFooter>
    </form>
  );
};

const DEFAULT_RENEW_BEFORE_DAYS = 42;
const MAX_RENEW_BEFORE_DAYS = 3650;
const MAX_ALLOWED_GROUPS = 50;
const MAX_GROUP_SEARCH_LENGTH = 64;
const MAX_GROUP_RESULTS = 50;
const MAX_KEYTAB_BYTES = 64 * 1024;
const KEYTAB_FILE_NAME = "infisical.keytab";

const createMicrosoftAutoenrollmentFormSchema = (
  isKeytabRequired: boolean,
  isReuseCandidateOffered: boolean
) =>
  z
    .object({
      connectionId: z.string().nullable(),
      allowedGroups: z.array(z.custom<TMicrosoftAutoenrollmentGroup>()),
      renewBeforeDays: z.number().nullable(),
      keytabFile: z.instanceof(File).nullable(),
      reuseFrom: z.custom<TMicrosoftAutoenrollmentOtherProfile>().nullable(),
      allowAnyChannelBinding: z.boolean()
    })
    .superRefine((values, ctx) => {
      if (values.keytabFile && values.keytabFile.size === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["keytabFile"],
          message: "The keytab file is empty."
        });
      }
      if (values.keytabFile && values.keytabFile.size > MAX_KEYTAB_BYTES) {
        ctx.addIssue({
          code: "custom",
          path: ["keytabFile"],
          message: "The keytab must be 64 KB or smaller."
        });
      }
      if (isKeytabRequired && !values.keytabFile && !values.reuseFrom) {
        ctx.addIssue({
          code: "custom",
          path: ["keytabFile"],
          message: isReuseCandidateOffered
            ? "Upload a keytab, or select Use This Keytab."
            : "Upload the keytab the command created."
        });
      }
      if (!values.connectionId) {
        ctx.addIssue({
          code: "custom",
          path: ["connectionId"],
          message: "Select an LDAP connection."
        });
      }
      if (values.allowedGroups.length > MAX_ALLOWED_GROUPS) {
        ctx.addIssue({
          code: "custom",
          path: ["allowedGroups"],
          message: `Select at most ${MAX_ALLOWED_GROUPS} groups.`
        });
      }
      if (
        values.renewBeforeDays === null ||
        !Number.isInteger(values.renewBeforeDays) ||
        values.renewBeforeDays < 1 ||
        values.renewBeforeDays > MAX_RENEW_BEFORE_DAYS
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["renewBeforeDays"],
          message: `Must be between 1 and ${MAX_RENEW_BEFORE_DAYS}`
        });
      }
    });

type MicrosoftAutoenrollmentForm = z.infer<
  ReturnType<typeof createMicrosoftAutoenrollmentFormSchema>
>;

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

const formatRenewalPeriod = (seconds: number) => {
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const parts = [
    days ? `${days} ${days === 1 ? "day" : "days"}` : null,
    hours ? `${hours} ${hours === 1 ? "hour" : "hours"}` : null
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : "less than an hour";
};

const MIN_WINDOWS_RENEWAL_PERIOD_SECONDS = 8 * SECONDS_PER_HOUR;

const getRenewalPeriodNote = (initial: TMicrosoftAutoenrollmentEnrollment | null) => {
  const seconds = initial?.effectiveRenewBeforeSeconds;
  if (seconds == null || !initial) return null;
  if (seconds <= MIN_WINDOWS_RENEWAL_PERIOD_SECONDS) {
    return " Windows never renews certificates this short-lived, so computers request a new one instead.";
  }
  if (seconds === initial.renewBeforeDays * SECONDS_PER_DAY) return null;
  return ` For this profile, Windows renews ${formatRenewalPeriod(seconds)} before expiry.`;
};

const getMicrosoftAutoenrollmentFormValues = (
  initial: TMicrosoftAutoenrollmentEnrollment | null
): MicrosoftAutoenrollmentForm => ({
  connectionId: initial?.connectionId ?? null,
  allowedGroups: initial?.allowedGroups ?? [],
  renewBeforeDays: initial?.renewBeforeDays ?? DEFAULT_RENEW_BEFORE_DAYS,
  keytabFile: null,
  reuseFrom: null,
  allowAnyChannelBinding: initial?.allowAnyChannelBinding ?? false
});

const KeytabFileRow = ({ details, action }: { details: string; action?: React.ReactNode }) => (
  <div className="flex items-center gap-3">
    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-foreground/[0.04] text-accent">
      <FileKeyIcon />
    </div>
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="font-mono text-sm text-foreground">{KEYTAB_FILE_NAME}</span>
      <span className="text-xs break-all text-accent">{details}</span>
    </div>
    {action}
  </div>
);

const MicrosoftAutoenrollmentPanel = ({
  applicationId,
  profileId,
  enabled,
  initial,
  otherProfiles,
  onUpgradeRequired,
  onCancelPending,
  onDirtyChange,
  onPendingChange
}: {
  applicationId: string;
  profileId: string;
  enabled: boolean;
  initial: TMicrosoftAutoenrollmentEnrollment | null;
  otherProfiles: TMicrosoftAutoenrollmentOtherProfile[];
  onUpgradeRequired?: () => void;
  onCancelPending: () => void;
  onDirtyChange: (method: EnrollmentMethod, isDirty: boolean) => void;
  onPendingChange: (method: EnrollmentMethod, isPending: boolean) => void;
}) => {
  const { currentProject } = useProject();
  const setMutation = useSetPkiApplicationMicrosoftAutoenrollmentEnrollment();
  const clearMutation = useClearPkiApplicationMicrosoftAutoenrollmentEnrollment();
  const reenrollMutation = useReenrollPkiApplicationMicrosoftAutoenrollmentComputers();
  const [isReplacingKeytab, setIsReplacingKeytab] = useState(false);
  const [connectionBeforeReuse, setConnectionBeforeReuse] = useState<string | null>(null);
  const [groupSearch, setGroupSearch] = useState("");
  const [debouncedGroupSearch] = useDebounce(groupSearch, 300);
  const { data: servicePrincipal, error: servicePrincipalError } =
    useGetMicrosoftAutoenrollmentServicePrincipal(applicationId, profileId);
  const instanceServicePrincipalName = servicePrincipal?.servicePrincipalName.toLowerCase();
  const savedPrincipalName = initial?.servicePrincipalName.toLowerCase();
  const reuseCandidate = instanceServicePrincipalName
    ? otherProfiles
        .filter(
          (p) =>
            p.servicePrincipalName.split("@")[0].toLowerCase() === instanceServicePrincipalName &&
            (!initial ||
              p.servicePrincipalName.toLowerCase() !== initial.servicePrincipalName.toLowerCase() ||
              p.keyVersion > initial.keyVersion)
        )
        .reduce<TMicrosoftAutoenrollmentOtherProfile | undefined>((best, p) => {
          if (!best) return p;
          const isCandidateSamePrincipal =
            p.servicePrincipalName.toLowerCase() === savedPrincipalName;
          const isBestSamePrincipal =
            best.servicePrincipalName.toLowerCase() === savedPrincipalName;
          if (isCandidateSamePrincipal !== isBestSamePrincipal) {
            return isCandidateSamePrincipal ? p : best;
          }
          return p.keyVersion > best.keyVersion ? p : best;
        }, undefined)
    : undefined;
  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    clearErrors,
    formState: { isDirty, isSubmitting, dirtyFields }
  } = useForm<MicrosoftAutoenrollmentForm>({
    resolver: zodResolver(
      createMicrosoftAutoenrollmentFormSchema(
        !initial || isReplacingKeytab,
        Boolean(reuseCandidate)
      )
    ),
    defaultValues: getMicrosoftAutoenrollmentFormValues(initial)
  });

  const savedFormValuesKey = JSON.stringify(getMicrosoftAutoenrollmentFormValues(initial));
  useEffect(() => {
    reset(getMicrosoftAutoenrollmentFormValues(initial));
    setIsReplacingKeytab(false);
  }, [savedFormValuesKey, reset]);

  const connectionId = watch("connectionId");
  const keytabFile = watch("keytabFile");
  const reuseFrom = watch("reuseFrom");
  const allowAnyChannelBinding = watch("allowAnyChannelBinding");
  const channelBindingStatus = initial?.channelBinding.status;
  const isCloud = isInfisicalCloud();

  const { data: ldapConnections, isPending: isLdapConnectionsLoading } =
    useListAvailableAppConnections(AppConnection.LDAP, currentProject.id);
  const connectionCreation = useConnectionCreation(AppConnection.LDAP, (connection) =>
    setValue("connectionId", connection.id, { shouldDirty: true, shouldValidate: true })
  );
  const {
    data: groupSearchResult,
    isFetching: isGroupsFetching,
    isError: isGroupsError,
    error: groupsError
  } = useLdapConnectionListGroups(
    connectionId ?? undefined,
    debouncedGroupSearch.trim().slice(0, MAX_GROUP_SEARCH_LENGTH) || undefined
  );

  const isPending =
    setMutation.isPending || clearMutation.isPending || reenrollMutation.isPending || isSubmitting;
  useEffect(() => {
    onDirtyChange("microsoft-autoenrollment", isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => {
    onPendingChange("microsoft-autoenrollment", isPending);
  }, [isPending, onPendingChange]);
  useEffect(
    () => () => {
      onDirtyChange("microsoft-autoenrollment", false);
      onPendingChange("microsoft-autoenrollment", false);
    },
    [onDirtyChange, onPendingChange]
  );

  const isKeytabUploadShown = !reuseFrom && (!initial || isReplacingKeytab);
  const reuseCandidateConnectionName = ldapConnections?.find(
    (c) => c.id === reuseCandidate?.connectionId
  )?.name;

  const onUseReuseCandidate = () => {
    if (!reuseCandidate) return;
    setConnectionBeforeReuse(connectionId);
    setValue("keytabFile", null);
    setValue("reuseFrom", reuseCandidate, { shouldDirty: true, shouldValidate: true });
    setValue("connectionId", reuseCandidate.connectionId, {
      shouldDirty: true,
      shouldValidate: true
    });
  };

  const onReplaceKeytab = () => {
    if (reuseFrom && connectionId === reuseFrom.connectionId) {
      setValue("connectionId", connectionBeforeReuse, { shouldDirty: true });
    }
    setValue("reuseFrom", null, { shouldDirty: true });
    setIsReplacingKeytab(true);
  };

  const onKeepCurrentKeytab = () => {
    setValue("keytabFile", null, { shouldDirty: true });
    clearErrors("keytabFile");
    setIsReplacingKeytab(false);
  };

  const onSave = handleSubmit(async (values) => {
    if (setMutation.isPending || clearMutation.isPending) return;
    if (onUpgradeRequired) {
      onUpgradeRequired();
      return;
    }
    await setMutation.mutateAsync({
      applicationId,
      profileId,
      connectionId:
        !initial || dirtyFields.connectionId ? (values.connectionId ?? undefined) : undefined,
      allowedGroupSids:
        !initial || dirtyFields.allowedGroups
          ? values.allowedGroups.map((group) => group.sid)
          : undefined,
      renewBeforeDays:
        !initial || dirtyFields.renewBeforeDays ? (values.renewBeforeDays ?? undefined) : undefined,
      keytab: values.keytabFile
        ? bytesToBase64(new Uint8Array(await values.keytabFile.arrayBuffer()))
        : undefined,
      reuseKeytab: values.reuseFrom ? { profileId: values.reuseFrom.profileId } : undefined,
      allowAnyChannelBinding:
        !initial || dirtyFields.allowAnyChannelBinding ? values.allowAnyChannelBinding : undefined
    });
    reset({ ...values, keytabFile: null, reuseFrom: null });
    setIsReplacingKeytab(false);
    createNotification({ type: "success", text: "Microsoft Autoenrollment saved" });
  });

  const onDisable = async () => {
    await clearMutation.mutateAsync({ applicationId, profileId });
    createNotification({ type: "success", text: "Microsoft Autoenrollment disabled" });
  };

  const ktpassServicePrincipalName = servicePrincipal?.servicePrincipalName;
  const ktpassCommand = ktpassServicePrincipalName
    ? `ktpass -princ ${ktpassServicePrincipalName}@<REALM> -mapuser <DOMAIN>\\<service-account> -crypto AES256-SHA1 -ptype KRB5_NT_PRINCIPAL -pass * -out ${KEYTAB_FILE_NAME}`
    : null;

  let ktpassContent: React.ReactNode = <Skeleton className="h-20 w-full" />;
  if (ktpassCommand) {
    ktpassContent = <CodeBlock value={ktpassCommand} />;
  } else if (servicePrincipalError) {
    ktpassContent = (
      <Alert variant="danger">
        <TriangleAlertIcon />
        <AlertTitle>Could not build the ktpass command</AlertTitle>
        <AlertDescription>
          {(servicePrincipalError as AxiosError<{ message?: string }>)?.response?.data?.message ??
            servicePrincipalError.message}
        </AlertDescription>
      </Alert>
    );
  }

  const savedKeytabServicePrincipalName = initial?.servicePrincipalName.split("@")[0];
  const isSavedKeytabForOtherHost =
    Boolean(initial && instanceServicePrincipalName) &&
    !isReplacingKeytab &&
    !reuseFrom &&
    savedKeytabServicePrincipalName?.toLowerCase() !== instanceServicePrincipalName;

  let keytabRow: React.ReactNode = null;
  if (reuseFrom) {
    keytabRow = (
      <KeytabFileRow
        details={`${reuseFrom.servicePrincipalName} · key version ${reuseFrom.keyVersion} · same as ${reuseFrom.profileName}`}
      />
    );
  } else if (initial && !isReplacingKeytab) {
    keytabRow = (
      <KeytabFileRow
        details={`${initial.servicePrincipalName} · key version ${initial.keyVersion}`}
      />
    );
  }

  let keytabActions: React.ReactNode;
  if (keytabRow) {
    keytabActions = (
      <Button variant="outline" size="xs" onClick={onReplaceKeytab}>
        Replace
      </Button>
    );
  } else if (initial && isReplacingKeytab) {
    keytabActions = (
      <Button variant="outline" size="xs" onClick={onKeepCurrentKeytab}>
        Keep Current Keytab
      </Button>
    );
  }

  return (
    <form className="contents" onSubmit={(event) => onSave(event).catch(() => undefined)}>
      <fieldset
        disabled={isPending}
        className="min-h-0 thin-scrollbar min-w-0 flex-1 space-y-5 overflow-y-auto p-4"
      >
        {enabled && initial ? (
          <SectionCard title="Endpoint">
            <CopyableField
              label="Enrollment policy URL"
              value={initial.policyUrl}
              helper="Add it in Group Policy under Certificate Enrollment Policy, with Windows integrated authentication."
            />
            <CopyableField label="Policy ID" value={initial.policyId} />
          </SectionCard>
        ) : null}
        {isKeytabUploadShown && !keytabFile && reuseCandidate ? (
          <SectionCard title={`Reuse ${reuseCandidate.profileName}'s Keytab?`}>
            <KeytabFileRow
              details={[
                reuseCandidate.servicePrincipalName,
                `key version ${reuseCandidate.keyVersion}`,
                reuseCandidateConnectionName ? `LDAP ${reuseCandidateConnectionName}` : null
              ]
                .filter(Boolean)
                .join(" · ")}
              action={
                <Button variant="outline" onClick={onUseReuseCandidate}>
                  Use This Keytab
                </Button>
              }
            />
          </SectionCard>
        ) : null}
        <SectionCard title="Kerberos Keytab" actions={keytabActions}>
          {keytabRow}
          {isSavedKeytabForOtherHost ? (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertTitle>Keytab is for another host name</AlertTitle>
              <AlertDescription>
                <p>
                  Computers ask for{" "}
                  <span className="font-mono">{servicePrincipal?.servicePrincipalName}</span>.
                  Replace the keytab with one for that name.
                </p>
              </AlertDescription>
            </Alert>
          ) : null}
          {isKeytabUploadShown ? (
            <>
              <p className="text-sm text-accent">
                On a domain controller, turn on AES for the service account first. Without it,
                tickets can be encrypted with RC4, which the keytab can&apos;t read.
              </p>
              <CodeBlock value="Set-ADUser <service-account> -KerberosEncryptionType AES128,AES256" />
              <p className="text-sm text-accent">
                Then run this with your realm and service account, and upload the file it creates.
              </p>
              {ktpassContent}
              <p className="text-xs text-warning">
                Running <span className="font-mono">ktpass</span> again for an account breaks the
                keytabs made earlier for it. Upload the new keytab to every profile that uses one.
              </p>
              <Controller
                control={control}
                name="keytabFile"
                render={({ field, fieldState: { error } }) => (
                  <Field ref={field.ref} tabIndex={-1} className="scroll-mb-20 outline-none">
                    <FileDropzone
                      accept=".keytab"
                      title="Upload keytab"
                      description="The .keytab file the command created"
                      files={field.value ? [field.value] : undefined}
                      onFilesSelect={(files) => {
                        if (files[0]) field.onChange(files[0]);
                      }}
                      onFileRemove={() => field.onChange(null)}
                      isDisabled={isPending}
                    />
                    {error ? <FieldError>{error.message}</FieldError> : null}
                  </Field>
                )}
              />
            </>
          ) : null}
        </SectionCard>
        <SectionCard title="Active Directory">
          <Controller
            control={control}
            name="connectionId"
            render={({ field: { value, onChange, onBlur, name, ref }, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="microsoft-autoenrollment-connection">
                  LDAP connection
                </FieldLabel>
                <FieldContent>
                  <Combobox
                    ref={ref}
                    id="microsoft-autoenrollment-connection"
                    name={name}
                    onBlur={onBlur}
                    isDisabled={isPending}
                    value={ldapConnections?.find((c) => c.id === value) ?? null}
                    isError={Boolean(error)}
                    isLoading={isLdapConnectionsLoading}
                    onValueChange={(newValue) => onChange(newValue?.id ?? null)}
                    options={ldapConnections ?? []}
                    placeholder="Select an LDAP connection"
                    getOptionLabel={(option) => option.name}
                    getOptionValue={(option) => option.id}
                    creation={connectionCreation}
                  />
                </FieldContent>
                <FieldDescription>
                  Needs an LDAP connection that uses the Active Directory provider. Looks up each
                  computer&apos;s DNS name in the domain.
                </FieldDescription>
                {error ? <FieldError>{error.message}</FieldError> : null}
              </Field>
            )}
          />
        </SectionCard>
        <SectionCard title="Allowed Computers">
          <Controller
            control={control}
            name="allowedGroups"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="microsoft-autoenrollment-groups">
                  AD groups (optional)
                </FieldLabel>
                <FieldContent>
                  <Combobox
                    id="microsoft-autoenrollment-groups"
                    multiple
                    isDisabled={isPending}
                    options={groupSearchResult?.groups ?? []}
                    value={field.value}
                    onValueChange={field.onChange}
                    getOptionValue={(option) => option.sid}
                    getOptionLabel={(option) => option.name}
                    renderOption={(option) => (
                      <div className="flex min-w-0 items-center justify-between gap-4">
                        <span className="truncate">{option.name}</span>
                        <span className="shrink-0 font-mono text-xs text-muted">{option.sid}</span>
                      </div>
                    )}
                    onSearchChange={setGroupSearch}
                    isLoading={isGroupsFetching}
                    isError={Boolean(error)}
                    placeholder="Search groups by name"
                    listFooter={
                      groupSearchResult?.isTruncated
                        ? `Showing the first ${MAX_GROUP_RESULTS} groups. Type to narrow the search.`
                        : undefined
                    }
                    emptyMessage={(() => {
                      if (!connectionId) return "Select an LDAP connection first.";
                      if (isGroupsError) {
                        return (
                          (groupsError as AxiosError<{ message?: string }>)?.response?.data
                            ?.message ?? "Could not search Active Directory."
                        );
                      }
                      return "No groups match the search.";
                    })()}
                  />
                </FieldContent>
                <FieldDescription>
                  Only computers in one of these groups can enroll. Leave empty to allow every
                  computer in the domain.
                </FieldDescription>
                {error ? <FieldError>{error.message}</FieldError> : null}
              </Field>
            )}
          />
        </SectionCard>
        <SectionCard title="TLS Channel Binding">
          <p className="text-sm text-accent">
            Windows ties each sign-in to the HTTPS certificate the computer sees. Sign-ins tied to a
            different certificate are refused, so a sign-in captured by another site can&apos;t be
            used to get certificates here.
          </p>
          {!allowAnyChannelBinding &&
          channelBindingStatus === MicrosoftAutoenrollmentChannelBindingStatus.Unverifiable ? (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertTitle>Channel bindings can&apos;t be checked</AlertTitle>
              <AlertDescription>
                <p>
                  {isCloud
                    ? "Infisical can't check TLS channel bindings right now, so requests are refused. Contact Infisical support."
                    : `${initial?.channelBinding.reason} Requests are refused. If this can't be fixed, turn on Skip the channel binding check below.`}
                </p>
              </AlertDescription>
            </Alert>
          ) : null}
          <Controller
            control={control}
            name="allowAnyChannelBinding"
            render={({ field }) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="microsoft-autoenrollment-allow-any-channel-binding">
                    Skip the channel binding check
                  </Label>
                  <FieldDescription>
                    {isCloud
                      ? "Turn on only if computers reach Infisical through a proxy that inspects HTTPS."
                      : "Turn on only if computers reach Infisical through a proxy that inspects HTTPS, or this instance can't check bindings."}{" "}
                    While it&apos;s on, a site that gets a computer to sign in to it can request
                    certificates as that computer.
                  </FieldDescription>
                  {!isCloud &&
                  !allowAnyChannelBinding &&
                  channelBindingStatus ===
                    MicrosoftAutoenrollmentChannelBindingStatus.NotChecked ? (
                    <FieldDescription>{initial?.channelBinding.reason}</FieldDescription>
                  ) : null}
                </FieldContent>
                <Toggle
                  variant="project"
                  id="microsoft-autoenrollment-allow-any-channel-binding"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </Field>
            )}
          />
        </SectionCard>
        <SectionCard title="Renewal">
          <Controller
            control={control}
            name="renewBeforeDays"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="microsoft-autoenrollment-renew-before-days">
                  Renew before (days)
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="microsoft-autoenrollment-renew-before-days"
                    ref={field.ref}
                    name={field.name}
                    onBlur={field.onBlur}
                    type="number"
                    inputMode="numeric"
                    value={field.value ?? ""}
                    onChange={handleOptionalIntChange(field.onChange)}
                    isError={Boolean(error)}
                    className="scroll-mb-20"
                  />
                </FieldContent>
                {error ? <FieldError>{error.message}</FieldError> : null}
                <FieldDescription>
                  Days before expiry that Windows renews the certificate.
                  {getRenewalPeriodNote(initial)}
                </FieldDescription>
              </Field>
            )}
          />
          {enabled && (
            <Field>
              <FieldLabel>Re-enroll computers</FieldLabel>
              <FieldDescription>
                {isDirty
                  ? "Save or discard your changes before re-enrolling computers."
                  : "Makes every computer that can still enroll request a new certificate the next time it fetches the enrollment policy."}
              </FieldDescription>
              <div>
                <ConfirmActionButton
                  label="Re-enroll All Computers"
                  title={`Re-enroll All Computers for ${initial?.templateName ?? ""}?`}
                  description="Every computer that holds a certificate from this profile and can still enroll requests a new one the next time it fetches the enrollment policy, which can take up to 8 hours. If an approval policy covers the profile, each request waits for approval."
                  confirmLabel="Re-enroll"
                  confirmVariant="project"
                  triggerSize="sm"
                  isPending={isPending}
                  isDisabled={isDirty}
                  onConfirmed={async () => {
                    if (onUpgradeRequired) {
                      onUpgradeRequired();
                      return;
                    }
                    await reenrollMutation.mutateAsync({ applicationId, profileId });
                    createNotification({
                      type: "success",
                      text: "Computers will request new certificates the next time they fetch the enrollment policy, within 8 hours."
                    });
                  }}
                />
              </div>
            </Field>
          )}
        </SectionCard>
      </fieldset>
      <SheetFooter className="justify-end border-t">
        {enabled && (
          <DisableEnrollmentButton
            method="Microsoft Autoenrollment"
            consequence="Computers keep asking this profile for certificates until you remove its enrollment policy URL from Group Policy, and approved requests that computers haven't picked up yet can no longer be collected."
            onConfirmed={onDisable}
            isPending={isPending}
          />
        )}
        <Button type="button" variant="ghost" onClick={onCancelPending} isDisabled={isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="project"
          isPending={setMutation.isPending || isSubmitting}
          isDisabled={isPending}
        >
          {enabled ? "Save" : "Enable"}
        </Button>
      </SheetFooter>
    </form>
  );
};

export type EnrollmentMethod = "api" | "est" | "acme" | "scep" | "microsoft-autoenrollment";

const METHOD_DOCS: Record<EnrollmentMethod, string> = {
  api: PkiDocsUrls.applications.enrollment.api,
  est: PkiDocsUrls.applications.enrollment.est,
  acme: PkiDocsUrls.applications.enrollment.acme,
  scep: PkiDocsUrls.applications.enrollment.scep,
  "microsoft-autoenrollment": PkiDocsUrls.applications.enrollment.microsoftAutoenrollment
};

const MethodDescription = ({ method }: { method: EnrollmentMethod }) => {
  const docLink = (
    <a
      href={METHOD_DOCS[method]}
      target="_blank"
      rel="noopener noreferrer"
      className="underline hover:text-foreground"
    >
      {enrollmentTypeToNameMap[method]}
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
    case "microsoft-autoenrollment":
      return <>Enroll domain-joined Windows computers through Group Policy with {docLink}.</>;
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
  if (data?.microsoftAutoenrollmentConfigured) configuredMethods.push("microsoft-autoenrollment");

  const [pendingMethods, setPendingMethods] = useState<EnrollmentMethod[]>([]);
  const [activeTab, setActiveTab] = useState<EnrollmentMethod | "">("");
  const [dirtyMethods, setDirtyMethods] = useState<Partial<Record<EnrollmentMethod, boolean>>>({});
  const [pendingByMethod, setPendingByMethod] = useState<
    Partial<Record<EnrollmentMethod, boolean>>
  >({});
  const discardMethod = useRef<EnrollmentMethod | null>(null);
  const isPending = Object.values(pendingByMethod).some(Boolean);

  const { subscription } = useSubscription();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

  const ALL_ORDER: EnrollmentMethod[] = ["api", "est", "acme", "scep", "microsoft-autoenrollment"];
  const visibleMethods = ALL_ORDER.filter(
    (m) => configuredMethods.includes(m) || pendingMethods.includes(m)
  );
  const addableMethods = ALL_ORDER.filter(
    (m) => !configuredMethods.includes(m) && !pendingMethods.includes(m)
  );
  // API and ACME are available on every plan.
  const lockedMethods: Partial<Record<EnrollmentMethod, boolean>> = {
    est: !subscription.pkiEst,
    scep: !subscription.pkiScep,
    "microsoft-autoenrollment": !subscription.pkiMicrosoftAutoenrollment
  };

  useEffect(() => {
    if (!isOpen) {
      setPendingMethods([]);
      setActiveTab("");
      setDirtyMethods({});
      setPendingByMethod({});
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

  const openEnrollmentUpgradeGate = (method: EnrollmentMethod) =>
    openUpgradeGate({
      intent: CertificateEnrollmentUpgradeIntent,
      paywallKey: `cert-manager.application-enrollment.${method}`
    });

  const handleAddMethod = (method: EnrollmentMethod) => {
    if (isPending) return;
    if (!lockedMethods[method]) {
      handleAdd(method);
      return;
    }

    openEnrollmentUpgradeGate(method);
  };

  const handleDirtyChange = useCallback(
    (method: EnrollmentMethod, isDirty: boolean) =>
      setDirtyMethods((prev) =>
        Boolean(prev[method]) === isDirty ? prev : { ...prev, [method]: isDirty }
      ),
    []
  );

  const hasUnsavedWork = pendingMethods.length > 0 || Object.values(dirtyMethods).some(Boolean);
  const handlePendingChange = useCallback(
    (method: EnrollmentMethod, pending: boolean) =>
      setPendingByMethod((prev) =>
        Boolean(prev[method]) === pending ? prev : { ...prev, [method]: pending }
      ),
    []
  );
  const { requestDiscard, isDiscardDialogOpen, setIsDiscardDialogOpen, confirmDiscard } =
    useDiscardChangesGuard({
      isDirty: hasUnsavedWork,
      onDiscard: () => {
        const method = discardMethod.current;
        if (method) {
          setPendingMethods((prev) => prev.filter((m) => m !== method));
          setDirtyMethods((prev) => ({ ...prev, [method]: false }));
          return;
        }
        onOpenChange(false);
      }
    });

  const isUnsaved = (method: EnrollmentMethod) =>
    pendingMethods.includes(method) || Boolean(dirtyMethods[method]);

  const handleDismiss = () => {
    if (isPending) return;
    discardMethod.current = null;
    requestDiscard();
  };
  const handleCancelPending = (method: EnrollmentMethod) => {
    if (isPending) return;
    discardMethod.current = method;
    requestDiscard();
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleDismiss();
      }}
    >
      <SheetContent size="form" isPending={isPending}>
        <SheetHeader>
          <SheetTitle>Configure Enrollment Methods for {profile?.profileSlug}</SheetTitle>
          <SheetDescription>
            Enable an enrollment method to allow clients to request certificates using this profile.{" "}
            <a
              href={PkiDocsUrls.applications.enrollment.overview}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Learn more
            </a>
          </SheetDescription>
        </SheetHeader>

        {!profile || isLoading ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <Spinner size="sm" />
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              if (!isPending) setActiveTab(v as EnrollmentMethod);
            }}
            className="min-h-0 flex-1"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 pt-4">
              <div className="min-w-0 flex-1">
                {visibleMethods.length > 0 ? (
                  <TabsList variant="project" className="border-b-0">
                    {visibleMethods.map((m) => (
                      <TabsTrigger key={m} value={m} disabled={isPending}>
                        {enrollmentTypeToNameMap[m]}
                        {isUnsaved(m) && (
                          <span className="ml-1.5 text-xs text-muted">(unsaved)</span>
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                ) : (
                  <div />
                )}
              </div>
              {addableMethods.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="mb-2" isDisabled={isPending}>
                      <Plus className="size-4" />
                      Add enrollment method
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {addableMethods.map((m) => {
                      const isLocked = lockedMethods[m] ?? false;
                      const unsupportedReason =
                        m === "microsoft-autoenrollment"
                          ? (data?.microsoftAutoenrollmentUnsupportedReason ?? null)
                          : null;
                      const isUnsupported = Boolean(unsupportedReason);
                      const item = (
                        <DropdownMenuItem
                          key={m}
                          onClick={() => handleAddMethod(m)}
                          isDisabled={isPending || isUnsupported}
                          isDisabledFocusable={isUnsupported}
                        >
                          <div className="flex flex-col">
                            <span className="flex items-center gap-2 font-medium">
                              {enrollmentTypeToNameMap[m]}
                              {isLocked && <Badge variant="info">Enterprise</Badge>}
                            </span>
                            <span className="text-xs text-accent">
                              <MethodDescription method={m} />
                            </span>
                          </div>
                        </DropdownMenuItem>
                      );
                      if (!isUnsupported) return item;
                      return (
                        <Tooltip key={m}>
                          <TooltipTrigger asChild>{item}</TooltipTrigger>
                          <TooltipContent side="left" className="max-w-xs">
                            {unsupportedReason}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>

            {visibleMethods.length === 0 ? (
              <div className="min-h-0 thin-scrollbar flex-1 overflow-y-auto p-4">
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle>No enrollment methods configured</EmptyTitle>
                    <EmptyDescription>
                      <span className="font-medium">Add enrollment method</span> above to let
                      clients request certificates from this profile.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : (
              <>
                {activeTab && (
                  <p className="px-4 pt-4 text-sm text-accent">
                    <MethodDescription method={activeTab as EnrollmentMethod} />
                  </p>
                )}
                {visibleMethods.includes("api") ? (
                  <TabsContent
                    value="api"
                    className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                    forceMount
                  >
                    <ApiPanel
                      applicationId={applicationId}
                      profileId={profileId}
                      enabled={Boolean(data?.api)}
                      initial={data?.api ?? null}
                      onCancelPending={data?.api ? handleDismiss : () => handleCancelPending("api")}
                      onDirtyChange={handleDirtyChange}
                      onPendingChange={handlePendingChange}
                    />
                  </TabsContent>
                ) : null}
                {visibleMethods.includes("est") ? (
                  <TabsContent
                    value="est"
                    className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                    forceMount
                  >
                    <EstPanel
                      applicationId={applicationId}
                      profileId={profileId}
                      enabled={Boolean(data?.estConfigured)}
                      initial={data?.est ?? null}
                      onCancelPending={
                        data?.estConfigured ? handleDismiss : () => handleCancelPending("est")
                      }
                      onDirtyChange={handleDirtyChange}
                      onPendingChange={handlePendingChange}
                    />
                  </TabsContent>
                ) : null}
                {visibleMethods.includes("acme") ? (
                  <TabsContent
                    value="acme"
                    className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                    forceMount
                  >
                    <AcmePanel
                      applicationId={applicationId}
                      profileId={profileId}
                      enabled={Boolean(data?.acmeConfigured)}
                      initial={data?.acme ?? null}
                      onCancelPending={
                        data?.acmeConfigured ? handleDismiss : () => handleCancelPending("acme")
                      }
                      onDirtyChange={handleDirtyChange}
                      onPendingChange={handlePendingChange}
                    />
                  </TabsContent>
                ) : null}
                {visibleMethods.includes("scep") ? (
                  <TabsContent
                    value="scep"
                    className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                    forceMount
                  >
                    <ScepPanel
                      applicationId={applicationId}
                      profileId={profileId}
                      profileSlug={profile?.profileSlug ?? ""}
                      enabled={Boolean(data?.scepConfigured)}
                      caType={data?.caType ?? CaType.INTERNAL}
                      initial={data?.scep ?? null}
                      onCancelPending={
                        data?.scepConfigured ? handleDismiss : () => handleCancelPending("scep")
                      }
                      onDirtyChange={handleDirtyChange}
                      onPendingChange={handlePendingChange}
                    />
                  </TabsContent>
                ) : null}
                {visibleMethods.includes("microsoft-autoenrollment") ? (
                  <TabsContent
                    value="microsoft-autoenrollment"
                    className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                    forceMount
                  >
                    <MicrosoftAutoenrollmentPanel
                      applicationId={applicationId}
                      profileId={profileId}
                      enabled={Boolean(data?.microsoftAutoenrollmentConfigured)}
                      initial={data?.microsoftAutoenrollment ?? null}
                      otherProfiles={data?.microsoftAutoenrollmentOtherProfiles ?? []}
                      onUpgradeRequired={
                        lockedMethods["microsoft-autoenrollment"]
                          ? () => openEnrollmentUpgradeGate("microsoft-autoenrollment")
                          : undefined
                      }
                      onCancelPending={
                        data?.microsoftAutoenrollmentConfigured
                          ? handleDismiss
                          : () => handleCancelPending("microsoft-autoenrollment")
                      }
                      onDirtyChange={handleDirtyChange}
                      onPendingChange={handlePendingChange}
                    />
                  </TabsContent>
                ) : null}
              </>
            )}
          </Tabs>
        )}
        {(!profile || isLoading || visibleMethods.length === 0) && (
          <SheetFooter className="justify-end border-t">
            <Button type="button" variant="ghost" onClick={handleDismiss} isDisabled={isPending}>
              Cancel
            </Button>
          </SheetFooter>
        )}
        <DiscardChangesAlertDialog
          open={isDiscardDialogOpen}
          onOpenChange={setIsDiscardDialogOpen}
          onDiscard={confirmDiscard}
          title="Discard Enrollment Changes?"
          description={
            discardMethod.current
              ? `Unsaved ${enrollmentTypeToNameMap[discardMethod.current]} enrollment settings will be lost.`
              : "All unsaved enrollment settings and newly added methods will be lost."
          }
        />
      </SheetContent>
      {upgradeGate}
    </Sheet>
  );
};
