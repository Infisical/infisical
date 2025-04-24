/* eslint-disable no-underscore-dangle,@typescript-eslint/class-methods-use-this */
import { useCallback, useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalTextEntity } from "@lexical/react/useLexicalTextEntity";
import {
  $applyNodeReplacement,
  EditorConfig,
  LexicalNode,
  SerializedTextNode,
  Spread,
  TextNode
} from "lexical";

type HighlightTheme = { contentClassName: string };
type Trigger = { startTrigger: string; endTrigger: string };

export type SerializedHighlightNode = Spread<
  {
    __highlightTheme: HighlightTheme;
    __trigger: Trigger;
  },
  SerializedTextNode
>;

export class HighlightNode extends TextNode {
  __highlightTheme: HighlightTheme;
  __trigger: Trigger;

  constructor(
    text: string,
    highlightTheme: HighlightTheme = {
      contentClassName: "ph-no-capture text-yellow-200/80"
    },
    trigger: Trigger = { startTrigger: "${", endTrigger: "}" },
    key?: string
  ) {
    super(text, key);
    this.__highlightTheme = highlightTheme;
    this.__trigger = trigger;
  }

  static getType(): string {
    return "highlight";
  }

  static clone(node: HighlightNode): HighlightNode {
    return new HighlightNode(node.__text, node.__highlightTheme, node.__trigger, node.__key);
  }

  static importJSON(serializedNode: SerializedHighlightNode): HighlightNode {
    return $applyNodeReplacement(new HighlightNode("")).updateFromJSON(serializedNode);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.style.cursor = "default";
    dom.className = this.__highlightTheme.contentClassName;
    return dom;
  }

  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }

  isTextEntity(): true {
    return true;
  }
}

export function $createKeywordNode(keyword: string = ""): HighlightNode {
  return $applyNodeReplacement(new HighlightNode(keyword));
}

export function $isKeywordNode(node: LexicalNode | null | undefined): boolean {
  return node instanceof HighlightNode;
}

type Props = {
  contentClassName?: string;
  startTrigger?: string;
  endTrigger?: string;
};

export const EditorHighlightPlugin = ({
  endTrigger = "}",
  startTrigger = "${",
  contentClassName = "ph-no-capture text-yellow-200/80"
}: Props) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([HighlightNode])) {
      throw new Error("HighlightsPlugin: HighlightsNode not registered on editor");
    }
  }, [editor]);

  const createKeywordNode = useCallback((textNode: TextNode): HighlightNode => {
    return $applyNodeReplacement(
      new HighlightNode(
        textNode.getTextContent(),
        { contentClassName },
        { startTrigger, endTrigger }
      )
    );
  }, []);

  const getKeywordMatch = useCallback((text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      if (text.slice(i, i + 2) === startTrigger) {
        const closingBracketIndex = text.indexOf(endTrigger, i + 2);
        if (closingBracketIndex !== -1) {
          return { start: i, end: closingBracketIndex + 1 };
        }
        return null;
      }
    }
    return null;
  }, []);

  useLexicalTextEntity<HighlightNode>(getKeywordMatch, HighlightNode, createKeywordNode);

  return null;
};
