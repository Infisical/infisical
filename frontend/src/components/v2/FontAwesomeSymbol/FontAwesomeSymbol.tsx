import { forwardRef, HTMLAttributes } from "react";

type Props = {
  symbolName: string;
} & HTMLAttributes<HTMLDivElement>;

export const FontAwesomeSymbol = forwardRef<HTMLDivElement, Props>(
  ({ symbolName, ...props }, ref) => {
    return (
      <div ref={ref} {...props}>
        <svg className="w-inherit h-inherit">
          <use href={`#${symbolName}`} />
        </svg>
      </div>
    );
  }
);

FontAwesomeSymbol.displayName = "FontAwesomeSymbol";
