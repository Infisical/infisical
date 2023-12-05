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
  const capitalizedComponentName = componentName.at(0)?.toUpperCase() + componentName.slice(1);
  const dalTypeName = `T${capitalizedComponentName}DalFactory`;
  const dalName = `${componentName}DalFactory`;
  const serviceTypeName = `T${capitalizedComponentName}ServiceFactory`;
  const serviceName = `${componentName}ServiceFactory`;

  mkdirSync(dir);

  writeFileSync(
    path.join(dir, `${componentName}-dal.ts`),
    `import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";

export type ${dalTypeName} = {};

export const ${dalName} = (db: TDbClient): ${dalTypeName} => {

  return {  };
};
`
  );

  writeFileSync(
    path.join(dir, `${componentName}-service.ts`),
    `import { ${dalTypeName} } from "./${componentName}-dal";

type ${serviceTypeName}Dep = {
  ${componentName}Dal: ${dalTypeName};
};

export type ${serviceTypeName} = ReturnType<typeof ${serviceName}>;

export const ${serviceName} = ({ ${componentName}Dal }: ${serviceTypeName}Dep) => {
  return {};
};
`
  );
  writeFileSync(path.join(dir, `${componentName}-types.ts`), "");
}
