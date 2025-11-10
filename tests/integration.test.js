const axios = require('axios');
const cheerio = require('cheerio');
const { spawn } = require('child_process');
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');

// Set a different port for testing to avoid conflict with the main app
const TEST_PORT = 3099;
let serverPid = null;

// Helper function to check if server is ready
async function waitForServer(maxAttempts = 20, delay = 200) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(`http://localhost:${TEST_PORT}/`, {
        timeout: 500,
        validateStatus: () => true // Accept any status code
      });
      // Server is responding
      return true;
    } catch (error) {
      // Server not ready yet, wait and retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error(`Server failed to start on port ${TEST_PORT} after ${maxAttempts} attempts`);
}

describe('Integration Tests', () => {
  // Start the app server with a test port
  beforeAll(async () => {
    // Mock external HTTP requests
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
    
    // Start the test server with PORT environment variable
    const serverProcess = spawn('node', ['app.js'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PORT: TEST_PORT.toString() }
    });
    
    // Store only the PID to avoid circular reference issues with Jest workers
    serverPid = serverProcess.pid;
    
    // Unref the process so it doesn't keep the parent alive
    serverProcess.unref();
    
    // Wait for server to be ready with health check
    await waitForServer();
  }, 30000); // Increase timeout for server startup

  afterAll(async () => {
    // Kill the test server and clean up
    if (serverPid) {
      try {
        // Kill the process group (negative PID kills the process group)
        process.kill(-serverPid);
      } catch (error) {
        // Server may have already exited, ignore errors
      }
      serverPid = null;
    }
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Setup mock for example.com
    nock('https://example.com')
      .get('/')
      .reply(200, sampleHtmlWithYale);
    
    // Make a request to our proxy app
    const response = await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
      url: 'https://example.com/'
    });
    
    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    
    // Verify Yale has been replaced with Fale in text
    const $ = cheerio.load(response.data.content);
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
    expect($('p').first().text()).toContain('Fale University is a private');
    
    // Verify URLs remain unchanged
    const links = $('a');
    let hasYaleUrl = false;
    links.each((i, link) => {
      const href = $(link).attr('href');
      if (href && href.includes('yale.edu')) {
        hasYaleUrl = true;
      }
    });
    expect(hasYaleUrl).toBe(true);
    
    // Verify link text is changed
    expect($('a').first().text()).toBe('About Fale');
  }, 10000); // Increase timeout for this test

  test('Should handle invalid URLs', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
        url: 'not-a-valid-url'
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(500);
    }
  });

  test('Should handle missing URL parameter', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {});
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data.error).toBe('URL is required');
    }
  });
});
