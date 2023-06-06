type Errors = {
    length?: string,
    upperCase?: string,
    lowerCase?: string,
    number?: string,
    specialChar?: string,
    repeatedChar?: string,
  };

interface CheckPasswordParams {
    password: string;
    setErrors: (value: Errors) => void;
}

/**
 * Validate that the password [password] is at least:
 * - 8 characters long
 * - Contains 1 uppercase character (A-Z)
 * - Contains 1 lowercase character (a-z)
 * - Contains 1 number (0-9)
 * - Does not contain 3 repeat, consecutive characters
 * 
 * The function returns whether or not the password [password]
 * passes the minimum requirements above. It sets errors on 
 * an erorr object via [setErrors].
 * 
 * @param {Object} obj
 * @param {String} obj.password - the password to check
 * @param {Function} obj.setErrors - set state function to set error object
 */
const checkPassword = ({
    password,
    setErrors
}: CheckPasswordParams): boolean => {
    let errors: Errors = {}; 
    
    if (password.length < 8) {
        errors.length = "8 characters";
    }

    if (!/[A-Z]/.test(password)) {
        errors.upperCase = "1 uppercase character (A-Z)";
    }

    if (!/[a-z]/.test(password)) {
        errors.lowerCase = "1 lowercase character (a-z)";
    }

    if (!/[0-9]/.test(password)) {
        errors.number = "1 number (0-9)";
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        errors.specialChar = "1 special character (!@#$%^&*(),.?)";
    }

    if (/([A-Za-z0-9])\1\1\1/.test(password)) {
        errors.repeatedChar = "No 3 repeat, consecutive characters";
    }
    
    setErrors(errors);
    return Object.keys(errors).length > 0;
}

export default checkPassword;