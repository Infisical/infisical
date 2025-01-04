/// <reference types="cypress" />

describe('organization Overview', () => {
  beforeEach(() => {
    cy.login(`test@localhost.local`, `testInfisical1`)
  })

  const projectName = "projectY"

  it('can`t create projects with empty names', () => {
    cy.get('.button').click()
    cy.get('input[placeholder="Type your project name"]').type('abc').clear()
    cy.intercept('*').as('anyRequest');
    cy.get('@anyRequest').should('not.exist');
  })

  it('can delete a newly-created project', () => {
    // Create a project
    cy.get('.button').click()
    cy.get('input[placeholder="Type your project name"]').type(`${projectName}`)
    cy.contains('button', 'Create Project').click()
    cy.url().should('include', '/project')

    // Delete a project
    cy.get(`[href^="/project/"][href$="/settings"] > a > .group`).click()
    cy.contains('button', `Delete ${projectName}`).click()
    cy.contains('button', 'Delete Project').should('have.attr', 'disabled')
    cy.get('input[placeholder="Type to delete..."]').type('confirm')
    cy.contains('button', 'Delete Project').should('not.have.attr', 'disabled')
    cy.url().then((currentUrl) => {
      let projectId = currentUrl.split("/")[4]
      cy.intercept('DELETE', `/api/v1/workspace/${projectId}`).as('deleteProject');
      cy.contains('button', 'Delete Project').click();
      cy.get('@deleteProject').should('have.property', 'response').and('have.property', 'statusCode', 200);
    })
  })  

  it('can display no projects', () => {
    cy.intercept('/api/v1/workspace', {
      body: {
        "workspaces": []
      },
    })
    cy.get('.border-mineshaft-700 > :nth-child(2)').should('have.text', 'You are not part of any projects in this organization yet. When you are, they will appear here.')
  })

})
