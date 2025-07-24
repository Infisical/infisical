export const getExpandedRowStyle = (scrollOffset: number) => ({
  marginLeft: scrollOffset,
  width: "calc(100vw - 275px)", // accounts for sidebar and margin
  maxWidth: "1270px" // largest width of table on ultra-wide
});

type GetHeaderStyleParams = {
  collapseEnvironments: boolean;
  isLast: boolean;
  headerHeight: number;
};

export const getHeaderStyle = ({
  collapseEnvironments,
  isLast,
  headerHeight
}: GetHeaderStyleParams) => {
  if (!collapseEnvironments) return undefined;

  // scott: this is mostly trial/error to keep centered with skew
  if (isLast) {
    return {
      width: headerHeight * 0.42,
      bottom: headerHeight * 0.222,
      left: 2
    };
  }

  return {
    // scott: this is mostly trial/error to keep centered with skew
    width: headerHeight * 0.9,
    bottom: headerHeight * 0.45,
    left: 24 - (headerHeight * 0.9) / 2.985
  };
};
