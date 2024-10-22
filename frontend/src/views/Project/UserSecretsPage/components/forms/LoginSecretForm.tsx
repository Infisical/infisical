import React from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { FormLabel, Input } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useCreateUserSecretV3 } from "@app/hooks/api/userSecrets/mutations";
import { UserSecretType } from "@app/hooks/api/userSecrets/types";

const formSchema = z.object({
  secretKey: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  websites: z.array(z.string()).optional(),
  secretId: z.string().optional()
});

type FormSchema = z.infer<typeof formSchema>;

interface LoginSecretFormProps {
  initialData?: Partial<FormSchema>;
  onSubmit: (data: FormSchema) => void;
}

export const LoginSecretForm: React.FC<LoginSecretFormProps> = ({ initialData }) => {
  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData
  });
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const environment = (router.query.env ?? "prod") as string;
  const workspaceId = currentWorkspace?.id || "";

  const createUserSecret = useCreateUserSecretV3();

  const onSubmit = (data: FormSchema) => {
    createUserSecret.mutate({
      secretValue: JSON.stringify({
        type: UserSecretType.Login,
        username: data.username,
        password: data.password,
        websites: data.websites
      }),
      type: UserSecretType.Login,
      secretKey: data.secretKey,
      secretComment: "",
      secretPath: "/",
      workspaceId,
      environment
    });
    form.reset();
  };

  return (
    <form id="create-secret-form" className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <Controller
        control={form.control}
        name="secretKey"
        render={({ field }) => (
          <div className="space-y-1">
            <FormLabel label="Key" />
            <Input id="key" {...field} />
          </div>
        )}
      />

      <Controller
        control={form.control}
        name="username"
        render={({ field }) => (
          <div className="space-y-1">
            <FormLabel label="Username" />
            <Input id="username" {...field} />
          </div>
        )}
      />

      <Controller
        control={form.control}
        name="password"
        render={({ field }) => (
          <div className="space-y-1">
            <FormLabel label="Password" />
            <Input id="password" type="password" {...field} />
          </div>
        )}
      />
    </form>
  );
};
