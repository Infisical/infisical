import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input } from "@app/components/v2";
import { useCreateUserSecret, useUpdateUserSecret } from "@app/hooks/api/userSecrets/mutations";

import { type FormProps } from "./types";

const createWebLoginSchema = z.object({
  name: z.string().min(1, "Name is required"),
  username: z.string().optional(),
  password: z.string().trim().min(1, "Password is required"),
  id: z.string().optional()
});

type FormSchema = z.infer<typeof createWebLoginSchema>;

export const WebLoginForm = ({ userId, onSubmit, defaultValues }: FormProps<FormSchema>) => {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors }
  } = useForm<FormSchema>({
    resolver: zodResolver(createWebLoginSchema),
    defaultValues: defaultValues || {
      name: "",
      username: "",
      password: ""
    }
  });

  const createUserSecret = useCreateUserSecret();
  const updateUserSecret = useUpdateUserSecret();

  return (
    <div className="flex flex-col">
      <form
        onSubmit={handleSubmit(async (data) => {
          if (data.id) {
            await updateUserSecret.mutateAsync({
              userId,
              userSecretId: data.id,
              userSecret: {
                type: "webLogin",
                ...data
              }
            });
          } else {
            await createUserSecret.mutateAsync({
              userId,
              userSecret: { type: "webLogin", ...data }
            });
          }

          onSubmit();
        })}
      >
        <FormControl
          label="Name"
          isError={Boolean(errors?.name)}
          errorText={errors?.name?.message}
          isRequired
        >
          <Input {...register("name")} />
        </FormControl>

        <FormControl
          label="Username"
          isError={Boolean(errors?.username)}
          errorText={errors?.username?.message}
        >
          <Input {...register("username")} />
        </FormControl>

        <FormControl
          label="Password"
          isError={Boolean(errors?.password)}
          errorText={errors?.password?.message}
          isRequired
        >
          <Input {...register("password")} type="password" />
        </FormControl>

        <Button type="submit" isLoading={isSubmitting} isFullWidth>
          {defaultValues ? "Edit" : "Create"} Web Login
        </Button>
      </form>
    </div>
  );
};
