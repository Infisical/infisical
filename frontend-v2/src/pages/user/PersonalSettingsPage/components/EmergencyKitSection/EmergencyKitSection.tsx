import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import issueBackupKey from "@app/components/utilities/cryptography/issueBackupKey";
import { Button, FormControl, Input } from "@app/components/v2";
import { useUser } from "@app/context";

const schema = z
  .object({
    password: z.string().describe("Password is required")
  })
  .required();

export type FormData = z.infer<typeof schema>;

export const EmergencyKitSection = () => {
  const { user } = useUser();
  const { reset, control, handleSubmit } = useForm({
    defaultValues: {
      password: ""
    },
    resolver: zodResolver(schema)
  });

  const onFormSubmit = ({ password }: FormData) => {
    try {
      if (!user?.email) return;

      issueBackupKey({
        email: user.email,
        password,
        personalName: `${user.firstName} ${user.lastName}`,
        setBackupKeyError: () => {},
        setBackupKeyIssued: () => {}
      });

      reset();
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to download emergency kit",
        type: "error"
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <h2 className="flex-1 text-xl font-semibold text-mineshaft-100">Emergency Kit</h2>
      <p className="mb-8 text-gray-400">
        The kit contains information you can use to recover your account.
      </p>
      <div className="max-w-md">
        <Controller
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input
                placeholder="Password"
                type="password"
                {...field}
                className="bg-mineshaft-800"
              />
            </FormControl>
          )}
          control={control}
          name="password"
        />
      </div>
      <Button type="submit" colorSchema="secondary" isLoading={false}>
        Save
      </Button>
    </form>
  );
};
