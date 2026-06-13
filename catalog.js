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
  const catalogUpdatedKey = "malteaser_catalog_updated_at";
  const arrivalFilterKey = "malteaser_arrival_filter";
  const couponKey = "malteaser_coupon";
  let catalogItems = [];
  let activeArrivalFilter = sessionStorage.getItem(arrivalFilterKey) || "all";
  let catalogSearch = "";
  let catalogSort = "featured";
  let catalogRefreshPromise = null;

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

  function inventoryFromDescription(description) {
    const match = String(description || "").match(/\[malteaser_stock:S=(\d+),M=(\d+),L=(\d+),XL=(\d+)\]/);
    return match ? { S: Number(match[1]), M: Number(match[2]), L: Number(match[3]), XL: Number(match[4]) } : null;
  }

  function cleanDescription(description) {
    return String(description || "").replace(/\s*\[malteaser_stock:S=\d+,M=\d+,L=\d+,XL=\d+\]\s*/g, "").trim();
  }

  function normalizedItem(item) {
    return {
      id: String(item.id),
      title: item.title || "Malteaser Product",
      description: cleanDescription(item.description),
      price: Number(item.price || 0),
      section: item.section || "product",
      label: item.label || "Malteaser",
      image_url: item.image_url || "assets/white-tshirt.svg",
      size: item.size || "",
      inventory: item.inventory || inventoryFromDescription(item.description)
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

  function addToCart(item, quantity = 1) {
    const cart = readStored(cartKey);
    const normalized = normalizedItem(item);
    const existing = cart.find((entry) =>
      String(entry.id) === normalized.id && String(entry.size || "") === normalized.size
    );
    const available = normalized.inventory?.[normalized.size];
    const nextQuantity = Number(existing?.quantity || 0) + Number(quantity || 1);
    if (Number.isFinite(available) && nextQuantity > available) {
      showStockNotice(normalized, available);
      return false;
    }
    if (existing) existing.quantity = nextQuantity;
    else cart.push({ ...normalized, quantity: nextQuantity });
    writeStored(cartKey, cart);
    showCartConfirmation(normalized);
    return true;
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
    const value = String(item.label || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
    if (value.includes("work")) return "workwear";
    if (value.includes("even")) return "evening";
    return "casual";
  }

  function renderArrivalProducts() {
    const container = document.querySelector('[data-catalog-section="new-arrivals"]');
    if (!container) return;
    document.querySelectorAll("[data-arrival-filter]").forEach((button) => {
      const isActive = button.dataset.arrivalFilter === activeArrivalFilter;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    const arrivals = catalogItems.filter((item) => item.section === "new-arrivals");
    let filtered = activeArrivalFilter === "all"
      ? arrivals
      : arrivals.filter((item) => arrivalCategory(item) === activeArrivalFilter);
    if (catalogSearch) {
      const query = catalogSearch.toLowerCase();
      filtered = filtered.filter((item) =>
        [item.title, item.label, cleanDescription(item.description)]
          .some((value) => String(value || "").toLowerCase().includes(query))
      );
    }
    if (catalogSort === "price-low") filtered.sort((a, b) => Number(a.price) - Number(b.price));
    if (catalogSort === "price-high") filtered.sort((a, b) => Number(b.price) - Number(a.price));
    if (catalogSort === "newest") filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
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
    root.querySelector("[data-product-description]").textContent = cleanDescription(item.description);
    const inventory = item.inventory || inventoryFromDescription(item.description);
    root.querySelectorAll("[data-size]").forEach((button) => {
      const stock = inventory?.[button.dataset.size];
      const unavailable = inventory && stock <= 0;
      button.dataset.stock = Number.isFinite(stock) ? stock : "";
      button.disabled = Boolean(unavailable);
      button.classList.toggle("is-unavailable", Boolean(unavailable));
      button.setAttribute("aria-label", unavailable ? `${button.dataset.size} sold out` : `${button.dataset.size}${inventory ? `, ${stock} pieces available` : ""}`);
      if (unavailable && button.classList.contains("active")) {
        button.classList.remove("active");
        button.setAttribute("aria-pressed", "false");
      }
    });
    root.querySelectorAll("[data-product-action]").forEach((button) => {
      button.dataset[button.dataset.productAction === "cart" ? "cartItem" : "wishlistItem"] = itemData(item);
    });
  }

  function renderCart() {
    const root = document.querySelector("[data-cart-items]");
    const totalRoot = document.querySelector("[data-cart-total]");
    if (!root) return;
    const cart = readStored(cartKey);
    root.innerHTML = cart.map((item) => {
      const quantity = Number(item.quantity || 1);
      const available = item.inventory?.[item.size];
      return `
      <article class="cart-line" data-cart-row="${escapeHtml(item.id)}">
        <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}">
        <div class="cart-line__details">
          <h3>${escapeHtml(item.title)}</h3>
          <p>Size: ${escapeHtml(item.size || "M")}</p>
          <div class="quantity-stepper cart-quantity" aria-label="Quantity for ${escapeHtml(item.title)}">
            <button type="button" data-cart-quantity="-1" data-cart-key="${escapeHtml(`${item.id}::${item.size || ""}`)}" aria-label="Decrease ${escapeHtml(item.title)} quantity" ${quantity <= 1 ? "disabled" : ""}><i data-lucide="minus"></i></button>
            <output>${quantity}</output>
            <button type="button" data-cart-quantity="1" data-cart-key="${escapeHtml(`${item.id}::${item.size || ""}`)}" aria-label="Increase ${escapeHtml(item.title)} quantity" ${Number.isFinite(available) && quantity >= available ? "disabled" : ""}><i data-lucide="plus"></i></button>
          </div>
          <button class="cart-line__delete" type="button" data-remove-cart="${escapeHtml(`${item.id}::${item.size || ""}`)}" aria-label="Delete ${escapeHtml(item.title)} size ${escapeHtml(item.size || "M")} from bag"><i data-lucide="trash-2"></i> Delete</button>
        </div>
        <strong>${formatPrice(Number(item.price) * quantity)}</strong>
      </article>`;
    }).join("") || '<div class="empty-state"><h2>Your cart is empty.</h2><a class="button button--dark" href="shop.html">Explore Products</a></div>';
    const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity || 1), 0);
    const couponApplied = localStorage.getItem(couponKey) === "MALTEASER10";
    const discount = couponApplied ? Math.round(subtotal * 0.1) : 0;
    const total = Math.max(0, subtotal - discount);
    document.querySelectorAll("[data-cart-subtotal]").forEach((element) => { element.textContent = formatPrice(subtotal); });
    document.querySelectorAll("[data-cart-discount]").forEach((element) => { element.textContent = `- ${formatPrice(discount)}`; });
    document.querySelectorAll("[data-discount-line]").forEach((element) => { element.hidden = !discount; });
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

  function showStockNotice(item, available) {
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
        <strong>Stock limit reached</strong>
        <span>${escapeHtml(item.title)} · Size ${escapeHtml(item.size)} · ${available} available</span>
      </div>
      <a href="cart.html">View Bag</a>`;
    notice.classList.remove("is-visible");
    requestAnimationFrame(() => notice.classList.add("is-visible"));
    clearTimeout(notice.hideTimer);
    notice.hideTimer = setTimeout(() => notice.classList.remove("is-visible"), 3500);
  }

  function syncQuantityStepper(output) {
    const stepper = output?.closest(".quantity-stepper");
    if (!stepper) return;
    const value = Number(output.value || output.textContent || 1);
    const max = Number(output.dataset.max || 99);
    const decrease = stepper.querySelector('[data-quantity-step="-1"]');
    const increase = stepper.querySelector('[data-quantity-step="1"]');
    if (decrease) decrease.disabled = value <= 1;
    if (increase) increase.disabled = value >= max;
  }

  document.addEventListener("click", (event) => {
    const cartButton = event.target.closest("[data-cart-item]");
    const wishlistButton = event.target.closest("[data-wishlist-item]");
    const removeCartButton = event.target.closest("[data-remove-cart]");
    const arrivalFilterButton = event.target.closest("[data-arrival-filter]");
    const quantityStepButton = event.target.closest("[data-quantity-step]");
    const cartQuantityButton = event.target.closest("[data-cart-quantity]");

    if (quantityStepButton) {
      const picker = quantityStepButton.closest("[data-product-quantity], [data-size-picker]");
      const output = picker?.querySelector("[data-quantity-value]");
      if (output) {
        const max = Number(output.dataset.max || 99);
        const next = Math.min(max, Math.max(1, Number(output.value || output.textContent || 1) + Number(quantityStepButton.dataset.quantityStep)));
        output.value = next;
        output.textContent = next;
        syncQuantityStepper(output);
      }
    }

    if (cartQuantityButton) {
      const [itemId, itemSize = ""] = cartQuantityButton.dataset.cartKey.split("::");
      const cart = readStored(cartKey);
      const item = cart.find((entry) => String(entry.id) === itemId && String(entry.size || "") === itemSize);
      if (item) {
        const next = Number(item.quantity || 1) + Number(cartQuantityButton.dataset.cartQuantity);
        const available = item.inventory?.[item.size];
        if (next >= 1 && (!Number.isFinite(available) || next <= available)) {
          item.quantity = next;
          writeStored(cartKey, cart);
          renderCart();
        } else if (Number.isFinite(available) && next > available) {
          showStockNotice(item, available);
        }
      }
    }

    if (arrivalFilterButton) {
      activeArrivalFilter = arrivalFilterButton.dataset.arrivalFilter;
      sessionStorage.setItem(arrivalFilterKey, activeArrivalFilter);
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
        const productRoot = cartButton.closest("[data-product-detail]");
        const selectedSize = productRoot?.querySelector(".sizes button.active")?.dataset.size;
        const quantity = Number(productRoot?.querySelector("[data-quantity-value]")?.value || 1);
        if (selectedSize) {
          if (addToCart({ ...item, size: selectedSize }, quantity)) {
            flashButton(cartButton, "Added");
            renderCart();
          }
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
        <div class="quantity-picker">
          <span>Quantity</span>
          <div class="quantity-stepper" aria-label="Select quantity">
            <button type="button" data-quantity-step="-1" aria-label="Decrease quantity"><i data-lucide="minus"></i></button>
            <output data-quantity-value>1</output>
            <button type="button" data-quantity-step="1" aria-label="Increase quantity"><i data-lucide="plus"></i></button>
          </div>
        </div>
        <button class="button button--dark size-picker__add" type="button" data-picker-add disabled><i data-lucide="shopping-bag"></i> Add to Cart</button>
        <a class="text-button" href="size-guide.html">View Size Chart</a>`;
      document.body.appendChild(picker);
      picker.addEventListener("click", (pickerEvent) => {
        const sizeButton = pickerEvent.target.closest("[data-picker-size]");
        if (sizeButton) {
          picker.querySelectorAll("[data-picker-size]").forEach((button) => button.classList.toggle("active", button === sizeButton));
          const quantityOutput = picker.querySelector("[data-quantity-value]");
          const max = Number(sizeButton.dataset.stock || 99);
          quantityOutput.dataset.max = max;
          if (Number(quantityOutput.value || quantityOutput.textContent) > max) {
            quantityOutput.value = max;
            quantityOutput.textContent = max;
          }
          syncQuantityStepper(quantityOutput);
          picker.querySelector("[data-picker-add]").disabled = false;
        }
        if (pickerEvent.target.closest("[data-picker-add]")) {
          const selectedSize = picker.querySelector("[data-picker-size].active")?.dataset.pickerSize;
          const quantity = Number(picker.querySelector("[data-quantity-value]")?.value || 1);
          if (selectedSize && addToCart({ ...picker.pendingItem, size: selectedSize }, quantity)) {
            flashButton(picker.sourceButton, "Added");
            renderCart();
            picker.close();
          }
        }
        if (pickerEvent.target.closest("[data-close-size-picker]") || pickerEvent.target === picker) picker.close();
      });
    }
    picker.pendingItem = item;
    picker.sourceButton = sourceButton;
    picker.querySelector("[data-size-picker-product]").textContent = item.title;
    const quantityOutput = picker.querySelector("[data-quantity-value]");
    quantityOutput.value = 1;
    quantityOutput.textContent = "1";
    quantityOutput.dataset.max = 99;
    syncQuantityStepper(quantityOutput);
    picker.querySelectorAll("[data-picker-size]").forEach((button) => button.classList.remove("active"));
    picker.querySelector("[data-picker-add]").disabled = true;
    const inventory = item.inventory || inventoryFromDescription(item.description);
    picker.querySelectorAll("[data-picker-size]").forEach((button) => {
      const stock = inventory?.[button.dataset.pickerSize];
      const unavailable = inventory && stock <= 0;
      button.dataset.stock = Number.isFinite(stock) ? stock : "";
      button.disabled = Boolean(unavailable);
      button.classList.toggle("is-unavailable", Boolean(unavailable));
      button.title = unavailable ? "Sold out" : inventory ? `${stock} pieces available` : "";
    });
    picker.showModal();
    window.lucide?.createIcons();
  }

  async function renderCatalog() {
    if (catalogRefreshPromise) return catalogRefreshPromise;
    catalogRefreshPromise = refreshCatalog();
    try {
      return await catalogRefreshPromise;
    } finally {
      catalogRefreshPromise = null;
    }
  }

  async function refreshCatalog() {
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
    renderCatalog();
  });

  window.addEventListener("storage", (event) => {
    if (event.key === cartKey) {
      updateHeaderCounts();
      renderCart();
    }
    if (event.key === catalogUpdatedKey) renderCatalog();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") renderCatalog();
  });

  document.querySelector("[data-catalog-search]")?.addEventListener("input", (event) => {
    catalogSearch = event.target.value.trim();
    renderArrivalProducts();
  });

  document.querySelector("[data-catalog-sort]")?.addEventListener("change", (event) => {
    catalogSort = event.target.value;
    renderArrivalProducts();
  });

  document.querySelector("[data-coupon-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get("coupon") || "").trim().toUpperCase();
    const message = form.querySelector("[data-coupon-message]");
    if (code === "MALTEASER10") {
      localStorage.setItem(couponKey, code);
      message.textContent = "10% private edit discount applied.";
      message.dataset.type = "success";
    } else {
      localStorage.removeItem(couponKey);
      message.textContent = "This coupon is not available.";
      message.dataset.type = "error";
    }
    renderCart();
  });
})();
