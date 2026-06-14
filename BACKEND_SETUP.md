# Malteaser Backend Setup

The storefront is dynamic and reads catalog content from Supabase when configured.

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
