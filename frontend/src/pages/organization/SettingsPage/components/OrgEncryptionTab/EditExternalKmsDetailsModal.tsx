import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  ContentLoader,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useGetExternalKmsById, useUpdateExternalKms } from "@app/hooks/api";
import { ExternalKmsProvider, Kms } from "@app/hooks/api/kms/types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  kmsId: string;
  provider: ExternalKmsProvider;
};

const formSchema = z.object({
  name: z.string().min(1).trim(),
  description: z.string().trim().optional()
});

type FormData = z.infer<typeof formSchema>;

type ContentProps = { kms: Kms; provider: ExternalKmsProvider; onComplete: () => void };

const Content = ({ kms, onComplete, provider }: ContentProps) => {
  const { currentOrg } = useOrganization();
  const { mutateAsync: updateExternalKms, isPending } = useUpdateExternalKms(
    currentOrg.id,
    provider
  );

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: kms.name,
      description: kms.description ?? ""
    }
  });

  const {
    handleSubmit,
    formState: { isDirty }
  } = form;

  const onSubmit = async (formData: FormData) => {
    if (!kms) return;

    await updateExternalKms({
      kmsId: kms.id,
      name: formData.name,
      description: formData.description
    });

    createNotification({
      text: "Successfully updated KMS details",
      type: "success"
    });
    onComplete();
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormControl label="Alias">
          <Input {...form.register("name")} />
        </FormControl>
        <FormControl label="Description">
          <Input {...form.register("description")} />
        </FormControl>
        <div className="mt-6 flex items-center space-x-4">
          <Button type="submit" isLoading={isPending} isDisabled={!isDirty}>
            Update Details
          </Button>
          <ModalClose asChild>
            <Button variant="outline_bg">Cancel</Button>
          </ModalClose>
        </div>
      </form>
    </FormProvider>
  );
};

export const EditExternalKmsDetailsModal = ({ isOpen, onOpenChange, kmsId, provider }: Props) => {
  const { data: kms, isPending } = useGetExternalKmsById({ kmsId, provider });

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title="Edit KMS Details"
        subTitle="Update the name and description for this KMS."
      >
        {isPending && <ContentLoader />}
        {kms && <Content kms={kms} provider={provider} onComplete={() => onOpenChange(false)} />}
      </ModalContent>
    </Modal>
  );
};
