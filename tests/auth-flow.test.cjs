const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const source = fs.readFileSync(new URL("../auth.js", `file://${__dirname}/`), "utf8");

function makeElement({ values = {}, message = null } = {}) {
  const listeners = {};
  const button = {
    dataset: {},
    disabled: false,
    textContent: "Submit",
    setAttribute(name, value) {
      this[name] = value;
      if (name === "disabled") this.disabled = true;
    }
  };
  return {
    values,
    listeners,
    dataset: {},
    textContent: "",
    value: "",
    disabled: false,
    matches(selector) {
      return selector === "[data-auth-message]" && this === message;
    },
    querySelector(selector) {
      if (selector === "[data-auth-message]") return message;
      if (selector.includes("button")) return button;
      return null;
    },
    addEventListener(type, callback) {
      listeners[type] = callback;
    },
    reportValidity() {
      return true;
    },
    reset() {
      this.resetCalled = true;
    },
    removeAttribute(name) {
      this[name] = false;
    },
    setAttribute(name, value) {
      this[name] = value;
    }
  };
}

async function runScenario({ page, session, signInError = null }) {
  const message = makeElement();
  const loginForm = makeElement({
    values: { email: "customer@example.com", password: "correct-password" },
    message
  });
  const signupForm = makeElement({
    values: {
      full_name: "Asha Jain",
      email: "new@example.com",
      password: "strong-password",
      confirm_password: "strong-password"
    },
    message
  });
  const resetForm = makeElement({
    values: { email: "customer@example.com" },
    message
  });
  const passwordForm = makeElement({
    values: {
      password: "new-password",
      confirm_password: "new-password"
    },
    message
  });
  const protectedMain = makeElement();
  protectedMain.hidden = true;
  const nameNode = makeElement();
  const emailNode = makeElement();
  const nameInput = makeElement();
  const logout = makeElement();
  logout.textContent = "Log Out";
  const redirects = [];
  const calls = [];

  const auth = {
    async getSession() {
      return { data: { session }, error: null };
    },
    async signInWithPassword(values) {
      calls.push(["login", values]);
      return { data: { session }, error: signInError };
    },
    async signUp(values) {
      calls.push(["signup", values]);
      return { data: { session: null }, error: null };
    },
    async resetPasswordForEmail(email, options) {
      calls.push(["reset", email, options]);
      return { data: {}, error: null };
    },
    async updateUser(values) {
      calls.push(["update", values]);
      return { data: { user: session?.user || null }, error: null };
    },
    async signOut() {
      calls.push(["logout"]);
      return { error: null };
    },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } };
    }
  };

  const selectors = {
    "[data-customer-login]": page === "login.html" ? loginForm : null,
    "[data-customer-signup]": page === "signup.html" ? signupForm : null,
    "[data-customer-reset]": page === "forgot-password.html" ? resetForm : null,
    "[data-customer-password]": page === "reset-password.html" ? passwordForm : null,
    "[data-customer-profile]": null,
    "[data-customer-logout]": page === "account.html" ? logout : null,
    "[data-auth-protected]": page === "account.html" ? protectedMain : null,
    "[data-profile-name]": page === "account.html" ? nameInput : null
  };

  const document = {
    body: { classList: { remove() {} } },
    querySelector(selector) {
      return selectors[selector] || null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-customer-name]") return [nameNode];
      if (selector === "[data-customer-email]") return [emailNode];
      if (selector === "[data-auth-message]") return [message];
      return [];
    }
  };

  const sandbox = {
    window: {
      MALTEASER_SUPABASE: { url: "https://example.supabase.co", anonKey: "public-key" },
      supabase: { createClient: () => ({ auth }) },
      setTimeout: (callback) => callback()
    },
    document,
    location: {
      pathname: `/${page}`,
      search: "",
      href: `https://shop.example/${page}`,
      replace(url) {
        redirects.push(url);
      }
    },
    URL,
    URLSearchParams,
    Set,
    FormData: class {
      constructor(form) {
        return Object.entries(form.values);
      }
    },
    console
  };

  vm.runInNewContext(source, sandbox);
  await new Promise((resolve) => setTimeout(resolve, 0));

  return {
    message,
    loginForm,
    signupForm,
    resetForm,
    passwordForm,
    protectedMain,
    nameNode,
    emailNode,
    logout,
    redirects,
    calls
  };
}

(async () => {
  const guest = await runScenario({ page: "account.html", session: null });
  assert.deepStrictEqual(Array.from(guest.redirects), ["login.html?next=account.html"]);

  const session = {
    user: {
      email: "customer@example.com",
      user_metadata: { full_name: "Asha Jain" }
    }
  };
  const account = await runScenario({ page: "account.html", session });
  assert.strictEqual(account.protectedMain.hidden, false);
  assert.strictEqual(account.nameNode.textContent, "Asha Jain");
  assert.strictEqual(account.emailNode.textContent, "customer@example.com");

  const signedInGuestPage = await runScenario({ page: "login.html", session });
  assert.deepStrictEqual(Array.from(signedInGuestPage.redirects), ["account.html"]);

  const existingLogin = await runScenario({ page: "login.html", session: null });
  existingLogin.loginForm.listeners.submit({
    preventDefault() {},
    currentTarget: existingLogin.loginForm
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(existingLogin.calls[0][0], "login");
  assert.deepStrictEqual(Array.from(existingLogin.redirects), ["account.html"]);

  const wrongPassword = await runScenario({
    page: "login.html",
    session: null,
    signInError: new Error("Invalid login credentials")
  });
  wrongPassword.loginForm.listeners.submit({
    preventDefault() {},
    currentTarget: wrongPassword.loginForm
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(wrongPassword.message.textContent, "The email or password is incorrect.");
  assert.strictEqual(wrongPassword.loginForm.querySelector("button[type='submit']").disabled, false);

  const signup = await runScenario({ page: "signup.html", session: null });
  signup.signupForm.listeners.submit({
    preventDefault() {},
    currentTarget: signup.signupForm
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(signup.calls[0][0], "signup");
  assert.strictEqual(signup.signupForm.resetCalled, true);
  assert.strictEqual(signup.message.dataset.type, "success");

  const reset = await runScenario({ page: "forgot-password.html", session: null });
  reset.resetForm.listeners.submit({
    preventDefault() {},
    currentTarget: reset.resetForm
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(reset.calls[0][0], "reset");
  assert.match(reset.calls[0][2].redirectTo, /reset-password\.html$/);

  const password = await runScenario({ page: "reset-password.html", session });
  password.passwordForm.listeners.submit({
    preventDefault() {},
    currentTarget: password.passwordForm
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(password.calls[0][0], "update");
  assert.deepStrictEqual(Array.from(password.redirects), ["account.html"]);

  account.logout.listeners.click({ currentTarget: account.logout });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepStrictEqual(Array.from(account.calls, (call) => Array.from(call)), [["logout"]]);
  assert.deepStrictEqual(Array.from(account.redirects), ["login.html"]);

  console.log("Auth flow tests passed: signup, login, wrong password, recovery, session restore, route protection, logout.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
