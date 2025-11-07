import { Controller, useForm } from "react-hook-form";
import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  TextArea
} from "@app/components/v2";
import { useUpdateAccessRequest } from "@app/hooks/api/accessApproval/mutation";
import { accessApprovalKeys } from "@app/hooks/api/accessApproval/queries";
import { TAccessApprovalRequest } from "@app/hooks/api/accessApproval/types";

type ContentProps = {
  accessRequest: TAccessApprovalRequest;
  onComplete: (request: TAccessApprovalRequest) => void;
  projectSlug: string;
};

const EditSchema = z.object({
  temporaryRange: z
    .string()
    .nonempty("Required")
    .transform((val, ctx) => {
      const parsedMs = ms(val);

      if (typeof parsedMs !== "number" || parsedMs <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Invalid time period format or value. Must be a positive duration (e.g., '1h', '30m', '2d')."
        });
        return z.NEVER;
      }
      return val;
    }),
  editNote: z.string().nonempty("Required")
});

type FormData = z.infer<typeof EditSchema>;

const Content = ({ accessRequest, onComplete, projectSlug }: ContentProps) => {
  const update = useUpdateAccessRequest();
  const queryClient = useQueryClient();
  const {
    handleSubmit,
    control,
    formState: { isSubmitting }
  } = useForm({
    resolver: zodResolver(EditSchema),
    defaultValues: {
      temporaryRange: accessRequest.temporaryRange ?? "1h",
      editNote: ""
    }
  });

  const onSubmit = async (form: FormData) => {
    const request = await update.mutateAsync({
      requestId: accessRequest.id,
      projectSlug,
      ...form
    });
    await queryClient.refetchQueries({
      queryKey: accessApprovalKeys.getAccessApprovalPolicies(projectSlug)
    });

    createNotification({
      type: "success",
      text: "Access request updated successfully."
    });
    onComplete(request);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="mb-4 flex w-full items-start rounded-md border border-yellow/50 bg-yellow/30 px-4 py-2 text-sm text-yellow-200">
        <FontAwesomeIcon icon={faWarning} className="mt-1 mr-2.5 text-base text-yellow" />
        Updating this access request will restart the review process and require all approvers to
        re-approve it.
      </div>
      <Controller
        control={control}
        defaultValue="1h"
        name="temporaryRange"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label={<TtlFormLabel label="Access Duration" />}
            isError={Boolean(error?.message)}
            errorText={error?.message}
            helperText={`Must be less than current access duration: ${accessRequest.isTemporary ? accessRequest.temporaryRange : "Permanent"}`}
          >
            <Input {...field} />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="editNote"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Reason for Editing"
            isError={Boolean(error?.message)}
            errorText={error?.message}
          >
            <TextArea
              className="resize-none!"
              rows={4}
              {...field}
              placeholder="Provide a reason for updating this request..."
            />
          </FormControl>
        )}
      />
      <div className="mt-4 flex gap-x-2">
        <Button
          type="submit"
          variant="outline_bg"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          Update Request
        </Button>
        <ModalClose asChild>
          <Button variant="plain" colorSchema="secondary">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </form>
  );
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  accessRequest?: TAccessApprovalRequest;
  onComplete: (request: TAccessApprovalRequest) => void;
  projectSlug: string;
};

export const EditAccessRequestModal = ({
  isOpen,
  onOpenChange,
  accessRequest,
  onComplete,
  projectSlug
}: Props) => {
  if (!accessRequest) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Edit Access Request"
        subTitle="Modify this access request for re-approval."
      >
        <Content
          projectSlug={projectSlug}
          accessRequest={accessRequest}
          onComplete={(request) => {
            onComplete(request);
            onOpenChange(false);
          }}
        />
      </ModalContent>
    </Modal>
  );
};
