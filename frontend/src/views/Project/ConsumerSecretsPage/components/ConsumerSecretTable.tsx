import {
  faArrowDown,
  faArrowUp,
  faCheck,
  faCopy,
  faEdit,
  faEllipsis,
  faInfoCircle,
  faKey,
  faPlus,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { motion } from 'framer-motion';

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
import { useGetSecretNotesByProjectId } from '@app/hooks/api/consumerSecrets';
import {
  SecretNoteOrderBy,
  TSecretNote,
} from '@app/hooks/api/consumerSecrets/types';
import { OrderByDirection } from '@app/hooks/api/generic/types';
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
  } = usePagination('name');

  const { data, isLoading, isFetching } = useGetSecretNotesByProjectId({
    projectId,
    offset,
    limit,
    search: debouncedSearch,
    orderBy: 'name' as SecretNoteOrderBy,
    orderDirection,
  });

  const { notes = [], totalCount = 0 } = data ?? {};
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
                notes.length > 0 &&
                notes.map((secretNote: any) => {
                  const { name, id, content } = secretNote;

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
                          {content && (
                            <Tooltip content={content}>
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
                                    handlePopUpOpen('upsertKey', secretNote)
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
                                    handlePopUpOpen('deleteKey', secretNote)
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
          {!isLoading && notes.length === 0 && (
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
          secretNote={popUp.deleteKey.data as TSecretNote}
        />
        <ConsumerSecretModal
          isOpen={popUp.upsertKey.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle('upsertKey', isOpen)}
          secretNote={popUp.upsertKey.data as TSecretNote | null}
        />
      </div>
    </motion.div>
  );
};
