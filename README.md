# Gate Pass API

Express + MSSQL service for managing gate passes, their line items, and email alerts. The API exposes CRUD endpoints for gate passes, simple user creation/login, health checks, and outbound email notifications using Nodemailer and an HTML template.

## Features
- Health check at `/health` for uptime probes.
- Gate pass CRUD with transactional inserts/updates and nested line items (`controllers/gatePassController.js`).
- Simple user creation and login endpoints (no tokens yet; passwords are stored as plain text in the sample schema).
- Email alerts on create/update with reusable transporter + HTML template (`services/mailService.js`, `templates/email/gatepass-alert.html`).
- Configurable recipients/subjects via environment variables (`config/mailConfig.js`).
- Console request logging (includes `x-user` header and request body) plus centralized error/404 handlers.
- Graceful shutdown closes the MSSQL pool.

## Project Structure
- `server.js` – Express setup, middleware, route mounting, startup, shutdown.
- `routes/api.js` – HTTP endpoints and request validation.
- `controllers/gatePassController.js` – DB interactions and transactions.
- `config/database.js` – MSSQL pool config + helpers.
- `config/mailConfig.js` – Alert recipients/subjects.
- `services/mailService.js` – Nodemailer transport, template rendering, alert helpers.
- `templates/email/gatepass-alert.html` – Alert email template.
- `database/schema.sql` – Tables + sample seed data.

## Prerequisites
- Node.js 18+ (tested with CommonJS).
- Microsoft SQL Server (local or reachable over the network).
- SMTP account for sending mail (e.g., Gmail app password).

## Setup
1) Install dependencies  
   ```bash
   npm install
   ```

2) Configure environment (`.env` in repo root; never commit secrets)  
   ```ini
   PORT=3000

   MSSQL_SERVER=localhost
   MSSQL_PORT=1434
   MSSQL_DATABASE=DEV-DB-1
   MSSQL_USER=sqladmin
   MSSQL_PASSWORD=your-strong-password
   MSSQL_ENCRYPT=false
   MSSQL_TRUST_SERVER_CERTIFICATE=true

   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your@gmail.com
   SMTP_PASS=app-password
   SMTP_FROM="Gate Pass Alerts <your@gmail.com>"   # optional
   ALERT_RECIPIENTS=recipient1@org.com,recipient2@org.com
   ```

3) Prepare the database  
   - Create the database named in `MSSQL_DATABASE`.  
   - Run `database/schema.sql` against it (SQL Server Management Studio or `sqlcmd -S <server> -U <user> -P <pass> -d <db> -i database/schema.sql`).  
   - Sample data in the script seeds one user and one gate pass.

4) Run the server  
   - Development (auto-reload): `npm run dev`  
   - Production: `npm start`  
   Server binds to `PORT` (default 3000) after testing the DB connection.

5) Quick smoke test  
   ```bash
   curl http://localhost:3000/health
   ```

## API Endpoints (base path `/api`)
- `POST /createlogin` – Body: `{ email, userName, password, isActive? }` → creates user (409 if email exists).
- `POST /auth/login` – Body: `{ email, password }` → returns user info when active; 401 otherwise.
- `GET /gatepass` – Returns array of gate passes with nested `items`.
- `POST /gatepass` – Create gate pass. Required body fields:  
  `id` (GatePassID), `gatepassNo`, `date`, `destination`, `carriedBy`, `through`, `mobileNo`, `createdBy`, `items` (array of `{ slNo, description, makeItem, model, serialNo, qty }`).  
  Optional: `returnable` (int; 1 = yes, 0 = no; defaults to 0), `isEnable` (int; defaults to 1).  
  Sends “created” alert email asynchronously.
- `PATCH /gatepass` – Update gate pass. Same fields as create; accepts `modifiedBy`, `modifiedAt`, `isEnable`, `returnable`. Replaces all line items. Sends “updated” alert on success.
- `DELETE /gatepassdelete/:id` – Deletes header + items transactionally; 404 if not found.

Common responses  
```json
{ "success": true, "message": "...", "data": [...] }
```
Errors include `message` and `error` strings; validation returns 400/401/404 as appropriate.

## Email Alerts
- Transport uses `SMTP_*` env vars; secure mode auto-enables if port is 465.
- Recipients default to `ALERT_RECIPIENTS` (comma-separated) or fallback to `SMTP_USER`.
- Subjects per event live in `config/mailConfig.js`; HTML template lives at `templates/email/gatepass-alert.html`.
- Sending is fire-and-forget from the request thread; failures are logged to console.

## Operational Notes
- Request logging: every request logs path, optional `x-user` header, and body JSON.
- GatePass IDs are client-supplied (generate externally, e.g., `uuid`), not auto-created by the API.
- Passwords are plain text per sample schema; use hashing before production.
- CORS is open by default. Add origin restrictions in `server.js` if needed.
- Graceful shutdown on `SIGINT` closes the MSSQL pool.

## Troubleshooting
- Connection errors at startup usually mean MSSQL env vars are wrong or DB unreachable.
- Email failures: verify SMTP creds/port and allow less-secure/app passwords as required by your provider.
- To test SMTP separately, adapt `smtpTest.js` (ignored by Git) after matching your module system.
