const MemoryLicenseServerKeyTokenStorage = () => {
    let authToken: string;
  
    return {
      setToken: (token: string) => {
        authToken = token;
      },
      getToken: () => authToken,
    };
};

const MemoryLicenseKeyTokenStorage = () => {
    let authToken: string;
  
    return {
      setToken: (token: string) => {
        authToken = token;
      },
      getToken: () => authToken,
    };
};

const licenseServerTokenStorage = MemoryLicenseServerKeyTokenStorage();
const licenseTokenStorage = MemoryLicenseKeyTokenStorage();

export const getLicenseServerKeyAuthToken = licenseServerTokenStorage.getToken;
export const setLicenseServerKeyAuthToken = licenseServerTokenStorage.setToken;

export const getLicenseKeyAuthToken = licenseTokenStorage.getToken;
export const setLicenseKeyAuthToken = licenseTokenStorage.setToken;