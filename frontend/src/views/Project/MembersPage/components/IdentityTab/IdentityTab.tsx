import Link from "next/link";
import {
    faArrowUpRightFromSquare,
    faClock,
    faEdit,
    faPlus,
    faServer,
    faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
    Button,
    DeleteActionModal,
    EmptyState,
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
    IconButton,
    Modal,
    ModalContent,
    Table,
    TableContainer,
    TableSkeleton,
    Tag,
    TBody,
    Td,
    Th,
    THead,
    Tooltip,
    Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { useDeleteIdentityFromWorkspace, useGetWorkspaceIdentityMemberships } from "@app/hooks/api";
import { IdentityMembership } from "@app/hooks/api/identities/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { IdentityModal } from "./components/IdentityModal";
import { IdentityRoleForm } from "./components/IdentityRoleForm";

const MAX_ROLES_TO_BE_SHOWN_IN_TABLE = 2;
const formatRoleName = (role: string, customRoleName?: string) => {
    if (role === ProjectMembershipRole.Custom) return customRoleName;
    if (role === ProjectMembershipRole.Member) return "Developer";
    return role;
};
export const IdentityTab = withProjectPermission(
    () => {
        const { currentWorkspace } = useWorkspace();

        const workspaceId = currentWorkspace?.id ?? "";

        const { data, isLoading } = useGetWorkspaceIdentityMemberships(currentWorkspace?.id || "");
        const { mutateAsync: deleteMutateAsync } = useDeleteIdentityFromWorkspace();

        const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
            "identity",
            "deleteIdentity",
            "upgradePlan",
            "updateRole"
        ] as const);

        const onRemoveIdentitySubmit = async (identityId: string) => {
            try {
                await deleteMutateAsync({
                    identityId,
                    workspaceId
                });

                createNotification({
                    text: "Successfully removed identity from project",
                    type: "success"
                });

                handlePopUpClose("deleteIdentity");
            } catch (err) {
                console.error(err);
                const error = err as any;
                const text = error?.response?.data?.message ?? "Failed to remove identity from project";

                createNotification({
                    text,
                    type: "error"
                });
            }
        };

        return (
            <motion.div
                key="identity-role-panel"
                transition={{ duration: 0.15 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: 30 }}
            >
                <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
                    <div className="mb-4 flex items-center justify-between">
                        <p className="text-xl font-semibold text-mineshaft-100">Identities</p>
                        <div className="flex w-full justify-end pr-4">
                            <Link href="https://infisical.com/docs/documentation/platform/identities/overview">
                                <span className="w-max cursor-pointer rounded-md border border-mineshaft-500 bg-mineshaft-600 px-4 py-2 text-mineshaft-200 duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-white">
                                    Documentation{" "}
                                    <FontAwesomeIcon
                                        icon={faArrowUpRightFromSquare}
                                        className="mb-[0.06rem] ml-1 text-xs"
                                    />
                                </span>
                            </Link>
                        </div>
                        <ProjectPermissionCan
                            I={ProjectPermissionActions.Create}
                            a={ProjectPermissionSub.Identity}
                        >
                            {(isAllowed) => (
                                <Button
                                    colorSchema="primary"
                                    type="submit"
                                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                                    onClick={() => handlePopUpOpen("identity")}
                                    isDisabled={!isAllowed}
                                >
                                    Add identity
                                </Button>
                            )}
                        </ProjectPermissionCan>
                    </div>
                    <TableContainer>
                        <Table>
                            <THead>
                                <Tr>
                                    <Th>Name</Th>
                                    <Th>Role</Th>
                                    <Th>Added on</Th>
                                    <Th className="w-5" />
                                </Tr>
                            </THead>
                            <TBody>
                                {isLoading && <TableSkeleton columns={7} innerKey="project-identities" />}
                                {!isLoading &&
                                    data &&
                                    data.length > 0 &&
                                    data.map((identityMember, index) => {
                                        const {
                                            identity: { id, name },
                                            roles,
                                            createdAt
                                        } = identityMember;
                                        return (
                                            <Tr className="h-10" key={`st-v3-${id}`}>
                                                <Td>{name}</Td>

                                                <Td>
                                                    <div className="flex items-center space-x-2">
                                                        {roles
                                                            .slice(0, MAX_ROLES_TO_BE_SHOWN_IN_TABLE)
                                                            .map(
                                                                ({
                                                                    role,
                                                                    customRoleName,
                                                                    id: roleId,
                                                                    isTemporary,
                                                                    temporaryAccessEndTime
                                                                }) => {
                                                                    const isExpired =
                                                                        new Date() > new Date(temporaryAccessEndTime || ("" as string));
                                                                    return (
                                                                        <Tag key={roleId}>
                                                                            <div className="flex items-center space-x-2">
                                                                                <div>{formatRoleName(role, customRoleName)}</div>
                                                                                {isTemporary && (
                                                                                    <div>
                                                                                        <Tooltip
                                                                                            content={
                                                                                                isExpired
                                                                                                    ? "Timed role expired"
                                                                                                    : "Timed role access"
                                                                                            }
                                                                                        >
                                                                                            <FontAwesomeIcon
                                                                                                icon={faClock}
                                                                                                className={twMerge(isExpired && "text-red-600")}
                                                                                            />
                                                                                        </Tooltip>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </Tag>
                                                                    );
                                                                }
                                                            )}
                                                        {roles.length > MAX_ROLES_TO_BE_SHOWN_IN_TABLE && (
                                                            <HoverCard>
                                                                <HoverCardTrigger>
                                                                    <Tag>+{roles.length - MAX_ROLES_TO_BE_SHOWN_IN_TABLE}</Tag>
                                                                </HoverCardTrigger>
                                                                <HoverCardContent className="border border-gray-700 bg-mineshaft-800 p-4">
                                                                    {roles
                                                                        .slice(MAX_ROLES_TO_BE_SHOWN_IN_TABLE)
                                                                        .map(
                                                                            ({
                                                                                role,
                                                                                customRoleName,
                                                                                id: roleId,
                                                                                isTemporary,
                                                                                temporaryAccessEndTime
                                                                            }) => {
                                                                                const isExpired =
                                                                                    new Date() >
                                                                                    new Date(temporaryAccessEndTime || ("" as string));
                                                                                return (
                                                                                    <Tag key={roleId} className="capitalize">
                                                                                        <div className="flex items-center space-x-2">
                                                                                            <div>{formatRoleName(role, customRoleName)}</div>
                                                                                            {isTemporary && (
                                                                                                <div>
                                                                                                    <Tooltip
                                                                                                        content={
                                                                                                            isExpired
                                                                                                                ? "Access expired"
                                                                                                                : "Temporary access"
                                                                                                        }
                                                                                                    >
                                                                                                        <FontAwesomeIcon
                                                                                                            icon={faClock}
                                                                                                            className={twMerge(
                                                                                                                new Date() >
                                                                                                                new Date(
                                                                                                                    temporaryAccessEndTime as string
                                                                                                                ) && "text-red-600"
                                                                                                            )}
                                                                                                        />
                                                                                                    </Tooltip>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </Tag>
                                                                                );
                                                                            }
                                                                        )}
                                                                </HoverCardContent>
                                                            </HoverCard>
                                                        )}
                                                        <Tooltip content="Edit permission">
                                                            <IconButton
                                                                size="sm"
                                                                variant="plain"
                                                                ariaLabel="update-role"
                                                                onClick={() =>
                                                                    handlePopUpOpen("updateRole", { ...identityMember, index })
                                                                }
                                                            >
                                                                <FontAwesomeIcon icon={faEdit} />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </div>
                                                </Td>
                                                <Td>{format(new Date(createdAt), "yyyy-MM-dd")}</Td>
                                                <Td className="flex justify-end">
                                                    <ProjectPermissionCan
                                                        I={ProjectPermissionActions.Delete}
                                                        a={ProjectPermissionSub.Identity}
                                                    >
                                                        {(isAllowed) => (
                                                            <IconButton
                                                                onClick={() => {
                                                                    handlePopUpOpen("deleteIdentity", {
                                                                        identityId: id,
                                                                        name
                                                                    });
                                                                }}
                                                                size="lg"
                                                                colorSchema="danger"
                                                                variant="plain"
                                                                ariaLabel="update"
                                                                className="ml-4"
                                                                isDisabled={!isAllowed}
                                                            >
                                                                <FontAwesomeIcon icon={faXmark} />
                                                            </IconButton>
                                                        )}
                                                    </ProjectPermissionCan>
                                                </Td>
                                            </Tr>
                                        );
                                    })}
                                {!isLoading && data && data?.length === 0 && (
                                    <Tr>
                                        <Td colSpan={7}>
                                            <EmptyState
                                                title="No identities have been added to this project"
                                                icon={faServer}
                                            />
                                        </Td>
                                    </Tr>
                                )}
                            </TBody>
                        </Table>
                    </TableContainer>
                    <Modal
                        isOpen={popUp.updateRole.isOpen}
                        onOpenChange={(state) => handlePopUpToggle("updateRole", state)}
                    >
                        <ModalContent
                            className="max-w-4xl"
                            title={`Manage Access for ${(popUp.updateRole.data as IdentityMembership)?.identity?.name
                                }`}
                            subTitle={`
Configure role-based access control by Infisical users a mix of one built-in role, multiple custom roles, and multiple specific privileges. A user will gain access to alll actions within the roles assigned to them, not just the actions those roles share in common. You must choose at least one permanent role.
`}
                        >
                            <IdentityRoleForm
                                onOpenUpgradeModal={(description) =>
                                    handlePopUpOpen("upgradePlan", { description })
                                }
                                identityProjectMember={
                                    data?.[
                                    (popUp.updateRole?.data as IdentityMembership & { index: number })?.index
                                    ] as IdentityMembership
                                }
                            />
                        </ModalContent>
                    </Modal>
                    <IdentityModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
                    <DeleteActionModal
                        isOpen={popUp.deleteIdentity.isOpen}
                        title={`Are you sure want to remove ${(popUp?.deleteIdentity?.data as { name: string })?.name || ""
                            } from the project?`}
                        onChange={(isOpen) => handlePopUpToggle("deleteIdentity", isOpen)}
                        deleteKey="confirm"
                        onDeleteApproved={() =>
                            onRemoveIdentitySubmit(
                                (popUp?.deleteIdentity?.data as { identityId: string })?.identityId
                            )
                        }
                    />
                </div>
            </motion.div>
        );
    },
    { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Identity }
);
