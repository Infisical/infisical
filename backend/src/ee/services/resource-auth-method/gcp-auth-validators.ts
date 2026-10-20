import RE2 from "re2";
import { z } from "zod";

// Every Google SA domain: the Compute Engine default lives on developer.gserviceaccount.com.
const serviceAccountEntry = new RE2("^[a-z0-9][a-z0-9-]{0,99}@[a-z0-9][a-z0-9.-]{0,99}\\.gserviceaccount\\.com$");
const projectEntry = new RE2("^[a-z][a-z0-9-]{4,28}[a-z0-9]$");
const zoneEntry = new RE2("^[a-z]([a-z0-9-]{0,62}[a-z0-9])?$");

const csvOf = (pattern: RE2, field: string, max: number, allowed: string) =>
  z
    .string()
    .trim()
    .max(max)
    .default("")
    .refine(
      (value) =>
        value
          .split(",")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
          .every((entry) => pattern.test(entry)),
      { message: `${field} must be a comma-separated list of ${allowed}` }
    );

export const validateAllowedServiceAccounts = csvOf(
  serviceAccountEntry,
  "Allowed service accounts",
  1024,
  "GCP service account emails, for example my-sa@my-project.iam.gserviceaccount.com"
);

export const validateAllowedProjects = csvOf(projectEntry, "Allowed projects", 1024, "GCP project IDs");

export const validateAllowedZones = csvOf(
  zoneEntry,
  "Allowed zones",
  1024,
  "GCP zone names, for example us-central1-a"
);
