# GoQuick Grocery

## PostgreSQL setup

1. Install PostgreSQL locally, or create a Render PostgreSQL database from the Render dashboard.
2. Copy `.env.example` to `.env` and set `DB_USER`, `DB_PASSWORD`, and `JWT_SECRET`.
   For UPI checkout, also add your Razorpay test credentials: `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
   Run `migrate-order-payments.sql` only for existing MySQL databases to store Razorpay transaction IDs.
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

GitHub Pages hosts the frontend only. The PostgreSQL API runs separately on
Render using `server-pg.js`. Deploy the service from `render.yaml`, then set
`DATABASE_URL` to the internal connection string of your Render PostgreSQL
database and set the Razorpay environment variables if needed.

Set `CORS_ORIGIN` on the Render web service to your complete GitHub Pages origin,
for example `https://purush432.github.io`. Add a GitHub Actions repository
variable named `GOQUICK_API_URL` containing the Render backend URL ending in
`/api`, for example `https://grocery-1-sabr.onrender.com/api`. The Pages workflow
also appends `/api` automatically if only the Render service URL is entered.

Run `schema-postgres.sql` once against the Render database in pgAdmin or with
`psql` before creating accounts. The registration endpoint then inserts the
name, email, bcrypt password hash, and timestamp into `users`.

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
