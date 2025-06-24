import { useEffect, useRef, useState } from "react";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Tooltip } from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";

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
  const wrapperRef = useRef<HTMLDivElement>(null);
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

  const toggleSearch = () => {
    setIsExpanded(!isExpanded);
    if (!isExpanded) {
      const timeout: NodeJS.Timeout = setTimeout(focusInput, 300);
      return () => clearTimeout(timeout);
    }
    return () => {};
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={twMerge(
          "flex items-center overflow-hidden rounded transition-all duration-300 ease-in-out",
          isFocused ? "bg-mineshaft-800 shadow-md" : "bg-mineshaft-700",
          isExpanded ? "w-64" : "h-10 w-10"
        )}
      >
        {isExpanded ? (
          <div
            className="flex h-10 w-10 cursor-pointer items-center justify-center text-mineshaft-300 hover:text-white"
            onClick={toggleSearch}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                toggleSearch();
              }
            }}
          >
            <FontAwesomeIcon icon={faSearch} />
          </div>
        ) : (
          <Tooltip position="bottom" content="Search Paths">
            <div
              className="flex h-10 w-10 cursor-pointer items-center justify-center text-mineshaft-300 hover:text-white"
              onClick={toggleSearch}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  toggleSearch();
                }
              }}
            >
              <FontAwesomeIcon icon={faSearch} />
            </div>
          </Tooltip>
        )}

        <div
          ref={inputRef}
          className={twMerge(
            "flex-1 transition-opacity duration-300",
            isExpanded ? "opacity-100" : "hidden"
          )}
          onFocus={handleFocus}
          onBlur={handleBlur}
          role="search"
        >
          <div className="custom-input-wrapper">
            <SecretPathInput
              placeholder={placeholder}
              environment={environment}
              value={value}
              onChange={onChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
