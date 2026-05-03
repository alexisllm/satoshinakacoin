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
  const adminKeyInput = $("#adminKeyInput");
  const loadAdminButton = $("#loadAdminButton");
  const adminMessage = $("#adminMessage");
  const adminReferrers = $("#adminReferrers");
  const adminPurchases = $("#adminPurchases");
  const adminPending = $("#adminPending");
  const adminProtectedPanel = $("#adminProtectedPanel");
  const adminTableBody = $("#adminTableBody");
  const adminPurchasesBody = $("#adminPurchasesBody");
  const adminSessionMenu = $("#adminSessionMenu");
  const creatorMenuButton = $("#creatorMenuButton");
  const creatorDropdown = $("#creatorDropdown");
  const logoutAdminButton = $("#logoutAdminButton");

  const shortAddress = (address) => address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

  const formatNumber = (value, digits = 8) => {
    const number = Number(value || 0);
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(number);
  };

  const formatSnc = (value, digits = 4) => {
    const number = Number(value || 0);
    return `${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: number > 0 && number < 1 ? 4 : 0,
      maximumFractionDigits: digits
    }).format(number)} SNC`;
  };

  const fullWallet = (address) => address || "-";

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
            <td class="wallet-full">${fullWallet(item.referrerWallet)}</td>
            <td>${item.code || "-"}</td>
            <td>${item.totalPurchases}</td>
            <td>${formatNumber(item.totalVolumeBnb, 6)} BNB</td>
            <td>${formatSnc(item.pendingRewardsSnc)}</td>
            <td>${formatSnc(item.paidRewardsSnc)}</td>
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
            <td class="wallet-full">${fullWallet(purchase.referrerWallet)}</td>
            <td>${shortAddress(purchase.buyerWallet)}</td>
            <td>${formatNumber(purchase.amountBnb, 6)} BNB</td>
            <td>${formatSnc(purchase.commissionSncEstimated)}</td>
            <td><a href="${txUrl}" target="_blank" rel="noopener">Ver TX</a></td>
            <td>${purchase.payoutStatus === "paid" ? "Pagado" : "Pendiente"}</td>
            <td>${date}</td>
          </tr>
        `;
      })
      .join("");
  };

  const openAdminPanel = () => {
    document.body.classList.add("admin-unlocked");

    if (adminLoginCard) adminLoginCard.hidden = true;
    if (adminProtectedPanel) adminProtectedPanel.hidden = false;
    if (adminSessionMenu) adminSessionMenu.hidden = false;
    if (creatorDropdown) creatorDropdown.hidden = true;
    if (creatorMenuButton) creatorMenuButton.setAttribute("aria-expanded", "false");

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeAdminPanel = () => {
    document.body.classList.remove("admin-unlocked");

    if (adminLoginCard) adminLoginCard.hidden = false;
    if (adminProtectedPanel) adminProtectedPanel.hidden = true;
    if (adminSessionMenu) adminSessionMenu.hidden = true;
    if (creatorDropdown) creatorDropdown.hidden = true;
    if (creatorMenuButton) creatorMenuButton.setAttribute("aria-expanded", "false");

    if (adminKeyInput) {
      adminKeyInput.value = "";
      window.setTimeout(() => adminKeyInput.focus(), 80);
    }

    setMessage("Sesión cerrada.", "success");
  };

  const loadAdminData = async () => {
    const adminKey = String(adminKeyInput?.value || "").trim();

    if (!adminKey) {
      setMessage("Ingresa el ADMIN_KEY de tu archivo .env.", "error");
      return;
    }

    try {
      setMessage("Cargando compras confirmadas...", "success");

      const data = await apiRequest("/admin/referrals", { adminKey });
      const purchasesData = await apiRequest("/admin/purchases", { adminKey });

      if (adminReferrers) adminReferrers.textContent = String(data.totalReferrers || 0);
      if (adminPurchases) adminPurchases.textContent = String(data.totalPurchases || 0);
      if (adminPending) adminPending.textContent = formatSnc(data.totalPendingRewardsSnc);

      renderRows(data.referrers || []);
      renderPurchaseRows(purchasesData.purchases || []);
      setMessage("Datos cargados correctamente.", "success");
      openAdminPanel();
    } catch (error) {
      if (adminProtectedPanel) adminProtectedPanel.hidden = true;
      if (adminSessionMenu) adminSessionMenu.hidden = true;
      if (adminLoginCard) adminLoginCard.hidden = false;
      document.body.classList.remove("admin-unlocked");
      setMessage(error.message || "No se pudieron cargar los datos.", "error");
    }
  };

  if (loadAdminButton) loadAdminButton.addEventListener("click", loadAdminData);

  if (adminKeyInput) {
    adminKeyInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") loadAdminData();
    });
  }

  if (creatorMenuButton) {
    creatorMenuButton.addEventListener("click", () => {
      const isOpen = creatorDropdown ? !creatorDropdown.hidden : false;

      if (creatorDropdown) creatorDropdown.hidden = isOpen;
      creatorMenuButton.setAttribute("aria-expanded", String(!isOpen));
    });
  }

  if (logoutAdminButton) {
    logoutAdminButton.addEventListener("click", closeAdminPanel);
  }

  document.addEventListener("click", (event) => {
    if (!adminSessionMenu || adminSessionMenu.hidden) return;

    if (!adminSessionMenu.contains(event.target)) {
      if (creatorDropdown) creatorDropdown.hidden = true;
      if (creatorMenuButton) creatorMenuButton.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && creatorDropdown && !creatorDropdown.hidden) {
      creatorDropdown.hidden = true;
      if (creatorMenuButton) creatorMenuButton.setAttribute("aria-expanded", "false");
    }
  });
});
