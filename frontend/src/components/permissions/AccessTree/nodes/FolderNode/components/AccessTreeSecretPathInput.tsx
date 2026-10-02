import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";

import {
  IconButton,
  SecretPathInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

type AccessTreeSecretPathInputProps = {
  placeholder: string;
  environment: string;
  value: string;
  onChange: (path: string) => void;
};

export const AccessTreeSecretPathInput = ({
  placeholder,
  environment,
  value,
  onChange
}: AccessTreeSecretPathInputProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    const timeout: NodeJS.Timeout = setTimeout(() => {
      setIsFocused(false);
    }, 200);
    return () => clearTimeout(timeout);
  };

  useEffect(() => {
    if (!isFocused) {
      setIsExpanded(false);
    }
  }, [isFocused]);

  const focusInput = () => {
    const inputElement = inputRef.current?.querySelector("input");
    if (inputElement) {
      inputElement.focus();
    }
  };

  const toggleSearch = () => setIsExpanded((expanded) => !expanded);

  useEffect(() => {
    if (!isExpanded) return undefined;
    const timeout = setTimeout(focusInput, 0);
    return () => clearTimeout(timeout);
  }, [isExpanded]);

  return (
    <div className="relative">
      <div
        className={`flex h-9 items-center overflow-hidden rounded-md transition-[width] duration-200 ease-out motion-reduce:transition-none ${
          isExpanded ? "w-64 border border-border bg-card" : "w-9"
        } ${isFocused ? "ring-2 ring-ring" : ""}`}
      >
        {isExpanded ? (
          <IconButton
            variant="ghost-muted"
            size="sm"
            className="rounded-r-none"
            onClick={toggleSearch}
            aria-label="Close path search"
          >
            <SearchIcon />
          </IconButton>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton variant="outline" onClick={toggleSearch} aria-label="Search paths">
                <SearchIcon />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent side="bottom">Search paths</TooltipContent>
          </Tooltip>
        )}

        <div
          ref={inputRef}
          className={`min-w-0 flex-1 transition-opacity duration-150 motion-reduce:transition-none ${
            isExpanded ? "opacity-100" : "hidden opacity-0"
          }`}
          onFocus={handleFocus}
          onBlur={handleBlur}
          role="search"
        >
          <SecretPathInput
            placeholder={placeholder}
            environment={environment}
            value={value}
            onChange={onChange}
            containerClassName="rounded-l-none border-0 bg-transparent focus-visible:ring-0"
          />
        </div>
      </div>
    </div>
  );
};
