export const machineAuthCategories = ['All', 'Token-based', 'Cloud Provider', 'Kubernetes', 'Certificate-based', 'Directory-based'];

export const machineAuthMethods = [
  {"name": "Universal Auth", "slug": "universal-auth", "path": "/documentation/platform/identities/universal-auth", "description": "Learn how to authenticate machines using Universal Auth tokens with client ID and secret.", "category": "Token-based"},
  {"name": "Token Auth", "slug": "token-auth", "path": "/documentation/platform/identities/token-auth", "description": "Learn how to authenticate machines using long-lived access tokens.", "category": "Token-based"},
  {"name": "JWT Auth", "slug": "jwt-auth", "path": "/documentation/platform/identities/jwt-auth", "description": "Learn how to authenticate machines using JSON Web Tokens (JWT).", "category": "Token-based"},
  {"name": "AWS Auth", "slug": "aws-iam-auth", "path": "/documentation/platform/identities/aws-auth", "description": "Learn how to authenticate AWS services and resources using IAM roles.", "category": "Cloud Provider"},
  {"name": "Azure Auth", "slug": "azure-auth", "path": "/documentation/platform/identities/azure-auth", "description": "Learn how to authenticate Azure services using managed identities.", "category": "Cloud Provider"},
  {"name": "GCP Auth", "slug": "gcp-auth", "path": "/documentation/platform/identities/gcp-auth", "description": "Learn how to authenticate GCP services using service accounts.", "category": "Cloud Provider"},
  {"name": "Alibaba Cloud Auth", "slug": "alicloud-auth", "path": "/documentation/platform/identities/alicloud-auth", "description": "Learn how to authenticate Alibaba Cloud services using RAM roles.", "category": "Cloud Provider"},
  {"name": "OCI Auth", "slug": "oci-auth", "path": "/documentation/platform/identities/oci-auth", "description": "Learn how to authenticate Oracle Cloud Infrastructure services.", "category": "Cloud Provider"},
  {"name": "Kubernetes Auth", "slug": "kubernetes-auth", "path": "/documentation/platform/identities/kubernetes-auth", "description": "Learn how to authenticate Kubernetes workloads using service account tokens.", "category": "Kubernetes"},
  {"name": "OIDC Auth", "slug": "oidc-auth-general", "path": "/documentation/platform/identities/oidc-auth/general", "description": "Learn how to authenticate machines using OpenID Connect (OIDC) providers.", "category": "Token-based"},
  {"name": "OIDC Auth for GitHub Actions", "slug": "oidc-auth-github", "path": "/documentation/platform/identities/oidc-auth/github", "description": "Learn how to authenticate GitHub Actions using OIDC.", "category": "Token-based"},
  {"name": "OIDC Auth for GitLab CI/CD", "slug": "oidc-auth-gitlab", "path": "/documentation/platform/identities/oidc-auth/gitlab", "description": "Learn how to authenticate GitLab CI/CD using OIDC.", "category": "Token-based"},
  {"name": "OIDC Auth for Azure", "slug": "oidc-auth-azure", "path": "/documentation/platform/identities/oidc-auth/azure", "description": "Learn how to authenticate Azure services using OIDC.", "category": "Token-based"},
  {"name": "OIDC Auth for CircleCI", "slug": "oidc-auth-circleci", "path": "/documentation/platform/identities/oidc-auth/circleci", "description": "Learn how to authenticate CircleCI workflows using OIDC.", "category": "Token-based"},
  {"name": "OIDC Auth for Terraform Cloud", "slug": "oidc-auth-terraform", "path": "/documentation/platform/identities/oidc-auth/terraform-cloud", "description": "Learn how to authenticate Terraform Cloud using OIDC.", "category": "Token-based"},
  {"name": "OIDC Auth for SPIRE", "slug": "oidc-auth-spire", "path": "/documentation/platform/identities/oidc-auth/spire", "description": "Learn how to authenticate workloads using SPIFFE/SPIRE OIDC.", "category": "Token-based"},
  {"name": "TLS Certificate Auth", "slug": "tls-cert-auth", "path": "/documentation/platform/identities/tls-cert-auth", "description": "Learn how to authenticate machines using TLS client certificates.", "category": "Certificate-based"},
  {"name": "LDAP Auth", "slug": "ldap-auth-general", "path": "/documentation/platform/identities/ldap-auth/general", "description": "Learn how to authenticate machines using LDAP credentials.", "category": "Directory-based"},
  {"name": "LDAP Auth for JumpCloud", "slug": "ldap-auth-jumpcloud", "path": "/documentation/platform/identities/ldap-auth/jumpcloud", "description": "Learn how to authenticate machines using JumpCloud LDAP.", "category": "Directory-based"},
  {"name": "SPIFFE Auth", "slug": "spiffe-auth", "path": "/documentation/platform/identities/spiffe-auth", "description": "Learn how to authenticate workloads using SPIFFE JWT-SVIDs issued by SPIRE.", "category": "Certificate-based"}
];
