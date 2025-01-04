export type TOrgAdminGetProjectsDTO = {
  limit?: number;
  offset?: number;
  search?: string;
};

export type TOrgAdminAccessProjectDTO = {
  projectId: string;
};
