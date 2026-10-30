import { assertKeyAlgorithmSupported, inferCertificateKeyAlgorithm } from "./gcp-certificate-manager-pki-sync-key-fns";

const RSA_2048_CERT = `-----BEGIN CERTIFICATE-----
MIIDFTCCAf2gAwIBAgIUJqWVlfyyxPiEcQqsN6CMBKNWvFkwDQYJKoZIhvcNAQEL
BQAwGjEYMBYGA1UEAwwPYXBwLmV4YW1wbGUuY29tMB4XDTI2MDgxOTIxMDkzMFoX
DTI2MDkxODIxMDkzMFowGjEYMBYGA1UEAwwPYXBwLmV4YW1wbGUuY29tMIIBIjAN
BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApx5fKx1zkfTXI2lzmA5Q16Eyyzer
3E2AjAM2wX2jWuOeirz1OBck+mn63L5DY3KRk9K2euIUPJ/Hb6Ut1BNx6YSAjbOv
erBLh/o5t6PHepwHpzC7yukJ5XJ2uBrnKecG00gBlIQPf8CphvIXZWxzspBQm450
DOVGz179upQ8UMqnT7stH2djCWQNxZCc1lq1nosJg2uHY14wq/i0juhEuMZ9XY8x
KF9Whiyv2eay+0iEwgnocL1gC1gmdZiUzKIV70yojv2rxCbLvYhj67s1rF7MiU43
2s1+dn+l5TcJMVbSYuWOZUMiByuB+V1ZAdYhyYzyiSzwhXNdZIvRkcSYiQIDAQAB
o1MwUTAdBgNVHQ4EFgQU8L4kxs8JOxBd3wf+GiPRxqoS/m0wHwYDVR0jBBgwFoAU
8L4kxs8JOxBd3wf+GiPRxqoS/m0wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0B
AQsFAAOCAQEAMw7POguziKBKm7MBY8em/eqcUWYyeE0Jre4KNgW7vvdMNHO0zszM
xousk3Q7VbW5we1y1hqsotPQMX6+uEa4G7/gcIf5oLwGQ7mJrBOjm6uO9HGY3mQT
2bCZVexVyL6ppzb9jJKu73RG3oTcRjGVmw06rtp0XPnJj8h1ZkEP/6KTvotHLcwp
Nc30Pm6PmxmWtBsI0JVUymdYw0JXbF0MORfEVE+JAXCQh3HDAWdLO5DZkJqmmpkQ
OijGpKXxCp9CWvV0ptE3JCyyCV3OEFsXj6k+Ql5PziBfQNA43pKQZSWg7J6xI8kA
OP27G8QX3t28F89ffBsqe00/AFjzU4vk3Q==
-----END CERTIFICATE-----`;

const RSA_1024_CERT = `-----BEGIN CERTIFICATE-----
MIICEDCCAXmgAwIBAgIUCMdc7dQODzTg4eO3EIXbBEnYRCcwDQYJKoZIhvcNAQEL
BQAwGjEYMBYGA1UEAwwPYXBwLmV4YW1wbGUuY29tMB4XDTI2MDgxOTIxMDkzMFoX
DTI2MDkxODIxMDkzMFowGjEYMBYGA1UEAwwPYXBwLmV4YW1wbGUuY29tMIGfMA0G
CSqGSIb3DQEBAQUAA4GNADCBiQKBgQCdKs/mFgsCf7qDlTFs9pvs1JiUZPW8Pmn/
KP0F20m8q1bA4GXBJ++xMFJisSnANNMC/3jRRpexzGJ+LlFrQutPO309WxgdN4f3
M3dhLiuR/QypNG5bAfICvnGbFwBLa4FGlJmGQv4MmukKqKHjXBOBQnDdJIlEBQW5
tw34d9LdQwIDAQABo1MwUTAdBgNVHQ4EFgQUgf7LGmbFbVGWaBqVaAo8ABLifSQw
HwYDVR0jBBgwFoAUgf7LGmbFbVGWaBqVaAo8ABLifSQwDwYDVR0TAQH/BAUwAwEB
/zANBgkqhkiG9w0BAQsFAAOBgQBX1MziwLqzbI1C1+mgGzhHGO0PeBAtftfrojkH
oVy3AcSy30E5PmaQQsAk4HGeUnxIxyMI3TJmauMDCl9uILlhrlNt4alwnKWIQcGV
zebhQWRSu9GclFNjldAvRmeqo0hZ4c3Y22VPZ3yHIEI24I5c0QUS4ciuSNTJknoJ
BVImGA==
-----END CERTIFICATE-----`;

const ECDSA_P256_CERT = `-----BEGIN CERTIFICATE-----
MIIBiTCCAS+gAwIBAgIUb/Z7lZlhOtDpxdhj7+ByYLgZQ1EwCgYIKoZIzj0EAwIw
GjEYMBYGA1UEAwwPYXBwLmV4YW1wbGUuY29tMB4XDTI2MDgxOTIxMDkzMFoXDTI2
MDkxODIxMDkzMFowGjEYMBYGA1UEAwwPYXBwLmV4YW1wbGUuY29tMFkwEwYHKoZI
zj0CAQYIKoZIzj0DAQcDQgAE78s8M/B3WI+0rglc906+7mRKqoPrmHOZakyddBCt
6N5pHMa0aI0kUTxx+iHHw9NElF2iW/YMRN9lr8rFKMN5MaNTMFEwHQYDVR0OBBYE
FLuXPx/ibq4KFjCMTDkByVf1/IEMMB8GA1UdIwQYMBaAFLuXPx/ibq4KFjCMTDkB
yVf1/IEMMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIgEuAZ6u5z
oP9tH3btx4VJbf6fF6x0fwtFbDcIxxS0zYcCIQD0mZaLpZSaMjVPwlamXYIy2Vr5
umvT1jJgK+Vpvos3QA==
-----END CERTIFICATE-----`;

const ECDSA_P521_CERT = `-----BEGIN CERTIFICATE-----
MIICETCCAXKgAwIBAgIUPP8yLJ6x8OaEuuBDjUxxN1xqqgcwCgYIKoZIzj0EAwIw
GjEYMBYGA1UEAwwPYXBwLmV4YW1wbGUuY29tMB4XDTI2MDgxOTIxMDkzMFoXDTI2
MDkxODIxMDkzMFowGjEYMBYGA1UEAwwPYXBwLmV4YW1wbGUuY29tMIGbMBAGByqG
SM49AgEGBSuBBAAjA4GGAAQAEQG8mk84TDwPROcnznOeZude0p9Jlc0vH/Rq1xIB
w/chtYqrWQ0I30bL25KF5ETuG97l9Cjwp7p1iEj1k7sKBIMBA+VBbzHlrLQpU3qh
naAPXf9xZblqvhUagkEoNgPH9/iAX8zDxy1V4L9Roh6ahrwo7JWwEW2sPHTHft8y
EitQ3ACjUzBRMB0GA1UdDgQWBBREAkoPMHA3BaKWE7IyOzNP6MKgHjAfBgNVHSME
GDAWgBREAkoPMHA3BaKWE7IyOzNP6MKgHjAPBgNVHRMBAf8EBTADAQH/MAoGCCqG
SM49BAMCA4GMADCBiAJCATJl67KUY4uBhIFtlrppMybgMZ1FLDtQ+2tDzs7k6MRq
3vh2imbCs0ablJZVZKFaZCpGW7gBl7dE7zOHnQbrkBdIAkIBwWMFuhUhdaItL41l
h8KMgJqNGHYFhbuBda68F7pyBvnAgp1QwJuj7z28Vb5bVZr7fqIJq+LVIGAAC3IE
Qu7EAZo=
-----END CERTIFICATE-----`;

describe("inferCertificateKeyAlgorithm", () => {
  test("reads the RSA modulus length", () => {
    expect(inferCertificateKeyAlgorithm(RSA_2048_CERT)).toBe("RSA-2048");
    expect(inferCertificateKeyAlgorithm(RSA_1024_CERT)).toBe("RSA-1024");
  });

  test("reads the ECDSA curve", () => {
    expect(inferCertificateKeyAlgorithm(ECDSA_P256_CERT)).toBe("ECDSA-P256");
    expect(inferCertificateKeyAlgorithm(ECDSA_P521_CERT)).toBe("ECDSA-P521");
  });

  test("fails with an actionable message on unparseable input", () => {
    expect(() => inferCertificateKeyAlgorithm("not a certificate")).toThrow(
      /Failed to parse certificate to determine its key algorithm/
    );
  });
});

describe("assertKeyAlgorithmSupported", () => {
  test("accepts the algorithms GCP Certificate Manager supports", () => {
    expect(assertKeyAlgorithmSupported(RSA_2048_CERT)).toBe("RSA-2048");
    expect(assertKeyAlgorithmSupported(ECDSA_P256_CERT)).toBe("ECDSA-P256");
  });

  test("rejects RSA keys below 2048 bits before the API sees them", () => {
    expect(() => assertKeyAlgorithmSupported(RSA_1024_CERT)).toThrow(
      /key algorithm "RSA-1024", which GCP Certificate Manager does not support/
    );
  });

  test("rejects ECDSA P-521, which GCP does not accept", () => {
    expect(() => assertKeyAlgorithmSupported(ECDSA_P521_CERT)).toThrow(/ECDSA-P521/);
  });
});
