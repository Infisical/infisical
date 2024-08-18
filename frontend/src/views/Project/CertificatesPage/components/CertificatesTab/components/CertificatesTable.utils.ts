import ms from "ms";

export const getCertValidUntilBadgeDetails = (notAfter: string) => {
  const currentDate = new Date().getTime();
  const notAfterDate = new Date(notAfter).getTime();
  const diffInMs = notAfterDate - currentDate;

  let variant: "success" | "primary" | "danger" = "success";
  let label = "Healthy";

  if (diffInMs > ms("60d")) {
    variant = "success";
  } else if (diffInMs > ms("30d")) {
    variant = "primary";
  } else {
    variant = "danger";
  }

  if (diffInMs > ms("60d")) {
    label = "Healthy";
  } else if (diffInMs > ms("0d")) {
    label = `Expires in ${ms(diffInMs)}`;
  } else {
    label = "Expired";
  }

  return { variant, label };
};
