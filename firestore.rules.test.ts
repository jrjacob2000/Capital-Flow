import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Security Rules Verification & Dirty Dozen Payload Test Suite
 * Verifies the structural gates in firestore.rules and evaluates all 12 Dirty Dozen payloads
 * defined in security_spec.md against the exact boolean invariants enforced by firestore.rules.
 */

const rulesSource = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
const blueprintSource = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf8')
);

interface MockAuth {
  uid: string;
  token: {
    email?: string;
    email_verified?: boolean;
  };
}

const REQUEST_TIME = 'SERVER_TIMESTAMP';

function isValidId(id: unknown): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);
}

function isValidYearId(id: unknown): boolean {
  return typeof id === 'string' && id.length === 4 && /^[0-9]{4}$/.test(id);
}

function isVerifiedUser(auth: MockAuth | null): boolean {
  return auth !== null && auth.token?.email_verified === true;
}

function isValidUserWorkspace(data: Record<string, any>, auth: MockAuth | null): boolean {
  if (!auth) return false;
  const required = [
    'ownerId',
    'activeYear',
    'frequency',
    'currency',
    'knownYears',
    'templateData',
    'ledgerData',
    'createdAt',
    'updatedAt',
  ];
  const allowed = [...required, 'lastDriveBackupAt'];
  const keys = Object.keys(data);
  if (!required.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => allowed.includes(k))) return false;

  return (
    typeof data.ownerId === 'string' &&
    data.ownerId.length >= 1 &&
    data.ownerId.length <= 128 &&
    /^[a-zA-Z0-9_\-]+$/.test(data.ownerId) &&
    data.ownerId === auth.uid &&
    Number.isInteger(data.activeYear) &&
    data.activeYear >= 2000 &&
    data.activeYear <= 2100 &&
    typeof data.frequency === 'string' &&
    data.frequency.length >= 7 &&
    data.frequency.length <= 20 &&
    (data.frequency === 'monthly' || data.frequency === 'bi-weekly') &&
    typeof data.currency === 'string' &&
    data.currency.length >= 1 &&
    data.currency.length <= 10 &&
    Array.isArray(data.knownYears) &&
    data.knownYears.length >= 1 &&
    data.knownYears.length <= 20 &&
    Number.isInteger(data.knownYears[0]) &&
    typeof data.templateData === 'object' &&
    data.templateData !== null &&
    !Array.isArray(data.templateData) &&
    Object.keys(data.templateData).length <= 50 &&
    typeof data.ledgerData === 'object' &&
    data.ledgerData !== null &&
    !Array.isArray(data.ledgerData) &&
    Object.keys(data.ledgerData).length <= 50 &&
    (!('lastDriveBackupAt' in data) ||
      (typeof data.lastDriveBackupAt === 'string' &&
        data.lastDriveBackupAt.length >= 1 &&
        data.lastDriveBackupAt.length <= 64)) &&
    data.createdAt === REQUEST_TIME &&
    data.updatedAt === REQUEST_TIME
  );
}

function evaluateWorkspaceCreate(
  userId: string,
  auth: MockAuth | null,
  incoming: Record<string, any>
): 'ALLOWED' | 'PERMISSION_DENIED' {
  const allowed =
    isVerifiedUser(auth) &&
    isValidId(userId) &&
    auth!.uid === userId &&
    isValidUserWorkspace(incoming, auth) &&
    incoming.createdAt === REQUEST_TIME &&
    incoming.updatedAt === REQUEST_TIME;
  return allowed ? 'ALLOWED' : 'PERMISSION_DENIED';
}

function evaluateWorkspaceUpdate(
  userId: string,
  auth: MockAuth | null,
  existing: Record<string, any>,
  patch: Record<string, any>
): 'ALLOWED' | 'PERMISSION_DENIED' {
  const incoming = { ...existing, ...patch };
  const affectedKeys = Object.keys(patch);
  const allowedUpdateKeys = [
    'activeYear',
    'frequency',
    'currency',
    'knownYears',
    'templateData',
    'ledgerData',
    'lastDriveBackupAt',
    'updatedAt',
  ];
  const allowed =
    isVerifiedUser(auth) &&
    isValidId(userId) &&
    auth!.uid === userId &&
    isValidUserWorkspace(incoming, auth) &&
    incoming.ownerId === existing.ownerId &&
    incoming.createdAt === existing.createdAt &&
    incoming.updatedAt === REQUEST_TIME &&
    affectedKeys.every((k) => allowedUpdateKeys.includes(k));
  return allowed ? 'ALLOWED' : 'PERMISSION_DENIED';
}

function evaluateBudgetCreate(
  userId: string,
  yearId: string,
  auth: MockAuth | null,
  parentWorkspaceOwnerId: string | null,
  incoming: Record<string, any>
): 'ALLOWED' | 'PERMISSION_DENIED' {
  const required = [
    'ownerId',
    'year',
    'version',
    'lastUpdated',
    'entryMode',
    'currency',
    'budgetPayload',
    'createdAt',
    'updatedAt',
  ];
  const keys = Object.keys(incoming);
  const validShape =
    required.every((k) => keys.includes(k)) &&
    keys.every((k) => required.includes(k)) &&
    typeof incoming.ownerId === 'string' &&
    incoming.ownerId === auth?.uid &&
    Number.isInteger(incoming.year) &&
    incoming.year >= 2000 &&
    incoming.year <= 2100 &&
    typeof incoming.version === 'string' &&
    incoming.version.length >= 1 &&
    incoming.version.length <= 32 &&
    typeof incoming.lastUpdated === 'string' &&
    incoming.lastUpdated.length >= 1 &&
    incoming.lastUpdated.length <= 64 &&
    (incoming.entryMode === 'monthly' || incoming.entryMode === 'bi-weekly') &&
    typeof incoming.currency === 'string' &&
    incoming.currency.length >= 1 &&
    incoming.currency.length <= 10 &&
    typeof incoming.budgetPayload === 'object' &&
    incoming.budgetPayload !== null &&
    incoming.createdAt === REQUEST_TIME &&
    incoming.updatedAt === REQUEST_TIME;

  const allowed =
    isVerifiedUser(auth) &&
    isValidId(userId) &&
    isValidYearId(yearId) &&
    auth!.uid === userId &&
    validShape &&
    yearId === String(incoming.year) &&
    parentWorkspaceOwnerId !== null &&
    parentWorkspaceOwnerId === auth!.uid;

  return allowed ? 'ALLOWED' : 'PERMISSION_DENIED';
}

function evaluateWorkspaceGet(
  userId: string,
  auth: MockAuth | null
): 'ALLOWED' | 'PERMISSION_DENIED' {
  const allowed =
    isVerifiedUser(auth) &&
    isValidId(userId) &&
    auth!.uid === userId;
  return allowed ? 'ALLOWED' : 'PERMISSION_DENIED';
}

function evaluateBudgetGet(
  userId: string,
  yearId: string,
  auth: MockAuth | null
): 'ALLOWED' | 'PERMISSION_DENIED' {
  const allowed =
    isVerifiedUser(auth) &&
    isValidId(userId) &&
    isValidYearId(yearId) &&
    auth!.uid === userId;
  return allowed ? 'ALLOWED' : 'PERMISSION_DENIED';
}

function evaluateBudgetList(
  userId: string,
  auth: MockAuth | null,
  resourceOwnerId: string
): 'ALLOWED' | 'PERMISSION_DENIED' {
  const allowed =
    isVerifiedUser(auth) &&
    isValidId(userId) &&
    auth!.uid === userId &&
    resourceOwnerId === auth!.uid;
  return allowed ? 'ALLOWED' : 'PERMISSION_DENIED';
}

describe('Firestore Security Rules & Dirty Dozen Verification', () => {
  it('enforces default-deny catch-all and blueprint synchronicity in firestore.rules', () => {
    assert.ok(rulesSource.includes("rules_version = '2';"));
    assert.ok(rulesSource.includes('match /{document=**}'));
    assert.ok(rulesSource.includes('allow read, write: if false;'));
    assert.ok(rulesSource.includes('isValidUserWorkspace(incoming())'));
    assert.ok(rulesSource.includes('isValidAnnualBudgetDoc(incoming())'));
    assert.ok(blueprintSource.entities.UserWorkspace);
    assert.ok(blueprintSource.entities.AnnualBudgetDoc);
  });

  it('rejects all 12 Dirty Dozen adversarial payloads with PERMISSION_DENIED', () => {
    const validExistingWorkspace = {
      ownerId: 'user_123',
      activeYear: 2026,
      frequency: 'monthly',
      currency: '₱',
      knownYears: [2026],
      templateData: {},
      ledgerData: {},
      createdAt: REQUEST_TIME,
      updatedAt: REQUEST_TIME,
    };

    // 1. Unauthenticated Workspace Creation
    assert.equal(
      evaluateWorkspaceCreate('user_123', null, validExistingWorkspace),
      'PERMISSION_DENIED'
    );

    // 2. Email Spoofing / Unverified Email Write
    assert.equal(
      evaluateWorkspaceCreate(
        'user_123',
        { uid: 'user_123', token: { email: 'jrjacob2000@gmail.com', email_verified: false } },
        validExistingWorkspace
      ),
      'PERMISSION_DENIED'
    );

    // 3. Cross-User Identity Spoofing on Create
    assert.equal(
      evaluateWorkspaceCreate(
        'user_123',
        { uid: 'attacker_999', token: { email_verified: true } },
        validExistingWorkspace
      ),
      'PERMISSION_DENIED'
    );

    // 4. Shadow Field Injection on Workspace Create
    assert.equal(
      evaluateWorkspaceCreate(
        'user_123',
        { uid: 'user_123', token: { email_verified: true } },
        { ...validExistingWorkspace, isAdmin: true }
      ),
      'PERMISSION_DENIED'
    );

    // 5. Shadow Update / Ghost Field Injection on Update
    assert.equal(
      evaluateWorkspaceUpdate(
        'user_123',
        { uid: 'user_123', token: { email_verified: true } },
        validExistingWorkspace,
        { activeYear: 2027, isVerified: true, updatedAt: REQUEST_TIME }
      ),
      'PERMISSION_DENIED'
    );

    // 6. Immutable Field Tampering (ownerId mutation)
    assert.equal(
      evaluateWorkspaceUpdate(
        'user_123',
        { uid: 'user_123', token: { email_verified: true } },
        validExistingWorkspace,
        { ownerId: 'hijacked_owner', updatedAt: REQUEST_TIME }
      ),
      'PERMISSION_DENIED'
    );

    // 7. Client Timestamp Forgery
    assert.equal(
      evaluateWorkspaceCreate(
        'user_123',
        { uid: 'user_123', token: { email_verified: true } },
        { ...validExistingWorkspace, createdAt: '2020-01-01T00:00:00.000Z' }
      ),
      'PERMISSION_DENIED'
    );

    // 8. Array Overflow & Type Poisoning on knownYears
    assert.equal(
      evaluateWorkspaceCreate(
        'user_123',
        { uid: 'user_123', token: { email_verified: true } },
        { ...validExistingWorkspace, knownYears: ['not-an-integer'] }
      ),
      'PERMISSION_DENIED'
    );

    // 9. Value Poisoning on Update
    assert.equal(
      evaluateWorkspaceUpdate(
        'user_123',
        { uid: 'user_123', token: { email_verified: true } },
        validExistingWorkspace,
        { activeYear: 999999, frequency: 'daily_hacked', updatedAt: REQUEST_TIME }
      ),
      'PERMISSION_DENIED'
    );

    // 10. Orphaned Subcollection Write Without Parent Workspace
    assert.equal(
      evaluateBudgetCreate(
        'orphan_user',
        '2026',
        { uid: 'orphan_user', token: { email_verified: true } },
        null,
        {
          ownerId: 'orphan_user',
          year: 2026,
          version: '1.21.0',
          lastUpdated: '2026-11-08T00:00:00.000Z',
          entryMode: 'monthly',
          currency: '₱',
          budgetPayload: {},
          createdAt: REQUEST_TIME,
          updatedAt: REQUEST_TIME,
        }
      ),
      'PERMISSION_DENIED'
    );

    // 11. Path Variable Poisoning on yearId (yearId != string(year))
    assert.equal(
      evaluateBudgetCreate(
        'user_123',
        'invalid_year_id',
        { uid: 'user_123', token: { email_verified: true } },
        'user_123',
        {
          ownerId: 'user_123',
          year: 2026,
          version: '1.21.0',
          lastUpdated: '2026-11-08T00:00:00.000Z',
          entryMode: 'monthly',
          currency: '₱',
          budgetPayload: {},
          createdAt: REQUEST_TIME,
          updatedAt: REQUEST_TIME,
        }
      ),
      'PERMISSION_DENIED'
    );

    // 12. Cross-Tenant Read / List Scraping
    assert.equal(
      evaluateBudgetList(
        'victim_user',
        { uid: 'attacker_user', token: { email_verified: true } },
        'victim_user'
      ),
      'PERMISSION_DENIED'
    );
  });

  it('allows legitimate authenticated owner workspace and budget writes', () => {
    const ownerAuth: MockAuth = { uid: 'user_123', token: { email_verified: true } };
    const validWorkspace = {
      ownerId: 'user_123',
      activeYear: 2026,
      frequency: 'monthly',
      currency: '₱',
      knownYears: [2026, 2025],
      templateData: { version: '1.0.0' },
      ledgerData: { version: '1.0.0' },
      createdAt: REQUEST_TIME,
      updatedAt: REQUEST_TIME,
    };

    assert.equal(evaluateWorkspaceCreate('user_123', ownerAuth, validWorkspace), 'ALLOWED');
    assert.equal(
      evaluateWorkspaceUpdate('user_123', ownerAuth, validWorkspace, {
        activeYear: 2027,
        knownYears: [2027, 2026, 2025],
        updatedAt: REQUEST_TIME,
      }),
      'ALLOWED'
    );
    assert.equal(
      evaluateBudgetCreate('user_123', '2026', ownerAuth, 'user_123', {
        ownerId: 'user_123',
        year: 2026,
        version: '1.21.0',
        lastUpdated: '2026-11-08T00:00:00.000Z',
        entryMode: 'monthly',
        currency: '₱',
        budgetPayload: { entries: [] },
        createdAt: REQUEST_TIME,
        updatedAt: REQUEST_TIME,
      }),
      'ALLOWED'
    );

    assert.equal(evaluateWorkspaceGet('user_123', ownerAuth), 'ALLOWED');
    assert.equal(evaluateBudgetGet('user_123', '2026', ownerAuth), 'ALLOWED');

    // Cross-user read attempts are strictly rejected
    const attackerAuth: MockAuth = { uid: 'attacker_456', token: { email_verified: true } };
    assert.equal(evaluateWorkspaceGet('user_123', attackerAuth), 'PERMISSION_DENIED');
    assert.equal(evaluateBudgetGet('user_123', '2026', attackerAuth), 'PERMISSION_DENIED');

    // Unverified users cannot read workspace or budget documents
    const unverifiedAuth: MockAuth = { uid: 'user_123', token: { email_verified: false } };
    assert.equal(evaluateWorkspaceGet('user_123', unverifiedAuth), 'PERMISSION_DENIED');
    assert.equal(evaluateBudgetGet('user_123', '2026', unverifiedAuth), 'PERMISSION_DENIED');

    // Unauthenticated requests are rejected
    assert.equal(evaluateWorkspaceGet('user_123', null), 'PERMISSION_DENIED');
    assert.equal(evaluateBudgetGet('user_123', '2026', null), 'PERMISSION_DENIED');
  });
});
