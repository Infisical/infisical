import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, TextArea } from "@app/components/v2";

const createSecureNoteSchema = z.object({
  name: z.string().min(1, "Name is required"),
  content: z.string().optional()
});

type FormSchema = z.infer<typeof createSecureNoteSchema>;

type Props = {
  defaultValues?: FormSchema;
};

export const SecureNoteForm = ({ defaultValues }: Props) => {
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

  return (
    <div className="flex flex-col">
      <form onSubmit={handleSubmit((data) => console.log(data))}>
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
