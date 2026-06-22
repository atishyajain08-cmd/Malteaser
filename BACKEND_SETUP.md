# Malteaser Backend Setup

The storefront is dynamic and reads catalog content from Supabase when configured.

Each catalogue item can store multiple ordered product photos. In the admin
uploader, select the front, back, side, and detail images together; they are
saved as one product gallery, with the first selected image used as the cover.
The admin also accepts one cover thumbnail plus a PDF of up to 12 pages. Each
PDF page is converted into a customer-facing gallery image before upload.

Homepage 3D Flash Cards use fixed database positions: Flash Card 1, 2, or 3,
with positions 1 through 5 inside each card. The database permits one active
product per position, keeping the homepage total at exactly 15 available slots.

1. Create a free Supabase project.
2. Open the Supabase SQL Editor and run `supabase-schema.sql`.
3. In Authentication, create one administrator user with your chosen email and password.
4. Keep email/password sign-ups enabled so customers can create accounts.
5. Copy the Project URL and public anon key into `supabase-config.js`.
6. Commit and push `supabase-config.js`.
7. Open the private admin URL: `/admin.html`.

Never put the Supabase service-role key in this repository. The public anon key is intended for browser use; Row Level Security protects write operations.

## Customer Authentication URLs

In Supabase, open **Authentication > URL Configuration** and set:

- Site URL: `https://atishyajain08-cmd.github.io/Malteaser/`
- Redirect URL: `https://atishyajain08-cmd.github.io/Malteaser/account.html`
- Redirect URL: `https://atishyajain08-cmd.github.io/Malteaser/reset-password.html`
- Local testing redirect: `http://localhost:4173/**`

The static storefront uses these public client values:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

They currently map to `url` and `anonKey` in `supabase-config.js`. Passwords and session tokens are handled by Supabase Auth and must never be added to repository files or logs.

## Orders, Shipping, and Confirmation Emails

Run `supabase-schema.sql` again after this update. It creates the `orders` table used by checkout, customer order history, and the admin order dashboard.

When a customer places an order:

- The order is saved in Supabase with an order number.
- The ordered quantity is deducted from the selected S, M, L, or XL inventory in the same database transaction.
- If stock changed while the customer was shopping, checkout stops and asks them to adjust their bag instead of overselling.
- The admin backend shows customer name, email, phone, delivery address, products, total, payment status, email status, and shipping status.
- The customer is sent to `order-confirmation.html`.
- A Supabase Edge Function named `send-order-email` can send the customer a confirmation email.

To enable confirmation emails, deploy `supabase/functions/send-order-email` and set these Supabase function secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `ORDER_FROM_EMAIL`, for example `Malteaser <orders@yourdomain.com>`

The service-role key and Resend key must stay inside Supabase secrets only. Do not add them to `supabase-config.js`, HTML, JavaScript, GitHub, or any public file.

If the email function is not deployed yet, orders will still be saved and visible in the admin backend. The email status will remain `pending` or `failed` until the function is configured.
