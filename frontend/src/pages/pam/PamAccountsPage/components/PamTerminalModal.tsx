import { useCallback, useEffect, useRef, useState } from "react";
import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, Modal, ModalContent, Spinner } from "@app/components/v2";
import { TPamAccount } from "@app/hooks/api/pam";

import type { ModalState, WebSocketServerMessage } from "./pam-terminal-types";
import { usePamTerminal } from "./PamTerminal";
import { useTerminalWebSocket } from "./useTerminalWebSocket";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  account?: TPamAccount;
  projectId: string;
};

export const PamTerminalModal = ({ isOpen, onOpenChange, account, projectId }: Props) => {
  const [modalState, setModalState] = useState<ModalState>("connecting");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const handleMessageRef = useRef<((message: WebSocketServerMessage) => void) | null>(null);
  const messageQueueRef = useRef<WebSocketServerMessage[]>([]);

  const handleMessage = useCallback((message: WebSocketServerMessage) => {
    if (handleMessageRef.current) {
      handleMessageRef.current(message);
    } else {
      messageQueueRef.current.push(message);
    }
  }, []);

  const modalStateRef = useRef<ModalState>(modalState);
  modalStateRef.current = modalState;

  const { connect, disconnect, sendInput } = useTerminalWebSocket({
    accountId: account?.id || "",
    projectId,
    onConnect: () => {
      setModalState("connected");
    },
    onDisconnect: () => {
      if (modalStateRef.current === "connected") {
        setModalState("disconnected");
      }
    },
    onError: (error) => {
      setErrorMessage(error);
      setModalState("error");
    },
    onMessage: handleMessage
  });

  // Connect when modal opens, cleanup when it closes
  useEffect(() => {
    if (isOpen) {
      setModalState("connecting");
      connect();
    } else {
      disconnect();
      setModalState("connecting");
      setErrorMessage("");
      handleMessageRef.current = null;
      messageQueueRef.current = [];
    }
  }, [isOpen, connect, disconnect]);

  // Warn user before page unload when connected
  useEffect(() => {
    if (modalState !== "connected") return undefined;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [modalState]);

  const handleDisconnect = () => {
    disconnect();
    onOpenChange(false);
  };

  const handleRetry = () => {
    setErrorMessage("");
    setModalState("connecting");
    connect();
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
      // Flush any messages that arrived before the terminal was ready
      const queued = messageQueueRef.current;
      messageQueueRef.current = [];
      queued.forEach((msg) => api.handleMessage(msg));
    }
  });

  // Focus terminal when connected
  useEffect(() => {
    if (modalState === "connected") {
      setTimeout(() => terminal.focus(), 100);
    }
  }, [modalState, terminal.focus]);

  if (!account) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className={modalState === "connected" ? "max-w-[90vw]" : "max-w-lg"}
        title="Web Launcher"
        subTitle={`${account.name} (${account.resource.name})`}
      >
        {modalState === "connecting" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Spinner size="lg" />
            <p className="text-mineshaft-300">Establishing connection...</p>
            <p className="text-sm text-mineshaft-400">Connecting to {account.name}</p>
          </div>
        )}

        {modalState === "connected" && (
          <div className="flex flex-col gap-4">
            <div className="h-[70vh] overflow-hidden rounded-md border border-mineshaft-600">
              {terminal.terminalElement}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleDisconnect} variant="outline_bg">
                Disconnect
              </Button>
            </div>
          </div>
        )}

        {modalState === "error" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="rounded-full bg-red-500/20 p-4">
              <FontAwesomeIcon icon={faExclamationTriangle} className="text-2xl text-red-500" />
            </div>
            <p className="text-center text-red-400">{errorMessage || "Connection failed"}</p>
            <div className="flex gap-2">
              <Button onClick={handleRetry} colorSchema="primary">
                Try Again
              </Button>
              <Button onClick={() => onOpenChange(false)} variant="outline_bg">
                Close
              </Button>
            </div>
          </div>
        )}

        {modalState === "disconnected" && (
          <div className="flex flex-col items-center py-8">
            <p className="text-mineshaft-300">Your session has ended.</p>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
};
