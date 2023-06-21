import { initProjectHelper } from "@app/helpers/project";

class ProjectService {
    /**
     * Create and initialize a new project in organization with id [organizationId]
     * Note: current user should be a member of the organization
     * @param {Object} obj
     * @param {String} obj.organizationId - id of organization
     * @param {String} obj.projectName - name of new project
     * @returns {Project} project - new project
     */
    static async initProject({
        organizationId,
        projectName
    }: {
        organizationId: string;
        projectName: string 
    }) {
        return initProjectHelper({
            organizationId,
            projectName
        });
    }
}

export default ProjectService;