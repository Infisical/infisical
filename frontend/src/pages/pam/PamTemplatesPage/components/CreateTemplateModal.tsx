import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextArea
} from "@app/components/v3";
import {
  PamAccountType,
  useCreatePamAccountTemplate,
  useListPamAccountTypes
} from "@app/hooks/api/pam";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  name: slugSchema({ field: "Name" }),
  type: z.nativeEnum(PamAccountType, { required_error: "Type is required" }),
  description: z.string().max(256).optional()
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (templateId: string) => void;
};

export const CreateTemplateModal = ({ isOpen, onOpenChange, onCreated }: Props) => {
  const createTemplate = useCreatePamAccountTemplate();
  const { data: accountTypes = [] } = useListPamAccountTypes();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      type: undefined,
      description: ""
    }
  });

  const selectedType = watch("type");

  const onSubmit = (data: FormData) => {
    createTemplate.mutate(
      { name: data.name, type: data.type, description: data.description || undefined },
      {
        onSuccess: (template) => {
          createNotification({ type: "success", text: "Template created" });
          reset();
          onOpenChange(false);
          onCreated?.(template.id);
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
          <DialogTitle>Create Account Template</DialogTitle>
          <DialogDescription>
            Templates hold the governance rules inherited by every account created from them,
            including session limits, MFA, and recording.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="template-name">Name</FieldLabel>
            <FieldContent>
              <Input
                id="template-name"
                placeholder="e.g. production-postgresql"
                isError={!!errors.name}
                {...register("name")}
              />
              <FieldError>{errors.name?.message}</FieldError>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>Type</FieldLabel>
            <FieldContent>
              <Select
                value={selectedType}
                onValueChange={(val) =>
                  setValue("type", val as PamAccountType, { shouldValidate: true })
                }
              >
                <SelectTrigger className="w-full" isError={!!errors.type}>
                  <SelectValue placeholder="Select an account type" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  {accountTypes.map((meta) => (
                    <SelectItem key={meta.type} value={meta.type}>
                      <img
                        src={`/images/integrations/${meta.icon}`}
                        alt={meta.name}
                        className="mr-1.5 inline-block size-4 rounded-sm"
                      />
                      {meta.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{errors.type?.message}</FieldError>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="template-description">Description</FieldLabel>
            <FieldContent>
              <TextArea
                id="template-description"
                placeholder="What is this template for?"
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
            <Button type="submit" variant="pam" isPending={createTemplate.isPending}>
              Create Template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
