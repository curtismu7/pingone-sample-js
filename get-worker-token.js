const axios = require('axios');

// Remove hardcoded values
// const PINGONE_ENV_ID = '7853c888-ad7d-470c-add6-597397698767';
// const CLIENT_ID = '83b39696-7c9d-4012-b9b2-8b4bfc9327ac';
// const CLIENT_SECRET = '4xdT108XeW1c64I08sqQC2pJZA1-25kRsY1tRDXAnpGjAIztbtkPye_.9Xiqz6xf';

async function getWorkerToken(environmentId, clientId, clientSecret) {
  const tokenUrl = `https://auth.pingone.com/${environmentId}/as/token`;
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  // Add required scopes for your use case, e.g. 'p1:admin:user:read p1:admin:user:write'
  params.append('scope', 'p1:admin:user:read p1:admin:user:write');

  try {
    const response = await axios.post(tokenUrl, params, {
      auth: {
        username: clientId,
        password: clientSecret
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    // console.log('Access Token:', response.data.access_token);
    return response.data.access_token;
  } catch (error) {
    console.error('Failed to get worker token:', error.response ? error.response.data : error.message);
    throw error;
  }
}

module.exports = getWorkerToken;