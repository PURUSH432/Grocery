# GoQuick Grocery

## PostgreSQL setup

1. Install PostgreSQL locally, or create a Render PostgreSQL database from the Render dashboard.
2. Copy `.env.example` to `.env` and set `DB_USER`, `DB_PASSWORD`, and `JWT_SECRET`.
   For UPI checkout, also add your Razorpay test credentials: `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
   Run `migrate-order-payments.sql` for existing MySQL databases to store Razorpay transaction IDs.
3. Create the database and seed the products:

```powershell
psql "$env:DATABASE_URL" -f schema-postgres.sql

# For an existing PostgreSQL database, apply any missing columns manually in pgAdmin
# or run the PostgreSQL schema against a new database.
```

4. Install dependencies and start the application:

```powershell
npm install
npm start
```

Open `http://localhost:4173`.

## Python PostgreSQL connection

Install the Python dependencies and run the connection test:

```powershell
py -m pip install -r requirements.txt
py database.py
```

The connection reads `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and
`DB_PASSWORD` from `.env`. It prints the connected database and PostgreSQL version
without exposing credentials.

## GitHub Pages deployment

GitHub Pages hosts the frontend only. MySQL and `server.js` must run on a
separate host. `render.yaml` provides a Render backend blueprint. Create a
hosted MySQL database, deploy the blueprint, and set its `DB_*` and Razorpay
environment variables in Render.

After creating the Render database, copy its internal connection string into the
backend service environment variable `DATABASE_URL`. After the backend is
deployed, add a GitHub Actions repository variable named
`GOQUICK_API_URL` containing the backend URL ending in `/api`. The Pages
workflow writes that value into `config.js` during deployment. If the variable
is missing, the local relative `/api` fallback is used.

For local development, `config.js` keeps the API on the same origin. A manual
override still works:

```html
<script>
  window.GOQUICK_API_URL = "https://your-api-host.example.com/api";
</script>
<script src="config.js"></script>
<script src="script.js"></script>
```

## API

- `GET /api/health`: database connectivity check
- `GET /api/products`: list products; add `?category=Fruits` to filter
- `POST /api/auth/register`: `{ "name", "email", "password" }`
- `POST /api/auth/login`: `{ "email", "password" }`
- `GET /api/cart`: authenticated cart
- `POST /api/cart/items`: authenticated `{ "productId", "quantity" }`
- `POST /api/orders`: authenticated `{ "shippingAddress" }`

The browser exposes the same calls through `window.GoQuickAPI`. Registration stores a bcrypt password hash and the database-generated `created_at` value in `users`; login verifies that hash and stores a JWT in `localStorage`. Product add buttons sync with PostgreSQL automatically.
