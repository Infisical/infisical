import { faPlug, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
	Button,
	DeleteActionModal,
	EmptyState,
	Modal,
	ModalContent,
	Table,
	TableContainer,
	TableSkeleton,
	TBody,
	Td,
	THead,
	Tr,
	UpgradePlanModal
} from "@app/components/v2";
import {
	ProjectPermissionActions,
	ProjectPermissionSub,
	useSubscription,
	useWorkspace
} from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { useDeleteAuditLogStream, useGetAuditLogStreams } from "@app/hooks/api";

import { AuditLogStreamForm } from "./AuditLogStreamForm";

export const AuditLogStreamsTab = withProjectPermission(
	() => {
		const { currentWorkspace } = useWorkspace();
		const projectSlug = currentWorkspace?.slug || "";
		const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
			"auditLogStreamForm",
			"deleteAuditLogStream",
			"upgradePlan"
		] as const);
		const { subscription } = useSubscription();

		const { data: auditLogStreams, isLoading: isAuditLogStreamsLoading } =
			useGetAuditLogStreams(projectSlug);

		// mutation
		const { mutateAsync: deleteAuditLogStream } = useDeleteAuditLogStream();

		const handleAuditLogStreamDelete = async () => {
			try {
				const auditLogStreamId = popUp?.deleteAuditLogStream?.data as string;
				await deleteAuditLogStream({
					id: auditLogStreamId,
					projectSlug
				});
				handlePopUpClose("deleteAuditLogStream");
				createNotification({
					type: "success",
					text: "Successfully deleted stream"
				});
			} catch (err) {
				console.log(err);
				createNotification({
					type: "error",
					text: "Failed to delete stream"
				});
			}
		};

		return (
			<div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
				<div className="flex justify-between">
					<p className="text-xl font-semibold text-mineshaft-100">Audit Log Streams</p>
					<ProjectPermissionCan
						I={ProjectPermissionActions.Create}
						a={ProjectPermissionSub.Settings}
					>
						{(isAllowed) => (
							<Button
								onClick={() => {
									if (subscription && !subscription?.auditLogStreams) {
										handlePopUpOpen("upgradePlan");
										return;
									}
									handlePopUpOpen("auditLogStreamForm");
								}}
								leftIcon={<FontAwesomeIcon icon={faPlus} />}
								isDisabled={!isAllowed}
							>
								Create
							</Button>
						)}
					</ProjectPermissionCan>
				</div>
				<p className="mb-8 text-gray-400">
					Manage audit log streams to send audit log to any logging providers with syslog support.
				</p>
				<div>
					<TableContainer>
						<Table>
							<THead>
								<Tr>
									<Td>URL</Td>
									<Td className="text-right">Action</Td>
								</Tr>
							</THead>
							<TBody>
								{isAuditLogStreamsLoading && (
									<TableSkeleton columns={2} innerKey="stream-loading" />
								)}
								{!isAuditLogStreamsLoading && auditLogStreams && auditLogStreams?.length === 0 && (
									<Tr>
										<Td colSpan={5}>
											<EmptyState title="No audit log streams found" icon={faPlug} />
										</Td>
									</Tr>
								)}
								{!isAuditLogStreamsLoading &&
									auditLogStreams?.map(({ id, url }) => (
										<Tr key={id}>
											<Td className="max-w-xs overflow-hidden text-ellipsis hover:overflow-auto hover:break-all">
												{url}
											</Td>
											<Td>
												<div className="flex items-center justify-end space-x-2">
													<ProjectPermissionCan
														I={ProjectPermissionActions.Edit}
														a={ProjectPermissionSub.Settings}
													>
														{(isAllowed) => (
															<Button
																variant="outline_bg"
																size="xs"
																isDisabled={!isAllowed}
																onClick={() => handlePopUpOpen("auditLogStreamForm", id)}
															>
																Edit
															</Button>
														)}
													</ProjectPermissionCan>
													<ProjectPermissionCan
														I={ProjectPermissionActions.Delete}
														a={ProjectPermissionSub.Settings}
													>
														{(isAllowed) => (
															<Button
																variant="outline_bg"
																className="border-red-800 bg-red-800 hover:border-red-700 hover:bg-red-700"
																colorSchema="danger"
																size="xs"
																isDisabled={!isAllowed}
																onClick={() => handlePopUpOpen("deleteAuditLogStream", id)}
															>
																Delete
															</Button>
														)}
													</ProjectPermissionCan>
												</div>
											</Td>
										</Tr>
									))}
							</TBody>
						</Table>
					</TableContainer>
				</div>
				<Modal
					isOpen={popUp.auditLogStreamForm.isOpen}
					onOpenChange={(isModalOpen) => {
						handlePopUpToggle("auditLogStreamForm", isModalOpen);
					}}
				>
					<ModalContent
						title={`${popUp?.auditLogStreamForm?.data ? "Update" : "Create"} Audit Log Stream `}
						subTitle="Streams enable the transmission of audit logs to third-party providers."
					>
						<AuditLogStreamForm
							id={popUp?.auditLogStreamForm?.data as string}
							onClose={() => handlePopUpToggle("auditLogStreamForm")}
						/>
					</ModalContent>
				</Modal>
				<UpgradePlanModal
					isOpen={popUp.upgradePlan.isOpen}
					onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
					text="You can add audit log streams if you switch to Infisical's Enterprise  plan."
				/>
				<DeleteActionModal
					isOpen={popUp.deleteAuditLogStream.isOpen}
					deleteKey="delete"
					title="Are you sure you want to remove this stream?"
					onChange={(isOpen) => handlePopUpToggle("deleteAuditLogStream", isOpen)}
					onClose={() => handlePopUpClose("deleteAuditLogStream")}
					onDeleteApproved={handleAuditLogStreamDelete}
				/>
			</div>
		);
	},
	{ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Settings }
);
