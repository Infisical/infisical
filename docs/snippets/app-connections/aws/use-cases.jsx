// Options for the <UseCasePicker> on integrations/app-connections/aws.mdx, and the IAM policy each
// option needs. Each `id` must match a <UseCase use="..."> block on that page.
//
// `policy.statements` is what <CombinedIamPolicy> merges. Every `Sid` has to be unique across all
// options, because the combined policy puts them in one document and IAM rejects duplicates.
// `policy.optional` holds statements only some setups need, such as a customer managed KMS key;
// its `label` completes a sentence that starts with the option's label. An option without `policy`
// gets its permissions somewhere else, and the page's notes after the policy say where.
export const awsUseCaseGroups = [
  {
    label: "Secret syncs",
    options: [
      {
        id: "secrets-manager",
        label: "AWS Secrets Manager sync",
        policy: {
          statements: [
            {
              Sid: "AllowSecretsManagerAccess",
              Effect: "Allow",
              Action: [
                "secretsmanager:ListSecrets",
                "secretsmanager:GetSecretValue",
                "secretsmanager:BatchGetSecretValue",
                "secretsmanager:CreateSecret",
                "secretsmanager:UpdateSecret",
                "secretsmanager:DeleteSecret",
                "secretsmanager:DescribeSecret",
                "secretsmanager:TagResource",
                "secretsmanager:UntagResource"
              ],
              Resource: "*"
            }
          ],
          optional: {
            label: "uses a customer managed KMS key",
            statements: [
              {
                Sid: "AllowKmsKeyForSecretsManager",
                Effect: "Allow",
                Action: ["kms:ListAliases", "kms:DescribeKey", "kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"],
                Resource: "*"
              }
            ]
          }
        }
      },
      {
        id: "parameter-store",
        label: "AWS Parameter Store sync",
        policy: {
          statements: [
            {
              Sid: "AllowSSMAccess",
              Effect: "Allow",
              Action: [
                "ssm:PutParameter",
                "ssm:GetParameters",
                "ssm:GetParametersByPath",
                "ssm:DescribeParameters",
                "ssm:DeleteParameters",
                "ssm:ListTagsForResource",
                "ssm:AddTagsToResource",
                "ssm:RemoveTagsFromResource"
              ],
              Resource: "*"
            }
          ],
          optional: {
            label: "uses a customer managed KMS key",
            statements: [
              {
                Sid: "AllowKmsKeyForParameterStore",
                Effect: "Allow",
                Action: ["kms:ListAliases", "kms:DescribeKey", "kms:Encrypt", "kms:Decrypt"],
                Resource: "*"
              }
            ]
          }
        }
      }
    ]
  },
  {
    label: "Secret rotation and detection",
    options: [
      {
        id: "iam-rotation",
        label: "AWS IAM user secret rotation",
        policy: {
          statements: [
            {
              Sid: "AllowIamUserAccessKeyRotation",
              Effect: "Allow",
              Action: [
                "iam:ListAccessKeys",
                "iam:CreateAccessKey",
                "iam:UpdateAccessKey",
                "iam:DeleteAccessKey",
                "iam:ListUsers"
              ],
              Resource: "*"
            }
          ]
        }
      },
      {
        id: "honey-tokens",
        label: "AWS honey tokens",
        policy: {
          statements: [
            {
              Sid: "HoneyTokenIAMManagement",
              Effect: "Allow",
              Action: ["iam:CreateUser", "iam:DeleteUser", "iam:CreateAccessKey", "iam:DeleteAccessKey"],
              Resource: "arn:aws:iam::*:user/inf_ht_*"
            },
            {
              Sid: "HoneyTokenStackVerification",
              Effect: "Allow",
              Action: ["cloudformation:DescribeStacks"],
              Resource: "*"
            }
          ]
        }
      }
    ]
  },
  {
    label: "Certificates",
    options: [
      {
        id: "acm-sync",
        label: "AWS Certificate Manager sync",
        policy: {
          statements: [
            {
              Sid: "AllowCertificateManagerAccess",
              Effect: "Allow",
              Action: [
                "acm:ListCertificates",
                "acm:DescribeCertificate",
                "acm:GetCertificate",
                "acm:ImportCertificate",
                "acm:ExportCertificate",
                "acm:DeleteCertificate",
                "acm:AddTagsToCertificate",
                "acm:RemoveTagsFromCertificate",
                "acm:ListTagsForCertificate"
              ],
              Resource: "*"
            }
          ]
        }
      },
      {
        id: "elb-sync",
        label: "AWS Elastic Load Balancer sync",
        policy: {
          statements: [
            {
              Sid: "AllowElbCertificateManagerAccess",
              Effect: "Allow",
              Action: [
                "acm:ListCertificates",
                "acm:DescribeCertificate",
                "acm:GetCertificate",
                "acm:ImportCertificate",
                "acm:DeleteCertificate",
                "acm:AddTagsToCertificate",
                "acm:ListTagsForCertificate"
              ],
              Resource: "*"
            },
            {
              Sid: "AllowElasticLoadBalancerAccess",
              Effect: "Allow",
              Action: [
                "elasticloadbalancing:DescribeLoadBalancers",
                "elasticloadbalancing:DescribeListeners",
                "elasticloadbalancing:DescribeListenerCertificates",
                "elasticloadbalancing:AddListenerCertificates",
                "elasticloadbalancing:RemoveListenerCertificates",
                "elasticloadbalancing:ModifyListener"
              ],
              Resource: "*"
            }
          ]
        }
      },
      {
        id: "pki-secrets-manager",
        label: "AWS Secrets Manager certificate sync",
        policy: {
          statements: [
            {
              Sid: "AllowSecretsManagerCertificateSync",
              Effect: "Allow",
              Action: [
                "secretsmanager:ListSecrets",
                "secretsmanager:CreateSecret",
                "secretsmanager:UpdateSecret",
                "secretsmanager:DeleteSecret"
              ],
              Resource: "*"
            }
          ]
        }
      },
      {
        id: "private-ca",
        label: "AWS Private CA",
        policy: {
          statements: [
            {
              Sid: "AllowAwsPrivateCAAccess",
              Effect: "Allow",
              Action: [
                "acm-pca:DescribeCertificateAuthority",
                "acm-pca:GetCertificateAuthorityCertificate",
                "acm-pca:IssueCertificate",
                "acm-pca:GetCertificate",
                "acm-pca:RevokeCertificate"
              ],
              Resource: "arn:aws:acm-pca:<region>:<account-id>:certificate-authority/<ca-id>"
            }
          ]
        }
      },
      {
        id: "acm-public-ca",
        label: "AWS Certificate Manager public CA",
        policy: {
          statements: [
            {
              Sid: "AllowAcmPublicCaAccess",
              Effect: "Allow",
              Action: [
                "acm:RequestCertificate",
                "acm:DescribeCertificate",
                "acm:ExportCertificate",
                "acm:RenewCertificate",
                "acm:RevokeCertificate",
                "acm:ListCertificates"
              ],
              Resource: "*"
            },
            {
              Sid: "AllowRoute53ForAcmValidation",
              Effect: "Allow",
              Action: ["route53:GetHostedZone", "route53:ChangeResourceRecordSets"],
              Resource: "arn:aws:route53:::hostedzone/<hosted-zone-id>"
            }
          ]
        }
      },
      {
        id: "acme-route53",
        label: "ACME CA with Route 53",
        policy: {
          statements: [
            {
              Sid: "AllowRoute53HostedZoneForAcme",
              Effect: "Allow",
              Action: ["route53:GetHostedZone"],
              Resource: "arn:aws:route53:::hostedzone/<hosted-zone-id>"
            },
            {
              Sid: "AllowRoute53TxtRecordsForAcme",
              Effect: "Allow",
              Action: ["route53:ChangeResourceRecordSets"],
              Resource: "arn:aws:route53:::hostedzone/<hosted-zone-id>",
              Condition: {
                "ForAllValues:StringEquals": {
                  "route53:ChangeResourceRecordSetsRecordTypes": ["TXT"]
                }
              }
            }
          ]
        }
      }
    ]
  },
  {
    label: "Session recording",
    options: [
      {
        id: "pam-recording",
        label: "PAM session recording",
        policy: {
          statements: [
            {
              Sid: "AllowPamRecordingBucketAccess",
              Effect: "Allow",
              Action: ["s3:PutObject", "s3:GetObject"],
              Resource: "arn:aws:s3:::<recording-bucket>/*"
            },
            {
              Sid: "AllowPamRecordingBucketTest",
              Effect: "Allow",
              Action: ["s3:ListBucket"],
              Resource: "arn:aws:s3:::<recording-bucket>"
            },
            {
              Sid: "AllowPamRecordingConnectionTestCleanup",
              Effect: "Allow",
              Action: ["s3:DeleteObject"],
              Resource: "arn:aws:s3:::<recording-bucket>/.test/*"
            }
          ]
        }
      },
      {
        id: "agent-vault-session-logs",
        label: "Agent Vault session logs",
        // Matches what the Session Logs dialog's View AWS Setup generates (AwsSetupDialog.tsx).
        policy: {
          statements: [
            {
              Sid: "AllowAgentVaultSessionLogObjects",
              Effect: "Allow",
              Action: ["s3:PutObject", "s3:GetObject"],
              Resource: "arn:aws:s3:::<session-logs-bucket>/<key-prefix>/*"
            },
            {
              Sid: "AllowAgentVaultSessionLogBucket",
              Effect: "Allow",
              Action: ["s3:ListBucket"],
              Resource: "arn:aws:s3:::<session-logs-bucket>"
            }
          ]
        }
      }
    ]
  }
];
