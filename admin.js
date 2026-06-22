(function () {
  const catalog = window.MalteaserCatalog;
  const client = catalog?.client;
  const authSection = document.querySelector("[data-admin-auth]");
  const dashboard = document.querySelector("[data-admin-dashboard]");
  const setup = document.querySelector("[data-admin-setup]");
  const loginForm = document.querySelector("[data-login-form]");
  const loginMessage = document.querySelector("[data-login-message]");
  const addForm = document.querySelector("[data-add-form]");
  const addMessage = document.querySelector("[data-add-message]");
  const removeMessage = document.querySelector("[data-remove-message]");
  const itemsRoot = document.querySelector("[data-admin-items]");
  const ordersRoot = document.querySelector("[data-admin-orders]");
  const ordersMessage = document.querySelector("[data-orders-message]");
  const businessMessage = document.querySelector("[data-business-message]");
  let inventoryDialog = document.querySelector("[data-inventory-dialog]");
  let inventoryForm = document.querySelector("[data-inventory-form]");
  let pendingUpload = null;
  let pendingInventoryEdit = null;
  let sectionSelect = document.querySelector("[data-section-select], [name='section']");
  let arrivalCategoryField = document.querySelector("[data-arrival-category-field]");
  let arrivalCategorySelect = arrivalCategoryField?.querySelector("select");
  let flashCardField = document.querySelector("[data-flash-card-field]");
  let flashCardSelect = flashCardField?.querySelector("select");
  let flashSlotField = document.querySelector("[data-flash-slot-field]");
  let flashSlotSelect = flashSlotField?.querySelector("select");
  let photosInput = addForm?.querySelector("[name='photos']");
  let photoHelp = document.querySelector("[data-photo-help]");

  function ensureUploadFields() {
    if (!addForm || !sectionSelect) return;
    sectionSelect.dataset.sectionSelect = "";

    if (!arrivalCategoryField) {
      arrivalCategoryField = document.createElement("label");
      arrivalCategoryField.dataset.arrivalCategoryField = "";
      arrivalCategoryField.innerHTML = `
        New Arrival subsection
        <select name="arrival_category" required>
          <option value="">Choose Casual, Workwear, or Evening</option>
          <option value="Casual">Casual</option>
          <option value="Workwear">Workwear</option>
          <option value="Evening">Evening</option>
        </select>`;
      sectionSelect.closest("label").insertAdjacentElement("afterend", arrivalCategoryField);
      arrivalCategorySelect = arrivalCategoryField.querySelector("select");
    }

    if (!flashCardField) {
      flashCardField = document.createElement("label");
      flashCardField.dataset.flashCardField = "";
      flashCardField.hidden = true;
      flashCardField.innerHTML = `
        Homepage subcategory
        <select name="flash_card" disabled>
          <option value="">Choose Flash Card 1, 2, or 3</option>
          <option value="Flash Card 1">Flash Card 1 - Essential Forms</option>
          <option value="Flash Card 2">Flash Card 2 - Maison Noir</option>
          <option value="Flash Card 3">Flash Card 3 - Modern Classics</option>
        </select>`;
      arrivalCategoryField.insertAdjacentElement("afterend", flashCardField);
      flashCardSelect = flashCardField.querySelector("select");
    }

    if (!flashSlotField) {
      flashSlotField = document.createElement("label");
      flashSlotField.dataset.flashSlotField = "";
      flashSlotField.hidden = true;
      flashSlotField.innerHTML = `
        Product position inside the selected flash card
        <select name="flash_slot" disabled>
          <option value="">Choose position 1, 2, 3, 4, or 5</option>
          <option value="1">Position 1</option>
          <option value="2">Position 2</option>
          <option value="3">Position 3</option>
          <option value="4">Position 4</option>
          <option value="5">Position 5</option>
        </select>
        <small>One product per position. Three flash cards × five positions = 15 products maximum.</small>`;
      flashCardField.insertAdjacentElement("afterend", flashSlotField);
      flashSlotSelect = flashSlotField.querySelector("select");
    }

    addForm.querySelector(".admin-stock")?.remove();
  }

  ensureUploadFields();

  function message(element, text, type = "") {
    if (!element) return;
    element.textContent = text;
    element.dataset.type = type;
  }

  function isAdministrator(user) {
    return user?.app_metadata?.role === "admin";
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

  function sectionName(section) {
    return {
      "new-arrivals": "New Arrivals",
      collections: "Collections",
      lookbook: "Lookbook",
      product: "Product",
      "ferris-wheel": "Homepage 3D Flash Cards"
    }[section] || String(section || "").replaceAll("-", " ");
  }

  function formatPrice(value) {
    return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
  }

  function formatDate(value) {
    return value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";
  }

  function orderItemsText(items) {
    return (Array.isArray(items) ? items : []).map((item) =>
      `${item.title || "Product"}${item.size ? ` (${item.size})` : ""} x ${Number(item.quantity || 1)}`
    ).join("; ");
  }

  function orderErrorMessage(error) {
    const text = String(error?.message || "");
    const lower = text.toLowerCase();
    if (lower.includes("relation") && lower.includes("orders")) {
      return "Orders backend is not installed yet. Run the latest supabase-schema.sql in Supabase SQL Editor, then refresh this admin page.";
    }
    if (lower.includes("permission") || lower.includes("row-level security") || lower.includes("policy")) {
      return "Your admin account does not have permission to read orders. Confirm this user has app_metadata.role set to admin in Supabase.";
    }
    return text || "Could not load orders. Please refresh and try again.";
  }

  function inventoryFromDescription(description) {
    const match = String(description || "").match(/\[malteaser_stock:S=(\d+),M=(\d+),L=(\d+),XL=(\d+)\]/);
    return match ? { S: Number(match[1]), M: Number(match[2]), L: Number(match[3]), XL: Number(match[4]) } : null;
  }

  function inventoryForItem(item) {
    const inventory = item?.inventory;
    if (inventory && typeof inventory === "object") {
      return {
        S: Math.max(0, Number(inventory.S || 0)),
        M: Math.max(0, Number(inventory.M || 0)),
        L: Math.max(0, Number(inventory.L || 0)),
        XL: Math.max(0, Number(inventory.XL || 0))
      };
    }
    return inventoryFromDescription(item?.description) || { S: 3, M: 3, L: 3, XL: 3 };
  }

  function inventoryFromValues(values) {
    return {
      S: Math.max(0, Number(values.stock_s || 0)),
      M: Math.max(0, Number(values.stock_m || 0)),
      L: Math.max(0, Number(values.stock_l || 0)),
      XL: Math.max(0, Number(values.stock_xl || 0))
    };
  }

  function productImages(item) {
    const images = Array.isArray(item?.image_urls) ? item.image_urls : [];
    return [...new Set([item?.image_url, ...images].filter(Boolean))];
  }

  function productStoragePaths(item) {
    const paths = Array.isArray(item?.storage_paths) ? item.storage_paths : [];
    return [...new Set([item?.storage_path, ...paths].filter(Boolean))];
  }

  let pdfJsPromise;

  async function loadPdfJs() {
    if (!pdfJsPromise) {
      pdfJsPromise = import("./assets/vendor/pdf.min.mjs").then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "./assets/vendor/pdf.worker.min.mjs",
          location.href
        ).href;
        return pdfjs;
      });
    }
    return pdfJsPromise;
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("A PDF page could not be converted into an image."));
      }, type, quality);
    });
  }

  async function pdfToImageFiles(pdfFile) {
    if (!pdfFile?.size) return [];
    if (pdfFile.size > 25 * 1024 * 1024) {
      throw new Error("The product PDF must be 25 MB or smaller.");
    }

    const pdfjs = await loadPdfJs();
    const documentTask = pdfjs.getDocument({ data: await pdfFile.arrayBuffer() });
    const pdf = await documentTask.promise;
    if (pdf.numPages > 12) {
      await pdf.destroy();
      throw new Error("The product PDF can contain a maximum of 12 pages.");
    }

    const files = [];
    const baseName = pdfFile.name.replace(/\.pdf$/i, "").replace(/[^a-z0-9_-]+/gi, "-") || "product";
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        message(addMessage, `Preparing PDF page ${pageNumber} of ${pdf.numPages}...`);
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(2.5, 1800 / Math.max(1, baseViewport.width));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;
        const blob = await canvasBlob(canvas, "image/jpeg", 0.9);
        files.push(new File([blob], `${baseName}-page-${pageNumber}.jpg`, { type: "image/jpeg" }));
        page.cleanup();
        canvas.width = 1;
        canvas.height = 1;
      }
    } finally {
      await pdf.destroy();
    }
    return files;
  }

  function descriptionWithInventory(description, values) {
    const clean = String(description || "").replace(/\s*\[malteaser_stock:S=\d+,M=\d+,L=\d+,XL=\d+\]\s*/g, "").trim();
    const stock = `[malteaser_stock:S=${Number(values.stock_s)},M=${Number(values.stock_m)},L=${Number(values.stock_l)},XL=${Number(values.stock_xl)}]`;
    return clean ? `${clean}\n\n${stock}` : stock;
  }

  function showDashboard() {
    authSection.hidden = true;
    dashboard.hidden = false;
    window.lucide?.createIcons();
    loadAdminItems();
  }

  function showLogin() {
    authSection.hidden = false;
    dashboard.hidden = true;
  }

  async function currentSession() {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    if (data.session && !isAdministrator(data.session.user)) {
      await client.auth.signOut();
      return null;
    }
    return data.session;
  }

  async function uploadFiles(files, values) {
    const uploaded = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const extension = file.name.split(".").pop().toLowerCase();
        const path = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await client.storage.from("catalog").upload(path, file, {
          cacheControl: "3600",
          upsert: false
        });
        if (uploadError) throw uploadError;

        const { data: publicData } = client.storage.from("catalog").getPublicUrl(path);
        uploaded.push({ path, url: publicData.publicUrl });
      }
    } catch (error) {
      const uploadedPaths = uploaded.map((image) => image.path);
      if (uploadedPaths.length) await client.storage.from("catalog").remove(uploadedPaths);
      throw error;
    }
    const imageUrls = uploaded.map((image) => image.url);
    const storagePaths = uploaded.map((image) => image.path);
    return [{
      title: values.title,
      description: descriptionWithInventory(values.description, values),
      price: Number(values.price || 0),
      section: values.section,
      label: values.section === "new-arrivals"
        ? values.arrival_category
        : values.section === "product"
          ? "Product"
          : values.section === "ferris-wheel" ? values.flash_card : "Collection",
      image_url: imageUrls[0],
      image_urls: imageUrls,
      storage_path: storagePaths[0],
      storage_paths: storagePaths,
      inventory: inventoryFromValues(values),
      is_active: true,
      flash_slot: values.section === "ferris-wheel" ? Number(values.flash_slot) : null,
      sort_order: values.section === "ferris-wheel"
        ? ((Number(String(values.flash_card).match(/[123]/)?.[0]) - 1) * 5) + Number(values.flash_slot)
        : 1
    }];
  }

  async function loadAdminItems() {
    if (!client || !itemsRoot) return;
    itemsRoot.innerHTML = "<p>Loading catalog...</p>";
    const { data, error } = await client.from("catalog_items").select("*").order("created_at", { ascending: false });
    if (error) {
      itemsRoot.innerHTML = "";
      message(removeMessage, error.message, "error");
      return;
    }
    itemsRoot.innerHTML = (data || []).map((item) => {
      const inventory = inventoryForItem(item);
      const images = productImages(item);
      const stockText = inventory
        ? `S ${inventory.S} · M ${inventory.M} · L ${inventory.L} · XL ${inventory.XL}`
        : "Size stock not set";
      return `
      <article class="admin-item">
        <img src="${escapeHtml(item.image_url || "assets/white-tshirt.svg")}" alt="${escapeHtml(item.title)}">
        <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(sectionName(item.section))}${item.section === "new-arrivals" ? ` · ${escapeHtml(item.label)}` : ""}${item.section === "ferris-wheel" ? ` · ${escapeHtml(item.label)} · Position ${Number(item.flash_slot || 0) || "unassigned"}` : ""}</span><small>${images.length} photo${images.length === 1 ? "" : "s"} · ${stockText}</small></div>
        <div class="admin-item__actions">
          <button class="admin-item__edit" type="button"
            data-edit-inventory="${escapeHtml(item.id)}"
            data-item-title="${escapeHtml(item.title)}"
            data-description="${escapeHtml(item.description)}"
            data-stock-s="${inventory.S}" data-stock-m="${inventory.M}" data-stock-l="${inventory.L}" data-stock-xl="${inventory.XL}">
            <i data-lucide="package-plus"></i> Edit quantity
          </button>
          <button class="icon-button" type="button" data-delete-id="${escapeHtml(item.id)}" data-storage-paths="${escapeHtml(JSON.stringify(productStoragePaths(item)))}" aria-label="Remove ${escapeHtml(item.title)}"><i data-lucide="trash-2"></i></button>
        </div>
      </article>`;
    }).join("") || "<p>No uploaded collections yet.</p>";
    window.lucide?.createIcons();
  }

  async function loadAdminOrders() {
    if (!client || !ordersRoot) return [];
    ordersRoot.innerHTML = "<p>Loading orders...</p>";
    const { data, error } = await client
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      ordersRoot.innerHTML = "";
      message(ordersMessage, orderErrorMessage(error), "error");
      return [];
    }
    const orders = data || [];
    ordersRoot.innerHTML = orders.map((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      return `
      <article class="admin-order">
        <div class="admin-order__top">
          <div>
            <span class="mini-kicker">${escapeHtml(order.order_number)}</span>
            <h3>${escapeHtml(order.customer_name)}</h3>
            <p>${escapeHtml(order.customer_email)} · ${escapeHtml(order.customer_phone)}</p>
          </div>
          <div class="admin-order__status">
            <strong>${formatPrice(order.total)}</strong>
            <select data-order-status="${escapeHtml(order.id)}" aria-label="Update status for ${escapeHtml(order.order_number)}">
              ${["new", "processing", "packed", "shipped", "delivered", "cancelled"].map((status) =>
                `<option value="${status}"${order.status === status ? " selected" : ""}>${status}</option>`
              ).join("")}
            </select>
          </div>
        </div>
        <div class="admin-order__body">
          <p><strong>Address</strong><br>${escapeHtml(order.address_line1)}${order.address_line2 ? `<br>${escapeHtml(order.address_line2)}` : ""}<br>${escapeHtml(order.city)}, ${escapeHtml(order.state)} ${escapeHtml(order.pincode)}<br>${escapeHtml(order.country || "India")}${order.delivery_notes ? `<br><br><strong>Courier notes</strong><br>${escapeHtml(order.delivery_notes)}` : ""}</p>
          <p><strong>Items</strong><br>${items.map((item) => `${escapeHtml(item.title)}${item.size ? ` · ${escapeHtml(item.size)}` : ""} · Qty ${Number(item.quantity || 1)} · ${formatPrice(item.price)}`).join("<br>")}</p>
          <p><strong>Order details</strong><br>${formatDate(order.created_at)}<br>Payment: ${escapeHtml(order.payment_status)}<br>Email: ${escapeHtml(order.email_status)}</p>
        </div>
        <p class="admin-order__inventory-note">Size quantities were reserved automatically when this order was placed.</p>
      </article>`;
    }).join("") || "<p>No orders have been placed yet.</p>";
    message(ordersMessage, orders.length ? `${orders.length} order${orders.length === 1 ? "" : "s"} loaded.` : "No orders yet.", orders.length ? "success" : "");
    window.lucide?.createIcons();
    return orders;
  }

  function csvDownload(filename, rows) {
    if (!rows.length) return false;
    const columns = Object.keys(rows[0]);
    const escape = (value) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
    const csv = [columns.map(escape).join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    return true;
  }

  async function loadBusinessTools() {
    if (!client) return;
    const [{ data, error }, ordersResult] = await Promise.all([
      client.from("catalog_items").select("*").order("created_at", { ascending: false }),
      client.from("orders").select("*").order("created_at", { ascending: false })
    ]);
    if (error) return message(businessMessage, error.message, "error");
    if (ordersResult.error) message(businessMessage, orderErrorMessage(ordersResult.error), "error");
    const products = data || [];
    const orders = ordersResult.error ? [] : ordersResult.data || [];
    const stock = products.reduce((total, item) => {
      const inventory = inventoryForItem(item);
      return total + Object.values(inventory).reduce((sum, value) => sum + Number(value || 0), 0);
    }, 0);
    const enquiries = JSON.parse(localStorage.getItem("malteaser_enquiries") || "[]");
    document.querySelector("[data-admin-product-count]").textContent = products.length;
    document.querySelector("[data-admin-stock-count]").textContent = stock;
    document.querySelector("[data-admin-order-count]").textContent = orders.length;
    document.querySelector("[data-admin-enquiry-count]").textContent = enquiries.length;
    document.querySelector("[data-export-products]").onclick = () => {
      const rows = products.map((item) => {
        const inventory = inventoryForItem(item);
        return {
          title: item.title,
          price: item.price,
          section: item.section,
          subsection: item.label,
          homepage_flash_card: item.section === "ferris-wheel" ? item.label : "",
          homepage_position: item.section === "ferris-wheel" ? item.flash_slot || "unassigned" : "",
          stock_s: inventory.S || 0,
          stock_m: inventory.M || 0,
          stock_l: inventory.L || 0,
          stock_xl: inventory.XL || 0,
          active: item.is_active,
          created_at: item.created_at
        };
      });
      message(businessMessage, csvDownload("malteaser-products.csv", rows) ? "Product CSV downloaded." : "No products to export.", "success");
    };
    document.querySelector("[data-export-enquiries]").onclick = () => {
      message(businessMessage, csvDownload("malteaser-enquiries.csv", enquiries) ? "Enquiry CSV downloaded." : "No enquiries to export.", "success");
    };
  }

  document.querySelectorAll("[data-admin-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-admin-mode]").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.adminPanel !== button.dataset.adminMode;
      });
      if (button.dataset.adminMode === "remove") loadAdminItems();
      if (button.dataset.adminMode === "orders") loadAdminOrders();
      if (button.dataset.adminMode === "business") loadBusinessTools();
    });
  });

  document.querySelector("[data-refresh-orders]")?.addEventListener("click", () => {
    loadAdminOrders();
  });

  document.querySelector("[data-export-orders]")?.addEventListener("click", async () => {
    const orders = await loadAdminOrders();
    const rows = orders.map((order) => ({
      order_number: order.order_number,
      customer_name: order.customer_name,
      email: order.customer_email,
      phone: order.customer_phone,
      address: [order.address_line1, order.address_line2, order.city, order.state, order.pincode, order.country].filter(Boolean).join(", "),
      delivery_notes: order.delivery_notes || "",
      items: orderItemsText(order.items),
      subtotal: order.subtotal,
      discount: order.discount,
      total: order.total,
      status: order.status,
      payment_status: order.payment_status,
      email_status: order.email_status,
      created_at: order.created_at
    }));
    message(ordersMessage, csvDownload("malteaser-orders.csv", rows) ? "Orders CSV downloaded." : "No orders to export.", rows.length ? "success" : "");
  });

  function updateUploadFields() {
    const isNewArrival = sectionSelect?.value === "new-arrivals";
    const isFlashCard = sectionSelect?.value === "ferris-wheel";
    if (arrivalCategoryField) arrivalCategoryField.hidden = !isNewArrival;
    if (arrivalCategorySelect) {
      arrivalCategorySelect.required = isNewArrival;
      arrivalCategorySelect.disabled = !isNewArrival;
      if (!isNewArrival) arrivalCategorySelect.value = "";
    }
    if (flashCardField) flashCardField.hidden = !isFlashCard;
    if (flashCardSelect) {
      flashCardSelect.required = isFlashCard;
      flashCardSelect.disabled = !isFlashCard;
      if (!isFlashCard) flashCardSelect.value = "";
    }
    if (flashSlotField) flashSlotField.hidden = !isFlashCard;
    if (flashSlotSelect) {
      flashSlotSelect.required = isFlashCard;
      flashSlotSelect.disabled = !isFlashCard;
      if (!isFlashCard) flashSlotSelect.value = "";
    }
    if (photosInput) photosInput.multiple = true;
    if (photoHelp) {
      photoHelp.textContent = isFlashCard
        ? "Optional extra views remain attached to this single homepage product position."
        : "Optional extra views remain attached to this same product.";
    }
  }

  sectionSelect?.addEventListener("change", updateUploadFields);

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return;
    const submitButton = loginForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    message(loginMessage, "Signing in...");
    const values = Object.fromEntries(new FormData(loginForm));
    try {
      const result = await Promise.race([
        client.auth.signInWithPassword({ email: values.email.trim(), password: values.password }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Sign-in took too long. Close other Malteaser Admin tabs, refresh this page, and try again.")), 12000);
        })
      ]);
      if (result.error) throw result.error;
      if (!isAdministrator(result.data.user)) {
        await client.auth.signOut();
        throw new Error("This account does not have administrator access.");
      }
      message(loginMessage, "");
      showDashboard();
    } catch (error) {
      message(loginMessage, error.message || "Could not sign in. Please try again.", "error");
    } finally {
      submitButton.disabled = false;
    }
  });

  addForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return;
    const formData = new FormData(addForm);
    const thumbnail = formData.get("thumbnail");
    const extraFiles = formData.getAll("photos").filter((file) => file.size > 0);
    const pdfFile = formData.get("gallery_pdf");
    const values = Object.fromEntries(formData);
    if (!thumbnail?.size || !String(thumbnail.type || "").startsWith("image/")) {
      message(addMessage, "Choose one cover thumbnail image for this product.", "error");
      return;
    }
    if (pdfFile?.size && pdfFile.type !== "application/pdf" && !/\.pdf$/i.test(pdfFile.name)) {
      message(addMessage, "The product gallery file must be a PDF.", "error");
      return;
    }
    if (values.section === "ferris-wheel") {
      const deckNumber = String(values.flash_card || "").match(/[123]/)?.[0];
      const slotNumber = Number(values.flash_slot);
      if (!deckNumber) {
        message(addMessage, "Choose Flash Card 1, 2, or 3.", "error");
        return;
      }
      if (![1, 2, 3, 4, 5].includes(slotNumber)) {
        message(addMessage, "Choose product position 1, 2, 3, 4, or 5.", "error");
        return;
      }
      const { data: occupied, error } = await client
        .from("catalog_items")
        .select("id, title")
        .eq("section", "ferris-wheel")
        .eq("is_active", true)
        .eq("label", `Flash Card ${deckNumber}`)
        .eq("flash_slot", slotNumber)
        .limit(1);
      if (error) {
        message(addMessage, error.message, "error");
        return;
      }
      if (occupied?.length) {
        message(addMessage, `Flash Card ${deckNumber}, Position ${slotNumber} already contains ${occupied[0].title}. Remove it first or choose another position.`, "error");
        return;
      }
    }
    pendingUpload = { thumbnail, extraFiles, pdfFile, values };
    pendingInventoryEdit = null;
    inventoryForm?.reset();
    inventoryDialog.querySelector("[data-inventory-title]").textContent = "Quantity by size";
    inventoryDialog.querySelector("[data-inventory-intro]").textContent = "Set how many pieces of this product you are uploading in every size.";
    inventoryDialog.querySelector("[data-inventory-submit]").innerHTML = '<i data-lucide="upload"></i> Confirm & Upload';
    inventoryDialog?.showModal();
    window.lucide?.createIcons();
  });

  inventoryDialog?.addEventListener("click", (event) => {
    if (event.target === inventoryDialog || event.target.closest("[data-inventory-cancel]")) {
      pendingUpload = null;
      pendingInventoryEdit = null;
      inventoryDialog.close();
      return;
    }
    const stepButton = event.target.closest("[data-stock-step]");
    if (!stepButton) return;
    const input = stepButton.parentElement.querySelector("input[type='number']");
    const next = Math.max(0, Number(input.value || 0) + Number(stepButton.dataset.stockStep));
    input.value = next;
  });

  inventoryForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client || (!pendingUpload && !pendingInventoryEdit)) return;
    const stockValues = Object.fromEntries(new FormData(inventoryForm));
    const confirmButton = inventoryForm.querySelector("button[type='submit']");
    confirmButton.disabled = true;
    inventoryDialog.close();

    if (pendingInventoryEdit) {
      const edit = pendingInventoryEdit;
      message(removeMessage, `Saving quantity for ${edit.title}...`);
      const description = descriptionWithInventory(edit.description, stockValues);
      const inventory = inventoryFromValues(stockValues);
      const { error } = await client.from("catalog_items").update({ description, inventory }).eq("id", edit.id);
      confirmButton.disabled = false;
      if (error) {
        message(removeMessage, error.message, "error");
        return;
      }
      pendingInventoryEdit = null;
      localStorage.setItem("malteaser_catalog_updated_at", String(Date.now()));
      message(removeMessage, "Product quantity updated.", "success");
      loadAdminItems();
      return;
    }

    const { thumbnail, extraFiles, pdfFile, values } = pendingUpload;
    Object.assign(values, stockValues);
    const submitButton = addForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    message(addMessage, pdfFile?.size ? "Preparing your PDF gallery..." : "Uploading photos...");
    let records = [];
    let finalFiles = [];
    try {
      const pdfFiles = pdfFile?.size ? await pdfToImageFiles(pdfFile) : [];
      finalFiles = [thumbnail, ...pdfFiles, ...extraFiles];
      message(addMessage, `Uploading ${finalFiles.length} gallery image${finalFiles.length === 1 ? "" : "s"}...`);
      records = await uploadFiles(finalFiles, values);
      const { error } = await client.from("catalog_items").insert(records);
      if (error) throw error;
      localStorage.setItem("malteaser_catalog_updated_at", String(Date.now()));
      addForm.reset();
      inventoryForm.reset();
      pendingUpload = null;
      updateUploadFields();
      message(addMessage, `${finalFiles.length} photo${finalFiles.length === 1 ? "" : "s"} published as one product gallery.`, "success");
    } catch (error) {
      const uploadedPaths = records.flatMap((record) => productStoragePaths(record));
      if (uploadedPaths.length) await client.storage.from("catalog").remove(uploadedPaths);
      message(
        addMessage,
        error.code === "23505"
          ? "That flash-card position was just filled in another tab. Choose another position."
          : error.message,
        "error"
      );
    } finally {
      submitButton.disabled = false;
      confirmButton.disabled = false;
    }
  });

  itemsRoot?.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-inventory]");
    if (editButton) {
      pendingUpload = null;
      pendingInventoryEdit = {
        id: editButton.dataset.editInventory,
        title: editButton.dataset.itemTitle,
        description: editButton.dataset.description
      };
      inventoryDialog.querySelector("[data-inventory-title]").textContent = "Edit product quantity";
      inventoryDialog.querySelector("[data-inventory-intro]").textContent = `Update the available pieces for ${pendingInventoryEdit.title}.`;
      inventoryDialog.querySelector("[data-inventory-submit]").innerHTML = '<i data-lucide="save"></i> Save Quantity';
      const stock = {
        s: editButton.dataset.stockS,
        m: editButton.dataset.stockM,
        l: editButton.dataset.stockL,
        xl: editButton.dataset.stockXl
      };
      Object.entries(stock).forEach(([size, quantity]) => {
        inventoryForm.elements[`stock_${size}`].value = quantity || 0;
      });
      inventoryDialog.showModal();
      window.lucide?.createIcons();
      return;
    }

    const button = event.target.closest("[data-delete-id]");
    if (!button || !client) return;
    button.disabled = true;
    message(removeMessage, "Removing collection...");
    const { error } = await client.from("catalog_items").delete().eq("id", button.dataset.deleteId);
    if (error) {
      button.disabled = false;
      return message(removeMessage, error.message, "error");
    }
    if (button.dataset.storagePaths) {
      let paths = [];
      try { paths = JSON.parse(button.dataset.storagePaths); } catch {}
      if (paths.length) await client.storage.from("catalog").remove(paths);
    }
    localStorage.setItem("malteaser_catalog_updated_at", String(Date.now()));
    message(removeMessage, "Collection removed.", "success");
    loadAdminItems();
  });

  ordersRoot?.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-order-status]");
    if (!select || !client) return;
    select.disabled = true;
    message(ordersMessage, "Updating order status...");
    const { error } = await client
      .from("orders")
      .update({ status: select.value, updated_at: new Date().toISOString() })
      .eq("id", select.dataset.orderStatus);
    select.disabled = false;
    if (error) {
      message(ordersMessage, error.message, "error");
      return;
    }
    message(ordersMessage, "Order status updated.", "success");
  });

  document.querySelector("[data-sign-out]")?.addEventListener("click", async () => {
    await client?.auth.signOut();
    showLogin();
  });

  document.addEventListener("DOMContentLoaded", async () => {
    ensureUploadFields();
    sectionSelect = document.querySelector("[data-section-select], [name='section']");
    arrivalCategoryField = document.querySelector("[data-arrival-category-field]");
    arrivalCategorySelect = arrivalCategoryField?.querySelector("select");
    flashCardField = document.querySelector("[data-flash-card-field]");
    flashCardSelect = flashCardField?.querySelector("select");
    flashSlotField = document.querySelector("[data-flash-slot-field]");
    flashSlotSelect = flashSlotField?.querySelector("select");
    photosInput = addForm?.querySelector("[name='photos']");
    photoHelp = document.querySelector("[data-photo-help]");
    inventoryDialog = document.querySelector("[data-inventory-dialog]");
    inventoryForm = document.querySelector("[data-inventory-form]");
    updateUploadFields();
    if (!catalog?.isConfigured) {
      setup.hidden = false;
      loginForm.querySelectorAll("input, button").forEach((element) => { element.disabled = true; });
      return;
    }
    if (await currentSession()) showDashboard();
  });
})();
