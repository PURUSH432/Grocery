# GoQuick Grocery

## MySQL setup

1. Install and start MySQL 8.
2. Copy `.env.example` to `.env` and set `DB_USER`, `DB_PASSWORD`, and `JWT_SECRET`.
   For UPI checkout, also add your Razorpay test credentials: `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
   Run `migrate-order-payments.sql` for existing databases to store Razorpay transaction IDs.
3. Create the database and seed the products:

```powershell
mysql -u root -p < schema.sql

# For an existing database, also run the order fields migration:
Get-Content .\migrate-orders.sql | mysql -u root -p
```

4. Install dependencies and start the application:

```powershell
npm install
npm start
```

Open `http://localhost:4173`.

## GitHub Pages deployment

GitHub Pages hosts the frontend only. Deploy `server.js` and its MySQL database
to a Node.js host, then define `window.GOQUICK_API_URL` before `script.js` in
`index.html`, for example:

```html
<script>
  window.GOQUICK_API_URL = "https://your-api-host.example.com/api";
</script>
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

The browser exposes the same calls through `window.GoQuickAPI`. After login, its token is stored in `localStorage`, and product add buttons sync with MySQL automatically.
