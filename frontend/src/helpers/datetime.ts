import { format } from "date-fns";

export enum Timezone {
  Local = "local",
  UTC = "UTC"
}

export const formatDateTime = ({
  timezone,
  timestamp,
  dateFormat = "MMM do yyyy, hh:mm a"
}: {
  timestamp: string | Date;
  timezone?: Timezone;
  dateFormat?: string;
}) => {
  const date = new Date(timestamp);

  if (timezone === Timezone.UTC) {
    const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    return `${format(utcDate, dateFormat)}`;
  }
  return format(date, dateFormat);
};
