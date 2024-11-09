import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createNotification } from '@app/components/notifications';
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  TextArea,
} from '@app/components/v2';
import { useWorkspace } from '@app/context';
import {
  TSecretNote,
  useCreateSecretNote,
  useUpdateSecretNote,
} from '@app/hooks/api/consumerSecrets';

const formSchema = z.object({
  name: z.string().min(1).toLowerCase().max(32),
  content: z.string().max(500).optional(),
});

export type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  secretNote?: TSecretNote | null;
};

type FormProps = Pick<Props, 'secretNote'> & {
  onComplete: () => void;
};

const ConsumerSecretForm = ({ onComplete, secretNote }: FormProps) => {
  const createConsumerSecret = useCreateSecretNote();
  const updateConsumerSecret = useUpdateSecretNote();
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id!;
  const isUpdate = !!secretNote;

  const {
    control,
    handleSubmit,
    register,
    formState: { isSubmitting, errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: secretNote?.name,
      content: secretNote?.content,
    },
  });

  const handleCreateConsumerSecret = async ({ name, content }: FormData) => {
    if (!content) return;

    const mutation = isUpdate
      ? updateConsumerSecret.mutateAsync({
          noteId: secretNote.id,
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
  secretNote,
}: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title={`${secretNote ? 'Update' : 'Add'} Secret Note`}>
        <ConsumerSecretForm
          onComplete={() => onOpenChange(false)}
          secretNote={secretNote}
        />
      </ModalContent>
    </Modal>
  );
};
