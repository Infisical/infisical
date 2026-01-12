export const truncateSerialNumber = (serialNumber: string | null | undefined): string => {
  if (!serialNumber || typeof serialNumber !== "string") {
    return "—";
  }

  // If serial number is 8 characters or less, show it in full
  if (serialNumber.length <= 8) {
    return serialNumber;
  }

  // Show first 4 + "..." + last 4
  const first4 = serialNumber.substring(0, 4);
  const last4 = serialNumber.substring(serialNumber.length - 4);
  return `${first4}...${last4}`;
};
