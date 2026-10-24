export type CodeToken = {
  text: string;
  kind: "plain" | "comment" | "string" | "keyword" | "number" | "key";
};
const aliases: Record<string, string> = {
  text: "plain",
  txt: "plain",
  plaintext: "plain",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  shell: "shell",
  dotenv: "env",
  env: "env",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  js: "javascript",
  jsx: "javascript",
  javascript: "javascript",
  ts: "typescript",
  tsx: "typescript",
  typescript: "typescript",
  py: "python",
  python: "python",
  tf: "hcl",
  terraform: "hcl",
  hcl: "hcl"
};
export function normalizeCodeLanguage(language: string): string {
  return aliases[language.toLowerCase()] ?? "plain";
}
export function tokenizeCode(text: string, language: string): CodeToken[] {
  const normalized = normalizeCodeLanguage(language);
  if (normalized === "plain") return [{ text, kind: "plain" }];
  const expression =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|\b(?:true|false|null|undefined|None|True|False|const|let|var|function|return|import|from|export|default|async|await|if|else|for|while|class|def|try|except|raise|with|as|in|not|and|or|resource|variable|output|provider|module|locals|data|terraform)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b[A-Za-z_][\w-]*(?=\s*[:=]))/g;
  const result: CodeToken[] = [];
  let end = 0;
  Array.from(text.matchAll(expression)).forEach((match) => {
    const index = match.index ?? 0;
    if (index > end) result.push({ text: text.slice(end, index), kind: "plain" });
    const part = match[0];
    const comment = part.startsWith("#")
      ? ["shell", "env", "yaml", "python", "hcl"].includes(normalized)
      : part.startsWith("//") || part.startsWith("/*")
        ? ["javascript", "typescript", "hcl"].includes(normalized)
        : false;
    const kind = comment
      ? "comment"
      : /^["'`]/.test(part)
        ? "string"
        : /^-?\d/.test(part)
          ? "number"
          : /^[A-Za-z_][\w-]*$/.test(part) &&
              /[:=]/.test(text.slice(index + part.length).trimStart()[0] ?? "")
            ? "key"
            : "keyword";
    result.push({
      text: part,
      kind:
        (part.startsWith("#") || part.startsWith("//") || part.startsWith("/*")) && !comment
          ? "plain"
          : kind
    });
    end = index + part.length;
  });
  if (end < text.length) result.push({ text: text.slice(end), kind: "plain" });
  return result;
}
