import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalIsTextContentEmpty } from "@lexical/react/useLexicalIsTextContentEmpty";

export const EditorPlaceholderPlugin = ({ placeholder }: { placeholder: string | undefined }) => {
  const [editor] = useLexicalComposerContext();
  const isEmpty = useLexicalIsTextContentEmpty(editor);

  /* Set the placeholder on root. */
  useEffect(() => {
    const rootElement = editor.getRootElement() as HTMLElement;
    if (rootElement) {
      if (isEmpty && placeholder) {
        rootElement.setAttribute("placeholder", placeholder);
      } else {
        rootElement.removeAttribute("placeholder");
      }
    }
  }, [editor, isEmpty]); // eslint-disable-line

  return null;
};
