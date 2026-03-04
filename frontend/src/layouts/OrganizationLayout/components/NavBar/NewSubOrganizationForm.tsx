import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button, FormControl, Input } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useCreateSubOrganization } from "@app/hooks/api";
import { selectOrganization } from "@app/hooks/api/auth/queries";
import { GenericResourceNameSchema, slugSchema } from "@app/lib/schemas";

type ContentProps = {
  onClose: () => void;
  handleOrgSelection: (params: { organizationId: string }) => void;
};

const AddOrgSchema = z.object({
  name: GenericResourceNameSchema,
  // Optional: server auto-generates slug from name when not provided
  slug: z.union([slugSchema(), z.literal("")]).optional()
});

type FormData = z.infer<typeof AddOrgSchema>;

export const NewSubOrganizationForm = ({ onClose, handleOrgSelection }: ContentProps) => {
  const { currentOrg, isSubOrganization } = useOrganization();
  const createSubOrg = useCreateSubOrganization();

  const {
    handleSubmit,
    control,
    setValue,
    formState: { isSubmitting }
  } = useForm({
    defaultValues: {
      name: "",
      slug: ""
    },
    resolver: zodResolver(AddOrgSchema)
  });

  const onSubmit = async ({ name, slug }: FormData) => {
    if (isSubOrganization && currentOrg.rootOrgId) {
      const { token } = await selectOrganization({
        organizationId: currentOrg.rootOrgId
      });

      SecurityClient.setToken(token);
      SecurityClient.setProviderAuthToken("");
    }

    const { organization } = await createSubOrg.mutateAsync({
      name,
      ...(slug?.trim() && { slug: slug.trim() })
    });

    createNotification({
      type: "success",
      text: "Successfully created sub organization"
    });
    onClose();

    await handleOrgSelection({ organizationId: organization.id });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error)} errorText={error?.message} label="Display Name">
            <Input
              autoFocus
              value={value}
              onChange={(e) => {
                onChange(e);
                // Auto-generate slug from name
                setValue("slug", slugify(e.target.value, { lowercase: true }), {
                  shouldValidate: true
                });
              }}
              placeholder="Acme Corp"
            />
          </FormControl>
        )}
        control={control}
        name="name"
      />
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            helperText="Optional. Auto-generated from name when empty. Must be slug-friendly if set."
            errorText={error?.message}
            label="Slug"
          >
            <Input value={value} onChange={onChange} placeholder="acme-corp" />
          </FormControl>
        )}
        control={control}
        name="slug"
      />
      <div className="flex w-full gap-4 pt-4">
        <Button
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
          colorSchema="secondary"
        >
          Add Sub-Organization
        </Button>
        <Button onClick={() => onClose()} variant="plain" colorSchema="secondary">
          Cancel
        </Button>
      </div>
    </form>
  );
};
