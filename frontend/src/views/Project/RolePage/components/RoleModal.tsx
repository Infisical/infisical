import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import {
  useCreateProjectRole,
  useGetProjectRoleBySlug,
  useUpdateProjectRole} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z
  .object({
    name: z.string(),
    description: z.string(),
    slug: z.string()
  })
  .required();

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["role"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["role"]>, state?: boolean) => void;
};

export const RoleModal = ({ popUp, handlePopUpToggle }: Props) => {
  const router = useRouter();

  const popupData = popUp?.role?.data as {
    roleSlug: string;
  };

  const { currentWorkspace } = useWorkspace();
  const projectSlug = currentWorkspace?.slug || "";

  const { data: role } = useGetProjectRoleBySlug(projectSlug, popupData?.roleSlug ?? "");

  const { mutateAsync: createProjectRole } = useCreateProjectRole();
  const { mutateAsync: updateProjectRole } = useUpdateProjectRole();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: ""
    }
  });

  useEffect(() => {
    if (role) {
      reset({
        name: role.name,
        description: role.description,
        slug: role.slug
      });
    } else {
      reset({
        name: "",
        description: "",
        slug: ""
      });
    }
  }, [role]);

  const onFormSubmit = async ({ name, description, slug }: FormData) => {
    try {
      if (!projectSlug) return;

      if (role) {
        // update
        await updateProjectRole({
          id: role.id,
          projectSlug,
          name,
          description,
          slug
        });

        handlePopUpToggle("role", false);
      } else {
        // create
        const newRole = await createProjectRole({
          projectSlug,
          name,
          description,
          slug,
          permissions: []
        });

        router.push(`/project/${currentWorkspace?.id}/roles/${newRole.slug}`);
        handlePopUpToggle("role", false);
      }

      createNotification({
        text: `Successfully ${popUp?.role?.data ? "updated" : "created"} role`,
        type: "success"
      });

      reset();
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text =
        error?.response?.data?.message ??
        `Failed to ${popUp?.role?.data ? "update" : "create"} role`;

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.role?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("role", isOpen);
        reset();
      }}
    >
      <ModalContent title={`${popUp?.role?.data ? "Update" : "Create"} Role`}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            defaultValue=""
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Name"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="Billing Team" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="slug"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Slug"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="billing" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="description"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Description" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="To manage billing" />
              </FormControl>
            )}
          />
          <div className="flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              {popUp?.role?.data ? "Update" : "Create"}
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("role", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
