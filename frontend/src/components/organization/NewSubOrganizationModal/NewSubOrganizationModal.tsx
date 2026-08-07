import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import {
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
import { useOrganization } from "@app/context";
import { TSubOrganization, useCreateSubOrganization } from "@app/hooks/api";
import { selectOrganization } from "@app/hooks/api/auth/queries";
import { GenericResourceNameSchema, slugSchema } from "@app/lib/schemas";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCreated?: (organization: TSubOrganization) => void | Promise<void>;
};

const AddOrgSchema = z.object({
  name: GenericResourceNameSchema,
  // Optional: server auto-generates slug from name when not provided
  slug: z.union([slugSchema(), z.literal("")]).optional()
});

type FormData = z.infer<typeof AddOrgSchema>;

export const NewSubOrganizationModal = ({ isOpen, onOpenChange, onCreated }: Props) => {
  const { currentOrg, isSubOrganization } = useOrganization();
  const createSubOrg = useCreateSubOrganization();

  const {
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { isSubmitting }
  } = useForm({
    defaultValues: {
      name: "",
      slug: ""
    },
    resolver: zodResolver(AddOrgSchema)
  });

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    if (!open) reset();
  };

  const onSubmit = async ({ name, slug }: FormData) => {
    if (isSubOrganization && currentOrg.rootOrgId) {
      const { token } = await selectOrganization({
        organizationId: currentOrg.rootOrgId
      });

      SecurityClient.setToken(token);
    }

    const { organization } = await createSubOrg.mutateAsync({
      name,
      ...(slug?.trim() && { slug: slug.trim() })
    });

    createNotification({
      type: "success",
      text: "Successfully created sub organization"
    });
    handleOpenChange(false);

    await onCreated?.(organization);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Sub-Organization</DialogTitle>
          <DialogDescription>
            Create a new sub-organization under your organization.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <FieldGroup>
            <Controller
              control={control}
              name="name"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="sub-org-name">Display Name</FieldLabel>
                  <Input
                    id="sub-org-name"
                    autoFocus
                    value={value}
                    onChange={(e) => {
                      onChange(e);
                      setValue("slug", slugify(e.target.value, { lowercase: true }), {
                        shouldValidate: true
                      });
                    }}
                    placeholder="Acme Corp"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="slug"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="sub-org-slug">Slug</FieldLabel>
                  <Input
                    id="sub-org-slug"
                    placeholder="acme-corp"
                    isError={Boolean(error)}
                    {...field}
                  />
                  <FieldDescription>
                    Auto-generated from name when empty. Must be slug-friendly if set.
                  </FieldDescription>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="org" isPending={isSubmitting} isDisabled={isSubmitting}>
              Create Sub-Organization
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
