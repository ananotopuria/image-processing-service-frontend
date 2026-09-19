# Authentication

The existing Login and Register forms use the NestJS Bearer JWT API. They share
the same page layout, field styling, and client-side DTO length checks.

## Configuration

Copy `.env.example` to `.env`, set `VITE_API_URL` to the backend **origin only**,
and restart Vite. The example intentionally leaves it blank. Use
`https://image-processing-service-s34x.onrender.com` for the deployed backend,
or `http://localhost:3000` when running the backend locally. Do not append
`/api`; the API methods include that prefix. Missing or invalid configuration
throws an explicit startup error rather than sending credentials to the frontend.

Set `VITE_API_URL` in the frontend hosting environment **before building** for
production. Vite embeds this public URL into the bundle; it is not a secret.
Keep `.env` ignored and never put JWTs or backend secrets in Vite variables.

The backend must be running and allow the frontend origin through CORS. A live
preflight check on September 19, 2026 from `http://localhost:5173` returned
`404 Cannot OPTIONS /api/auth/sign-in` without CORS headers. The inspected
backend `src/main.ts` also has no `enableCors` configuration. Configure
allowed frontend origins on the backend, including the actual development
origin and the deployed frontend origin. Allow `Content-Type`, `Authorization`,
and the API's HTTP methods, and handle preflight requests. This frontend does
not proxy requests or work around CORS. Browser network errors cannot reliably
distinguish CORS failures from an unavailable server.

## Verified backend contract

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| POST | `/api/auth/sign-in` | `{ email, password }` | `AuthResponse` |
| POST | `/api/auth/sign-up` | `{ username, email, password }` | `AuthResponse` |
| GET | `/api/auth/profile` | Bearer token | `{ user: { sub, email, iat?, exp? } }` |

Both successful authentication responses have this shape:

```ts
interface AuthResponse {
  message: string;
  accessToken: string;
  user: { id: string; username: string; email: string };
}
```

Registration requires a username of 2–50 characters and a password of 8–72
characters. Sign-in requires a password of at least 8 characters. Both require
an email address. The backend enforces the full DTO validation. Its current
uniqueness check is on email, not username.

## Session lifecycle

- Both forms call the real API, persist `accessToken`, update the auth context,
  and navigate to `/studio` on success. Controls are disabled while submitting;
  a synchronous request guard prevents duplicate submissions. Leaving a form
  cancels its request and prevents a late response from establishing a session.
- `useAuth().user` holds the real returned account after login or registration.
  On refresh, it contains `id` (from verified `sub`) and `email`; `username` is
  absent because the profile endpoint does not return it. Any future account
  label can use `user.username ?? user.email`. User details remain in React state.
- `src/auth/tokenStorage.ts` centralizes localStorage under
  `mothframe_access_token`. Other tabs receive session changes through storage
  events. No password or user profile is persisted, and JWTs are not decoded.
- `src/api/client.ts` attaches the current token through an Axios request
  interceptor for protected API calls. Authentication POSTs omit it. Future
  calls should import `apiClient` and use paths such as `/api/images`.
- `AuthProvider` restores a stored session by checking the real profile endpoint.
  `ProtectedRoute` waits for this check before rendering `/studio` or `/history`.
  Visitors without a token are redirected to `/login` with history replacement.
- A protected 401 clears the rejected session. A network or server error retains
  the token and shows a retry screen. A failed login or a stale response from a
  previous token does not clear a newer session.
  Token removal also clears the in-memory user, including sign-out in another tab.
- The shared header offers **Sign out** for an authenticated session. It clears
  local storage and context, then navigates to `/`. The backend has no logout or
  refresh endpoint, so logout removes the browser session; it does not revoke
  an already-issued JWT on the server.

LocalStorage fits this project's existing Bearer flow, but is accessible to
JavaScript and is not a claim of the most secure production session design.

## Verification

```bash
npm run test:auth
npm run lint
npm run build
```

The build includes TypeScript checking. Auth tests use isolated test storage and
Axios adapters, without creating real accounts. They check request contracts,
token persistence and headers, rejected sessions, safe errors, and protected
content while session verification is pending or unavailable.

For a live browser check with the configured backend:

1. Open `/studio` and `/history` while signed out; confirm redirect to `/login`.
2. Register a new account; confirm navigation to Studio.
3. Reload Studio; confirm profile verification restores access.
4. Sign out; confirm navigation home and that protected pages are inaccessible.
5. Sign in again; check invalid credentials and an existing registration email.
6. Temporarily make the backend unavailable during restoration; confirm the
   retry screen appears without deleting the stored session.

No image upload, transformation, or history fetching is implemented here.
