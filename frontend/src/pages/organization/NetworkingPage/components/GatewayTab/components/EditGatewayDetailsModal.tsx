import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
import { useUpdateGatewayById } from "@app/hooks/api";
import { TGateway } from "@app/hooks/api/gateways/types";

type Props = {
  gatewayDetails: TGateway;
  onClose: () => void;
};

const schema = z.object({
  name: z.string()
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

  const onFormSubmit = ({ name }: FormData) => {
    if (isSubmitting) return;
    updateGatewayById.mutate(
      {
        id: gatewayDetails.id,
        name
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
      <NoticeBannerV2 className="mx-auto mb-4" title="Project Linking">
        <p className="mt-1 text-xs text-mineshaft-300">
          Since the 15th May 2025, all gateways are automatically available for use in all projects
          and you no longer need to link them.
          <br />
          Organization members with the &quot;Attach Gateways&quot; permission can use gateways
          anywhere within the organization.
        </p>
      </NoticeBannerV2>

      <Controller
        control={control}
        name="name"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Name" isError={Boolean(error)} errorText={error?.message} isRequired>
            <Input {...field} placeholder="db-subnet-1" />
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
