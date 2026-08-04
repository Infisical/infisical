import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { LockIcon, TriangleAlertIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DialogClose,
  Field,
  FieldError,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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

  const showWhitespaceWarning =
    !isReadOnly &&
    !isOverriden &&
    currentSecretValue?.trim()?.includes(" ") &&
    currentSecretValue?.trim() !== secretKey;

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      <Controller
        name="key"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="rename-secret-key">Name</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="rename-secret-key"
                autoComplete="off"
                readOnly={isReadOnly || secrets.filter(Boolean).length === 0}
                onInput={(e) => {
                  if (currentProject?.autoCapitalization) {
                    e.currentTarget.value = e.currentTarget.value.toUpperCase();
                  }
                }}
                disabled={isOverriden}
                placeholder={error?.message}
                isError={Boolean(error)}
                {...field}
              />
              {(isReadOnly || isOverriden) && (
                <InputGroupAddon align="inline-end">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <LockIcon className="size-4" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-72">Read only</TooltipContent>
                  </Tooltip>
                </InputGroupAddon>
              )}
              {showWhitespaceWarning && (
                <InputGroupAddon align="inline-end">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TriangleAlertIcon className="size-4 text-warning" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-72">
                      <div>
                        Secret key contains whitespaces.
                        <br />
                        <br /> If this is the desired format, you need to provide it as{" "}
                        <code className="rounded-md bg-container px-1 py-0.5">
                          {encodeURIComponent(secretKey.trim())}
                        </code>{" "}
                        when making API requests.
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </InputGroupAddon>
              )}
            </InputGroup>
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <div className="mt-8 flex items-center gap-4">
        <Button type="submit" isDisabled={isSubmitting || !isDirty} isPending={isSubmitting}>
          Update Name
        </Button>
        <DialogClose asChild>
          <Button variant="ghost" type="button">
            Cancel
          </Button>
        </DialogClose>
      </div>
    </form>
  );
}

export default SecretRenameForm;
