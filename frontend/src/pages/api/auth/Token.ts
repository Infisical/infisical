const token = async () =>
  fetch('/api/v1/auth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include'
  }).then(async (res) => {
    if (res.status === 200) {
      return (await res.json()).token;
    }
    console.log('Getting a new token failed');
    return undefined;
  });

export default token;
