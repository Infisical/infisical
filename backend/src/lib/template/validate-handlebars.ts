import handlebars from "handlebars";

import { BadRequestError } from "../errors";
import { logger } from "../logger";

type SanitizationArg = {
  allowedExpressions?: (arg: string) => boolean;
  allowedHelpers?: string[];
  // When true, accept only escaped expressions ({{ }}) and reject unescaped ones ({{{ }}} / {{& }}).
  // Opt-in so callers that render with noEscape (e.g. dynamic-secret statements) keep current behavior.
  rejectUnescaped?: boolean;
};

const isValidExpression = (expression: string, dto: SanitizationArg): boolean => {
  const allowedHelpers = dto.allowedHelpers ?? ["replace", "truncate", "random", "uppercase", "lowercase"];
  if (allowedHelpers.includes(expression)) {
    return true;
  }

  // Check regular allowed expressions
  return dto?.allowedExpressions?.(expression) || false;
};

export const validateHandlebarTemplate = (templateName: string, template: string, dto: SanitizationArg) => {
  const parsedAst = handlebars.parse(template);
  parsedAst.body.forEach((el) => {
    if (el.type === "ContentStatement") return;
    if (el.type === "MustacheStatement" && "path" in el) {
      const { path, escaped } = el as {
        type: "MustacheStatement";
        escaped?: boolean;
        path: { type: "PathExpression"; original: string };
      };
      // When rejectUnescaped is set, accept only escaped expressions ({{ }}); otherwise escaping is not
      // enforced (preserving existing behavior for callers that render with noEscape).
      const escapedOk = !dto.rejectUnescaped || escaped === true;
      if (escapedOk && path.type === "PathExpression" && isValidExpression(path.original, dto)) return;
    }
    logger.error(el, "Template sanitization failed");
    throw new BadRequestError({ message: `Template sanitization failed: ${templateName}` });
  });
};

export const isValidHandleBarTemplate = (template: string, dto: SanitizationArg) => {
  const parsedAst = handlebars.parse(template);
  return parsedAst.body.every((el) => {
    if (el.type === "ContentStatement") return true;
    if (el.type === "MustacheStatement" && "path" in el) {
      const { path, escaped } = el as {
        type: "MustacheStatement";
        escaped?: boolean;
        path: { type: "PathExpression"; original: string };
      };
      // When rejectUnescaped is set, only escaped expressions ({{ }}) are permitted; otherwise escaping
      // is not enforced (preserving existing behavior for callers that render with noEscape).
      const escapedOk = !dto.rejectUnescaped || escaped === true;
      if (escapedOk && path.type === "PathExpression" && isValidExpression(path.original, dto)) return true;
    }
    return false;
  });
};
