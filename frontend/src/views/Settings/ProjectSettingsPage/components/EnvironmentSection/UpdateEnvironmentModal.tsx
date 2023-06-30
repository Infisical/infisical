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
import { useUpdateWsEnvironment } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
    popUp: UsePopUpState<["updateEnv"]>;
    handlePopUpClose: (popUpName: keyof UsePopUpState<["updateEnv"]>) => void;
    handlePopUpToggle: (popUpName: keyof UsePopUpState<["updateEnv"]>, state?: boolean) => void;
};

const schema = yup.object({
  environmentName: yup.string().label("Environment Name").required(),
  environmentSlug: yup.string().label("Environment Slug").required()
});

export type FormData = yup.InferType<typeof schema>;

export const UpdateEnvironmentModal = ({
    popUp,
    handlePopUpClose,
    handlePopUpToggle
}: Props) => {
  const { createNotification } = useNotificationContext();
  const { currentWorkspace } = useWorkspace();
    const { mutateAsync, isLoading } = useUpdateWsEnvironment();
    const {
        control,
        handleSubmit,
        reset
    } = useForm<FormData>({
        resolver: yupResolver(schema)
    });

    const oldEnvironmentSlug = (popUp?.updateEnv?.data as { slug: string })?.slug;
    
    const onFormSubmit = async ({
        environmentName,
        environmentSlug
    }: FormData) => {
        try {
            if (!currentWorkspace?._id) return;
            
            await mutateAsync({
                workspaceID: currentWorkspace._id,
                environmentName,
                environmentSlug,
                oldEnvironmentSlug
            });

            createNotification({
                text: "Successfully updated environment",
                type: "success"
            });
        
            handlePopUpClose("updateEnv");
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to update environment",
                type: "error"
            });
        }
    };

    return (
        <Modal
            isOpen={popUp?.updateEnv?.isOpen}
            onOpenChange={(isOpen) => {
                handlePopUpToggle("updateEnv", isOpen);
                reset();
            }}
        >
            <ModalContent title="Update environment">
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
                            Update
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