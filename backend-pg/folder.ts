import dotenv from "dotenv";

import { initDbConnection } from "./src/db";
import { TableName } from "./src/db/schemas";
import { selectAllTableCols } from "./src/lib/knex";
import picomatch from "picomatch";

dotenv.config();
// const db = initDbConnection(process.env.DB_CONNECTION_URI);

// const main = async () => {
//   const folders = db
//     .withRecursive("parent", (qb) => {
//       qb.select({
//         depth: 1,
//         path: db.raw("'/'")
//       })
//         .select(selectAllTableCols(db, TableName.SecretFolder))
//         .from(TableName.SecretFolder)
//         .join(
//           TableName.Environment,
//           `${TableName.SecretFolder}.envId`,
//           `${TableName.Environment}.id`
//         )
//         .where({
//           projectId: "01c10de1-8743-490f-9c8a-7a19c4dc72a9",
//           parentId: null
//         })
//         .where(`${TableName.Environment}.slug`, "dev")
//         .union((qb) =>
//           qb
//             .select({
//               depth: db.raw("parent.depth + 1"),
//               path: db.raw(
//                 "CONCAT((CASE WHEN parent.path = '/' THEN '' ELSE parent.path END),'/', secret_folders.name)"
//               )
//             })
//             .select(selectAllTableCols(db, TableName.SecretFolder))
//             .whereRaw(
//               `depth = array_position(ARRAY[${[1, 2]
//                 .map((_) => "?")
//                 .join(",")}]::varchar[], secret_folders.name,depth)`,
//               [...["ui", "design"]]
//             )
//             .from(TableName.SecretFolder)
//             .join("parent", "parent.id", `${TableName.SecretFolder}.parentId`)
//         );
//     })
//     .select("*")
//     .from("parent")
//     .orderBy("depth", "desc")
//     .first();
//   console.log(folders.toSQL());
//   console.log(JSON.stringify(await folders, null, 4));
//   process.exit(0);
// };
//
const main = async () => {
  const isMatch = picomatch("/ui/**/seomthing", { strictSlashes: false });
  console.log(
    picomatch.isMatch(
      "/ui/(base|new)/seomthing",
      ["/ui/base/seomthing", "/ui/(base|new)/seomthing"],
      {
        strictSlashes: false
      }
    )
  );
  // console.log(isMatch("/ui/(base|new)/seomthing"));
  // const folders = db(TableName.SecretVersion)
  //   .whereIn(`${TableName.SecretVersion}.secretId`, ["8fe1c5e2-af6a-40ed-874b-6738816236bc"])
  //   .join(
  //     db(TableName.SecretVersion)
  //       .groupBy("secretId")
  //       .max("version")
  //       .select("secretId")
  //       .as("latestVersion"),
  //     (bd) => {
  //       bd.on(`${TableName.SecretVersion}.secretId`, "latestVersion.secretId").andOn(
  //         `${TableName.SecretVersion}.version`,
  //         "latestVersion.max"
  //       );
  //     }
  //   );
  // console.log(folders.toSQL());
  // console.log(JSON.stringify(await folders, null, 4));
  // process.exit(0);
};
main();
