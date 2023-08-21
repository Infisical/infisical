/* eslint-disable react/no-danger */
import { HTMLAttributes } from "react";
import ContentEditable from "react-contenteditable";
import sanitizeHtml from "sanitize-html";

import { useToggle } from "@app/hooks";

const REGEX = /\${([^}]+)}/g;
const stripSpanTags = (str: string) => str.replace(/<\/?span[^>]*>/g, "");

const entitiesToReplace = {
  '<': '&lt;',
  '>': '&gt;',
}

const escapeEntitiesFromString = (htmlString: string) => {
  for (const [key, value] of Object.entries(entitiesToReplace)) {
    htmlString = htmlString.replaceAll(key, value)
  }

  return htmlString;
}

const convertEscapedEntitiesToHTML = (value: string) => {
  for (const [key, val] of Object.entries(entitiesToReplace)) {
    value = value.replaceAll(val, key)
  }

  return value;
}

const replaceContentWithDot = (str: string) => {
  str = convertEscapedEntitiesToHTML(str)
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

  return escapeEntitiesFromString(newContent);
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
  const html = syntaxHighlight(value, isVisible || isSecretFocused)

  return (
    <div
      className="thin-scrollbar relative overflow-y-auto overflow-x-hidden"
      style={{ maxHeight: `${21 * 7}px` }}
    >
      <div
        dangerouslySetInnerHTML={{
          __html: html,
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
        html={html}
        {...props}
      />
    </div>
  );
};
