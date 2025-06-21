const express = require('express');
const multer = require('multer');
const Papa = require('papaparse');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
const getWorkerToken = require('./get-worker-token'); // Import the function

const app = express();
const upload = multer({ dest: 'uploads/' });

// Remove hardcoded PINGONE_ENV_ID
// const PINGONE_ENV_ID = '7853c888-ad7d-470c-add6-597397698767';

app.use(cors());

app.post('/import-users', upload.single('csv'), (req, res) => {
  const filePath = req.file.path;
  const environmentId = req.body.environmentId;
  const clientId = req.body.clientId;
  const clientSecret = req.body.clientSecret;
  if (!environmentId || !clientId || !clientSecret) {
    res.status(400).json({ error: 'Missing required PingOne credentials.' });
    return;
  }
  fs.readFile(filePath, 'utf8', async (err, csvData) => {
    if (err) {
      res.status(500).json({ error: 'Error reading CSV file' });
      return;
    }
    Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
      complete: async function(results) {
        const report = [];
        let accessToken;
        try {
          accessToken = await getWorkerToken(environmentId, clientId, clientSecret);
          // Send progress update to client
          if (res.write) {
            res.write(JSON.stringify({ progress: 'got_worker_token' }) + '\n');
          }
          // Notify frontend that user import is starting
          if (res.write) {
            res.write(JSON.stringify({ progress: 'importing_users' }) + '\n');
          }
        } catch (tokenErr) {
          res.status(500).json({ error: 'Failed to get worker token' });
          return;
        }
        let importedCount = 0;
        for (const user of results.data) {
          const data = {
            username: user.username,
            email: user.email,
            population: { id: user.populationId },
            name: {
              given: user.firstName,
              family: user.lastName
            }
          };
          // Optional fields
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
          if (user.primaryPhone) phoneNumbers.push({ type: 'primary', value: user.primaryPhone });
          if (user.mobilePhone) phoneNumbers.push({ type: 'mobile', value: user.mobilePhone });
          if (phoneNumbers.length > 0) data.phoneNumbers = phoneNumbers;
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
            await axios.post(
              `https://api.pingone.com/v1/environments/${environmentId}/users`,
              data,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            report.push({ username: user.username, status: 'created' });
          } catch (err) {
            // console.error('Failed to create user:', err.response ? err.response.data : err.message);
            report.push({
              username: user.username,
              status: 'error',
              error: err.response?.data || err.message
            });
          }
          importedCount++;
          if (importedCount % 5 === 0) {
            if (res.write) {
              res.write(JSON.stringify({ progress: 'importing_users', imported: importedCount }) + '\n');
            }
          }
        }
        fs.unlinkSync(filePath); // Clean up uploaded file
        res.write(JSON.stringify(report) + '\n');
        res.end();
      }
    });
  });
});

// Delete a user by username from users.csv
app.delete('/users/:username', (req, res) => {
  const usernameToDelete = req.params.username;
  fs.readFile('users.csv', 'utf8', (err, csvData) => {
    if (err) {
      res.status(500).json({ error: 'Error reading CSV file' });
      return;
    }
    const lines = csvData.split('\n');
    if (lines.length < 2) {
      res.status(404).json({ error: 'No users found' });
      return;
    }
    const header = lines[0];
    const filtered = lines.filter((line, idx) => {
      if (idx === 0 || !line.trim()) return true; // keep header and skip empty
      const cols = line.split(',');
      return cols[0] !== usernameToDelete;
    });
    if (filtered.length === lines.length) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    fs.writeFile('users.csv', filtered.join('\n'), 'utf8', (err) => {
      if (err) {
        res.status(500).json({ error: 'Error writing CSV file' });
        return;
      }
      res.json({ success: true });
    });
  });
});

// Delete all users from users.csv (keep header)
app.delete('/users', (req, res) => {
  fs.readFile('users.csv', 'utf8', (err, csvData) => {
    if (err) {
      res.status(500).json({ error: 'Error reading CSV file' });
      return;
    }
    const lines = csvData.split('\n');
    if (lines.length === 0) {
      res.status(404).json({ error: 'CSV file is empty' });
      return;
    }
    const header = lines[0];
    fs.writeFile('users.csv', header + '\n', 'utf8', (err) => {
      if (err) {
        res.status(500).json({ error: 'Error writing CSV file' });
        return;
      }
      res.json({ success: true });
    });
  });
});

app.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
});