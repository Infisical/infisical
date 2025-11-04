import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import { useUser } from "@app/context";
import { useRenameUser } from "@app/hooks/api/users/queries";

const formSchema = z.object({
  name: z.string().describe("User Name")
});

type FormData = z.infer<typeof formSchema>;

export const UserNameSection = (): JSX.Element => {
  const { user } = useUser();

  const { handleSubmit, control, reset } = useForm<FormData>({ resolver: zodResolver(formSchema) });
  const { mutateAsync, isPending } = useRenameUser();

  useEffect(() => {
    if (user) {
      reset({ name: `${user?.firstName}${user?.lastName && " "}${user?.lastName}` });
    }
  }, [user]);

  const onFormSubmit = async ({ name }: FormData) => {
    if (!user?.id) return;
    if (name === "") return;

    await mutateAsync({ newName: name });
    createNotification({
      text: "Successfully renamed user",
      type: "success"
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <p className="mb-4 text-xl font-medium text-mineshaft-100">Name</p>
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
      <Button isLoading={isPending} colorSchema="primary" variant="outline_bg" type="submit">
        Save
      </Button>
    </form>
  );
};
