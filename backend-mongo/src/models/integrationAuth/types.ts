interface GCPIntegrationAuthMetadata {
    authMethod: "oauth2" | "serviceAccount"
}

export type IntegrationAuthMetadata = GCPIntegrationAuthMetadata;