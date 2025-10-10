/* eslint-disable no-underscore-dangle */
import { forwardRef, InputHTMLAttributes } from "react";
import { InitialConfigType, LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ReactNode } from "@tanstack/react-router";
import { cva, VariantProps } from "cva";
import { EditorState, LexicalEditor } from "lexical";
import { twMerge } from "tailwind-merge";

import { HighlightNode } from "./EditorHighlight";
import { EditorPlaceholderPlugin } from "./EditorPlaceholderPlugin";

// Catch any errors that occur during Lexical updates and log them
// or throw them as needed. If you don't throw them, Lexical will
// try to recover gracefully without losing user data.
function onError(error: Error) {
  console.error(error);
}

const inputVariants = cva(
  "input w-full py-1.5 text-gray-400 placeholder:text-sm placeholder-gray-500/50 outline-hidden focus:ring-2 hover:ring-bunker-400/60 duration-100",
  {
    variants: {
      size: {
        xs: ["text-xs"],
        sm: ["text-sm"],
        md: ["text-md"],
        lg: ["text-lg"]
      },
      isRounded: {
        true: ["rounded-md"],
        false: ""
      },
      variant: {
        filled: ["bg-mineshaft-900", "text-gray-400"],
        outline: ["bg-transparent"],
        plain: "bg-transparent outline-hidden"
      },
      isError: {
        true: "focus:ring-red/50 placeholder-red-300",
        false: "focus:ring-primary-400/50 focus:ring-1"
      }
    },
    compoundVariants: []
  }
);

const inputParentContainerVariants = cva("inline-flex font-inter items-center border relative", {
  variants: {
    isRounded: {
      true: ["rounded-md"],
      false: ""
    },
    isError: {
      true: "border-red",
      false: "border-mineshaft-500"
    },
    isFullWidth: {
      true: "w-full",
      false: ""
    },
    variant: {
      filled: ["bg-bunker-800", "text-gray-400"],
      outline: ["bg-transparent"],
      plain: "border-none"
    }
  }
});

type Props = Omit<
  InputHTMLAttributes<HTMLDivElement>,
  "size" | "onChange" | "placeholder" | "aria-placeholder"
> &
  VariantProps<typeof inputVariants> & {
    children?: ReactNode;
    namespace?: string;
    placeholder?: string;
    isFullWidth?: boolean;
    isRequired?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    isDisabled?: boolean;
    isReadOnly?: boolean;
    containerClassName?: string;
    onChange: (editorState: EditorState, editor: LexicalEditor, tags: Set<string>) => void;
    initialValue?: string;
  };

export const Editor = forwardRef<HTMLDivElement, Props>(
  (
    {
      children,
      namespace = "infisical-editor",
      className,
      containerClassName,
      isRounded = true,
      isFullWidth = true,
      isDisabled,
      isError = false,
      isRequired,
      leftIcon,
      rightIcon,
      variant = "filled",
      size = "md",
      isReadOnly,
      placeholder,
      onChange,
      ...props
    },
    ref
  ) => {
    const initialConfig: InitialConfigType = {
      namespace,
      onError,
      nodes: [HighlightNode]
    };

    return (
      <div
        className={inputParentContainerVariants({
          isRounded,
          isError,
          isFullWidth,
          variant,
          className: containerClassName
        })}
      >
        {leftIcon && <span className="absolute left-0 ml-3 text-sm">{leftIcon}</span>}
        <LexicalComposer initialConfig={initialConfig}>
          <PlainTextPlugin
            contentEditable={
              <ContentEditable
                ref={ref}
                aria-required={isRequired}
                readOnly={isReadOnly}
                disabled={isDisabled}
                className={twMerge(
                  leftIcon ? "pl-10" : "pl-2.5",
                  rightIcon ? "pr-10" : "pr-2.5",
                  inputVariants({ className, isError, size, isRounded, variant })
                )}
                {...props}
                placeholder={null}
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <OnChangePlugin onChange={onChange} />
          <EditorPlaceholderPlugin placeholder={placeholder} />
          {children}
        </LexicalComposer>
        {rightIcon && <span className="absolute right-0 mr-3">{rightIcon}</span>}
      </div>
    );
  }
);
