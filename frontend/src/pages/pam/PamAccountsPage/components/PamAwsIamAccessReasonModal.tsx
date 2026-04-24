import { useEffect, useState } from "react";

import { Button, Modal, ModalContent, TextArea } from "@app/components/v2";
import { TPamAccount } from "@app/hooks/api/pam";

type Props = {
  account?: TPamAccount;
  isOpen: boolean;
  isPending?: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (reason: string) => void;
};

export const PamAwsIamAccessReasonModal = ({
  account,
  isOpen,
  isPending,
  onOpenChange,
  onSubmit
}: Props) => {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setTouched(false);
    }
  }, [isOpen, account?.id]);

  if (!account) return null;

  const isReasonRequired = Boolean(account.requireReason);
  const trimmed = reason.trim();
  const canSubmit = !isReasonRequired || trimmed.length > 0;
  const showError = touched && isReasonRequired && trimmed.length === 0;

  const handleSubmit = () => {
    if (!canSubmit) {
      setTouched(true);
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-md"
        title={isReasonRequired ? "Reason Required" : "Open AWS Console"}
        subTitle={
          isReasonRequired
            ? "This account's policy requires a reason for access."
            : "Optionally provide a reason for this session."
        }
      >
        <div className="mt-1 flex flex-col gap-2">
          <TextArea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              isReasonRequired
                ? "e.g. Investigating incident INC-1234"
                : "Optional, e.g. Reviewing IAM permissions"
            }
            rows={3}
            maxLength={1000}
            isError={showError}
          />
          {showError && <p className="text-xs text-red">A reason is required to continue.</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="outline_bg"
              colorSchema="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button isLoading={isPending} onClick={handleSubmit}>
              {!isReasonRequired && trimmed.length === 0 ? "Skip & Continue" : "Continue"}
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
};
