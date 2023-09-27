import { useEffect, useState } from "react";
import { faAt, faQrcode, faScroll } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";
import { MfaMethod } from "@app/hooks/api/users/types";

type Props = {
    setStep: (step: number) => void;
}

export const MfaSelectionStep = ({
    setStep
    }: Props) => {
    const [mfaMethods, setMfaMethods] = useState<MfaMethod[]>([]);

    useEffect(() => {
        const storedMfaMethods = localStorage.getItem("mfaMethods");
        if (storedMfaMethods) {
        setMfaMethods(JSON.parse(storedMfaMethods));
        }
    }, []);       

    return (
        <div className="flex flex-col mx-auto w-full justify-center items-center">
            <div>
                <form>
                    <h1 className='text-xl font-medium text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200 text-center mb-8' >Your MFA methods</h1>
                        {mfaMethods.includes(MfaMethod.EMAIL) && (
                        <div className='lg:w-1/6 w-1/4 min-w-[21.2rem] md:min-w-[20.1rem] text-center rounded-md mt-4'>
                            <Button 
                                type="button"
                                colorSchema="primary" 
                                variant="outline_bg"
                                className="h-11 w-full mx-0"
                                onClick={() => setStep(3)}
                                leftIcon={<FontAwesomeIcon icon={faAt} className="mr-2" />}
                            >   
                                Complete with email
                            </Button>
                        </div>
                        )}
                        {mfaMethods.includes(MfaMethod.AUTH_APP) && (
                        <div className='lg:w-1/6 w-1/4 min-w-[21.2rem] md:min-w-[20.1rem] text-center rounded-md mt-4'>
                            <Button 
                                type="button"
                                colorSchema="primary" 
                                variant="outline_bg"
                                className="h-11 w-full mx-0"
                                onClick={() => setStep(4)}
                                leftIcon={<FontAwesomeIcon icon={faQrcode} className="mr-2" />}
                            >   
                                Complete with authenticator app
                            </Button>
                        </div>
                        )}
                        {mfaMethods.includes(MfaMethod.MFA_RECOVERY_CODES) && (
                        <div className='lg:w-1/6 w-1/4 min-w-[21.2rem] md:min-w-[20.1rem] text-center rounded-md mt-4'>
                            <Button 
                                type="button"
                                colorSchema="primary" 
                                variant="outline_bg"
                                className="h-11 w-full mx-0"
                                onClick={() => setStep(6)}
                                leftIcon={<FontAwesomeIcon icon={faScroll} className="mr-2" />}
                            >   
                                Complete with an MFA recovery code
                            </Button>
                        </div>
                        )}
                        <div className='lg:w-1/6 w-1/4 min-w-[20rem] flex flex-row items-center my-4 py-2'>
                            <div className='w-full border-t border-mineshaft-400/60' /> 
                            <span className="mx-2 text-mineshaft-200 text-xs">or</span>
                            <div className='w-full border-t border-mineshaft-400/60' />
                        </div>
                        <div className='lg:w-1/6 w-1/4 min-w-[21.2rem] md:min-w-[20.1rem] text-center rounded-md mt-4'>
                            <Button 
                                type="button"
                                colorSchema="primary" 
                                variant="outline_bg" 
                                className="text-bunker-300 text-sm hover:underline mt-2 hover:underline-offset-4 hover:decoration-primary-700 hover:text-bunker-200 duration-200 cursor-pointer"
                                onClick={() => setStep(0)}
                            >
                                Back to login page
                            </Button>
                        </div>
                </form>
            </div>
    </div>
    )
}
