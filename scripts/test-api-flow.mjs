import { spawn } from 'node:child_process';
import dns from 'node:dns';

// Ensure DNS resolution handles MongoDB Atlas SRV if server starts here
dns.setServers(['8.8.8.8', '1.1.1.1']);

const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}`;

async function isServerRunning() {
  try {
    const res = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(1500) });
    return res.ok || res.status === 200;
  } catch {
    return false;
  }
}

async function startServer() {
  console.log(`Starting server process on port ${PORT}...`);
  const server = spawn('node', ['index.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT) },
  });

  server.stdout.on('data', (d) => {
    const str = d.toString();
    if (process.env.DEBUG) process.stdout.write(str);
  });
  server.stderr.on('data', (d) => {
    const str = d.toString();
    if (process.env.DEBUG) process.stderr.write(str);
  });

  // Wait up to 12 seconds for server to be ready
  const start = Date.now();
  while (Date.now() - start < 12000) {
    if (await isServerRunning()) {
      console.log('Server is online and responding.');
      return server;
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  server.kill();
  throw new Error('Server failed to start within timeout.');
}

async function runTests() {
  let serverProcess = null;
  const running = await isServerRunning();
  if (!running) {
    serverProcess = await startServer();
  } else {
    console.log(`Server already running at ${BASE_URL}`);
  }

  const cleanup = () => {
    if (serverProcess) {
      console.log('Stopping test server process...');
      serverProcess.kill();
    }
  };

  process.on('SIGINT', () => { cleanup(); process.exit(1); });
  process.on('SIGTERM', () => { cleanup(); process.exit(1); });

  try {
    console.log('\n=============================================');
    console.log('    StudioSpace Automated API Flow Tests     ');
    console.log('=============================================\n');

    const testEmail = 'api-test-user@studiospace.com';
    let cookieHeader = '';
    let createdStudioId = null;

    // Step 1: Request JWT
    console.log('--- Step 1: Request Mock JWT via POST /api/auth/jwt ---');
    const authRes = await fetch(`${BASE_URL}/api/auth/jwt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail }),
    });
    const authStatus = authRes.status;
    const authData = await authRes.json();
    const setCookie = authRes.headers.get('set-cookie');
    console.log(`HTTP Status: ${authStatus}`);
    console.log('Response Body:', authData);
    console.log('Set-Cookie Header:', setCookie ? setCookie.split(';')[0] : 'None');

    if (!authRes.ok || !setCookie) {
      throw new Error(`Failed to obtain JWT cookie: HTTP ${authStatus}`);
    }
    cookieHeader = setCookie.split(';')[0];
    console.log('✔ Step 1 Passed: Successfully obtained JWT auth cookie\n');

    // Step 2: Query Public Studios
    console.log('--- Step 2: Query Public Listings via GET /api/studios ---');
    const getStudiosRes = await fetch(`${BASE_URL}/api/studios`);
    const getStudiosStatus = getStudiosRes.status;
    const studiosList = await getStudiosRes.json();
    console.log(`HTTP Status: ${getStudiosStatus}`);
    console.log(`Received Data: Array with ${studiosList.length} studios`);
    if (!getStudiosRes.ok || !Array.isArray(studiosList)) {
      throw new Error(`Failed to fetch public studios list: HTTP ${getStudiosStatus}`);
    }
    console.log('✔ Step 2 Passed: Public listings returned valid array data\n');

    // Step 3: Create Test Studio
    console.log('--- Step 3: Create Test Studio via POST /api/studios ---');
    const newStudioPayload = {
      title: 'Automated Flow Test Sound Stage',
      category: 'Sound Stage',
      location: 'Dhanmondi, Dhaka',
      hourlyRate: 150,
      securityDeposit: 60,
      maxCapacity: 10,
      description: 'Fully isolated soundstage for film, music video, and audio production'
    };
    const createRes = await fetch(`${BASE_URL}/api/studios`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
      body: JSON.stringify(newStudioPayload),
    });
    const createStatus = createRes.status;
    const createData = await createRes.json();
    console.log(`HTTP Status: ${createStatus}`);
    console.log('Response Body:', createData);
    createdStudioId = createData.insertedId || createData._id;
    if (!createRes.ok || !createdStudioId) {
      throw new Error(`Failed to create studio: HTTP ${createStatus}`);
    }
    console.log(`✔ Step 3 Passed: Test studio created with ID: ${createdStudioId}\n`);

    // Step 4: Update Studio Price via PUT /api/studios/:id
    console.log(`--- Step 4: Update Studio Price via PUT /api/studios/${createdStudioId} ---`);
    const updatePayload = {
      hourlyRate: 225,
      description: 'Updated rate: Studio upgraded with Dolby Atmos monitoring'
    };
    const updateRes = await fetch(`${BASE_URL}/api/studios/${createdStudioId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
      body: JSON.stringify(updatePayload),
    });
    const updateStatus = updateRes.status;
    const updateData = await updateRes.json();
    console.log(`HTTP Status: ${updateStatus}`);
    console.log('Response Body:', updateData);
    if (!updateRes.ok) {
      throw new Error(`Failed to update studio: HTTP ${updateStatus}`);
    }

    // Verify updated studio via GET
    const verifyGetRes = await fetch(`${BASE_URL}/api/studios/${createdStudioId}`);
    const verifyData = await verifyGetRes.json();
    console.log(`Verification GET /api/studios/${createdStudioId} hourlyRate:`, verifyData.hourlyRate);
    if (verifyData.hourlyRate !== 225) {
      throw new Error(`Expected hourlyRate to be 225, got ${verifyData.hourlyRate}`);
    }
    console.log('✔ Step 4 Passed: Studio successfully updated and price verified\n');

    // Step 5: Delete Studio via DELETE /api/studios/:id
    console.log(`--- Step 5: Delete Test Studio via DELETE /api/studios/${createdStudioId} ---`);
    const deleteRes = await fetch(`${BASE_URL}/api/studios/${createdStudioId}`, {
      method: 'DELETE',
      headers: {
        'Cookie': cookieHeader,
      },
    });
    const deleteStatus = deleteRes.status;
    const deleteData = await deleteRes.json();
    console.log(`HTTP Status: ${deleteStatus}`);
    console.log('Response Body:', deleteData);
    if (!deleteRes.ok) {
      throw new Error(`Failed to delete studio: HTTP ${deleteStatus}`);
    }

    // Confirm studio is removed (404)
    const checkDeletedRes = await fetch(`${BASE_URL}/api/studios/${createdStudioId}`);
    console.log(`Verification GET (should 404): HTTP ${checkDeletedRes.status}`);
    if (checkDeletedRes.status !== 404) {
      throw new Error(`Expected 404 after deletion, got ${checkDeletedRes.status}`);
    }
    console.log('✔ Step 5 Passed: Test studio successfully removed and confirmed\n');

    console.log('=============================================');
    console.log('       ALL 5 API FLOW TESTS PASSED!          ');
    console.log('=============================================\n');
  } finally {
    cleanup();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test flow encountered an error:', err.message);
  process.exit(1);
});
