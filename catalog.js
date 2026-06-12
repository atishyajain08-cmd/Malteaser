(function () {
  const config = window.MALTEASER_SUPABASE || {};
  const isConfigured = Boolean(config.url && config.anonKey && window.supabase);
  const isAdmin = location.pathname.endsWith("/admin.html");
  const adminTabKey = "malteaser_admin_tab_id";
  let storageKey;
  if (isAdmin) {
    storageKey = sessionStorage.getItem(adminTabKey);
    if (!storageKey) {
      storageKey = crypto.randomUUID();
      sessionStorage.setItem(adminTabKey, storageKey);
    }
  }
  const client = isConfigured ? window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      detectSessionInUrl: false,
      persistSession: isAdmin,
      storage: isAdmin ? sessionStorage : undefined,
      storageKey: isAdmin ? `malteaser-admin-${storageKey}` : "malteaser-catalog"
    }
  }) : null;
  const localKey = "malteaser_catalog_items";
  const cartKey = "malteaser_cart";
  const wishlistKey = "malteaser_wishlist";
  let catalogItems = [];
  let activeArrivalFilter = "all";

  function formatPrice(value) {
    const price = Number(value || 0);
    return `Rs. ${price.toLocaleString("en-IN")}`;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function readStored(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  function writeStored(key, items) {
    localStorage.setItem(key, JSON.stringify(items));
    updateHeaderCounts();
  }

  function normalizedItem(item) {
    return {
      id: String(item.id),
      title: item.title || "Malteaser Product",
      description: item.description || "",
      price: Number(item.price || 0),
      section: item.section || "product",
      label: item.label || "Malteaser",
      image_url: item.image_url || "assets/white-tshirt.svg",
      size: item.size || ""
    };
  }

  function isSaved(key, id) {
    return readStored(key).some((item) => String(item.id) === String(id));
  }

  function updateHeaderCounts() {
    const cartCount = readStored(cartKey).reduce((total, item) => total + Number(item.quantity || 1), 0);
    const wishlistCount = readStored(wishlistKey).length;
    document.querySelectorAll(".cart-button span").forEach((count) => {
      count.textContent = cartCount;
      count.hidden = cartCount === 0;
    });
    document.querySelectorAll("[data-wishlist-count]").forEach((count) => {
      count.textContent = wishlistCount;
      count.hidden = wishlistCount === 0;
    });
  }

  function addToCart(item) {
    const cart = readStored(cartKey);
    const normalized = normalizedItem(item);
    const existing = cart.find((entry) =>
      String(entry.id) === normalized.id && String(entry.size || "") === normalized.size
    );
    if (existing) existing.quantity = Number(existing.quantity || 1) + 1;
    else cart.push({ ...normalized, quantity: 1 });
    writeStored(cartKey, cart);
    showCartConfirmation(normalized);
  }

  function toggleWishlist(item) {
    const wishlist = readStored(wishlistKey);
    const index = wishlist.findIndex((entry) => String(entry.id) === String(item.id));
    if (index >= 0) wishlist.splice(index, 1);
    else wishlist.push(normalizedItem(item));
    writeStored(wishlistKey, wishlist);
    return index < 0;
  }

  function itemData(item) {
    return escapeHtml(encodeURIComponent(JSON.stringify(normalizedItem(item))));
  }

  async function loadFallback() {
    const response = await fetch("data/catalog.json");
    const starter = await response.json();
    const local = JSON.parse(localStorage.getItem(localKey) || "[]");
    return [...local, ...starter];
  }

  async function loadCatalog() {
    if (!client) return loadFallback();
    const { data, error } = await client
      .from("catalog_items")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  function productCard(item) {
    const saved = isSaved(wishlistKey, item.id);
    return `
      <article class="product-card is-visible">
        <button class="wishlist${saved ? " is-active" : ""}" type="button" data-wishlist-item="${itemData(item)}" aria-label="${saved ? "Remove" : "Add"} ${escapeHtml(item.title)} ${saved ? "from" : "to"} wishlist"><i data-lucide="heart"></i></button>
        <a class="product-card__image" href="product.html?id=${encodeURIComponent(item.id)}">
          <img src="${escapeHtml(item.image_url || "assets/white-tshirt.svg")}" alt="${escapeHtml(item.title)}">
        </a>
        <div class="product-card__body">
          <span>${escapeHtml(item.label || "Malteaser")}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${formatPrice(item.price)}</p>
          <div class="product-card__actions">
            <button class="button button--dark" type="button" data-cart-item="${itemData(item)}"><i data-lucide="shopping-bag"></i> Add to Cart</button>
            <button class="button button--light" type="button" data-wishlist-item="${itemData(item)}"><i data-lucide="heart"></i> ${saved ? "Wishlisted" : "Wishlist"}</button>
          </div>
          <a class="text-button" href="product.html?id=${encodeURIComponent(item.id)}">View details</a>
        </div>
      </article>`;
  }

  function arrivalCategory(item) {
    const value = String(item.label || "").toLowerCase();
    if (value.includes("work")) return "workwear";
    if (value.includes("even")) return "evening";
    return "casual";
  }

  function renderArrivalProducts() {
    const container = document.querySelector('[data-catalog-section="new-arrivals"]');
    if (!container) return;
    const arrivals = catalogItems.filter((item) => item.section === "new-arrivals");
    const filtered = activeArrivalFilter === "all"
      ? arrivals
      : arrivals.filter((item) => arrivalCategory(item) === activeArrivalFilter);
    container.innerHTML = filtered.map(productCard).join("");
    const empty = document.querySelector("[data-arrival-empty]");
    if (empty) empty.hidden = filtered.length > 0;
    window.lucide?.createIcons();
  }

  function renderProduct(item) {
    const root = document.querySelector("[data-product-detail]");
    if (!root || !item) return;
    root.querySelector("[data-product-image]").src = item.image_url || "assets/white-tshirt.svg";
    root.querySelector("[data-product-image]").alt = item.title;
    root.querySelector("[data-product-title]").textContent = item.title;
    root.querySelector("[data-product-price]").textContent = formatPrice(item.price);
    root.querySelector("[data-product-description]").textContent = item.description || "";
    root.querySelectorAll("[data-product-action]").forEach((button) => {
      button.dataset[button.dataset.productAction === "cart" ? "cartItem" : "wishlistItem"] = itemData(item);
    });
  }

  function renderCart() {
    const root = document.querySelector("[data-cart-items]");
    const totalRoot = document.querySelector("[data-cart-total]");
    if (!root) return;
    const cart = readStored(cartKey);
    root.innerHTML = cart.map((item) => `
      <article class="cart-line" data-cart-row="${escapeHtml(item.id)}">
        <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}">
        <div class="cart-line__details">
          <h3>${escapeHtml(item.title)}</h3>
          <p>Size: ${escapeHtml(item.size || "M")} &nbsp; Quantity: ${Number(item.quantity || 1)}</p>
          <button class="cart-line__delete" type="button" data-remove-cart="${escapeHtml(`${item.id}::${item.size || ""}`)}" aria-label="Delete ${escapeHtml(item.title)} size ${escapeHtml(item.size || "M")} from bag"><i data-lucide="trash-2"></i> Delete</button>
        </div>
        <strong>${formatPrice(Number(item.price) * Number(item.quantity || 1))}</strong>
      </article>`).join("") || '<div class="empty-state"><h2>Your cart is empty.</h2><a class="button button--dark" href="shop.html">Explore Products</a></div>';
    const total = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity || 1), 0);
    if (totalRoot) totalRoot.textContent = formatPrice(total);
    window.lucide?.createIcons();
  }

  function renderWishlist() {
    const root = document.querySelector("[data-wishlist-items]");
    if (!root) return;
    const wishlist = readStored(wishlistKey);
    root.innerHTML = wishlist.map(productCard).join("") || '<div class="empty-state"><h2>Your wishlist is empty.</h2><a class="button button--dark" href="shop.html">Discover Products</a></div>';
  }

  function flashButton(button, text) {
    const original = button.innerHTML;
    button.innerHTML = `<i data-lucide="check"></i> ${text}`;
    window.lucide?.createIcons();
    setTimeout(() => {
      button.innerHTML = original;
      window.lucide?.createIcons();
    }, 1200);
  }

  function showCartConfirmation(item) {
    let notice = document.querySelector("[data-cart-confirmation]");
    if (!notice) {
      notice = document.createElement("div");
      notice.className = "cart-confirmation";
      notice.dataset.cartConfirmation = "";
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      document.body.appendChild(notice);
    }
    notice.innerHTML = `
      <div>
        <strong>Added to your bag</strong>
        <span>${escapeHtml(item.title)} · Size ${escapeHtml(item.size)}</span>
      </div>
      <a href="cart.html">View Bag</a>`;
    notice.classList.remove("is-visible");
    requestAnimationFrame(() => notice.classList.add("is-visible"));
    clearTimeout(notice.hideTimer);
    notice.hideTimer = setTimeout(() => notice.classList.remove("is-visible"), 3500);
  }

  document.addEventListener("click", (event) => {
    const cartButton = event.target.closest("[data-cart-item]");
    const wishlistButton = event.target.closest("[data-wishlist-item]");
    const removeCartButton = event.target.closest("[data-remove-cart]");
    const arrivalFilterButton = event.target.closest("[data-arrival-filter]");

    if (arrivalFilterButton) {
      activeArrivalFilter = arrivalFilterButton.dataset.arrivalFilter;
      document.querySelectorAll("[data-arrival-filter]").forEach((button) => {
        const isActive = button === arrivalFilterButton;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });
      renderArrivalProducts();
    }

    if (cartButton) {
      event.preventDefault();
      try {
        const item = JSON.parse(decodeURIComponent(cartButton.dataset.cartItem));
        const selectedSize = cartButton.closest("[data-product-detail]")?.querySelector(".sizes button.active")?.dataset.size;
        if (selectedSize) {
          addToCart({ ...item, size: selectedSize });
          flashButton(cartButton, "Added");
          renderCart();
        } else {
          showSizePicker(item, cartButton);
        }
      } catch (error) {
        console.error("Could not add item to cart.", error);
      }
    }

    if (wishlistButton) {
      const item = JSON.parse(decodeURIComponent(wishlistButton.dataset.wishlistItem));
      const saved = toggleWishlist(item);
      document.querySelectorAll(`[data-wishlist-item="${wishlistButton.dataset.wishlistItem}"]`).forEach((button) => {
        button.classList.toggle("is-active", saved);
        if (button.classList.contains("button")) {
          button.innerHTML = `<i data-lucide="heart"></i> ${saved ? "Wishlisted" : "Wishlist"}`;
        }
      });
      renderWishlist();
      window.lucide?.createIcons();
    }

    if (removeCartButton) {
      event.preventDefault();
      const [removeId, removeSize = ""] = removeCartButton.dataset.removeCart.split("::");
      writeStored(cartKey, readStored(cartKey).filter((item) =>
        !(String(item.id) === removeId && String(item.size || "") === removeSize)
      ));
      renderCart();
      window.lucide?.createIcons();
    }
  });

  function showSizePicker(item, sourceButton) {
    let picker = document.querySelector("[data-size-picker]");
    if (!picker) {
      picker = document.createElement("dialog");
      picker.className = "size-picker";
      picker.dataset.sizePicker = "";
      picker.innerHTML = `
        <button class="size-picker__close" type="button" data-close-size-picker aria-label="Close size selection"><i data-lucide="x"></i></button>
        <p class="eyebrow">Choose your fit</p>
        <h2>Select a size</h2>
        <p data-size-picker-product></p>
        <div class="sizes" role="group" aria-label="Select product size">
          <button type="button" data-picker-size="S">S</button>
          <button type="button" data-picker-size="M">M</button>
          <button type="button" data-picker-size="L">L</button>
          <button type="button" data-picker-size="XL">XL</button>
        </div>
        <a class="text-button" href="size-guide.html">View Size Chart</a>`;
      document.body.appendChild(picker);
      picker.addEventListener("click", (pickerEvent) => {
        const sizeButton = pickerEvent.target.closest("[data-picker-size]");
        if (sizeButton) {
          addToCart({ ...picker.pendingItem, size: sizeButton.dataset.pickerSize });
          flashButton(picker.sourceButton, "Added");
          renderCart();
          picker.close();
        }
        if (pickerEvent.target.closest("[data-close-size-picker]") || pickerEvent.target === picker) picker.close();
      });
    }
    picker.pendingItem = item;
    picker.sourceButton = sourceButton;
    picker.querySelector("[data-size-picker-product]").textContent = item.title;
    picker.showModal();
    window.lucide?.createIcons();
  }

  async function renderCatalog() {
    const status = document.querySelector("[data-catalog-status]");
    try {
      const items = await loadCatalog();
      catalogItems = items;
      document.querySelectorAll("[data-catalog-section]").forEach((container) => {
        const section = container.dataset.catalogSection;
        if (section === "new-arrivals") return;
        const filtered = items.filter((item) => item.section === section);
        container.innerHTML = filtered.map(productCard).join("");
      });
      renderArrivalProducts();

      const params = new URLSearchParams(location.search);
      const selected = items.find((item) => String(item.id) === params.get("id"))
        || items.find((item) => item.section === "product");
      renderProduct(selected);
      if (status) status.hidden = true;
      window.lucide?.createIcons();
      updateHeaderCounts();
      renderCart();
      renderWishlist();
      window.dispatchEvent(new CustomEvent("malteaser:catalog-ready"));
    } catch (error) {
      if (status) {
        status.hidden = false;
        status.textContent = "The collection could not be loaded. Please refresh.";
      }
      console.error(error);
      window.dispatchEvent(new CustomEvent("malteaser:catalog-ready"));
    }
  }

  window.MalteaserCatalog = {
    client,
    isConfigured,
    localKey,
    loadCatalog,
    renderCatalog
  };

  document.addEventListener("DOMContentLoaded", () => {
    updateHeaderCounts();
    renderCart();
    renderWishlist();
    renderCatalog();
  });

  window.addEventListener("pageshow", () => {
    updateHeaderCounts();
    renderCart();
  });

  window.addEventListener("storage", (event) => {
    if (event.key === cartKey) {
      updateHeaderCounts();
      renderCart();
    }
  });
})();
