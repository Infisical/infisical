import handlebars from "handlebars";
import RE2 from "re2";

import { BadRequestError } from "../errors";
import { logger } from "../logger";

type SanitizationArg = {
  allowedExpressions?: (arg: string) => boolean;
};

const randomPattern = new RE2("^random-\\d+$");

const isValidExpression = (expression: string, dto: SanitizationArg): boolean => {
  // Check for random-N pattern (e.g., random-16, random-8)
  if (expression.startsWith("random-") && randomPattern.test(expression)) {
    return true;
  }

  // Allow helper functions (replace, truncate)
  const allowedHelpers = ["replace", "truncate"];
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
      const { path } = el as { type: "MustacheStatement"; path: { type: "PathExpression"; original: string } };
      if (path.type === "PathExpression" && isValidExpression(path.original, dto)) return;
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
      const { path } = el as { type: "MustacheStatement"; path: { type: "PathExpression"; original: string } };
      if (path.type === "PathExpression" && isValidExpression(path.original, dto)) return true;
    }
    return false;
  });
};
