/* eslint-disable */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import promptSync from "prompt-sync";

const prompt = promptSync({
  sigint: true
});

console.log(`
Component List
--------------
1. Service component
2. DAL component
3. Router component
`);
const componentType = parseInt(prompt("Select a component: "), 10);

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

export const register${pascalCase}Router = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "GET",
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
