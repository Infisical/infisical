import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import slugify from '@sindresorhus/slugify';
import { z } from 'zod';

import { createNotification } from '@app/components/notifications';
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  Select,
  SelectItem,
  TextArea,
} from '@app/components/v2';
import { useWorkspace } from '@app/context';
import {
  EncryptionAlgorithm,
  TConsumerSecret,
  useCreateConsumerSecret,
  useUpdateConsumerSecret,
} from '@app/hooks/api/consumerSecrets';

const formSchema = z.object({
  name: z.string().min(1).toLowerCase().max(32),
  content: z.string().max(500).optional(),
});

export type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  consumerSecret?: TConsumerSecret | null;
};

type FormProps = Pick<Props, 'consumerSecret'> & {
  onComplete: () => void;
};

const ConsumerSecretForm = ({ onComplete, consumerSecret }: FormProps) => {
  const createConsumerSecret = useCreateConsumerSecret();
  const updateConsumerSecret = useUpdateConsumerSecret();
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id!;
  const isUpdate = !!consumerSecret;

  const {
    control,
    handleSubmit,
    register,
    formState: { isSubmitting, errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: consumerSecret?.name,
      content: consumerSecret?.content,
    },
  });

  const handleCreateConsumerSecret = async ({ name, content }: FormData) => {
    const mutation = isUpdate
      ? updateConsumerSecret.mutateAsync({
          keyId: consumerSecret.id,
          projectId,
          name,
          content,
        })
      : createConsumerSecret.mutateAsync({
          projectId,
          name,
          content,
        });

    try {
      await mutation;
      createNotification({
        text: `Successfully ${isUpdate ? 'updated' : 'added'} key`,
        type: 'success',
      });
      onComplete();
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${isUpdate ? 'update' : 'add'} key`,
        type: 'error',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(handleCreateConsumerSecret)}>
      <FormControl
        errorText={errors.name?.message}
        isError={Boolean(errors.name?.message)}
        label="Name"
      >
        <Input autoFocus placeholder="my-secret-note" {...register('name')} />
      </FormControl>
      <FormControl
        label="Content"
        errorText={errors.content?.message}
        isError={Boolean(errors.content?.message)}
      >
        <TextArea
          className="max-h-[20rem] min-h-[10rem] min-w-full max-w-full"
          {...register('content')}
        />
      </FormControl>
      <div className="flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          {isUpdate ? 'Update' : 'Add'} Secret Note
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </form>
  );
};

export const ConsumerSecretModal = ({
  isOpen,
  onOpenChange,
  consumerSecret,
}: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title={`${consumerSecret ? 'Update' : 'Add'} Secret Note`}>
        <ConsumerSecretForm
          onComplete={() => onOpenChange(false)}
          consumerSecret={consumerSecret}
        />
      </ModalContent>
    </Modal>
  );
};
