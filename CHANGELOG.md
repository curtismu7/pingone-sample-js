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