import { Controller, useForm } from 'react-hook-form';
import { faPlus, faTags, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';

import {
  Button,
  DeleteActionModal,
  EmptyState,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  ModalTrigger,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr} from '@app/components/v2';
import { usePopUp } from '@app/hooks';
import { WorkspaceTag } from '@app/hooks/api/types';

const createTagSchema = yup.object({
  name: yup.string().required().label('Tag Name')
});

export type CreateWsTag = yup.InferType<typeof createTagSchema>;

type Props = {
  tags: WorkspaceTag[];
  isLoading?: boolean;
  workspaceName: string;
  onDeleteTag: (tagID: string) => Promise<void>;
  onCreateTag: (data: CreateWsTag) => Promise<string>;
};

type DeleteModalData = { name: string; id: string };

export const SecretTagsSection = ({
  tags = [],
  isLoading,
  onDeleteTag,
  workspaceName,
  onCreateTag
}: Props): JSX.Element => {
  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    'CreateSecretTag',
    'deleteTagConfirmation'
  ] as const);

  const {
    control,
    reset,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<CreateWsTag>({
    resolver: yupResolver(createTagSchema)
  });

  const onFormSubmit = async (data: CreateWsTag) => {
    await onCreateTag(data);
    handlePopUpClose('CreateSecretTag');
  };

  const onDeleteApproved = async () => {
    await onDeleteTag((popUp?.deleteTagConfirmation?.data as DeleteModalData)?.id);
    handlePopUpClose('deleteTagConfirmation');
  };

  return (
    <div className="mt-4 mb-4 flex w-full flex-col items-start rounded-md bg-mineshaft-900 p-6">
      <div className="flex w-full flex-row justify-between">
        <div className="flex w-full flex-col">
          <p className="mb-3 text-xl font-semibold">Secret Tags</p>
          <p className="text-sm text-gray-400">
            Every secret can be assigned to one or more tags. Here you can add and remove tags for
            the current project.
          </p>
        </div>
        <div>
          <Modal
            isOpen={popUp?.CreateSecretTag?.isOpen}
            onOpenChange={(open) => {
              handlePopUpToggle('CreateSecretTag', open);
              reset();
            }}
          >
            <ModalTrigger asChild>
              <Button color="mineshaft" leftIcon={<FontAwesomeIcon icon={faPlus} />}>
                Add New Tag
              </Button>
            </ModalTrigger>
            <ModalContent
              title={`Add a tag for ${workspaceName}`}
              subTitle="Specify your tag name, and the slug will be created automatically."
            >
              <form onSubmit={handleSubmit(onFormSubmit)}>
                <Controller
                  control={control}
                  name="name"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Tag Name"
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Input {...field} placeholder="Type your tag name" />
                    </FormControl>
                  )}
                />
                <div className="mt-8 flex items-center">
                  <Button
                    className="mr-4"
                    type="submit"
                    isDisabled={isSubmitting}
                    isLoading={isSubmitting}
                  >
                    Create
                  </Button>
                  <ModalClose asChild>
                    <Button variant="plain" colorSchema="secondary">
                      Cancel
                    </Button>
                  </ModalClose>
                </div>
              </form>
            </ModalContent>
          </Modal>
        </div>
      </div>
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>Tag</Th>
              <Th>Slug</Th>
              <Th aria-label="button" />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={3} key="secret-tags" />}
            {!isLoading &&
              tags.map(({ _id, name, slug }) => (
                <Tr key={name}>
                  <Td>{name}</Td>
                  <Td>{slug}</Td>
                  <Td className="flex items-center justify-end">
                    <IconButton
                      onClick={() =>
                        handlePopUpOpen('deleteTagConfirmation', {
                          name,
                          id: _id
                        })
                      }
                      colorSchema="danger"
                      ariaLabel="update"
                    >
                      <FontAwesomeIcon icon={faTrashCan} />
                    </IconButton>
                  </Td>
                </Tr>
              ))}
            {!isLoading && tags?.length === 0 && (
              <Tr>
                <Td colSpan={3}>
                  <EmptyState title="No secret tags found" icon={faTags} />
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </TableContainer>
      <DeleteActionModal
        isOpen={popUp.deleteTagConfirmation.isOpen}
        title={`Delete ${
          (popUp?.deleteTagConfirmation?.data as DeleteModalData)?.name || ' '
        } api key?`}
        onChange={(isOpen) => handlePopUpToggle('deleteTagConfirmation', isOpen)}
        deleteKey={(popUp?.deleteTagConfirmation?.data as DeleteModalData)?.name}
        onClose={() => handlePopUpClose('deleteTagConfirmation')}
        onDeleteApproved={onDeleteApproved}
      />
    </div>
  );
};
