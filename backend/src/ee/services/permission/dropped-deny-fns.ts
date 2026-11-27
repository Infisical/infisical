import { ProjectPermissionV1Schema, ProjectPermissionV2Schema } from "./project-permission";

// The project subjects whose rule schema has no `inverted`. Parsing drops the flag, so a deny on one of them is saved
// as an allow. Read from the schemas so a subject that later gains `inverted` leaves the list on its own.
const subjectsWithoutDeny = (schema: typeof ProjectPermissionV1Schema | typeof ProjectPermissionV2Schema) =>
  new Set<string>(
    (schema.options as { shape: Record<string, unknown> & { subject: { value: string } } }[])
      .filter((option) => !("inverted" in option.shape))
      .map((option) => option.shape.subject.value)
  );

export const PROJECT_SUBJECTS_WITHOUT_DENY = subjectsWithoutDeny(ProjectPermissionV2Schema);
export const PROJECT_SUBJECTS_WITHOUT_DENY_V1 = subjectsWithoutDeny(ProjectPermissionV1Schema);

// The subjects a request's raw rules deny that parsing will turn into allows. Read before the body is parsed.
export const findDroppedDenySubjects = (rawPermissions: unknown, withoutDeny = PROJECT_SUBJECTS_WITHOUT_DENY) => {
  if (!Array.isArray(rawPermissions)) return [];
  const subjects = rawPermissions
    .filter(
      (rule): rule is { subject: string; inverted: true } =>
        typeof rule === "object" &&
        rule !== null &&
        (rule as { inverted?: unknown }).inverted === true &&
        withoutDeny.has((rule as { subject?: string }).subject ?? "")
    )
    .map((rule) => rule.subject);
  return [...new Set(subjects)].sort();
};
