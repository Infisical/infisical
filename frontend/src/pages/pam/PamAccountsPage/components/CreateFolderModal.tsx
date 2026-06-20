import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";
import { useCreatePamFolder } from "@app/hooks/api/pam";

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(64),
  description: z.string().max(256).optional()
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (folderId: string) => void;
};

export const CreateFolderModal = ({ isOpen, onOpenChange, onCreated }: Props) => {
  const createFolder = useCreatePamFolder();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "" }
  });

  const onSubmit = (data: FormData) => {
    createFolder.mutate(
      { name: data.name, description: data.description || undefined },
      {
        onSuccess: (folder) => {
          createNotification({ type: "success", text: "Folder created" });
          reset();
          onCreated?.(folder.id);
          onOpenChange(false);
        }
      }
    );
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Folder</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="folder-name">Name</FieldLabel>
            <FieldContent>
              <Input
                id="folder-name"
                placeholder="e.g. production-databases"
                isError={!!errors.name}
                {...register("name")}
              />
              <FieldError>{errors.name?.message}</FieldError>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="folder-description">Description</FieldLabel>
            <FieldContent>
              <TextArea
                id="folder-description"
                placeholder="What lives in this folder?"
                rows={3}
                isError={!!errors.description}
                {...register("description")}
              />
              <FieldError>{errors.description?.message}</FieldError>
            </FieldContent>
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="pam" isPending={createFolder.isPending}>
              Add Folder
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
