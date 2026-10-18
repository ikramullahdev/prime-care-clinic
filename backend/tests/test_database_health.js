/**
 * QA Test Suite for Database Health Probe and Frontend Status Verification
 */

const http = require('http');

async function testHealthEndpoint() {
  console.log('=== TEST 1: Backend /api/health Probe ===');
  
  const res = await fetch('http://localhost:5000/api/health');
  console.log('HTTP Status Code:', res.status);
  
  const data = await res.json();
  console.log('Payload:', JSON.stringify(data, null, 2));

  if (res.status !== 200) {
    throw new Error(`Expected 200 OK from /api/health, got ${res.status}`);
  }

  if (data.status !== 'online') {
    throw new Error(`Expected status: 'online', got ${data.status}`);
  }

  if (!data.database || data.database.connected !== true) {
    throw new Error(`Expected database.connected === true, got ${JSON.stringify(data.database)}`);
  }

  if (typeof data.database.latencyMs !== 'number' || data.database.latencyMs < 0) {
    throw new Error(`Expected positive numeric latencyMs, got ${data.database.latencyMs}`);
  }

  console.log('✓ PASS: /api/health successfully executes a live SELECT 1 query and reports PostgreSQL connected with latency:', data.database.latencyMs, 'ms');
}

async function testFrontendPages() {
  console.log('\n=== TEST 2: Frontend HTML Pages Delivery ===');

  const adminRes = await fetch('http://localhost:3000/admin.html');
  console.log('GET http://localhost:3000/admin.html Status:', adminRes.status);
  if (adminRes.status !== 200) throw new Error('admin.html returned ' + adminRes.status);

  const adminHtml = await adminRes.text();
  if (!adminHtml.includes('checkDatabaseHealth()')) {
    throw new Error('admin.html missing checkDatabaseHealth() call');
  }
  if (!adminHtml.includes('api-status-label')) {
    throw new Error('admin.html missing api-status-label element');
  }
  console.log('✓ PASS: admin.html delivers valid markup with checkDatabaseHealth probe integrated.');

  const loginRes = await fetch('http://localhost:3000/login.html');
  console.log('GET http://localhost:3000/login.html Status:', loginRes.status);
  if (loginRes.status !== 200) throw new Error('login.html returned ' + loginRes.status);

  const loginHtml = await loginRes.text();
  if (!loginHtml.includes('checkBackendHealth()')) {
    throw new Error('login.html missing checkBackendHealth() call');
  }
  console.log('✓ PASS: login.html delivers valid markup with live database probe check.');
}

async function run() {
  try {
    await testHealthEndpoint();
    await testFrontendPages();
    console.log('\n======================================================');
    console.log('ALL DATABASE HEALTH PROBE QA TESTS PASSED SUCCESSFULLY');
    console.log('======================================================');
  } catch (err) {
    console.error('✗ QA Test Failed:', err);
    process.exit(1);
  }
}

run();
