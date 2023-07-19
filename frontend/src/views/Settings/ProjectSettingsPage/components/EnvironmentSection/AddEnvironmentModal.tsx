import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useCreateWsEnvironment } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
    popUp: UsePopUpState<["createEnv"]>;
    handlePopUpClose: (popUpName: keyof UsePopUpState<["createEnv"]>) => void;
    handlePopUpToggle: (popUpName: keyof UsePopUpState<["createEnv"]>, state?: boolean) => void;
};

const schema = yup.object({
  environmentName: yup.string().label("Environment Name").required(),
  environmentSlug: yup.string().label("Environment Slug").required()
});

export type FormData = yup.InferType<typeof schema>;

export const AddEnvironmentModal = ({
    popUp,
    handlePopUpClose,
    handlePopUpToggle
}: Props) => {
  const { createNotification } = useNotificationContext();
  const { currentWorkspace } = useWorkspace();
    const { mutateAsync, isLoading } = useCreateWsEnvironment();
    const {
        control,
        handleSubmit,
        reset
    } = useForm<FormData>({
        resolver: yupResolver(schema)
    });

    const onFormSubmit = async ({
        environmentName,
        environmentSlug
    }: FormData) => {
        try {
            if (!currentWorkspace?._id) return;

            await mutateAsync({ 
                workspaceID: currentWorkspace._id, 
                environmentName, 
                environmentSlug 
            });

            createNotification({
                text: "Successfully created environment",
                type: "success"
            });
        
            handlePopUpClose("createEnv");
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to create environment",
                type: "error"
            });
        }
    };

    return (
        <Modal
            isOpen={popUp?.createEnv?.isOpen}
            onOpenChange={(isOpen) => {
                handlePopUpToggle("createEnv", isOpen);
                reset();
            }}
        >
            <ModalContent title="Create a new environment">
                <form onSubmit={handleSubmit(onFormSubmit)}>
                    <Controller
                        control={control}
                        defaultValue=""
                        name="environmentName"
                        render={({ field, fieldState: { error } }) => (
                        <FormControl
                            label="Environment Name"
                            isError={Boolean(error)}
                            errorText={error?.message}
                        >
                        <Input {...field} />
                        </FormControl>
                    )}
                    />
                    <Controller
                        control={control}
                        defaultValue=""
                        name="environmentSlug"
                        render={({ field, fieldState: { error } }) => (
                            <FormControl
                                label="Environment Slug"
                                helperText="Slugs are shorthands used in cli to access environment"
                                isError={Boolean(error)}
                                errorText={error?.message}
                            >
                            <Input {...field} />
                            </FormControl>
                        )}
                    />
                    <div className="mt-8 flex items-center">
                        <Button
                            className="mr-4"
                            size="sm"
                            type="submit"
                            isLoading={isLoading}
                            isDisabled={isLoading}
                        >
                            Create
                        </Button>

                        <Button colorSchema="secondary" variant="plain">
                            Cancel
                        </Button>
                    </div>
                </form>
            </ModalContent>
        </Modal>
    );
}