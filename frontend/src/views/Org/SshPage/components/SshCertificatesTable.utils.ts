export const getSshCertStatusBadgeDetails = (notAfter: string) => {
  const currentDate = new Date().getTime();
  const notAfterDate = new Date(notAfter).getTime();

  let variant: "success" | "primary" | "danger" = "success";
  let label = "Active";

  if (notAfterDate > currentDate) {
    variant = "success";
    label = "Active";
  } else {
    variant = "danger";
    label = "Expired";
  }

  return { variant, label };
};
