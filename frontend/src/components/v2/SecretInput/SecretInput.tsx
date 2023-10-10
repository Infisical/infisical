/* eslint-disable react/no-danger */
import { forwardRef, TextareaHTMLAttributes } from "react";
import sanitizeHtml, { DisallowedTagsModes } from "sanitize-html";
import { twMerge } from "tailwind-merge";

import { useToggle } from "@app/hooks";

const REGEX = /\${([^}]+)}/g;
const replaceContentWithDot = (str: string) => {
  let finalStr = "";
  for (let i = 0; i < str.length; i += 1) {
    const char = str.at(i);
    finalStr += char === "\n" ? "\n" : "&#8226;";
  }
  return finalStr;
};

const sanitizeConf = {
  allowedTags: ["span"],
  disallowedTagsMode: "escape" as DisallowedTagsModes
};

const syntaxHighlight = (content?: string | null, isVisible?: boolean) => {
  if (content === "") return "EMPTY";
  if (!content) return "EMPTY";
  if (!isVisible) return replaceContentWithDot(content);

  const sanitizedContent = sanitizeHtml(
    content.replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    sanitizeConf
  );
  const newContent = sanitizedContent.replace(
    REGEX,
    (_a, b) =>
      `<span class="ph-no-capture text-yellow">&#36;&#123;<span class="ph-no-capture text-yello-200/80">${b}</span>&#125;</span>`
  );

  // akhilmhdh: Dont remove this br. I am still clueless how this works but weirdly enough
  // when break is added a line break works properly
  return `${newContent}<br/>`;
};

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value?: string | null;
  isVisible?: boolean;
  isReadOnly?: boolean;
  isDisabled?: boolean;
  containerClassName?: string;
};

const commonClassName = "font-mono text-sm caret-white border-none outline-none w-full break-all";

export const SecretInput = forwardRef<HTMLTextAreaElement, Props>(
  (
    { value, isVisible, containerClassName, onBlur, isDisabled, isReadOnly, onFocus, ...props },
    ref
  ) => {
    const [isSecretFocused, setIsSecretFocused] = useToggle();

    return (
      <div
        className={twMerge("overflow-auto w-full no-scrollbar rounded-md", containerClassName)}
        style={{ maxHeight: `${21 * 7}px` }}
      >
        <div className="relative overflow-hidden">
          <pre aria-hidden className="m-0 ">
            <code className={`inline-block w-full  ${commonClassName}`}>
              <span
                style={{ whiteSpace: "break-spaces" }}
                dangerouslySetInnerHTML={{
                  __html: syntaxHighlight(value, isVisible || isSecretFocused) ?? ""
                }}
              />
            </code>
          </pre>
          <textarea
            style={{ whiteSpace: "break-spaces" }}
            aria-label="secret value"
            ref={ref}
            className={`absolute inset-0 block h-full resize-none overflow-hidden bg-transparent text-transparent no-scrollbar focus:border-0 ${commonClassName}`}
            onFocus={() => setIsSecretFocused.on()}
            disabled={isDisabled}
            spellCheck={false}
            onBlur={(evt) => {
              onBlur?.(evt);
              setIsSecretFocused.off();
            }}
            value={value || ""}
            {...props}
            readOnly={isReadOnly}
          />
        </div>
      </div>
    );
  }
);

SecretInput.displayName = "SecretInput";
