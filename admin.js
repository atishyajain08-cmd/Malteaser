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

  function message(element, text, type = "") {
    if (!element) return;
    element.textContent = text;
    element.dataset.type = type;
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
    return data.session;
  }

  async function uploadFiles(files, values) {
    const records = [];
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
        description: values.description,
        price: Number(values.price || 0),
        section: values.section,
        label: values.section === "new-arrivals" ? "New Arrival" : values.section === "product" ? "Product" : "Collection",
        image_url: publicData.publicUrl,
        storage_path: path,
        is_active: true,
        sort_order: index + 1
      });
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
    itemsRoot.innerHTML = (data || []).map((item) => `
      <article class="admin-item">
        <img src="${item.image_url || "assets/white-tshirt.svg"}" alt="${item.title}">
        <div><strong>${item.title}</strong><span>${item.section.replace("-", " ")}</span></div>
        <button class="icon-button" type="button" data-delete-id="${item.id}" data-storage-path="${item.storage_path || ""}" aria-label="Remove ${item.title}"><i data-lucide="trash-2"></i></button>
      </article>`).join("") || "<p>No uploaded collections yet.</p>";
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

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return;
    message(loginMessage, "Signing in...");
    const values = Object.fromEntries(new FormData(loginForm));
    const { error } = await client.auth.signInWithPassword({ email: values.email, password: values.password });
    if (error) return message(loginMessage, error.message, "error");
    message(loginMessage, "");
    showDashboard();
  });

  addForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return;
    const formData = new FormData(addForm);
    const files = formData.getAll("photos").filter((file) => file.size > 0);
    const values = Object.fromEntries(formData);
    message(addMessage, "Uploading photos...");
    try {
      const records = await uploadFiles(files, values);
      const { error } = await client.from("catalog_items").insert(records);
      if (error) throw error;
      addForm.reset();
      message(addMessage, `${records.length} photo${records.length === 1 ? "" : "s"} published successfully.`, "success");
    } catch (error) {
      message(addMessage, error.message, "error");
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
    message(removeMessage, "Collection removed.", "success");
    loadAdminItems();
  });

  document.querySelector("[data-sign-out]")?.addEventListener("click", async () => {
    await client?.auth.signOut();
    showLogin();
  });

  document.addEventListener("DOMContentLoaded", async () => {
    if (!catalog?.isConfigured) {
      setup.hidden = false;
      loginForm.querySelectorAll("input, button").forEach((element) => { element.disabled = true; });
      return;
    }
    if (await currentSession()) showDashboard();
  });
})();
