import { ReactNode, useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import FileSaver from "file-saver";
import { CheckIcon, Clock3Icon, CopyIcon, DownloadIcon, PlusIcon, Trash2Icon } from "lucide-react";
import ms from "ms";
import { z } from "zod";

import {
  dynamicSecretProviderRegistry,
  TDynamicSecretLeaseOutput
} from "@app/components/dynamic-secrets";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  DialogFooter,
  Field,
  FieldDescription,
  FieldFeedback,
  FieldLabel,
  IconButton,
  Input,
  SecretInput,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useTimedReset, useToggle } from "@app/hooks";
import { useCreateDynamicSecretLease } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

const OutputDisplay = ({
  value,
  label,
  helperText,
  isVisible
}: {
  value: string;
  label: string;
  helperText?: ReactNode;
  isVisible?: boolean;
}) => {
  const inputId = useId();
  const [copyText, isCopying, setCopyText] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  return (
    <Field className="relative mb-4 last:mb-0">
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <div className="relative">
        <SecretInput
          id={inputId}
          isReadOnly
          isVisible={isVisible}
          value={value}
          aria-describedby={helperText ? `${inputId}-description` : undefined}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              aria-label={`Copy ${label}`}
              variant="ghost-muted"
              size="xs"
              className="absolute top-1 right-1"
              onClick={() => {
                navigator.clipboard.writeText(value).catch(() => undefined);
                setCopyText("Copied");
              }}
            >
              {isCopying ? <CheckIcon /> : <CopyIcon />}
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>{copyText}</TooltipContent>
        </Tooltip>
      </div>
      {helperText && (
        <FieldDescription id={`${inputId}-description`}>{helperText}</FieldDescription>
      )}
    </Field>
  );
};

const TotpOutputDisplay = ({
  totp,
  remainingSeconds,
  triggerLeaseRegeneration
}: {
  totp: string;
  remainingSeconds: number;
  triggerLeaseRegeneration: (details: { ttl?: string }) => Promise<void>;
}) => {
  const [remainingTime, setRemainingTime] = useState(remainingSeconds);
  const [shouldShowRegenerate, setShouldShowRegenerate] = useToggle(false);

  useEffect(() => {
    setRemainingTime(remainingSeconds);
    setShouldShowRegenerate.off();

    // Set up countdown interval
    const intervalId = setInterval(() => {
      setRemainingTime((prevTime) => {
        if (prevTime <= 1) {
          clearInterval(intervalId);
          setShouldShowRegenerate.on();
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    // Cleanup interval on unmount or when totp changes
    return () => clearInterval(intervalId);
  }, [totp, remainingSeconds]);

  return (
    <div className="h-36">
      <OutputDisplay label="Time-based one-time password" value={totp} />
      {remainingTime > 0 ? (
        <div
          className={`flex items-center gap-1 text-sm ${
            remainingTime < 10 ? "text-danger" : "text-warning"
          } transition-colors duration-500`}
        >
          <Clock3Icon className="size-4" />
          <span>
            Expires in {remainingTime} {remainingTime > 1 ? "seconds" : "second"}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-sm text-danger">
          <Clock3Icon className="size-4" />
          Expired
        </div>
      )}
      {shouldShowRegenerate && (
        <Button className="mt-2" onClick={() => triggerLeaseRegeneration({})}>
          Regenerate
        </Button>
      )}
    </div>
  );
};

const renderOutputForm = (
  output: TDynamicSecretLeaseOutput,
  data: unknown,
  triggerLeaseRegeneration: (details: { ttl?: string }) => Promise<void>
) => {
  if (output.type === "totp") {
    const { TOTP, TIME_REMAINING } = data as {
      TOTP: string;
      TIME_REMAINING: number;
    };

    return (
      <TotpOutputDisplay
        totp={TOTP}
        remainingSeconds={TIME_REMAINING}
        triggerLeaseRegeneration={triggerLeaseRegeneration}
      />
    );
  }

  if (output.type === "ssh") {
    throw new Error("SSH lease output must be rendered by the SSH provisioner.");
  }

  const values = data as Record<string, unknown>;

  return (
    <div>
      {output.fields.map((field) => {
        const rawValue = values[field.key];
        if (field.isOptional && (rawValue === undefined || rawValue === null || rawValue === "")) {
          return null;
        }

        const value = field.format === "json" ? JSON.stringify(rawValue) : String(rawValue ?? "");

        return (
          <OutputDisplay
            key={field.key}
            label={field.label}
            value={value}
            isVisible={field.format === "json"}
          />
        );
      })}
      {output.notice && (
        <div className="mt-2 space-y-2 text-xs text-muted">
          <p>
            Important: Copy these credentials now. You will not be able to see them again after you
            close this dialog.
          </p>
          {output.notice === "one-time-delayed" && (
            <p className="font-medium">
              It may take a few minutes before the credentials are available for use.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const kubernetesFormSchema = z.object({
  ttl: z
    .string()
    .refine((val) => ms(val) > 0, "TTL must be a positive number")
    .optional(),
  namespace: z.string().optional()
});

type TKubernetesForm = z.infer<typeof kubernetesFormSchema>;

export const CreateKubernetesDynamicSecretLease = ({
  onClose,
  projectSlug,
  dynamicSecretName,
  provider,
  secretPath,
  environment
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TKubernetesForm>({
    resolver: zodResolver(kubernetesFormSchema),
    defaultValues: {
      ttl: "1h"
    }
  });

  const createDynamicSecretLease = useCreateDynamicSecretLease();

  const handleDynamicSecretLeaseCreate = async ({ ttl, namespace }: TKubernetesForm) => {
    if (createDynamicSecretLease.isPending) return;
    await createDynamicSecretLease.mutateAsync({
      environmentSlug: environment,
      projectSlug,
      path: secretPath,
      ttl,
      dynamicSecretName,
      config: {
        namespace: namespace || undefined
      },
      provider
    });

    createNotification({
      type: "success",
      text: "Successfully leased dynamic secret"
    });
  };

  const handleLeaseRegeneration = async (data: { ttl?: string }) => {
    handleDynamicSecretLeaseCreate(data);
  };

  const isOutputMode = Boolean(createDynamicSecretLease?.data);

  if (isOutputMode) {
    return renderOutputForm(
      dynamicSecretProviderRegistry.requireLeaseCapabilities(provider).output,
      createDynamicSecretLease.data?.data,
      handleLeaseRegeneration
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(handleDynamicSecretLeaseCreate)}>
      <Controller
        control={control}
        name="namespace"
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="kubernetes-lease-namespace">Namespace</FieldLabel>
            <Input
              {...field}
              id="kubernetes-lease-namespace"
              isError={Boolean(error)}
              aria-describedby="kubernetes-lease-namespace-feedback"
            />
            <FieldFeedback
              id="kubernetes-lease-namespace-feedback"
              description="The Kubernetes namespace to lease the dynamic secret to. If omitted, the first configured namespace is used."
              error={error?.message}
            />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="ttl"
        defaultValue="1h"
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="kubernetes-lease-ttl">Default TTL</FieldLabel>
            <Input
              {...field}
              id="kubernetes-lease-ttl"
              isError={Boolean(error)}
              aria-describedby={error ? "kubernetes-lease-ttl-feedback" : undefined}
            />
            {error?.message && (
              <FieldFeedback id="kubernetes-lease-ttl-feedback" error={error.message} />
            )}
          </Field>
        )}
      />
      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="project" size="sm" isPending={isSubmitting}>
          Provision Lease
        </Button>
      </DialogFooter>
    </form>
  );
};

const sshFormSchema = z.object({
  ttl: z
    .string()
    .refine((val) => ms(val) > 0, "TTL must be a positive number")
    .optional(),
  principals: z.array(z.string().trim().min(1)).min(1, "At least one principal is required")
});

type TSshForm = z.infer<typeof sshFormSchema>;

const SshLeaseOutput = ({
  data,
  firstPrincipal
}: {
  data: { PRIVATE_KEY: string; SIGNED_KEY: string };
  firstPrincipal: string;
}) => {
  const [copyTextPrivateKey, isCopyingPrivateKey, setCopyTextPrivateKey] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });
  const [copyTextSignedKey, isCopyingSignedKey, setCopyTextSignedKey] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  const downloadTxtFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    FileSaver.saveAs(blob, filename);
  };

  const chmodCommand = "chmod 600 key.pem";
  const sshCommand = `ssh -i key.pem -o CertificateFile=cert.pub ${firstPrincipal}@<hostname>`;

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    createNotification({ text: "Command copied to clipboard", type: "info" });
  };

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel htmlFor="ssh-lease-private-key">Private Key</FieldLabel>
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  aria-label="Copy private key"
                  variant="ghost-muted"
                  size="xs"
                  onClick={() => {
                    navigator.clipboard.writeText(data.PRIVATE_KEY).catch(() => undefined);
                    setCopyTextPrivateKey("Copied");
                  }}
                >
                  {isCopyingPrivateKey ? <CheckIcon /> : <CopyIcon />}
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>{copyTextPrivateKey}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  aria-label="Download private key"
                  variant="ghost-muted"
                  size="xs"
                  onClick={() => downloadTxtFile("key.pem", data.PRIVATE_KEY)}
                >
                  <DownloadIcon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Download key.pem</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <SecretInput id="ssh-lease-private-key" isReadOnly value={data.PRIVATE_KEY} />
      </Field>
      <Field>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel htmlFor="ssh-lease-signed-certificate">Signed Certificate</FieldLabel>
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  aria-label="Copy signed certificate"
                  variant="ghost-muted"
                  size="xs"
                  onClick={() => {
                    navigator.clipboard.writeText(data.SIGNED_KEY).catch(() => undefined);
                    setCopyTextSignedKey("Copied");
                  }}
                >
                  {isCopyingSignedKey ? <CheckIcon /> : <CopyIcon />}
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>{copyTextSignedKey}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  aria-label="Download signed certificate"
                  variant="ghost-muted"
                  size="xs"
                  onClick={() => downloadTxtFile("cert.pub", data.SIGNED_KEY)}
                >
                  <DownloadIcon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Download cert.pub</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <SecretInput
          id="ssh-lease-signed-certificate"
          isReadOnly
          isVisible
          value={data.SIGNED_KEY}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="ssh-lease-chmod-command">Set Private Key Permissions</FieldLabel>
        <div className="flex gap-2">
          <Input id="ssh-lease-chmod-command" value={chmodCommand} readOnly />
          <IconButton
            aria-label="Copy private key permissions command"
            variant="outline"
            onClick={() => copyCommand(chmodCommand)}
          >
            <CopyIcon />
          </IconButton>
        </div>
      </Field>
      <Field>
        <FieldLabel htmlFor="ssh-lease-connect-command">Connect to the Target Host</FieldLabel>
        <div className="flex gap-2">
          <Input id="ssh-lease-connect-command" value={sshCommand} readOnly />
          <IconButton
            aria-label="Copy SSH connection command"
            variant="outline"
            onClick={() => copyCommand(sshCommand)}
          >
            <CopyIcon />
          </IconButton>
        </div>
      </Field>
      <p className="text-xs text-muted">
        Important: Copy or download these credentials now. You will not be able to see them again
        after you close this dialog.
      </p>
    </div>
  );
};

export const CreateSshDynamicSecretLease = ({
  onClose,
  projectSlug,
  dynamicSecretName,
  provider,
  secretPath,
  environment
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    setValue,
    watch
  } = useForm<TSshForm>({
    resolver: zodResolver(sshFormSchema),
    defaultValues: {
      ttl: "1h",
      principals: []
    }
  });

  const [principalInput, setPrincipalInput] = useState("");
  const createDynamicSecretLease = useCreateDynamicSecretLease();
  const principals = watch("principals");

  const handleAddPrincipal = () => {
    const trimmed = principalInput.trim();
    if (trimmed && !principals.includes(trimmed)) {
      setValue("principals", [...principals, trimmed], { shouldValidate: true });
    }
    setPrincipalInput("");
  };

  const handleRemovePrincipal = (idx: number) => {
    setValue(
      "principals",
      principals.filter((_: string, i: number) => i !== idx),
      { shouldValidate: true }
    );
  };

  const handleDynamicSecretLeaseCreate = async ({ ttl, principals: reqPrincipals }: TSshForm) => {
    if (createDynamicSecretLease.isPending) return;
    await createDynamicSecretLease.mutateAsync({
      environmentSlug: environment,
      projectSlug,
      path: secretPath,
      ttl,
      dynamicSecretName,
      config: {
        principals: reqPrincipals
      },
      provider
    });

    createNotification({
      type: "success",
      text: "Successfully leased dynamic secret"
    });
  };

  const isOutputMode = Boolean(createDynamicSecretLease?.data);

  if (isOutputMode) {
    return (
      <SshLeaseOutput
        data={createDynamicSecretLease.data?.data as { PRIVATE_KEY: string; SIGNED_KEY: string }}
        firstPrincipal={principals[0]}
      />
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(handleDynamicSecretLeaseCreate)}>
      <Controller
        control={control}
        name="principals"
        render={({ fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="ssh-lease-principal">Principals</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="ssh-lease-principal"
                value={principalInput}
                aria-describedby="ssh-lease-principals-feedback"
                onChange={(event) => setPrincipalInput(event.target.value)}
                placeholder="Enter principal name..."
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAddPrincipal();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={handleAddPrincipal}
                isDisabled={!principalInput.trim()}
              >
                <PlusIcon /> Add
              </Button>
            </div>
            <FieldFeedback
              id="ssh-lease-principals-feedback"
              description="The usernames to embed in the certificate. Each principal must be on the allowed list."
              error={error?.message}
            />
            {principals.length > 0 && (
              <div className="flex flex-col gap-2">
                {principals.map((principal: string, idx: number) => (
                  <div key={principal} className="flex gap-2">
                    <Input value={principal} readOnly aria-label={`Principal ${principal}`} />
                    <IconButton
                      type="button"
                      variant="outline"
                      aria-label={`Remove principal ${principal}`}
                      onClick={() => handleRemovePrincipal(idx)}
                    >
                      <Trash2Icon />
                    </IconButton>
                  </div>
                ))}
              </div>
            )}
          </Field>
        )}
      />
      <Controller
        control={control}
        name="ttl"
        defaultValue="1h"
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="ssh-lease-ttl">Default TTL</FieldLabel>
            <Input
              {...field}
              id="ssh-lease-ttl"
              isError={Boolean(error)}
              aria-describedby={error ? "ssh-lease-ttl-error" : undefined}
            />
            {error?.message && <FieldFeedback id="ssh-lease-ttl-error" error={error.message} />}
          </Field>
        )}
      />
      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="project" size="sm" isPending={isSubmitting}>
          Provision Lease
        </Button>
      </DialogFooter>
    </form>
  );
};

const formSchema = z.object({
  ttl: z
    .string()
    .refine((val) => ms(val) > 0, "TTL must be a positive number")
    .optional()
});

type TForm = z.infer<typeof formSchema>;

type Props = {
  onClose: () => void;
  dynamicSecretName: string;
  provider: DynamicSecretProviders;
  projectSlug: string;
  environment: string;
  secretPath: string;
};

export const CreateDynamicSecretLease = ({
  onClose,
  projectSlug,
  dynamicSecretName,
  provider,
  secretPath,
  environment
}: Props) => {
  const leaseCapabilities = dynamicSecretProviderRegistry.requireLeaseCapabilities(provider);
  const {
    control,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ttl: "1h"
    }
  });
  const [isPreloading, setIsPreloading] = useToggle(Boolean(leaseCapabilities.autoGenerate));

  const createDynamicSecretLease = useCreateDynamicSecretLease();

  const handleDynamicSecretLeaseCreate = async ({ ttl }: TForm) => {
    if (createDynamicSecretLease.isPending) return;
    await createDynamicSecretLease.mutateAsync({
      environmentSlug: environment,
      projectSlug,
      path: secretPath,
      ttl,
      dynamicSecretName,
      provider
    });

    createNotification({
      type: "success",
      text: "Successfully leased dynamic secret"
    });

    setIsPreloading.off();
  };

  const handleLeaseRegeneration = async (data: { ttl?: string }) => {
    setIsPreloading.on();
    handleDynamicSecretLeaseCreate(data);
  };

  useEffect(() => {
    if (leaseCapabilities.autoGenerate) {
      handleDynamicSecretLeaseCreate({});
    }
  }, [provider]);

  if (leaseCapabilities.provisioner === "kubernetes") {
    return (
      <CreateKubernetesDynamicSecretLease
        onClose={onClose}
        projectSlug={projectSlug}
        dynamicSecretName={dynamicSecretName}
        provider={provider}
        secretPath={secretPath}
        environment={environment}
      />
    );
  }

  if (leaseCapabilities.provisioner === "ssh") {
    return (
      <CreateSshDynamicSecretLease
        onClose={onClose}
        projectSlug={projectSlug}
        dynamicSecretName={dynamicSecretName}
        provider={provider}
        secretPath={secretPath}
        environment={environment}
      />
    );
  }

  const isOutputMode = Boolean(createDynamicSecretLease?.data);

  if (isPreloading) {
    return <Spinner className="mx-auto my-12" label="Provisioning lease" />;
  }

  const { fixedTtl } = leaseCapabilities;

  if (isOutputMode) {
    return renderOutputForm(
      leaseCapabilities.output,
      createDynamicSecretLease.data?.data,
      handleLeaseRegeneration
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(handleDynamicSecretLeaseCreate)}>
      <Controller
        control={control}
        name="ttl"
        defaultValue="1h"
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="dynamic-secret-lease-ttl">Default TTL</FieldLabel>
            <Input
              {...field}
              id="dynamic-secret-lease-ttl"
              disabled={Boolean(fixedTtl)}
              isError={Boolean(error)}
              aria-describedby={
                fixedTtl || error?.message ? "dynamic-secret-lease-ttl-feedback" : undefined
              }
            />
            {(fixedTtl || error?.message) && (
              <FieldFeedback
                id="dynamic-secret-lease-ttl-feedback"
                description={fixedTtl ? `This provider has a fixed TTL of ${fixedTtl}.` : undefined}
                error={error?.message}
              />
            )}
          </Field>
        )}
      />
      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="project" size="sm" isPending={isSubmitting}>
          Provision Lease
        </Button>
      </DialogFooter>
    </form>
  );
};
