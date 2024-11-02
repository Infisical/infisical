import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, TextArea } from "@app/components/v2";
import { useCreateUserSecret, useUpdateUserSecret } from "@app/hooks/api/userSecrets/mutations";

import { type FormProps } from "./types";

const createSecureNoteSchema = z.object({
  name: z.string().min(1, "Name is required"),
  content: z.string().min(1, "Content is required"),
  id: z.string().optional()
});

type FormSchema = z.infer<typeof createSecureNoteSchema>;

export const SecureNoteForm = ({ userId, onSubmit, defaultValues }: FormProps<FormSchema>) => {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors }
  } = useForm<FormSchema>({
    resolver: zodResolver(createSecureNoteSchema),
    defaultValues: defaultValues || {
      name: "",
      content: ""
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
                type: "secureNote",
                ...data
              }
            });
          } else {
            await createUserSecret.mutateAsync({
              userId,
              userSecret: { type: "secureNote", ...data }
            });
          }

          onSubmit();
        })}
      >
        <FormControl
          label="Title"
          isError={Boolean(errors?.name)}
          errorText={errors?.name?.message}
          isRequired
        >
          <Input {...register("name")} />
        </FormControl>

        <FormControl
          label="Content"
          isError={Boolean(errors?.content)}
          errorText={errors?.content?.message}
          isRequired
        >
          <TextArea {...register("content")} />
        </FormControl>

        <Button type="submit" isLoading={isSubmitting} isFullWidth>
          {defaultValues ? "Edit" : "Create"} Secure Note
        </Button>
      </form>
    </div>
  );
};
