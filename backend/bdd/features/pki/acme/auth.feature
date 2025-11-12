Feature: Authorization

  Scenario: Get authorization
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
    Then the value order.authorizations[0].uri with jq "." should match pattern {BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/authorizations/(.+)
    Then the value order.authorizations[0].body with jq ".status" should be equal to "pending"
    Then the value order.authorizations[0].body with jq ".challenges | map(pick(.type, .status)) | sort_by(.type)" should be equal to json
      """
        [
          {
            "type": "http-01",
            "status": "pending"
          }
        ]
      """
    Then the value order.authorizations[0].body with jq ".challenges | map(.status) | sort" should be equal to ["pending"]
    Then the value order.authorizations[0].body with jq ".identifier" should be equal to json
      """
      {
        "type": "dns",
        "value": "localhost"
      }
      """
