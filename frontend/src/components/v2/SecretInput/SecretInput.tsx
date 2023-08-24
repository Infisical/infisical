/* eslint-disable react/no-danger */
import { forwardRef, HTMLAttributes } from "react";
import ContentEditable from "react-contenteditable";
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

type Props = Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "onBlur"> & {
  value?: string | null;
  isVisible?: boolean;
  isDisabled?: boolean;
  onChange?: (val: string) => void;
  onBlur?: () => void;
};

export const SecretInput = forwardRef<HTMLDivElement, Props>(
  ({ value, isVisible, onChange, onBlur, isDisabled, ...props }, ref) => {
    const [isSecretFocused, setIsSecretFocused] = useToggle();

    return (
      <div
        className="thin-scrollbar relative overflow-y-auto overflow-x-hidden"
        style={{ maxHeight: `${21 * 7}px` }}
      >
        <div
          dangerouslySetInnerHTML={{
            __html: syntaxHighlight(value, isVisible || isSecretFocused)
          }}
          className={`absolute top-0 left-0 z-0 h-full w-full inline-block text-ellipsis whitespace-pre-wrap break-all ${
            !value && value !== "" && "italic text-red-600/70"
          }`}
          ref={ref}
        />
        <ContentEditable
          className="relative z-10 h-full w-full text-ellipsis inline-block whitespace-pre-wrap  break-all text-transparent caret-white outline-none"
          role="textbox"
          onChange={(evt) => {
            if (onChange) onChange(evt.currentTarget.innerText.trim());
          }}
          onFocus={() => setIsSecretFocused.on()}
          disabled={isDisabled}
          spellCheck={false}
          onBlur={() => {
            if (onBlur) onBlur();
            setIsSecretFocused.off();
          }}
          html={
            isVisible || isSecretFocused
              ? sanitizeHtml(
                  value?.replaceAll("<", "&lt;").replaceAll(">", "&gt;") || "",
                  sanitizeConf
                )
              : syntaxHighlight(value, false)
          }
          {...props}
        />
      </div>
    );
  }
);

SecretInput.displayName = "SecretInput";
