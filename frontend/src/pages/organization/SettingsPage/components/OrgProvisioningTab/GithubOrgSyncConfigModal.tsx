import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal, FormControl, Input } from "@app/components/v2";
import {
  useCreateGithubSyncOrgConfig,
  useDeleteGithubSyncOrgConfig,
  useUpdateGithubSyncOrgConfig
} from "@app/hooks/api";
import { TGithubOrgSyncConfig } from "@app/hooks/api/githubOrgSyncConfig/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  githubOrgName: z.string(),
  githubOrgAccessToken: z.string().optional()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  data?: TGithubOrgSyncConfig;
  popUp: UsePopUpState<["githubOrgSyncConfig", "deleteGithubOrgSyncConfig"]>;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteGithubOrgSyncConfig"]>,
    data?: {
      scimTokenId: string;
    }
  ) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["githubOrgSyncConfig", "deleteGithubOrgSyncConfig"]>,
    state?: boolean
  ) => void;
};

export const GithubOrgSyncConfigModal = ({
  popUp,
  handlePopUpOpen,
  handlePopUpToggle,
  data
}: Props) => {
  const isUpdate = Boolean(data);
  const { mutateAsync: createGithubSyncOrgConfig } = useCreateGithubSyncOrgConfig();
  const { mutateAsync: updateGithubSyncOrgConfig } = useUpdateGithubSyncOrgConfig();
  const { mutateAsync: deleteGithubSyncOrgConfig } = useDeleteGithubSyncOrgConfig();

  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    values: data ? { githubOrgName: data.githubOrgName, githubOrgAccessToken: "" } : undefined
  });

  const onFormSubmit = async ({ githubOrgName, githubOrgAccessToken }: FormData) => {
    if (isUpdate) {
      await updateGithubSyncOrgConfig({
        githubOrgName,
        githubOrgAccessToken
      });

      createNotification({
        text: "Successfully updated GitHub Organization Sync",
        type: "success"
      });
    } else {
      await createGithubSyncOrgConfig({
        githubOrgName,
        githubOrgAccessToken,
        isActive: false
      });

      createNotification({
        text: "Successfully created GitHub Organization Sync",
        type: "success"
      });
    }
    handlePopUpToggle("githubOrgSyncConfig");
  };

  const onDelete = async () => {
    await deleteGithubSyncOrgConfig();

    handlePopUpToggle("deleteGithubOrgSyncConfig", false);
    handlePopUpToggle("githubOrgSyncConfig", false);
    createNotification({
      text: "Successfully deleted GitHub Organization Sync",
      type: "success"
    });
  };

  return (
    <>
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Controller
          control={control}
          defaultValue=""
          name="githubOrgName"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="GitHub Organization Name"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input {...field} placeholder="example" />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="githubOrgAccessToken"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="GitHub Access Token"
              isError={Boolean(error)}
              isOptional
              errorText={error?.message}
              helperText="Required for manual sync operations. The token must have 'read:org' permissions."
            >
              <Input {...field} type="password" placeholder="ghp_xxxxxxxxxxxx" />
            </FormControl>
          )}
        />
        <div className="flex gap-8 pt-4">
          <Button type="submit" isLoading={isSubmitting} isDisabled={isSubmitting}>
            {isUpdate ? "Update" : "Configure"}
          </Button>
          <Button
            variant="plain"
            colorSchema="secondary"
            onClick={() => handlePopUpToggle("githubOrgSyncConfig", false)}
          >
            Cancel
          </Button>
          <div className="grow" />
          {isUpdate && (
            <Button
              onClick={() => handlePopUpOpen("deleteGithubOrgSyncConfig")}
              colorSchema="danger"
            >
              Delete
            </Button>
          )}
        </div>
      </form>
      <DeleteActionModal
        isOpen={popUp.deleteGithubOrgSyncConfig.isOpen}
        title="Are you sure you want to remove GitHub organization sync?"
        onChange={(isOpen) => handlePopUpToggle("deleteGithubOrgSyncConfig", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={onDelete}
      />
    </>
  );
};
