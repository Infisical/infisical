import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl, Input } from "@app/components/v2";
import { useGetUserWorkspaces, useUpdateGatewayById } from "@app/hooks/api";
import { TGateway } from "@app/hooks/api/gateways/types";
import { ProjectType } from "@app/hooks/api/workspace/types";

type Props = {
  gatewayDetails: TGateway;
  onClose: () => void;
};

const schema = z.object({
  name: z.string(),
  projects: z
    .object({
      id: z.string(),
      name: z.string()
    })
    .array()
});

export type FormData = z.infer<typeof schema>;

export const EditGatewayDetailsModal = ({ gatewayDetails, onClose }: Props) => {
  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: gatewayDetails?.name
    }
  });

  const updateGatewayById = useUpdateGatewayById();
  // when gateway goes to other products switch to all
  const { data: secretManagerWorkspaces, isLoading: isSecretManagerLoading } = useGetUserWorkspaces(
    {
      type: ProjectType.SecretManager
    }
  );

  const onFormSubmit = ({ name, projects }: FormData) => {
    if (isSubmitting) return;
    updateGatewayById.mutate(
      {
        id: gatewayDetails.id,
        name,
        projectIds: projects.map((el) => el.id)
      },
      {
        onSuccess: () => {
          createNotification({
            type: "success",
            text: "Successfully updated gateway"
          });
          onClose();
        }
      }
    );
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Name" isError={Boolean(error)} errorText={error?.message} isRequired>
            <Input {...field} placeholder="db-subnet-1" />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="projects"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <FormControl
            className="w-full"
            label="Projects"
            tooltipText="Select the project(s) that you'd like to add this gateway to"
            errorText={error?.message}
            isError={Boolean(error)}
          >
            <FilterableSelect
              options={secretManagerWorkspaces}
              placeholder="Select projects..."
              value={value}
              onChange={onChange}
              isMulti
              isLoading={isSecretManagerLoading}
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.name}
            />
          </FormControl>
        )}
      />
      <div className="mt-4 flex items-center">
        <Button className="mr-4" size="sm" type="submit" isLoading={isSubmitting}>
          Update
        </Button>
        <Button colorSchema="secondary" variant="plain" onClick={() => onClose()}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
