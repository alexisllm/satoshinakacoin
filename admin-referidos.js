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
  const walletConnectStat = $(".wallet-connect-stat");
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
  const adminStatsSection = $("#adminStatsSection");
  const adminSummaryCard = $("#adminSummaryCard");
  const adminActivityCard = $("#adminActivityCard");
  const summaryReferrersCount = $("#summaryReferrersCount");
  const summaryReferralPurchases = $("#summaryReferralPurchases");
  const summaryPendingRewards = $("#summaryPendingRewards");
  const summaryPaidRewards = $("#summaryPaidRewards");
  const summaryBuyersCount = $("#summaryBuyersCount");
  const summaryPurchasedSnc = $("#summaryPurchasedSnc");
  const summaryPendingDelivery = $("#summaryPendingDelivery");
  const summaryDeliveredSnc = $("#summaryDeliveredSnc");
  const adminTotalSncValue = $("#adminTotalSncValue");
  const adminPendingTotalValue = $("#adminPendingTotalValue");
  const adminPaidTotalValue = $("#adminPaidTotalValue");
  const adminProcessTotalValue = $("#adminProcessTotalValue");
  const adminRecentActivity = $("#adminRecentActivity");
  const adminSyncTime = $("#adminSyncTime");
  const adminSentSncValue = $("#adminSentSncValue");
  const adminWalletBalanceValue = $("#adminWalletBalanceValue");
  const adminAvailableSncValue = $("#adminAvailableSncValue");
  const adminAvailableSncHelp = $("#adminAvailableSncHelp");
  const adminAvailableSncStatus = $("#adminAvailableSncStatus");

  const state = {
    adminKey: "",
    payoutWallet: "",
    payoutProvider: null,
    tokenAddress: "",
    tokenBalance: null,
    tokenBalanceLoading: false,
    referralsData: null,
    purchasesData: null,
    buyersData: null,
    activeTab: "resumen",
    tokenDecimals: 18
  };

  const ADMIN_SESSION_STORAGE_KEY = "snc_admin_session_key_v1";
  const PAYOUT_WALLET_STORAGE_KEY = "snc_admin_payout_wallet_connected_v1";
  const ADMIN_AUTO_REFRESH_MS = 45000;
  let adminAutoRefreshTimer = null;

  const readStoredAdminKey = () => {
    try {
      return String(window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY) || "").trim();
    } catch (error) {
      return "";
    }
  };

  const saveStoredAdminKey = (adminKey) => {
    try {
      window.localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, String(adminKey || "").trim());
    } catch (error) {
      console.warn("No se pudo guardar la sesión admin:", error);
    }
  };

  const clearStoredAdminKey = () => {
    try {
      window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    } catch (error) {
      console.warn("No se pudo limpiar la sesión admin:", error);
    }
  };

  const rememberPayoutWalletConnection = () => {
    try {
      window.localStorage.setItem(PAYOUT_WALLET_STORAGE_KEY, "1");
    } catch (error) {
      console.warn("No se pudo recordar la wallet admin:", error);
    }
  };

  const clearPayoutWalletConnectionMemory = () => {
    try {
      window.localStorage.removeItem(PAYOUT_WALLET_STORAGE_KEY);
    } catch (error) {
      console.warn("No se pudo limpiar la wallet recordada:", error);
    }
  };

  const shouldRestorePayoutWallet = () => {
    try {
      return window.localStorage.getItem(PAYOUT_WALLET_STORAGE_KEY) === "1";
    } catch (error) {
      return false;
    }
  };

  const stopAdminAutoRefresh = () => {
    if (adminAutoRefreshTimer) {
      window.clearInterval(adminAutoRefreshTimer);
      adminAutoRefreshTimer = null;
    }
  };

  const startAdminAutoRefresh = () => {
    stopAdminAutoRefresh();

    adminAutoRefreshTimer = window.setInterval(() => {
      if (!state.adminKey || document.hidden) return;
      loadAdminData({ adminKey: state.adminKey, silent: true, scroll: false });
    }, ADMIN_AUTO_REFRESH_MS);
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

  const normalizeFractionDigits = (digits, fallback = 4) => {
    const parsed = Number(digits);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(20, Math.max(0, Math.trunc(parsed)));
  };

  const formatNumber = (value, digits = 8) => {
    const number = Number(value || 0);
    const maximumFractionDigits = normalizeFractionDigits(digits, 8);
    return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(number);
  };

  const formatSnc = (value, digits = 4) => {
    const number = Number(value || 0);
    const maximumFractionDigits = normalizeFractionDigits(digits, 4);
    const minimumFractionDigits = number > 0 && number < 1 ? Math.min(4, maximumFractionDigits) : 0;
    return `${new Intl.NumberFormat("en-US", {
      minimumFractionDigits,
      maximumFractionDigits
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

  const tokenUnitsToDecimal = (hexValue, decimals = 18) => {
    const raw = BigInt(hexValue || "0x0");
    const divisor = 10n ** BigInt(decimals);
    const whole = raw / divisor;
    const fraction = raw % divisor;

    if (fraction === 0n) {
      return whole.toString();
    }

    const fractionText = fraction
      .toString()
      .padStart(decimals, "0")
      .replace(/0+$/, "");

    return `${whole.toString()}.${fractionText}`;
  };

  const encodeBalanceOfData = (wallet) => {
    const selector = "70a08231";
    const cleanWallet = String(wallet || "").toLowerCase().replace(/^0x/, "").padStart(64, "0");
    return `0x${selector}${cleanWallet}`;
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

  let adminMessageTimer = null;

  const setMessage = (message, type = "success") => {
    if (!adminMessage) return;

    const cleanMessage = String(message || "").trim();

    if (adminMessageTimer) {
      window.clearTimeout(adminMessageTimer);
      adminMessageTimer = null;
    }

    adminMessage.textContent = cleanMessage;
    adminMessage.classList.remove("success", "error");

    if (!cleanMessage) {
      return;
    }

    if (type) {
      adminMessage.classList.add(type);
    }

    if (type === "success") {
      adminMessageTimer = window.setTimeout(() => {
        adminMessage.textContent = "";
        adminMessage.classList.remove("success", "error");
        adminMessageTimer = null;
      }, 2600);
    }
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


  const refreshPayoutWalletBalance = async () => {
    if (!state.payoutProvider || !state.payoutWallet || !state.tokenAddress) {
      state.tokenBalance = null;
      state.tokenBalanceLoading = false;
      updatePayoutWalletUi();
      return;
    }

    try {
      state.tokenBalanceLoading = true;
      updatePayoutWalletUi();

      const result = await state.payoutProvider.request({
        method: "eth_call",
        params: [
          {
            to: state.tokenAddress,
            data: encodeBalanceOfData(state.payoutWallet)
          },
          "latest"
        ]
      });

      state.tokenBalance = tokenUnitsToDecimal(result, state.tokenDecimals);
    } catch (error) {
      console.warn("No se pudo consultar el balance SNC:", error);
      state.tokenBalance = null;
    } finally {
      state.tokenBalanceLoading = false;
      updatePayoutWalletUi();
    }
  };

  const updatePayoutWalletUi = () => {
    const isConnected = Boolean(state.payoutWallet);
    const hasBalance = state.tokenBalance !== null && state.tokenBalance !== undefined;
    const balanceText = hasBalance ? formatSnc(state.tokenBalance, 2) : "0 SNC";

    if (walletConnectStat) {
      walletConnectStat.classList.toggle("is-connected", isConnected);
    }

    if (adminPayoutWalletStatus) {
      adminPayoutWalletStatus.innerHTML = isConnected
        ? `<span class="wallet-ok-dot" aria-hidden="true"></span>${shortAddress(state.payoutWallet)} conectada`
        : "No conectada";
    }

    if (adminWalletBalanceValue) {
      if (!isConnected) {
        adminWalletBalanceValue.textContent = "0 SNC";
      } else if (hasBalance) {
        adminWalletBalanceValue.textContent = balanceText;
      } else {
        adminWalletBalanceValue.textContent = "Leyendo...";
      }
    }

    if (adminAvailableSncValue) {
      adminAvailableSncValue.textContent = !isConnected
        ? "0 SNC"
        : hasBalance
          ? balanceText
          : "Leyendo...";
    }

    if (adminAvailableSncHelp) {
      adminAvailableSncHelp.textContent = isConnected
        ? "Saldo disponible en la wallet admin para enviar a usuarios."
        : "Conecta la wallet admin para ver cuánto puedes enviar.";
    }

    if (adminAvailableSncStatus) {
      if (!isConnected) {
        adminAvailableSncStatus.textContent = "Wallet no conectada";
      } else if (state.tokenBalanceLoading) {
        adminAvailableSncStatus.textContent = "Consultando saldo";
      } else if (hasBalance) {
        adminAvailableSncStatus.textContent = `${shortAddress(state.payoutWallet)} listo para enviar`;
      } else {
        adminAvailableSncStatus.textContent = "Saldo no disponible";
      }
    }

    if (connectPayoutWalletButton) {
      connectPayoutWalletButton.textContent = isConnected
        ? "Desconectar"
        : "Conectar wallet";
      connectPayoutWalletButton.classList.toggle("is-connected", isConnected);
      connectPayoutWalletButton.disabled = false;
    }

    if (adminTokenStatus) {
      adminTokenStatus.classList.toggle("error", false);

      if (!isConnected) {
        adminTokenStatus.textContent = "Conecta la wallet que tiene los tokens SNC";
      } else if (!state.tokenAddress) {
        adminTokenStatus.innerHTML = `Consultando saldo <strong>SNC</strong>`;
      } else if (state.tokenBalanceLoading) {
        adminTokenStatus.innerHTML = `Consultando saldo <strong>SNC</strong>`;
      } else if (hasBalance) {
        adminTokenStatus.innerHTML = `Disponible para enviar: <strong>${formatSnc(state.tokenBalance)}</strong>`;
      } else {
        adminTokenStatus.innerHTML = `No se pudo leer el saldo. Verifica que la wallet esté en BNB Smart Chain.`;
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

    if (state.payoutWallet && state.tokenAddress) {
      await refreshPayoutWalletBalance();
    }
  };

  const connectPayoutWallet = async () => {
    if (state.payoutWallet) {
      state.payoutWallet = "";
      state.payoutProvider = null;
      state.tokenBalance = null;
      state.tokenBalanceLoading = false;
      clearPayoutWalletConnectionMemory();
      updatePayoutWalletUi();
      setMessage("Wallet de pago desconectada.", "success");
      return;
    }

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
      rememberPayoutWalletConnection();
      updatePayoutWalletUi();
      await loadPublicConfig();
      await refreshPayoutWalletBalance();
      setMessage(`Wallet de pago conectada: ${shortAddress(state.payoutWallet)}`, "success");
    } catch (error) {
      setMessage(error.message || "No se pudo conectar la wallet de pago.", "error");
    }
  };

  const restorePayoutWalletIfAllowed = async () => {
    if (!shouldRestorePayoutWallet()) return;

    const provider = window.ethereum;

    if (!provider) return;

    try {
      const accounts = await provider.request({ method: "eth_accounts" });
      const account = accounts?.[0] || "";

      if (!isValidAddress(account)) return;

      state.payoutProvider = provider;
      state.payoutWallet = account.toLowerCase();
      updatePayoutWalletUi();

      if (state.tokenAddress) {
        await refreshPayoutWalletBalance();
      }
    } catch (error) {
      console.warn("No se pudo restaurar la wallet admin:", error);
    }
  };

  const payReferralSnc = async ({ referrerWallet, pendingSnc }) => {
    if (!state.adminKey) {
      setMessage("Vuelve a ingresar el ADMIN_KEY antes de pagar.", "error");
      return;
    }

    if (!state.tokenAddress) {
      setMessage("El contrato SNC no está disponible todavía. Revisa la configuración del token.", "error");
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
      await refreshPayoutWalletBalance();
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
      setMessage("El contrato SNC no está disponible todavía. Revisa la configuración del token.", "error");
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
      await refreshPayoutWalletBalance();
    } catch (error) {
      setMessage(error.message || "No se pudo enviar o verificar los SNC al comprador.", "error");
    }
  };

  const renderRows = (rows = []) => {
    if (!adminTableBody) return;

    const referredPurchases = rows.filter((purchase) => purchase?.referrerWallet && purchase?.payoutStatus !== "paid");
    const referrers = Array.isArray(state.referralsData?.referrers) ? state.referralsData.referrers : [];
    const getPendingByReferrer = (wallet) => {
      const normalizedWallet = String(wallet || "").toLowerCase();
      const referrer = referrers.find((item) => String(item?.referrerWallet || "").toLowerCase() === normalizedWallet);
      return Number(referrer?.pendingRewardsSnc || 0);
    };

    if (!referredPurchases.length) {
      adminTableBody.innerHTML =
        '<tr><td colspan="8" class="referral-empty">Aún no hay compras realizadas con wallet o enlace de referido.</td></tr>';
      return;
    }

    adminTableBody.innerHTML = referredPurchases
      .map((purchase) => {
        const txUrl = purchase?.txHash ? `https://bscscan.com/tx/${purchase.txHash}` : "#";
        const date = purchase?.createdAt ? new Date(purchase.createdAt).toLocaleString("es-ES") : "-";
        const isPaid = purchase?.payoutStatus === "paid";
        const commission = Number(purchase?.commissionSncEstimated || 0);
        const pendingForReferrer = getPendingByReferrer(purchase.referrerWallet) || commission;
        const canPayReferrer = !isPaid && pendingForReferrer > 0;

        return `
          <tr>
            <td class="wallet-full">${renderWalletWithCopy(purchase.referrerWallet)}</td>
            <td>${escapeHtml(shortAddress(purchase.buyerWallet))}</td>
            <td>${formatNumber(purchase.amountBnb, 6)} BNB</td>
            <td>${formatSnc(commission)}</td>
            <td>${purchase?.txHash ? `<a href="${txUrl}" target="_blank" rel="noopener">Ver TX</a>` : "-"}</td>
            <td><span class="admin-status-badge ${isPaid ? "is-paid" : "is-pending"}">${isPaid ? "Pagado" : "Pendiente"}</span></td>
            <td>${date}</td>
            <td>
              <div class="admin-pay-cell">
                <span>${isPaid ? "Completado" : "Pagar"}</span>
                <button
                  class="admin-pay-button"
                  type="button"
                  data-pay-referrer="${escapeHtml(purchase.referrerWallet || "")}"
                  data-pay-snc="${escapeHtml(String(pendingForReferrer || 0))}"
                  ${canPayReferrer ? "" : "disabled"}
                >
                  ${isPaid ? "Pagado" : "Enviar SNC"}
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
            <td><span class="admin-status-badge ${purchase.payoutStatus === "paid" ? "is-paid" : "is-pending"}">${purchase.payoutStatus === "paid" ? "Pagado" : "Pendiente"}</span></td>
            <td>${date}</td>
          </tr>
        `;
      })
      .join("");
  };

  const renderPaidTransactionRows = (purchases = []) => {
    if (!adminPurchasesBody) return;

    const paidReferralRows = purchases
      .filter((purchase) => purchase.referrerWallet && purchase.payoutStatus === "paid")
      .map((purchase) => ({
        type: "Referido",
        wallet: purchase.referrerWallet,
        amountSnc: purchase.commissionSncEstimated,
        txHash: purchase.payoutTxHash || purchase.txHash,
        createdAt: purchase.paidAt || purchase.createdAt
      }));

    const paidBuyerRows = purchases
      .filter((purchase) => purchase.tokenDeliveryStatus === "paid")
      .map((purchase) => ({
        type: "Comprador",
        wallet: purchase.buyerWallet,
        amountSnc: purchase.tokensSncEstimated,
        txHash: purchase.tokenDeliveryTxHash || purchase.txHash,
        createdAt: purchase.tokenDeliveredAt || purchase.createdAt
      }));

    const paidRows = [...paidReferralRows, ...paidBuyerRows]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    if (!paidRows.length) {
      adminPurchasesBody.innerHTML =
        '<tr><td colspan="6" class="referral-empty">Aún no hay transacciones pagadas.</td></tr>';
      return;
    }

    adminPurchasesBody.innerHTML = paidRows
      .map((item) => {
        const txUrl = item.txHash ? `https://bscscan.com/tx/${item.txHash}` : "#";
        const date = item.createdAt ? new Date(item.createdAt).toLocaleString("es-ES") : "-";

        return `
          <tr>
            <td><span class="admin-type-badge">${escapeHtml(item.type)}</span></td>
            <td class="wallet-full">${renderWalletWithCopy(item.wallet)}</td>
            <td>${formatSnc(item.amountSnc)}</td>
            <td>${item.txHash ? `<a href="${txUrl}" target="_blank" rel="noopener">Ver TX</a>` : "-"}</td>
            <td><span class="admin-status-badge is-paid">Pagado</span></td>
            <td>${date}</td>
          </tr>
        `;
      })
      .join("");
  };

  const renderBuyersRows = (buyers = []) => {
    if (!adminBuyersBody) return;

    const pendingBuyers = buyers.filter((buyer) => Number(buyer.pendingDeliverySnc || 0) > 0);

    if (!pendingBuyers.length) {
      adminBuyersBody.innerHTML =
        '<tr><td colspan="6" class="referral-empty">Aún no hay compradores registrados.</td></tr>';
      return;
    }

    adminBuyersBody.innerHTML = pendingBuyers
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

  const sumBy = (rows = [], key = "") =>
    rows.reduce((total, item) => total + Number(item?.[key] || 0), 0);

  const setText = (element, value) => {
    if (element) element.textContent = value;
  };

  const formatActivityDate = (dateValue) => {
    if (!dateValue) return "Fecha no disponible";

    try {
      return new Date(dateValue).toLocaleString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (error) {
      return "Fecha no disponible";
    }
  };

  const updateOverviewSummary = () => {
    const referralsData = state.referralsData || {};
    const buyersData = state.buyersData || {};
    const referrers = Array.isArray(referralsData.referrers) ? referralsData.referrers : [];
    const buyers = Array.isArray(buyersData.buyers) ? buyersData.buyers : [];

    setText(summaryReferrersCount, String(referralsData.totalReferrers || referrers.length || 0));
    setText(summaryReferralPurchases, String(referralsData.totalPurchases || sumBy(referrers, "totalPurchases") || 0));
    setText(summaryPendingRewards, formatSnc(referralsData.totalPendingRewardsSnc || sumBy(referrers, "pendingRewardsSnc") || 0, 2));
    setText(summaryPaidRewards, formatSnc(sumBy(referrers, "paidRewardsSnc"), 2));

    setText(summaryBuyersCount, String(buyersData.totalBuyers || buyers.length || 0));
    setText(summaryPurchasedSnc, formatSnc(buyersData.totalPurchasedSnc || sumBy(buyers, "totalPurchasedSnc") || 0, 2));
    setText(summaryPendingDelivery, formatSnc(buyersData.totalPendingDeliverySnc || sumBy(buyers, "pendingDeliverySnc") || 0, 2));
    setText(summaryDeliveredSnc, formatSnc(sumBy(buyers, "deliveredSnc"), 2));
  };

  const updateSatoshiInsights = () => {
    updateOverviewSummary();
    const referralsData = state.referralsData || {};
    const purchasesData = state.purchasesData || {};
    const buyersData = state.buyersData || {};

    const referrers = Array.isArray(referralsData.referrers) ? referralsData.referrers : [];
    const buyers = Array.isArray(buyersData.buyers) ? buyersData.buyers : [];
    const purchases = Array.isArray(purchasesData.purchases) ? purchasesData.purchases : [];

    const pendingRewards = Number(referralsData.totalPendingRewardsSnc || sumBy(referrers, "pendingRewardsSnc") || 0);
    const paidRewards = sumBy(referrers, "paidRewardsSnc");
    const pendingDelivery = Number(buyersData.totalPendingDeliverySnc || sumBy(buyers, "pendingDeliverySnc") || 0);
    const deliveredSnc = sumBy(buyers, "deliveredSnc");
    const inProcess = purchases
      .filter((purchase) => purchase?.referrerWallet && purchase?.payoutStatus !== "paid")
      .reduce((total, purchase) => total + Number(purchase?.commissionSncEstimated || 0), 0);

    const totalPending = pendingRewards + pendingDelivery;
    const totalPaid = paidRewards + deliveredSnc;
    const totalSnc = totalPending + totalPaid + inProcess;

    setText(adminTotalSncValue, formatNumber(totalSnc, 2));
    setText(adminPendingTotalValue, formatSnc(totalPending, 2));
    setText(adminPaidTotalValue, formatSnc(totalPaid, 2));
    setText(adminProcessTotalValue, formatSnc(inProcess, 2));
    setText(adminSentSncValue, formatSnc(totalPaid, 2));
    setText(adminSyncTime, new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }));

    if (!adminRecentActivity) return;

    const activityItems = purchases
      .slice()
      .sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0))
      .slice(0, 5);

    if (!activityItems.length) {
      adminRecentActivity.innerHTML = '<p><i aria-hidden="true">◆</i><span>Carga los datos para ver actividad reciente.</span></p>';
      return;
    }

    adminRecentActivity.innerHTML = activityItems
      .map((purchase) => {
        const buyer = shortAddress(purchase?.buyerWallet || "");
        const referrer = shortAddress(purchase?.referrerWallet || "");
        const amount = purchase?.referrerWallet
          ? `+${formatSnc(purchase?.commissionSncEstimated || 0, 2)}`
          : `${formatNumber(purchase?.amountBnb || 0, 6)} BNB`;
        const label = purchase?.referrerWallet
          ? `Compra referida de ${buyer}`
          : `Compra directa de ${buyer}`;

        return `
          <p>
            <i aria-hidden="true">${purchase?.referrerWallet ? "↗" : "◆"}</i>
            <span>${escapeHtml(label)}${referrer ? `<small>Referidor ${escapeHtml(referrer)} · ${escapeHtml(formatActivityDate(purchase?.createdAt))}</small>` : `<small>${escapeHtml(formatActivityDate(purchase?.createdAt))}</small>`}</span>
            <b>${escapeHtml(amount)}</b>
          </p>
        `;
      })
      .join("");
  };

  const updateAdminSummaryForTab = (tabName = state.activeTab || "resumen") => {
    const referralsData = state.referralsData || {};
    const buyersData = state.buyersData || {};

    if (tabName === "resumen") {
      if (adminPrimaryStatLabel) adminPrimaryStatLabel.textContent = "Compras referidas";
      if (adminPrimaryStatValue) adminPrimaryStatValue.textContent = String(referralsData.totalPurchases || 0);
      if (adminPrimaryStatHelp) adminPrimaryStatHelp.textContent = "Compras confirmadas con enlace de referido.";

      if (adminSecondaryStatLabel) adminSecondaryStatLabel.textContent = "SNC pendientes";
      if (adminSecondaryStatValue) adminSecondaryStatValue.textContent = formatSnc((Number(referralsData.totalPendingRewardsSnc || 0) + Number(buyersData.totalPendingDeliverySnc || 0)), 2);
      if (adminSecondaryStatHelp) adminSecondaryStatHelp.textContent = "SNC pendientes por pagar o entregar.";
      updateSatoshiInsights();
      return;
    }

    if (tabName === "compradores") {
      if (adminPrimaryStatLabel) adminPrimaryStatLabel.textContent = "Compradores con compras";
      if (adminPrimaryStatValue) adminPrimaryStatValue.textContent = String(buyersData.totalBuyers || 0);
      if (adminPrimaryStatHelp) adminPrimaryStatHelp.textContent = "Wallets que compraron SNC en la preventa.";

      if (adminSecondaryStatLabel) adminSecondaryStatLabel.textContent = "SNC compradores pendientes";
      if (adminSecondaryStatValue) adminSecondaryStatValue.textContent = formatSnc(buyersData.totalPendingDeliverySnc || 0);
      if (adminSecondaryStatHelp) adminSecondaryStatHelp.textContent = "SNC que faltan por enviar a compradores.";
      updateSatoshiInsights();
      return;
    }

    if (tabName === "transacciones") {
      const purchasesData = state.purchasesData || {};
      const purchases = Array.isArray(purchasesData.purchases) ? purchasesData.purchases : [];
      const referredPurchases = purchases.filter((purchase) => purchase?.referrerWallet);

      if (adminPrimaryStatLabel) adminPrimaryStatLabel.textContent = "Transacciones referidas";
      if (adminPrimaryStatValue) adminPrimaryStatValue.textContent = String(referredPurchases.length || 0);
      if (adminPrimaryStatHelp) adminPrimaryStatHelp.textContent = "Compras confirmadas con enlace o wallet de referido.";

      if (adminSecondaryStatLabel) adminSecondaryStatLabel.textContent = "SNC pendientes";
      if (adminSecondaryStatValue) adminSecondaryStatValue.textContent = formatSnc(referralsData.totalPendingRewardsSnc || 0);
      if (adminSecondaryStatHelp) adminSecondaryStatHelp.textContent = "Comisiones SNC pendientes por pagar.";
      updateSatoshiInsights();
      return;
    }

    if (adminPrimaryStatLabel) adminPrimaryStatLabel.textContent = "Compras referidas";
    if (adminPrimaryStatValue) adminPrimaryStatValue.textContent = String(referralsData.totalPurchases || 0);
    if (adminPrimaryStatHelp) adminPrimaryStatHelp.textContent = "Compras confirmadas con enlace de referido.";

    if (adminSecondaryStatLabel) adminSecondaryStatLabel.textContent = "SNC referidos pendientes";
    if (adminSecondaryStatValue) adminSecondaryStatValue.textContent = formatSnc(referralsData.totalPendingRewardsSnc || 0);
    if (adminSecondaryStatHelp) adminSecondaryStatHelp.textContent = "Comisiones SNC pendientes por pagar a referidores.";

    updateSatoshiInsights();
  };

  const setAdminTab = (tabName = "resumen") => {
    state.activeTab = ["resumen", "referidos", "compradores", "transacciones"].includes(tabName) ? tabName : "resumen";
    document.body.dataset.adminTab = state.activeTab;

    tabButtons.forEach((button) => {
      const isActive = button.dataset.adminTab === state.activeTab;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    tabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.adminPanel !== state.activeTab;
    });

    if (adminStatsSection) {
      adminStatsSection.hidden = state.activeTab === "resumen";
    }

    if (adminSummaryCard) {
      adminSummaryCard.hidden = state.activeTab !== "resumen";
    }

    if (adminActivityCard) {
      adminActivityCard.hidden = state.activeTab !== "resumen";
    }

    updateAdminSummaryForTab(state.activeTab);
  };

  const openAdminPanel = ({ scroll = true } = {}) => {
    document.body.classList.add("admin-unlocked");
    document.body.dataset.adminTab = state.activeTab || "resumen";

    if (adminLoginCard) adminLoginCard.hidden = true;
    if (adminProtectedPanel) adminProtectedPanel.hidden = false;
    if (adminSessionMenu) adminSessionMenu.hidden = false;
    if (creatorDropdown) creatorDropdown.hidden = true;
    if (creatorMenuButton) creatorMenuButton.setAttribute("aria-expanded", "false");

    startAdminAutoRefresh();

    if (scroll) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const closeAdminPanel = () => {
    document.body.classList.remove("admin-unlocked");
    delete document.body.dataset.adminTab;
    stopAdminAutoRefresh();
    clearStoredAdminKey();
    clearPayoutWalletConnectionMemory();

    if (adminLoginCard) adminLoginCard.hidden = false;
    if (adminProtectedPanel) adminProtectedPanel.hidden = true;
    if (adminSessionMenu) adminSessionMenu.hidden = true;
    if (creatorDropdown) creatorDropdown.hidden = true;
    if (creatorMenuButton) creatorMenuButton.setAttribute("aria-expanded", "false");

    state.adminKey = "";
    state.payoutWallet = "";
    state.payoutProvider = null;
    state.tokenBalance = null;
    if (adminSentSncValue) adminSentSncValue.textContent = "0 SNC";
    if (adminWalletBalanceValue) adminWalletBalanceValue.textContent = "0 SNC";
    updatePayoutWalletUi();

    setAdminTab("resumen");

    if (adminKeyInput) {
      adminKeyInput.value = "";
      window.setTimeout(() => adminKeyInput.focus(), 80);
    }

    setMessage("", "");
  };

  const loadAdminData = async ({
    adminKey: providedAdminKey = "",
    silent = false,
    fromSavedSession = false,
    scroll = true
  } = {}) => {
    const adminKey = String(providedAdminKey || adminKeyInput?.value || state.adminKey || "").trim();

    if (!adminKey) {
      if (!silent) setMessage("Ingresa la clave admin del desarrollador.", "error");
      return;
    }

    try {
      state.adminKey = adminKey;

      if (!silent) {
        setMessage("Cargando datos actualizados...", "success");
      }

      await loadPublicConfig();

      const data = await apiRequest("/admin/referrals", { adminKey });
      const purchasesData = await apiRequest("/admin/purchases", { adminKey });
      const buyersData = await apiRequest("/admin/buyers", { adminKey });

      state.referralsData = data;
      state.purchasesData = purchasesData;
      state.buyersData = buyersData;

      if (adminReferrers) adminReferrers.textContent = String(data.totalReferrers || 0);

      renderRows(purchasesData.purchases || []);
      renderPaidTransactionRows(purchasesData.purchases || []);
      renderBuyersRows(buyersData.buyers || []);
      updateAdminSummaryForTab(state.activeTab);

      saveStoredAdminKey(adminKey);

      if (adminKeyInput) {
        adminKeyInput.value = adminKey;
      }

      openAdminPanel({ scroll: scroll && !silent });

      await restorePayoutWalletIfAllowed();

      if (!silent) {
        setMessage("Datos cargados correctamente.", "success");
      }
    } catch (error) {
      stopAdminAutoRefresh();

      if (fromSavedSession) {
        clearStoredAdminKey();
      }

      if (adminProtectedPanel) adminProtectedPanel.hidden = true;
      if (adminSessionMenu) adminSessionMenu.hidden = true;
      if (adminLoginCard) adminLoginCard.hidden = false;
      document.body.classList.remove("admin-unlocked");

      const message = fromSavedSession
        ? "La sesión guardada ya no es válida. Ingresa la clave admin otra vez."
        : error.message || "No se pudieron cargar los datos.";

      if (!silent || fromSavedSession) {
        setMessage(message, "error");
      }
    }
  };

  if (loadAdminButton) {
    loadAdminButton.addEventListener("click", () => loadAdminData());
  }
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

  const savedAdminKey = readStoredAdminKey();

  if (savedAdminKey) {
    if (adminKeyInput) adminKeyInput.value = savedAdminKey;
    setMessage("Restaurando sesión admin...", "success");
    loadAdminData({
      adminKey: savedAdminKey,
      silent: true,
      fromSavedSession: true,
      scroll: false
    });
  }
});
