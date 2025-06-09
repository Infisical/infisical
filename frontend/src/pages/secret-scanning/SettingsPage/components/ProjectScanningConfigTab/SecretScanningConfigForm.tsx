import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, FormControl, TextArea } from "@app/components/v2";
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
    try {
      await updateConfig.mutateAsync({
        projectId: config.projectId,
        content: content || null
      });

      createNotification({
        type: "success",
        text: "Configuration successfully updated"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Failed to update Configuration"
      });
    }
  };

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-mineshaft-100">Project Configuration</h2>
          <a
            target="_blank"
            href="https://infisical.com/docs/documentation/platform/secret-scanning/overview#configuration"
            className="mt-[0.02rem]"
            rel="noopener noreferrer"
          >
            <div className="inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
              <FontAwesomeIcon icon={faBookOpen} className="mb-[0.03rem] mr-1 text-[12px]" />
              <span>Docs</span>
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="mb-[0.07rem] ml-1 text-[10px]"
              />
            </div>
          </a>
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
                      className="thin-scrollbar min-h-[36rem] w-full !resize-none !resize-y"
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
