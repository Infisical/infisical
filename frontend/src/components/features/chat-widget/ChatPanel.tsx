import React, { useEffect, useRef, useState } from "react";
import { faMicrophone, faPaperPlane, faRobot, faUser } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface Message {
  id: string;
  text: string;
  sender: "user" | "assistant";
  timestamp: Date;
}

const ChatPanel: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: "Hello! I'm here to help you with any questions about the documentation. What would you like to know?",
      sender: "assistant",
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    setIsTyping(true);

    // Simulate assistant response (replace with actual chat API call)
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: "This is a placeholder response. In the future, this will connect to your actual chat backend to provide contextual help based on the documentation content.",
        sender: "assistant",
        timestamp: new Date()
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Chat Header */}
      <div className="flex items-center justify-between bg-primary-600 px-4 py-3 text-white">
        <div className="flex items-center space-x-2">
          <FontAwesomeIcon icon={faRobot} className="h-4 w-4" />
        </div>
        <div className="text-xs opacity-75">Online</div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`flex max-w-xs lg:max-w-md ${
                message.sender === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              {/* Avatar */}
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                  message.sender === "user"
                    ? "ml-2 bg-primary-600 text-white"
                    : "mr-2 bg-gray-300 text-gray-700"
                }`}
              >
                <FontAwesomeIcon
                  icon={message.sender === "user" ? faUser : faRobot}
                  className="h-4 w-4"
                />
              </div>

              {/* Message Bubble */}
              <div
                className={`rounded-lg px-4 py-2 ${
                  message.sender === "user"
                    ? "rounded-br-md bg-primary-600 text-white"
                    : "rounded-bl-md border border-gray-200 bg-white text-gray-800"
                }`}
              >
                <p className="text-sm leading-relaxed">{message.text}</p>
                <p
                  className={`mt-1 text-xs ${
                    message.sender === "user" ? "text-primary-100" : "text-gray-500"
                  }`}
                >
                  {formatTime(message.timestamp)}
                </p>
              </div>
            </div>
          </div>
        ))}

        {/* Typing Indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="flex max-w-xs lg:max-w-md">
              <div className="mr-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-300 text-gray-700">
                <FontAwesomeIcon icon={faRobot} className="h-4 w-4" />
              </div>
              <div className="rounded-lg rounded-bl-md border border-gray-200 bg-white px-4 py-2 text-gray-800">
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
      <div className="border-t border-gray-200 bg-white p-4">
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="w-full resize-none rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={isTyping}
            />
          </div>

          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isTyping}
            className="rounded-lg bg-primary-600 p-2 text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
            title="Send message"
          >
            <FontAwesomeIcon icon={faPaperPlane} className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 text-center text-xs text-gray-500">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
