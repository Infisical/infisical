export const getExpandedRowStyle = (scrollOffset: number) => ({
  marginLeft: scrollOffset,
  width: "calc(100vw - 110px)", // accounts for sidebar and margin
  maxWidth: "1404px" // largest width of table on ultra-wide
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

export const LAST_EDITED_COLUMN_WIDTH = 160;

// single-environment view adds a "Last edited" column after the value column
export const getOverviewTableColumnCount = (environmentCount: number) =>
  environmentCount === 1 ? 4 : environmentCount + 2;
