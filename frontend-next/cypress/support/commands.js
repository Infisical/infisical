
Cypress.Commands.add('login', (username, password) => {
    cy.visit('/login')
    cy.get('input[placeholder="Enter your email..."]').type(username)
    cy.get('input[placeholder="Enter your password..."]').type(password)
    cy.contains('Continue with Email').click()
    cy.url().should('include', '/overview')
})

// Cypress.Commands.add('login', (username, password) => {
//     cy.session([username, password], () => {
//         cy.visit('/login')
//         cy.get('input[placeholder="Enter your email..."]').type(username)
//         cy.get('input[placeholder="Enter your password..."]').type(password)
//         cy.contains('Continue with Email').click()
//         cy.url().should('include', '/overview')
//         cy.wait(2000);
//     })
// })
