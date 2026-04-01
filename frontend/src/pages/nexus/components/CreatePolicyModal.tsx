import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent, Select, SelectItem, TextArea } from "@app/components/v2";

const formSchema = z.object({
  name: z.string().trim().min(1, "Policy name is required"),
  category: z.string().min(1, "Category is required"),
  subCategory: z.string().min(1, "Sub-category is required"),
  enforcementMode: z.string().default("Monitoring"),
  description: z.string().optional()
});

type TFormSchema = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const CreatePolicyModal = ({ isOpen, onOpenChange }: Props) => {
  const {
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      enforcementMode: "Monitoring"
    }
  });

  const onFormSubmit = () => {
    createNotification({ text: "Policy created successfully.", type: "success" });
    reset();
    onOpenChange(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <ModalContent title="Create Policy" subTitle="Define a new cryptographic compliance policy.">
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Policy Name" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="e.g. Enforce PQC-safe algorithms" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="category"
            defaultValue=""
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Category" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Select {...field} onValueChange={onChange} className="w-full" placeholder="Select category">
                  {["Symmetric Keys", "Asymmetric Keys", "Certificates", "Protocols", "All"].map((v) => (
                    <SelectItem value={v} key={v}>{v}</SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="subCategory"
            defaultValue=""
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Sub-Category" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Select {...field} onValueChange={onChange} className="w-full" placeholder="Select sub-category">
                  {["PQC", "Classical"].map((v) => (
                    <SelectItem value={v} key={v}>{v}</SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="enforcementMode"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Enforcement Mode" isError={Boolean(error)} errorText={error?.message}>
                <Select {...field} onValueChange={onChange} className="w-full">
                  {["Monitoring", "Enforcing"].map((v) => (
                    <SelectItem value={v} key={v}>{v}</SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="description"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Description" isError={Boolean(error)} errorText={error?.message}>
                <TextArea {...field} placeholder="Optional policy description..." reSize="none" rows={3} />
              </FormControl>
            )}
          />
          <div className="mt-7 flex items-center">
            <Button
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
              className="mr-4"
            >
              Create Policy
            </Button>
            <Button
              variant="plain"
              colorSchema="secondary"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
