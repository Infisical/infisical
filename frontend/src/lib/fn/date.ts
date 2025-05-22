export const timeAgo = (inputDate: Date, currentDate: Date): string => {
  const now = new Date(currentDate).getTime();
  const date = new Date(inputDate).getTime();
  const elapsedMilliseconds = now - date;
  const elapsedSeconds = Math.abs(Math.floor(elapsedMilliseconds / 1000));
  const elapsedMinutes = Math.abs(Math.floor(elapsedSeconds / 60));
  const elapsedHours = Math.abs(Math.floor(elapsedMinutes / 60));
  const elapsedDays = Math.abs(Math.floor(elapsedHours / 24));
  const elapsedWeeks = Math.abs(Math.floor(elapsedDays / 7));
  const elapsedMonths = Math.abs(Math.floor(elapsedDays / 30));
  const elapsedYears = Math.abs(Math.floor(elapsedDays / 365));

  if (elapsedYears > 0) {
    return `${elapsedYears} year${elapsedYears === 1 ? "" : "s"} ${
      elapsedMilliseconds >= 0 ? "ago" : "from now"
    }`;
  }
  if (elapsedMonths > 0) {
    return `${elapsedMonths} month${elapsedMonths === 1 ? "" : "s"} ${
      elapsedMilliseconds >= 0 ? "ago" : "from now"
    }`;
  }
  if (elapsedWeeks > 0) {
    return `${elapsedWeeks} week${elapsedWeeks === 1 ? "" : "s"} ${
      elapsedMilliseconds >= 0 ? "ago" : "from now"
    }`;
  }
  if (elapsedDays > 0) {
    return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ${
      elapsedMilliseconds >= 0 ? "ago" : "from now"
    }`;
  }
  if (elapsedHours > 0) {
    return `${elapsedHours} hour${elapsedHours === 1 ? "" : "s"} ${
      elapsedMilliseconds >= 0 ? "ago" : "from now"
    }`;
  }
  if (elapsedMinutes > 0) {
    return `${elapsedMinutes} minute${elapsedMinutes === 1 ? "" : "s"} ${
      elapsedMilliseconds >= 0 ? "ago" : "from now"
    }`;
  }
  return `${elapsedSeconds} second${elapsedSeconds === 1 ? "" : "s"} ${
    elapsedMilliseconds >= 0 ? "ago" : "from now"
  }`;
};

export enum TimeUnit {
  DAY = "days",
  WEEK = "weeks",
  MONTH = "months",
  YEAR = "years"
}

export const convertTimeUnitValueToDays = (unit: TimeUnit, value: number) => {
  switch (unit) {
    case TimeUnit.DAY:
      return value;
    case TimeUnit.WEEK:
      return value * 7;
    case TimeUnit.MONTH:
      return value * 30;
    case TimeUnit.YEAR:
      return value * 365;
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }
};
