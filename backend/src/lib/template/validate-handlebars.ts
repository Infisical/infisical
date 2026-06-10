import { BadRequestError } from "../errors";
import { logger } from "../logger";
import { createHandlebarsClient } from "./handlebars-client";

type SanitizationArg = {
  allowedExpressions?: (arg: string) => boolean;
};

const isValidExpression = (expression: string, dto: SanitizationArg): boolean => {
  // Allow helper functions (replace, truncate)
  const allowedHelpers = ["replace", "truncate", "random", "uppercase", "lowercase", "substr", "stripPrefix"];
  if (allowedHelpers.includes(expression)) {
    return true;
  }

  // Check regular allowed expressions
  return dto?.allowedExpressions?.(expression) || false;
};

export const validateHandlebarTemplate = (templateName: string, template: string, dto: SanitizationArg) => {
  const parsedAst = createHandlebarsClient().parse(template);
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
  const parsedAst = createHandlebarsClient().parse(template);
  return parsedAst.body.every((el) => {
    if (el.type === "ContentStatement") return true;
    if (el.type === "MustacheStatement" && "path" in el) {
      const { path } = el as { type: "MustacheStatement"; path: { type: "PathExpression"; original: string } };
      if (path.type === "PathExpression" && isValidExpression(path.original, dto)) return true;
    }
    return false;
  });
};
