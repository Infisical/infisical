export const getExpandedRowStyle = (scrollOffset: number) => ({
  marginLeft: scrollOffset,
  width: "calc(100vw - 355px)", // 350px accounts for sidebar and margin
  maxWidth: "1270px" // largest width of table on ultra-wide
});
