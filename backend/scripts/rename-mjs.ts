/* eslint-disable @typescript-eslint/no-shadow */
import fs from "node:fs";
import path from "node:path";

function replaceMjsOccurrences(directory: string) {
  fs.readdir(directory, (err, files) => {
    if (err) throw err;
    files.forEach((file) => {
      const filePath = path.join(directory, file);
      if (fs.statSync(filePath).isDirectory()) {
        replaceMjsOccurrences(filePath);
      } else {
        fs.readFile(filePath, "utf8", (err, data) => {
          if (err) throw err;
          const result = data.replace(/\.mjs/g, ".js");
          fs.writeFile(filePath, result, "utf8", (err) => {
            if (err) throw err;
            // eslint-disable-next-line no-console
            console.log(`Updated: ${filePath}`);
          });
        });
      }
    });
  });
}

replaceMjsOccurrences("dist");
