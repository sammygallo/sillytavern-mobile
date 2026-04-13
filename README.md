# SillyTavern Mobile

A mobile-friendly React UI for SillyTavern, built with Vite + TypeScript + Tailwind CSS.

## First-Time Admin Setup

After a fresh installation, no real users exist yet. The app uses a temporary bootstrap account (`default-user`) to allow the first person to register as the owner/admin — no manual credential setup required.

### Steps

1. **Open the app** — you will be redirected to the login page.
2. **Click "Create an account"** (visible at the bottom of the login form when no real users exist).
3. **Fill in the registration form:**
   - **Username** — at least 3 characters; letters, numbers, `_`, and `-` only.
   - **Display Name** — your visible name inside the app.
   - **Password** — optional, but recommended (minimum 4 characters if set).
4. **Submit** — the app automatically:
   - Logs in as the internal `default-user` bootstrap account (no password).
   - Creates your account with the **owner** role and full admin privileges.
   - Logs out the bootstrap account and logs you straight in.
5. You are now signed in as the **owner/admin**. The "Create an account" link disappears for future visitors — further registrations require an admin invite.

> **Note:** If the "Create an account" link is not visible, a real user already exists. Log in with that account or ask the existing admin to invite you.

### Role Hierarchy

| Role | Level | Description |
|------|-------|-------------|
| `end_user` | 0 | Read-only / limited access |
| `contributor` | 1 | Standard user |
| `admin` | 2 | Administrative access |
| `owner` | 3 | Full control (first registrant) |

---

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
