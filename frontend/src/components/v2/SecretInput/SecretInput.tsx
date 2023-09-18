/* eslint-disable react/no-danger */
import { forwardRef, HTMLAttributes, useState } from "react";
import sanitizeHtml, { DisallowedTagsModes } from "sanitize-html";

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
  if (!content) return "missing";
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

  return newContent;
};

type Props = Omit<HTMLAttributes<HTMLTextAreaElement>, "onChange" | "onBlur"> & {
  value?: string | null;
  isVisible?: boolean;
  isDisabled?: boolean;
  onChange?: (val: string) => void;
  onBlur?: () => void;
};

const commonClassName =
  "font-mono text-sm caret-white border-none outline-none w-full break-all py-4";

export const SecretInput = forwardRef<HTMLTextAreaElement, Props>(
  ({ value, isVisible, onChange, onBlur, isDisabled, onFocus, ...props }, ref) => {
    const [isSecretFocused, setIsSecretFocused] = useToggle();
    const [text, setText] = useState(() => value || "");

    const update = (code: string) => {
      setText(code);
      if (onChange) {
        onChange(code.trim());
      }
    };

    const onInput = (event: any) => {
      const code = event.target.value || "";
      update(code);
    };

    return (
      <div className="overflow-auto" style={{ maxHeight: `${21 * 7}px` }}>
        <div className="relative overflow-hidden">
          <pre aria-hidden className="m-0 ">
            <code className={`inline-block w-full  ${commonClassName}`}>
              <span
                style={{ whiteSpace: "break-spaces" }}
                dangerouslySetInnerHTML={{
                  __html: syntaxHighlight(text, isVisible || isSecretFocused) ?? ""
                }}
              />
            </code>
          </pre>

          <textarea
            style={{ whiteSpace: "break-spaces" }}
            aria-label="secret value"
            ref={ref}
            className={`absolute inset-0 block h-full resize-none overflow-hidden bg-transparent text-transparent no-scrollbar focus:border-0 ${commonClassName}`}
            value={text}
            onChange={onInput}
            onFocus={() => setIsSecretFocused.on()}
            disabled={isDisabled}
            spellCheck={false}
            onBlur={() => {
              if (onBlur) onBlur();
              setIsSecretFocused.off();
            }}
            {...props}
          />
        </div>
      </div>
    );
  }
);

SecretInput.displayName = "SecretInput";
