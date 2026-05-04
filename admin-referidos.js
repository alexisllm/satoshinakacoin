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
  const adminPrimaryStatLabel = $("#adminPrimaryStatLabel");
  const adminPrimaryStatValue = $("#adminPrimaryStatValue");
  const adminPrimaryStatHelp = $("#adminPrimaryStatHelp");
  const adminSecondaryStatLabel = $("#adminSecondaryStatLabel");
  const adminSecondaryStatValue = $("#adminSecondaryStatValue");
  const adminSecondaryStatHelp = $("#adminSecondaryStatHelp");
  const adminProtectedPanel = $("#adminProtectedPanel");
  const adminTableBody = $("#adminTableBody");
  const adminPurchasesBody = $("#adminPurchasesBody");
  const adminSessionMenu = $("#adminSessionMenu");
  const creatorMenuButton = $("#creatorMenuButton");
  const creatorDropdown = $("#creatorDropdown");
  const logoutAdminButton = $("#logoutAdminButton");
  const connectPayoutWalletButton = $("#connectPayoutWalletButton");
  const adminPayoutWalletStatus = $("#adminPayoutWalletStatus");
  const adminTokenStatus = $("#adminTokenStatus");
  const adminBuyersBody = $("#adminBuyersBody");
  const tabButtons = Array.from(document.querySelectorAll("[data-admin-tab]"));
  const tabPanels = Array.from(document.querySelectorAll("[data-admin-panel]"));
  const adminConfirmOverlay = $("#adminConfirmOverlay");
  const adminConfirmClose = $("#adminConfirmClose");
  const adminConfirmCancel = $("#adminConfirmCancel");
  const adminConfirmAccept = $("#adminConfirmAccept");
  const adminConfirmTitle = $("#adminConfirmTitle");
  const adminConfirmText = $("#adminConfirmText");
  const adminConfirmAmount = $("#adminConfirmAmount");
  const adminConfirmRecipientLabel = $("#adminConfirmRecipientLabel");
  const adminConfirmWallet = $("#adminConfirmWallet");
  const adminConfirmCopyWallet = $("#adminConfirmCopyWallet");

  const state = {
    adminKey: "",
    payoutWallet: "",
    payoutProvider: null,
    tokenAddress: "",
    referralsData: null,
    purchasesData: null,
    buyersData: null,
    activeTab: "referidos",
    tokenDecimals: 18
  };

  let confirmResolver = null;

  const closeAdminConfirmModal = (result = false) => {
    if (!adminConfirmOverlay) return;

    adminConfirmOverlay.hidden = true;
    document.body.classList.remove("admin-modal-open");

    if (typeof confirmResolver === "function") {
      const resolver = confirmResolver;
      confirmResolver = null;
      resolver(result);
    }
  };

  const openAdminConfirmModal = ({ title, text, amount, recipientLabel, wallet }) => {
    if (!adminConfirmOverlay) {
      return Promise.resolve(window.confirm(`${text || "Confirma el envío."}\n\n${amount || ""}\n${wallet || ""}`));
    }

    if (adminConfirmTitle) adminConfirmTitle.textContent = title || "Confirmar envío SNC";
    if (adminConfirmText) adminConfirmText.textContent = text || "Revisa cuidadosamente el monto y la wallet antes de firmar la transacción.";
    if (adminConfirmAmount) adminConfirmAmount.textContent = amount || "0 SNC";
    if (adminConfirmRecipientLabel) adminConfirmRecipientLabel.textContent = recipientLabel || "Wallet destino";
    if (adminConfirmWallet) adminConfirmWallet.textContent = wallet || "0x...";

    adminConfirmOverlay.hidden = false;
    document.body.classList.add("admin-modal-open");

    setTimeout(() => adminConfirmAccept?.focus(), 0);

    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  };

  const BSC_CHAIN_ID_HEX = "0x38";

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

  const decimalToTokenUnits = (value, decimals = 18) => {
    const clean = String(value || "0").replace(/,/g, "").trim();

    if (!/^\d+(\.\d+)?$/.test(clean)) {
      throw new Error("Monto SNC inválido.");
    }

    const [whole, fraction = ""] = clean.split(".");
    const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);

    return BigInt(whole || "0") * (10n ** BigInt(decimals)) + BigInt(paddedFraction || "0");
  };

  const encodeTransferData = (to, amountUnits) => {
    const selector = "a9059cbb";
    const cleanTo = String(to || "").toLowerCase().replace(/^0x/, "").padStart(64, "0");
    const cleanAmount = amountUnits.toString(16).padStart(64, "0");
    return `0x${selector}${cleanTo}${cleanAmount}`;
  };

  const isValidAddress = (address) => /^0x[a-fA-F0-9]{40}$/.test(String(address || ""));

  const fullWallet = (address) => address || "-";

  const escapeHtml = (value = "") =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));

  const renderWalletWithCopy = (address) => {
    const wallet = fullWallet(address);

    if (!address) {
      return '<span class="wallet-copy-wrap">-</span>';
    }

    const safeWallet = escapeHtml(wallet);

    return `
      <span class="wallet-copy-wrap">
        <span class="wallet-full-value">${safeWallet}</span>
        <button class="wallet-copy-button" type="button" data-copy-wallet="${safeWallet}" aria-label="Copiar wallet ${safeWallet}" title="Copiar wallet">
          ⧉
        </button>
      </span>
    `;
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
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok === false) {
      throw new Error(data.error || "No se pudo cargar el panel admin.");
    }

    return data;
  };


  const updatePayoutWalletUi = () => {
    if (adminPayoutWalletStatus) {
      adminPayoutWalletStatus.textContent = state.payoutWallet
        ? `${shortAddress(state.payoutWallet)} conectada`
        : "No conectada";
    }

    if (connectPayoutWalletButton) {
      connectPayoutWalletButton.textContent = state.payoutWallet
        ? "Wallet conectada"
        : "Conectar wallet";
      connectPayoutWalletButton.classList.toggle("is-connected", Boolean(state.payoutWallet));
    }

    if (adminTokenStatus) {
      if (!state.tokenAddress) {
        adminTokenStatus.textContent = "Configura SNC_TOKEN_ADDRESS en Render para habilitar envíos reales.";
        adminTokenStatus.classList.add("error");
      } else {
        adminTokenStatus.textContent = `Token SNC: ${shortAddress(state.tokenAddress)} · BSC`;
        adminTokenStatus.classList.remove("error");
      }
    }
  };

  const switchToBsc = async (provider) => {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BSC_CHAIN_ID_HEX }]
      });
    } catch (error) {
      if (error.code === 4902) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: BSC_CHAIN_ID_HEX,
              chainName: "BNB Smart Chain",
              nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
              rpcUrls: ["https://bsc-dataseed.bnbchain.org"],
              blockExplorerUrls: ["https://bscscan.com"]
            }
          ]
        });
        return;
      }

      throw error;
    }
  };

  const loadPublicConfig = async () => {
    const config = await apiRequest("/public-config");
    state.tokenAddress = config.sncTokenAddress || "";
    state.tokenDecimals = Number(config.sncTokenDecimals || 18);
    updatePayoutWalletUi();
  };

  const connectPayoutWallet = async () => {
    try {
      const provider = window.ethereum;

      if (!provider) {
        setMessage("Instala o abre una wallet compatible con EVM para pagar SNC.", "error");
        return;
      }

      await switchToBsc(provider);

      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const account = accounts?.[0] || "";

      if (!isValidAddress(account)) {
        setMessage("No se pudo conectar una wallet válida.", "error");
        return;
      }

      state.payoutProvider = provider;
      state.payoutWallet = account.toLowerCase();
      updatePayoutWalletUi();
      setMessage(`Wallet de pago conectada: ${shortAddress(state.payoutWallet)}`, "success");
    } catch (error) {
      setMessage(error.message || "No se pudo conectar la wallet de pago.", "error");
    }
  };

  const payReferralSnc = async ({ referrerWallet, pendingSnc }) => {
    if (!state.adminKey) {
      setMessage("Vuelve a ingresar el ADMIN_KEY antes de pagar.", "error");
      return;
    }

    if (!state.tokenAddress) {
      setMessage("Configura SNC_TOKEN_ADDRESS en Render antes de enviar SNC.", "error");
      return;
    }

    if (!state.payoutProvider || !state.payoutWallet) {
      setMessage("Conecta primero la wallet que tiene los SNC.", "error");
      return;
    }

    if (!isValidAddress(referrerWallet)) {
      setMessage("Wallet de referidor inválida.", "error");
      return;
    }

    const amountNumber = Number(pendingSnc || 0);

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setMessage("Este referidor no tiene SNC pendientes.", "error");
      return;
    }

    const confirmPayment = await openAdminConfirmModal({
      title: "Enviar comisión de referido",
      text: "Vas a enviar la comisión pendiente en SNC al referidor seleccionado.",
      amount: formatSnc(pendingSnc),
      recipientLabel: "Wallet del referidor",
      wallet: referrerWallet
    });

    if (!confirmPayment) return;

    try {
      await switchToBsc(state.payoutProvider);

      const amountUnits = decimalToTokenUnits(pendingSnc, state.tokenDecimals);
      const txHash = await state.payoutProvider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: state.payoutWallet,
            to: state.tokenAddress,
            value: "0x0",
            data: encodeTransferData(referrerWallet, amountUnits)
          }
        ]
      });

      setMessage("Pago enviado. Verificando transacción en BSC...", "success");

      await apiRequest("/admin/payouts/mark-paid", {
        method: "POST",
        adminKey: state.adminKey,
        body: {
          referrerWallet,
          payoutTxHash: txHash,
          payerWallet: state.payoutWallet,
          expectedSnc: String(pendingSnc)
        }
      });

      setMessage(`Pago SNC confirmado y marcado como pagado. TX: ${shortAddress(txHash)}`, "success");
      await loadAdminData();
    } catch (error) {
      setMessage(error.message || "No se pudo enviar o verificar el pago SNC.", "error");
    }
  };

  const payBuyerSnc = async ({ buyerWallet, pendingSnc }) => {
    if (!state.adminKey) {
      setMessage("Vuelve a ingresar el ADMIN_KEY antes de enviar SNC.", "error");
      return;
    }

    if (!state.tokenAddress) {
      setMessage("Configura SNC_TOKEN_ADDRESS en Render antes de enviar SNC.", "error");
      return;
    }

    if (!state.payoutProvider || !state.payoutWallet) {
      setMessage("Conecta primero la wallet que tiene los SNC.", "error");
      return;
    }

    if (!isValidAddress(buyerWallet)) {
      setMessage("Wallet de comprador inválida.", "error");
      return;
    }

    const amountNumber = Number(pendingSnc || 0);

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setMessage("Este comprador no tiene SNC pendientes por enviar.", "error");
      return;
    }

    const confirmPayment = await openAdminConfirmModal({
      title: "Enviar SNC al comprador",
      text: "Vas a enviar los SNC comprados a la wallet del comprador seleccionado.",
      amount: formatSnc(pendingSnc),
      recipientLabel: "Wallet del comprador",
      wallet: buyerWallet
    });

    if (!confirmPayment) return;

    try {
      await switchToBsc(state.payoutProvider);

      const amountUnits = decimalToTokenUnits(pendingSnc, state.tokenDecimals);
      const txHash = await state.payoutProvider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: state.payoutWallet,
            to: state.tokenAddress,
            value: "0x0",
            data: encodeTransferData(buyerWallet, amountUnits)
          }
        ]
      });

      setMessage("Envío al comprador realizado. Verificando transacción en BSC...", "success");

      await apiRequest("/admin/buyer-deliveries/mark-paid", {
        method: "POST",
        adminKey: state.adminKey,
        body: {
          buyerWallet,
          deliveryTxHash: txHash,
          payerWallet: state.payoutWallet,
          expectedSnc: String(pendingSnc)
        }
      });

      setMessage(`SNC enviados al comprador y marcados como pagados. TX: ${shortAddress(txHash)}`, "success");
      await loadAdminData();
    } catch (error) {
      setMessage(error.message || "No se pudo enviar o verificar los SNC al comprador.", "error");
    }
  };

  const renderRows = (rows = []) => {
    if (!adminTableBody) return;

    if (!rows.length) {
      adminTableBody.innerHTML =
        '<tr><td colspan="7" class="referral-empty">Aún no hay compras confirmadas con referidos.</td></tr>';
      return;
    }

    adminTableBody.innerHTML = rows
      .map((item) => {
        return `
          <tr>
            <td class="wallet-full">${renderWalletWithCopy(item.referrerWallet)}</td>
            <td>${escapeHtml(item.code || "-")}</td>
            <td>${item.totalPurchases}</td>
            <td>${formatNumber(item.totalVolumeBnb, 6)} BNB</td>
            <td>${formatSnc(item.pendingRewardsSnc)}</td>
            <td>${formatSnc(item.paidRewardsSnc)}</td>
            <td>
              <div class="admin-pay-cell">
                <span>Pagar</span>
                <button
                  class="admin-pay-button"
                  type="button"
                  data-pay-referrer="${escapeHtml(item.referrerWallet || "")}"
                  data-pay-snc="${escapeHtml(item.pendingRewardsSnc || "0")}"
                  ${Number(item.pendingRewardsSnc || 0) <= 0 ? "disabled" : ""}
                >
                  Enviar SNC
                </button>
              </div>
            </td>
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
            <td class="wallet-full">${renderWalletWithCopy(purchase.referrerWallet)}</td>
            <td>${escapeHtml(shortAddress(purchase.buyerWallet))}</td>
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

  const renderBuyersRows = (buyers = []) => {
    if (!adminBuyersBody) return;

    if (!buyers.length) {
      adminBuyersBody.innerHTML =
        '<tr><td colspan="6" class="referral-empty">Aún no hay compradores registrados.</td></tr>';
      return;
    }

    adminBuyersBody.innerHTML = buyers
      .map((buyer) => `
        <tr>
          <td class="wallet-full">${renderWalletWithCopy(buyer.buyerWallet)}</td>
          <td>${buyer.totalPurchases}</td>
          <td>${formatSnc(buyer.totalPurchasedSnc)}</td>
          <td>${formatSnc(buyer.pendingDeliverySnc)}</td>
          <td>${formatSnc(buyer.deliveredSnc)}</td>
          <td>
            <div class="admin-pay-cell">
              <span>Enviar</span>
              <button
                class="admin-pay-button"
                type="button"
                data-pay-buyer="${escapeHtml(buyer.buyerWallet || "")}"
                data-buyer-snc="${escapeHtml(buyer.pendingDeliverySnc || "0")}"
                ${Number(buyer.pendingDeliverySnc || 0) <= 0 ? "disabled" : ""}
              >
                Enviar SNC
              </button>
            </div>
          </td>
        </tr>
      `)
      .join("");
  };

  const updateAdminSummaryForTab = (tabName = state.activeTab || "referidos") => {
    const referralsData = state.referralsData || {};
    const buyersData = state.buyersData || {};

    if (tabName === "compradores") {
      if (adminPrimaryStatLabel) adminPrimaryStatLabel.textContent = "Compradores con compras";
      if (adminPrimaryStatValue) adminPrimaryStatValue.textContent = String(buyersData.totalBuyers || 0);
      if (adminPrimaryStatHelp) adminPrimaryStatHelp.textContent = "Wallets que compraron SNC en la preventa.";

      if (adminSecondaryStatLabel) adminSecondaryStatLabel.textContent = "SNC compradores pendientes";
      if (adminSecondaryStatValue) adminSecondaryStatValue.textContent = formatSnc(buyersData.totalPendingDeliverySnc || 0);
      if (adminSecondaryStatHelp) adminSecondaryStatHelp.textContent = "SNC que faltan por enviar a compradores.";
      return;
    }

    if (adminPrimaryStatLabel) adminPrimaryStatLabel.textContent = "Compras referidas";
    if (adminPrimaryStatValue) adminPrimaryStatValue.textContent = String(referralsData.totalPurchases || 0);
    if (adminPrimaryStatHelp) adminPrimaryStatHelp.textContent = "Compras confirmadas con enlace de referido.";

    if (adminSecondaryStatLabel) adminSecondaryStatLabel.textContent = "SNC referidos pendientes";
    if (adminSecondaryStatValue) adminSecondaryStatValue.textContent = formatSnc(referralsData.totalPendingRewardsSnc || 0);
    if (adminSecondaryStatHelp) adminSecondaryStatHelp.textContent = "Comisiones SNC pendientes por pagar a referidores.";
  };

  const setAdminTab = (tabName = "referidos") => {
    state.activeTab = tabName === "compradores" ? "compradores" : "referidos";

    tabButtons.forEach((button) => {
      const isActive = button.dataset.adminTab === state.activeTab;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    tabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.adminPanel !== state.activeTab;
    });

    updateAdminSummaryForTab(state.activeTab);
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

    state.adminKey = "";

    setAdminTab("referidos");

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
      state.adminKey = adminKey;
      setMessage("Cargando compras confirmadas...", "success");

      await loadPublicConfig();

      const data = await apiRequest("/admin/referrals", { adminKey });
      const purchasesData = await apiRequest("/admin/purchases", { adminKey });
      const buyersData = await apiRequest("/admin/buyers", { adminKey });

      state.referralsData = data;
      state.purchasesData = purchasesData;
      state.buyersData = buyersData;

      if (adminReferrers) adminReferrers.textContent = String(data.totalReferrers || 0);

      renderRows(data.referrers || []);
      renderPurchaseRows(purchasesData.purchases || []);
      renderBuyersRows(buyersData.buyers || []);
      updateAdminSummaryForTab(state.activeTab);
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
  if (connectPayoutWalletButton) connectPayoutWalletButton.addEventListener("click", connectPayoutWallet);


  document.addEventListener("click", async (event) => {
    const payButton = event.target.closest("[data-pay-referrer]");

    if (payButton) {
      await payReferralSnc({
        referrerWallet: payButton.dataset.payReferrer || "",
        pendingSnc: payButton.dataset.paySnc || "0"
      });
      return;
    }

    const buyerPayButton = event.target.closest("[data-pay-buyer]");

    if (buyerPayButton) {
      await payBuyerSnc({
        buyerWallet: buyerPayButton.dataset.payBuyer || "",
        pendingSnc: buyerPayButton.dataset.buyerSnc || "0"
      });
      return;
    }

    const copyButton = event.target.closest("[data-copy-wallet]");

    if (!copyButton) return;

    const wallet = copyButton.dataset.copyWallet || "";

    if (!wallet) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(wallet);
      } else {
        const tempInput = document.createElement("textarea");
        tempInput.value = wallet;
        tempInput.setAttribute("readonly", "");
        tempInput.style.position = "fixed";
        tempInput.style.left = "-9999px";
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        tempInput.remove();
      }

      copyButton.classList.add("copied");
      copyButton.textContent = "✓";
      copyButton.title = "Copiado";

      window.setTimeout(() => {
        copyButton.classList.remove("copied");
        copyButton.textContent = "⧉";
        copyButton.title = "Copiar wallet";
      }, 1200);
    } catch (error) {
      copyButton.classList.add("copy-error");
      copyButton.textContent = "!";
      copyButton.title = "No se pudo copiar";

      window.setTimeout(() => {
        copyButton.classList.remove("copy-error");
        copyButton.textContent = "⧉";
        copyButton.title = "Copiar wallet";
      }, 1200);
    }
  });


  if (adminConfirmClose) {
    adminConfirmClose.addEventListener("click", () => closeAdminConfirmModal(false));
  }

  if (adminConfirmCancel) {
    adminConfirmCancel.addEventListener("click", () => closeAdminConfirmModal(false));
  }

  if (adminConfirmAccept) {
    adminConfirmAccept.addEventListener("click", () => closeAdminConfirmModal(true));
  }

  if (adminConfirmOverlay) {
    adminConfirmOverlay.addEventListener("click", (event) => {
      if (event.target === adminConfirmOverlay) {
        closeAdminConfirmModal(false);
      }
    });
  }

  if (adminConfirmCopyWallet) {
    adminConfirmCopyWallet.addEventListener("click", async () => {
      const wallet = adminConfirmWallet?.textContent?.trim() || "";

      if (!wallet) return;

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(wallet);
        } else {
          const tempInput = document.createElement("textarea");
          tempInput.value = wallet;
          tempInput.setAttribute("readonly", "");
          tempInput.style.position = "fixed";
          tempInput.style.opacity = "0";
          document.body.appendChild(tempInput);
          tempInput.select();
          document.execCommand("copy");
          tempInput.remove();
        }

        adminConfirmCopyWallet.classList.add("copied");
        adminConfirmCopyWallet.textContent = "✓";

        window.setTimeout(() => {
          adminConfirmCopyWallet.classList.remove("copied");
          adminConfirmCopyWallet.textContent = "⧉";
        }, 1200);
      } catch (error) {
        adminConfirmCopyWallet.classList.add("copy-error");
        adminConfirmCopyWallet.textContent = "!";

        window.setTimeout(() => {
          adminConfirmCopyWallet.classList.remove("copy-error");
          adminConfirmCopyWallet.textContent = "⧉";
        }, 1200);
      }
    });
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => setAdminTab(button.dataset.adminTab || "referidos"));
  });

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
    if (event.key !== "Escape") return;

    if (adminConfirmOverlay && !adminConfirmOverlay.hidden) {
      closeAdminConfirmModal(false);
      return;
    }

    if (creatorDropdown && !creatorDropdown.hidden) {
      creatorDropdown.hidden = true;
      if (creatorMenuButton) creatorMenuButton.setAttribute("aria-expanded", "false");
    }
  });
});
