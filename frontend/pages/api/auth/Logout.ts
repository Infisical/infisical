import SecurityClient from '~/utilities/SecurityClient';

/**
 * This route logs the user out. Note: the user should authorized to do this.
 * We first try to log out - if the authorization fails (response.status = 401), we refetch the new token, and then retry
 */
const logout = async () => {
  return SecurityClient.fetchCall('/api/v1/auth/logout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include'
  }).then((res) => {
    if (res?.status == 200) {
      SecurityClient.setToken('');
      // Delete the cookie by not setting a value; Alternatively clear the local storage
      localStorage.setItem('publicKey', '');
      localStorage.setItem('encryptedPrivateKey', '');
      localStorage.setItem('iv', '');
      localStorage.setItem('tag', '');
      localStorage.setItem('PRIVATE_KEY', '');
      console.log('User logged out', res);
      return res;
    } else {
      console.log('Failed to log out');
    }
  });
};

export default logout;
