Feature: Challenge

  Scenario: Validate challenge
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to {BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory
#     # TODO: make it I have an account already instead?
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    When I create certificate signing request as csr
    Then I add names to certificate signing request csr
      """
      {
        "COMMON_NAME": "localhost"
      }
      """
    Then I create a RSA private key pair as cert_key
    Then I sign the certificate signing request csr with private key cert_key and output it as csr_pem in PEM format
    Then I submit the certificate signing request PEM csr_pem certificate order to the ACME server as order
    Then I select challenge with type http-01 for domain localhost from order at order as challenge
    Then I serve challenge response for challenge at localhost
    Then I tell ACME server that challenge is ready to be verified
    Then I poll and finalize the ACME order order as finalized_order
    Then the value finalized_order.body with jq ".status" should be equal to "valid"
    # TODO: check the fullchain pem content of the order
