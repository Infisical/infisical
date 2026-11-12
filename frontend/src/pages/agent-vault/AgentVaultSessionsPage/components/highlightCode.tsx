import { CSSProperties, ReactNode } from "react";
import { typescriptLanguage } from "@codemirror/lang-javascript";
import { pythonLanguage } from "@codemirror/lang-python";
import { yamlLanguage } from "@codemirror/lang-yaml";
import { Language, StreamLanguage } from "@codemirror/language";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { highlightCode, tagHighlighter } from "@lezer/highlight";

import { CODE_HIGHLIGHT_RULES } from "@app/components/v3/generic/CodeEditor/codeHighlightRules";

// The rules carry CSS, not class names, so each rule gets a stand-in class that maps back to its style.
const RULE_STYLES = CODE_HIGHLIGHT_RULES.map(({ tag: _tag, ...style }) => style as CSSProperties);
const highlighter = tagHighlighter(
  CODE_HIGHLIGHT_RULES.map(({ tag }, index) => ({ tag, class: String(index) }))
);

const styleFor = (classes: string): CSSProperties =>
  Object.assign({}, ...classes.split(" ").map((index) => RULE_STYLES[Number(index)]));

const shellLanguage = StreamLanguage.define(shell);
const dockerfileLanguage = StreamLanguage.define(dockerFile);

export enum CodeLanguage {
  TypeScript = "typescript",
  Python = "python",
  Yaml = "yaml",
  Shell = "shell",
  Dockerfile = "dockerfile"
}

const LANGUAGES: Record<CodeLanguage, Language> = {
  [CodeLanguage.TypeScript]: typescriptLanguage,
  [CodeLanguage.Python]: pythonLanguage,
  [CodeLanguage.Yaml]: yamlLanguage,
  [CodeLanguage.Shell]: shellLanguage,
  [CodeLanguage.Dockerfile]: dockerfileLanguage
};

export const codeLanguageForFile = (fileName: string) => {
  if (fileName.split("/").pop()?.startsWith("Dockerfile")) return CodeLanguage.Dockerfile;
  if (fileName.endsWith(".ts")) return CodeLanguage.TypeScript;
  if (fileName.endsWith(".py")) return CodeLanguage.Python;
  if (fileName.endsWith(".yaml") || fileName.endsWith(".yml")) return CodeLanguage.Yaml;
  if (fileName.endsWith(".sh")) return CodeLanguage.Shell;
  return null;
};

export const highlight = (code: string, language: CodeLanguage | null): ReactNode => {
  if (!language) return code;
  const nodes: ReactNode[] = [];
  highlightCode(
    code,
    LANGUAGES[language].parser.parse(code),
    highlighter,
    (text, classes) =>
      nodes.push(
        classes ? (
          <span key={nodes.length} style={styleFor(classes)}>
            {text}
          </span>
        ) : (
          text
        )
      ),
    () => nodes.push("\n")
  );
  return nodes;
};
