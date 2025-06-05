/* eslint-disable func-names */
import handlebars from "handlebars";
import RE2 from "re2";

import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";

export const compileUsernameTemplate = ({
  usernameTemplate,
  randomUsername,
  identity,
  unixTimestamp,
  options
}: {
  usernameTemplate: string;
  randomUsername: string;
  identity?: { name: string };
  unixTimestamp?: number;
  options?: {
    toUpperCase?: boolean;
  };
}): string => {
  // Create isolated handlebars instance
  const hbs = handlebars.create();

  // Pre-process template to replace {{random N}} patterns using RE2
  let processedTemplate = usernameTemplate;

  try {
    const randomPattern = new RE2("\\{\\{random (\\d+)\\}\\}", "g");

    // Use RE2's replace with callback function
    processedTemplate = randomPattern.replace(processedTemplate, (fullMatch: string, lengthStr: string) => {
      const length = parseInt(lengthStr, 10);

      if (length > 0 && length <= 100) {
        return alphaNumericNanoId(length);
      }

      // Return original match if invalid length
      return fullMatch;
    });
  } catch (error) {
    logger.error(error, "RE2 pattern failed, using original template");
  }

  // Register replace helper on local instance
  hbs.registerHelper("replace", function (text: string, searchValue: string, replaceValue: string) {
    // Convert to string if it's not already
    const textStr = String(text || "");
    if (!textStr) {
      return textStr;
    }

    try {
      const re2Pattern = new RE2(searchValue, "g");
      // Replace all occurrences
      return textStr.replace(re2Pattern, replaceValue);
    } catch (error) {
      logger.error(error, "RE2 pattern failed, using original template");
      return textStr;
    }
  });

  // Register truncate helper on local instance
  hbs.registerHelper("truncate", function (text: string, length: number) {
    // Convert to string if it's not already
    const textStr = String(text || "");
    if (!textStr) {
      return textStr;
    }

    if (typeof length !== "number" || length <= 0) return textStr;
    return textStr.substring(0, length);
  });

  // Compile template with context using local instance
  const context = {
    randomUsername,
    unixTimestamp: unixTimestamp || Math.floor(Date.now() / 100),
    identity: {
      name: identity?.name
    }
  };

  const result = hbs.compile(processedTemplate)(context);

  if (options?.toUpperCase) {
    return result.toUpperCase();
  }

  return result;
};
