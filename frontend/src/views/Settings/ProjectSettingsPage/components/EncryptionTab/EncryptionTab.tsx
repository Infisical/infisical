import { Controller, useForm } from "react-hook-form";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, ContentLoader, FormControl, Select, SelectItem } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useOrganization } from "@app/context";
import { useGetExternalKmsList } from "@app/hooks/api";

export const EncryptionTab = () => {
  const { handleSubmit, control } = useForm();
  const { currentOrg } = useOrganization();

  const { data: externalKmsList, isLoading: isExternalKmsListLoading } = useGetExternalKmsList(
    currentOrg?.id!
  );

  const onFormSubmit = () => {};

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <h2 className="mb-2 flex-1 text-xl font-semibold text-mineshaft-100">Key Management</h2>
      <p className="mb-4 text-gray-400">
        Select which Key Management System to use for encrypting project data
      </p>
      <div className="mb-6 max-w-md">
        {isExternalKmsListLoading ? (
          <ContentLoader />
        ) : (
          <Controller
            defaultValue=""
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl errorText={error?.message} isError={Boolean(error)}>
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => {
                    onChange(e);
                  }}
                  className="w-3/4 bg-mineshaft-600"
                >
                  {externalKmsList?.map((kms) => (
                    <SelectItem value={kms.id} key={`kms-${kms.id}`}>
                      {kms.slug}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
            control={control}
            name="name"
          />
        )}
      </div>
      <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Workspace}>
        {(isAllowed) => (
          <Button colorSchema="secondary" type="submit" isDisabled={!isAllowed}>
            Save
          </Button>
        )}
      </ProjectPermissionCan>
    </form>
  );
};
