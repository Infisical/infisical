// TODO: merge [AuthTokenType] and [AuthMode]

export enum AuthTokenType {
    ACCESS_TOKEN = "accessToken",
    REFRESH_TOKEN = "refreshToken",
    SIGNUP_TOKEN = "signupToken", // TODO: remove in favor of claim
    MFA_TOKEN = "mfaToken", // TODO: remove in favor of claim
    PROVIDER_TOKEN = "providerToken", // TODO: remove in favor of claim
    API_KEY = "apiKey",
    IDENTITY_ACCESS_TOKEN = "identityAccessToken",
}

export enum AuthMode {
    JWT = "jwt",
    SERVICE_TOKEN = "serviceToken",
    IDENTITY_ACCESS_TOKEN = "identityAccessToken",
    API_KEY = "apiKey",
    API_KEY_V2 = "apiKeyV2"
}

export const K8_USER_AGENT_NAME = "k8-operator"