# Malteaser — Premium Women's Fashion E-Commerce

A modern, fully-functional e-commerce storefront for **Malteaser**, a luxury women's fashion brand. Built with vanilla HTML/CSS/JavaScript and **Supabase** backend for dynamic product management, customer authentication, and cart functionality.

![Malteaser | Where Vibrance Meets Elegance](https://img.shields.io/badge/Status-Live-brightgreen?style=flat)
![Deployment](https://img.shields.io/badge/Deployed-GitHub%20Pages-blue?style=flat)
![Backend](https://img.shields.io/badge/Backend-Supabase-blueviolet?style=flat)

---

## Features

### 🛍️ Storefront
- **Homepage** — Luxury hero with animated beach scene and rotating model outfits
- **Shop** — New arrivals with filters, search, and sort
- **Collections** — Curated product collections  
- **Lookbook** — Inspirational outfit pairings
- **Product Page** — Detailed views with size/color variants, wishlist, and cart
- **Cart & Checkout** — Full checkout flow with cart summary
- **Wishlist** — Save favorites for later

### 🎡 Signature Feature: Ferris Wheel Gallery
- **3D Ferris wheel product showcases** on homepage
- Animated 3D rotation with hover effects
- Each wheel displays 4 products at a time
- Admin-editable product assignments (see [Admin](#-admin-panel))

### 👤 Customer Features
- **Authentication** — Sign up, login, password reset via Supabase Auth
- **User Accounts** — View order history, saved preferences
- **Cart Persistence** — Cart data stored in localStorage + Supabase
- **Wishlist** — Heart-icon save-to-wishlist functionality
- **Search & Sort** — Find products by name, filter by category
- **Coupon Support** — Apply discount codes at checkout
- **Size Guide** — Detailed fit and measurement reference

### ⚙️ Admin Panel
- **Product Management** — Add, edit, publish/unpublish products
- **Image Upload** — Direct image upload to Supabase storage
- **Inventory Tracking** — Size-based stock limits (S, M, L, XL)
- **Ferris Wheel Assignment** — Assign products to one of 3 wheels (1–3)
- **New Arrivals Filter** — Tag products as new arrivals
- **CSV Export** — Download catalog as spreadsheet
- **Bulk Operations** — Manage multiple products at once

---

## Tech Stack

| Layer | Tech |
|-------|------|
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES6+) |
| **Styling** | Custom CSS with CSS variables, responsive design |
| **Animations** | CSS animations, Framer Motion-style effects, parallax scrolling |
| **Icons** | Lucide Icons (via CDN) |
| **Backend** | [Supabase](https://supabase.com) (PostgreSQL + Auth + Storage) |
| **Hosting** | [GitHub Pages](https://pages.github.com) (gh-pages branch) |
| **Version Control** | Git + GitHub |

---

## Project Structure

```
malteaser-github/
├── index.html                 # Homepage with hero and Ferris wheels
├── shop.html                  # New arrivals grid
├── product.html               # Product detail page
├── collections.html           # Collections showcase
├── lookbook.html              # Inspirational lookbook
├── cart.html                  # Shopping cart
├── wishlist.html              # Saved favorites
├── checkout.html              # Checkout flow
│
├── login.html                 # Customer login
├── signup.html                # Customer signup
├── account.html               # User account dashboard
├── reset-password.html        # Password reset
├── forgot-password.html       # Forgot password flow
│
├── admin.html                 # Admin panel (private)
├── admin.js                   # Admin logic (product CRUD, uploads)
├── admin-popup.css            # Admin modal styling
│
├── catalog.js                 # Product data management (fetch, filter, sort)
├── auth.js                    # Supabase Auth helpers
├── script.js                  # Global UI, navigation, cart
│
├── styles.css                 # Main stylesheet
├── supabase-config.js         # Supabase connection credentials
├── supabase-schema.sql        # Database schema (run once in Supabase)
│
├── data/
│   └── catalog.json           # Local fallback products (7 starters)
│
├── assets/
│   ├── malteaser-logo.png     # Brand logo
│   ├── white-tshirt.svg       # Placeholder image
│   └── vendor/
│       └── supabase.min.js    # Supabase JS client
│
├── BACKEND_SETUP.md           # Backend configuration guide
└── README.md                  # This file
```

---

## Quick Start

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/atishyajain08-cmd/Malteaser.git
   cd Malteaser
   ```

2. **Start a local server** (needed for Supabase auth redirects):
   ```bash
   # Using Python 3:
   python3 -m http.server 4173

   # Or Node.js (if installed):
   npx http-server -p 4173
   ```

3. **Open in browser:**
   ```
   http://localhost:4173
   ```

4. **Supabase must be configured** (see [Backend Setup](#backend-setup) below)

### Live Site

Visit the live storefront:  
🌐 **https://atishyajain08-cmd.github.io/Malteaser/**

---

## Backend Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project (select a region close to your users)
3. Copy the **Project URL** and **Anon Key** (you'll need these next)

### 2. Initialize the Database

1. In your Supabase project, open **SQL Editor**
2. Paste the contents of `supabase-schema.sql` and execute it
3. This creates tables for:
   - `products` — Product catalog with images, prices, descriptions
   - `cart_items` — Shopping cart storage
   - `wishlist_items` — Customer wishlist
   - `ferris_wheels` — Wheel-to-product assignments (1–3)

### 3. Set Up Authentication

1. Go to **Authentication > Users**
2. Create an **admin user** with your email and password
   - This user can access `/admin.html`
3. Keep **Email & Password sign-up enabled** so customers can register

### 4. Configure Credentials

Update `supabase-config.js` with your credentials:

```javascript
window.MALTEASER_SUPABASE = {
  url: "https://YOUR_PROJECT_URL.supabase.co",
  anonKey: "YOUR_ANON_KEY"  // This is safe to commit; it's a public key
};
```

⚠️ **Never commit the service-role key.** Use only the public `anonKey`.

### 5. Set Up Auth Redirects

In Supabase, go to **Authentication > URL Configuration** and add:

**Allowed Redirect URLs:**
- `https://atishyajain08-cmd.github.io/Malteaser/account.html`
- `https://atishyajain08-cmd.github.io/Malteaser/reset-password.html`
- `http://localhost:4173/**` (for local testing)

### 6. Upload Images to Supabase

1. In Supabase, go to **Storage**
2. Create a bucket called `product-images`
3. Set the bucket to **Public** so images are accessible
4. Upload product images here
5. In admin panel, use the image upload flow to link products to images

---

## Usage Guide

### 👨‍💼 For Admins

1. **Open the admin panel:** `https://site.com/admin.html`
2. **Sign in** with your admin credentials
3. **Add Products:**
   - Click "New Product"
   - Fill title, description, price, sizes
   - Upload image
   - Select section (New Arrivals, Collections, Lookbook, Product)
   - Assign to Ferris Wheel (optional, 1–3)
   - Click "Publish"

4. **Manage Ferris Wheels:**
   - Each wheel shows 4 products
   - Assign via dropdown in product editor
   - Wheels rotate on homepage

5. **Export Catalog:**
   - Click "Export as CSV" to download product list

### 👤 For Customers

1. **Browse products** on /shop.html
2. **Add to cart** from product detail
3. **Create account** to save wishlist
4. **Checkout** (currently a placeholder; integrate payment when ready)

---

## File Breakdown

### Core Files

| File | Purpose |
|------|---------|
| `catalog.js` | Fetch products from Supabase or local fallback; handle filters, search, sort |
| `auth.js` | Supabase Auth helpers: login, signup, password reset, user session |
| `script.js` | Global UI: navigation, cart display, wishlist button, theme toggle |
| `admin.js` | Admin CRUD: create/edit/delete products, upload images, assign to wheels |
| `styles.css` | All styling: layout, animations, responsive design, Ferris wheel CSS |

### Pages

| Page | Purpose |
|------|---------|
| `index.html` | Homepage: hero, marquee, Ferris wheels, newsletter signup |
| `shop.html` | New arrivals grid with filters |
| `product.html` | Single product detail: variants, wishlist, add to cart |
| `collections.html` | Collections showcase |
| `lookbook.html` | Outfit inspiration gallery |
| `cart.html` | Shopping cart review + checkout |
| `wishlist.html` | Saved favorites |
| `admin.html` | Admin product management panel |

### Configuration

| File | Purpose |
|------|---------|
| `supabase-config.js` | Supabase connection (URL + anon key) |
| `supabase-schema.sql` | Database schema to run once |
| `.env.example` | Environment variables reference (not used currently) |

---

## Current Product Catalog (Starters)

The project ships with 7 starter products in `data/catalog.json`:

| Product | Price | Section |
|---------|-------|---------|
| Blush Satin Co-ord | Rs. 2,850 | New Arrivals |
| Goldline Midi Set | Rs. 3,450 | New Arrivals |
| Casual Chic | Rs. 1,999 | Collections |
| Workwear Elegance | Rs. 2,499 | Collections |
| Soft Tailoring | Rs. 2,199 | Lookbook |
| Blush After Dark | Rs. 2,799 | Lookbook |
| Aurelian Wrap Dress | Rs. 3,250 | Product |

**Add more via the admin panel** (`/admin.html`).

---

## Ferris Wheel Product Showcase

### How It Works

- **3 rotating wheels** on the homepage, each displaying 4 products
- Products assigned via admin panel dropdown (Wheel 1, 2, or 3)
- CSS animations and JavaScript handle the 3D rotation
- Click to explore or add to cart

### To Assign Products

1. In `/admin.html`, edit or create a product
2. Select which Ferris wheel (1, 2, or 3) or leave blank
3. Save — product appears on homepage

---

## Image Management

### Placeholder Images
Currently, all products use `assets/white-tshirt.svg` as a placeholder.

### Replace with Real Images
1. **Upload to Supabase Storage:**
   - Go to Supabase > Storage > `product-images` bucket
   - Upload your product images
   - Copy the public URL: `https://your-bucket.supabase.co/storage/v1/object/public/product-images/filename.jpg`

2. **Update product via admin panel:**
   - Edit the product
   - Paste the full image URL into the image field
   - Save

3. **Or update `data/catalog.json` locally** for fallback products:
   ```json
   {
     "id": "my-product",
     "title": "My Product",
     "image_url": "https://your-bucket.supabase.co/storage/v1/object/public/product-images/my-product.jpg",
     ...
   }
   ```

---

## Deployment

### Automatic Deployment (GitHub Pages)
The site is automatically deployed to GitHub Pages from the `gh-pages` branch.

**To deploy changes:**
```bash
git add .
git commit -m "Update: <description>"
git push origin gh-pages
```

Changes go live within 1–2 minutes.

### Custom Domain
If you own a domain (e.g., `malteaser.com`):
1. In your domain registrar, create a CNAME record pointing to `atishyajain08-cmd.github.io`
2. In GitHub repo settings > Pages, set custom domain
3. GitHub will automatically manage SSL

---

## Troubleshooting

### "Products not loading"
- ✅ Check Supabase config in `supabase-config.js`
- ✅ Verify Supabase project is active
- ✅ Check browser console for errors (F12 > Console)
- ✅ Fallback to `data/catalog.json` works even without Supabase

### "Admin panel not loading"
- ✅ Verify you're signed in as the admin user
- ✅ Check Supabase URL Configuration redirects include `/admin.html`
- ✅ Clear browser cookies and try again

### "Images not showing"
- ✅ Verify Supabase storage bucket is **Public**
- ✅ Check image URL is correct (full path, not relative)
- ✅ Verify image exists in Supabase

### "Cart not persisting"
- ✅ Browser must allow localStorage (not in private mode)
- ✅ Check browser console for storage quota errors

---

## Future Enhancements

- [ ] Payment integration (Stripe, Razorpay)
- [ ] Order management dashboard
- [ ] Email confirmations
- [ ] SMS notifications
- [ ] Analytics dashboard
- [ ] Inventory tracking alerts
- [ ] Customer review system
- [ ] Referral program
- [ ] Mobile app (React Native)
- [ ] Multi-language support

---

## Contributing

1. **Fork the repository**
2. **Create a feature branch:** `git checkout -b feature/your-feature`
3. **Make changes and commit:** `git commit -m "Add: your feature"`
4. **Push to your fork:** `git push origin feature/your-feature`
5. **Open a pull request** to `gh-pages` branch

---

## License

This project is proprietary to **Malteaser**. All rights reserved.

---

## Support & Contact

- **Email:** support@malteaser.com
- **GitHub Issues:** [Report a bug](https://github.com/atishyajain08-cmd/Malteaser/issues)
- **Admin Help:** See [BACKEND_SETUP.md](./BACKEND_SETUP.md)

---

## Changelog

### Recent Updates
- ✨ Added Ferris wheel product showcase with 3D rotation
- ✨ Admin panel now supports wheel assignment
- ✨ Supabase backend fully integrated
- ✨ Customer authentication complete
- ✨ Cart, wishlist, and search live

See [git log](https://github.com/atishyajain08-cmd/Malteaser/commits/gh-pages) for full history.

---

**Made with ❤️ for Malteaser** — Where Vibrance Meets Elegance
