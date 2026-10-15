import { useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheckCircle, faFileSignature, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DiscardChangesAlertDialog,
  Field,
  FieldError,
  FieldLabel,
  IconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextArea,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { getAllowedSigningAlgorithms, getDefaultSigningAlgorithm } from "@app/helpers/kms";
import { useDiscardChangesGuard, useTimedReset } from "@app/hooks";
import { SigningAlgorithm, TCmek, useCmekSign } from "@app/hooks/api/cmeks";

const formSchema = z.object({
  data: z.string(),
  signingAlgorithm: z.nativeEnum(SigningAlgorithm),
  isBase64Encoded: z.boolean()
});

export type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  cmek: TCmek;
};

type FormProps = Pick<Props, "cmek"> & {
  cmekSign: ReturnType<typeof useCmekSign>;
  onDirtyChange: (isDirty: boolean) => void;
};

const SignForm = ({ cmek, cmekSign, onDirtyChange }: FormProps) => {
  const fieldId = useId();
  const formId = `${fieldId}-form`;
  const { reset: resetSignResult } = cmekSign;

  useEffect(() => resetSignResult, [resetSignResult]);

  const {
    handleSubmit,
    register,
    control,
    formState: { dirtyFields, isSubmitting, errors }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      signingAlgorithm: getDefaultSigningAlgorithm(cmek),
      isBase64Encoded: false
    }
  });

  const [copySignature, isCopyingSignature, setCopySignature] = useTimedReset<string>({
    initialState: "Copy to Clipboard"
  });

  const handleSignData = async (formData: FormData) => {
    await cmekSign.mutateAsync({ ...formData, keyId: cmek.id });
    createNotification({
      text: "Successfully signed data",
      type: "success"
    });
  };

  const signature = cmekSign.data?.signature;
  const isDirty = Object.keys(dirtyFields).length > 0;

  useEffect(() => {
    onDirtyChange(isDirty && !signature);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange, signature]);

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(signature ?? "");

    setCopySignature("Copied to Clipboard");
  };

  const allowedSigningAlgorithms = getAllowedSigningAlgorithms(cmek);

  return (
    <>
      <DialogBody>
        <form id={formId} onSubmit={handleSubmit(handleSignData)}>
          {signature ? (
            <Field className="mb-4">
              <FieldLabel htmlFor={`${fieldId}-signature`}>Data Signature</FieldLabel>
              <TextArea id={`${fieldId}-signature`} rows={4} readOnly value={signature} />
            </Field>
          ) : (
            <>
              <Field className="mb-4" data-invalid={Boolean(errors.data)}>
                <FieldLabel htmlFor={`${fieldId}-data`}>Data to Sign</FieldLabel>
                <TextArea
                  {...register("data")}
                  rows={7}
                  id={`${fieldId}-data`}
                  isError={Boolean(errors.data)}
                  aria-describedby={errors.data ? `${fieldId}-data-error` : undefined}
                />
                <FieldError id={`${fieldId}-data-error`} errors={[errors.data]} />
              </Field>

              <div className="mb-6 flex flex-col gap-2">
                <Controller
                  control={control}
                  name="signingAlgorithm"
                  render={({ field: { onChange, value } }) => (
                    <Field className="mb-4" data-invalid={Boolean(errors.signingAlgorithm)}>
                      <FieldLabel htmlFor={`${fieldId}-signing-algorithm`}>
                        Signing Algorithm
                      </FieldLabel>
                      <Select onValueChange={onChange} value={value}>
                        <SelectTrigger
                          id={`${fieldId}-signing-algorithm`}
                          className="w-full"
                          isError={Boolean(errors.signingAlgorithm)}
                          aria-describedby={
                            errors.signingAlgorithm
                              ? `${fieldId}-signing-algorithm-error`
                              : undefined
                          }
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {allowedSigningAlgorithms.map((a) => (
                            <SelectItem key={a} value={a}>
                              {a.replaceAll("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError
                        id={`${fieldId}-signing-algorithm-error`}
                        errors={[errors.signingAlgorithm]}
                      />
                    </Field>
                  )}
                />

                <Controller
                  control={control}
                  name="isBase64Encoded"
                  render={({ field: { onChange, value } }) => (
                    <Field orientation="horizontal">
                      <Toggle
                        id={`${fieldId}-encode-base-64`}
                        checked={value}
                        onCheckedChange={onChange}
                      />
                      <FieldLabel htmlFor={`${fieldId}-encode-base-64`}>
                        Data is Base64 encoded
                      </FieldLabel>
                      <Tooltip hoverable selectable={false} delayDuration={50}>
                        <TooltipTrigger asChild>
                          <IconButton variant="ghost" size="xs" aria-label="About Base64 encoding">
                            <FontAwesomeIcon icon={faInfoCircle} className="text-muted" />
                          </IconButton>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs" sideOffset={5}>
                          Toggle this switch on if your data is already Base64 encoded to avoid
                          redundant encoding.
                        </TooltipContent>
                      </Tooltip>
                    </Field>
                  )}
                />
              </div>
            </>
          )}
        </form>
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" isDisabled={isSubmitting}>
            {signature ? "Close" : "Cancel"}
          </Button>
        </DialogClose>
        <Button
          className={signature ? "w-44" : undefined}
          size="sm"
          variant="project"
          onClick={signature ? handleCopyToClipboard : undefined}
          type={signature ? "button" : "submit"}
          form={formId}
          isPending={isSubmitting}
          isDisabled={isSubmitting}
        >
          {
            // eslint-disable-next-line no-nested-ternary
            signature ? (
              isCopyingSignature ? (
                <FontAwesomeIcon icon={faCheckCircle} />
              ) : (
                <FontAwesomeIcon icon={faFileSignature} />
              )
            ) : (
              <FontAwesomeIcon icon={faFileSignature} />
            )
          }
          {signature ? copySignature : "Sign"}
        </Button>
      </DialogFooter>
    </>
  );
};

export const CmekSignModal = ({ isOpen, onOpenChange, cmek }: Props) => {
  const cmekSign = useCmekSign();
  const [isDirty, setIsDirty] = useState(false);
  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: () => onOpenChange(false) });

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => (open ? onOpenChange(true) : requestDiscard())}>
        <DialogContent isPending={cmekSign.isPending}>
          <DialogHeader>
            <DialogTitle>Sign Data</DialogTitle>
            <DialogDescription>
              Sign data using <span className="font-bold">{cmek?.name}</span>. Returns a Base64
              encoded signature.
            </DialogDescription>
          </DialogHeader>
          <SignForm cmek={cmek} cmekSign={cmekSign} onDirtyChange={setIsDirty} />
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Signing Data?"
        description="Your unsent signing data will be lost."
      />
    </>
  );
};
