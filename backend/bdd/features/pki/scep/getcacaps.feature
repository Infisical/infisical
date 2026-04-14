Feature: GetCACaps

  Scenario: Get capabilities for a SCEP profile
    Given I have a SCEP cert profile with challenge password "testpassword123" as "scep_profile"
    When I send a SCEP GetCACaps request for profile "scep_profile"
    Then the response status code should be "200"
    And the response content type should be "text/plain"
    And the SCEP GetCACaps response should contain "POSTPKIOperation"
    And the SCEP GetCACaps response should contain "SHA-256"
    And the SCEP GetCACaps response should contain "SHA-1"
    And the SCEP GetCACaps response should contain "AES"
    And the SCEP GetCACaps response should contain "DES3"
    And the SCEP GetCACaps response should contain "SCEPStandard"

  Scenario: Get capabilities with cert-based renewal enabled
    Given I have a SCEP cert profile with config as "scep_profile"
      """
      { "challengePassword": "testpassword123", "allowCertBasedRenewal": true }
      """
    When I send a SCEP GetCACaps request for profile "scep_profile"
    Then the response status code should be "200"
    And the SCEP GetCACaps response should contain "Renewal"

  Scenario: Get capabilities with cert-based renewal disabled
    Given I have a SCEP cert profile with config as "scep_profile"
      """
      { "challengePassword": "testpassword123", "allowCertBasedRenewal": false }
      """
    When I send a SCEP GetCACaps request for profile "scep_profile"
    Then the response status code should be "200"
    And the SCEP GetCACaps response should not contain "Renewal"

  Scenario: Unsupported SCEP operation returns 400
    Given I have a SCEP cert profile with challenge password "testpassword123" as "scep_profile"
    When I send a SCEP request with unsupported operation "BadOperation" for profile "scep_profile"
    Then the response status code should be "400"
