import { useEffect, useState } from 'react';
import { Controller,useForm } from 'react-hook-form';
import {
    faKey,
    faMagnifyingGlass,
    faPlus,
    faTrash} from '@fortawesome/free-solid-svg-icons';
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
    Select,
    SelectItem,
    Table,
    TableContainer,
    TableSkeleton,
    TBody,
    Td,
    Th,
    THead,
    Tr} from '@app/components/v2';
import { usePopUp } from '@app/hooks';
import {
    useCreateServiceAccountProjectLevelPermissions,
    useDeleteServiceAccountProjectLevelPermissions,
    useGetServiceAccountProjectLevelPermissions,
    useGetUserWorkspaces} from '@app/hooks/api';

const createProjectLevelPermissionSchema = yup.object({
    workspace: yup.string().required().label('Workspace'),
    environment: yup.string().required().label('Environment'),
    permissions: yup.object().shape({
        canRead: yup.boolean().required(),
        canWrite: yup.boolean().required(),
        canUpdate: yup.boolean().required(),
        canDelete: yup.boolean().required(),
    }).defined().required()
});

type CreateProjectLevelPermissionForm = yup.InferType<typeof createProjectLevelPermissionSchema>;

type Props = {
    serviceAccountId: string;
}

export const SAProjectLevelPermissionsTable = ({
    serviceAccountId
}: Props) => {
    const { data: userWorkspaces, isLoading: isUserWorkspacesLoading } = useGetUserWorkspaces();
    const [searchPermissions, setSearchPermissions] = useState('');
    const [defaultValues, setDefaultValues] = useState<CreateProjectLevelPermissionForm | undefined>(undefined);

    const { data: permissions, isLoading: isPermissionsLoading } = useGetServiceAccountProjectLevelPermissions(serviceAccountId);
    
    const createServiceAccountProjectLevelPermissions = useCreateServiceAccountProjectLevelPermissions();
    const deleteServiceAccountProjectLevelPermissions = useDeleteServiceAccountProjectLevelPermissions();

    const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
        'addProjectLevelPermissions',
        'removeProjectLevelPermissions',
    ] as const);

    const {
        control,
        handleSubmit,
        reset,
        formState: { isSubmitting }
    } = useForm<CreateProjectLevelPermissionForm>({ resolver: yupResolver(createProjectLevelPermissionSchema), defaultValues })

    const onAddProjectLevelPermissions = async ({
        workspace,
        environment,
        permissions: { canRead, canWrite, canUpdate, canDelete }
    }: CreateProjectLevelPermissionForm) => {
        await createServiceAccountProjectLevelPermissions.mutateAsync({
            serviceAccountId,
            workspaceId: workspace,
            environment,
            canRead,
            canWrite,
            canUpdate,
            canDelete
        });
        handlePopUpClose('addProjectLevelPermissions');
    }
    
    const onRemoveProjectLevelPermissions = async () => {
        const serviceAccountWorkspacePermissionsId = (popUp?.removeProjectLevelPermissions?.data as { _id: string })?._id;
        await deleteServiceAccountProjectLevelPermissions.mutateAsync({
           serviceAccountId,
           serviceAccountWorkspacePermissionsId
        });
        handlePopUpClose('removeProjectLevelPermissions');
    }

    useEffect(() => {
        if (userWorkspaces) {
            setDefaultValues({
                workspace: String(userWorkspaces?.[0]?._id),
                environment: String(userWorkspaces?.[0]?.environments?.[0]?.slug),
                permissions: {
                    canRead: true,
                    canWrite: false,
                    canUpdate: false,
                    canDelete: false,
                }
            });
        }
    }, [userWorkspaces]);
    

    return (
        <div className="w-full">
            <div className="mb-4 flex">
                <div className="mr-4 flex-1">
                    <Input 
                        value={searchPermissions}
                        onChange={(e) => setSearchPermissions(e.target.value)}
                        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                        placeholder="Search service account project-level permissions..."
                    />
                </div>
                <Button
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    onClick={() => {
                        handlePopUpOpen('addProjectLevelPermissions')
                        reset();
                    }}
                >
                    Add Permission
                </Button>
            </div>
            <TableContainer>
                <Table>
                    <THead>
                        <Tr>
                            <Th>Project</Th>
                            <Th>Environment</Th>
                            <Th>Read</Th>
                            <Th>Write</Th>
                            <Th>Update</Th>
                            <Th>Delete</Th>
                            <Th aria-label="actions" />
                        </Tr>
                    </THead>
                    <TBody>
                        {isPermissionsLoading && <TableSkeleton columns={6} key="service-account-project-level-permissions" />}
                        {!isPermissionsLoading && permissions && (
                            permissions.map(({
                                _id,
                                workspace,
                                environment,
                                canRead,
                                canWrite,
                                canUpdate,
                                canDelete
                            }) => {
                                const environmentName = (workspace.environments.find((env) => env.slug === environment))?.name;
                                return (
                                    <Tr key={`service-account-project-level-permission-${_id}`} className="w-full">
                                        <Td>{workspace.name}</Td>
                                        <Td>{environmentName}</Td>
                                        <Td>
                                            <Checkbox
                                                id="isReadPermissionEnabled"
                                                isChecked={canRead}
                                                isDisabled
                                             />
                                        </Td>
                                        <Td>
                                            <Checkbox
                                                id="isWritePermissionEnabled"
                                                isChecked={canWrite}
                                                isDisabled
                                             />
                                        </Td>
                                        <Td>
                                            <Checkbox
                                                id="isUpdatePermissionEnabled"
                                                isChecked={canUpdate}
                                                isDisabled
                                             />
                                        </Td>
                                        <Td>
                                            <Checkbox
                                                id="isDeletePermissionEnabled"
                                                isChecked={canDelete}
                                             />
                                        </Td>
                                        <Td>
                                            <IconButton
                                                ariaLabel="delete"
                                                colorSchema="danger"
                                                onClick={() => handlePopUpOpen('removeProjectLevelPermissions', { _id })}
                                            >
                                                <FontAwesomeIcon icon={faTrash} />
                                            </IconButton>
                                        </Td>
                                    </Tr>
                                );
                            })
                        )}
                        {!isPermissionsLoading && permissions?.length === 0 && (
                            <Tr>
                                <Td colSpan={7} className="py-6 text-center text-bunker-400">
                                    <EmptyState title="No permissions found" icon={faKey} />
                                </Td>
                            </Tr>
                        )}
                    </TBody>
                </Table>
            </TableContainer>
            <Modal
                isOpen={popUp?.addProjectLevelPermissions?.isOpen}
                onOpenChange={(isOpen) => {
                    handlePopUpToggle('addProjectLevelPermissions', isOpen);
                }}
            >
                <ModalContent
                    title="Add a Project-Level Permission"
                    subTitle="The service account will be granted scoped access to the specified project and environment"
                >
                    <form onSubmit={handleSubmit(onAddProjectLevelPermissions)}>
                        {!isUserWorkspacesLoading && userWorkspaces && (
                            <>
                                <Controller
                                    control={control}
                                    name="workspace"
                                    defaultValue={String(userWorkspaces?.[0]?._id)}
                                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                                        <FormControl
                                            label="Project"
                                            errorText={error?.message}
                                        >
                                            <Select
                                                defaultValue={field.value}
                                                {...field}
                                                onValueChange={(e) => onChange(e)}
                                                className="w-full border border-mine-shaft-500"
                                            >
                                                {userWorkspaces && userWorkspaces.length > 0 ? (
                                                    userWorkspaces.map((userWorkspace) => {
                                                        return (
                                                            <SelectItem value={userWorkspace._id} key={`project-${userWorkspace._id}`}>
                                                                {userWorkspace.name}
                                                            </SelectItem>
                                                        );
                                                    })
                                                ) : (
                                                    <SelectItem value="none" key="target-app-none">
                                                        No projects found
                                                    </SelectItem>
                                                )}
                                            </Select>
                                        </FormControl>
                                    )}
                                />
                                <Controller
                                    control={control}
                                    name="environment"
                                    defaultValue={String(userWorkspaces?.[0]?.environments?.[0]?.slug)}
                                    render={({ field: { onChange, ...field } }) => {
                                        /* eslint-disable-next-line no-underscore-dangle */
                                        const environments = userWorkspaces?.find((userWorkspace) => userWorkspace._id === control?._formValues?.workspace)?.environments ?? [];
                                        return (
                                            <FormControl
                                                label="Environment"
                                                className="mt-4"
                                            >
                                                <Select
                                                    defaultValue={field.value}
                                                    {...field}
                                                    onValueChange={(e) => onChange(e)}
                                                    className="w-full border border-mine-shaft-500"
                                                >
                                                    {environments.length > 0 ? (
                                                        environments.map((environment) => {
                                                            return (
                                                                <SelectItem value={environment.slug} key={`environment-${environment.slug}`}>
                                                                    {environment.name}
                                                                </SelectItem>
                                                            );
                                                        })
                                                    ) : (
                                                        <SelectItem value="none" key="target-app-none">
                                                            No environments found
                                                        </SelectItem>
                                                    )}
                                                </Select>
                                            </FormControl>
                                        );
                                    }}
                                />
                            </>
                        )}
                        <Controller 
                            control={control}
                            name="permissions"
                            defaultValue={{
                                canRead: true,
                                canWrite: false,
                                canUpdate: false,
                                canDelete: false
                            }}
                            render={({ field: { onChange, value }, fieldState: { error }}) => { 
                                const options = [
                                    {
                                        label: 'Read (default)',
                                        value: 'canRead'
                                    }, 
                                    {
                                        label: 'Write',
                                        value: 'canWrite'
                                    },
                                    {
                                        label: 'Update',
                                        value: 'canUpdate'
                                    },
                                    {
                                        label: 'Delete',
                                        value: 'canDelete'
                                    }
                                ];
                                
                                return (
                                    <FormControl
                                        label="Permissions"
                                        errorText={error?.message}
                                        isError={Boolean(error)}
                                    >
                                        <>
                                            {options.map(({ label, value: optionValue }) => {
                                                return (
                                                    <Checkbox
                                                        id={value[optionValue]}
                                                        key={optionValue}
                                                        className="data-[state=checked]:bg-primary"
                                                        isChecked={value[optionValue]}
                                                        isDisabled={optionValue === 'read'}
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
            <DeleteActionModal
                isOpen={popUp.removeProjectLevelPermissions.isOpen}
                deleteKey="remove"
                title="Do you want to remove this permission from the service account?"
                onChange={(isOpen) => handlePopUpToggle('removeProjectLevelPermissions', isOpen)}
                onDeleteApproved={onRemoveProjectLevelPermissions}
            />
        </div>
    );
}