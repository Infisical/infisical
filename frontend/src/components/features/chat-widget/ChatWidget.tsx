import React, { useEffect, useRef, useState } from "react";
import { faComments, faMaximize, faMinimize, faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";

import ChatPanel from "./ChatPanel";
import DocumentationPanel from "./DocumentationPanel";

interface ChatWidgetProps {
  documentationUrl?: string;
  documentationContent?: string;
  onClose?: () => void;
  isOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
}

const ChatWidget: React.FC<ChatWidgetProps> = ({
  documentationUrl,
  documentationContent,
  onClose,
  isOpen = false,
  onToggle
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    const newState = !isOpen;
    onToggle?.(newState);
  };

  const handleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  const handleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handleClose = () => {
    onClose?.();
    onToggle?.(false);
  };

  // Close widget when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Prevent body scroll when widget is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  return (
    <>
      {/* Floating Chat Button */}
      <motion.button
        onClick={handleToggle}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-black shadow-lg transition-all duration-200 hover:bg-primary-600 focus:outline-none focus:ring-4 focus:ring-primary/30"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <FontAwesomeIcon icon={faComments} className="h-6 w-6" />
      </motion.button>

      {/* Chat Widget Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              ref={widgetRef}
              className={`relative overflow-hidden rounded-md border border-mineshaft-600 bg-mineshaft-800 shadow-2xl ${
                isFullscreen
                  ? "h-screen w-screen"
                  : isMinimized
                    ? "h-96 w-96"
                    : "h-5/6 max-h-[90vh] w-5/6 max-w-7xl"
              }`}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.3, type: "spring", stiffness: 300, damping: 30 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-mineshaft-600 bg-mineshaft-700 px-6 py-4">
                <div className="flex items-center space-x-3">
                  <FontAwesomeIcon icon={faComments} className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-gray-200">Help & Support</h2>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleMinimize}
                    className="rounded-md p-2 text-bunker-400 transition-colors hover:bg-mineshaft-600 hover:text-bunker-200"
                    title={isMinimized ? "Expand" : "Minimize"}
                  >
                    <FontAwesomeIcon
                      icon={isMinimized ? faMaximize : faMinimize}
                      className="h-4 w-4"
                    />
                  </button>
                  <button
                    onClick={handleFullscreen}
                    className="rounded-md p-2 text-bunker-400 transition-colors hover:bg-mineshaft-600 hover:text-bunker-200"
                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                  >
                    <FontAwesomeIcon
                      icon={isFullscreen ? faMinimize : faMaximize}
                      className="h-4 w-4"
                    />
                  </button>
                  <button
                    onClick={handleClose}
                    className="rounded-md p-2 text-bunker-400 transition-colors hover:bg-mineshaft-600 hover:text-bunker-200"
                    title="Close"
                  >
                    <FontAwesomeIcon icon={faTimes} className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex h-full">
                {/* Documentation Panel */}
                <div
                  className={`${isMinimized ? "hidden" : "flex-1"} border-r border-mineshaft-600`}
                >
                  <DocumentationPanel url={documentationUrl} content={documentationContent} />
                </div>

                {/* Chat Panel */}
                <div className={`${isMinimized ? "w-full" : "w-96"} flex flex-col`}>
                  <ChatPanel />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ChatWidget;
