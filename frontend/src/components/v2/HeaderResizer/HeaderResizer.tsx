import { MouseEventHandler } from "react";

export const HeaderResizer = ({
  onMouseDown,
  isActive,
  scrollOffset
}: {
  onMouseDown: MouseEventHandler<HTMLDivElement>;
  isActive: boolean;
  scrollOffset: number;
}) => {
  return (
    <>
      <div
        tabIndex={-1}
        role="button"
        className={`absolute bottom-[0.02rem] left-0 z-40 h-0.5 w-full cursor-ns-resize hover:bg-blue-400/20 ${
          isActive ? "bg-blue-400/75" : "bg-transparent"
        }`}
        onMouseDown={onMouseDown}
        style={{
          transform: "translateY(50%)"
        }}
      />
      <div
        style={{ left: `calc(43% + ${scrollOffset}px)` }}
        className="pointer-events-none absolute -bottom-[0.1rem] z-30 -translate-x-1/2"
      >
        <div className="h-1 w-8 rounded bg-gray-400 opacity-50" />
      </div>
    </>
  );
};
