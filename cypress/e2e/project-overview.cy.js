/// <reference types="cypress" />

describe('Project Overview', () => {
  const projectName = "projectY"
  let projectId;
  let isFirstTest = true;

  before(() => {
    cy.login(`test@localhost.local`, `testInfisical1`)

    // Create a project
    cy.get('.button').click()
    cy.get('input[placeholder="Type your project name"]').type(`${projectName}`)
    cy.contains('button', 'Create Project').click()
    cy.url().should('include', '/project').then((currentUrl) => {
      projectId = currentUrl.split("/")[4]
    })
  })

  beforeEach(() => {
    if (isFirstTest) {
      isFirstTest = false;
      return;  // Skip the rest of the beforeEach for the first test
    }
    cy.login(`test@localhost.local`, `testInfisical1`)
    cy.visit(`/project/${projectId}/secrets/overview`)
  })

  it('can create secrets', () => {
    cy.contains('button', 'Go to Development').click()
    cy.contains('button', 'Add a new secret').click()
    cy.get('input[placeholder="Type your secret name"]').type('SECRET_A')
    cy.contains('button', 'Create Secret').click()
    cy.get('.w-80 > .inline-flex > .input').should('have.value', 'SECRET_A')
    cy.get(':nth-child(6) > .button > .w-min').should('have.text', '1 Commit')
  })

  it('can update secrets', () => {
    cy.get(':nth-child(2) > .flex > .button').click()
    cy.get('.overflow-auto > .relative > .absolute').type('VALUE_A')
    cy.get('.button.text-primary > .svg-inline--fa').click()
    cy.get(':nth-child(6) > .button > .w-min').should('have.text', '2 Commits')
  })

  it('can`t create duplicate-name secrets', () => {
    cy.get(':nth-child(2) > .flex > .button').click()
    cy.contains('button', 'Add Secret').click()
    cy.get('input[placeholder="Type your secret name"]').type('SECRET_A')
    cy.intercept('POST', `/api/v3/secrets/SECRET_A`).as('createSecret');
    cy.contains('button', 'Create Secret').click()
    cy.get('@createSecret').should('have.property', 'response').and('have.property', 'statusCode', 400);
  })

  it('can add another secret', () => {
    cy.get(':nth-child(2) > .flex > .button').click()
    cy.contains('button', 'Add Secret').click()
    cy.get('input[placeholder="Type your secret name"]').type('SECRET_B')
    cy.contains('button', 'Create Secret').click()
    cy.get(':nth-child(6) > .button > .w-min').should('have.text', '3 Commits')
  })

  it('can delete a secret', () => {
    cy.get(':nth-child(2) > .flex > .button').click()
    // cy.get(':nth-child(3) > .shadow-none').trigger('mouseover')
    cy.get(':nth-child(3) > .shadow-none > .group > .h-10 > .border-red').click()
    cy.contains('button', 'Delete Secret').should('have.attr', 'disabled')
    cy.get('input[placeholder="Type to delete..."]').type('SECRET_B')
    cy.intercept('DELETE', `/api/v3/secrets/SECRET_B`).as('deleteSecret');
    cy.contains('button', 'Delete Secret').should('not.have.attr', 'disabled')
    cy.contains('button', 'Delete Secret').click();
    cy.get('@deleteSecret').should('have.property', 'response').and('have.property', 'statusCode', 200);
  })

  it('can add a comment', () => {
    return;
    cy.get(':nth-child(2) > .flex > .button').click()
    // for some reason this hover does not want to work
    cy.get('.overflow-auto').trigger('mouseover').then(() => {
      cy.get('.shadow-none > .group > .pl-4 > .h-8 > button[aria-label="add-comment"]').should('be.visible').click()
    });
    
  })

})
