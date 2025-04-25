import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Select, SelectItem } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import {
  useGetProjectSshConfig,
  useListWorkspaceSshCas,
  useUpdateProjectSshConfig
} from "@app/hooks/api";

const schema = z
  .object({
    defaultUserSshCaId: z.string(),
    defaultHostSshCaId: z.string()
  })
  .required();

export type FormData = z.infer<typeof schema>;

export const ProjectSshConfigCasSection = () => {
  const { currentWorkspace } = useWorkspace();
  const { data: sshConfig } = useGetProjectSshConfig(currentWorkspace.id);
  const { data: sshCas } = useListWorkspaceSshCas(currentWorkspace.id);
  const { mutate: updateProjectSshConfig } = useUpdateProjectSshConfig();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  useEffect(() => {
    if (sshConfig) {
      reset({
        defaultUserSshCaId: sshConfig.defaultUserSshCaId || "",
        defaultHostSshCaId: sshConfig.defaultHostSshCaId || ""
      });
    }
  }, [sshConfig]);

  const onFormSubmit = async ({ defaultUserSshCaId, defaultHostSshCaId }: FormData) => {
    try {
      await updateProjectSshConfig({
        projectId: currentWorkspace.id,
        defaultUserSshCaId: defaultUserSshCaId || undefined,
        defaultHostSshCaId: defaultHostSshCaId || undefined
      });

      createNotification({
        text: "Successfully updated SSH project settings",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to update SSH project settings",
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <p className="mb-8 text-xl font-semibold">Certificate Authorities</p>
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Controller
          control={control}
          name="defaultUserSshCaId"
          defaultValue=""
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <FormControl
              label="Default User CA"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Select
                defaultValue={field.value}
                {...field}
                onValueChange={(e) => onChange(e)}
                className="min-w-[20rem]"
              >
                {sshCas?.map(({ id, friendlyName }) => (
                  <SelectItem value={String(id || "")} key={friendlyName}>
                    {friendlyName}
                  </SelectItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="defaultHostSshCaId"
          defaultValue=""
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <FormControl
              label="Default Host CA"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Select
                defaultValue={field.value}
                {...field}
                onValueChange={(e) => onChange(e)}
                className="min-w-[20rem]"
              >
                {sshCas?.map(({ id, friendlyName }) => (
                  <SelectItem value={String(id || "")} key={friendlyName}>
                    {friendlyName}
                  </SelectItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
        <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Project}>
          {(isAllowed) => (
            <Button
              colorSchema="secondary"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting || !isAllowed}
            >
              Save
            </Button>
          )}
        </ProjectPermissionCan>
      </form>
    </div>
  );
};
