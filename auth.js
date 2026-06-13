(function () {
  const config = window.MALTEASER_SUPABASE || {};
  const client = config.url && config.anonKey && window.supabase
    ? window.supabase.createClient(config.url, config.anonKey, {
      auth: { persistSession: true, storageKey: "malteaser-customer" }
    })
    : null;

  function show(form, text, type = "") {
    const message = form.querySelector("[data-auth-message]");
    if (!message) return;
    message.textContent = text;
    message.dataset.type = type;
  }

  async function handle(form, action) {
    if (!client) {
      show(form, "Customer accounts will be available after the Supabase connection is completed.", "error");
      return;
    }
    const button = form.querySelector("button[type='submit']");
    const values = Object.fromEntries(new FormData(form));
    button.disabled = true;
    show(form, "Please wait...");
    try {
      if (action === "login") {
        const { error } = await client.auth.signInWithPassword({
          email: values.email.trim(),
          password: values.password
        });
        if (error) throw error;
        location.href = "account.html";
      }
      if (action === "signup") {
        if (values.password !== values.confirm_password) throw new Error("Passwords do not match.");
        const { error } = await client.auth.signUp({
          email: values.email.trim(),
          password: values.password,
          options: { data: { full_name: values.full_name.trim() } }
        });
        if (error) throw error;
        form.reset();
        show(form, "Account created. Please check your email to verify your account.", "success");
      }
      if (action === "reset") {
        const redirectTo = new URL("login.html", location.href).href;
        const { error } = await client.auth.resetPasswordForEmail(values.email.trim(), { redirectTo });
        if (error) throw error;
        form.reset();
        show(form, "Password reset instructions have been sent to your email.", "success");
      }
    } catch (error) {
      show(form, error.message || "Something went wrong. Please try again.", "error");
    } finally {
      button.disabled = false;
    }
  }

  document.querySelector("[data-customer-login]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handle(event.currentTarget, "login");
  });
  document.querySelector("[data-customer-signup]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handle(event.currentTarget, "signup");
  });
  document.querySelector("[data-customer-reset]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handle(event.currentTarget, "reset");
  });
})();
