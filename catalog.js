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

  function formatPrice(value) {
    const price = Number(value || 0);
    return price > 0 ? `Rs. ${price.toLocaleString("en-IN")}` : "";
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
    return `
      <article class="product-card is-visible">
        <a class="wishlist" href="wishlist.html" aria-label="Add ${item.title} to wishlist"><i data-lucide="heart"></i></a>
        <img src="${item.image_url || "assets/white-tshirt.svg"}" alt="${item.title}">
        <div class="product-card__body">
          <span>${item.label || "Malteaser"}</span>
          <h3>${item.title}</h3>
          <p>${formatPrice(item.price)}</p>
          <a class="text-button" href="product.html?id=${encodeURIComponent(item.id)}">View Product</a>
        </div>
      </article>`;
  }

  function collectionCard(item) {
    return `
      <article class="page-panel is-visible">
        <img src="${item.image_url || "assets/white-tshirt.svg"}" alt="${item.title}">
        <span class="mini-kicker">${item.label || "Collection"}</span>
        <h3>${item.title}</h3>
        <p>${item.description || ""}</p>
        <a class="text-button" href="shop.html">Shop Collection</a>
      </article>`;
  }

  function lookbookCard(item, index) {
    const classes = index === 0 ? "lookbook-card large" : index === 1 ? "lookbook-card offset" : "lookbook-card";
    return `
      <article class="${classes} is-visible">
        <img src="${item.image_url || "assets/white-tshirt.svg"}" alt="${item.title}">
        <h3>${item.description || item.title}</h3>
      </article>`;
  }

  function renderProduct(item) {
    const root = document.querySelector("[data-product-detail]");
    if (!root || !item) return;
    root.querySelector("[data-product-image]").src = item.image_url || "assets/white-tshirt.svg";
    root.querySelector("[data-product-image]").alt = item.title;
    root.querySelector("[data-product-title]").textContent = item.title;
    root.querySelector("[data-product-price]").textContent = formatPrice(item.price);
    root.querySelector("[data-product-description]").textContent = item.description || "";
  }

  async function renderCatalog() {
    const status = document.querySelector("[data-catalog-status]");
    try {
      const items = await loadCatalog();
      document.querySelectorAll("[data-catalog-section]").forEach((container) => {
        const section = container.dataset.catalogSection;
        const filtered = items.filter((item) => item.section === section);
        if (section === "new-arrivals") container.innerHTML = filtered.map(productCard).join("");
        if (section === "collections") container.innerHTML = filtered.map(collectionCard).join("");
        if (section === "lookbook") container.innerHTML = filtered.map(lookbookCard).join("");
      });

      const params = new URLSearchParams(location.search);
      const selected = items.find((item) => item.id === params.get("id") && item.section === "product")
        || items.find((item) => item.section === "product");
      renderProduct(selected);
      if (status) status.hidden = true;
      window.lucide?.createIcons();
    } catch (error) {
      if (status) {
        status.hidden = false;
        status.textContent = "The collection could not be loaded. Please refresh.";
      }
      console.error(error);
    }
  }

  window.MalteaserCatalog = {
    client,
    isConfigured,
    localKey,
    loadCatalog,
    renderCatalog
  };

  document.addEventListener("DOMContentLoaded", renderCatalog);
})();
