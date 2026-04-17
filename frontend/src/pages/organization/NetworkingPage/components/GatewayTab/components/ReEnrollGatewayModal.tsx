import { useEffect, useMemo, useState } from "react";
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
import { useConfigureGatewayTokenAuth } from "@app/hooks/api/gateways-v2";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  gatewayData: { id: string; name: string; isPending: boolean } | null;
};

export const ReEnrollGatewayModal = ({ isOpen, onOpenChange, gatewayData }: Props) => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const [enrollmentToken, setEnrollmentToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { mutateAsync: configureTokenAuth } = useConfigureGatewayTokenAuth();

  useEffect(() => {
    if (!isOpen || !gatewayData) return;

    setIsLoading(true);
    configureTokenAuth({ gatewayId: gatewayData.id })
      .then((result) => {
        setEnrollmentToken(result.token);
      })
      .catch(() => {
        createNotification({ type: "error", text: "Failed to generate enrollment token" });
        onOpenChange(false);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen, gatewayData?.id]);

  const command = useMemo(() => {
    const gatewayName = gatewayData?.name ?? "";
    return `infisical gateway start ${gatewayName} --enroll-method=token --token=${enrollmentToken} --domain=${siteURL}`;
  }, [gatewayData?.name, enrollmentToken, siteURL]);

  const handleClose = (open: boolean) => {
    if (!open) {
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
        subTitle="The existing gateway will keep running until the new machine enrolls."
      >
        {isLoading ? (
          <p className="text-sm text-mineshaft-300">Generating enrollment token...</p>
        ) : (
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
