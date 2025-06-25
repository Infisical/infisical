import { ReactNode, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faClock, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  IconButton,
  Input,
  SecretInput,
  Spinner,
  Tooltip
} from "@app/components/v2";
import { useTimedReset, useToggle } from "@app/hooks";
import { useCreateDynamicSecretLease } from "@app/hooks/api";
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
      <FormControl label={label} className="flex-grow" helperText={helperText}>
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
          className="absolute right-2 top-7"
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

const renderOutputForm = (
  provider: DynamicSecretProviders,
  data: unknown,
  triggerLeaseRegeneration: (details: { ttl?: string }) => Promise<void>
) => {
  if (
    provider === DynamicSecretProviders.SqlDatabase ||
    provider === DynamicSecretProviders.Cassandra ||
    provider === DynamicSecretProviders.MongoAtlas ||
    provider === DynamicSecretProviders.MongoDB ||
    provider === DynamicSecretProviders.Vertica ||
    provider === DynamicSecretProviders.SapAse
  ) {
    const { DB_PASSWORD, DB_USERNAME } = data as { DB_USERNAME: string; DB_PASSWORD: string };
    return (
      <div>
        <OutputDisplay label="Database User" value={DB_USERNAME} />
        <OutputDisplay
          label="Database Password"
          value={DB_PASSWORD}
          helperText="Important: Copy these credentials now. You will not be able to see them again after you close the modal."
        />
      </div>
    );
  }

  if (provider === DynamicSecretProviders.AwsIam) {
    const { USERNAME, ACCESS_KEY, SECRET_ACCESS_KEY } = data as {
      ACCESS_KEY: string;
      SECRET_ACCESS_KEY: string;
      USERNAME: string;
    };
    return (
      <div>
        <OutputDisplay label="AWS Username" value={USERNAME} />
        <OutputDisplay label="AWS IAM Access Key" value={ACCESS_KEY} />
        <OutputDisplay
          label="AWS IAM Secret Key"
          value={SECRET_ACCESS_KEY}
          helperText="Important: Copy these credentials now. You will not be able to see them again after you close the modal."
        />
      </div>
    );
  }

  if (provider === DynamicSecretProviders.Redis) {
    const { DB_USERNAME, DB_PASSWORD } = data as {
      DB_USERNAME: string;
      DB_PASSWORD: string;
    };

    return (
      <div>
        <OutputDisplay label="Redis Username" value={DB_USERNAME} />
        <OutputDisplay
          label="Redis Password"
          value={DB_PASSWORD}
          helperText="Important: Copy these credentials now. You will not be able to see them again after you close the modal."
        />
      </div>
    );
  }

  if (provider === DynamicSecretProviders.AwsElastiCache) {
    const { DB_USERNAME, DB_PASSWORD } = data as {
      DB_USERNAME: string;
      DB_PASSWORD: string;
    };

    return (
      <div>
        <OutputDisplay label="Cluster Username" value={DB_USERNAME} />
        <OutputDisplay
          label="Cluster Password"
          value={DB_PASSWORD}
          helperText={
            <div className="space-y-4">
              <p>
                Important: Copy these credentials now. You will not be able to see them again after
                you close the modal.
              </p>
              <p className="font-medium">
                Please note that it may take a few minutes before the credentials are available for
                use.
              </p>
            </div>
          }
        />
      </div>
    );
  }

  if (provider === DynamicSecretProviders.RabbitMq) {
    const { DB_USERNAME, DB_PASSWORD } = data as {
      DB_USERNAME: string;
      DB_PASSWORD: string;
    };

    return (
      <div>
        <OutputDisplay label="Username" value={DB_USERNAME} />
        <OutputDisplay
          label="Password"
          value={DB_PASSWORD}
          helperText="Important: Copy these credentials now. You will not be able to see them again after you close the modal."
        />
      </div>
    );
  }

  if (provider === DynamicSecretProviders.ElasticSearch) {
    const { DB_USERNAME, DB_PASSWORD } = data as {
      DB_USERNAME: string;
      DB_PASSWORD: string;
    };

    return (
      <div>
        <OutputDisplay label="Username" value={DB_USERNAME} />
        <OutputDisplay
          label="Password"
          value={DB_PASSWORD}
          helperText="Important: Copy these credentials now. You will not be able to see them again after you close the modal."
        />
      </div>
    );
  }

  if (provider === DynamicSecretProviders.AzureEntraId) {
    const { email, password } = data as {
      email: string;
      password: string;
    };

    return (
      <div>
        <OutputDisplay label="Email" value={email} />
        <OutputDisplay
          label="Password"
          value={password}
          helperText="Important: Copy these credentials now. You will not be able to see them again after you close the modal."
        />
      </div>
    );
  }

  if (provider === DynamicSecretProviders.Ldap) {
    const { USERNAME, PASSWORD, DN_ARRAY } = data as {
      USERNAME: string;
      PASSWORD: string;
      DN_ARRAY: string[];
    };

    return (
      <div>
        <OutputDisplay label="Username" value={USERNAME} />
        <OutputDisplay
          label="Password"
          value={PASSWORD}
          helperText="Important: Copy these credentials now. You will not be able to see them again after you close the modal."
        />
        <FormControl label="DNs" className="flex-grow">
          <SecretInput
            isReadOnly
            isVisible
            value={JSON.stringify(DN_ARRAY)}
            containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5"
          />
        </FormControl>
      </div>
    );
  }

  if (
    provider === DynamicSecretProviders.SapHana ||
    provider === DynamicSecretProviders.Snowflake
  ) {
    const { DB_USERNAME, DB_PASSWORD } = data as {
      DB_USERNAME: string;
      DB_PASSWORD: string;
    };

    return (
      <div>
        <OutputDisplay label="Username" value={DB_USERNAME} />
        <OutputDisplay
          label="Password"
          value={DB_PASSWORD}
          helperText="Important: Copy these credentials now. You will not be able to see them again after you close the modal."
        />
      </div>
    );
  }

  if (provider === DynamicSecretProviders.Kubernetes) {
    const { TOKEN } = data as { TOKEN: string };

    return (
      <div>
        <OutputDisplay
          label="Service Account JWT"
          value={TOKEN}
          helperText="Important: Copy these credentials now. You will not be able to see them again after you close the modal."
        />
      </div>
    );
  }

  if (provider === DynamicSecretProviders.Totp) {
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

  if (provider === DynamicSecretProviders.GcpIam) {
    const { TOKEN, SERVICE_ACCOUNT_EMAIL } = data as {
      SERVICE_ACCOUNT_EMAIL: string;
      TOKEN: string;
    };

    return (
      <div>
        <OutputDisplay label="Service Account Email" value={SERVICE_ACCOUNT_EMAIL} />
        <OutputDisplay
          label="Token"
          value={TOKEN}
          helperText="Important: Copy these credentials now. You will not be able to see them again after you close the modal."
        />
      </div>
    );
  }

  if (provider === DynamicSecretProviders.Github) {
    const { TOKEN } = data as {
      TOKEN: string;
    };

    return (
      <div>
        <OutputDisplay
          label="Token"
          value={TOKEN}
          helperText="Important: Copy these credentials now. You will not be able to see them again after you close the modal."
        />
      </div>
    );
  }

  return null;
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
    try {
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
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to lease dynamic secret"
      });
    }
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
    try {
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
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to lease dynamic secret"
      });
    }
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
