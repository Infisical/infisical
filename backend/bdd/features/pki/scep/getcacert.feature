Feature: GetCACert

  Scenario: Get CA cert bundle with CA cert included
    Given I have a SCEP cert profile with config as "scep_profile"
      """
      { "challengePassword": "testpassword123", "includeCaCertInResponse": true }
      """
    When I fetch the SCEP CA certificates for profile "scep_profile"
    Then the SCEP CA certificate bundle should contain at least 2 certificate(s)
    And the first certificate in the SCEP bundle should have CN containing Infisical SCEP RA

  Scenario: Get CA cert bundle without CA cert
    Given I have a SCEP cert profile with config as "scep_profile"
      """
      { "challengePassword": "testpassword123", "includeCaCertInResponse": false }
      """
    When I fetch the SCEP CA certificates for profile "scep_profile"
    Then the SCEP CA certificate bundle should contain exactly 1 certificate(s)
    And the first certificate in the SCEP bundle should have CN containing Infisical SCEP RA

  Scenario: GetCACert response has correct content type
    Given I have a SCEP cert profile with challenge password "testpassword123" as "scep_profile"
    When I send a SCEP GetCACert request for profile "scep_profile"
    Then the response status code should be "200"
    And the response content type should be "application/x-x509-ca-ra-cert"
