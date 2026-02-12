/* eslint-disable react/no-danger */
import { forwardRef, TextareaHTMLAttributes, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

import { useToggle } from "@app/hooks";
import { HIDDEN_SECRET_VALUE } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

const REGEX = /(\${([a-zA-Z0-9-_. ]+)})/g;

const syntaxHighlight = (
  content?: string | null,
  isVisible?: boolean,
  isImport?: boolean,
  isLoadingValue?: boolean,
  isErrorLoadingValue?: boolean,
  onHoverPart?: (part: string) => void,
  hoveredPart?: string,
  isCmdOrCtrlPressed?: boolean,
  onClickSegment?: (segment: string, allSegments: string[]) => void,
  placeholder?: string
) => {
  if (isLoadingValue) return HIDDEN_SECRET_VALUE;
  if (isErrorLoadingValue)
    return <span className="ph-no-capture text-red/75">Error loading secret value.</span>;
  if (isImport && !content) return "EMPTY";
  if (placeholder && (content === "" || !content)) return placeholder;
  if (content === "") return "EMPTY";
  if (!content) return "EMPTY";
  if (!isVisible) return HIDDEN_SECRET_VALUE;

  let skipNext = false;
  const formattedContent = content.split(REGEX).flatMap((el, i) => {
    const isInterpolationSyntax = el.startsWith("${") && el.endsWith("}");
    if (isInterpolationSyntax) {
      skipNext = true;
      const part = el;
      const innerContent = el.slice(2, -1); // Remove ${ and }
      const parts = innerContent.split(".");

      return (
        <span className="ph-no-capture relative z-10 text-yellow" key={`secret-value-${i + 1}`}>
          &#36;&#123;
          {parts.map((segment, segmentIndex) => {
            const segmentKey = `${part}-segment-${segmentIndex}`;
            const isHovered = hoveredPart === segmentKey;
            const shouldShowHoverStyle = isHovered && isCmdOrCtrlPressed;

            return (
              <span key={segmentKey}>
                <span
                  role="button"
                  tabIndex={isCmdOrCtrlPressed ? 0 : -1}
                  className={`ph-no-capture text-yellow-200/80 ${
                    isCmdOrCtrlPressed ? "pointer-events-auto" : "pointer-events-none"
                  } ${shouldShowHoverStyle ? "cursor-pointer underline decoration-yellow-400" : ""}`}
                  onMouseEnter={() => onHoverPart?.(segmentKey)}
                  onMouseLeave={() => onHoverPart?.("")}
                  onMouseDown={(e) => {
                    if (isCmdOrCtrlPressed) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isCmdOrCtrlPressed) {
                      e.preventDefault();
                      onClickSegment?.(segment, parts);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (isCmdOrCtrlPressed && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      e.stopPropagation();
                      onClickSegment?.(segment, parts);
                    }
                  }}
                >
                  {segment}
                </span>
                {segmentIndex < parts.length - 1 && (
                  <span className="ph-no-capture pointer-events-none text-yellow-200/80">.</span>
                )}
              </span>
            );
          })}
          &#125;
        </span>
      );
    }
    if (skipNext) {
      skipNext = false;
      return [];
    }
    return el;
  });

  // akhilmhdh: Dont remove this br. I am still clueless how this works but weirdly enough
  // when break is added a line break works properly
  return formattedContent.concat(
    <br key={`secret-value-linebreak-${formattedContent.length + 1}`} />
  );
};

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value?: string | null;
  isVisible?: boolean;
  valueAlwaysHidden?: boolean;
  isImport?: boolean;
  isReadOnly?: boolean;
  isDisabled?: boolean;
  containerClassName?: string;
  canEditButNotView?: boolean;
  isLoadingValue?: boolean;
  isErrorLoadingValue?: boolean;
  onClickSegment?: (segment: string, allSegments: string[]) => void;
};

const commonClassName = "font-mono text-sm caret-white border-none outline-hidden w-full break-all";

export const SecretInput = forwardRef<HTMLTextAreaElement, Props>(
  (
    {
      value,
      isVisible,
      isImport,
      valueAlwaysHidden,
      containerClassName,
      onBlur,
      isDisabled,
      isReadOnly,
      onFocus,
      canEditButNotView,
      isLoadingValue,
      isErrorLoadingValue,
      onClickSegment,
      placeholder,
      ...props
    },
    ref
  ) => {
    const [isSecretFocused, setIsSecretFocused] = useToggle();
    const [hoveredPart, setHoveredPart] = useState<string | undefined>();
    const [isCmdOrCtrlPressed, setIsCmdOrCtrlPressed] = useState(false);

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.metaKey || e.ctrlKey) {
          setIsCmdOrCtrlPressed(true);
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        if (!e.metaKey && !e.ctrlKey) {
          setIsCmdOrCtrlPressed(false);
        }
      };

      const handleBlur = () => {
        setIsCmdOrCtrlPressed(false);
      };

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      window.addEventListener("blur", handleBlur);

      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
        window.removeEventListener("blur", handleBlur);
      };
    }, []);

    return (
      <div
        className={twMerge("no-scrollbar w-full overflow-auto rounded-md", containerClassName)}
        style={{ maxHeight: `${21 * 7}px` }}
      >
        <div className="relative overflow-hidden">
          <pre aria-hidden className="pointer-events-none relative z-10 m-0">
            <code className={`inline-block w-full ${commonClassName}`}>
              <span className={twMerge("whitespace-break-spaces", !value && "text-muted")}>
                {syntaxHighlight(
                  value,
                  isVisible || (isSecretFocused && !valueAlwaysHidden),
                  isImport,
                  isLoadingValue,
                  isErrorLoadingValue,
                  (part) => {
                    setHoveredPart(part);
                  },
                  hoveredPart,
                  isCmdOrCtrlPressed,
                  onClickSegment,
                  placeholder
                )}
              </span>
            </code>
          </pre>
          <textarea
            placeholder={placeholder}
            style={{ whiteSpace: "break-spaces" }}
            aria-label="secret value"
            ref={ref}
            className={`no-scrollbar absolute inset-0 block h-full resize-none overflow-hidden bg-transparent text-transparent focus:border-0 ${commonClassName}`}
            onFocus={(evt) => {
              onFocus?.(evt);
              setIsSecretFocused.on();
              if (canEditButNotView && value === HIDDEN_SECRET_VALUE) {
                evt.currentTarget.select();
              }
            }}
            onMouseDown={(e) => {
              if (canEditButNotView && value === HIDDEN_SECRET_VALUE) {
                e.preventDefault();
                e.currentTarget.select();
              }
            }}
            disabled={isDisabled}
            spellCheck={false}
            onBlur={(evt) => {
              onBlur?.(evt);
              setIsSecretFocused.off();
            }}
            onMouseLeave={() => {
              setHoveredPart(undefined);
            }}
            value={value || ""}
            {...props}
            readOnly={isReadOnly || isLoadingValue || isErrorLoadingValue}
          />
        </div>
      </div>
    );
  }
);

SecretInput.displayName = "SecretInput";
