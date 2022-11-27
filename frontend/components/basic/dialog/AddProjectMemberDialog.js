import { Dialog, Transition } from "@headlessui/react";
import { Fragment, useState } from "react";
import ListBox from "../Listbox";
import { useRouter } from "next/router";
import Button from "../buttons/Button";
import useTranslation from "next-translate/useTranslation";
import Trans from "next-translate/Trans";

const AddProjectMemberDialog = ({
	isOpen,
	closeModal,
	submitModal,
	data,
	email,
	workspaceId,
	setEmail,
}) => {
	const router = useRouter();
	const { t } = useTranslation();

	return (
		<div className="z-50">
			<Transition appear show={isOpen} as={Fragment}>
				<Dialog as="div" className="relative" onClose={closeModal}>
					<Transition.Child
						as={Fragment}
						enter="ease-out duration-300"
						enterFrom="opacity-0"
						enterTo="opacity-100"
						leave="ease-in duration-200"
						leaveFrom="opacity-100"
						leaveTo="opacity-0"
					>
						<div className="fixed inset-0 bg-black bg-opacity-70" />
					</Transition.Child>

					<div className="fixed inset-0 overflow-y-auto">
						<div className="flex min-h-full items-center justify-center p-4 text-center">
							<Transition.Child
								as={Fragment}
								enter="ease-out duration-300"
								enterFrom="opacity-0 scale-95"
								enterTo="opacity-100 scale-100"
								leave="ease-in duration-200"
								leaveFrom="opacity-100 scale-100"
								leaveTo="opacity-0 scale-95"
							>
								<Dialog.Panel className="w-full max-w-md transform rounded-md bg-bunker-800 border border-gray-700 p-6 text-left align-middle shadow-xl transition-all">
									{data?.length > 0 ? (
										<Dialog.Title
											as="h3"
											className="text-lg font-medium leading-6 text-gray-400 z-50"
										>
											{t(
												"settings:add-member-dialog.add-member-to-project"
											)}
										</Dialog.Title>
									) : (
										<Dialog.Title
											as="h3"
											className="text-lg font-medium leading-6 text-gray-400 z-50"
										>
											{t(
												"settings:add-member-dialog.already-all-invited"
											)}
										</Dialog.Title>
									)}
									<div className="mt-2 mb-4">
										{data?.length > 0 ? (
											<div className="flex flex-col">
												<p className="text-sm text-gray-500">
													{t(
														"settings:add-member-dialog.user-will-email"
													)}
												</p>
												<div className="">
													<Trans
														i18nKey="settings:add-member-dialog.looking-add"
														components={[
															<button
																type="button"
																className="inline-flex justify-center rounded-md py-1 text-sm text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
																onClick={() =>
																	router.push(
																		"/settings/org/" +
																			router
																				.query
																				.id
																	)
																}
															/>,
															<button
																type="button"
																className="ml-1 inline-flex justify-center rounded-md py-1 text-sm text-gray-500 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
																onClick={() =>
																	router.push(
																		"/settings/org/" +
																			router
																				.query
																				.id +
																			"?invite"
																	)
																}
															>
																click here.
															</button>,
														]}
													/>
												</div>
											</div>
										) : (
											<p className="text-sm text-gray-500">
												{t(
													"settings:add-member-dialog.add-user-org-first"
												)}
											</p>
										)}
									</div>
									<div className="max-h-28">
										{data?.length > 0 && (
											<ListBox
												selected={
													email ? email : data[0]
												}
												onChange={setEmail}
												data={data}
												width="full"
											/>
										)}
									</div>
									<div className="max-w-max">
										{data?.length > 0 ? (
											<div className="mt-6 flex flex-col justify-start w-max">
												<Button
													onButtonPressed={
														submitModal
													}
													color="mineshaft"
													text={t(
														"settings:add-member-dialog.add-member"
													)}
													size="md"
												/>
											</div>
										) : (
											<Button
												onButtonPressed={() =>
													router.push(
														"/settings/org/" +
															router.query.id
													)
												}
												color="mineshaft"
												text={t(
													"settings:add-member-dialog.add-user-to-org"
												)}
												size="md"
											/>
										)}
									</div>
								</Dialog.Panel>
							</Transition.Child>
						</div>
					</div>
				</Dialog>
			</Transition>
		</div>
	);
};

export default AddProjectMemberDialog;
