(function () {
  "use strict";

  const config = window.MALTEASER_SUPABASE || {};
  const page = location.pathname.split("/").pop() || "index.html";
  const protectedPages = new Set(["account.html", "orders.html"]);
  const guestPages = new Set(["login.html", "signup.html"]);
  const recoveryPage = "reset-password.html";
  const client = config.url && config.anonKey && window.supabase
    ? window.supabase.createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "malteaser-customer"
      }
    })
    : null;

  window.MalteaserAuth = { client };

  function pageUrl(file) {
    return new URL(file, location.href).href;
  }

  function safeNextPage() {
    const requested = new URLSearchParams(location.search).get("next");
    return requested && /^[a-z0-9-]+\.html$/i.test(requested)
      ? requested
      : "account.html";
  }

  function redirect(file, params = "") {
    location.replace(`${file}${params}`);
  }

  function show(target, text, type = "") {
    const message = target?.matches?.("[data-auth-message]")
      ? target
      : target?.querySelector?.("[data-auth-message]");
    if (!message) return;
    message.textContent = text;
    message.dataset.type = type;
  }

  function friendlyError(error) {
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("invalid login credentials")) return "The email or password is incorrect.";
    if (message.includes("email not confirmed")) return "Please verify your email before signing in.";
    if (message.includes("user already registered")) return "An account already exists for this email. Try signing in.";
    if (message.includes("password should be")) return "Please choose a stronger password with at least 8 characters.";
    if (message.includes("rate limit")) return "Too many attempts. Please wait a moment and try again.";
    if (message.includes("failed to fetch") || message.includes("network")) return "We could not reach the account service. Check your connection and try again.";
    return error?.message || "Something went wrong. Please try again.";
  }

  function setBusy(form, busy, busyLabel) {
    const button = form.querySelector("button[type='submit']");
    if (!button) return;
    if (!button.dataset.label) button.dataset.label = button.textContent.trim();
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
    button.textContent = busy ? busyLabel : button.dataset.label;
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

  function formatPrice(value) {
    return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
  }

  function formatDate(value) {
    return value ? new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "";
  }

  function validate(form, values, action) {
    if (!form.reportValidity()) return "Please complete all required fields.";
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      return "Enter a valid email address.";
    }
    if ((action === "signup" || action === "password") && values.password.length < 8) {
      return "Your password must contain at least 8 characters.";
    }
    if ((action === "signup" || action === "password") && values.password !== values.confirm_password) {
      return "Passwords do not match.";
    }
    if (action === "signup" && values.full_name.trim().length < 2) {
      return "Please enter your full name.";
    }
    return "";
  }

  async function submitAuthForm(form, action) {
    if (!client) {
      show(form, "Customer accounts are temporarily unavailable. Please contact Malteaser support.", "error");
      return;
    }

    const values = Object.fromEntries(new FormData(form));
    const validationError = validate(form, values, action);
    if (validationError) {
      show(form, validationError, "error");
      return;
    }

    const loadingLabels = {
      login: "Signing in...",
      signup: "Creating account...",
      reset: "Sending secure link...",
      password: "Updating password...",
      profile: "Saving details..."
    };
    setBusy(form, true, loadingLabels[action]);
    show(form, "");

    try {
      if (action === "login") {
        const { error } = await client.auth.signInWithPassword({
          email: values.email.trim(),
          password: values.password
        });
        if (error) throw error;
        redirect(safeNextPage());
        return;
      }

      if (action === "signup") {
        const { data, error } = await client.auth.signUp({
          email: values.email.trim(),
          password: values.password,
          options: {
            data: { full_name: values.full_name.trim() },
            emailRedirectTo: pageUrl("account.html")
          }
        });
        if (error) throw error;
        if (data.session) {
          redirect("account.html");
          return;
        }
        form.reset();
        show(form, "Account created. Check your email and open the verification link to continue.", "success");
      }

      if (action === "reset") {
        const { error } = await client.auth.resetPasswordForEmail(values.email.trim(), {
          redirectTo: pageUrl(recoveryPage)
        });
        if (error) throw error;
        form.reset();
        show(form, "A secure password-reset link has been sent. Please check your email.", "success");
      }

      if (action === "password") {
        const { error } = await client.auth.updateUser({ password: values.password });
        if (error) throw error;
        form.reset();
        show(form, "Your password has been updated. Taking you to your account...", "success");
        window.setTimeout(() => redirect("account.html"), 900);
      }

      if (action === "profile") {
        const fullName = values.full_name.trim();
        if (fullName.length < 2) throw new Error("Please enter your full name.");
        const { data, error } = await client.auth.updateUser({
          data: { full_name: fullName }
        });
        if (error) throw error;
        renderAccount(data.user);
        show(form, "Your details have been saved.", "success");
      }
    } catch (error) {
      console.error(`[Malteaser auth] "${action}" failed:`, error?.message || error);
      show(form, friendlyError(error), "error");
    } finally {
      setBusy(form, false);
    }
  }

  function renderAccount(user) {
    if (!user) return;
    const fullName = user.user_metadata?.full_name?.trim() || "Malteaser Customer";
    document.querySelectorAll("[data-customer-name]").forEach((node) => {
      node.textContent = fullName;
    });
    document.querySelectorAll("[data-customer-email]").forEach((node) => {
      node.textContent = user.email || "";
    });
    const nameInput = document.querySelector("[data-profile-name]");
    if (nameInput) nameInput.value = fullName === "Malteaser Customer" ? "" : fullName;
  }

  async function renderCustomerOrders() {
    const ordersRoot = document.querySelector("[data-customer-orders]");
    if (!ordersRoot || !client) return;
    ordersRoot.innerHTML = "<p>Loading your orders...</p>";
    const { data, error } = await client
      .from("orders")
      .select("order_number, items, total, status, payment_status, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      ordersRoot.innerHTML = `<p>${escapeHtml(error.message || "Could not load orders right now.")}</p>`;
      return;
    }

    const orders = data || [];
    ordersRoot.innerHTML = orders.map((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      return `
        <article class="account-order">
          <div>
            <span class="mini-kicker">${escapeHtml(order.order_number)}</span>
            <strong>${formatPrice(order.total)}</strong>
            <p>${formatDate(order.created_at)} · ${escapeHtml(order.status)} · ${escapeHtml(order.payment_status)}</p>
          </div>
          <small>${items.map((item) => `${escapeHtml(item.title)}${item.size ? ` · ${escapeHtml(item.size)}` : ""} x ${Number(item.quantity || 1)}`).join("<br>")}</small>
        </article>`;
    }).join("") || "<p>No orders yet. Your confirmed Malteaser orders will appear here.</p>";
  }

  function revealProtectedContent() {
    document.body.classList.remove("auth-pending");
    document.querySelector("[data-auth-protected]")?.removeAttribute("hidden");
  }

  async function initialize() {
    const forms = [
      ["[data-customer-login]", "login"],
      ["[data-customer-signup]", "signup"],
      ["[data-customer-reset]", "reset"],
      ["[data-customer-password]", "password"],
      ["[data-customer-profile]", "profile"]
    ];

    forms.forEach(([selector, action]) => {
      document.querySelector(selector)?.addEventListener("submit", (event) => {
        event.preventDefault();
        submitAuthForm(event.currentTarget, action);
      });
    });

    document.querySelector("[data-customer-logout]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Signing out...";
      // Clear the outgoing user's ephemeral session state (cart/wishlist/coupon).
      // Orders are NOT wiped — they are a historical record and must persist so
      // the customer can see their order history when they sign in again.
      try {
        const { data: sess } = client ? await client.auth.getSession() : { data: { session: null } };
        const uid = sess?.session?.user?.id;
        if (uid) {
          ["cart", "wishlist", "coupon"]
            .forEach((name) => localStorage.removeItem(`malteaser_${name}_${uid}`));
        }
      } catch {}
      if (client) await client.auth.signOut();
      window.dispatchEvent(new CustomEvent("malteaser:user-changed"));
      redirect("login.html");
    });

    if (!client) {
      document.querySelectorAll("[data-auth-message]").forEach((message) => {
        show(message, "Customer accounts are temporarily unavailable. Please contact Malteaser support.", "error");
      });
      if (protectedPages.has(page)) redirect("login.html", "?service=unavailable");
      return;
    }

    const { data, error } = await client.auth.getSession();
    const session = error ? null : data.session;

    if (protectedPages.has(page) && !session) {
      redirect("login.html", `?next=${encodeURIComponent(page)}`);
      return;
    }

    if (guestPages.has(page) && session) {
      redirect("account.html");
      return;
    }

    if (page === recoveryPage && !session) {
      show(document.querySelector("[data-customer-password]"), "This recovery link is invalid or has expired. Request a new one.", "error");
      document.querySelector("[data-customer-password] button")?.setAttribute("disabled", "");
    }

    if (session?.user) {
      renderAccount(session.user);
      if (page === "account.html") renderCustomerOrders();
    }
    revealProtectedContent();

    client.auth.onAuthStateChange((event, nextSession) => {
      // Tell catalog.js to re-resolve the current user and re-render
      // cart/wishlist/orders against the new identity. Without this,
      // a sign-in/sign-up would keep showing the previous bucket until
      // the next page navigation.
      window.dispatchEvent(new CustomEvent("malteaser:user-changed", {
        detail: { event, userId: nextSession?.user?.id || null }
      }));
      if (event === "SIGNED_OUT" && protectedPages.has(page)) {
        redirect("login.html", `?next=${encodeURIComponent(page)}`);
      }
      if (event === "USER_UPDATED" && nextSession?.user) {
        renderAccount(nextSession.user);
      }
    });
  }

  initialize().catch(() => {
    if (protectedPages.has(page)) redirect("login.html", `?next=${encodeURIComponent(page)}`);
    document.querySelectorAll("[data-auth-message]").forEach((message) => {
      show(message, "The account service could not be started. Please refresh and try again.", "error");
    });
  });
})();
