# Malteaser Backend Setup

The storefront is dynamic and reads catalog content from Supabase when configured.

1. Create a free Supabase project.
2. Open the Supabase SQL Editor and run `supabase-schema.sql`.
3. In Authentication, create one administrator user with your chosen email and password.
4. Disable public user sign-ups in Authentication settings.
5. Copy the Project URL and public anon key into `supabase-config.js`.
6. Commit and push `supabase-config.js`.
7. Open the private admin URL: `/admin.html`.

Never put the Supabase service-role key in this repository. The public anon key is intended for browser use; Row Level Security protects write operations.
