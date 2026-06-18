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
  const catalogUpdatedKey = "malteaser_catalog_updated_at";
  const arrivalFilterKey = "malteaser_arrival_filter";

  // One-time purge of legacy GLOBAL keys (pre-fix, 2026-06-17).
  // These leaked one account's cart/wishlist/coupon/orders to every other
  // account on the same browser. Per-user keys (with a UID suffix) are kept.
  ["malteaser_cart", "malteaser_wishlist", "malteaser_coupon", "malteaser_orders"]
    .forEach((k) => { try { localStorage.removeItem(k); } catch {} });

  // User-scoped key helpers. The current customer's UID is read from the
  // auth.js Supabase session ("malteaser-customer"), which is where customer
  // logins actually persist. Guests get a shared "guest" bucket.
  const customerAuthKey = "malteaser-customer";
  function readCustomerUserId() {
    try {
      const raw = localStorage.getItem(customerAuthKey);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return obj?.currentSession?.user?.id || obj?.user?.id || null;
    } catch { return null; }
  }
  let cachedUserId = readCustomerUserId();
  function keyFor(name) { return `malteaser_${name}_${cachedUserId || "guest"}`; }
  const cartKey     = () => keyFor("cart");
  const wishlistKey = () => keyFor("wishlist");
  const couponKey   = () => keyFor("coupon");
  const ordersKey   = () => keyFor("orders");
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
    const cartCount = readStored(cartKey()).reduce((total, item) => total + Number(item.quantity || 1), 0);
    const wishlistCount = readStored(wishlistKey()).length;
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
    const cart = readStored(cartKey());
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
    writeStored(cartKey(), cart);
    showCartConfirmation(normalized);
    return true;
  }

  function toggleWishlist(item) {
    const wishlist = readStored(wishlistKey());
    const index = wishlist.findIndex((entry) => String(entry.id) === String(item.id));
    if (index >= 0) wishlist.splice(index, 1);
    else wishlist.push(normalizedItem(item));
    writeStored(wishlistKey(), wishlist);
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

  // The homepage 3D flashcard tees are defined statically in catalog.json.
  // Always make them resolvable on the product page, even when Supabase is the
  // primary source and doesn't (yet) contain them.
  async function loadFlashcardProducts() {
    try {
      const response = await fetch("data/catalog.json");
      const starter = await response.json();
      return starter.filter((item) => String(item.id).startsWith("card-"));
    } catch {
      return [];
    }
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
    const remote = data || [];
    const remoteIds = new Set(remote.map((item) => String(item.id)));
    const flashcards = await loadFlashcardProducts();
    const extras = flashcards.filter((item) => !remoteIds.has(String(item.id)));
    return [...remote, ...extras];
  }

  function productCard(item) {
    const saved = isSaved(wishlistKey(), item.id);
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

  function flashCardNumber(label) {
    const match = String(label || "").match(/(?:flash\s*card|ferris\s*wheel)\s*([123])/i);
    return match ? match[1] : "";
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

  function renderFerrisProducts() {
    const wheels = Array.from(document.querySelectorAll("[data-ferris-wheel]"));
    if (!wheels.length) return;
    const items = catalogItems.filter((item) => item.section === "ferris-wheel");
    const assignedIds = new Set();
    const openSlots = [];

    function placeItem(slot, item) {
      const image = slot.querySelector("img");
      const name = slot.querySelector(".ferris-product__name");
      const price = slot.querySelector("strong");
      slot.href = `product.html?id=${encodeURIComponent(item.id)}`;
      slot.setAttribute("aria-label", `View ${item.title}`);
      if (image) {
        image.src = item.image_url || "assets/white-tshirt.svg";
        image.alt = item.title;
      }
      if (name) name.textContent = item.title;
      if (price) price.textContent = formatPrice(item.price);
      assignedIds.add(String(item.id));
    }

    wheels.forEach((wheel) => {
      const wheelNumber = wheel.dataset.ferrisWheel;
      const slots = Array.from(wheel.querySelectorAll(".ferris-product"));
      const wheelItems = items.filter((item) =>
        String(item.label || "").trim().toLowerCase() === `ferris wheel ${wheelNumber}`
      );
      slots.forEach((slot, index) => {
        if (wheelItems[index]) placeItem(slot, wheelItems[index]);
        else openSlots.push(slot);
      });
    });

    const legacyItems = items.filter((item) =>
      !assignedIds.has(String(item.id))
      && !/^ferris wheel [123]$/i.test(String(item.label || "").trim())
    );
    openSlots.forEach((slot, index) => {
      if (legacyItems[index]) placeItem(slot, legacyItems[index]);
    });
  }

  function renderFlashCardProducts() {
    const decks = Array.from(document.querySelectorAll(".deck-section"));
    if (!decks.length) return;
    const uploaded = catalogItems.filter((item) =>
      item.section === "ferris-wheel" && flashCardNumber(item.label)
    );

    decks.forEach((deck, index) => {
      const deckNumber = String(index + 1);
      const slots = Array.from(deck.querySelectorAll(".deck-card"));
      const products = uploaded
        .filter((item) => flashCardNumber(item.label) === deckNumber)
        .slice(0, 5);

      products.forEach((item, slotIndex) => {
        const slot = slots[slotIndex];
        const image = slot?.querySelector("img");
        const name = slot?.querySelector(".deck-card__name");
        const price = slot?.querySelector(".deck-card__price");
        if (!slot) return;
        slot.href = `product.html?id=${encodeURIComponent(item.id)}`;
        slot.setAttribute("aria-label", `View ${item.title}`);
        if (image) {
          image.src = item.image_url || "assets/black-tshirt.svg";
          image.alt = item.title;
        }
        if (name) name.textContent = item.title;
        if (price) price.textContent = formatPrice(item.price);
      });
    });
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
    const cart = readStored(cartKey());
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
    const couponApplied = localStorage.getItem(couponKey()) === "MALTEASER10";
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
    const wishlist = readStored(wishlistKey());
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
    const cancelOrderButton = event.target.closest("[data-order-cancel]");
    if (cancelOrderButton) {
      event.preventDefault();
      handleCancelOrder(cancelOrderButton.dataset.orderCancel);
      return;
    }
    const exchangeOrderButton = event.target.closest("[data-order-exchange]");
    if (exchangeOrderButton) {
      event.preventDefault();
      handleExchangeOrder(exchangeOrderButton.dataset.orderExchange);
      return;
    }

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
      const cart = readStored(cartKey());
      const item = cart.find((entry) => String(entry.id) === itemId && String(entry.size || "") === itemSize);
      if (item) {
        const next = Number(item.quantity || 1) + Number(cartQuantityButton.dataset.cartQuantity);
        const available = item.inventory?.[item.size];
        if (next >= 1 && (!Number.isFinite(available) || next <= available)) {
          item.quantity = next;
          writeStored(cartKey(), cart);
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
      writeStored(cartKey(), readStored(cartKey()).filter((item) =>
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
      renderFerrisProducts();
      renderFlashCardProducts();
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

  function readOrders() {
    try {
      return JSON.parse(localStorage.getItem(ordersKey()) || "[]");
    } catch {
      return [];
    }
  }

  function createOrderId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return "MAL-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    }
    return "MAL-" + Date.now().toString(36).toUpperCase();
  }

  function placeOrderFromCart(shipping = {}) {
    const cart = readStored(cartKey());
    if (!cart.length) return null;
    const subtotal = cart.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.quantity || 1), 0
    );
    const couponApplied = localStorage.getItem(couponKey()) === "MALTEASER10";
    const discount = couponApplied ? Math.round(subtotal * 0.1) : 0;
    const total = Math.max(0, subtotal - discount);
    const order = {
      id: createOrderId(),
      placed_at: new Date().toISOString(),
      status: "Placed",
      items: cart.map((item) => ({
        id: String(item.id),
        title: item.title || "Malteaser Product",
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 1),
        size: item.size || "",
        image_url: item.image_url || "assets/white-tshirt.svg"
      })),
      subtotal,
      discount,
      coupon: couponApplied ? "MALTEASER10" : null,
      total,
      shipping
    };
    const orders = readOrders();
    orders.unshift(order);
    localStorage.setItem(ordersKey(), JSON.stringify(orders));
    localStorage.removeItem(cartKey());
    localStorage.removeItem(couponKey());
    updateHeaderCounts();
    return order;
  }

  const CANCEL_WINDOW_MS   = 12 * 60 * 60 * 1000;       // 12 hours
  const EXCHANGE_WINDOW_MS =  7 * 24 * 60 * 60 * 1000;  // 7 days

  function canCancelOrder(order) {
    if (!order) return false;
    const status = String(order.status || "").toLowerCase();
    if (status !== "placed") return false;
    const placed = Date.parse(order.placed_at);
    if (!placed) return false;
    return (Date.now() - placed) < CANCEL_WINDOW_MS;
  }

  function canExchangeOrder(order) {
    if (!order) return false;
    const status = String(order.status || "").toLowerCase();
    if (status !== "delivered") return false;
    const delivered = Date.parse(order.delivered_at || "");
    if (!delivered) return false;
    return (Date.now() - delivered) < EXCHANGE_WINDOW_MS;
  }

  function timeLeftLabel(deadlineMs) {
    const remaining = deadlineMs - Date.now();
    if (remaining <= 0) return "";
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    const days = Math.floor(hours / 24);
    if (days >= 1) return `${days} day${days === 1 ? "" : "s"} left`;
    if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} ${minutes ? minutes + "m " : ""}left`;
    return `${minutes} minute${minutes === 1 ? "" : "s"} left`;
  }

  function orderHasManageActions(order) {
    return canCancelOrder(order) || canExchangeOrder(order);
  }

  function manageAnchorId(orderId) {
    return `manage-${String(orderId || "").replace(/[^a-zA-Z0-9_-]/g, "")}`;
  }

  function renderOrderActions(order) {
    if (!order) return "";
    const cancel = canCancelOrder(order);
    const exchange = canExchangeOrder(order);
    if (!cancel && !exchange) return "";
    const buttons = [];
    if (cancel) {
      const deadline = Date.parse(order.placed_at) + CANCEL_WINDOW_MS;
      buttons.push(`
        <button class="order-action order-action--cancel" type="button"
                data-order-cancel="${escapeHtml(order.id)}">
          Cancel order
          <small>${escapeHtml(timeLeftLabel(deadline))}</small>
        </button>`);
    }
    if (exchange) {
      const deadline = Date.parse(order.delivered_at) + EXCHANGE_WINDOW_MS;
      buttons.push(`
        <button class="order-action order-action--exchange" type="button"
                data-order-exchange="${escapeHtml(order.id)}">
          Request exchange
          <small>${escapeHtml(timeLeftLabel(deadline))}</small>
        </button>`);
    }
    return `<div class="order-entry__actions">${buttons.join("")}</div>`;
  }

  function updateOrderStatus(orderId, patch) {
    const orders = readOrders();
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx === -1) return null;
    orders[idx] = { ...orders[idx], ...patch };
    localStorage.setItem(ordersKey(), JSON.stringify(orders));
    return orders[idx];
  }

  function handleCancelOrder(orderId) {
    const orders = readOrders();
    const order = orders.find((o) => o.id === orderId);
    if (!canCancelOrder(order)) {
      alert("This order can no longer be cancelled. The 12-hour cancellation window has closed.");
      renderOrderHistory();
      closeManageModal();
      renderOrderConfirmation();
      return;
    }
    if (!confirm(`Cancel order ${order.id}? This cannot be undone.`)) return;
    updateOrderStatus(orderId, {
      status: "Cancelled",
      cancelled_at: new Date().toISOString()
    });
    renderOrderHistory();
    closeManageModal();
    renderOrderConfirmation();
  }

  function handleExchangeOrder(orderId) {
    const orders = readOrders();
    const order = orders.find((o) => o.id === orderId);
    if (!canExchangeOrder(order)) {
      alert("This order is no longer eligible for exchange. Exchanges can be requested within 7 days of delivery.");
      renderOrderHistory();
      closeManageModal();
      return;
    }
    const reason = prompt(`Exchange request for ${order.id}. Tell us briefly what you'd like (size change, defective item, wrong item, etc.):`, "");
    if (reason === null) return;
    if (!reason.trim()) {
      alert("Please add a short reason so our team can process the exchange.");
      return;
    }
    updateOrderStatus(orderId, {
      status: "Exchange Requested",
      exchange_requested_at: new Date().toISOString(),
      exchange_reason: reason.trim()
    });
    alert("Exchange requested. Our team will reach out on your registered phone within 24 hours.");
    renderOrderHistory();
    closeManageModal();
  }

  function renderOrderHistory() {
    const root = document.querySelector("[data-order-history]");
    if (!root) return;
    const orders = readOrders();
    if (!orders.length) {
      root.innerHTML = `<p class="order-history__empty">You have not placed any orders yet. <a class="text-button" href="shop.html">Start shopping</a></p>`;
      return;
    }
    root.innerHTML = orders.map((order) => `
      <article class="order-entry">
        <header class="order-entry__head">
          <div>
            <strong>${escapeHtml(order.id)}</strong>
            <small>${new Date(order.placed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small>
          </div>
          <span class="order-entry__status">${escapeHtml(order.status || "Placed")}</span>
        </header>
        <ul class="order-entry__items">
          ${order.items.map((item) => `
            <li>
              <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}">
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                <small>${item.size ? `Size ${escapeHtml(item.size)} · ` : ""}Qty ${Number(item.quantity || 1)}</small>
              </div>
              <span>${formatPrice(Number(item.price) * Number(item.quantity || 1))}</span>
            </li>
          `).join("")}
        </ul>
        <footer class="order-entry__total">
          <span>Total</span>
          <strong>${formatPrice(order.total)}</strong>
        </footer>
        ${renderShippingBlock(order.shipping)}
        ${order.cancelled_at ? `<p class="order-entry__note">Cancelled on ${new Date(order.cancelled_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>` : ""}
        ${order.exchange_requested_at ? `<p class="order-entry__note">Exchange requested on ${new Date(order.exchange_requested_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}${order.exchange_reason ? ` &middot; "${escapeHtml(order.exchange_reason)}"` : ""}</p>` : ""}
        ${orderHasManageActions(order) ? `
          <div class="order-entry__manage">
            <button type="button" class="order-entry__manage-link"
                    data-order-manage="${escapeHtml(order.id)}"
                    aria-label="Manage order ${escapeHtml(order.id)}">
              Manage <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        ` : ""}
      </article>
    `).join("");
  }

  function renderOrderManagement(orderId) {
    const root = document.querySelector("[data-order-manage-body]");
    if (!root) return;
    if (!orderId) {
      // No order selected (modal closed) — leave the body empty.
      root.innerHTML = "";
      return;
    }
    const order = readOrders().find((o) => o.id === orderId);
    if (!order || !orderHasManageActions(order)) {
      root.innerHTML = `<p class="order-manage__empty">This order is no longer eligible for cancellation or exchange.</p>`;
      return;
    }
    root.innerHTML = `
      <article class="order-manage-entry" id="${manageAnchorId(order.id)}">
        <header class="order-manage-entry__head">
          <div>
            <strong>${escapeHtml(order.id)}</strong>
            <small>${new Date(order.placed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small>
          </div>
          <span class="order-entry__status">${escapeHtml(order.status || "Placed")}</span>
        </header>
        <p class="order-manage-entry__summary">${escapeHtml(order.items?.[0]?.title || "Order")}${(order.items?.length || 0) > 1 ? ` &middot; ${order.items.length} items` : ""} &middot; ${formatPrice(order.total)}</p>
        ${renderOrderActions(order)}
      </article>`;
  }

  let currentManageOrderId = null;

  function openManageModal(orderId) {
    const modal = document.querySelector("[data-order-manage-modal]");
    if (!modal) return;
    currentManageOrderId = orderId;
    renderOrderManagement(orderId);
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeManageModal() {
    const modal = document.querySelector("[data-order-manage-modal]");
    if (!modal) return;
    modal.hidden = true;
    currentManageOrderId = null;
    renderOrderManagement(null);
    document.body.style.overflow = "";
  }

  function renderCheckoutSummary() {
    const totalEl = document.querySelector("[data-checkout-total]");
    const subEl = document.querySelector("[data-checkout-subtotal]");
    const disEl = document.querySelector("[data-checkout-discount]");
    const itemsEl = document.querySelector("[data-checkout-items]");
    if (!totalEl && !itemsEl) return;
    const cart = readStored(cartKey());
    const subtotal = cart.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.quantity || 1), 0
    );
    const couponApplied = localStorage.getItem(couponKey()) === "MALTEASER10";
    const discount = couponApplied ? Math.round(subtotal * 0.1) : 0;
    const total = Math.max(0, subtotal - discount);
    if (subEl) subEl.textContent = formatPrice(subtotal);
    if (disEl) disEl.textContent = discount ? `- ${formatPrice(discount)}` : formatPrice(0);
    if (totalEl) totalEl.textContent = formatPrice(total);
    if (itemsEl) {
      if (!cart.length) {
        itemsEl.innerHTML = `<p>Your cart is empty. <a class="text-button" href="shop.html">Continue shopping</a></p>`;
      } else {
        itemsEl.innerHTML = cart.map((item) => `
          <div class="checkout-line">
            <img src="${escapeHtml(item.image_url || "assets/white-tshirt.svg")}" alt="">
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${item.size ? `Size ${escapeHtml(item.size)} · ` : ""}Qty ${Number(item.quantity || 1)}</small>
            </div>
            <span>${formatPrice(Number(item.price) * Number(item.quantity || 1))}</span>
          </div>
        `).join("");
      }
    }
    const placeBtn = document.querySelector("[data-place-order]");
    if (placeBtn) placeBtn.disabled = cart.length === 0;
  }

  function renderShippingBlock(shipping) {
    if (!shipping || typeof shipping !== "object") return "";
    const name = shipping.full_name || "";
    const phone = shipping.phone || "";
    const email = shipping.email || "";
    const line1 = shipping.address_line1 || shipping.address || "";
    const line2 = shipping.address_line2 || "";
    const city = shipping.city || "";
    const state = shipping.state || "";
    const pincode = shipping.pincode || "";
    const country = shipping.country || "India";
    const notes = shipping.delivery_notes || "";
    const hasAddress = line1 || city || state || pincode;
    if (!name && !phone && !hasAddress) return "";
    const addressLines = [line1, line2, [city, state, pincode].filter(Boolean).join(", "), country]
      .filter(Boolean)
      .map((line) => `<div>${escapeHtml(line)}</div>`).join("");
    return `
      <section class="order-shipping">
        <p class="eyebrow">Shipping to</p>
        ${name ? `<p class="order-shipping__name"><strong>${escapeHtml(name)}</strong></p>` : ""}
        <address class="order-shipping__address">${addressLines}</address>
        ${phone ? `<p class="order-shipping__contact"><span>Phone:</span> ${escapeHtml(phone)}</p>` : ""}
        ${email ? `<p class="order-shipping__contact"><span>Email:</span> ${escapeHtml(email)}</p>` : ""}
        ${notes ? `<p class="order-shipping__notes"><span>Courier notes:</span> ${escapeHtml(notes)}</p>` : ""}
      </section>`;
  }

  function renderOrderConfirmation() {
    const root = document.querySelector("[data-order-confirmation]");
    if (!root) return;
    const hero = document.querySelector("[data-order-confirmation-hero]");
    const orders = readOrders();
    const orderId = new URLSearchParams(location.search).get("orderId");
    const order = orderId ? orders.find((o) => o.id === orderId) : orders[0];
    if (!order) {
      root.innerHTML = `<p>No recent order found. <a class="text-button" href="shop.html">Continue shopping</a></p>`;
      if (hero) hero.innerHTML = "";
      return;
    }
    if (hero) {
      const fullName = String(order.shipping?.full_name || "").trim();
      const firstName = fullName.split(/\s+/)[0] || "there";
      const city = String(order.shipping?.city || "").trim();
      const itemCount = (order.items || []).reduce((sum, it) => sum + Number(it.quantity || 1), 0);
      const itemNoun = itemCount === 1 ? "piece" : "pieces";
      hero.innerHTML = `
        <div class="order-confirmation-hero__check" aria-hidden="true">
          <svg viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="24" />
            <path d="M14 27 l8 8 l16 -18" />
          </svg>
        </div>
        <p class="eyebrow">Order confirmed</p>
        <h1 class="order-confirmation-hero__title">Congratulations, ${escapeHtml(firstName)}!</h1>
        <p class="order-confirmation-hero__sub">Your order <strong>${escapeHtml(order.id)}</strong> is reserved${city ? ` and on its way to <strong>${escapeHtml(city)}</strong>` : ""}. We're preparing your ${itemCount} ${itemNoun} in premium packaging now &mdash; the full details are saved below.</p>`;
    }
    root.innerHTML = `
      <p class="eyebrow">Order ${escapeHtml(order.id)}</p>
      <p>Placed ${new Date(order.placed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
      <ul class="order-receipt__items">
        ${order.items.map((item) => `
          <li>
            <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}">
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${item.size ? `Size ${escapeHtml(item.size)} · ` : ""}Qty ${Number(item.quantity || 1)}</small>
            </div>
            <span>${formatPrice(Number(item.price) * Number(item.quantity || 1))}</span>
          </li>
        `).join("")}
      </ul>
      <div class="order-receipt__total"><span>Total</span><strong>${formatPrice(order.total)}</strong></div>
      ${renderShippingBlock(order.shipping)}
      ${renderOrderActions(order)}`;
  }

  window.MalteaserCatalog = {
    client,
    isConfigured,
    localKey,
    loadCatalog,
    renderCatalog,
    placeOrderFromCart,
    readOrders,
    renderOrderHistory,
    renderOrderManagement
  };

  document.addEventListener("DOMContentLoaded", () => {
    updateHeaderCounts();
    renderCart();
    renderWishlist();
    renderOrderHistory();
    renderCheckoutSummary();
    renderOrderConfirmation();
    renderCatalog();
  });

  window.addEventListener("pageshow", () => {
    updateHeaderCounts();
    renderCart();
    renderOrderHistory();
    renderCheckoutSummary();
    renderOrderConfirmation();
    renderCatalog();
  });

  function reflectCurrentUser() {
    const previous = cachedUserId;
    cachedUserId = readCustomerUserId();
    if (cachedUserId !== previous) {
      updateHeaderCounts();
      renderCart();
      renderWishlist();
      renderOrderHistory();
      closeManageModal();
      renderCheckoutSummary();
    }
  }

  // Manage-modal triggers and dismissals (delegated from document.click).
  document.addEventListener("click", (event) => {
    const manageTrigger = event.target.closest("[data-order-manage]");
    if (manageTrigger && manageTrigger.dataset.orderManage) {
      event.preventDefault();
      openManageModal(manageTrigger.dataset.orderManage);
      return;
    }
    if (event.target.closest("[data-modal-close]")) {
      event.preventDefault();
      closeManageModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.querySelector("[data-order-manage-modal]")?.hidden) {
      closeManageModal();
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key === customerAuthKey) {
      reflectCurrentUser();
      return;
    }
    if (event.key === cartKey()) {
      updateHeaderCounts();
      renderCart();
    }
    if (event.key === catalogUpdatedKey) renderCatalog();
  });

  window.addEventListener("malteaser:user-changed", reflectCurrentUser);

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

  // PIN-code → city + state autofill using the free postalpincode.in API.
  // Only fills empty fields so the user can always override.
  const pincodeInput = document.querySelector('[data-checkout-form] [name="pincode"]');
  if (pincodeInput) {
    let status = pincodeInput.parentElement.querySelector(".pincode-status");
    if (!status) {
      status = document.createElement("small");
      status.className = "pincode-status";
      pincodeInput.parentElement.appendChild(status);
    }
    let lastPin = "";
    const lookupPin = async () => {
      const pin = String(pincodeInput.value || "").trim();
      if (!/^[1-9][0-9]{5}$/.test(pin) || pin === lastPin) return;
      lastPin = pin;
      status.textContent = "Looking up PIN...";
      status.removeAttribute("data-state");
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
        const data = await res.json();
        const post = data?.[0]?.PostOffice?.[0];
        if (!post || data?.[0]?.Status !== "Success") {
          status.textContent = "We could not find this PIN code. Please enter city and state manually.";
          status.setAttribute("data-state", "err");
          return;
        }
        const form = pincodeInput.form;
        const cityInput = form?.elements.namedItem("city");
        const stateSelect = form?.elements.namedItem("state");
        const city = post.District || post.Block || "";
        const stateName = String(post.State || "").trim();
        if (cityInput && !cityInput.value.trim() && city) cityInput.value = city;
        if (stateSelect && !stateSelect.value && stateName) {
          const target = stateName.toLowerCase();
          const match = Array.from(stateSelect.options)
            .find((o) => (o.value || o.text).toLowerCase() === target);
          if (match) stateSelect.value = match.value || match.text;
        }
        status.textContent = `${city}, ${stateName}`;
        status.setAttribute("data-state", "ok");
      } catch {
        status.textContent = "PIN lookup failed. Please enter city and state manually.";
        status.setAttribute("data-state", "err");
      }
    };
    pincodeInput.addEventListener("change", lookupPin);
    pincodeInput.addEventListener("input", () => {
      if (pincodeInput.value.replace(/\D/g, "").length === 6) lookupPin();
    });
  }

  document.querySelector("[data-checkout-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const shipping = Object.fromEntries(new FormData(form));
    const order = placeOrderFromCart(shipping);
    const msg = form.querySelector("[data-checkout-message]");
    if (!order) {
      if (msg) {
        msg.textContent = "Your cart is empty. Add a piece before checking out.";
        msg.dataset.type = "error";
      }
      return;
    }
    location.href = `order-confirmation.html?orderId=${encodeURIComponent(order.id)}`;
  });

  document.querySelector("[data-coupon-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get("coupon") || "").trim().toUpperCase();
    const message = form.querySelector("[data-coupon-message]");
    if (code === "MALTEASER10") {
      localStorage.setItem(couponKey(), code);
      message.textContent = "10% private edit discount applied.";
      message.dataset.type = "success";
    } else {
      localStorage.removeItem(couponKey());
      message.textContent = "This coupon is not available.";
      message.dataset.type = "error";
    }
    renderCart();
  });
})();
