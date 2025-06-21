const fs = require('fs');
const Papa = require('papaparse');
const axios = require('axios');

// Replace with your actual PingOne environment ID and admin access token
const PINGONE_ENV_ID = '7853c888-ad7d-470c-add6-597397698767';
const ACCESS_TOKEN = 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImRlZmF1bHQifQ.eyJjbGllbnRfaWQiOiI4M2IzOTY5Ni03YzlkLTQwMTItYjliMi04YjRiZmM5MzI3YWMiLCJpc3MiOiJodHRwczovL2F1dGgucGluZ29uZS5jb20vNzg1M2M4ODgtYWQ3ZC00NzBjLWFkZDYtNTk3Mzk3Njk4NzY3L2FzIiwianRpIjoiNDY5ZDg4ZjAtZWRjZC00NTg2LWJhOWYtNGZmYTExYWE5NjViIiwiaWF0IjoxNzUwMzMxMTIzLCJleHAiOjE3NTAzMzQ3MjMsImF1ZCI6WyJodHRwczovL2FwaS5waW5nb25lLmNvbSJdLCJlbnYiOiI3ODUzYzg4OC1hZDdkLTQ3MGMtYWRkNi01OTczOTc2OTg3NjciLCJvcmciOiI5N2JhNDRmMi1mN2VlLTQxNDQtYWE5NS05ZTYzNmI1N2MwOTYiLCJwMS5yaWQiOiI0NjlkODhmMC1lZGNkLTQ1ODYtYmE5Zi00ZmZhMTFhYTk2NWIifQ.Bji0fRTfRS3sGeP4VLV2ksxQQfyaWk2NqYUUZPPh6TDKMylayK5-AKVOLr_CxmYecF8aVG0f3Vvwa9BVq9x_Re2HHhpxIfPZo8HgujWIWya_tIvw--xkk_bCeVzw46kXeI_05u_RrQThn10WoGO1rPxg2ak3HJthK6o5YY94BXUrFMcLGWGRI4ctazXvNopXvKCCJSFX118LpdHSPHsT1FcoMT1MlkJ9UT4-u0ACfaWnKZ-14DWgSM1HUVACpKsqTQDEOmEVA1FtI4sWYfXhsP8M63bB2E6-YwqMVLDpBuLEHpCugKlLLQVfsIjOoB5q1AZioAu11is3DdMgf2n8Iw'; // Must have user:create scope

async function createUser(user) {
  const url = `https://api.pingone.com/v1/environments/${PINGONE_ENV_ID}/users`;
  const data = {
    username: user.username,
    email: user.email,
    population: { id: user.populationId },
    name: {
      given: user.firstName,
      family: user.lastName
    },
  };
  // Optional fields for name
  if (user.middleName) data.name.middle = user.middleName;
  if (user.prefix) data.name.prefix = user.prefix;
  if (user.suffix) data.name.suffix = user.suffix;
  if (user.formattedName) data.name.formatted = user.formattedName;
  if (user.title) data.title = user.title;
  if (user.preferredLanguage) data.preferredLanguage = user.preferredLanguage;
  if (user.locale) data.locale = user.locale;
  if (user.timezone) data.timezone = user.timezone;
  if (user.externalId) data.externalId = user.externalId;
  if (user.type) data.type = user.type;
  if (user.active !== undefined && user.active !== "") data.active = user.active === 'true';
  if (user.nickname) data.nickname = user.nickname;
  if (user.password) data.password = user.password;

  // Phone numbers
  const phoneNumbers = [];
  if (user.primaryPhone) {
    phoneNumbers.push({ type: 'primary', value: user.primaryPhone });
  }
  if (user.mobilePhone) {
    phoneNumbers.push({ type: 'mobile', value: user.mobilePhone });
  }
  if (phoneNumbers.length > 0) {
    data.phoneNumbers = phoneNumbers;
  }

  // Address
  if (user.streetAddress || user.countryCode || user.locality || user.region || user.postalCode) {
    data.address = {};
    if (user.streetAddress) data.address.streetAddress = user.streetAddress;
    if (user.countryCode) data.address.country = user.countryCode;
    if (user.locality) data.address.locality = user.locality;
    if (user.region) data.address.region = user.region;
    if (user.postalCode) data.address.postalCode = user.postalCode;
  }

  try {
    await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`User ${user.username} created.`);
  } catch (err) {
    if (err.response) {
      console.error(`Failed to create user ${user.username}:`, err.response.data);
    } else {
      console.error(`Failed to create user ${user.username}:`, err.message);
    }
  }
}

fs.readFile('users.csv', 'utf8', (err, csvData) => {
  if (err) {
    console.error('Error reading CSV file:', err.message);
    return;
  }
  Papa.parse(csvData, {
    header: true,
    skipEmptyLines: true,
    complete: async function(results) {
      for (const user of results.data) {
        await createUser(user);
      }
      console.log('Import complete!');
    }
  });
}); 