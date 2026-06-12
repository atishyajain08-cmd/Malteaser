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
  let inventoryDialog = document.querySelector("[data-inventory-dialog]");
  let inventoryForm = document.querySelector("[data-inventory-form]");
  let pendingUpload = null;
  let sectionSelect = document.querySelector("[data-section-select], [name='section']");
  let arrivalCategoryField = document.querySelector("[data-arrival-category-field]");
  let arrivalCategorySelect = arrivalCategoryField?.querySelector("select");

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

  function inventoryFromDescription(description) {
    const match = String(description || "").match(/\[malteaser_stock:S=(\d+),M=(\d+),L=(\d+),XL=(\d+)\]/);
    return match ? { S: Number(match[1]), M: Number(match[2]), L: Number(match[3]), XL: Number(match[4]) } : null;
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
    const records = [];
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
        records.push({
          title: files.length > 1 ? `${values.title} ${index + 1}` : values.title,
          description: descriptionWithInventory(values.description, values),
          price: Number(values.price || 0),
          section: values.section,
          label: values.section === "new-arrivals"
            ? values.arrival_category
            : values.section === "product" ? "Product" : "Collection",
          image_url: publicData.publicUrl,
          storage_path: path,
          is_active: true,
          sort_order: index + 1
        });
      }
    } catch (error) {
      const uploadedPaths = records.map((record) => record.storage_path);
      if (uploadedPaths.length) await client.storage.from("catalog").remove(uploadedPaths);
      throw error;
    }
    return records;
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
      const inventory = inventoryFromDescription(item.description);
      const stockText = inventory
        ? `S ${inventory.S} · M ${inventory.M} · L ${inventory.L} · XL ${inventory.XL}`
        : "Size stock not set";
      return `
      <article class="admin-item">
        <img src="${escapeHtml(item.image_url || "assets/white-tshirt.svg")}" alt="${escapeHtml(item.title)}">
        <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.section.replace("-", " "))}${item.section === "new-arrivals" ? ` · ${escapeHtml(item.label)}` : ""}</span><small>${stockText}</small></div>
        <button class="icon-button" type="button" data-delete-id="${escapeHtml(item.id)}" data-storage-path="${escapeHtml(item.storage_path)}" aria-label="Remove ${escapeHtml(item.title)}"><i data-lucide="trash-2"></i></button>
      </article>`;
    }).join("") || "<p>No uploaded collections yet.</p>";
    window.lucide?.createIcons();
  }

  document.querySelectorAll("[data-admin-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-admin-mode]").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.adminPanel !== button.dataset.adminMode;
      });
      if (button.dataset.adminMode === "remove") loadAdminItems();
    });
  });

  function updateArrivalCategoryField() {
    const isNewArrival = sectionSelect?.value === "new-arrivals";
    if (arrivalCategoryField) arrivalCategoryField.hidden = !isNewArrival;
    if (arrivalCategorySelect) {
      arrivalCategorySelect.required = isNewArrival;
      arrivalCategorySelect.disabled = !isNewArrival;
      if (!isNewArrival) arrivalCategorySelect.value = "";
    }
  }

  sectionSelect?.addEventListener("change", updateArrivalCategoryField);

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
    const files = formData.getAll("photos").filter((file) => file.size > 0);
    const values = Object.fromEntries(formData);
    pendingUpload = { files, values };
    inventoryForm?.reset();
    inventoryDialog?.showModal();
    window.lucide?.createIcons();
  });

  inventoryDialog?.addEventListener("click", (event) => {
    if (event.target === inventoryDialog || event.target.closest("[data-inventory-cancel]")) {
      pendingUpload = null;
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
    if (!client || !pendingUpload) return;
    const stockValues = Object.fromEntries(new FormData(inventoryForm));
    const { files, values } = pendingUpload;
    Object.assign(values, stockValues);
    const submitButton = addForm.querySelector("button[type='submit']");
    const confirmButton = inventoryForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    confirmButton.disabled = true;
    inventoryDialog.close();
    message(addMessage, "Uploading photos...");
    let records = [];
    try {
      records = await uploadFiles(files, values);
      const { error } = await client.from("catalog_items").insert(records);
      if (error) throw error;
      localStorage.setItem("malteaser_catalog_updated_at", String(Date.now()));
      addForm.reset();
      inventoryForm.reset();
      pendingUpload = null;
      updateArrivalCategoryField();
      message(addMessage, `${records.length} photo${records.length === 1 ? "" : "s"} published successfully.`, "success");
    } catch (error) {
      const uploadedPaths = records.map((record) => record.storage_path).filter(Boolean);
      if (uploadedPaths.length) await client.storage.from("catalog").remove(uploadedPaths);
      message(addMessage, error.message, "error");
    } finally {
      submitButton.disabled = false;
      confirmButton.disabled = false;
    }
  });

  itemsRoot?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-id]");
    if (!button || !client) return;
    button.disabled = true;
    message(removeMessage, "Removing collection...");
    const { error } = await client.from("catalog_items").delete().eq("id", button.dataset.deleteId);
    if (error) {
      button.disabled = false;
      return message(removeMessage, error.message, "error");
    }
    if (button.dataset.storagePath) {
      await client.storage.from("catalog").remove([button.dataset.storagePath]);
    }
    localStorage.setItem("malteaser_catalog_updated_at", String(Date.now()));
    message(removeMessage, "Collection removed.", "success");
    loadAdminItems();
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
    inventoryDialog = document.querySelector("[data-inventory-dialog]");
    inventoryForm = document.querySelector("[data-inventory-form]");
    updateArrivalCategoryField();
    if (!catalog?.isConfigured) {
      setup.hidden = false;
      loginForm.querySelectorAll("input, button").forEach((element) => { element.disabled = true; });
      return;
    }
    if (await currentSession()) showDashboard();
  });
})();
