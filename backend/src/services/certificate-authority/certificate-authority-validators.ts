import { z } from "zod";

const isValidDate = (dateString: string) => {
  const date = new Date(dateString);
  return !Number.isNaN(date.getTime());
};

export const validateCaDateField = z.string().trim().refine(isValidDate, { message: "Invalid date format" });
