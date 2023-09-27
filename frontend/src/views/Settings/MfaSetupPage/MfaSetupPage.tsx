import React, { FC, useEffect,useState } from "react";

import { 
  Confetti,
  ModalStepIndicator,
  Step1ConfigureAuthenticatorApp, 
  Step2ShowMfaRecoveryCodes, 
  Step3MfaEnabled} from "./components";

export const MfaSetupPage: FC = () => {
  const [activeStep, setActiveStep] = useState(1);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (activeStep === 3) {
      setShowConfetti(true);

      const confettiTimeout = setTimeout(() => {
        setShowConfetti(false);
      }, 30000);

      return () => {
        clearTimeout(confettiTimeout);
      };
    }

    return undefined;
  }, [activeStep]);

  return (
    <div className="flex justify-center text-white w-full p-4">
        <div className="max-w-screen-md">
          <div className="mt-6 mb-6 text-center">
            <p className="text-3xl font-semibold text-gray-200">
              Configure multi-factor authentication (MFA)
            </p>
          </div>
          <div className="flex items-center justify-center space-x-2 p-4">
            <ModalStepIndicator 
            stepNumber="1"
            active={activeStep === 1}
            done={activeStep > 1} 
            />
            <ModalStepIndicator
              stepNumber="2"
              active={activeStep === 2}
              done={activeStep > 2} 
            />
            <ModalStepIndicator
              stepNumber="3"
              active={activeStep === 3}
            />
          </div>
          {activeStep === 1 && (
            <section>
              <Step1ConfigureAuthenticatorApp onSuccess={() => setActiveStep(2)} />
            </section>
          )}
          {activeStep === 2 && (
            <section>
              <Step2ShowMfaRecoveryCodes onSuccess={() => setActiveStep(3)} />
            </section>
          )}
          {activeStep === 3 && (
            <section>
              {showConfetti && (
              <Confetti/>
              )}
              <Step3MfaEnabled />
            </section>
          )}
        </div>
      </div>
  );
};
