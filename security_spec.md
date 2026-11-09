# CapitalFlow Firestore Security Specification

## 1. Data Invariants & Master Source of Truth

1. **Master Source of Truth (`/workspaces/{userId}`)**:
   - Every user workspace is uniquely keyed by the authenticated user's Firebase UID (`userId == request.auth.uid`).
   - Only verified authenticated users (`request.auth != null && request.auth.token.email_verified == true`) may read or write their own `/workspaces/{userId}` document.
   - `ownerId` must equal `request.auth.uid` and `userId`, match `^[a-zA-Z0-9_\-]+$`, be between 1 and 128 characters, and remain immutable after creation.
   - `createdAt` must equal `request.time` on creation and remain immutable on all subsequent updates.
   - `updatedAt` must equal `request.time` on both creation and every update.
   - `knownYears` must be a bounded list (`size() >= 1 && size() <= 20`) whose first element is an `int`.
   - `templateData` and `ledgerData` must be bounded native Firestore maps (`size() <= 50`).

2. **Relational Subcollection Invariant (`/workspaces/{userId}/budgets/{yearId}`)**:
   - An `AnnualBudgetDoc` cannot exist or be modified unless the parent workspace `/workspaces/$(userId)` exists and its `ownerId == request.auth.uid` (Master Gate relational check).
   - `yearId` must match `^[0-9]{4}$` (4-digit year string) and equal `string(incoming().year)`.
   - `ownerId` and `year` and `createdAt` are immutable after creation.
   - `allow list` on `/workspaces/{userId}/budgets` explicitly enforces `resource.data.ownerId == request.auth.uid` without any `get()` or `exists()` calls inside the list rule.

---

## 2. The "Dirty Dozen" Adversarial Payloads

### Payload 1: Unauthenticated Workspace Creation (Pillar 1 / Auth Gate)
```json
{
  "collection": "/workspaces/user_123",
  "auth": null,
  "payload": {
    "ownerId": "user_123",
    "activeYear": 2026,
    "frequency": "monthly",
    "currency": "₱",
    "knownYears": [2026],
    "templateData": {},
    "ledgerData": {},
    "createdAt": "SERVER_TIMESTAMP",
    "updatedAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 2: Email Spoofing / Unverified Email Write (Email Spoofing Test)
```json
{
  "collection": "/workspaces/user_123",
  "auth": { "uid": "user_123", "email": "jrjacob2000@gmail.com", "email_verified": false },
  "payload": {
    "ownerId": "user_123",
    "activeYear": 2026,
    "frequency": "monthly",
    "currency": "₱",
    "knownYears": [2026],
    "templateData": {},
    "ledgerData": {},
    "createdAt": "SERVER_TIMESTAMP",
    "updatedAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 3: Cross-User Identity Spoofing on Create (Pillar 2 Identity Integrity)
```json
{
  "collection": "/workspaces/user_123",
  "auth": { "uid": "attacker_999", "email_verified": true },
  "payload": {
    "ownerId": "user_123",
    "activeYear": 2026,
    "frequency": "monthly",
    "currency": "₱",
    "knownYears": [2026],
    "templateData": {},
    "ledgerData": {},
    "createdAt": "SERVER_TIMESTAMP",
    "updatedAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 4: Shadow Field Injection on Workspace Create (Pillar 2 Strict Keys)
```json
{
  "collection": "/workspaces/user_123",
  "auth": { "uid": "user_123", "email_verified": true },
  "payload": {
    "ownerId": "user_123",
    "activeYear": 2026,
    "frequency": "monthly",
    "currency": "₱",
    "knownYears": [2026],
    "templateData": {},
    "ledgerData": {},
    "isAdmin": true,
    "createdAt": "SERVER_TIMESTAMP",
    "updatedAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 5: Shadow Update / Ghost Field Injection on Update (Phase 5 Shadow Update Test)
```json
{
  "collection": "/workspaces/user_123",
  "operation": "update",
  "auth": { "uid": "user_123", "email_verified": true },
  "payload": {
    "activeYear": 2027,
    "isVerified": true,
    "updatedAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 6: Immutable Field Tampering (`ownerId` / `createdAt` mutation)
```json
{
  "collection": "/workspaces/user_123",
  "operation": "update",
  "auth": { "uid": "user_123", "email_verified": true },
  "payload": {
    "ownerId": "hijacked_owner",
    "updatedAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 7: Client Timestamp Forgery (Temporal Integrity Violation)
```json
{
  "collection": "/workspaces/user_123",
  "operation": "create",
  "auth": { "uid": "user_123", "email_verified": true },
  "payload": {
    "ownerId": "user_123",
    "activeYear": 2026,
    "frequency": "monthly",
    "currency": "₱",
    "knownYears": [2026],
    "templateData": {},
    "ledgerData": {},
    "createdAt": "2020-01-01T00:00:00.000Z",
    "updatedAt": "2020-01-01T00:00:00.000Z"
  }
}
```

### Payload 8: Array Overflow & Type Poisoning on `knownYears` (Pillar 5 Total Array Guarding)
```json
{
  "collection": "/workspaces/user_123",
  "operation": "create",
  "auth": { "uid": "user_123", "email_verified": true },
  "payload": {
    "ownerId": "user_123",
    "activeYear": 2026,
    "frequency": "monthly",
    "currency": "₱",
    "knownYears": ["not-an-integer"],
    "templateData": {},
    "ledgerData": {},
    "createdAt": "SERVER_TIMESTAMP",
    "updatedAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 9: Value Poisoning on Update (Invalid Enum / Out-of-Range Year)
```json
{
  "collection": "/workspaces/user_123",
  "operation": "update",
  "auth": { "uid": "user_123", "email_verified": true },
  "payload": {
    "activeYear": 999999,
    "frequency": "daily_hacked",
    "updatedAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 10: Orphaned Subcollection Write Without Parent Workspace (Pillar 1 Master Gate)
```json
{
  "collection": "/workspaces/orphan_user/budgets/2026",
  "operation": "create",
  "auth": { "uid": "orphan_user", "email_verified": true },
  "payload": {
    "ownerId": "orphan_user",
    "year": 2026,
    "version": "1.20.0",
    "lastUpdated": "2026-11-08T00:00:00.000Z",
    "entryMode": "monthly",
    "currency": "₱",
    "budgetPayload": {},
    "createdAt": "SERVER_TIMESTAMP",
    "updatedAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 11: Path Variable Poisoning on `yearId` (`yearId != string(year)`) (Pillar 3)
```json
{
  "collection": "/workspaces/user_123/budgets/invalid_year_id",
  "operation": "create",
  "auth": { "uid": "user_123", "email_verified": true },
  "payload": {
    "ownerId": "user_123",
    "year": 2026,
    "version": "1.20.0",
    "lastUpdated": "2026-11-08T00:00:00.000Z",
    "entryMode": "monthly",
    "currency": "₱",
    "budgetPayload": {},
    "createdAt": "SERVER_TIMESTAMP",
    "updatedAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 12: Cross-Tenant Read / List Scraping (Pillar 6 & Pillar 8 Query Enforcer)
```json
{
  "collection": "/workspaces/victim_user/budgets",
  "operation": "list",
  "auth": { "uid": "attacker_user", "email_verified": true }
}
```
