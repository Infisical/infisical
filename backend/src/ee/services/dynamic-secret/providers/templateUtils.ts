/* eslint-disable func-names */
import handlebars from "handlebars";
import RE2 from "re2";

import { alphaNumericNanoId } from "@app/lib/nanoid";

export const compileUsernameTemplate = ({
  usernameTemplate,
  randomUsername,
  identityName,
  unixTimestamp,
  options
}: {
  usernameTemplate: string;
  randomUsername: string;
  identityName?: string;
  unixTimestamp?: number;
  options?: {
    toUpperCase?: boolean;
  };
}): string => {
  // Pre-process template to replace {{random-N}} patterns before compiling
  let processedTemplate = usernameTemplate;
  const randomPattern = /\{\{random-(\d+)\}\}/g;
  let match;

  // eslint-disable-next-line no-cond-assign
  while ((match = randomPattern.exec(usernameTemplate)) !== null) {
    const fullMatch = match[0];
    const length = parseInt(match[1], 10);

    if (length > 0 && length <= 100) {
      const randomValue = alphaNumericNanoId(length);
      processedTemplate = processedTemplate.replace(fullMatch, randomValue);
    }
  }

  // Register replace helper
  handlebars.registerHelper(
    "replace",
    function (text: string, searchValue: string, replaceValue: string, limit?: number) {
      // Convert to string if it's not already
      const textStr = String(text || "");
      if (!textStr) {
        return textStr;
      }

      try {
        const re2Pattern = new RE2(searchValue, "g");

        if (limit && limit > 0) {
          // Replace only up to the specified limit
          let count = 0;
          return textStr.replace(re2Pattern, (textMatch) => {
            if (count < limit) {
              count += 1;
              return replaceValue;
            }
            return textMatch;
          });
        }
        // Replace all occurrences
        return textStr.replace(re2Pattern, replaceValue);
      } catch (error) {
        return textStr;
      }
    }
  );

  // Register truncate helper
  handlebars.registerHelper("truncate", function (text: string, length: number) {
    // Convert to string if it's not already
    const textStr = String(text || "");
    if (!textStr) {
      return textStr;
    }

    if (typeof length !== "number" || length <= 0) return textStr;
    return textStr.substring(0, length);
  });

  // Compile template with context
  const context = {
    randomUsername,
    unixTimestamp: unixTimestamp || Math.floor(Date.now() / 100),
    identity: {
      name: identityName
    }
  };

  const result = handlebars.compile(processedTemplate)(context);

  if (options?.toUpperCase) {
    return result.toUpperCase();
  }

  return result;
};
