import { useEffect } from "react";

import { Button, Modal, ModalContent } from "@app/components/v2";
import { TPamAccount } from "@app/hooks/api/pam";

import { usePamTerminalSession } from "./usePamTerminalSession";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  account?: TPamAccount;
  projectId: string;
};

export const PamTerminalModal = ({ isOpen, onOpenChange, account, projectId }: Props) => {
  const { containerRef, isConnected, disconnect } = usePamTerminalSession({
    accountId: account?.id || "",
    projectId
  });

  useEffect(() => {
    if (!isConnected) return undefined;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isConnected]);

  // Disconnect when modal closes
  useEffect(() => {
    if (!isOpen) {
      disconnect();
    }
  }, [isOpen, disconnect]);

  const handleDisconnect = () => {
    disconnect();
    onOpenChange(false);
  };

  if (!account) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-[90vw]"
        title="Web Launcher"
        subTitle={`${account.name} (${account.resource.name})`}
      >
        <div className="flex flex-col gap-4">
          <div className="h-[70vh] overflow-hidden rounded-md border border-mineshaft-600">
            <div
              className="h-full w-full overflow-hidden rounded-md bg-[#0d1117] p-2 [&_.xterm-viewport]:thin-scrollbar"
              style={{ minHeight: "300px" }}
            >
              <div ref={containerRef} className="h-full w-full" />
            </div>
          </div>

          <div className="flex justify-end">
            {isConnected ? (
              <Button onClick={handleDisconnect} variant="outline_bg">
                Disconnect
              </Button>
            ) : (
              <Button onClick={() => onOpenChange(false)} variant="outline_bg">
                Close
              </Button>
            )}
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
};
