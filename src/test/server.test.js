const request = require('supertest');
const app = require('../index');

describe('Server Tests', () => {
  it('should respond to the root route', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Expense Tracker API is running');
  });

  it('should return 401 for protected routes without authentication', async () => {
    const response = await request(app).get('/api/income');
    expect(response.status).toBe(401);
    expect(response.body.message).toContain('Access token is required');
  });
});
