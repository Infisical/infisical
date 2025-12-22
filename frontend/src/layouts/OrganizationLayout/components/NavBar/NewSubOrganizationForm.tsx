import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button, FormControl, Input } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useCreateSubOrganization } from "@app/hooks/api";
import { selectOrganization } from "@app/hooks/api/auth/queries";
import { slugSchema } from "@app/lib/schemas";

type ContentProps = {
  onClose: () => void;
  handleOrgSelection: (params: { organizationId: string }) => void;
};

const AddOrgSchema = z.object({
  name: slugSchema()
});

type FormData = z.infer<typeof AddOrgSchema>;

export const NewSubOrganizationForm = ({ onClose, handleOrgSelection }: ContentProps) => {
  const { currentOrg, isSubOrganization } = useOrganization();
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

  const onSubmit = async ({ name }: FormData) => {
    if (isSubOrganization && currentOrg.rootOrgId) {
      const { token } = await selectOrganization({
        organizationId: currentOrg.rootOrgId
      });

      SecurityClient.setToken(token);
      SecurityClient.setProviderAuthToken("");
    }

    const { organization } = await createSubOrg.mutateAsync({
      name
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
