/// <reference types="cypress" />

describe('Organization Settings', () => {
  let orgId; 

  beforeEach(() => {
    cy.login(`test@localhost.local`, `testInfisical1`)
    cy.url().then((currentUrl) => {
      orgId = currentUrl.split("/")[4]
      cy.visit(`org/${orgId}/settings`)
    })
  })

  it('can rename org', () => {
    cy.get('input[placeholder="Acme Corp"]').clear().type('ABC')

    cy.intercept('PATCH', `/api/v1/organization/${orgId}/name`).as('renameOrg');
    cy.get('form.p-4 > .button').click()
    cy.get('@renameOrg').should('have.property', 'response').and('have.property', 'statusCode', 200);
    
    cy.get('.pl-3').should("have.text", "ABC ")
  })

})
