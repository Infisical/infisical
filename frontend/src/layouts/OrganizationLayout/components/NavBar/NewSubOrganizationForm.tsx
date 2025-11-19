import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import { useCreateSubOrganization } from "@app/hooks/api";
import { slugSchema } from "@app/lib/schemas";

type ContentProps = {
  onClose: () => void;
};

const AddOrgSchema = z.object({
  name: slugSchema()
});

type FormData = z.infer<typeof AddOrgSchema>;

export const NewSubOrganizationForm = ({ onClose }: ContentProps) => {
  const createSubOrg = useCreateSubOrganization();

  const {
    handleSubmit,
    control,
    formState: { isSubmitting }
  } = useForm({
    defaultValues: {
      name: ""
    },
    resolver: zodResolver(AddOrgSchema)
  });

  const navigate = useNavigate();
  const router = useRouter();

  const onSubmit = async ({ name }: FormData) => {
    const { organization } = await createSubOrg.mutateAsync({
      name
    });

    createNotification({
      type: "success",
      text: "Successfully created sub organization"
    });
    onClose();

    navigate({
      to: "/organizations/$orgId/projects",
      params: { orgId: organization.id }
    });
    await router.invalidate({ sync: true }).catch(() => null);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            helperText="Must be slug-friendly"
            errorText={error?.message}
            label="Name"
          >
            <Input autoFocus value={value} onChange={onChange} placeholder="example-team" />
          </FormControl>
        )}
        control={control}
        name="name"
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
