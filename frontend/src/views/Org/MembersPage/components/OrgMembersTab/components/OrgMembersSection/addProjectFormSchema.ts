import * as yup from "yup";

import { CheckedProjectsMap } from "./types";

const addProjectFormSchema = yup.object({
  projects: yup
    .object()
    .shape(
      Object.keys({} as CheckedProjectsMap).reduce((acc, key) => {
        acc[key] = yup.boolean().default(false);
        return acc;
      }, {} as Record<string, yup.BooleanSchema>)
    )
    .test("at-least-one-selected", "Select at least one project", (value) => {
      // Check if any of the projects is checked
      return value && Object.values(value).some((selected) => selected === true);
    })
    .required("Selection of projects is required")
    .label("Projects")
});

export default addProjectFormSchema;
