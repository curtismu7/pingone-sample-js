module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['server/**/*.js'],
  coveragePathIgnorePatterns: ['/node_modules/', '/tests/'],
  setupFilesAfterEnv: ['./tests/setup.js'],
  // Suppress console output during tests
  silent: true,
  // Show test output
  verbose: true
};
