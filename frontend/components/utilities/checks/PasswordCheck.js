/**
 * This function checks a user password with respect to some criteria.
 * @param {*} password
 * @param {*} setPasswordError
 * @param {*} setPasswordErrorMessage
 * @param {*} currentErrorCheck
 * @returns
 */
const passwordCheck = (
	password,
	setPasswordErrorLength,
	setPasswordErrorNumber,
	setPasswordErrorLowerCase,
	currentErrorCheck
) => {
	let errorCheck = currentErrorCheck;
	if (!password || password.length < 14) {
		setPasswordErrorLength(true);
		errorCheck = true;
	} else {
		setPasswordErrorLength(false);
	}
	
	if (!/\d/.test(password)) {
		setPasswordErrorNumber(true);
		errorCheck = true;
	} else {
		setPasswordErrorNumber(false);
	}
	
	if (!/[a-z]/.test(password)) {
		setPasswordErrorLowerCase(true);
		errorCheck = true;
		// } else if (/(.)(?:(?!\1).){1,2}/.test(password)) {
		// 	console.log(111)
		// 	setPasswordError(true);
		// 	setPasswordErrorMessage("Password should not contain repeating characters.");
		// 	errorCheck = true;
		// } else if (RegExp(`[${email}]`).test(password)) {
		// 	console.log(222)
		// 	setPasswordError(true);
		// 	setPasswordErrorMessage("Password should not contain your email.");
		// 	errorCheck = true;
	} else {
		setPasswordErrorLowerCase(false);
	}
	
	// if (!/[A-Z]/.test(password)) {
	// 	setPasswordErrorUpperCase(true);
	// 	errorCheck = true;
	// } else {
	// 	setPasswordErrorUpperCase(false);
	// }
	
	// if (!/(?=.*[!@#$%^&*])/.test(password)) {
	// 	setPasswordErrorSpecialChar(true);
	// 		// "Please add at least 1 special character (*, !, #, %)."
	// 	errorCheck = true;
	// } else {
	// 	setPasswordErrorSpecialChar(false);
	// }
	return errorCheck;
};

export default passwordCheck;
