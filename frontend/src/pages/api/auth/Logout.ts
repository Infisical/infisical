import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This route logs the user out. Note: the user should authorized to do this.
 * We first try to log out - if the authorization fails (response.status = 401), we refetch the new token, and then retry
 */
const logout = async () => {
  try {
    const res = await SecurityClient.fetchCall('/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    if (res?.status === 200) {
      SecurityClient.setToken('');
      // Delete the cookie by not setting a value; Alternatively clear the local storage
      localStorage.removeItem('protectedKey');
      localStorage.removeItem('protectedKeyIV');
      localStorage.removeItem('protectedKeyTag');
      localStorage.removeItem('publicKey');
      localStorage.removeItem('encryptedPrivateKey');
      localStorage.removeItem('iv');
      localStorage.removeItem('tag');
      localStorage.removeItem('PRIVATE_KEY');
      localStorage.removeItem('orgData.id');
      localStorage.removeItem('projectData.id');

      return res;
    }

  } catch (error) {
    console.log('Error logging out', error);
  }

  return undefined;
};

export default logout;
