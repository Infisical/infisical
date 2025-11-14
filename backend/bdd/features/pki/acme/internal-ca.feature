Feature: Internal CA

  Scenario Outline: CSR with SANs only
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    When I create certificate signing request as csr
    Then I add names to certificate signing request csr
      """
      <names>
      """
    And I add subject alternative name to certificate signing request csr
      """
      [
        "localhost"
      ]
      """
    And I create a RSA private key pair as cert_key
    And I sign the certificate signing request csr with private key cert_key and output it as csr_pem in PEM format
    And I submit the certificate signing request PEM csr_pem certificate order to the ACME server as order
    And I select challenge with type http-01 for domain localhost from order in order as challenge
    And I serve challenge response for challenge at localhost
    And I tell ACME server that challenge is ready to be verified
    And I poll and finalize the ACME order order as finalized_order
    And the value finalized_order.body with jq ".status" should be equal to "valid"
    And I parse the full-chain certificate from order finalized_order as cert
    And the value cert with jq ".subject.common_name" should be equal to "localhost"

    Examples:
      | names               |
      | {}                  |
      | {"COMMON_NAME": ""}
