import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  Select,
  SelectItem,
  TextArea
} from "@app/components/v2";
import { useProject } from "@app/context";
import {
  approvalPolicyQuery,
  ApprovalPolicyType,
  TApprovalPolicy
} from "@app/hooks/api/approvalPolicies";
import { useCreateApprovalRequest } from "@app/hooks/api/approvalRequests/mutations";
import { useListSigners } from "@app/hooks/api/signers";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const toDatetimeLocalValue = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const getDefaultWindowStart = () => toDatetimeLocalValue(new Date());
const getDefaultWindowEnd = () => {
  const d = new Date();
  d.setHours(d.getHours() + 4);
  return toDatetimeLocalValue(d);
};

const formSchema = z
  .object({
    signerId: z.string().min(1, "Signer is required"),
    justification: z.string().max(512).optional(),
    windowStart: z.string().optional(),
    windowEnd: z.string().optional(),
    requestedSignings: z
      .union([z.coerce.number().int().positive(), z.nan(), z.undefined()])
      .optional()
      .transform((val) => (typeof val === "number" && !Number.isNaN(val) ? val : undefined))
  })
  .superRefine((data, ctx) => {
    if (data.windowStart) {
      const start = new Date(data.windowStart);
      if (start < new Date()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Start time cannot be in the past",
          path: ["windowStart"]
        });
      }
    }
    if (data.windowStart && data.windowEnd) {
      const start = new Date(data.windowStart);
      const end = new Date(data.windowEnd);
      if (end <= start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "End time must be after start time",
          path: ["windowEnd"]
        });
      }
    }
  });

type FormData = z.infer<typeof formSchema>;

const Content = ({ onOpenChange }: Props) => {
  const { projectId } = useProject();
  const { mutateAsync: createApprovalRequest, isPending: isSubmitting } =
    useCreateApprovalRequest();

  const { data: signersData } = useListSigners({
    projectId,
    limit: 100
  });

  const { data: policies = [] } = useQuery(
    approvalPolicyQuery.list({
      policyType: ApprovalPolicyType.CertCodeSigning,
      projectId
    })
  );

  const signers = useMemo(
    () => (signersData?.signers ?? []).filter((s) => s.approvalPolicyId),
    [signersData?.signers]
  );

  const policyMap = useMemo(() => {
    const map = new Map<string, TApprovalPolicy>();
    policies.forEach((policy) => {
      map.set(policy.id, policy);
    });
    return map;
  }, [policies]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      signerId: "",
      justification: "",
      windowStart: getDefaultWindowStart(),
      windowEnd: getDefaultWindowEnd(),
      requestedSignings: 5
    }
  });

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { isValid }
  } = form;

  const selectedSignerId = watch("signerId");

  const selectedSigner = useMemo(
    () => signers.find((s) => s.id === selectedSignerId),
    [signers, selectedSignerId]
  );

  const selectedPolicy = useMemo(
    () =>
      selectedSigner?.approvalPolicyId ? policyMap.get(selectedSigner.approvalPolicyId) : undefined,
    [selectedSigner, policyMap]
  );

  const { hasTimeConstraint, hasCountConstraint } = useMemo(() => {
    if (!selectedPolicy) return { hasTimeConstraint: false, hasCountConstraint: false };
    const constraints = selectedPolicy.constraints?.constraints as
      | { maxWindowDuration?: string; maxSignings?: number }
      | undefined;
    return {
      hasTimeConstraint: Boolean(constraints?.maxWindowDuration),
      hasCountConstraint: Boolean(constraints?.maxSignings)
    };
  }, [selectedPolicy]);

  useEffect(() => {
    if (hasTimeConstraint) {
      setValue("windowStart", getDefaultWindowStart());
      setValue("windowEnd", getDefaultWindowEnd());
    } else {
      setValue("windowStart", undefined);
      setValue("windowEnd", undefined);
    }

    if (hasCountConstraint) {
      setValue("requestedSignings", 5);
    } else {
      setValue("requestedSignings", undefined);
    }

    trigger();
  }, [hasTimeConstraint, hasCountConstraint, setValue, trigger]);

  const onSubmit = async (formData: FormData) => {
    if (!selectedSigner || !selectedPolicy) return;

    let requestedWindowStart: string | undefined;
    let requestedWindowEnd: string | undefined;

    if (hasTimeConstraint && formData.windowStart && formData.windowEnd) {
      requestedWindowStart = new Date(formData.windowStart).toISOString();
      requestedWindowEnd = new Date(formData.windowEnd).toISOString();
    }

    await createApprovalRequest({
      policyType: ApprovalPolicyType.CertCodeSigning,
      projectId,
      justification: formData.justification || null,
      requestData: {
        signerId: selectedSigner.id,
        approvalPolicyId: selectedSigner.approvalPolicyId!,
        signerName: selectedSigner.name,
        ...(requestedWindowStart && { requestedWindowStart }),
        ...(requestedWindowEnd && { requestedWindowEnd }),
        ...(hasCountConstraint &&
          formData.requestedSignings != null && { requestedSignings: formData.requestedSignings })
      }
    });

    createNotification({
      text: "Signing access request submitted successfully",
      type: "success"
    });

    onOpenChange(false);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        name="signerId"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Signer"
            errorText={error?.message}
            isError={Boolean(error?.message)}
            helperText="Select the signer you want to request signing access for"
          >
            <Select
              value={field.value}
              onValueChange={field.onChange}
              placeholder="Select a signer..."
              className="w-full"
            >
              {signers.map((signer) => (
                <SelectItem key={signer.id} value={signer.id}>
                  {signer.name}
                  {signer.certificateCommonName ? ` (${signer.certificateCommonName})` : ""}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      {hasTimeConstraint && (
        <div className="grid grid-cols-2 gap-4">
          <Controller
            name="windowStart"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Window Start"
                errorText={error?.message}
                isError={Boolean(error?.message)}
              >
                <Input type="datetime-local" {...field} />
              </FormControl>
            )}
          />
          <Controller
            name="windowEnd"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Window End"
                errorText={error?.message}
                isError={Boolean(error?.message)}
              >
                <Input type="datetime-local" {...field} />
              </FormControl>
            )}
          />
        </div>
      )}
      {hasCountConstraint && (
        <Controller
          name="requestedSignings"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Number of Signings"
              errorText={error?.message}
              isError={Boolean(error?.message)}
              helperText="How many signing operations you need"
            >
              <Input
                type="number"
                min={1}
                placeholder="5"
                {...field}
                onChange={(e) => field.onChange(e.target.valueAsNumber || undefined)}
              />
            </FormControl>
          )}
        />
      )}
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
            <TextArea placeholder="I need to sign the v2.0.0 release artifacts..." {...field} />
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
          isDisabled={isSubmitting || !isValid || !selectedSigner}
        >
          Request Signing Access
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

export const RequestSigningAccessModal = (props: Props) => {
  const { isOpen, onOpenChange } = props;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl pb-2"
        title="Request Signing Access"
        subTitle="Request approval to sign with a code signing key"
      >
        <Content {...props} />
      </ModalContent>
    </Modal>
  );
};
