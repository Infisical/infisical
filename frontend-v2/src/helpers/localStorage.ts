const INTEGRATION_PROJECT_ID = "integration_project_id";
export const localStorageService = {
  getIintegrationProjectId() {
    return localStorage.getItem(INTEGRATION_PROJECT_ID);
  },
  setIntegrationProjectId(projectId: string) {
    return localStorage.setItem(INTEGRATION_PROJECT_ID, projectId);
  }
};
