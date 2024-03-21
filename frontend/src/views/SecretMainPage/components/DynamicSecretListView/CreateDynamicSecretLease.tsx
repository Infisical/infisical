import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import ms from "ms";
import { z } from "zod";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { TtlFormLabel } from "@app/components/features";
import { Button, FormControl, IconButton, Input, SecretInput, Tooltip } from "@app/components/v2";
import { useTimedReset } from "@app/hooks";
import { useCreateDynamicSecretLease } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

const formSchema = z.object({
  ttl: z.string().refine((val) => ms(val) > 0, "TTL must be a positive number")
});
type TForm = z.infer<typeof formSchema>;

type Props = {
  onClose: () => void;
  slug: string;
  provider: DynamicSecretProviders;
  projectId: string;
  environment: string;
  secretPath: string;
};

const OutputDisplay = ({
  value,
  label,
  helperText
}: {
  value: string;
  label: string;
  helperText?: string;
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

const renderOutputForm = (provider: DynamicSecretProviders, data: unknown) => {
  const { username, password } = data as { username: string; password: string };
  if (provider === DynamicSecretProviders.SqlDatabase) {
    return (
      <div>
        <OutputDisplay label="Database User" value={username} />
        <OutputDisplay
          label="Database Password"
          value={password}
          helperText="Important: Copy this information now. It will disappear after this.opy this values as you won't be able to see it again."
        />
      </div>
    );
  }
  return null;
};

export const CreateDynamicSecretLease = ({
  onClose,
  projectId,
  slug,
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
  const { createNotification } = useNotificationContext();

  const createDynamicSecretLease = useCreateDynamicSecretLease();

  const handleDynamicSecretLeaseCreate = async ({ ttl }: TForm) => {
    if(createDynamicSecretLease.isLoading) return;
    try {
      await createDynamicSecretLease.mutateAsync({
        environment,
        projectId,
        path: secretPath,
        ttl,
        slug
      });
      createNotification({
        type: "success",
        text: "Successfully deleted folder"
      });
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to delete folder"
      });
    }
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
            {renderOutputForm(provider, createDynamicSecretLease.data?.data)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
