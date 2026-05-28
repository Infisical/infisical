import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useUpdateWsEnvironment } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  popUp: UsePopUpState<["updateEnv"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["updateEnv"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["updateEnv"]>, state?: boolean) => void;
};

const schema = z.object({
  name: z.string(),
  slug: slugSchema({ min: 1, max: 64 })
});

export type FormData = z.infer<typeof schema>;

export const UpdateEnvironmentModal = ({ popUp, handlePopUpClose, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const { mutateAsync, isPending } = useUpdateWsEnvironment();
  const { control, handleSubmit, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    values: popUp.updateEnv.data as FormData
  });

  const oldEnvId = (popUp?.updateEnv?.data as { id: string })?.id;

  const onFormSubmit = async ({ name, slug }: FormData) => {
    if (!currentProject?.id) return;

    await mutateAsync({
      projectId: currentProject.id,
      name,
      slug,
      id: oldEnvId
    });

    createNotification({
      text: "Successfully updated environment",
      type: "success"
    });

    handlePopUpClose("updateEnv");
  };

  return (
    <Dialog
      open={popUp?.updateEnv?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("updateEnv", isOpen);
        if (!isOpen) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Environment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-6">
          <Controller
            control={control}
            defaultValue=""
            name="name"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="updateEnvName">Environment Name</FieldLabel>
                <Input id="updateEnvName" isError={Boolean(error)} {...field} />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="slug"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="updateEnvSlug">Environment Slug</FieldLabel>
                <Input id="updateEnvSlug" isError={Boolean(error)} {...field} />
                <FieldError>{error?.message}</FieldError>
                <FieldDescription>
                  Slugs are shorthand identifiers used to reference this environment.
                </FieldDescription>
              </Field>
            )}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="project" isPending={isPending} isDisabled={isPending}>
              Update
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
