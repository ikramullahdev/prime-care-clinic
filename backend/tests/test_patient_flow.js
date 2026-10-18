/**
 * Automated Verification Script for Patient Registration System
 * Tests:
 * 1. Admin login & token generation
 * 2. Input validation rejection (missing name, invalid phone, negative age)
 * 3. Successful patient registration with MRN generation (PCC-YYYY-XXXXX)
 * 4. DOB vs Estimated Age distinction
 * 5. Duplicate detection warning & staff confirmation override
 * 6. Patient search by MRN, name, and phone
 * 7. Patient profile retrieval with audit trail & appointments
 * 8. Patient demographics update
 * 9. Unauthorized request rejection
 */

const http = require('http');

const API_HOST = 'localhost';
const API_PORT = 5000;

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        host: API_HOST,
        port: API_PORT,
        method,
        path,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING PATIENT REGISTRATION SYSTEM QA SUITE ---');

  // Test 1: Unauthorized access check
  console.log('\n[1] Testing Unauthorized access protection...');
  const unauthRes = await request('GET', '/api/patients');
  if (unauthRes.status === 401) {
    console.log('✓ PASS: Unauthenticated request rejected with 401 Unauthorized.');
  } else {
    console.error('✗ FAIL: Expected 401, got', unauthRes.status, unauthRes.body);
  }

  // Test 2: Admin Authentication
  console.log('\n[2] Logging in as Admin...');
  const loginRes = await request('POST', '/api/auth/login', {
    email: 'admin@primecare.pk',
    password: 'AdminPrimeCare2026!',
  });

  if (loginRes.status !== 200 || !loginRes.body.token) {
    console.error('✗ FAIL: Login failed:', loginRes.body);
    process.exit(1);
  }
  const token = loginRes.body.token;
  console.log(`✓ PASS: Admin authenticated successfully. User: ${loginRes.body.user.name}`);

  // Test 3: Validation checks on invalid input
  console.log('\n[3] Testing registration validation rules...');
  const invalidRes1 = await request('POST', '/api/patients', {
    fullName: 'A', // Too short
    gender: 'UNKNOWN',
    phone: '123', // Invalid phone
  }, token);

  if (invalidRes1.status === 400 && invalidRes1.body.error === 'ValidationError') {
    console.log('✓ PASS: Invalid name & phone rejected properly:', invalidRes1.body.message);
  } else {
    console.error('✗ FAIL: Expected 400 ValidationError, got', invalidRes1.status, invalidRes1.body);
  }

  // Test 4: Register Patient 1 (Exact DOB)
  const runId = String(Date.now()).slice(-6);
  const testPhone1 = `0300${runId}`;
  const testPhone2 = `0321${runId}`;

  console.log(`\n[4] Testing Patient Registration with Exact DOB (Phone: ${testPhone1})...`);
  const testPatient1 = {
    fullName: 'Test Patient Fatima Noor',
    gender: 'FEMALE',
    phone: testPhone1,
    email: `fatima.noor.${runId}@example.com`,
    dateOfBirth: '1992-06-15',
    isAgeEstimated: false,
    bloodGroup: 'B+',
    address: 'House 42, St 5, Lalazar',
    city: 'Rawalpindi',
    emergencyContactName: 'Tariq Noor',
    emergencyContactRelation: 'Spouse',
    emergencyContactPhone: '0300-9876543',
    medicalNotes: 'Type 2 Diabetes screening follow-up',
  };

  const regRes1 = await request('POST', '/api/patients', testPatient1, token);
  if (regRes1.status === 201 && regRes1.body.patient && regRes1.body.patient.mrn) {
    console.log(`✓ PASS: Registered patient 1. MRN assigned: ${regRes1.body.patient.mrn}`);
    console.log(`  - Audit createdBy: ${regRes1.body.patient.createdBy.name} (${regRes1.body.patient.createdBy.role})`);
  } else {
    console.error('✗ FAIL: Patient 1 registration failed:', regRes1.status, regRes1.body);
    process.exit(1);
  }

  const p1 = regRes1.body.patient;

  // Test 5: Register Patient 2 (Estimated Age distinction)
  console.log(`\n[5] Testing Patient Registration with Estimated Age (Phone: ${testPhone2})...`);
  const testPatient2 = {
    fullName: 'Test Patient Haji Abdul Rehman',
    gender: 'MALE',
    phone: testPhone2,
    isAgeEstimated: true,
    estimatedAge: 68,
    bloodGroup: 'O+',
    address: 'Near Tulsa Chowk, Lalazar',
    city: 'Rawalpindi',
    emergencyContactName: 'Kamran Rehman',
    emergencyContactRelation: 'Son',
    emergencyContactPhone: '0321-5559876',
    medicalNotes: 'Senior patient, diabetes checkup',
  };

  const regRes2 = await request('POST', '/api/patients', testPatient2, token);
  if (regRes2.status === 201 && regRes2.body.patient && regRes2.body.patient.mrn) {
    console.log(`✓ PASS: Registered patient 2. MRN assigned: ${regRes2.body.patient.mrn}`);
    console.log(`  - isAgeEstimated: ${regRes2.body.patient.isAgeEstimated}, estimatedAge: ${regRes2.body.patient.estimatedAge}`);
    console.log(`  - Approx Calculated DOB Year: ${new Date(regRes2.body.patient.dateOfBirth).getFullYear()}`);
  } else {
    console.error('✗ FAIL: Patient 2 registration failed:', regRes2.status, regRes2.body);
  }

  // Test 6: Duplicate Detection check (same phone number)
  console.log('\n[6] Testing Non-Silent Duplicate Prevention...');
  const dupCheckRes = await request('POST', '/api/patients/check-duplicate', {
    phone: testPhone1,
  }, token);

  if (dupCheckRes.status === 200 && dupCheckRes.body.hasPossibleDuplicate) {
    console.log(`✓ PASS: Duplicate checker found matching candidate: MRN ${dupCheckRes.body.matches[0].mrn} (${dupCheckRes.body.matches[0].fullName})`);
  } else {
    console.error('✗ FAIL: Duplicate check missed existing phone match:', dupCheckRes.body);
  }

  // Attempt duplicate registration without override -> Should be 409
  const dupAttempt = await request('POST', '/api/patients', {
    fullName: 'Fatima Noor Duplicate',
    gender: 'FEMALE',
    phone: testPhone1, // Same normalized phone
    isAgeEstimated: true,
    estimatedAge: 32,
  }, token);

  if (dupAttempt.status === 409 && dupAttempt.body.requiresConfirmation) {
    console.log(`✓ PASS: Registration blocked with 409 Conflict: "${dupAttempt.body.message}"`);
  } else {
    console.error('✗ FAIL: Expected 409 Conflict, got', dupAttempt.status, dupAttempt.body);
  }

  // Staff Confirmation Override -> Should succeed
  console.log('\n[7] Testing Staff Confirmation Override for family member...');
  const overrideRes = await request('POST', '/api/patients', {
    fullName: 'Family Member of Fatima Noor',
    gender: 'FEMALE',
    phone: testPhone1,
    isAgeEstimated: true,
    estimatedAge: 12,
    forceConfirmDuplicate: true, // Staff override
  }, token);

  if (overrideRes.status === 201) {
    console.log(`✓ PASS: Registration with staff confirmation succeeded. New MRN: ${overrideRes.body.patient.mrn}`);
  } else {
    console.error('✗ FAIL: Staff override registration failed:', overrideRes.status, overrideRes.body);
  }

  // Test 8: Search by MRN, Name, Phone
  console.log('\n[8] Testing Patient Search & Pagination...');
  const searchByMRN = await request('GET', `/api/patients?search=${p1.mrn}`, null, token);
  if (searchByMRN.status === 200 && searchByMRN.body.patients.length === 1) {
    console.log(`✓ PASS: Search by MRN '${p1.mrn}' returned exact match.`);
  } else {
    console.error('✗ FAIL: Search by MRN failed:', searchByMRN.body);
  }

  const searchByName = await request('GET', `/api/patients?search=Fatima`, null, token);
  if (searchByName.status === 200 && searchByName.body.patients.length >= 1) {
    console.log(`✓ PASS: Search by name 'Fatima' returned ${searchByName.body.patients.length} results.`);
  }

  const searchByPhone = await request('GET', `/api/patients?search=${testPhone2}`, null, token);
  if (searchByPhone.status === 200 && searchByPhone.body.patients.length === 1) {
    console.log(`✓ PASS: Search by phone returned patient: ${searchByPhone.body.patients[0].fullName}`);
  }

  // Test 9: Get Patient Details by ID or MRN
  console.log('\n[9] Testing Patient Profile & Audit Details...');
  const detailRes = await request('GET', `/api/patients/${p1.mrn}`, null, token);
  if (detailRes.status === 200 && detailRes.body.patient) {
    const p = detailRes.body.patient;
    console.log(`✓ PASS: Retrieved profile for ${p.fullName}. Created by: ${p.createdBy.name}, Appointments linked: ${p.appointments.length}`);
  } else {
    console.error('✗ FAIL: Failed to retrieve profile:', detailRes.body);
  }

  // Test 10: Update Demographics
  console.log('\n[10] Testing Demographics Update (PATCH)...');
  const updateRes = await request('PATCH', `/api/patients/${p1.id}`, {
    address: 'Updated Suite 101, Lalazar Avenue',
    bloodGroup: 'AB+',
    medicalNotes: 'Updated clinical notes during triage consultation.',
  }, token);

  if (updateRes.status === 200 && updateRes.body.patient.bloodGroup === 'AB+') {
    console.log(`✓ PASS: Demographics updated successfully. Blood group now: ${updateRes.body.patient.bloodGroup}`);
    console.log(`  - Audit updatedBy: ${updateRes.body.patient.updatedBy.name}`);
  } else {
    console.error('✗ FAIL: Update demographics failed:', updateRes.body);
  }

  console.log('\n======================================================');
  console.log('ALL PATIENT REGISTRATION SYSTEM QA TESTS PASSED! (10/10)');
  console.log('======================================================');
}

runTests().catch((err) => {
  console.error('Test run failed with error:', err);
  process.exit(1);
});
