import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
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
import { UnstableAlert, UnstableAlertDescription, UnstableAlertTitle } from "@app/components/v3";
import { useProject } from "@app/context";
import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";
import { useCreateApprovalRequest } from "@app/hooks/api/approvalRequests/mutations";

type Props = {
  resourceName?: string;
  accountName?: string;
  accountAccessed?: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const formSchema = z.object({
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

const Content = ({ onOpenChange, resourceName, accountName, accountAccessed }: Props) => {
  const { projectId } = useProject();
  const { mutateAsync: createApprovalRequest, isPending: isSubmitting } =
    useCreateApprovalRequest();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
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
          accessDuration: formData.accessDuration,
          ...(resourceName && { resourceName }),
          ...(accountName && { accountName })
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
      {accountAccessed && (
        <UnstableAlert variant="info" className="mb-3">
          <InfoIcon />
          <UnstableAlertTitle>This account is protected by an approval policy</UnstableAlertTitle>
          <UnstableAlertDescription>
            You must request access by filling out the fields below.
          </UnstableAlertDescription>
        </UnstableAlert>
      )}
      {resourceName && accountName && (
        <div className="mb-4 rounded-md border border-mineshaft-600 bg-mineshaft-700/50 p-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-mineshaft-400">Resource</span>
              <p className="text-sm text-mineshaft-100">{resourceName}</p>
            </div>
            <div>
              <span className="text-xs text-mineshaft-400">Account</span>
              <p className="text-sm text-mineshaft-100">{accountName}</p>
            </div>
          </div>
        </div>
      )}
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
        subTitle="Request access to a protected account"
      >
        <Content {...props} />
      </ModalContent>
    </Modal>
  );
};
