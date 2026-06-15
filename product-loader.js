/**
 * Malteaser Product Loader
 * Dynamically loads and displays product details from URL parameters
 */

(function () {
  "use strict";

  // Product database with all 12 Ferris wheel products
  const FERRIS_PRODUCTS = {
    "ferris-wheel-1-1": {
      id: "ferris-wheel-1-1",
      title: "Atelier Tee 01",
      price: 1590,
      description: "Essential, versatile white tee with refined tailoring. Perfect for everyday elegance.",
      image_url: "assets/white-tshirt.svg",
      section: "ferris-wheel",
      label: "Essential Forms - Wheel 1",
      sizes: ["S", "M", "L", "XL"],
      details: {
        fabric: "100% organic cotton, premium weave, soft-touch finish",
        styling: "Layer with blazers or wear solo for a clean, modern look",
        delivery: "2-3 working days dispatch, 3-7 days delivery across India",
        returns: "7 days for exchange or return. Items must be unworn with tags."
      }
    },
    "ferris-wheel-1-2": {
      id: "ferris-wheel-1-2",
      title: "Contour Tee 02",
      price: 1690,
      description: "Sculpted fit with subtle contour lines. Modern elegance with structure.",
      image_url: "assets/white-tshirt.svg",
      section: "ferris-wheel",
      label: "Essential Forms - Wheel 1",
      sizes: ["S", "M", "L", "XL"],
      details: {
        fabric: "Cotton-blend jersey, contoured seaming, breathable structure",
        styling: "Pair with tailored trousers or flowing skirts for visual balance",
        delivery: "2-3 working days dispatch, 3-7 days delivery across India",
        returns: "7 days for exchange or return. Items must be unworn with tags."
      }
    },
    "ferris-wheel-1-3": {
      id: "ferris-wheel-1-3",
      title: "Signature Tee 03",
      price: 1790,
      description: "Our signature collection tee. Timeless, refined, versatile.",
      image_url: "assets/white-tshirt.svg",
      section: "ferris-wheel",
      label: "Essential Forms - Wheel 1",
      sizes: ["S", "M", "L", "XL"],
      details: {
        fabric: "Premium cotton, hand-finished seams, reinforced structure",
        styling: "Works with anything. Tuck, layer, or wear loose.",
        delivery: "2-3 working days dispatch, 3-7 days delivery across India",
        returns: "7 days for exchange or return. Items must be unworn with tags."
      }
    },
    "ferris-wheel-1-4": {
      id: "ferris-wheel-1-4",
      title: "Studio Tee 04",
      price: 1650,
      description: "Designed in our studio. Minimalist perfection for the modern woman.",
      image_url: "assets/white-tshirt.svg",
      section: "ferris-wheel",
      label: "Essential Forms - Wheel 1",
      sizes: ["S", "M", "L", "XL"],
      details: {
        fabric: "Lightweight cotton blend, minimal seaming, comfort fit",
        styling: "Perfect base layer for any wardrobe. Mix and match freely.",
        delivery: "2-3 working days dispatch, 3-7 days delivery across India",
        returns: "7 days for exchange or return. Items must be unworn with tags."
      }
    },
    "ferris-wheel-2-1": {
      id: "ferris-wheel-2-1",
      title: "Maison Tee 05",
      price: 1890,
      description: "Luxury white collection by Maison Blanc. Elevated everyday wear.",
      image_url: "assets/white-tshirt.svg",
      section: "ferris-wheel",
      label: "Maison Blanc - Wheel 2",
      sizes: ["S", "M", "L", "XL"],
      details: {
        fabric: "Egyptian cotton, luxury finish, premium hand-feel",
        styling: "Wear with elegant trousers or under structured dresses.",
        delivery: "2-3 working days dispatch, 3-7 days delivery across India",
        returns: "7 days for exchange or return. Items must be unworn with tags."
      }
    },
    "ferris-wheel-2-2": {
      id: "ferris-wheel-2-2",
      title: "Sculpt Tee 06",
      price: 1990,
      description: "Strategic sculpting for a flattering silhouette. Confidence in a tee.",
      image_url: "assets/white-tshirt.svg",
      section: "ferris-wheel",
      label: "Maison Blanc - Wheel 2",
      sizes: ["S", "M", "L", "XL"],
      details: {
        fabric: "Cotton elastane blend, strategic shaping, breathable",
        styling: "Perfect for layering or wearing as a statement piece.",
        delivery: "2-3 working days dispatch, 3-7 days delivery across India",
        returns: "7 days for exchange or return. Items must be unworn with tags."
      }
    },
    "ferris-wheel-2-3": {
      id: "ferris-wheel-2-3",
      title: "Gallery Tee 07",
      price: 2090,
      description: "Gallery-quality fabric and finish. Museum-piece elegance.",
      image_url: "assets/white-tshirt.svg",
      section: "ferris-wheel",
      label: "Maison Blanc - Wheel 2",
      sizes: ["S", "M", "L", "XL"],
      details: {
        fabric: "Premium cotton with silk-blend finish, ultra-soft touch",
        styling: "Versatile enough for day, elevated enough for evening.",
        delivery: "2-3 working days dispatch, 3-7 days delivery across India",
        returns: "7 days for exchange or return. Items must be unworn with tags."
      }
    },
    "ferris-wheel-2-4": {
      id: "ferris-wheel-2-4",
      title: "Icon Tee 08",
      price: 2190,
      description: "The iconic tee. Recognizable, unforgettable, timeless.",
      image_url: "assets/white-tshirt.svg",
      section: "ferris-wheel",
      label: "Maison Blanc - Wheel 2",
      sizes: ["S", "M", "L", "XL"],
      details: {
        fabric: "Signature Malteaser blend, hand-crafted details, premium feel",
        styling: "A wardrobe essential that transcends trends.",
        delivery: "2-3 working days dispatch, 3-7 days delivery across India",
        returns: "7 days for exchange or return. Items must be unworn with tags."
      }
    },
    "ferris-wheel-3-1": {
      id: "ferris-wheel-3-1",
      title: "Pure Tee 09",
      price: 1690,
      description: "Pure simplicity. Pure quality. Modern classic.",
      image_url: "assets/white-tshirt.svg",
      section: "ferris-wheel",
      label: "Modern Classics - Wheel 3",
      sizes: ["S", "M", "L", "XL"],
      details: {
        fabric: "100% pure cotton, single-thread construction, minimal processing",
        styling: "Understated elegance. Wear with anything, anywhere.",
        delivery: "2-3 working days dispatch, 3-7 days delivery across India",
        returns: "7 days for exchange or return. Items must be unworn with tags."
      }
    },
    "ferris-wheel-3-2": {
      id: "ferris-wheel-3-2",
      title: "Line Tee 10",
      price: 1790,
      description: "Clean lines, perfect proportions. Geometry of elegance.",
      image_url: "assets/white-tshirt.svg",
      section: "ferris-wheel",
      label: "Modern Classics - Wheel 3",
      sizes: ["S", "M", "L", "XL"],
      details: {
        fabric: "Cotton with architectural seaming, precision tailoring",
        styling: "The foundation piece every wardrobe needs.",
        delivery: "2-3 working days dispatch, 3-7 days delivery across India",
        returns: "7 days for exchange or return. Items must be unworn with tags."
      }
    },
    "ferris-wheel-3-3": {
      id: "ferris-wheel-3-3",
      title: "Form Tee 11",
      price: 1890,
      description: "Form follows function. Beauty in simplicity.",
      image_url: "assets/white-tshirt.svg",
      section: "ferris-wheel",
      label: "Modern Classics - Wheel 3",
      sizes: ["S", "M", "L", "XL"],
      details: {
        fabric: "Premium weight cotton, superior drape, lasting comfort",
        styling: "Designed to look better with time and wear.",
        delivery: "2-3 working days dispatch, 3-7 days delivery across India",
        returns: "7 days for exchange or return. Items must be unworn with tags."
      }
    },
    "ferris-wheel-3-4": {
      id: "ferris-wheel-3-4",
      title: "Archive Tee 12",
      price: 1990,
      description: "From our archives: timeless pieces that define Malteaser.",
      image_url: "assets/white-tshirt.svg",
      section: "ferris-wheel",
      label: "Modern Classics - Wheel 3",
      sizes: ["S", "M", "L", "XL"],
      details: {
        fabric: "Archival-quality cotton, vintage finish, heirloom piece",
        styling: "Collect them. Pass them on. They endure.",
        delivery: "2-3 working days dispatch, 3-7 days delivery across India",
        returns: "7 days for exchange or return. Items must be unworn with tags."
      }
    }
  };

  function loadProductFromUrl() {
    const params = new URLSearchParams(location.search);
    const productId = params.get("id");

    if (!productId || !FERRIS_PRODUCTS[productId]) {
      console.warn(`Product not found: ${productId}`);
      return null;
    }

    return FERRIS_PRODUCTS[productId];
  }

  function formatPrice(price) {
    return `Rs. ${Number(price).toLocaleString("en-IN")}`;
  }

  function populateProductPage(product) {
    if (!product) return;

    // Update title and meta
    document.title = `${product.title} | Malteaser`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", `${product.title} - ${product.description}`);
    }

    // Update image
    const mainImage = document.getElementById("mainProductImage");
    if (mainImage) {
      mainImage.src = product.image_url;
      mainImage.alt = product.title;
    }

    // Update product info
    const titleEl = document.querySelector("[data-product-title]");
    if (titleEl) titleEl.textContent = product.title;

    const priceEl = document.querySelector("[data-product-price]");
    if (priceEl) priceEl.textContent = formatPrice(product.price);

    const descEl = document.querySelector("[data-product-description]");
    if (descEl) descEl.textContent = product.description;

    // Update product label
    const labelEl = document.querySelector(".eyebrow");
    if (labelEl) labelEl.textContent = product.label;

    // Update details sections
    const fabricEl = document.querySelector("details:nth-of-type(1) > p");
    if (fabricEl) fabricEl.textContent = product.details.fabric;

    const stylingEl = document.querySelector("details:nth-of-type(2) > p");
    if (stylingEl) stylingEl.textContent = product.details.styling;

    const deliveryEl = document.querySelector("details:nth-of-type(3) > p");
    if (deliveryEl) deliveryEl.textContent = product.details.delivery;

    const returnsEl = document.querySelector("details:nth-of-type(4) > p");
    if (returnsEl) returnsEl.textContent = product.details.returns;

    // Store product in window for cart functionality
    window.CURRENT_PRODUCT = product;
  }

  // Load product when page is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      const product = loadProductFromUrl();
      populateProductPage(product);
    });
  } else {
    const product = loadProductFromUrl();
    populateProductPage(product);
  }

  // Export for testing
  window.MalteaserProductLoader = {
    loadProductFromUrl,
    populateProductPage,
    FERRIS_PRODUCTS
  };
})();
