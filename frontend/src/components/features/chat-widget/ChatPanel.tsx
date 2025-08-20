import React, { useEffect, useRef, useState } from "react";
import { faPaperPlane, faRobot, faUser } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCreateChat } from "@app/hooks/api/chat";

interface Message {
  id: string;
  text: string;
  sender: "user" | "assistant";
  timestamp: Date;
  citations?: { title: string; url: string }[];
}

const ChatPanel: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: "Hello! I'm here to help you with any questions you may have about current page. What would you like to know?",
      sender: "assistant",
      timestamp: new Date()
    }
  ]);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const { mutateAsync: createChat, isPending: isLoading } = useCreateChat();

  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when component mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue.trim(),
      sender: "user",
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");

    const response = await createChat({
      message: userMessage.text,
      conversationId: conversationId ?? undefined,
      documentationLink: "https://infisical.com/docs/documentation/platform/project"
    });

    setConversationId(response.conversationId);

    const assistantMessage: Message = {
      id: Date.now().toString(),
      text: response.message,
      sender: "assistant",
      timestamp: new Date(),

      // citations: [
      //   {
      //     title: "Overview - Infisical",
      //     url: "https://infisical.com/docs/integrations/secret-syncs/overview"
      //   },
      //   {
      //     title: "Infisical vs Hashicorp Vault: Feature Comparison",
      //     url: "https://infisical.com/infisical-vs-hashicorp-vault"
      //   }
      // ]
      ...(response.citations?.length ? { citations: response.citations } : {})
    };

    setMessages((prev) => [...prev, assistantMessage]);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === "Enter" && e.shiftKey) {
      // Don't prevent default for Shift+Enter, let it add a new line naturally
      // The textarea will handle the new line automatically
    }
  };

  // Auto-resize textarea based on content
  const adjustTextareaHeight = () => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  };

  // Adjust height when input value changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [inputValue]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex h-full flex-col bg-mineshaft-800">
      {/* Chat Header */}
      <div className="flex items-center justify-between bg-primary px-4 py-3 text-black">
        <div className="flex items-center space-x-2">
          <FontAwesomeIcon icon={faRobot} className="h-4 w-4" />
        </div>
        <div className="text-xs opacity-75">Online</div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 space-y-4 overflow-y-auto bg-mineshaft-700 p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`flex min-w-0 max-w-xs lg:max-w-md ${
                message.sender === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              {/* Avatar */}
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                  message.sender === "user"
                    ? "ml-2 bg-primary text-black"
                    : "mr-2 bg-mineshaft-600 text-gray-300"
                }`}
              >
                <FontAwesomeIcon
                  icon={message.sender === "user" ? faUser : faRobot}
                  className="h-4 w-4"
                />
              </div>

              {/* Message Bubble */}
              <div
                className={`min-w-0 flex-1 rounded-lg px-4 py-2 ${
                  message.sender === "user"
                    ? "rounded-br-md bg-primary text-black"
                    : "rounded-bl-md border border-mineshaft-600 bg-mineshaft-800 text-gray-200"
                }`}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>
                <p
                  className={`mt-1 text-xs ${
                    message.sender === "user" ? "text-black/70" : "text-gray-400"
                  }`}
                >
                  {formatTime(message.timestamp)}
                </p>

                {message.citations?.length && (
                  <div>
                    <p className="mb-1 mt-3 pl-1 text-xs text-gray-400">Citations</p>
                    <div className="flex w-full flex-col space-y-1">
                      {message.citations?.map((citation) => (
                        <a
                          key={citation.url}
                          href={citation.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 rounded-md border border-transparent p-1 text-xs text-gray-400 transition-all hover:border-mineshaft-500 hover:text-primary"
                        >
                          <span className="block truncate">{citation.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Typing Indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex max-w-xs lg:max-w-md">
              <div className="mr-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-mineshaft-600 text-gray-300">
                <FontAwesomeIcon icon={faRobot} className="h-4 w-4" />
              </div>
              <div className="rounded-lg rounded-bl-md border border-mineshaft-600 bg-mineshaft-800 px-4 py-2 text-gray-200">
                <div className="flex space-x-1">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400"></div>
                  <div
                    className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: "0.1s" }}
                  ></div>
                  <div
                    className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-mineshaft-600 bg-mineshaft-800 p-4">
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="w-full resize-none rounded-md border border-mineshaft-600 bg-mineshaft-700 px-4 py-2 text-gray-200 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={isLoading}
              rows={1}
            />
          </div>

          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-black transition-colors hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
            title="Send message"
          >
            <FontAwesomeIcon icon={faPaperPlane} className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 text-center text-xs text-gray-400">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
