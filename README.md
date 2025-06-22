# DEPRECATED

# OIDC Authentication JavaScript Sample Guide
The PingOne Authentication Sample is built on top of [OpenID Connect/OAuth 2 API endpoints](https://apidocs.pingidentity.com/pingone/platform/v1/api/) to give 
you a basic overview how invoke PingOne's OIDC protocol to authenticate an existing user. 
This example shows you how to 
use [@ping-identity/p14c-js-sdk-auth](https://www.npmjs.com/package/@ping-identity/p14c-js-sdk-auth) library to login a user to your JavaScript application through the [implicit flow](https://openid.net/specs/openid-connect-implicit-1_0.html), where the user is redirected to the PingOne hosted login page.  
After the successful authentication the user is redirected back to the application with an ID and access token.
For more information check out [OpenID Connect 1.0 Specifications](https://openid.net/developers/specs/).


#### OAuth 2.0 vs OIDC
**OAuth 2.0** is not an authentication protocol, but OIDC is. <br />
* **OAuth 2.0** is about giving this delegated access for use in situations where the user is not present on the connection between the client and the resource being accessed.
The client application then becomes a consumer of the identity API. One major benefit of building authentication on top of authorization in this way is that it allows for management of end-user consent, which is very important in cross-domain identity federation at internet scale.
* **OIDC** tells an application who the current user is and whether or not they're present.

## Prerequisites
You will need the following things:
 
- PingOne Account  - If you don't have an existing one, please register it.
- An OpenID Connect Application, configured as a for `Single Page` app (SPA) type. Documentation for creating one can be found [here](https://docs.pingidentity.com/r/en-us/pingone/p1_add_app_worker).  Please ensure the following configuration items (which are also set in this example) are applied to the application in the admin console:
  - **Response Type** : `Token` and `ID Token`
  - **Grant Type** : `Implicit`
  - **Allowed Scopes** : `openid`, `profile`, `email` and `address`
  - **Redirect URI** : `http://localhost:8080` *(or set to your own environment)*
  - **Signoff URL** : `http://localhost:8080` *(or set to your own environment)*
- At least one user in the same environment as the application (not assigned)
- To have installed [Node.js](https://nodejs.org/en/download/)

## Getting Started
If you haven't already done so, sign up for your PingOne account and create a new Single Page application in "Connections" tab of admin console. You can begin a trial at [https://www.pingidentity.com/en/trials.html](https://www.pingidentity.com/en/trials.html)

### Building the Sample
```bash
git clone git@github.com:pingidentity/pingone-sample-js.git .
npm install && npm run-script build
```

### Running the Sample

1. Find the following SPA application configuration information from the admin console to fulfill the next step with it: **environment id**, **client id** and **redirect uri**
1. Update `PingOneAuthClient` in [auth.js](auth.js) with all previously extracted data:
```js
const authClient = new PingOneAuthClient({
  AUTH_URI: 'https://auth.pingone.com', // 'https://auth.pingone.eu', 'https://auth.pingone.ca' or 'https://auth.pingone.asia'
  API_URI: 'https://api.pingone.com', // 'https://api.pingone.eu', 'https://api.pingone.ca' or 'https://api.pingone.asia'
  environmentId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  clientId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  redirectUri: 'http://localhost:8080',
  postLogoutRedirectUri: 'http://localhost:8080',
  scopes: ['openid','profile', 'email', 'address'],
  responseType: ['token', 'id_token'],
  pkce: false
});
```
, where
- `AUTH_URI` : **Optional**. PingOne Authentication base endpoint. Default value:`https://auth.pingone.com`.  Accepted values are `https://auth.pingone.com`, `https://auth.pingone.eu`, `https://auth.pingone.ca`, and `https://auth.pingone.asia`

- `API_URI` : **Optional**. PingOne API base endpoint. Default value: `https://api.pingone.com`.  Accepted values are `https://api.pingone.com`, `https://api.pingone.eu`, `https://api.pingone.ca`, and `https://auth.pingone.asia`

- `environmentId`: **Required**. Your application's Environment ID. You can find this value at your Application's Settings under 
**Configuration** tab from the admin console( extract `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` string that specifies the environment 128-bit universally unique identifier ([UUID](https://tools.ietf.org/html/rfc4122)) right from `https://auth.pingone
.com/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/as/authorize` 
*AUTHORIZATION URL* ). Or from the *Settings* main menu (*ENVIRONMENT ID* variable)

- `clientId`: **Required**. Your application's client UUID. You can also find this value at Application's Settings right under the 
Application name.

- `redirectUri`: **Required**. The URL to which the PingOne will redirect the user's browser after authorization has been granted by 
the user. *REDIRECT URLS* values corresponds to this data. The Access and ID Token will be available in the hash fragment of this URL.

- `postLogoutRedirectUri`: **Optional**.. The URL to which the browser is redirected after a logout has been performed. *SIGNOFF URLS* values corresponds to this data. 

- `scopes`:  **Optional**. standard OIDC or PingOne custom scopes, separated by a space which you want to request authorization for.
 [PingOne platform scopes](https://apidocs.pingidentity.com/pingone/platform/v1/api/#access-services-through-scopes-and-roles) are configured under "Access" tab in PingOne Admin Console. Default value: `["openid"]`

- `responseType`: The type of credentials returned in the response: `token` - to get only an Access Token, `id_token` - to get only an ID Token (if you don't plan on accessing an API).

- `responseMode` :  **Optional**.  A string that specifies the mechanism for returning authorization response parameters from the authorization endpoint. If set to `pi.flow` value than the redirect_uri parameter is not required and authorization response parameters are encoded as a JSON object wrapped in a flow response and returned directly to the client with a 200 status.
Default value: not set. 

- `responseType` : **Optional**. An array of `["token", "id_token", "code"]`. Default value: `["token", "id_token"]`.

- `storage` :  **Optional**. Tokens storage type. Possible values are [`localStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage), [`sessionStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage), `cookieStorage`, `memoryStorage`. Default value: `localStorage`.
Window `localStorage` - data is stored and saved across browser sessions without expiration time. 
Window `sessionStorage` - data gets cleared when the page session ends(when the page is closed). 
`cookieStorage`, `memoryStorage`.

- `tokenRenew` :  **Optional**. Renew expired token either with refresh token (if `useRefreshTokens=true`) or using a hidden iframe. Default value: `true`.

- `useRefreshTokens`: **Optional**. Use refresh token to exchange for new access tokens instead of using a hidden iframe and `/oauth/token` endpoint call.   

- `pkce`: **Optional**. Use Authorization Code with Proof Key for Code Exchange (PKCE) flow for token retrieval.

- `cookies: {
           secure: true,
           sameSite: 'none'
       }` : **Optional**. Cookies storage configuration. 
       [`SameSite`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite) attribute allows you to declare if your cookie should be restricted to a first-party or same-site context.

- `max_age`: : **Optional**.  Integer that specifies the maximum amount of time allowed since the user last authenticated. If the `max_age` value is exceeded, the user must re-authenticate.

- `acr_values` : **Optional**. String  that designates whether the authentication request includes specified sign-on policies. Sign-on policy names should be listed in order of preference, and they must be assigned to the application. For more information, see [Sign-on policies](https://apidocs.pingidentity.com/pingone/platform/v1/api/#sign-on-policies)

1. Run
```bash
npm start
```
and browse to http://localhost:8080 

### Sample Code Explanation
These steps below describes on a high level what functionality is being shown in this code example.

1. Added the latest version of [@ping-identity/p14c-js-sdk-auth](https://www.npmjs.com/package/@ping-identity/p14c-js-sdk-auth) npm module to your [package.json](package.json):
```
"dependencies": {
    "@ping-identity/p14c-js-sdk-auth": "^1.0.0-pre.2"
  }
``` 
1. Parsed current URL and got possible (id and access) tokens after user is redirected back to this application.
```
authClient.parseRedirectUrl()
```
1. Got user data from [UserInfo Endpoint](https://openid.net/specs/openid-connect-implicit-1_0.html#UserInfo),
 after user successfully logged in :
```js
authClient.getUserInfo()
  .then(user => {
        document.getElementById('first_name_title').innerHTML = user['given_name'];
        document.getElementById('last_name_title').innerHTML = user['family_name'];
        document.getElementById('userInfoView').innerHTML = '<br><b>User Details</b><br>'
            + jsonIntoHtmlTable(user);
      });
```

Other functions included here: 
- `authClient.signIn();` function that redirects user to the Ping Identity Provider for authentication:
- `authClient.signOut()` function that just initiates end user logout via the OIDC signoff endpoint and clears the browser session.
 

### Developer Notes:
1. Following [Content Security Policy](https://www.owasp.org/index.php/Content_Security_Policy_Cheat_Sheet#Refactoring_inline_code) all inline code preferable should be moved to a 
separate JavaScript file on production.
1. Values like `state` and `nonce` are used within [@ping-identity/p14c-js-sdk-auth](https://www.npmjs.com/package/@ping-identity/p14c-js-sdk-auth) library to prevent CSRF and token replay attacks respectively.
Your application sends the `state` (randomly generated value) when starting an authentication request and validate the received value when processing the response. If you receive a response with a state that does not match the initially generated value,
 then you may be the target of an attack because this is either a response for an unsolicited request or someone trying to forge the response.
 Your application also sends the `state` parameter to maintain state between the logout request and the callback to the endpoint specified by the `post_logout_redirectUri query` parameter.
1. For styling the [shoelace CSS library](https://shoelace.style/) was used, and [http-server](https://www.npmjs.com/package/http-server) - as a command-line http server.

# Ping Identity User Management Application

A modern web application for managing users in PingOne environments with CSV import/export capabilities, built with Node.js, Express, and vanilla JavaScript.

## Features

### ✅ Core Functionality
- **CSV User Import**: Bulk import users from CSV files with progress tracking
- **User Management**: Create, modify, and delete users in PingOne environments
- **Token Caching**: Intelligent worker token caching for 55 minutes
- **Real-time Progress**: Live progress updates during import operations
- **Results Export**: Export import results to CSV format

### 🎨 User Interface
- **Ping Identity Branding**: Official Ping Identity colors and styling
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Modern UI**: Clean, professional interface with intuitive navigation
- **Drag & Drop**: Easy file upload with drag and drop support
- **Tooltips**: Helpful tooltips powered by Tippy.js

### 🌐 Internationalization
- **Multi-language Support**: English, Spanish, French, Portuguese, Chinese
- **Dynamic Language Switching**: Change language without page reload
- **Persistent Language Settings**: Language preference saved across sessions

### ⚙️ Settings Management
- **Credential Management**: Secure storage of PingOne credentials
- **Column Mapping**: Flexible CSV column mapping configuration
- **Token Status**: Real-time worker token validity monitoring
- **Default File**: Set and persist default CSV file selection
- **Pagination Control**: Configurable records per page

### 🔧 Technical Features
- **RESTful API**: Clean, well-documented API endpoints
- **Comprehensive Logging**: Structured logging with Winston
- **Error Handling**: Graceful error handling and user feedback
- **Security**: CORS protection and input validation
- **Testing**: Jest test suite for core functionality

## Project Structure

```
pingone-sample-js/
├── public/                     # Frontend assets
│   ├── css/
│   │   └── style.css          # Ping Identity branded styles
│   ├── js/
│   │   ├── utils.js           # Shared utilities (i18n, logging, etc.)
│   │   ├── main.js            # Main page functionality
│   │   └── settings.js        # Settings page functionality
│   ├── images/
│   │   └── logo.png           # Ping Identity logo
│   ├── index.html             # Main application page
│   └── settings.html          # Settings page
├── server/                     # Backend server
│   ├── routes/
│   │   ├── token.js           # Worker token management
│   │   ├── import.js          # CSV import functionality
│   │   ├── modify.js          # User modification
│   │   └── delete.js          # User deletion
│   ├── utils/
│   │   └── logger.js          # Winston logging configuration
│   └── app.js                 # Express server setup
├── locales/                    # Internationalization
│   ├── en.json               # English translations
│   ├── es.json               # Spanish translations
│   ├── fr.json               # French translations
│   ├── pt.json               # Portuguese translations
│   └── zh.json               # Chinese translations
├── tests/                      # Test files
│   ├── token.test.js         # Token management tests
│   ├── import.test.js        # Import functionality tests
│   ├── modify.test.js        # User modification tests
│   └── delete.test.js        # User deletion tests
├── logs/                       # Application logs (auto-created)
├── uploads/                    # Temporary file uploads (auto-created)
├── package.json               # Dependencies and scripts
└── README.md                  # This file
```

## Prerequisites

- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **PingOne Environment** with:
  - Environment ID
  - Client ID
  - Client Secret
  - User population configured

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd pingone-sample-js
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Access the application**
   Open your browser and navigate to `http://localhost:3001`

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Logging
LOG_LEVEL=info

# CORS (for production)
ALLOWED_ORIGINS=https://yourdomain.com
```

### PingOne Setup

1. **Create a PingOne Environment** (if you don't have one)
2. **Create a Client Application** with the following settings:
   - Grant Type: Client Credentials
   - Scopes: User Management (or appropriate scopes)
3. **Note your credentials**:
   - Environment ID
   - Client ID
   - Client Secret

## Usage

### First Time Setup

1. **Navigate to Settings**
   - Click the "Settings" link in the left navigation
   - Enter your PingOne credentials
   - Test the credentials using the "Test Credentials" button
   - Save your settings

2. **Configure Column Mapping**
   - Upload a sample CSV file
   - Map CSV columns to PingOne user fields
   - Save the mapping configuration

### Importing Users

1. **Prepare CSV File**
   - Ensure your CSV has the required columns (username, email, firstName, lastName, populationId)
   - Optional columns: middleName, title, phone numbers, address, etc.

2. **Upload and Import**
   - Go to the main page
   - Drag and drop or select your CSV file
   - Click "Import Users"
   - Monitor progress in real-time
   - Review results and export if needed

### CSV Format

**Required Columns:**
- `username` - User's login name
- `email` - User's email address
- `firstName` - User's first name
- `lastName` - User's last name
- `populationId` - PingOne population ID

**Optional Columns:**
- `middleName` - User's middle name
- `title` - User's title (Mr., Dr., etc.)
- `preferredLanguage` - Language preference (en, es, fr, etc.)
- `timezone` - User's timezone
- `active` - Account status (true/false)
- `primaryPhone` - Primary phone number
- `mobilePhone` - Mobile phone number
- `streetAddress` - Street address
- `countryCode` - Country code
- `locality` - City
- `region` - State/Province
- `postalCode` - ZIP/Postal code

**Example CSV:**
```csv
username,email,firstName,lastName,populationId,title,active
john.doe,john@example.com,John,Doe,pop-123,Mr.,true
jane.smith,jane@example.com,Jane,Smith,pop-123,Ms.,true
```

## API Endpoints

### Authentication
- `POST /api/token` - Get worker token
- `GET /api/token/status` - Check token status
- `DELETE /api/token` - Clear token cache

### User Management
- `POST /api/import` - Import users from CSV
- `POST /api/import/user` - Import single user
- `PUT /api/modify/user/:userId` - Update user
- `PATCH /api/modify/user/:userId` - Partially update user
- `DELETE /api/delete/user/:userId` - Delete user
- `POST /api/delete/bulk` - Bulk delete users

### System
- `GET /api/health` - Health check
- `POST /api/log` - Client-side logging

## Development

### Running Tests
```bash
npm test
```

### Building for Production
```bash
npm run build
```

### Development Mode
```bash
npm run dev
```

## Security Considerations

- **Credentials**: Client secrets are stored in browser localStorage (consider server-side storage for production)
- **CORS**: Configure allowed origins for production deployment
- **File Uploads**: CSV files are temporarily stored and automatically cleaned up
- **Token Caching**: Tokens are cached in memory (consider Redis for production)

## Troubleshooting

### Common Issues

1. **"Invalid credentials" error**
   - Verify your PingOne environment ID, client ID, and client secret
   - Ensure your client application has the correct scopes
   - Check that your PingOne environment is active

2. **CSV import fails**
   - Verify CSV format and required columns
   - Check that population ID exists in your PingOne environment
   - Ensure usernames and emails are unique

3. **Token expires frequently**
   - Tokens are cached for 55 minutes by default
   - Check network connectivity to PingOne APIs
   - Verify your client application settings

### Logs

Application logs are stored in the `logs/` directory:
- `combined.log` - All application logs
- `error.log` - Error-level logs only

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
- Check the troubleshooting section above
- Review the application logs
- Create an issue in the repository
- Contact PingOne support for PingOne-specific issues

## Changelog

### v1.0.0
- Initial release
- CSV user import functionality
- Multi-language support
- Ping Identity branding
- Token caching
- Comprehensive logging
- Test suite

## Versioning and Releases

This project uses [Semantic Versioning](https://semver.org/) (SemVer) for version management. Each release is tagged in Git and automatically creates a GitHub release with assets.

### Version Format
- **MAJOR.MINOR.PATCH** (e.g., 1.0.0)
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Creating a New Release

#### Option 1: Using npm scripts (Recommended)
```bash
# Patch release (bug fixes)
npm run version:patch

# Minor release (new features)
npm run version:minor

# Major release (breaking changes)
npm run version:major

# Full release with build
npm run release
```

#### Option 2: Using the version script
```bash
# Patch release
node scripts/version.js patch

# Minor release
node scripts/version.js minor

# Major release
node scripts/version.js major
```

#### Option 3: Manual process
```bash
# 1. Update version in package.json
npm version patch|minor|major

# 2. Create and push tag
git tag -a v1.0.1 -m "Release version 1.0.1"
git push origin master
git push --tags

# 3. Create GitHub release manually
```

### Automated Release Process

When you push a tag starting with `v` (e.g., `v1.0.1`), GitHub Actions will automatically:

1. ✅ Build the project
2. ✅ Create a GitHub release
3. ✅ Upload release assets:
   - `p14c-js-sdk-auth.js` (built SDK)
   - `source-code.zip` (complete source code)

### Recovering Old Releases

#### From GitHub Releases
1. Go to [Releases page](https://github.com/curtismu7/pingone-sample-js/releases)
2. Click on any version number
3. Download the `source-code.zip` file
4. Extract and use the code from that specific version

#### From Git Tags
```bash
# List all available versions
git tag -l

# Checkout a specific version
git checkout v1.0.0

# Create a new branch from an old version
git checkout -b hotfix-branch v1.0.0

# Download a specific version as ZIP
git archive --format=zip --output=v1.0.0.zip v1.0.0
```

#### From npm (if published)
```bash
# Install a specific version
npm install pingone-user-management@1.0.0
```

### Release Assets

Each release includes:
- 📦 **Source Code**: Complete project files
- 🔧 **Built SDK**: Pre-compiled PingOne SDK
- 📋 **Changelog**: Detailed change history
- 🏷️ **Git Tag**: Version reference in repository

### Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed version history and changes.

### Best Practices

1. **Always test before releasing**
   ```bash
   npm test
   npm run build
   ```

2. **Update changelog before release**
   - Add entries to `CHANGELOG.md`
   - Use conventional commit messages

3. **Tag releases immediately**
   - Don't delay between commits and tags
   - Use descriptive tag messages

4. **Verify releases**
   - Check GitHub Actions completed successfully
   - Download and test release assets
   - Verify all files are included

### Rollback Process

If you need to rollback to a previous version:

1. **Identify the target version**
   ```bash
   git log --oneline --tags
   ```

2. **Create a rollback branch**
   ```bash
   git checkout -b rollback-v1.0.0 v1.0.0
   ```

3. **Update version and release**
   ```bash
   npm version patch
   git tag -a v1.0.2 -m "Rollback to v1.0.0 functionality"
   git push origin rollback-v1.0.0
   git push --tags
   ```

### Release Checklist

Before creating a release:

- [ ] All tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] CHANGELOG.md is updated
- [ ] README.md is current
- [ ] No sensitive data in code
- [ ] Dependencies are up to date
- [ ] Documentation is complete

After creating a release:

- [ ] GitHub Actions completed successfully
- [ ] Release assets are available
- [ ] Release notes are accurate
- [ ] Tag is properly created
- [ ] Version is correctly incremented

---
