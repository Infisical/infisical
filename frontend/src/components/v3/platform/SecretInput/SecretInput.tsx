/* eslint-disable react/no-danger */
import { forwardRef, TextareaHTMLAttributes, useEffect, useState } from "react";

import { HIDDEN_SECRET_VALUE } from "@app/const/secrets";
import { useToggle } from "@app/hooks";

import { cn } from "../../utils";

const REGEX = /(\${([@a-zA-Z0-9-_. ]+)})/g;

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
    return <span className="ph-no-capture text-danger/75">Error loading secret value.</span>;
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
      const innerContent = el.slice(2, -1);
      const parts = innerContent.split(".");
      const isCrossProjectRef = parts[0]?.startsWith("@");

      return (
        <span className="ph-no-capture relative z-10 text-secret" key={`secret-value-${i + 1}`}>
          &#36;&#123;
          {parts.map((segment, segmentIndex) => {
            const segmentKey = `${part}-segment-${segmentIndex}`;
            const isHovered = hoveredPart === segmentKey;
            const isInteractive = isCmdOrCtrlPressed && !isCrossProjectRef;
            const shouldShowHoverStyle = isHovered && isInteractive;

            return (
              <span key={segmentKey}>
                <span
                  role="button"
                  tabIndex={isInteractive ? 0 : -1}
                  className={cn(
                    "ph-no-capture text-secret/80",
                    isInteractive ? "pointer-events-auto" : "pointer-events-none",
                    shouldShowHoverStyle && "cursor-pointer underline decoration-secret"
                  )}
                  onMouseEnter={() => onHoverPart?.(segmentKey)}
                  onMouseLeave={() => onHoverPart?.("")}
                  onMouseDown={(e) => {
                    if (isInteractive) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isInteractive) {
                      e.preventDefault();
                      onClickSegment?.(segment, parts);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (isInteractive && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      e.stopPropagation();
                      onClickSegment?.(segment, parts);
                    }
                  }}
                >
                  {segment}
                </span>
                {segmentIndex < parts.length - 1 && (
                  <span className="ph-no-capture pointer-events-none text-secret/80">.</span>
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

export type SecretInputVariant = "default" | "plain";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value?: string | null;
  variant?: SecretInputVariant;
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

const commonClassName = "w-full border-none text-sm leading-5 break-all caret-white outline-hidden";

export const SecretInput = forwardRef<HTMLTextAreaElement, Props>(
  (
    {
      value,
      variant = "default",
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

    const shouldRevealValue = isVisible || (isSecretFocused && !valueAlwaysHidden);
    const shouldBindRealValue = isVisible || isSecretFocused;
    const shouldShowMask =
      !isErrorLoadingValue && (isLoadingValue || (Boolean(value) && !shouldRevealValue));

    return (
      <div
        data-slot="secret-input"
        data-variant={variant}
        className={cn(
          "no-scrollbar w-full overflow-auto bg-transparent text-foreground",
          variant === "default" &&
            "flex min-h-9 items-center rounded-md border border-border shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          containerClassName
        )}
        style={{ maxHeight: `${21 * 7}px` }}
      >
        <div
          className={cn("relative w-full overflow-hidden", variant === "default" && "px-2.5 py-1")}
        >
          <div
            aria-hidden
            className={cn(
              "pointer-events-none whitespace-break-spaces",
              commonClassName,
              !value && "text-muted",
              shouldShowMask && "tracking-normal"
            )}
          >
            {syntaxHighlight(
              value,
              shouldRevealValue,
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
          </div>
          <textarea
            placeholder={placeholder}
            style={{ whiteSpace: "break-spaces" }}
            aria-label="secret value"
            ref={ref}
            className={cn(
              "no-scrollbar absolute inset-0 block h-full resize-none overflow-hidden bg-transparent text-transparent focus:border-0",
              variant === "default" && "px-2.5 py-1",
              commonClassName
            )}
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
            value={value && !shouldBindRealValue ? HIDDEN_SECRET_VALUE : (value ?? "")}
            {...props}
            readOnly={isReadOnly || isLoadingValue || isErrorLoadingValue}
          />
        </div>
      </div>
    );
  }
);

SecretInput.displayName = "SecretInput";
