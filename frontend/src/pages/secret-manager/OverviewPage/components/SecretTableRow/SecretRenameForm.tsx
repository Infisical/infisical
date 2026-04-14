import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { faLock, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, ModalClose, Tooltip } from "@app/components/v2";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { useToggle } from "@app/hooks";
import { useUpdateSecretV3 } from "@app/hooks/api";
import { SecretType, SecretV3RawSanitized } from "@app/hooks/api/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";

enum SecretActionType {
  Created = "created",
  Modified = "modified",
  Deleted = "deleted"
}

type Props = {
  secretKey: string;
  secretPath: string;
  environments: { name: string; slug: string }[];
  getSecretByKey: (slug: string, key: string) => SecretV3RawSanitized | undefined;
};

export const formSchema = z.object({
  key: z.string().trim().min(1, { message: "Secret key is required" })
});

type TFormSchema = z.infer<typeof formSchema>;

function SecretRenameForm({ environments, getSecretByKey, secretKey, secretPath }: Props) {
  const { currentProject, projectId } = useProject();
  const { permission } = useProjectPermission();

  const secrets = environments.map((env) => getSecretByKey(env.slug, secretKey));

  const isReadOnly = environments.some((env) => {
    const environment = env.slug;
    const secretDetails = getSecretByKey(environment, secretKey);
    const secretPermissionSubject = subject(ProjectPermissionSub.Secrets, {
      environment,
      secretPath,
      secretName: secretKey,
      secretTags: (secretDetails?.tags || []).map((i) => i.slug)
    });
    const isSecretInEnvReadOnly =
      hasSecretReadValueOrDescribePermission(
        permission,
        ProjectPermissionSecretActions.DescribeSecret,
        secretPermissionSubject
      ) && permission.cannot(ProjectPermissionSecretActions.Edit, secretPermissionSubject);
    if (isSecretInEnvReadOnly) {
      return true;
    }
    return false;
  });

  const isOverriden = secrets.some(
    (secret) =>
      secret?.overrideAction === SecretActionType.Created ||
      secret?.overrideAction === SecretActionType.Modified
  );

  const [isSecNameCopied, setIsSecNameCopied] = useToggle(false);

  const { mutateAsync: updateSecretV3 } = useUpdateSecretV3();

  const {
    handleSubmit,
    control,
    watch,
    formState: { isDirty, isSubmitting }
  } = useForm<TFormSchema>({
    defaultValues: { key: secretKey },
    values: { key: secretKey },
    resolver: zodResolver(formSchema)
  });

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isSecNameCopied) {
      timer = setTimeout(() => setIsSecNameCopied.off(), 2000);
    }
    return () => clearTimeout(timer);
  }, [isSecNameCopied]);

  const handleFormSubmit = async (data: TFormSchema) => {
    if (!data.key) {
      createNotification({
        type: "error",
        text: "Secret name cannot be empty"
      });
      return;
    }

    const promises = secrets
      .filter((secret) => !!secret)
      .map((secret) => {
        if (!secret) return null;

        return updateSecretV3({
          environment: secret?.env,
          projectId,
          secretPath,
          secretKey: secret.key,
          type: SecretType.Shared,
          newSecretName: data.key
        });
      });

    await Promise.all(promises)
      .then(() => {
        createNotification({
          type: "success",
          text: "Successfully renamed the secret"
        });
      })
      .catch(() => {
        createNotification({
          type: "error",
          text: "Error renaming the secret"
        });
      });
  };

  const currentSecretValue = watch("key");

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      <Controller
        name="key"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Name" isError={Boolean(error)} errorText={error?.message}>
            <Input
              rightIcon={
                isReadOnly || isOverriden ? (
                  <Tooltip className="w-full max-w-72" content="Read only">
                    <FontAwesomeIcon icon={faLock} />
                  </Tooltip>
                ) : (
                  currentSecretValue?.trim()?.includes(" ") &&
                  currentSecretValue?.trim() !== secretKey && (
                    <Tooltip
                      className="w-full max-w-72"
                      content={
                        <div>
                          Secret key contains whitespaces.
                          <br />
                          <br /> If this is the desired format, you need to provide it as{" "}
                          <code className="rounded-md bg-mineshaft-500 px-1 py-0.5">
                            {encodeURIComponent(secretKey.trim())}
                          </code>{" "}
                          when making API requests.
                        </div>
                      }
                    >
                      <FontAwesomeIcon icon={faWarning} className="text-yellow-600" />
                    </Tooltip>
                  )
                )
              }
              autoComplete="off"
              isReadOnly={isReadOnly || secrets.filter(Boolean).length === 0}
              autoCapitalization={currentProject?.autoCapitalization}
              isDisabled={isOverriden}
              placeholder={error?.message}
              isError={Boolean(error)}
              {...field}
            />
          </FormControl>
        )}
      />
      <div className="mt-8 flex items-center">
        <Button
          className="mr-4"
          type="submit"
          isDisabled={isSubmitting || !isDirty}
          isLoading={isSubmitting}
        >
          Update Name
        </Button>
        <ModalClose asChild>
          <Button variant="plain" colorSchema="secondary">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </form>
  );
}

export default SecretRenameForm;
