const cartButton = document.querySelector(".cart-button");
const cartCount = cartButton.querySelector("span");
let cartItems = 0;
let localCart = JSON.parse(localStorage.getItem("goquick_cart") || "[]");
const API_URL = window.GOQUICK_API_URL || "/api";

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("goquick_token");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `GoQuick API is unavailable at ${API_URL}. Configure window.GOQUICK_API_URL for the deployed backend.`,
    );
  }
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || body.details || "Request failed");
  return body;
}

window.GoQuickAPI = {
  register: (name, email, password) =>
    apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
  login: async (email, password) => {
    const result = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem("goquick_token", result.token);
    return result;
  },
  logout: () => localStorage.removeItem("goquick_token"),
  cart: () => apiRequest("/cart"),
  orders: () => apiRequest("/orders"),
  addToCart: (productId, quantity = 1) =>
    apiRequest("/cart/items", {
      method: "POST",
      body: JSON.stringify({ productId, quantity }),
    }),
  checkout: (orderDetails) =>
    apiRequest("/orders", {
      method: "POST",
      body: JSON.stringify(orderDetails),
    }),
  createPaymentOrder: () =>
    apiRequest("/payments/create-order", { method: "POST", body: "{}" }),
  verifyPayment: (paymentDetails) =>
    apiRequest("/payments/verify", {
      method: "POST",
      body: JSON.stringify(paymentDetails),
    }),
};

const authOverlay = document.querySelector(".auth-overlay");
const authModal = document.querySelector(".auth-modal");
const accountButton = document.querySelector(".account-button");
const ordersButton = document.querySelector(".orders-button");
const logoutButton = document.querySelector(".logout-button");
const authForm = document.querySelector(".auth-form");
const authTitle = document.querySelector("#auth-title");
const authMessage = document.querySelector(".auth-message");
const nameField = document.querySelector(".name-field");
let authMode = "login";

function setAuthMode(mode) {
  authMode = mode;
  document
    .querySelectorAll(".auth-tab")
    .forEach((tab) =>
      tab.classList.toggle("active", tab.dataset.mode === mode),
    );
  nameField.hidden = mode !== "register";
  authForm.elements.password.autocomplete =
    mode === "register" ? "new-password" : "current-password";
  authTitle.innerHTML =
    mode === "register"
      ? "Start your<br /><em>fresh journey.</em>"
      : "Your groceries,<br /><em>your way.</em>";
  document.querySelector(".auth-submit").innerHTML =
    `${mode === "register" ? "Create account" : "Sign in"} <span>→</span>`;
  document.querySelector(".auth-switch").innerHTML =
    mode === "register"
      ? 'Already have an account? <button type="button">Sign in</button>'
      : 'New to GoQuick? <button type="button">Create an account</button>';
  document
    .querySelector(".auth-switch button")
    .addEventListener(
      "click",
      () => setAuthMode(mode === "register" ? "login" : "register"),
      { once: true },
    );
  authMessage.textContent = "";
}

function openAuth(mode = "login") {
  setAuthMode(mode);
  authOverlay.hidden = false;
  authForm.elements.email.focus();
}

accountButton.addEventListener("click", () => {
  if (localStorage.getItem("goquick_token")) return;
  openAuth();
});
function setLoggedInState(name = "My account") {
  accountButton.textContent = name;
  accountButton.setAttribute("aria-label", "Open account");
  logoutButton.hidden = false;
  ordersButton.hidden = false;
}
function logout() {
  window.GoQuickAPI.logout();
  localStorage.removeItem("goquick_cart");
  accountButton.textContent = "Sign in";
  logoutButton.hidden = true;
  ordersButton.hidden = true;
  cartItems = 0;
  renderCart([]);
  cartOverlay.hidden = true;
  ordersOverlay.hidden = true;
}
logoutButton.addEventListener("click", logout);
document.querySelector(".auth-close").addEventListener("click", () => {
  authOverlay.hidden = true;
});
authOverlay.addEventListener("click", (event) => {
  if (event.target === authOverlay) authOverlay.hidden = true;
});
document
  .querySelectorAll(".auth-tab")
  .forEach((tab) =>
    tab.addEventListener("click", () => setAuthMode(tab.dataset.mode)),
  );
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(authForm));
  values.name = values.name.trim();
  values.email = values.email.trim().toLowerCase();
  if (authMode === "register" && values.password.length < 8) {
    authMessage.textContent = "Password must be at least 8 characters.";
    return;
  }
  authMessage.className = "auth-message";
  authMessage.textContent = "Connecting...";
  try {
    const result =
      authMode === "register"
        ? await window.GoQuickAPI.register(
            values.name,
            values.email,
            values.password,
          )
        : await window.GoQuickAPI.login(values.email, values.password);
    if (authMode === "register")
      localStorage.setItem("goquick_token", result.token);
    setLoggedInState(`Hi, ${result.user.name.split(" ")[0]}`);
    authMessage.className = "auth-message success";
    authMessage.textContent = "You are signed in.";
    setTimeout(() => {
      authOverlay.hidden = true;
    }, 500);
  } catch (error) {
    authMessage.textContent =
      error.message ||
      "Unable to create account. Check that the API and MySQL are running.";
  }
});

if (localStorage.getItem("goquick_token")) setLoggedInState();

const cartOverlay = document.querySelector(".cart-overlay");
const cartList = document.querySelector(".cart-items");
const cartEmpty = document.querySelector(".cart-empty");
const cartSummary = document.querySelector(".cart-summary");
const cartTotal = document.querySelector(".cart-total");
const drawerCount = document.querySelector(".drawer-count");
const ordersOverlay = document.querySelector(".orders-overlay");
const ordersList = document.querySelector(".orders-list");
const ordersEmpty = document.querySelector(".orders-empty");
const checkoutOverlay = document.querySelector(".checkout-overlay");
const checkoutForm = document.querySelector(".checkout-form");
const checkoutTotal = document.querySelector(".checkout-total");
const checkoutMessage = document.querySelector(".checkout-message");

function renderCart(items = localCart) {
  cartItems = items.reduce((sum, item) => sum + Number(item.quantity), 0);
  cartCount.textContent = cartItems;
  drawerCount.textContent = cartItems;
  cartList.innerHTML = items
    .map(
      (item) =>
        `<div class="cart-row"><img src="${item.imageUrl}" alt="${item.name}" /><div><h3>${item.name}</h3><p>${item.quantity} × $${Number(item.price).toFixed(2)} / ${item.unit}</p></div><strong>$${(Number(item.price) * item.quantity).toFixed(2)}</strong></div>`,
    )
    .join("");
  const total = items.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0,
  );
  cartTotal.textContent = `$${total.toFixed(2)}`;
  cartEmpty.hidden = items.length > 0;
  cartSummary.hidden = items.length === 0;
}

async function refreshCart() {
  if (localStorage.getItem("goquick_token")) {
    try {
      const result = await window.GoQuickAPI.cart();
      renderCart(result.items);
      return;
    } catch (error) {
      console.error(error);
    }
  }
  renderCart();
}

function openCart() {
  refreshCart();
  cartOverlay.hidden = false;
}

function renderOrders(orders = []) {
  if (!orders.length) {
    ordersList.innerHTML = "";
    ordersEmpty.hidden = false;
    return;
  }
  ordersEmpty.hidden = true;
  ordersList.innerHTML = orders
    .map(
      (order) => `
        <article class="order-card">
          <div class="order-card-head">
            <div>
              <span>Order #${order.orderId}</span>
              <strong>${new Date(order.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}</strong>
            </div>
            <span class="order-status">${order.status}</span>
          </div>
          <div class="order-items">
            ${order.items
              .map(
                (item) => `
                  <div class="order-item">
                    <span>${item.name} × ${item.quantity}</span>
                    <strong>$${(Number(item.price) * Number(item.quantity)).toFixed(2)}</strong>
                  </div>
                `,
              )
              .join("")}
          </div>
          <div class="order-summary">
            <span>${order.items.length} item${order.items.length !== 1 ? "s" : ""}</span>
            <strong>$${Number(order.total).toFixed(2)}</strong>
          </div>
        </article>
      `,
    )
    .join("");
}

async function openOrders() {
  if (!localStorage.getItem("goquick_token")) {
    openAuth("login");
    authMessage.textContent = "Sign in to view your orders.";
    return;
  }
  ordersOverlay.hidden = false;
  try {
    const result = await window.GoQuickAPI.orders();
    renderOrders(result.orders);
  } catch (error) {
    ordersList.innerHTML = `<p class="orders-error">${error.message}</p>`;
    ordersEmpty.hidden = true;
  }
}

cartButton.addEventListener("click", openCart);
ordersButton.addEventListener("click", openOrders);
document.querySelector(".cart-close").addEventListener("click", () => {
  cartOverlay.hidden = true;
});
document.querySelector(".orders-close").addEventListener("click", () => {
  ordersOverlay.hidden = true;
});
cartOverlay.addEventListener("click", (event) => {
  if (event.target === cartOverlay) cartOverlay.hidden = true;
});
ordersOverlay.addEventListener("click", (event) => {
  if (event.target === ordersOverlay) ordersOverlay.hidden = true;
});
document.querySelector(".continue-shopping").addEventListener("click", () => {
  cartOverlay.hidden = true;
  document.querySelector("#products").scrollIntoView({ behavior: "smooth" });
});
document
  .querySelector(".checkout-button")
  .addEventListener("click", async () => {
    if (!localStorage.getItem("goquick_token")) {
      cartOverlay.hidden = true;
      openAuth("login");
      authMessage.textContent = "Sign in to continue to checkout.";
      return;
    }
    const items = document.querySelectorAll(".cart-row");
    if (!items.length) return;
    checkoutTotal.textContent = cartTotal.textContent;
    checkoutMessage.textContent = "";
    checkoutOverlay.hidden = false;
  });
document.querySelector(".checkout-close").addEventListener("click", () => {
  checkoutOverlay.hidden = true;
});
checkoutOverlay.addEventListener("click", (event) => {
  if (event.target === checkoutOverlay) checkoutOverlay.hidden = true;
});
checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(checkoutForm));
  checkoutMessage.textContent =
    values.paymentMethod === "UPI"
      ? "Opening secure UPI payment..."
      : "Placing your order...";
  try {
    let paymentDetails = {};
    if (values.paymentMethod === "UPI") {
      if (!window.Razorpay)
        throw new Error(
          "Razorpay could not load. Check your internet connection.",
        );
      const paymentOrder = await window.GoQuickAPI.createPaymentOrder();
      await new Promise((resolve, reject) => {
        const payment = new window.Razorpay({
          key: paymentOrder.keyId,
          amount: paymentOrder.amount,
          currency: paymentOrder.currency,
          name: "GoQuick",
          description: "Fresh grocery order",
          order_id: paymentOrder.orderId,
          prefill: { name: values.customerName, contact: values.phone },
          method: { upi: true, card: false, netbanking: false, wallet: false },
          handler: (response) => {
            paymentDetails = {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            };
            resolve();
          },
          modal: {
            ondismiss: () => reject(new Error("UPI payment was cancelled")),
          },
        });
        payment.on("payment.failed", () =>
          reject(new Error("UPI payment failed. Please try again.")),
        );
        payment.open();
      });
      await window.GoQuickAPI.verifyPayment(paymentDetails);
    }
    const order = await window.GoQuickAPI.checkout({
      ...values,
      ...paymentDetails,
    });
    localCart = [];
    localStorage.removeItem("goquick_cart");
    checkoutForm.reset();
    checkoutOverlay.hidden = true;
    cartOverlay.hidden = true;
    renderCart([]);
    sessionStorage.setItem(
      "goquick_last_order",
      JSON.stringify({
        orderId: order.orderId,
        total: Number(order.total),
        paymentMethod: values.paymentMethod,
        customerName: values.customerName,
      }),
    );
    window.location.href = "order-success.html";
  } catch (error) {
    checkoutMessage.textContent = error.message;
  }
});

document.querySelectorAll(".add").forEach((button) => {
  button.addEventListener("click", async () => {
    const card = button.closest(".product-card");
    const product = {
      id: Number(button.dataset.productId),
      name: card.querySelector("h3").textContent,
      category: card.querySelector(".product-type").textContent,
      price: Number.parseFloat(
        card
          .querySelector(".product-bottom strong")
          .textContent.replace("$", ""),
      ),
      unit: card.querySelector("small").textContent.replace("/ ", ""),
      imageUrl: card.querySelector("img").src,
      quantity: 1,
    };
    const existing = localCart.find((item) => item.id === product.id);
    if (existing) existing.quantity += 1;
    else localCart.push(product);
    localStorage.setItem("goquick_cart", JSON.stringify(localCart));
    if (localStorage.getItem("goquick_token")) {
      try {
        await window.GoQuickAPI.addToCart(Number(button.dataset.productId));
      } catch (error) {
        console.error(error);
      }
    }
    renderCart();
    openCart();
    button.textContent = "✓";
    button.style.background = "#1ca96b";
    button.style.color = "#fff";
    setTimeout(() => {
      button.textContent = "+";
      button.style.background = "";
      button.style.color = "";
    }, 900);
  });
});

document.querySelectorAll(".heart").forEach((button) => {
  button.addEventListener("click", () => {
    button.textContent = button.textContent === "♡" ? "♥" : "♡";
    button.style.color = button.textContent === "♥" ? "#f68447" : "";
  });
});

document.querySelectorAll(".filter-tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(".filter-tabs .active").classList.remove("active");
    button.classList.add("active");
  });
});
