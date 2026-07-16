import { ReactNode, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faClock, faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import FileSaver from "file-saver";
import { AnimatePresence, motion } from "framer-motion";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  SecretInput,
  Spinner,
  Tag,
  Tooltip
} from "@app/components/v2";
import { useTimedReset, useToggle } from "@app/hooks";
import { useCreateDynamicSecretLease } from "@app/hooks/api";
import { DYNAMIC_SECRET_PROVIDER_OUTPUTS } from "@app/hooks/api/dynamicSecret/providerOutputs";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

const OutputDisplay = ({
  value,
  label,
  helperText
}: {
  value: string;
  label: string;
  helperText?: ReactNode;
}) => {
  const [copyText, isCopying, setCopyText] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  return (
    <div className="relative">
      <FormControl label={label} className="grow" helperText={helperText}>
        <SecretInput
          isReadOnly
          value={value}
          containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5"
        />
      </FormControl>
      <Tooltip content={copyText}>
        <IconButton
          ariaLabel="Copy to clipboard"
          variant="plain"
          size="md"
          className="absolute top-7 right-2"
          onClick={() => {
            navigator.clipboard.writeText(value as string);
            setCopyText("Copied");
          }}
        >
          <FontAwesomeIcon icon={isCopying ? faCheck : faCopy} />
        </IconButton>
      </Tooltip>
    </div>
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
          className={`ml-2 flex items-center text-sm ${
            remainingTime < 10 ? "text-red-500" : "text-yellow-500"
          } transition-colors duration-500`}
        >
          <FontAwesomeIcon className="mr-1" icon={faClock} size="sm" />
          <span>
            Expires in {remainingTime} {remainingTime > 1 ? "seconds" : "second"}
          </span>
        </div>
      ) : (
        <div className="ml-2 flex items-center text-sm text-red-500">
          <FontAwesomeIcon className="mr-1" icon={faClock} size="sm" />
          Expired
        </div>
      )}
      {shouldShowRegenerate && (
        <Button
          colorSchema="secondary"
          className="mt-2"
          onClick={() => triggerLeaseRegeneration({})}
        >
          Regenerate
        </Button>
      )}
    </div>
  );
};

const COPY_NOTE =
  "Important: Copy these credentials now. You will not be able to see them again after you close the modal.";

const renderOutputForm = (
  provider: DynamicSecretProviders,
  data: unknown,
  triggerLeaseRegeneration: (details: { ttl?: string }) => Promise<void>
) => {
  if (provider === DynamicSecretProviders.Totp) {
    const { TOTP, TIME_REMAINING } = data as { TOTP: string; TIME_REMAINING: number };
    return (
      <TotpOutputDisplay
        totp={TOTP}
        remainingSeconds={TIME_REMAINING}
        triggerLeaseRegeneration={triggerLeaseRegeneration}
      />
    );
  }

  const entry = DYNAMIC_SECRET_PROVIDER_OUTPUTS[provider];
  if (!entry) return null;

  const record = (data ?? {}) as Record<string, unknown>;
  const presentFields = entry.outputFields.filter(
    (f) => record[f.name] !== undefined && record[f.name] !== null
  );

  if (!presentFields.length) return null;

  return (
    <div>
      {presentFields.map((f, idx) => {
        const isLast = idx === presentFields.length - 1;
        let helperText: ReactNode;
        if (isLast) {
          helperText = entry.extraNote ? (
            <div className="space-y-4">
              <p>{COPY_NOTE}</p>
              <p className="font-medium">{entry.extraNote}</p>
            </div>
          ) : (
            COPY_NOTE
          );
        }
        const raw = record[f.name];
        const value = typeof raw === "string" ? raw : JSON.stringify(raw);
        return <OutputDisplay key={f.name} label={f.label} value={value} helperText={helperText} />;
      })}
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

  return (
    <div>
      <AnimatePresence>
        {!isOutputMode && (
          <motion.div
            key="lease-input"
            transition={{ duration: 0.1 }}
            initial={{ opacity: 0, translateX: 30 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: 30 }}
          >
            <form onSubmit={handleSubmit(handleDynamicSecretLeaseCreate)}>
              <Controller
                control={control}
                name="namespace"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Namespace"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    helperText="The Kubernetes namespace to lease the dynamic secret to. If not specified, the first namespace defined in the configuration will be used."
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="ttl"
                defaultValue="1h"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label={<TtlFormLabel label="Default TTL" />}
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />
              <div className="mt-4 flex items-center space-x-4">
                <Button type="submit" isLoading={isSubmitting}>
                  Submit
                </Button>
                <Button variant="outline_bg" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </form>
          </motion.div>
        )}
        {isOutputMode && (
          <motion.div
            key="lease-output"
            transition={{ duration: 0.1 }}
            initial={{ opacity: 0, translateX: 30 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: 30 }}
          >
            {renderOutputForm(
              provider,
              createDynamicSecretLease.data?.data,
              handleLeaseRegeneration
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium">Private Key</h2>
        <div className="flex">
          <Tooltip content={copyTextPrivateKey}>
            <IconButton
              ariaLabel="copy icon"
              colorSchema="secondary"
              className="group relative"
              onClick={() => {
                navigator.clipboard.writeText(data.PRIVATE_KEY);
                setCopyTextPrivateKey("Copied");
              }}
            >
              <FontAwesomeIcon icon={isCopyingPrivateKey ? faCheck : faCopy} />
            </IconButton>
          </Tooltip>
          <Tooltip content="Download key.pem">
            <IconButton
              ariaLabel="download icon"
              colorSchema="secondary"
              className="group relative ml-2"
              onClick={() => downloadTxtFile("key.pem", data.PRIVATE_KEY)}
            >
              <FontAwesomeIcon icon={faDownload} />
            </IconButton>
          </Tooltip>
        </div>
      </div>
      <div className="mb-6 max-h-32 thin-scrollbar overflow-auto rounded-md bg-foreground/10 p-2 text-base text-label">
        <p className="mr-4 break-all whitespace-pre-wrap">{data.PRIVATE_KEY}</p>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium">Signed Certificate</h2>
        <div className="flex">
          <Tooltip content={copyTextSignedKey}>
            <IconButton
              ariaLabel="copy icon"
              colorSchema="secondary"
              className="group relative"
              onClick={() => {
                navigator.clipboard.writeText(data.SIGNED_KEY);
                setCopyTextSignedKey("Copied");
              }}
            >
              <FontAwesomeIcon icon={isCopyingSignedKey ? faCheck : faCopy} />
            </IconButton>
          </Tooltip>
          <Tooltip content="Download cert.pub">
            <IconButton
              ariaLabel="download icon"
              colorSchema="secondary"
              className="group relative ml-2"
              onClick={() => downloadTxtFile("cert.pub", data.SIGNED_KEY)}
            >
              <FontAwesomeIcon icon={faDownload} />
            </IconButton>
          </Tooltip>
        </div>
      </div>
      <div className="mb-6 max-h-32 thin-scrollbar overflow-auto rounded-md bg-foreground/10 p-2 text-base text-label">
        <p className="mr-4 break-all whitespace-pre-wrap">{data.SIGNED_KEY}</p>
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <FormLabel label="Set private key permissions" />
          <div className="flex gap-2">
            <Input value={chmodCommand} isDisabled />
            <IconButton
              ariaLabel="copy"
              variant="outline_bg"
              colorSchema="secondary"
              onClick={() => copyCommand(chmodCommand)}
              className="w-10"
            >
              <FontAwesomeIcon icon={faCopy} />
            </IconButton>
          </div>
        </div>
        <div>
          <FormLabel label="Connect to the target host" />
          <div className="flex gap-2">
            <Input value={sshCommand} isDisabled />
            <IconButton
              ariaLabel="copy"
              variant="outline_bg"
              colorSchema="secondary"
              onClick={() => copyCommand(sshCommand)}
              className="w-10"
            >
              <FontAwesomeIcon icon={faCopy} />
            </IconButton>
          </div>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted">
        Important: Copy or download these credentials now. You will not be able to see them again
        after you close the modal.
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

  return (
    <div>
      <AnimatePresence>
        {!isOutputMode && (
          <motion.div
            key="lease-input"
            transition={{ duration: 0.1 }}
            initial={{ opacity: 0, translateX: 30 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: 30 }}
          >
            <form onSubmit={handleSubmit(handleDynamicSecretLeaseCreate)}>
              <Controller
                control={control}
                name="principals"
                render={({ fieldState: { error } }) => (
                  <FormControl
                    label="Principals"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    helperText="The usernames to embed in the certificate (must be from the allowed list)"
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={principalInput}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setPrincipalInput(e.target.value)
                          }
                          placeholder="Enter principal name..."
                          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddPrincipal();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline_bg"
                          size="sm"
                          onClick={handleAddPrincipal}
                          isDisabled={!principalInput.trim()}
                        >
                          Add
                        </Button>
                      </div>
                      {principals.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {principals.map((principal: string, idx: number) => (
                            <Tag
                              className="bg-neutral/15 text-neutral"
                              key={principal}
                              onClose={() => handleRemovePrincipal(idx)}
                            >
                              {principal}
                            </Tag>
                          ))}
                        </div>
                      )}
                    </div>
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="ttl"
                defaultValue="1h"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label={<TtlFormLabel label="Default TTL" />}
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />
              <div className="mt-4 flex items-center space-x-4">
                <Button type="submit" isLoading={isSubmitting}>
                  Submit
                </Button>
                <Button variant="outline_bg" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </form>
          </motion.div>
        )}
        {isOutputMode && (
          <motion.div
            key="lease-output"
            transition={{ duration: 0.1 }}
            initial={{ opacity: 0, translateX: 30 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: 30 }}
          >
            <SshLeaseOutput
              data={
                createDynamicSecretLease.data?.data as { PRIVATE_KEY: string; SIGNED_KEY: string }
              }
              firstPrincipal={principals[0]}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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

const PROVIDERS_WITH_AUTOGENERATE_SUPPORT = [DynamicSecretProviders.Totp];

export const CreateDynamicSecretLease = ({
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
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ttl: "1h"
    }
  });
  const [isPreloading, setIsPreloading] = useToggle(
    PROVIDERS_WITH_AUTOGENERATE_SUPPORT.includes(provider)
  );

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
    if (provider === DynamicSecretProviders.Totp) {
      handleDynamicSecretLeaseCreate({});
    }
  }, [provider]);

  if (provider === DynamicSecretProviders.Kubernetes) {
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

  if (provider === DynamicSecretProviders.Ssh) {
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
    return <Spinner className="mx-auto h-40 text-mineshaft-700" />;
  }

  // Github tokens are fixed to 1 hour
  const fixedTtl = provider === DynamicSecretProviders.Github;

  return (
    <div>
      <AnimatePresence>
        {!isOutputMode && (
          <motion.div
            key="lease-input"
            transition={{ duration: 0.1 }}
            initial={{ opacity: 0, translateX: 30 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: 30 }}
          >
            <form onSubmit={handleSubmit(handleDynamicSecretLeaseCreate)}>
              <Controller
                control={control}
                name="ttl"
                defaultValue="1h"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label={<TtlFormLabel label="Default TTL" />}
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    helperText={
                      fixedTtl ? `This provider has a fixed TTL of ${field.value}` : undefined
                    }
                  >
                    <Input {...field} isDisabled={fixedTtl} />
                  </FormControl>
                )}
              />
              <div className="mt-4 flex items-center space-x-4">
                <Button type="submit" isLoading={isSubmitting}>
                  Submit
                </Button>
                <Button variant="outline_bg" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </form>
          </motion.div>
        )}
        {isOutputMode && (
          <motion.div
            key="lease-output"
            transition={{ duration: 0.1 }}
            initial={{ opacity: 0, translateX: 30 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: 30 }}
          >
            {renderOutputForm(
              provider,
              createDynamicSecretLease.data?.data,
              handleLeaseRegeneration
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
