import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, FormControl, TextArea } from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
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
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-medium text-mineshaft-100">Project Configuration</h2>
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-scanning/usage#configuration" />
        </div>
        <p className="leading-5 text-mineshaft-400">
          Configure rules and exceptions to customize scanning
        </p>
      </div>
      <div>
        <form onSubmit={handleSubmit(onSubmit)} className="flex w-full flex-col">
          <ProjectPermissionCan
            I={ProjectPermissionSecretScanningConfigActions.Update}
            a={ProjectPermissionSub.SecretScanningConfigs}
          >
            {(isAllowed) => (
              <Controller
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl isError={Boolean(error)} errorText={error?.message}>
                    <TextArea
                      placeholder={
                        "[extend]\n\nuseDefault = true\n\n# See docs for configuration guide"
                      }
                      {...field}
                      rows={3}
                      className="min-h-144 thin-scrollbar w-full resize-none! resize-y!"
                      isDisabled={!isAllowed}
                    />
                  </FormControl>
                )}
                control={control}
                name="content"
              />
            )}
          </ProjectPermissionCan>
          <ProjectPermissionCan
            I={ProjectPermissionSecretScanningConfigActions.Update}
            a={ProjectPermissionSub.SecretScanningConfigs}
          >
            {(isAllowed) => (
              <Button
                colorSchema="secondary"
                type="submit"
                className="w-min"
                isLoading={updateConfig.isPending}
                isDisabled={updateConfig.isPending || !isAllowed || !isDirty}
              >
                Save
              </Button>
            )}
          </ProjectPermissionCan>
        </form>
      </div>
    </div>
  );
};
