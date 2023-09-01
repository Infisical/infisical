import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useCreateWsTag } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = yup.object({
    name: yup.string().required().label("Tag Name")
});

export type FormData = yup.InferType<typeof schema>;

type Props = {
    popUp: UsePopUpState<["CreateSecretTag", "deleteTagConfirmation"]>;
    handlePopUpClose: (popUpName: keyof UsePopUpState<["CreateSecretTag", "deleteTagConfirmation"]>) => void;
    handlePopUpToggle: (popUpName: keyof UsePopUpState<["CreateSecretTag", "deleteTagConfirmation"]>, state?: boolean) => void;
};

export const AddSecretTagModal = ({
    popUp,
    handlePopUpClose,
    handlePopUpToggle
}: Props) => {
    const { createNotification } = useNotificationContext();
    const { currentWorkspace }= useWorkspace();
    const createWsTag = useCreateWsTag();
    const {
        control,
        reset,
        handleSubmit,
        formState: { isSubmitting }
    } = useForm<FormData>({
        resolver: yupResolver(schema)
    });
  
    const onFormSubmit = async ({
        name
    }: FormData) => {
        try {
            if (!currentWorkspace?._id) return;

            await createWsTag.mutateAsync({
                workspaceID: currentWorkspace?._id,
                tagName: name,
                tagSlug: name.replace(/\s+/g, " ").replace(" ", "_"),
                tagColor: ""
            });

            handlePopUpClose("CreateSecretTag");

            createNotification({
                text: "Successfully created a tag",
                type: "success"
            });
            reset()
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to create a tag",
                type: "error"
            });
        }
    }

    return (
        <Modal
            isOpen={popUp?.CreateSecretTag?.isOpen}
            onOpenChange={(open) => {
                handlePopUpToggle("CreateSecretTag", open);
                reset();
            }}
        >
            <ModalContent
                title={`Add a tag for ${currentWorkspace?.name ?? ""}`}
                subTitle="Specify your tag name, and the slug will be created automatically."
            >
                <form onSubmit={handleSubmit(onFormSubmit)}>
                    <Controller
                        control={control}
                        name="name"
                        defaultValue=""
                        render={({ field, fieldState: { error } }) => (
                            <FormControl
                                label="Tag Name"
                                isError={Boolean(error)}
                                errorText={error?.message}
                            >
                                <Input {...field} placeholder="Type your tag name" />
                            </FormControl>
                        )}
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
    );
}