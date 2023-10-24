import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form"; 
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
    Button,
    FormControl,
    IconButton,
    Input,
    Modal,
    ModalContent} from "@app/components/v2";
import { useToggle } from "@app/hooks";
import {
    useCreateAPIKeyV2,
    useUpdateAPIKeyV2
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = yup.object({
    name: yup.string().required("API Key V2 name is required")
}).required();

export type FormData = yup.InferType<typeof schema>;

type Props = {
    popUp: UsePopUpState<["apiKeyV2"]>;
    handlePopUpToggle: (popUpName: keyof UsePopUpState<["apiKeyV2"]>, state?: boolean) => void;
};

export const APIKeyV2Modal = ({
    popUp,
    handlePopUpToggle
}: Props) => {
    const [newAPIKey, setNewAPIKey] = useState("");
    const [isAPIKeyCopied, setIsAPIKeyCopied] = useToggle(false);

    const { createNotification } = useNotificationContext();
    
    const { mutateAsync: createMutateAsync } = useCreateAPIKeyV2();
    const { mutateAsync: updateMutateAsync } = useUpdateAPIKeyV2();

    const {
        control,
        handleSubmit,
        reset,
        formState: { isSubmitting }
    } = useForm<FormData>({
        resolver: yupResolver(schema),
        defaultValues: {
            name: ""
        }
    });

    useEffect(() => {
        let timer: NodeJS.Timeout;

        if (isAPIKeyCopied) {
            timer = setTimeout(() => setIsAPIKeyCopied.off(), 2000);
        }

        return () => clearTimeout(timer);
    }, [setIsAPIKeyCopied]);

    useEffect(() => {
        const apiKeyData = popUp?.apiKeyV2?.data as { 
            apiKeyDataId: string;
            name: string;
        };
        
        if (apiKeyData) {
            reset({
                name: apiKeyData.name
            });
        } else {
            reset({
                name: ""
            });
        }
    }, [popUp?.apiKeyV2?.data]);

    const copyTokenToClipboard = () => {
        navigator.clipboard.writeText(newAPIKey);
        setIsAPIKeyCopied.on();
    };

    const onFormSubmit = async ({
        name
    }: FormData) => {
        try {
            const apiKeyData = popUp?.apiKeyV2?.data as { 
                apiKeyDataId: string;
                name: string;
            };
            
            if (apiKeyData) {
                // update

                await updateMutateAsync({
                    apiKeyDataId: apiKeyData.apiKeyDataId,
                    name
                });

                handlePopUpToggle("apiKeyV2", false);
            } else {
                // create

                const { apiKey } = await createMutateAsync({
                    name
                });
                
                setNewAPIKey(apiKey);
            }
            
            createNotification({
                text: `Successfully ${popUp?.apiKeyV2?.data ? "updated" : "created"} API Key`,
                type: "success"
            });
        
            reset();
            
        } catch (err) {
            console.error(err);
            createNotification({
                text: `Failed to ${popUp?.apiKeyV2?.data ? "updated" : "created"} API Key`,
                type: "error"
            });
        }
    }

    const hasAPIKey = Boolean(newAPIKey);

    return (
        <Modal
            isOpen={popUp?.apiKeyV2?.isOpen}
                onOpenChange={(isOpen) => {
                handlePopUpToggle("apiKeyV2", isOpen);
                reset();
                setNewAPIKey("");
            }}
        >
            <ModalContent title={`${popUp?.apiKeyV2?.data ? "Update" : "Create"} API Key V2`}>
                {!hasAPIKey ? (
                    <form onSubmit={handleSubmit(onFormSubmit)}>
                        <Controller
                            control={control}
                            defaultValue=""
                            name="name"
                            render={({ field, fieldState: { error } }) => (
                                <FormControl
                                    label="Name"
                                    isError={Boolean(error)}
                                    errorText={error?.message}
                                >
                                <Input 
                                    {...field} 
                                    placeholder="My API Key"
                                />
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
                                {popUp?.apiKeyV2?.data ? "Update" : "Create"}
                            </Button>
                            <Button colorSchema="secondary" variant="plain">
                                Cancel
                            </Button>
                        </div>
                    </form>
                ) : (
                    <div className="mt-2 mb-3 mr-2 flex items-center justify-end rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
                        <p className="mr-4 break-all">{newAPIKey}</p>
                        <IconButton
                            ariaLabel="copy icon"
                            colorSchema="secondary"
                            className="group relative"
                            onClick={copyTokenToClipboard}
                        >
                            <FontAwesomeIcon icon={isAPIKeyCopied ? faCheck : faCopy} />
                            <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                                Click to copy
                            </span>
                        </IconButton>
                    </div>
                )}
            </ModalContent>
        </Modal>
    );
}