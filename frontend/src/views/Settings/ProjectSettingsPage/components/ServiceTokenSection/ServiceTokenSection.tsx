import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { faCheck, faCopy, faKey, faPlus, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';

import {
  Button,
  Checkbox,
  DeleteActionModal,
  EmptyState,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  ModalTrigger,
  Select,
  SelectItem,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from '@app/components/v2';
import { usePopUp, useToggle } from '@app/hooks';
import { ServiceToken, WorkspaceEnv } from '@app/hooks/api/types';

const apiTokenExpiry = [
  { label: '1 Day', value: 86400 },
  { label: '7 Days', value: 604800 },
  { label: '1 Month', value: 2592000 },
  { label: '6 months', value: 15552000 },
  { label: '12 months', value: 31104000 }
];

const createServiceTokenSchema = yup.object({
  name: yup.string().required().label('Service Token Name'),
  environment: yup.string().required().label('Environment'),
  expiresIn: yup.string().required().label('Service Token Name'),
  permissions: yup.object().shape({
    read: yup.boolean().required(),
    write: yup.boolean().required()
  })
});

export type CreateServiceToken = yup.InferType<typeof createServiceTokenSchema>;

type Props = {
  tokens: ServiceToken[];
  isLoading?: boolean;
  workspaceName: string;
  environments: WorkspaceEnv[];
  onDeleteToken: (serviceTokenID: string) => Promise<void>;
  onCreateToken: (data: CreateServiceToken) => Promise<string>;
};

type DeleteModalData = { name: string; id: string };

export const ServiceTokenSection = ({
  tokens = [],
  isLoading,
  onDeleteToken,
  workspaceName,
  environments = [],
  onCreateToken
}: Props): JSX.Element => {
  const [newToken, setToken] = useState('');
  const { t } = useTranslation();
  const [isTokenCopied, setIsTokenCopied] = useToggle(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isTokenCopied) {
      timer = setTimeout(() => setIsTokenCopied.off(), 2000);
    }
    return () => clearTimeout(timer);
  }, [isTokenCopied]);

  const copyTokenToClipboard = () => {
    navigator.clipboard.writeText(newToken);
    setIsTokenCopied.on();
  };

  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    'createAPIToken',
    'deleteAPITokenConfirmation'
  ] as const);
  
  const {
    control,
    reset,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<CreateServiceToken>({
    resolver: yupResolver(createServiceTokenSchema)
  });

  const hasServiceToken = Boolean(newToken);

  const onFormSubmit = async (data: CreateServiceToken) => {
    // transform permissions object into array
    const dataWithPermissionsArray = data;
    dataWithPermissionsArray.permissions = Object.entries(data.permissions)
      .filter(([, value]) => value)
      .map(([key]) => key);

    const token = await onCreateToken(dataWithPermissionsArray);
    setToken(token);
  };

  const onDeleteApproved = async () => {
    await onDeleteToken((popUp?.deleteAPITokenConfirmation?.data as DeleteModalData)?.id);
    handlePopUpClose('deleteAPITokenConfirmation');
  };

  return (
    <div className="mt-4 mb-4 flex w-full flex-col items-start rounded-md bg-white/5 p-6">
      <div className="flex w-full flex-row justify-between">
        <div className="flex w-full flex-col">
          <p className="mb-3 text-xl font-semibold">{t('section-token:service-tokens')}</p>
          <p className="text-sm text-gray-400">{t('section-token:service-tokens-description')}</p>
          <p className="mb-4 text-sm text-gray-400">
            Please, make sure you are on the
            <a
              className="ml-1 text-primary underline underline-offset-2"
              href="https://infisical.com/docs/cli/overview"
              target="_blank"
              rel="noreferrer"
            >
              latest version of CLI
            </a>
            .
          </p>
        </div>
        <div>
          <Modal
            isOpen={popUp?.createAPIToken?.isOpen}
            onOpenChange={(open) => {
              handlePopUpToggle('createAPIToken', open);
              reset();
              setToken('');
            }}
          >
            <ModalTrigger asChild>
              <Button color="mineshaft" leftIcon={<FontAwesomeIcon icon={faPlus} />}>
                {t('section-token:add-new')}
              </Button>
            </ModalTrigger>
            <ModalContent
              title={
                t('section-token:add-dialog.title', {
                  target: workspaceName
                }) as string
              }
              subTitle={t('section-token:add-dialog.description') as string}
            >
              {!hasServiceToken ? (
                <form onSubmit={handleSubmit(onFormSubmit)}>
                  <Controller
                    control={control}
                    name="name"
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        label={t('section-token:add-dialog.name')}
                        isError={Boolean(error)}
                        errorText={error?.message}
                      >
                        <Input {...field} placeholder="Type your token name" />
                      </FormControl>
                    )}
                  />
                  <Controller
                    control={control}
                    name="environment"
                    defaultValue={environments?.[0]?.slug}
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <FormControl
                        label="Environment"
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <Select
                          defaultValue={field.value}
                          {...field}
                          onValueChange={(e) => onChange(e)}
                          className="w-full"
                        >
                          {environments.map(({ name, slug }) => (
                            <SelectItem value={slug} key={slug}>
                              {name}
                            </SelectItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  />
                  <Controller
                    control={control}
                    name="expiresIn"
                    defaultValue={String(apiTokenExpiry?.[0]?.value)}
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <FormControl
                        label="Token Expiry"
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <Select
                          defaultValue={field.value}
                          {...field}
                          onValueChange={(e) => onChange(e)}
                          className="w-full"
                        >
                          {apiTokenExpiry.map(({ label, value }) => (
                            <SelectItem value={String(value)} key={label}>
                              {label}
                            </SelectItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  />
                  <Controller
                    control={control}
                    name="permissions"
                    defaultValue={{
                      read: true,
                      write: false
                    }}
                    render={({ field: { onChange, value }, fieldState: { error }}) => {
                      const options = [{
                        label: 'Read (default)',
                        value: 'read'
                      }, {
                        label: 'Write (optional)',
                        value: 'write'
                      }];
                      
                      return (
                        <FormControl
                          label="Permissions"
                          errorText={error?.message}
                          isError={Boolean(error)}
                        >
                          <>
                            {options.map(({ label, value: optionValue }) => {
                                // TODO: refactor
                                return (
                                  <Checkbox
                                    key={optionValue}
                                    className="data-[state=checked]:bg-primary"
                                    isChecked={value[optionValue]}
                                    isDisabled={ optionValue === 'read'}
                                    onCheckedChange={(state) => {
                                      onChange({
                                        ...value,
                                        [optionValue]: state
                                      });
                                    }}
                                  >
                                    {label}
                                  </Checkbox>
                              );
                            })}
                          </>
                        </FormControl>
                      );
                    }}
                  />
                  {/* <Controller
                    name="isReadEnabled"
                    defaultValue={true}
                    control={control}
                    render={({ field: { onChange, ... field }, fieldState }) => {
                      return (
                        <Checkbox
                          className="data-[state=checked]:bg-primary"
                          isChecked={field.value}
                          onCheckedChange={(state) => {
                            onChange(state);
                          }}
                        >
                          Read (default)
                        </Checkbox>
                      );
                    }}
                  />
                  <Controller
                    name="isWriteEnabled"
                    defaultValue={false}
                    control={control}
                    render={({ field: { onChange, ... field }, fieldState }) => {
                      return (
                        <Checkbox
                          className="data-[state=checked]:bg-primary"
                          isChecked={field.value}
                          onCheckedChange={(state) => {
                            onChange(state);
                          }}
                        >
                          Write (optional)
                        </Checkbox>
                      );
                    }}
                  /> */}
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
              ) : (
                <div className="mt-2 mb-3 mr-2 flex items-center justify-end rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
                  <p className="mr-4 break-all">{newToken}</p>
                  <IconButton
                    ariaLabel="copy icon"
                    colorSchema="secondary"
                    className="group relative"
                    onClick={copyTokenToClipboard}
                  >
                    <FontAwesomeIcon icon={isTokenCopied ? faCheck : faCopy} />
                    <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                      {t('common:click-to-copy')}
                    </span>
                  </IconButton>
                </div>
              )}
            </ModalContent>
          </Modal>
        </div>
      </div>
      <DeleteActionModal
        isOpen={popUp.deleteAPITokenConfirmation.isOpen}
        title={`Delete ${
          (popUp?.deleteAPITokenConfirmation?.data as DeleteModalData)?.name || ' '
        } service token?`}
        onChange={(isOpen) => handlePopUpToggle('deleteAPITokenConfirmation', isOpen)}
        deleteKey={(popUp?.deleteAPITokenConfirmation?.data as DeleteModalData)?.name}
        onClose={() => handlePopUpClose('deleteAPITokenConfirmation')}
        onDeleteApproved={onDeleteApproved}
      />
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Token Name</Th>
              <Th>Environment</Th>
              <Th>Valid Until</Th>
              <Th aria-label="button" />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={4} key="project-service-tokens" />}
            {!isLoading &&
              tokens.map((row) => (
                <Tr key={row._id}>
                  <Td>{row.name}</Td>
                  <Td>{row.environment}</Td>
                  <Td>{new Date(row.expiresAt).toUTCString()}</Td>
                  <Td className="flex items-center justify-end">
                    <IconButton
                      onClick={() =>
                        handlePopUpOpen('deleteAPITokenConfirmation', {
                          name: row.name,
                          id: row._id
                        })
                      }
                      colorSchema="danger"
                      ariaLabel="delete"
                    >
                      <FontAwesomeIcon icon={faTrashCan} />
                    </IconButton>
                  </Td>
                </Tr>
              ))}
            {!isLoading && tokens?.length === 0 && (
              <Tr>
                <Td colSpan={4} className="py-6 text-center text-bunker-400">
                  <EmptyState title="No service tokens found" icon={faKey} />
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </TableContainer>
    </div>
  );
};
