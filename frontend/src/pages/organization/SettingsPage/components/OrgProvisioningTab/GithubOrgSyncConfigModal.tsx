import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input
} from "@app/components/v3";
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
      <Dialog
        open={popUp?.githubOrgSyncConfig?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("githubOrgSyncConfig", isOpen)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage GitHub Organization Sync</DialogTitle>
            <DialogDescription>
              Sync your GitHub teams to Infisical organization groups.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <FieldGroup>
              <Controller
                control={control}
                defaultValue=""
                name="githubOrgName"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="github-org-name">GitHub Organization Name</FieldLabel>
                    <Input
                      id="github-org-name"
                      placeholder="example"
                      isError={Boolean(error)}
                      {...field}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Controller
                control={control}
                defaultValue=""
                name="githubOrgAccessToken"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="github-org-token">
                      GitHub Access Token (Optional)
                    </FieldLabel>
                    <Input
                      id="github-org-token"
                      type="password"
                      placeholder="ghp_xxxxxxxxxxxx"
                      isError={Boolean(error)}
                      {...field}
                    />
                    <FieldDescription>
                      Required for manual sync operations. The token must have &apos;read:org&apos;
                      permissions.
                    </FieldDescription>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            </FieldGroup>
            <DialogFooter className="mt-6">
              {isUpdate && (
                <Button
                  type="button"
                  variant="danger"
                  className="mr-auto"
                  onClick={() => handlePopUpOpen("deleteGithubOrgSyncConfig")}
                >
                  Delete
                </Button>
              )}
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="org" isPending={isSubmitting}>
                {isUpdate ? "Update" : "Configure"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={popUp.deleteGithubOrgSyncConfig.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteGithubOrgSyncConfig", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>Remove GitHub Organization Sync?</AlertDialogTitle>
            <AlertDialogDescription>
              Organization members will no longer have their groups synced from GitHub teams.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={onDelete}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
