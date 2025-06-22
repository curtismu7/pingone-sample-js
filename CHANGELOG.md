# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Version management system with automated release scripts
- CHANGELOG.md for tracking version history
- Git tagging for releases
- Release automation scripts

### Changed
- Updated package.json with version management scripts
- Added scripts directory with version.js utility

## [1.0.2] - 2024-12-19

### Changed
- **Worker Token Caching**: Reduced cache duration from 55 to 50 minutes as requested
- **Buffer Time**: Reduced buffer time from 5 minutes to 2 minutes for more efficient token usage
- **Token Age Logging**: Added comprehensive token age logging to local logs
- **API Responses**: Updated `expires_in` values to reflect 50-minute duration (3000 seconds)

### Added
- **Detailed Age Information**: Token age is now logged with minutes, percentage of cache duration, and timestamps
- **Enhanced Status Endpoint**: `/api/token/status` now includes age details and cache configuration
- **New Cache Endpoint**: `/api/token/cache` provides detailed information about all cached tokens
- **Token Configuration**: Centralized token configuration with `TOKEN_CONFIG` object
- **Age Percentage Tracking**: Shows how much of the cache duration has been used

### Technical Improvements
- **Better Logging**: Token reuse now logs detailed age information including:
  - Token age in minutes
  - Time remaining until expiration
  - Percentage of cache duration used
  - Creation and expiration timestamps
- **Cache Configuration**: Centralized configuration for easy maintenance
- **Enhanced Error Handling**: Better logging for token validation failures

## [1.0.1] - 2024-12-19

### Added
- Version management system with automated release scripts
- CHANGELOG.md for tracking version history
- Git tagging for releases
- Release automation scripts

### Changed
- Updated package.json with version management scripts
- Added scripts directory with version.js utility

## [1.0.0] - 2024-12-19

### Added
- Initial PingOne User Management Application
- CSV import functionality for user management
- User creation, modification, and deletion features
- Web-based interface for user operations
- Server-side API endpoints
- Logging system with Winston
- File upload handling with Multer
- CORS support for cross-origin requests
- Integration with PingOne P14C JavaScript SDK
- Sample CSV files for testing
- Comprehensive error handling
- User authentication and authorization features

### Technical Details
- Node.js/Express backend
- Frontend with modern CSS and JavaScript
- RESTful API design
- CSV parsing with PapaParse
- HTTP client with Axios
- Development tools: Jest, Nodemon 