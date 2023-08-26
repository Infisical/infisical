/* eslint-disable react/no-danger */
import { HTMLAttributes } from "react";
import ContentEditable from "react-contenteditable";
import sanitizeHtml from "sanitize-html";

import { useToggle } from "@app/hooks";

const REGEX = /\${([^}]+)}/g;
const stripSpanTags = (str: string) => str.replace(/<\/?span[^>]*>/g, "");
const replaceContentWithDot = (str: string) => {
  let finalStr = "";
  let isHtml = false;
  for (let i = 0; i < str.length; i += 1) {
    const char = str.at(i);

    if (char === "<" || char === ">") {
      isHtml = char === "<";
      finalStr += char;
    } else if (!isHtml && char !== "\n") {
      finalStr += "&#8226;";
    } else {
      finalStr += char;
    }
  }
  return finalStr;
};

const syntaxHighlight = (orgContent?: string | null, isVisible?: boolean) => {
  if (orgContent === "") return "EMPTY";
  if (!orgContent) return "missing";
  if (!isVisible) return replaceContentWithDot(orgContent);
  const content = stripSpanTags(orgContent);
  const newContent = content.replace(
    REGEX,
    (_a, b) =>
      `<span class="ph-no-capture text-yellow">&#36;&#123;<span class="ph-no-capture text-yello-200/80">${b}</span>&#125;</span>`
  );

  return newContent;
};

const sanitizeConf = {
  allowedTags: ["div", "span", "br", "p"]
};

type Props = Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "onBlur"> & {
  value?: string | null;
  isVisible?: boolean;
  isDisabled?: boolean;
  onChange?: (val: string, html: string) => void;
  onBlur?: (sanitizedHtml: string) => void;
};

export const SecretInput = ({
  value,
  isVisible,
  onChange,
  onBlur,
  isDisabled,
  ...props
}: Props) => {
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
        className={`absolute top-0 left-0 z-0 h-full w-full text-ellipsis whitespace-pre-line break-all ${
          !value && value !== "" && "italic text-red-600/70"
        }`}
      />
      <ContentEditable
        className="relative z-10 h-full w-full text-ellipsis whitespace-pre-line  break-all text-transparent caret-white outline-none"
        role="textbox"
        onChange={(evt) => {
          if (onChange) onChange(evt.currentTarget.innerText.trim(), evt.currentTarget.innerHTML);
        }}
        onFocus={() => setIsSecretFocused.on()}
        disabled={isDisabled}
        spellCheck={false}
        onBlur={(evt) => {
          if (onBlur) onBlur(sanitizeHtml(evt.currentTarget.innerHTML || "", sanitizeConf));
          setIsSecretFocused.off();
        }}
        html={isVisible || isSecretFocused ? value || "" : syntaxHighlight(value, false)}
        {...props}
      />
    </div>
  );
};
