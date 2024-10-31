import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input } from "@app/components/v2";

const createWebLoginSchema = z.object({
  name: z.string().min(1, "Name is required"),
  username: z.string().optional(),
  password: z.string().trim().min(1, "Password is required")
});

type FormSchema = z.infer<typeof createWebLoginSchema>;

type Props = {
  defaultValues?: FormSchema;
};

export const WebLoginForm = ({ defaultValues }: Props) => {
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

  return (
    <div className="flex flex-col">
      <form onSubmit={handleSubmit((data) => console.log(data))}>
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
