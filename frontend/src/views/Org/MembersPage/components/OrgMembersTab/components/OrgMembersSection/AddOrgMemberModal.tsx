import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button, FormControl, IconButton, Input, Modal, ModalContent } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useToggle } from "@app/hooks";
import { useAddUserToOrg, useFetchServerStatus } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const addMemberFormSchema = yup.object({
  email: yup.string().email().required().label("Email").trim().lowercase()
});

type TAddMemberForm = yup.InferType<typeof addMemberFormSchema>;

type Props = {
  popUp: UsePopUpState<["addMember"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addMember"]>, state?: boolean) => void;
  completeInviteLink: string;
  setCompleteInviteLink: (link: string) => void;
};

export const AddOrgMemberModal = ({
  popUp,
  handlePopUpToggle,
  completeInviteLink,
  setCompleteInviteLink
}: Props) => {
  const { createNotification } = useNotificationContext();
  const { currentOrg } = useOrganization();

  const { data: serverDetails } = useFetchServerStatus();
  const { mutateAsync: addUserMutateAsync } = useAddUserToOrg();

  const [isInviteLinkCopied, setInviteLinkCopied] = useToggle(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TAddMemberForm>({ resolver: yupResolver(addMemberFormSchema) });

  const onAddMember = async ({ email }: TAddMemberForm) => {
    if (!currentOrg?.id) return;

    try {
      const { data } = await addUserMutateAsync({
        organizationId: currentOrg?.id,
        inviteeEmail: email
      });

      setCompleteInviteLink(data?.completeInviteLink ?? "");

      // only show this notification when email is configured.
      // A [completeInviteLink] will not be sent if smtp is configured

      if (!data.completeInviteLink) {
        createNotification({
          text: "Successfully invited user to the organization.",
          type: "success"
        });
      }
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to invite user to org",
        type: "error"
      });
    }

    if (serverDetails?.emailConfigured) {
      handlePopUpToggle("addMember", false);
    }

    reset();
  };

  const copyTokenToClipboard = () => {
    navigator.clipboard.writeText(completeInviteLink as string);
    setInviteLinkCopied.on();
  };

  return (
    <Modal
      isOpen={popUp?.addMember?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addMember", isOpen);
        setCompleteInviteLink("");
      }}
    >
      <ModalContent
        title={`Invite others to ${currentOrg?.name}`}
        subTitle={
          <div>
            {!completeInviteLink && (
              <div>
                An invite is specific to an email address and expires after 1 day.
                <br />
                For security reasons, you will need to separately add members to projects.
              </div>
            )}
            {completeInviteLink &&
              "This Infisical instance does not have a email provider setup. Please share this invite link with the invitee manually"}
          </div>
        }
      >
        {!completeInviteLink && (
          <form onSubmit={handleSubmit(onAddMember)}>
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
                isLoading={isSubmitting}
                isDisabled={isSubmitting}
              >
                Add Member
              </Button>
              <Button
                colorSchema="secondary"
                variant="plain"
                onClick={() => handlePopUpToggle("addMember", false)}
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
              <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                click to copy
              </span>
            </IconButton>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
};
