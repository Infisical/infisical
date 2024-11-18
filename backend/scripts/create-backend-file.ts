/* eslint-disable */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import promptSync from "prompt-sync";

const prompt = promptSync({
  sigint: true
});

type ComponentType = 1 | 2 | 3;

console.log(`
Component List
--------------
0. Exit
1. Service component
2. DAL component
3. Router component
`);

function getComponentType(): ComponentType {
  while (true) {
    const input = prompt("Select a component (0-3): ");
    const componentType = parseInt(input, 10);

    if (componentType === 0) {
      console.log("Exiting the program. Goodbye!");
      process.exit(0);
    } else if (componentType === 1 || componentType === 2 || componentType === 3) {
      return componentType;
    } else {
      console.log("Invalid input. Please enter 0, 1, 2, or 3.");
    }
  }
}
const componentType = getComponentType();

if (componentType === 1) {
  const componentName = prompt("Enter service name: ");
  const dir = path.join(__dirname, `../src/services/${componentName}`);
  const pascalCase = componentName
    .split("-")
    .map((el) => `${el[0].toUpperCase()}${el.slice(1)}`)
    .join("");
  const camelCase = componentName
    .split("-")
    .map((el, index) => (index === 0 ? el : `${el[0].toUpperCase()}${el.slice(1)}`))
    .join("");
  const dalTypeName = `T${pascalCase}DALFactory`;
  const dalName = `${camelCase}DALFactory`;
  const serviceTypeName = `T${pascalCase}ServiceFactory`;
  const serviceName = `${camelCase}ServiceFactory`;

  mkdirSync(dir);

  writeFileSync(
    path.join(dir, `${componentName}-dal.ts`),
    `import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";

export type ${dalTypeName} = ReturnType<typeof ${dalName}>;

export const ${dalName} = (db: TDbClient) => {

  return {  };
};
`
  );

  writeFileSync(
    path.join(dir, `${componentName}-service.ts`),
    `import { ${dalTypeName} } from "./${componentName}-dal";

type ${serviceTypeName}Dep = {
  ${camelCase}DAL: ${dalTypeName};
};

export type ${serviceTypeName} = ReturnType<typeof ${serviceName}>;

export const ${serviceName} = ({ ${camelCase}DAL }: ${serviceTypeName}Dep) => {
  return {};
};
`
  );
  writeFileSync(path.join(dir, `${componentName}-types.ts`), "");
} else if (componentType === 2) {
  const componentName = prompt("Enter service name: ");
  const componentPath = prompt("Path wrt service folder: ");
  const pascalCase = componentName
    .split("-")
    .map((el) => `${el[0].toUpperCase()}${el.slice(1)}`)
    .join("");
  const camelCase = componentName
    .split("-")
    .map((el, index) => (index === 0 ? el : `${el[0].toUpperCase()}${el.slice(1)}`))
    .join("");
  const dalTypeName = `T${pascalCase}DALFactory`;
  const dalName = `${camelCase}DALFactory`;

  writeFileSync(
    path.join(__dirname, "../src/services", componentPath, `${componentName}-dal.ts`),
    `import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";

export type ${dalTypeName} = ReturnType<typeof ${dalName}>;

export const ${dalName} = (db: TDbClient) => {

  return {  };
};
`
  );
} else if (componentType === 3) {
  const name = prompt("Enter router name: ");
  const version = prompt("Version number: ");
  const pascalCase = name
    .split("-")
    .map((el) => `${el[0].toUpperCase()}${el.slice(1)}`)
    .join("");
  writeFileSync(
    path.join(__dirname, `../src/server/routes/v${Number(version)}/${name}-router.ts`),
    `import { z } from "zod";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { readLimit } from "@app/server/config/rateLimiter";

export const register${pascalCase}Router = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({}),
      response: {
        200: z.object({})
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {}
  });
};
`
  );
}
