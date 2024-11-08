import Link from 'next/link';
import {
  faArrowDown,
  faArrowUp,
  faArrowUpRightFromSquare,
  faCancel,
  faCheck,
  faCheckCircle,
  faCopy,
  faEdit,
  faEllipsis,
  faInfoCircle,
  faKey,
  faLock,
  faLockOpen,
  faMagnifyingGlass,
  faPlus,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { motion } from 'framer-motion';

import { createNotification } from '@app/components/notifications';
import { ProjectPermissionCan } from '@app/components/permissions';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Pagination,
  Spinner,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr,
} from '@app/components/v2';
import { BadgeProps } from '@app/components/v2/Badge/Badge';
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace,
} from '@app/context';
import {
  usePagination,
  usePopUp,
  useResetPageHelper,
  useTimedReset,
} from '@app/hooks';
import {
  useGetConsumerSecretsByProjectId,
  useUpdateConsumerSecret,
} from '@app/hooks/api/consumerSecrets';
import {
  ConsumerSecretOrderBy,
  TConsumerSecret,
} from '@app/hooks/api/consumerSecrets/types';
import { OrderByDirection } from '@app/hooks/api/generic/types';

import { ConsumerSecretDecryptModal } from './ConsumerSecretDecryptModal';
import { ConsumerSecretEncryptModal } from './ConsumerSecretEncryptModal';
import { ConsumerSecretModal } from './ConsumerSecretModal';
import { DeleteConsumerSecretModal } from './DeleteConsumerSecretModal';

const getStatusBadgeProps = (
  isDisabled: boolean,
): { variant: BadgeProps['variant']; label: string } => {
  if (isDisabled) {
    return {
      variant: 'danger',
      label: 'Disabled',
    };
  }

  return {
    variant: 'success',
    label: 'Active',
  };
};

export const ConsumerSecretTable = () => {
  const { currentWorkspace } = useWorkspace();
  const { permission } = useProjectPermission();

  const projectId = currentWorkspace?.id ?? '';

  const {
    offset,
    limit,
    orderBy,
    orderDirection,
    setOrderDirection,
    search,
    debouncedSearch,
    setPage,
    setSearch,
    perPage,
    page,
    setPerPage,
  } = usePagination(ConsumerSecretOrderBy.Name);

  const { data, isLoading, isFetching } = useGetConsumerSecretsByProjectId({
    projectId,
    offset,
    limit,
    search: debouncedSearch,
    orderBy,
    orderDirection,
  });

  const { keys = [], totalCount = 0 } = data ?? {};
  useResetPageHelper({
    totalCount,
    offset,
    setPage,
  });

  const [, isCopyingCiphertext, setCopyCipherText] = useTimedReset<string>({
    initialState: '',
    delay: 1000,
  });

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    'upsertKey',
    'deleteKey',
    'encryptData',
    'decryptData',
  ] as const);

  const handleSort = () => {
    setOrderDirection((prev) =>
      prev === OrderByDirection.ASC
        ? OrderByDirection.DESC
        : OrderByDirection.ASC,
    );
  };

  const updateConsumerSecret = useUpdateConsumerSecret();

  const handleDisableConsumerSecret = async ({
    id: keyId,
    isDisabled,
  }: TConsumerSecret) => {
    try {
      await updateConsumerSecret.mutateAsync({
        keyId,
        projectId,
        isDisabled: !isDisabled,
      });

      createNotification({
        text: `Key successfully ${isDisabled ? 'enabled' : 'disabled'}`,
        type: 'success',
      });
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text =
        error?.response?.data?.message ??
        `Failed to ${isDisabled ? 'enable' : 'disable'} key`;

      createNotification({
        text,
        type: 'error',
      });
    }
  };

  return (
    <motion.div
      key="kms-keys-tab"
      transition={{ duration: 0.15 }}
      initial={{ opacity: 0, translateX: 30 }}
      animate={{ opacity: 1, translateX: 0 }}
      exit={{ opacity: 0, translateX: 30 }}
    >
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="whitespace-nowrap text-xl font-semibold text-mineshaft-100">
            Secret Notes
          </p>
          {/* <div className="flex w-full justify-end pr-4">
            <Link href="https://infisical.com/docs/documentation/platform/kms">
              <span className="w-max cursor-pointer rounded-md border border-mineshaft-500 bg-mineshaft-600 px-4 py-2 text-mineshaft-200 duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-white">
                Documentation{" "}
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="mb-[0.06rem] ml-1 text-xs"
                />
              </span>
            </Link>
          </div> */}
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.Cmek}
          >
            {(isAllowed) => (
              <Button
                colorSchema="primary"
                type="submit"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => handlePopUpOpen('upsertKey', null)}
                isDisabled={!isAllowed}
              >
                Add Secret Note
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
        {/* <Input
          containerClassName="mb-4"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search secret notes by name..."
        /> */}
        <TableContainer>
          <Table>
            <THead>
              <Tr className="h-14">
                <Th>
                  <div className="flex items-center">
                    Name
                    <IconButton
                      variant="plain"
                      className="ml-2"
                      ariaLabel="sort"
                      onClick={handleSort}
                    >
                      <FontAwesomeIcon
                        icon={
                          orderDirection === OrderByDirection.DESC
                            ? faArrowUp
                            : faArrowDown
                        }
                      />
                    </IconButton>
                  </div>
                </Th>
                <Th>Secret Note ID</Th>
                <Th className="w-16">
                  {isFetching ? <Spinner size="xs" /> : null}
                </Th>
              </Tr>
            </THead>
            <TBody>
              {isLoading && (
                <TableSkeleton columns={5} innerKey="project-keys" />
              )}
              {!isLoading &&
                keys.length > 0 &&
                keys.map((cmek) => {
                  const {
                    name,
                    id,
                    version,
                    description,
                    encryptionAlgorithm,
                    isDisabled,
                  } = cmek;
                  const { variant, label } = getStatusBadgeProps(isDisabled);

                  return (
                    <Tr
                      className="group h-10 hover:bg-mineshaft-700"
                      key={`st-v3-${id}`}
                      onMouseLeave={() => {
                        setCopyCipherText('');
                      }}
                    >
                      <Td>
                        <div className="flex items-center gap-2 ">
                          {name}
                          {description && (
                            <Tooltip content={description}>
                              <FontAwesomeIcon
                                icon={faInfoCircle}
                                className=" text-mineshaft-400"
                              />
                            </Tooltip>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <div>
                          <span> {id}</span>
                          <IconButton
                            ariaLabel="copy icon"
                            colorSchema="secondary"
                            className="group/copy duration:0 invisible relative ml-3 group-hover:visible"
                            onClick={() => {
                              navigator.clipboard.writeText(id);
                              setCopyCipherText('Copied');
                            }}
                          >
                            <FontAwesomeIcon
                              icon={isCopyingCiphertext ? faCheck : faCopy}
                            />
                          </IconButton>
                        </div>
                      </Td>
                      <Td className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              variant="plain"
                              colorSchema="primary"
                              className="ml-4 p-0 data-[state=open]:text-primary-400"
                              ariaLabel="More options"
                            >
                              <FontAwesomeIcon size="lg" icon={faEllipsis} />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="min-w-[160px]">
                            <Tooltip content={''} position="left">
                              <div>
                                <DropdownMenuItem
                                  onClick={() =>
                                    handlePopUpOpen('upsertKey', cmek)
                                  }
                                  icon={<FontAwesomeIcon icon={faEdit} />}
                                  iconPos="left"
                                  isDisabled={false}
                                >
                                  Edit Secret Note
                                </DropdownMenuItem>
                              </div>
                            </Tooltip>
                            <Tooltip content={''} position="left">
                              <div>
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleDisableConsumerSecret(cmek)
                                  }
                                  icon={
                                    <FontAwesomeIcon
                                      icon={
                                        isDisabled ? faCheckCircle : faCancel
                                      }
                                    />
                                  }
                                  iconPos="left"
                                  isDisabled={false}
                                >
                                  {isDisabled ? 'Enable' : 'Disable'} Secret
                                  Note
                                </DropdownMenuItem>
                              </div>
                            </Tooltip>
                            <Tooltip content={''} position="left">
                              <div>
                                <DropdownMenuItem
                                  onClick={() =>
                                    handlePopUpOpen('deleteKey', cmek)
                                  }
                                  icon={<FontAwesomeIcon icon={faTrash} />}
                                  iconPos="left"
                                  isDisabled={false}
                                >
                                  Delete Secret Note
                                </DropdownMenuItem>
                              </div>
                            </Tooltip>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {!isLoading && totalCount > 0 && (
            <Pagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={(newPage) => setPage(newPage)}
              onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
            />
          )}
          {!isLoading && keys.length === 0 && (
            <EmptyState
              title={
                debouncedSearch.trim().length > 0
                  ? 'No secret notes match search filter'
                  : 'No secret notes have been added to this project'
              }
              icon={faKey}
            />
          )}
        </TableContainer>
        <DeleteConsumerSecretModal
          isOpen={popUp.deleteKey.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle('deleteKey', isOpen)}
          cmek={popUp.deleteKey.data as TConsumerSecret}
        />
        <ConsumerSecretModal
          isOpen={popUp.upsertKey.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle('upsertKey', isOpen)}
          cmek={popUp.upsertKey.data as TConsumerSecret | null}
        />
        <ConsumerSecretEncryptModal
          isOpen={popUp.encryptData.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle('encryptData', isOpen)}
          cmek={popUp.encryptData.data as TConsumerSecret}
        />
        <ConsumerSecretDecryptModal
          isOpen={popUp.decryptData.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle('decryptData', isOpen)}
          cmek={popUp.decryptData.data as TConsumerSecret}
        />
      </div>
    </motion.div>
  );
};
