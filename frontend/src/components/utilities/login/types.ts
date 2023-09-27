export interface IsMfaLoginSuccessful {
    success: boolean;
    loginResponse:{ 
        privateKey: string;
        JTWToken: string;
    }
}