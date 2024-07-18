import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Select, SelectItem } from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useWorkspace
} from "@app/context";
import { useGetActiveProjectKms, useGetExternalKmsList, useUpdateProjectKms } from "@app/hooks/api";

const formSchema = z.object({
  kmsKeyId: z.string()
});

type TForm = z.infer<typeof formSchema>;

const INTERNAL_KMS_KEY_ID = "internal";

export const EncryptionTab = () => {
  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();

  const { data: externalKmsList } = useGetExternalKmsList(currentOrg?.id!);
  const { data: activeKms } = useGetActiveProjectKms(currentWorkspace?.id!);

  const { mutateAsync: updateProjectKms } = useUpdateProjectKms(currentWorkspace?.id!);
  const [kmsKeyId, setKmsKeyId] = useState("");

  const {
    handleSubmit,
    control,
    setValue,
    formState: { isSubmitting, isDirty }
  } = useForm<TForm>({
    resolver: zodResolver(formSchema)
  });

  useEffect(() => {
    if (activeKms) {
      setKmsKeyId(activeKms.isExternal ? activeKms.id : INTERNAL_KMS_KEY_ID);
    } else {
      setKmsKeyId(INTERNAL_KMS_KEY_ID);
    }
  }, [activeKms]);

  useEffect(() => {
    if (kmsKeyId) {
      setValue("kmsKeyId", kmsKeyId);
    }
  }, [kmsKeyId]);

  const onFormSubmit = async (data: TForm) => {
    try {
      await updateProjectKms({
        secretManagerKmsKeyId: data.kmsKeyId
      });

      createNotification({
        text: "Successfully updated project KMS",
        type: "success"
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <h2 className="mb-2 flex-1 text-xl font-semibold text-mineshaft-100">Key Management</h2>
      <p className="mb-4 text-gray-400">
        Select which Key Management System to use for encrypting your project data
      </p>
      <div className="mb-6 max-w-md">
        <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Kms}>
          {(isAllowed) => (
            <Controller
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl errorText={error?.message} isError={Boolean(error)}>
                  <Select
                    {...field}
                    isDisabled={!isAllowed}
                    onValueChange={(e) => {
                      onChange(e);
                    }}
                    className="w-3/4 bg-mineshaft-600"
                  >
                    <SelectItem value={INTERNAL_KMS_KEY_ID} key="kms-internal">
                      Default Infisical KMS
                    </SelectItem>
                    {externalKmsList?.map((kms) => (
                      <SelectItem value={kms.id} key={`kms-${kms.id}`}>
                        {kms.slug}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              control={control}
              name="kmsKeyId"
            />
          )}
        </ProjectPermissionCan>
      </div>
      <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Workspace}>
        {(isAllowed) => (
          <Button
            colorSchema="secondary"
            type="submit"
            isDisabled={!isAllowed || isSubmitting || !isDirty}
            isLoading={isSubmitting}
          >
            Save
          </Button>
        )}
      </ProjectPermissionCan>
    </form>
  );
};
