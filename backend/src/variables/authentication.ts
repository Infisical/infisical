export enum AuthTokenType {
    ACCESS_TOKEN = "accessToken",
    REFRESH_TOKEN = "refreshToken",
    SIGNUP_TOKEN = "signupToken",
    MFA_TOKEN = "mfaToken",
    PROVIDER_TOKEN = "providerToken",
    API_KEY = "apiKey"
}

export enum AuthMode {
    JWT = "jwt",
    SERVICE_TOKEN = "serviceToken",
    SERVICE_TOKEN_V3 = "serviceTokenV3",
    API_KEY = "apiKey"
}

export const K8_USER_AGENT_NAME = "k8-operator"