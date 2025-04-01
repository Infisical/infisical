import handlebars from "handlebars";

import { BadRequestError } from "../errors";
import { logger } from "../logger";

type SanitizationArg = {
  allowedExpressions?: (arg: string) => boolean;
};

export const validateHandlebarTemplate = (templateName: string, template: string, dto: SanitizationArg) => {
  const parsedAst = handlebars.parse(template);
  parsedAst.body.forEach((el) => {
    if (el.type === "ContentStatement") return;
    if (el.type === "MustacheStatement" && "path" in el) {
      const { path } = el as { type: "MustacheStatement"; path: { type: "PathExpression"; original: string } };
      if (path.type === "PathExpression" && dto?.allowedExpressions?.(path.original)) return;
    }
    logger.error(el, "Template sanitization failed");
    throw new BadRequestError({ message: `Template sanitization failed: ${templateName}` });
  });
};
