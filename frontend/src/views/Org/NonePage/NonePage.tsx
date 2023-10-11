import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
    Button,
    FormControl,
    Input,
    Modal,
    ModalContent} from "@app/components/v2";
import { useCreateOrg } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

const schema = yup.object({
    name: yup.string().required("Organization name is required"),
}).required();

export type FormData = yup.InferType<typeof schema>;

export const NonePage = () => {
    const { createNotification } = useNotificationContext();
    const { popUp, handlePopUpOpen,  handlePopUpToggle } = usePopUp([
        "createOrg",
    ] as const);
    
    const { mutateAsync } = useCreateOrg();
    
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
        handlePopUpOpen("createOrg");
    }, []);
    
    const onFormSubmit = async ({ name }: FormData) => {
        try {
            
            const organization = await mutateAsync({
                name
            });

            createNotification({
                text: "Successfully created organization",
                type: "success"
            });

            window.location.href = `/org/${organization._id}/overview`;
            
            reset();
            handlePopUpToggle("createOrg", false);
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to created organization",
                type: "error"
            });
        }
    }

    return (
      <div className="flex justify-center bg-bunker-800 text-white w-full h-full">
        <Modal
            isOpen={popUp?.createOrg?.isOpen}
        >
            <ModalContent 
                title="Create Organization"
                subTitle="Looks like you're not part of any organizations. Create one to start using Infisical"
            >
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
                                placeholder="Acme Corp"
                            />
                            </FormControl>
                        )}
                    />
                    <Button
                        className=""
                        size="sm"
                        type="submit"
                        isLoading={isSubmitting}
                        isDisabled={isSubmitting}
                    >
                        Create
                    </Button>
                </form>
            </ModalContent>
        </Modal>
      </div>
    );
}