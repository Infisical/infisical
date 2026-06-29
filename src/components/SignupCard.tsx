import React from 'react';
import { Card, Button } from 'react-bootstrap';

interface SignupCardProps {
  // Add props if needed
}

const SignupCard: React.FC<SignupCardProps> = () => {
  return (
    <Card style={{ width: '100%', maxWidth: '400px' }}>
      <Card.Body>
        <Card.Title>Signup</Card.Title>
        <Card.Text>
          // Add text if needed
        </Card.Text>
        <Button variant="primary" style={{ width: '100%' }}>
          Signup
        </Button>
      </Card.Body>
    </Card>
  );
};

export default SignupCard;