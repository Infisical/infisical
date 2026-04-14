import { useMemo, useState } from "react";
import { faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormLabel,
  IconButton,
  Input,
  Modal,
  ModalClose,
  ModalContent
} from "@app/components/v2";
import { useReEnrollGateway } from "@app/hooks/api/gateways-v2";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  gatewayData: { id: string; name: string; isPending: boolean } | null;
};

export const ReEnrollGatewayModal = ({ isOpen, onOpenChange, gatewayData }: Props) => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const [step, setStep] = useState<"confirm" | "command">("confirm");
  const [enrollmentToken, setEnrollmentToken] = useState("");

  const { mutateAsync: reEnroll, isPending: isReEnrolling } = useReEnrollGateway();

  const handleReEnroll = async () => {
    if (!gatewayData) return;

    try {
      const result = await reEnroll({ gatewayId: gatewayData.id });
      setEnrollmentToken(result.token);
      setStep("command");
    } catch {
      createNotification({ type: "error", text: "Failed to re-enroll gateway" });
    }
  };

  const command = useMemo(() => {
    const gatewayName = gatewayData?.name ?? "";
    return `infisical gateway start ${gatewayName} --enroll-method=static --token=${enrollmentToken} --domain=${siteURL}`;
  }, [gatewayData?.name, enrollmentToken, siteURL]);

  const handleClose = (open: boolean) => {
    if (!open) {
      setStep("confirm");
      setEnrollmentToken("");
    }
    onOpenChange(open);
  };

  if (!gatewayData) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={handleClose}>
      <ModalContent
        className="max-w-2xl"
        title={`Re-enroll ${gatewayData.name}`}
        subTitle={
          step === "confirm"
            ? "This will create a new enrollment token. The existing gateway will keep running until the new machine enrolls."
            : undefined
        }
      >
        {step === "confirm" && (
          <div className="mt-4 flex items-center">
            <Button
              className="mr-4"
              size="sm"
              colorSchema="danger"
              onClick={handleReEnroll}
              isLoading={isReEnrolling}
            >
              Re-enroll
            </Button>
            <ModalClose asChild>
              <Button colorSchema="secondary" variant="plain">
                Cancel
              </Button>
            </ModalClose>
          </div>
        )}
        {step === "command" && (
          <>
            <p className="mb-3 text-sm text-mineshaft-300">
              Run the following command on the machine where you want to deploy the gateway. The
              token expires in 1 hour and can only be used once.
            </p>
            <FormLabel label="CLI Command" />
            <div className="flex gap-2">
              <Input value={command} isDisabled />
              <IconButton
                ariaLabel="copy"
                variant="outline_bg"
                colorSchema="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(command);
                  createNotification({ text: "Command copied to clipboard", type: "info" });
                }}
                className="w-10"
              >
                <FontAwesomeIcon icon={faCopy} />
              </IconButton>
            </div>
            <div className="mt-6 flex items-center">
              <ModalClose asChild>
                <Button className="mr-4" size="sm" colorSchema="secondary">
                  Done
                </Button>
              </ModalClose>
            </div>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
