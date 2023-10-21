// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })

Cypress.Commands.add('login', (username, password) => {
    cy.visit('/login')
    cy.get('input[placeholder="Enter your email..."]').type(username)
    cy.get('input[placeholder="Enter your password..."]').type(password)
    cy.contains('Continue with Email').click()
    cy.url().should('include', '/overview')

    // Need to make this work for CSRF tokens; Cypress has an example in the docs
    // cy.session(
    //     username,
    //     () => {
    //         cy.visit('/login')
    //         cy.get('input[placeholder="Enter your email..."]').type(username)
    //         cy.get('input[placeholder="Enter your password..."]').type(password)
    //         cy.contains('Continue with Email').click()
    //         cy.url().should('include', '/overview')
    //     },
    //     {
    //       validate: () => {
    //         cy.getCookie('jid').should('exist')
    //       },
    //     }
    //   )
})

