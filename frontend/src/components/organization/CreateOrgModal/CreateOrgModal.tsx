import { FC } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import z from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useCreateOrg, useSelectOrganization } from "@app/hooks/api";
import { GenericResourceNameSchema } from "@app/lib/schemas";

const schema = z
  .object({
    name: GenericResourceNameSchema.nonempty({ message: "Name is required" })
  })
  .required();

export type FormData = z.infer<typeof schema>;

interface CreateOrgModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const CreateOrgModal: FC<CreateOrgModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: ""
    }
  });

  const { mutateAsync: createOrg } = useCreateOrg({
    invalidate: false
  });
  const { mutateAsync: selectOrg } = useSelectOrganization();

  const onFormSubmit = async ({ name }: FormData) => {
    const organization = await createOrg({ name });

    await selectOrg({ organizationId: organization.id });

    createNotification({
      text: "Successfully created organization",
      type: "success"
    });

    navigate({
      to: "/organizations/$orgId/projects",
      params: { orgId: organization.id }
    });

    localStorage.setItem("orgData.id", organization.id);

    reset();
    onClose?.();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose?.();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
          <DialogDescription>
            Welcome! It looks like you haven&apos;t joined or created an organization yet. Create
            one to get started.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            defaultValue=""
            name="name"
            render={({ field, fieldState: { error } }) => (
              <div className="mb-4">
                <FieldLabel>Name</FieldLabel>
                <Input {...field} placeholder="Acme Corp" className="h-10" />
                {error && <FieldError>{error.message}</FieldError>}
              </div>
            )}
          />
          <DialogFooter>
            {onClose && (
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              variant="project"
              isPending={isSubmitting}
              isDisabled={isSubmitting}
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
