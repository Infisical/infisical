export enum RailwayConnectionMethod {
  ApiToken = "api-token"
}

export const RailwayGraphQueries = {
  listProjects: `
  {
    projects {
      edges {
        node {
          id
          name
          services {
            edges {
              node {
                id
                name
              }
            }
          }
          environments {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    }
  }
`,
  getVariables: `query variables($environmentId: String!, $projectId: String!, $serviceId: String) {
  variables(
    projectId: $projectId,
    environmentId: $environmentId,
    serviceId: $serviceId
  )
}`,
  deleteVariable: `mutation variableDelete($input: VariableDeleteInput!) {
  variableDelete(input: $input)
}`,
  upsertVariable: `mutation variableUpsert($input:VariableUpsertInput!) {
  variableUpsert(input: $input)
}`
} as const;
