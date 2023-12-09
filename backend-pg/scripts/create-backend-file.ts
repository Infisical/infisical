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
  const dalTypeName = `T${pascalCase}DalFactory`;
  const dalName = `${camelCase}DalFactory`;
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
  ${camelCase}Dal: ${dalTypeName};
};

export type ${serviceTypeName} = ReturnType<typeof ${serviceName}>;

export const ${serviceName} = ({ ${camelCase}Dal }: ${serviceTypeName}Dep) => {
  return {};
};
`
  );
  writeFileSync(path.join(dir, `${componentName}-types.ts`), "");
}
