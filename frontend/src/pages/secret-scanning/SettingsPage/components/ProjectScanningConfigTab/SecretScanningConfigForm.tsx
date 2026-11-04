import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Field,
  FieldError,
  TextArea
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretScanningConfigActions } from "@app/context/ProjectPermissionContext/types";
import {
  TSecretScanningConfig,
  useUpdateSecretScanningConfig
} from "@app/hooks/api/secretScanningV2";

type Props = {
  config: TSecretScanningConfig;
};

const FormSchema = z.object({
  content: z.string().max(5000, "Configuration cannot exceed 5000 characters").optional()
});

type FormType = z.infer<typeof FormSchema>;

export const SecretScanningConfigForm = ({ config }: Props) => {
  const updateConfig = useUpdateSecretScanningConfig();

  const {
    handleSubmit,
    control,
    formState: { isDirty }
  } = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      content: config.content ?? ""
    }
  });

  const onSubmit = async ({ content }: FormType) => {
    await updateConfig.mutateAsync({
      projectId: config.projectId,
      content: content || null
    });

    createNotification({
      type: "success",
      text: "Configuration successfully updated"
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card>
        <CardHeader>
          <CardTitle>
            Scanning Configuration
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-scanning/configuration" />
          </CardTitle>
          <CardDescription>Configure rules and exceptions to customize scanning</CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectPermissionCan
            I={ProjectPermissionSecretScanningConfigActions.Update}
            a={ProjectPermissionSub.SecretScanningConfigs}
          >
            {(isAllowed) => (
              <Controller
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <TextArea
                      aria-label="Scanning configuration"
                      placeholder={
                        "[extend]\n\nuseDefault = true\n\n# See docs for configuration guide"
                      }
                      {...field}
                      rows={3}
                      className="min-h-144 resize-y"
                      isError={Boolean(error)}
                      disabled={!isAllowed}
                    />
                    <FieldError errors={[error]} />
                  </Field>
                )}
                control={control}
                name="content"
              />
            )}
          </ProjectPermissionCan>
        </CardContent>
        <CardFooter className="justify-end">
          <ProjectPermissionCan
            I={ProjectPermissionSecretScanningConfigActions.Update}
            a={ProjectPermissionSub.SecretScanningConfigs}
          >
            {(isAllowed) => (
              <Button
                variant="ss"
                type="submit"
                isPending={updateConfig.isPending}
                isDisabled={updateConfig.isPending || !isAllowed || !isDirty}
              >
                Save
              </Button>
            )}
          </ProjectPermissionCan>
        </CardFooter>
      </Card>
    </form>
  );
};
