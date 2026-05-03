document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const CONFIG = {
    referralApiBaseUrl:
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.protocol === "file:"
        ? "http://localhost:3001/api"
        : `${window.location.origin}/api`
  };

  const $ = (selector, context = document) => context.querySelector(selector);

  const adminLoginCard = $("#adminLoginCard");
  const adminTopHeader = $(".admin-top-header");
  const adminUserMenu = $("#adminUserMenu");
  const adminUserToggle = $("#adminUserToggle");
  const adminUserDropdown = $("#adminUserDropdown");
  const adminLogoutButton = $("#adminLogoutButton");

  const adminKeyInput = $("#adminKeyInput");
  const loadAdminButton = $("#loadAdminButton");
  const adminMessage = $("#adminMessage");

  const adminReferrers = $("#adminReferrers");
  const adminPurchases = $("#adminPurchases");
  const adminPending = $("#adminPending");
  const adminProtectedPanel = $("#adminProtectedPanel");
  const adminTableBody = $("#adminTableBody");
  const adminPurchasesBody = $("#adminPurchasesBody");

  let activeAdminKey = "";

  const shortAddress = (address) => (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "");

  const formatNumber = (value, digits = 8) => {
    const number = Number(value || 0);
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(number);
  };

  const setMessage = (message, type = "success") => {
    if (!adminMessage) return;
    adminMessage.textContent = message;
    adminMessage.classList.remove("success", "error");
    adminMessage.classList.add(type);
  };

  const apiRequest = async (endpoint, options = {}) => {
    const response = await fetch(`${CONFIG.referralApiBaseUrl}${endpoint}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": options.adminKey || "",
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok === false) {
      throw new Error(data.error || "No se pudo cargar el panel admin.");
    }

    return data;
  };

  const showLogin = () => {
    activeAdminKey = "";

    if (adminLoginCard) adminLoginCard.hidden = false;
    if (adminProtectedPanel) adminProtectedPanel.hidden = true;
    if (adminUserMenu) adminUserMenu.hidden = true;
    if (adminUserDropdown) adminUserDropdown.hidden = true;
    if (adminUserToggle) adminUserToggle.setAttribute("aria-expanded", "false");
    if (adminTopHeader) adminTopHeader.hidden = false;

    if (adminKeyInput) {
      adminKeyInput.value = "";
      adminKeyInput.focus();
    }

    setMessage("", "success");
  };

  const showDashboard = () => {
    if (adminLoginCard) adminLoginCard.hidden = true;
    if (adminProtectedPanel) adminProtectedPanel.hidden = false;
    if (adminUserMenu) adminUserMenu.hidden = false;
    if (adminUserDropdown) adminUserDropdown.hidden = true;
    if (adminUserToggle) adminUserToggle.setAttribute("aria-expanded", "false");
    if (adminTopHeader) adminTopHeader.hidden = true;
  };

  const renderRows = (rows = []) => {
    if (!adminTableBody) return;

    if (!rows.length) {
      adminTableBody.innerHTML =
        '<tr><td colspan="6" class="referral-empty">Aún no hay compras confirmadas con referidos.</td></tr>';
      return;
    }

    adminTableBody.innerHTML = rows
      .map((item) => {
        return `
          <tr>
            <td>${shortAddress(item.referrerWallet)}</td>
            <td>${item.code || "-"}</td>
            <td>${item.totalPurchases}</td>
            <td>${formatNumber(item.totalVolumeBnb, 6)} BNB</td>
            <td>${formatNumber(item.pendingRewardsBnb, 8)} BNB</td>
            <td>${formatNumber(item.paidRewardsBnb, 8)} BNB</td>
          </tr>
        `;
      })
      .join("");
  };

  const renderPurchaseRows = (purchases = []) => {
    if (!adminPurchasesBody) return;

    const referredPurchases = purchases.filter((purchase) => purchase.referrerWallet);

    if (!referredPurchases.length) {
      adminPurchasesBody.innerHTML =
        '<tr><td colspan="7" class="referral-empty">Aún no hay compras confirmadas con enlaces de referido.</td></tr>';
      return;
    }

    adminPurchasesBody.innerHTML = referredPurchases
      .map((purchase) => {
        const txUrl = `https://bscscan.com/tx/${purchase.txHash}`;
        const date = purchase.createdAt ? new Date(purchase.createdAt).toLocaleString("es-ES") : "-";

        return `
          <tr>
            <td>${shortAddress(purchase.referrerWallet)}</td>
            <td>${shortAddress(purchase.buyerWallet)}</td>
            <td>${formatNumber(purchase.amountBnb, 6)} BNB</td>
            <td>${formatNumber(purchase.commissionBnb, 8)} BNB</td>
            <td><a href="${txUrl}" target="_blank" rel="noopener">Ver TX</a></td>
            <td>${purchase.payoutStatus === "paid" ? "Pagado" : "Pendiente"}</td>
            <td>${date}</td>
          </tr>
        `;
      })
      .join("");
  };

  const loadAdminData = async () => {
    const adminKey = String(adminKeyInput?.value || activeAdminKey || "").trim();

    if (!adminKey) {
      setMessage("Ingresa el ADMIN_KEY de tu archivo .env.", "error");
      return;
    }

    try {
      setMessage("Cargando compras confirmadas...", "success");

      const data = await apiRequest("/admin/referrals", { adminKey });
      const purchasesData = await apiRequest("/admin/purchases", { adminKey });

      activeAdminKey = adminKey;

      if (adminReferrers) adminReferrers.textContent = String(data.totalReferrers || 0);
      if (adminPurchases) adminPurchases.textContent = String(data.totalPurchases || 0);
      if (adminPending) adminPending.textContent = `${formatNumber(data.totalPendingRewardsBnb, 8)} BNB`;

      renderRows(data.referrers || []);
      renderPurchaseRows(purchasesData.purchases || []);

      showDashboard();
      setMessage("Datos cargados correctamente.", "success");
    } catch (error) {
      showLogin();
      setMessage(error.message || "No se pudieron cargar los datos.", "error");
    }
  };

  if (loadAdminButton) loadAdminButton.addEventListener("click", loadAdminData);

  if (adminKeyInput) {
    adminKeyInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") loadAdminData();
    });
  }

  if (adminUserToggle) {
    adminUserToggle.addEventListener("click", () => {
      const isOpen = adminUserDropdown ? !adminUserDropdown.hidden : false;

      if (adminUserDropdown) adminUserDropdown.hidden = isOpen;
      adminUserToggle.setAttribute("aria-expanded", String(!isOpen));
    });
  }

  if (adminLogoutButton) {
    adminLogoutButton.addEventListener("click", showLogin);
  }

  document.addEventListener("click", (event) => {
    if (!adminUserMenu || adminUserMenu.hidden || !adminUserDropdown || adminUserDropdown.hidden) return;

    if (!adminUserMenu.contains(event.target)) {
      adminUserDropdown.hidden = true;
      if (adminUserToggle) adminUserToggle.setAttribute("aria-expanded", "false");
    }
  });
});
