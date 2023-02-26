import { Controller, useForm } from 'react-hook-form';
import { faPencil, faPlus, faTrashCan } from '@fortawesome/free-solid-svg-icons';
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
  ModalContent,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  UpgradePlanModal
} from '@app/components/v2';
import { usePopUp } from '@app/hooks/usePopUp';

type Props = {
  environments: Array<{ name: string; slug: string }>;
  isLoading?: boolean;
  isEnvServiceAllowed: boolean;
  onCreate: (data: CreateUpdateEnvFormData) => Promise<void>;
  onUpdate: (oldEnvSlug: string, data: CreateUpdateEnvFormData) => Promise<void>;
  onDelete: (envSlug: string) => Promise<void>;
};

const createUpdateEnvSchema = yup.object({
  environmentName: yup.string().label('Environment Name').required(),
  environmentSlug: yup.string().label('Environment Slug').required()
});

export type CreateUpdateEnvFormData = yup.InferType<typeof createUpdateEnvSchema>;

export const EnvironmentSection = ({
  environments,
  isEnvServiceAllowed,
  onCreate,
  onDelete,
  isLoading,
  onUpdate
}: Props): JSX.Element => {
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    'createUpdateEnv',
    'deleteEnv',
    'upgradePlan'
  ] as const);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<CreateUpdateEnvFormData>({
    resolver: yupResolver(createUpdateEnvSchema)
  });

  const isEnvUpdate = Boolean(popUp?.createUpdateEnv?.data);
  const oldEnvSlug = (popUp?.createUpdateEnv?.data as { slug: string })?.slug;

  const onEnvModalSubmit = async (data: CreateUpdateEnvFormData) => {
    if (isEnvUpdate) {
      await onUpdate(oldEnvSlug, data);
    } else {
      await onCreate(data);
    }
    handlePopUpClose('createUpdateEnv');
  };

  const onEnvDeleteSubmit = async (envSlug: string) => {
    await onDelete(envSlug);
    handlePopUpClose('deleteEnv');
  };

  return (
    <div className="mt-4 mb-4 flex w-full flex-col items-start rounded-md bg-white/5 p-6">
      <div className="mb-2 flex w-full flex-row justify-between">
        <div className="flex w-full flex-col">
          <p className="mb-3 text-xl font-semibold">Project Environments</p>
          <p className="mb-4 text-base text-gray-400">
            Choose which environments will show up in your dashboard like development, staging,
            production
          </p>
          <p className="mr-1 self-start text-sm text-gray-500">
            Note: the text in slugs shows how these environmant should be accessed in CLI.
          </p>
        </div>
        <div>
          <Button
            onClick={() => {
              if (isEnvServiceAllowed) {
                handlePopUpOpen('createUpdateEnv');
              } else {
                handlePopUpOpen('upgradePlan');
              }
            }}
            colorSchema="primary"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
          >
            Add New Environment
          </Button>
        </div>
      </div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Slug</Th>
              <Th aria-label="button" />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={3} key="project-envs" />}
            {!isLoading &&
              environments.map(({ name, slug }) => (
                <Tr key={name}>
                  <Td>{name}</Td>
                  <Td>{slug}</Td>
                  <Td className="flex items-center justify-end">
                    <IconButton
                      className="mr-3"
                      onClick={() => {
                        if (isEnvServiceAllowed) {
                          handlePopUpOpen('createUpdateEnv', { name, slug });
                          reset({ environmentName: name, environmentSlug: slug });
                        } else {
                          handlePopUpOpen('upgradePlan');
                        }
                      }}
                      colorSchema="secondary"
                      ariaLabel="update"
                    >
                      <FontAwesomeIcon icon={faPencil} />
                    </IconButton>
                    <IconButton
                      onClick={() => {
                        if (isEnvServiceAllowed) {
                          handlePopUpOpen('deleteEnv', { name, slug });
                        } else {
                          handlePopUpOpen('upgradePlan');
                        }
                      }}
                      colorSchema="danger"
                      ariaLabel="update"
                    >
                      <FontAwesomeIcon icon={faTrashCan} />
                    </IconButton>
                  </Td>
                </Tr>
              ))}
            {!isLoading && environments?.length === 0 && (
              <Tr>
                <Td colSpan={3}>
                  <EmptyState title="No environments found" />
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </TableContainer>
      <Modal
        isOpen={popUp?.createUpdateEnv?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle('createUpdateEnv', isOpen);
          reset();
        }}
      >
        <ModalContent title={isEnvUpdate ? 'Update environment' : 'Create a new environment'}>
          <form onSubmit={handleSubmit(onEnvModalSubmit)}>
            <Controller
              control={control}
              defaultValue=""
              name="environmentName"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Environment Name"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              defaultValue=""
              name="environmentSlug"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Environment Slug"
                  helperText="Slugs are shorthands used in cli to access environment"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} />
                </FormControl>
              )}
            />
            <div className="mt-8 flex items-center">
              <Button
                className="mr-4"
                size="sm"
                type="submit"
                isLoading={isSubmitting}
                isDisabled={isSubmitting}
              >
                {isEnvUpdate ? 'Update' : 'Create'}
              </Button>

              <Button colorSchema="secondary" variant="plain">
                Cancel
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={popUp.deleteEnv.isOpen}
        title={`Are you sure want to delete ${
          (popUp?.deleteEnv?.data as { name: string })?.name || ' '
        }?`}
        onChange={(isOpen) => handlePopUpToggle('deleteEnv', isOpen)}
        deleteKey={(popUp?.deleteEnv?.data as { slug: string })?.slug || ''}
        onDeleteApproved={() =>
          onEnvDeleteSubmit((popUp?.deleteEnv?.data as { slug: string })?.slug)
        }
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle('upgradePlan', isOpen)}
        text="You can add custom environments if you switch to Infisical's Team plan."
      />
    </div>
  );
};
