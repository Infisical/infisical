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
  ModalContent
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useToggle } from "@app/hooks";
import {
    useAddUserToOrg
} from "@app/hooks/api";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { UsePopUpState } from "@app/hooks/usePopUp";

const addMemberFormSchema = yup.object({
  email: yup.string().email().required().label("Email").trim()
});

type TAddMemberForm = yup.InferType<typeof addMemberFormSchema>; // TODO: change to FormData

type Props = {
  popUp: UsePopUpState<["addMember"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["addMember"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addMember"]>, state?: boolean) => void;
};

// TODO: test no-SMTP setup case

export const AddOrgMemberModal = ({
    popUp,
    handlePopUpToggle,
    handlePopUpClose
}: Props) => {
    const { currentOrg } = useOrganization();
    const { data: serverDetails } = useFetchServerStatus();
    const { createNotification } = useNotificationContext();

    const [isInviteLinkCopied, setInviteLinkCopied] = useToggle(false);
    const [completeInviteLink, setCompleteInviteLink] = useState<string | undefined>("");
    const {
        control,
        handleSubmit,
        reset
    } = useForm<TAddMemberForm>({ resolver: yupResolver(addMemberFormSchema) });

    const { mutateAsync, isLoading } = useAddUserToOrg();

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isInviteLinkCopied) {
            timer = setTimeout(() => setInviteLinkCopied.off(), 2000);
        }

        return () => clearTimeout(timer);
    }, [isInviteLinkCopied]);

    const copyTokenToClipboard = () => {
        navigator.clipboard.writeText(completeInviteLink as string);
        setInviteLinkCopied.on();
    };
    
    const onFormSubmit = async ({ email }: TAddMemberForm) => {
        try {
            if (!currentOrg?._id) return;

            const { data } = await mutateAsync({
                organizationId: currentOrg?._id,
                inviteeEmail: email
            });
            
            setCompleteInviteLink(data?.completeInviteLink);

            if (!data.completeInviteLink) {
                createNotification({
                    text: "Successfully sent an invite to the user.",
                    type: "success"
                });
            }

            if (serverDetails?.emailConfigured){
                handlePopUpClose("addMember");
            }

            reset();
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to send an invite to the user",
                type: "error"
            });
        }
    }
    
    return (
        <Modal
            isOpen={popUp?.addMember?.isOpen}
            onOpenChange={(isOpen) => {
                handlePopUpToggle("addMember", isOpen);
                setCompleteInviteLink(undefined);
            }}
        >
            <ModalContent
                title={`Invite others to ${currentOrg?.name ?? ""}`}
                subTitle={
                    <div>
                    {!completeInviteLink && <div>
                        An invite is specific to an email address and expires after 1 day.
                        <br />
                        For security reasons, you will need to separately add members to projects.
                    </div>}
                    {completeInviteLink && "This Infisical instance does not have a email provider setup. Please share this invite link with the invitee manually"}
                    </div>
                }
            >
                {!completeInviteLink && (
                    <form onSubmit={handleSubmit(onFormSubmit)} >
                        <Controller
                        control={control}
                        defaultValue=""
                        name="email"
                        render={({ field, fieldState: { error } }) => (
                            <FormControl label="Email" isError={Boolean(error)} errorText={error?.message}>
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
                            Add Member
                        </Button>
                        <Button
                            colorSchema="secondary"
                            variant="plain"
                            onClick={() => handlePopUpClose("addMember")}
                        >
                            Cancel
                        </Button>
                        </div>
                    </form>
                )}
                {completeInviteLink && (
                    <div className="mt-2 mb-3 mr-2 flex items-center justify-end rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
                        <p className="mr-4 break-all">{completeInviteLink}</p>
                        <IconButton
                            ariaLabel="copy icon"
                            colorSchema="secondary"
                            className="group relative"
                            onClick={copyTokenToClipboard}
                        >
                            <FontAwesomeIcon icon={isInviteLinkCopied ? faCheck : faCopy} />
                            <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">click to copy</span>
                        </IconButton>
                    </div>
                )}
            </ModalContent>
        </Modal> 
    );
}