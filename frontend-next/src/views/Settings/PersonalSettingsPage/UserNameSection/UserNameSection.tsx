import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import { useUser } from "@app/context";
import { useRenameUser } from "@app/hooks/api/users/queries";

const formSchema = yup.object({
  name: yup.string().required().label("User Name")
});

type FormData = yup.InferType<typeof formSchema>;

export const UserNameSection = (): JSX.Element => {
  const { user } = useUser();
  
  const { handleSubmit, control, reset } = useForm<FormData>({ resolver: yupResolver(formSchema) });
  const { mutateAsync, isLoading } = useRenameUser();

  useEffect(() => {
    if (user) {
      reset({ name: `${user?.firstName}${user?.lastName && " "}${user?.lastName}` });
    }
  }, [user]);

  const onFormSubmit = async ({ name }: FormData) => {
    try {
      if (!user?.id) return;
      if (name === "") return;

      await mutateAsync({ newName: name });
      createNotification({
        text: "Successfully renamed user",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to rename user",
        type: "error"
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <p className="mb-4 text-xl font-semibold text-mineshaft-100">Name</p>
      <div className="mb-2 max-w-md">
        <Controller
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input placeholder={`${user?.firstName} ${user?.lastName}`} {...field} />
            </FormControl>
          )}
          control={control}
          name="name"
        />
      </div>
      <Button isLoading={isLoading} colorSchema="primary" variant="outline_bg" type="submit">
        Save
      </Button>
    </form>
  );
};
