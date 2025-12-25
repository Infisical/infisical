import { format, parseISO } from "date-fns";

/**
 * Formats a KMS date string for display.
 * @param dateStr - ISO date string or null/undefined
 * @param fallback - Text to display when date is null/undefined (default: "Never")
 * @returns Formatted date string or fallback
 */
export const formatKmsDate = (dateStr: string | null | undefined, fallback = "Never"): string => {
  if (!dateStr) return fallback;
  try {
    return format(parseISO(dateStr), "PPpp");
  } catch {
    return "Invalid date";
  }
};
