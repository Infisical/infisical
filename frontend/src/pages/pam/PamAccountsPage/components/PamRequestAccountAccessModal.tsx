import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { useProject } from "@app/context";
import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";
import { useCreateApprovalRequest } from "@app/hooks/api/approvalRequests/mutations";

type Props = {
  accountPath?: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const formSchema = z.object({
  accountPath: z.string().min(1, "Account path is required"),
  accessDuration: z
    .string()
    .min(1, "Access duration is required")
    .refine(
      (value) => {
        try {
          const duration = ms(value);
          return duration > 0;
        } catch {
          return false;
        }
      },
      { message: "Invalid duration format. Use formats like: 1h, 3d, 30m" }
    ),
  justification: z.string().max(512).optional()
});

type FormData = z.infer<typeof formSchema>;

const Content = ({ onOpenChange, accountPath }: Props) => {
  const { projectId } = useProject();
  const { mutateAsync: createApprovalRequest, isPending: isSubmitting } =
    useCreateApprovalRequest();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      accountPath,
      accessDuration: "4h",
      justification: ""
    }
  });

  const {
    control,
    handleSubmit,
    formState: { isValid }
  } = form;

  const onSubmit = async (formData: FormData) => {
    try {
      await createApprovalRequest({
        policyType: ApprovalPolicyType.PamAccess,
        projectId,
        justification: formData.justification || null,
        requestData: {
          accountPath: formData.accountPath,
          accessDuration: formData.accessDuration
        }
      });

      createNotification({
        text: "Access request submitted successfully",
        type: "success"
      });

      onOpenChange(false);
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to submit access request",
        type: "error"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        name="accountPath"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            isRequired
            helperText="Account path including the account name. Supports glob patterns (e.g., /folder/**, /*/account-name)"
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Account Path"
          >
            <Input autoFocus placeholder="/folder/account-name" {...field} />
          </FormControl>
        )}
      />
      <Controller
        name="accessDuration"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label={<TtlFormLabel label="Access Duration" />}
            errorText={error?.message}
            isError={Boolean(error?.message)}
          >
            <Input placeholder="4h" {...field} />
          </FormControl>
        )}
      />
      <Controller
        name="justification"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Justification"
            isOptional
          >
            <TextArea placeholder="I need access to debug production issue..." {...field} />
          </FormControl>
        )}
      />
      <div className="mt-6 flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          colorSchema="secondary"
          isLoading={isSubmitting}
          isDisabled={isSubmitting || !isValid}
        >
          Request Access
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </form>
  );
};

export const PamRequestAccountAccessModal = (props: Props) => {
  const { isOpen, onOpenChange } = props;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl pb-2"
        title="Request Account Access"
        subTitle="Request access to an account path"
      >
        <Content {...props} />
      </ModalContent>
    </Modal>
  );
};
