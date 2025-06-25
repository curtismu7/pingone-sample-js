const request = require('supertest');
const express = require('express');
const router = require('express').Router();
const importModule = require('../../server/routes/import');
const tokenRoutes = require('../../server/routes/token');

// Mock the token module
jest.mock('../../server/routes/token', () => ({
  getWorkerToken: jest.fn()
}));

// Mock the getDefaultPopulation function
const mockGetDefaultPopulation = jest.fn().mockResolvedValue('test-population-id');

// Create a test app with the actual import routes
const app = express();
app.use(express.json());
app.use('/api/import', importModule);

describe('Import Routes', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('POST /api/import/bulk', () => {
    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/import/bulk')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should call getWorkerToken with correct parameters', async () => {
      const mockToken = 'test-token';
      tokenRoutes.getWorkerToken.mockResolvedValue(mockToken);

      const mockData = {
        users: [{ username: 'testuser', email: 'test@example.com' }],
        environmentId: 'test-env',
        clientId: 'test-client',
        clientSecret: 'test-secret'
      };

      // Mock the getDefaultPopulation function to avoid API calls
      jest.spyOn(importModule, 'getDefaultPopulation').mockImplementation(mockGetDefaultPopulation);

      await request(app)
        .post('/api/import/bulk')
        .send(mockData);

      expect(tokenRoutes.getWorkerToken).toHaveBeenCalledWith(
        mockData.environmentId,
        mockData.clientId,
        mockData.clientSecret
      );
    });
  });
});
