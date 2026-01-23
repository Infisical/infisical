import * as fs from "fs";
import * as path from "path";

const SCHEMAS_DIR = path.join(__dirname, "../src/db/schemas");
const KNEX_FILE = path.join(__dirname, "../src/@types/knex.d.ts");

// Build a map of exported items to their source files
function buildExportMap(): Map<string, string> {
  const exportMap = new Map<string, string>();
  
  const schemaFiles = fs.readdirSync(SCHEMAS_DIR).filter(f => 
    f.endsWith(".ts") && f !== "index.ts" && !f.startsWith("tsconfig")
  );
  
  for (const file of schemaFiles) {
    const filePath = path.join(SCHEMAS_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const moduleName = file.replace(".ts", "");
    
    // Match export statements
    const exportRegex = /export\s+(?:const|type|enum|interface|function|class)\s+(\w+)/g;
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      exportMap.set(match[1], moduleName);
    }
  }
  
  return exportMap;
}

// Group items by their source file
function groupItemsByFile(items: string[], exportMap: Map<string, string>): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  
  for (const item of items) {
    const sourceFile = exportMap.get(item);
    if (sourceFile) {
      if (!grouped.has(sourceFile)) {
        grouped.set(sourceFile, []);
      }
      grouped.get(sourceFile)!.push(item);
    } else {
      console.warn(`Warning: Could not find source file for "${item}"`);
    }
  }
  
  return grouped;
}

// Generate new import statements
function generateImports(grouped: Map<string, string[]>): string {
  const imports: string[] = [];
  const sortedFiles = Array.from(grouped.keys()).sort();
  
  for (const file of sortedFiles) {
    const items = grouped.get(file)!.sort();
    
    if (items.length <= 3) {
      imports.push(`import { ${items.join(", ")} } from "@app/db/schemas/${file}";`);
    } else {
      const formattedItems = items.map(i => `  ${i}`).join(",\n");
      imports.push(`import {\n${formattedItems}\n} from "@app/db/schemas/${file}";`);
    }
  }
  
  return imports.join("\n");
}

// Main
async function main() {
  console.log("Building export map...");
  const exportMap = buildExportMap();
  console.log(`Found ${exportMap.size} exports`);
  
  console.log("\nReading knex.d.ts...");
  let content = fs.readFileSync(KNEX_FILE, "utf-8");
  
  // Find the large barrel import
  const importRegex = /import\s*\{([^}]+)\}\s*from\s*["']@app\/db\/schemas["'];/gs;
  const match = importRegex.exec(content);
  
  if (!match) {
    console.log("No barrel import found in knex.d.ts");
    return;
  }
  
  const fullMatch = match[0];
  const itemsStr = match[1];
  
  // Parse items
  const items = itemsStr
    .split(",")
    .map(item => item.trim())
    .filter(item => item && !item.startsWith("//"));
  
  console.log(`Found ${items.length} items in barrel import`);
  
  // Group by source file
  const grouped = groupItemsByFile(items, exportMap);
  console.log(`Grouped into ${grouped.size} files`);
  
  // Generate new imports
  const newImports = generateImports(grouped);
  
  // Replace the barrel import with direct imports
  content = content.replace(fullMatch, newImports);
  
  // Write back
  fs.writeFileSync(KNEX_FILE, content);
  console.log("\nUpdated knex.d.ts successfully!");
}

main().catch(console.error);
