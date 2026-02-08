import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Modal, ModalContent } from "@app/components/v2";
import { TPamAccount } from "@app/hooks/api/pam";

import type { WebSocketServerMessage } from "./pam-terminal-types";
import { usePamTerminal } from "./PamTerminal";
import { useTerminalWebSocket } from "./useTerminalWebSocket";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  account?: TPamAccount;
  projectId: string;
};

export const PamTerminalModal = ({ isOpen, onOpenChange, account, projectId }: Props) => {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const handleMessageRef = useRef<((message: WebSocketServerMessage) => void) | null>(null);
  const connectRef = useRef<(() => void) | null>(null);

  const handleMessage = useCallback((message: WebSocketServerMessage) => {
    handleMessageRef.current?.(message);
  }, []);

  const { connect, disconnect, sendInput } = useTerminalWebSocket({
    accountId: account?.id || "",
    projectId,
    onConnect: () => {
      setIsSessionActive(true);
    },
    onDisconnect: () => {
      setIsSessionActive(false);
    },
    onMessage: handleMessage
  });

  // Keep connectRef in sync so onReady can call connect()
  connectRef.current = connect;

  // Cleanup when modal closes
  useEffect(() => {
    if (!isOpen) {
      disconnect();
      setIsSessionActive(false);
      handleMessageRef.current = null;
    }
  }, [isOpen, disconnect]);

  // Warn user before page unload when connected
  useEffect(() => {
    if (!isSessionActive) return undefined;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isSessionActive]);

  const handleDisconnect = () => {
    disconnect();
    onOpenChange(false);
  };

  const handleInputFromTerminal = useCallback(
    (input: string) => {
      sendInput(input);
    },
    [sendInput]
  );

  const terminal = usePamTerminal({
    onInput: handleInputFromTerminal,
    onReady: (api) => {
      handleMessageRef.current = api.handleMessage;
      connectRef.current?.();
    }
  });

  // Focus terminal when session becomes active
  const focusTerminal = terminal.focus;
  useEffect(() => {
    if (!isSessionActive) return undefined;

    const timerId = setTimeout(() => focusTerminal(), 100);
    return () => clearTimeout(timerId);
  }, [isSessionActive, focusTerminal]);

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
            {terminal.terminalElement}
          </div>

          <div className="flex justify-end">
            {isSessionActive ? (
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
