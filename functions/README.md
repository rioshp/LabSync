# LabSync trusted backend

Deploy from `LabSync/` with the Firebase CLI after installing the dependencies in this directory. The callable endpoint is `mutate` in `us-central1`; all inputs are checked against an action-specific allowlist. Client applications must call this function for application writes. Firestore rules should deny direct client writes to every application collection.

`index.cjs` is the Firebase entry point. `validation.cjs` validates inputs independently of Firestore, while `domain.cjs` owns authorization, transactions, and retry receipts. `review-worker.cjs` owns review job leases and summary updates.

## Callable contract

All requests have `{ action, ...fields }`. Authenticated users need an active profile for academic actions. New accounts call `completeProfile { displayName, nim }` after verifying their Firebase Auth email. Only this onboarding action can create a student profile. The backend takes the UID and verified-email claim from Firebase Auth.

| Action | Fields |
| --- | --- |
| `createPracticum` | `name`, `requestId` |
| `updatePracticum` / `archivePracticum` | `practicumId`, and `name` for update |
| `createClass` | `practicumId`, `name`, `timeZone`, `requestId` |
| `updateClass` / `archiveClass` | `classId`, and `name`, `timeZone` for update |
| `lookupStudent` / `addStudent` | `classId`, `nim` |
| `removeStudent` | `classId`, `studentUid` |
| `createSession` | `classId`, `moduleTitle`, `room`, `startsAt`, `endsAt`, `requestId` |
| `updateSession` | `classId`, `sessionId`, `moduleTitle`, `room`, `startsAt`, `endsAt` |
| `openSession` / `closeSession` / `cancelSession` | `classId`, `sessionId` |
| `checkIn` | `classId`, `sessionId` |
| `submitPermit` | `classId`, `sessionId`, `reason` |
| `decidePermit` | `permitId`, `decision` (`approved` or `rejected`), optional `decisionNote` |
| `submitReview` | `classId`, `sessionId`, `text` |

Session times are Unix milliseconds (UTC). Creates with auto-generated document IDs require a stable client `requestId`; reusing it with the same operation and payload returns the original `{ id }`, while a different payload is rejected. Receipts are intended to expire after seven days. NIM lookup is an exact normalized match; each assistant is limited to 20 calls per rolling minute by the private `lookupLimits/{assistantUid}` document.

Operator-only actions require the Firebase Auth custom claim `labsyncOperator: true`:

| Action | Fields |
| --- | --- |
| `provisionAssistant` | `uid`, `displayName` (wajib jika akun Auth belum punya nama) |
| `setAccountStatus` | `uid`, `accountStatus` (`active` or `disabled`) |
| `retryReview` | `sessionId`, `studentUid` |

Provisioning verifies that the Auth identity is active and has a verified email. It can create an assistant profile directly for a new identity. Promotion refuses accounts with existing enrollment, attendance, permit, or review records. Create a separate assistant identity when records already exist. Disabling an account updates the profile status; rules and callable authorization must check that status on every access.

### Bootstrap an operator claim

Use a trusted environment with Application Default Credentials for the Firebase project. Never run this from the mobile app or expose a service account key in the repository.

```sh
cd LabSync/functions
npm ci
GOOGLE_CLOUD_PROJECT=your-firebase-project node scripts/operator-claim.cjs FIREBASE_AUTH_UID grant
```

Use `revoke` instead of `grant` to remove the claim. The script preserves unrelated custom claims. The operator must sign in again to receive the updated ID token.

## Review worker

`processReviewJobOnWrite` claims newly submitted and operator-requeued jobs. `retryDueReviewJobs` scans due retries and expired leases once a minute. The worker sends only review text to the bundled classifier. Jobs, attempts, and session summary counters use Firestore transactions.

## Commands

```sh
npm test
npm run check
```
