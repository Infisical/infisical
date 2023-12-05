import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form"; 
import { useTranslation } from "react-i18next";
import { faCheck, faCopy, faKey,faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import { format } from "date-fns";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
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
} from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { 
    useCreateMachineIdentityClientSecret,
    useDeleteMachineIdentityClientSecret,
    useGetMachineIdentityClientSecrets} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = yup.object({
    description: yup.string(),
    ttl: yup.string() // TODO: optional
});

export type FormData = yup.InferType<typeof schema>;

type Props = {
    popUp: UsePopUpState<["clientSecret", "deleteClientSecret"]>;
    handlePopUpOpen: (
        popUpName: keyof UsePopUpState<["deleteClientSecret"]>,
        data?: {
            clientSecretPrefix: string;
            clientSecretId: string;
        }
    ) => void;
    handlePopUpToggle: (popUpName: keyof UsePopUpState<["clientSecret", "deleteClientSecret"]>, state?: boolean) => void;
};

export const CreateClientSecretModal = ({
    popUp,
    handlePopUpOpen,
    handlePopUpToggle
}: Props) => {
    const { t } = useTranslation();
    const { createNotification } = useNotificationContext();
    const [token, setToken] = useState("");
    const [isTokenCopied, setIsTokenCopied] = useToggle(false);

    const popUpData = (popUp?.clientSecret?.data as {
        machineId?: string;
        name?: string;
    });
    
    const { data, isLoading } = useGetMachineIdentityClientSecrets(popUpData?.machineId ?? "");
    
    const { mutateAsync: createClientSecretMutateAsync } = useCreateMachineIdentityClientSecret();
    const { mutateAsync: deleteClientSecretMutateAsync } = useDeleteMachineIdentityClientSecret();

    const {
        control,
        handleSubmit,
        reset,
        formState: { isSubmitting }
    } = useForm<FormData>({
        resolver: yupResolver(schema),
        defaultValues: {
            description: "",
            ttl: ""
        }
    });
    
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isTokenCopied) {
            timer = setTimeout(() => setIsTokenCopied.off(), 2000);
        }
    
        return () => clearTimeout(timer);
    }, [isTokenCopied]);

    const copyTokenToClipboard = () => {
        navigator.clipboard.writeText(token);
        setIsTokenCopied.on();
    };
    
    const onFormSubmit = async ({
        description,
        ttl
    }: FormData) => {
        try {
            
            if (!popUpData?.machineId) return;
            
            const { clientSecret } = await createClientSecretMutateAsync({
                machineId: popUpData.machineId,
                description,
                ttl: Number(ttl)
            });

            setToken(clientSecret);

            createNotification({
                text: "Successfully created client secret",
                type: "success"
            });
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to create client secret",
                type: "error"
            });
        }
    }
    
    const onDeleteClientSecretSubmit = async ({
        clientSecretId,
        clientSecretPrefix
    }: {
        clientSecretId: string;
        clientSecretPrefix: string;
    }) => {
        try {
            
            if (!popUpData?.machineId) return;

            await deleteClientSecretMutateAsync({
                machineId: popUpData.machineId,
                clientSecretId
            });

            if (token.startsWith(clientSecretPrefix)) {
                reset();
                setToken("");
            }
            
            handlePopUpToggle("deleteClientSecret", false);
        
            createNotification({
                text: "Successfully deleted client secret",
                type: "success"
            });
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to delete client secret",
                type: "error"
            });
            
        }
    }

    const hasToken = Boolean(token);

    return (
        <Modal
            isOpen={popUp?.clientSecret?.isOpen}
                onOpenChange={(isOpen) => {
                handlePopUpToggle("clientSecret", isOpen);
                reset();
                setToken("");
            }}
        >
            <ModalContent title={`Manage Client Secrets for ${popUpData?.name ?? ""}`}>
                <h2 className="mb-4">New Client Secret</h2>
                {hasToken ? (
                    <div>
                        <div className="mb-4 flex items-center justify-between">
                            <p>We will only show this secret once</p>
                            <Button
                                colorSchema="secondary"
                                type="submit"
                                onClick={() => {
                                    reset();
                                    setToken("");
                                }}
                            >
                                Got it
                            </Button>
                        </div>
                        <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
                            <p className="mr-4 break-all">{token}</p>
                            <IconButton
                                ariaLabel="copy icon"
                                colorSchema="secondary"
                                className="group relative"
                                onClick={copyTokenToClipboard}
                            >
                                <FontAwesomeIcon icon={isTokenCopied ? faCheck : faCopy} />
                                <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                                    {t("common.click-to-copy")}
                                </span>
                            </IconButton>
                        </div>
                    </div>
                ) : (
                    <form 
                        onSubmit={handleSubmit(onFormSubmit)}
                        className="flex mb-8"
                    >
                        <Controller
                            control={control}
                            defaultValue=""
                            name="description"
                            render={({ field, fieldState: { error } }) => (
                                <FormControl
                                    label="Description (optional)"
                                    isError={Boolean(error)}
                                    errorText={error?.message}
                                >
                                    <Input 
                                        {...field} 
                                        placeholder="Description"
                                    />
                                </FormControl>
                            )}
                        />
                        <Controller
                            control={control}
                            defaultValue=""
                            name="ttl"
                            render={({ field, fieldState: { error } }) => (
                                <FormControl
                                    label="TTL (optional)"
                                    isError={Boolean(error)}
                                    errorText={error?.message}
                                    className="ml-4"
                                >
                                    <div className="flex">
                                        <Input 
                                            {...field} 
                                            placeholder="0"
                                            type="number"
                                            min="0"
                                            step="1"
                                        />
                                        <Button
                                            className="ml-4"
                                            size="sm"
                                            type="submit"
                                            isLoading={isSubmitting}
                                            isDisabled={isSubmitting}
                                        >
                                            Create
                                        </Button>
                                    </div>
                                </FormControl>
                            )}
                        />
                    </form>
                )}
                <h2 className="mb-4">Client Secrets</h2>
                <TableContainer>
                    <Table>
                        <THead>
                            <Tr>
                                <Th>Description</Th>
                                <Th>Expires At</Th>
                                <Th>Client Secret</Th>
                                <Th className="w-5" />
                            </Tr>
                        </THead>
                        <TBody>
                            {isLoading && <TableSkeleton columns={4} innerKey="org-machine-identities-client-secrets" />}
                            {!isLoading &&
                            data &&
                            data.length > 0 && 
                            data.map(({
                                _id,
                                description,
                                clientSecretTTL,
                                clientSecretPrefix
                            }) => {
                                let expiresAt;
                                if (clientSecretTTL > 0) {
                                    expiresAt = new Date(new Date().getTime() + clientSecretTTL * 1000);
                                }
                                
                                return (
                                    <Tr className="h-10" key={`mi-client-secret-${_id}`}>
                                        <Td>{description === "" ? "-" : description}</Td>
                                        <Td>{expiresAt ? format(expiresAt, "yyyy-MM-dd") : "-"}</Td>
                                        <Td>{`${clientSecretPrefix}************`}</Td>
                                        <Td className="flex">
                                            <IconButton
                                                onClick={() => {
                                                    handlePopUpOpen("deleteClientSecret", {
                                                        clientSecretPrefix,
                                                        clientSecretId: _id
                                                    });
                                                }}
                                                size="lg"
                                                colorSchema="primary"
                                                variant="plain"
                                                ariaLabel="update"
                                                className="ml-4"
                                            >
                                                <FontAwesomeIcon icon={faXmark} />
                                            </IconButton>
                                        </Td>
                                    </Tr>
                                );
                            })}
                            {!isLoading && data && data?.length === 0 && (
                                <Tr>
                                    <Td colSpan={4}>
                                        <EmptyState title="No client secrets have been created for this machine identity yet" icon={faKey} />
                                    </Td>
                                </Tr>
                            )}
                        </TBody>
                    </Table>
                </TableContainer>
                <DeleteActionModal
                    isOpen={popUp.deleteClientSecret.isOpen}
                    title={`Are you sure want to delete the client secret ${
                        (popUp?.deleteClientSecret?.data as { clientSecretPrefix: string })?.clientSecretPrefix || ""
                    }************?`}
                    onChange={(isOpen) => handlePopUpToggle("deleteClientSecret", isOpen)}
                    deleteKey="confirm"
                    onDeleteApproved={() => {
                        const deleteClientSecretData = (popUp?.deleteClientSecret?.data as {
                            clientSecretId: string;
                            clientSecretPrefix: string;
                        });
                        
                        return onDeleteClientSecretSubmit({
                            clientSecretId: deleteClientSecretData.clientSecretId,
                            clientSecretPrefix: deleteClientSecretData.clientSecretPrefix
                        });
                    }}
                />
            </ModalContent>
        </Modal>
    );
}