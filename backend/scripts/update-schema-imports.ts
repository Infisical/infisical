import * as fs from "fs";
import * as path from "path";

const SCHEMAS_DIR = path.join(__dirname, "../src/db/schemas");
const SRC_DIR = path.join(__dirname, "../src");

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
    
    // Also match "export type { X }" patterns
    const reExportRegex = /export\s+type\s*\{\s*([^}]+)\s*\}/g;
    while ((match = reExportRegex.exec(content)) !== null) {
      const types = match[1].split(",").map(t => t.trim());
      for (const type of types) {
        if (type) {
          exportMap.set(type, moduleName);
        }
      }
    }
  }
  
  return exportMap;
}

// Find all TypeScript files that import from @app/db/schemas
function findFilesWithSchemaImports(dir: string): string[] {
  const files: string[] = [];
  
  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist") {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        const content = fs.readFileSync(fullPath, "utf-8");
        if (content.includes('from "@app/db/schemas"') || content.includes("from '@app/db/schemas'")) {
          files.push(fullPath);
        }
      }
    }
  }
  
  walk(dir);
  return files;
}

// Parse import statement and extract imported items
function parseImport(importStatement: string): { items: string[], isTypeOnly: boolean } {
  const isTypeOnly = importStatement.includes("import type");
  const match = importStatement.match(/\{([^}]+)\}/);
  if (!match) return { items: [], isTypeOnly };
  
  const items = match[1]
    .split(",")
    .map(item => {
      // Handle "X as Y" aliases
      const parts = item.trim().split(/\s+as\s+/);
      return { original: parts[0].replace(/^type\s+/, "").trim(), alias: parts[1]?.trim() };
    })
    .filter(item => item.original);
  
  return { 
    items: items.map(i => i.alias ? `${i.original} as ${i.alias}` : i.original),
    isTypeOnly 
  };
}

// Group items by their source file
function groupItemsByFile(items: string[], exportMap: Map<string, string>): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  
  for (const item of items) {
    const originalName = item.split(/\s+as\s+/)[0].trim();
    const sourceFile = exportMap.get(originalName);
    if (sourceFile) {
      if (!grouped.has(sourceFile)) {
        grouped.set(sourceFile, []);
      }
      grouped.get(sourceFile)!.push(item);
    } else {
      console.warn(`Warning: Could not find source file for "${originalName}"`);
      // Default to models for unknown items
      if (!grouped.has("models")) {
        grouped.set("models", []);
      }
      grouped.get("models")!.push(item);
    }
  }
  
  return grouped;
}

// Generate new import statements
function generateImports(grouped: Map<string, string[]>, isTypeOnly: boolean): string {
  const imports: string[] = [];
  const sortedFiles = Array.from(grouped.keys()).sort();
  
  for (const file of sortedFiles) {
    const items = grouped.get(file)!.sort();
    const importKeyword = isTypeOnly ? "import type" : "import";
    
    if (items.length <= 3) {
      imports.push(`${importKeyword} { ${items.join(", ")} } from "@app/db/schemas/${file}";`);
    } else {
      const formattedItems = items.map(i => `  ${i}`).join(",\n");
      imports.push(`${importKeyword} {\n${formattedItems}\n} from "@app/db/schemas/${file}";`);
    }
  }
  
  return imports.join("\n");
}

// Process a single file
function processFile(filePath: string, exportMap: Map<string, string>): boolean {
  let content = fs.readFileSync(filePath, "utf-8");
  let modified = false;
  
  // Match import statements from @app/db/schemas
  const importRegex = /(import\s+(?:type\s+)?)\{([^}]+)\}\s+from\s+["']@app\/db\/schemas["'];?/g;
  
  const replacements: { original: string, replacement: string }[] = [];
  
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const fullMatch = match[0];
    const importPrefix = match[1];
    const itemsStr = match[2];
    const isTypeOnly = importPrefix.includes("type");
    
    // Parse items
    const items = itemsStr
      .split(",")
      .map(item => item.trim())
      .filter(item => item);
    
    // Group by source file
    const grouped = groupItemsByFile(items, exportMap);
    
    // Generate new imports
    const newImports = generateImports(grouped, isTypeOnly);
    
    if (newImports !== fullMatch) {
      replacements.push({ original: fullMatch, replacement: newImports });
      modified = true;
    }
  }
  
  // Apply replacements
  for (const { original, replacement } of replacements) {
    content = content.replace(original, replacement);
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated: ${filePath}`);
  }
  
  return modified;
}

// Main
async function main() {
  console.log("Building export map...");
  const exportMap = buildExportMap();
  console.log(`Found ${exportMap.size} exports`);
  
  // Debug: print some exports
  console.log("\nSample exports:");
  let count = 0;
  for (const [name, file] of exportMap) {
    if (count++ < 10) {
      console.log(`  ${name} -> ${file}`);
    }
  }
  
  console.log("\nFinding files with schema imports...");
  const files = findFilesWithSchemaImports(SRC_DIR);
  console.log(`Found ${files.length} files to process`);
  
  console.log("\nProcessing files...");
  let updatedCount = 0;
  for (const file of files) {
    if (processFile(file, exportMap)) {
      updatedCount++;
    }
  }
  
  console.log(`\nDone! Updated ${updatedCount} files.`);
}

main().catch(console.error);
