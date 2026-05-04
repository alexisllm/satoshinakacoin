document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  /*
    CONFIGURACIÓN REAL BNB SMART CHAIN
    1) Reemplaza SALE_RECEIVER_ADDRESS por tu wallet o contrato de preventa.
    2) Para WalletConnect, crea un Project ID en Reown/WalletConnect y reemplaza WALLETCONNECT_PROJECT_ID.
    3) Mantén siempre la red BNB Smart Chain Mainnet: Chain ID 56 / 0x38.
  */
  const CONFIG = {
    sncPerBnb: 12500,
    presaleTokensForSale: 65000000,
    nextRoundRate: 11800,
    bnbUsdtFallback: 650,
    bnbUsdtPriceUrl: "https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT",
    raisedBnb: 0,
    goalBnb: 5200,
    countdownDays: 31,
    countdownHours: 24,
    countdownMinutes: 60,
    countdownSeconds: 60,
    saleReceiverAddress: "0x46E0076C4589882d3AC363Fbd658D0A39De12D89",
    walletConnectProjectId: "cc89970cef26c7900650e9bd88cb05e9",
    appName: "SatoshiNakaCoin",
    referralApiBaseUrl: window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:" ? "http://localhost:3001/api" : `${window.location.origin}/api`,
    bsc: {
      chainId: "0x38",
      chainIdDecimal: 56,
      chainName: "BNB Smart Chain",
      nativeCurrency: {
        name: "BNB",
        symbol: "BNB",
        decimals: 18
      },
      rpcUrls: ["https://bsc-dataseed.bnbchain.org"],
      blockExplorerUrls: ["https://bscscan.com"]
    }
  };

  const state = {
    walletConnected: false,
    walletName: "",
    account: "",
    provider: null,
    bnbUsdtPrice: 650,
    sncPurchased: 0,
    sncPurchaseCount: 0,
    referralAddress: "",
    staked: 0,
    rewards: 0,
    discoveredProviders: []
  };

  state.bnbUsdtPrice = CONFIG.bnbUsdtFallback;

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));

  const formatBnb = (value) =>
    new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 4
    }).format(value);

  const formatToken = (value) =>
    new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2
    }).format(value);

  const formatPurchasedSnc = (value) => {
    const amount = Number(value || 0);
    return `${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: amount > 0 && amount < 10 ? 2 : 0,
      maximumFractionDigits: 2
    }).format(amount)} SNC`;
  };

  const formatUsdt = (value) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);

  const formatUsdtTotal = (value) => {
    const amount = Number(value || 0);

    if (amount === 0) {
      return "0.00";
    }

    if (Math.abs(amount) < 1) {
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
      }).format(amount);
    }

    if (Math.abs(amount) < 1000) {
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    }

    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getPresaleGoalBnb = () => {
    const tokensForSale = Number(CONFIG.presaleTokensForSale || 0);
    const rate = Number(CONFIG.sncPerBnb || 0);

    if (tokensForSale > 0 && rate > 0) {
      return tokensForSale / rate;
    }

    return Number(CONFIG.goalBnb || 0);
  };

  const setMessage = (element, message, type = "success") => {
    if (!element) return;
    element.textContent = message;
    element.classList.remove("success", "error");
    element.classList.add(type);
  };

  const setHtmlMessage = (element, html, type = "success") => {
    if (!element) return;
    element.innerHTML = html;
    element.classList.remove("success", "error");
    element.classList.add(type);
  };

  const shortAddress = (address) => {
    if (!address || address.length < 12) return address || "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const isValidAddress = (address) => /^0x[a-fA-F0-9]{40}$/.test(String(address || ""));

  const isReceiverConfigured = () =>
    isValidAddress(CONFIG.saleReceiverAddress) &&
    CONFIG.saleReceiverAddress.toLowerCase() !== "0x0000000000000000000000000000000000000000";


  const loadPublicBackendConfig = async () => {
    try {
      const data = await apiRequest("/public-config");

      if (data.saleReceiverAddress && isValidAddress(data.saleReceiverAddress)) {
        CONFIG.saleReceiverAddress = data.saleReceiverAddress;
      }

      if (Number(data.sncPerBnb) > 0) {
        CONFIG.sncPerBnb = Number(data.sncPerBnb);
      }

      if (Number(data.presaleTokensForSale) > 0) {
        CONFIG.presaleTokensForSale = Number(data.presaleTokensForSale);
      }

      if (typeof updateTokenPreview === "function") updateTokenPreview();
      if (typeof updateRaisedDisplay === "function") updateRaisedDisplay();
      if (typeof loadPresaleStats === "function") await loadPresaleStats();
    } catch (error) {
      console.warn("No se pudo cargar configuración pública del backend:", error.message);
    }
  };

  const parseUnits = (value, decimals = 18) => {
    const raw = String(value || "").trim();

    if (!/^\d+(\.\d+)?$/.test(raw)) {
      throw new Error("Cantidad inválida.");
    }

    const [wholePart, fractionPart = ""] = raw.split(".");
    const fraction = fractionPart.padEnd(decimals, "0").slice(0, decimals);
    return BigInt(wholePart || "0") * 10n ** BigInt(decimals) + BigInt(fraction || "0");
  };

  const toHex = (value) => `0x${value.toString(16)}`;

  const textToHex = (text) => {
    return `0x${Array.from(new TextEncoder().encode(text))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}`;
  };

  const apiRequest = async (endpoint, options = {}) => {
    const response = await fetch(`${CONFIG.referralApiBaseUrl}${endpoint}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok === false) {
      throw new Error(data.error || "No se pudo completar la solicitud al backend.");
    }

    return data;
  };

  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const registerPurchaseUntilConfirmed = async ({ txHash, buyerWallet, ref }) => {
    const maxAttempts = 18;
    const delayMs = 7000;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await apiRequest("/purchases/register", {
          method: "POST",
          body: {
            txHash,
            buyerWallet,
            ref: ref || ""
          }
        });

        if (result.presaleStats && Number.isFinite(Number(result.presaleStats.raisedBnb))) {
          CONFIG.raisedBnb = Number(result.presaleStats.raisedBnb);
          updateRaisedDisplay();
        } else {
          await loadPresaleStats();
        }

        return result;
      } catch (error) {
        lastError = error;
        const message = String(error?.message || "").toLowerCase();
        const canRetry =
          message.includes("confirmaciones") ||
          message.includes("minada") ||
          message.includes("no encontrada") ||
          message.includes("bloque") ||
          message.includes("transaction");

        if (!canRetry || attempt === maxAttempts) {
          break;
        }

        await sleep(delayMs);
      }
    }

    throw lastError || new Error("No se pudo confirmar la compra.");
  };

  const isValidReferralValue = (value) => {
    return /^[a-zA-Z0-9_\-:.]{4,120}$/.test(String(value || ""));
  };

  // El click del enlace NO genera comisión ni registro de pago.
  // Solo se guarda localmente el código de referido; el backend registra comisión
  // únicamente después de una compra real verificada por txHash.
  const trackReferralClick = async () => {};


  const getReferralFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const referral = (params.get("ref") || "").trim();

    if (!isValidReferralValue(referral)) return "";

    window.localStorage.setItem("sncReferralRef", referral);
    return referral;
  };

  const getSavedReferral = () => {
    const savedReferral = window.localStorage.getItem("sncReferralRef") || "";
    return isValidReferralValue(savedReferral) ? savedReferral : "";
  };

  state.referralAddress = getReferralFromUrl() || getSavedReferral();

  /* Selector de idioma funcional */
  const LANGUAGE_LABELS = {
    ES: "ES",
    EN: "EN",
    PT: "PT",
    FR: "FR",
    ZH: "中文",
    JA: "日本語",
    KO: "한국어"
  };

  const languageTexts = {
    ES: {
      connectWallet: "Conectar Wallet",
      buySnc: "Comprar SNC",
      navInicio: "Inicio",
      navAcerca: "Acerca de",
      navTokenomics: "Tokenomics",
      navRoadmap: "Roadmap",
      navComoComprar: "Cómo comprar",
      navFaq: "FAQ",
      navWhitepaper: "Whitepaper",
      brandSubtitle: "Genesis Presale",
      heroEyebrow: "PREVENTA GENESIS · TOKEN SNC",
      heroTitle: "La moneda meme tributo inspirada en el legado de Satoshi Nakamoto.",
      heroDescription: "SatoshiNakaCoin celebra la cultura Bitcoin: autocustodia, verificación pública y comunidad Genesis en una experiencia de preventa conectada a BNB Smart Chain, con wallet real y flujo preparado para compras en BNB.",
      heroBuy: "Comprar SNC",
      heroHow: "Ver cómo funciona",
      statApy: "APY Genesis",
      statCommunity: "Comunidad Genesis",
      statRate: "1 BNB = SNC",
      presaleEyebrow: "RONDA GENESIS BSC",
      presaleTitle: "Compra SNC ahora",
      bscReal: "BSC",
      days: "Días",
      hours: "Horas",
      minutes: "Min",
      seconds: "Seg",
      totalRaised: "Total recaudado",
      amountBnb: "Cantidad de BNB",
      amountPlaceholder: "Ej: 0.05",
      receiveApprox: "Recibirás aproximadamente",
      referEarn: "Recomiéndanos y gana",
      trustAudit: "Auditoría preparada",
      trustContract: "Contrato BSC preparado",
      trustDashboard: "Dashboard responsive",
      trustReferral: "Referidos con panel",
      trustCommunity: "Comunidad global",
      aboutEyebrow: "ACERCA DE SNC",
      aboutTitle: "SatoshiNakaCoin nace como un tributo meme a la cultura Nakamoto.",
      feature1Title: "Compra rápida",
      feature1Text: "Preventa en BNB Smart Chain con conexión de wallet, cálculo de SNC y validaciones claras.",
      feature2Title: "Enfoque seguro",
      feature2Text: "Mensajes preventivos, conexión EVM real y protección para verificar red, monto y destino.",
      feature3Title: "Identidad Nakamoto",
      feature3Text: "Interfaz oscura con neón azul, acentos dorados, tarjetas premium y animaciones suaves.",
      tokenEyebrow: "DISTRIBUCIÓN GENESIS",
      tokenTitle: "Tokenomics SNC",
      totalSupply: "Suministro total",
      fixedSupply: "Oferta fija Genesis",
      presaleGenesis: "Preventa Genesis",
      buyersPercent: "50% para compradores",
      mainNetwork: "Red principal",
      buyWithBnb: "Compra con BNB",
      supplyLabel: "100M supply",
      totalDistribution: "Distribución total",
      phase: "Fase",
      liquidity: "Liquidez inicial",
      marketing: "Marketing",
      development: "Desarrollo",
      reserve: "Reserva",
      tokenPresaleText: "50.000.000 SNC destinados a compradores iniciales de la preventa.",
      tokenLiquidityText: "25.000.000 SNC reservados para crear el par de liquidez SNC/BNB.",
      tokenMarketingText: "10.000.000 SNC para campañas, referidos, comunidad y crecimiento.",
      tokenDevelopmentText: "10.000.000 SNC para soporte técnico, mejoras web y operación del proyecto.",
      tokenReserveText: "5.000.000 SNC guardados para imprevistos, alianzas o necesidades futuras.",
      mini1Title: "Preventa principal",
      mini1Text: "El 50% del suministro queda para compradores Genesis, manteniendo una preventa fuerte y sostenible.",
      mini2Title: "Liquidez separada",
      mini2Text: "El 25% se reserva para crear liquidez sin tocar los tokens de preventa.",
      mini3Title: "Fondos controlados",
      mini3Text: "Marketing, desarrollo y reserva quedan separados para operar sin depender de ventas improvisadas.",
      roadmapEyebrow: "PLAN DE EXPANSIÓN",
      roadmapTitle: "Roadmap por fases",
      phase1: "Fase 1: Lanzamiento",
      phase2: "Fase 2: Comunidad",
      phase3: "Fase 3: Expansión",
      phase4: "Fase 4: Listados / crecimiento",
      howEyebrow: "CÓMO FUNCIONA",
      howTitle: "Compra en 4 pasos",
      step1Title: "Conectar wallet",
      step1Text: "Abre el modal y conecta una wallet compatible con BNB Smart Chain.",
      step2Title: "Ingresar BNB",
      step2Text: "Escribe la cantidad de BNB y revisa la estimación de SNC y USDT.",
      step3Title: "Confirmar compra",
      step3Text: "Verifica red, monto y wallet receptora antes de firmar la transacción.",
      step4Title: "Registro Genesis",
      step4Text: "La compra confirmada queda asociada a tu wallet y al txHash.",
      faqEyebrow: "FAQ",
      faqTitle: "Preguntas frecuentes",
      footerCommunity: "Comunidad",
      footerSupport: "Soporte FAQ",
      legalTitle: "Aviso legal",
      legalText: "Todo proyecto cripto tiene riesgos. SatoshiNakaCoin no es consejo financiero ni garantiza resultados, precio futuro, liquidez o ganancias. Verifica siempre la red, el monto y la dirección receptora antes de confirmar cualquier transacción.",
      copyright: "© 2026 SatoshiNakaCoin. Todos los derechos reservados.",
      walletTitle: "Conectar wallet",
      walletText: "Elige una wallet para conectarte y continuar con la compra.",
      metamaskSub: "Extensión EVM",
      bestSub: "Wallet recomendada",
      walletConnectSub: "Escanear o enlazar",
      baseSub: "Wallet Base",
      referralEyebrow: "RECOMIÉNDANOS Y GANA",
      referralTitle: "Enlace de referido",
      referralText: "Comparte este enlace. El 5% solo se calcula y aparece en el panel admin cuando la compra quede confirmada con txHash en BNB Smart Chain.",
      referralPlaceholder: "Generando enlace...",
      close: "Cerrar"
    },
    EN: {
      connectWallet: "Connect Wallet",
      buySnc: "Buy SNC",
      navInicio: "Home",
      navAcerca: "About",
      navTokenomics: "Tokenomics",
      navRoadmap: "Roadmap",
      navComoComprar: "How to buy",
      navFaq: "FAQ",
      navWhitepaper: "Whitepaper",
      brandSubtitle: "Genesis Presale",
      heroEyebrow: "GENESIS PRESALE · SNC TOKEN",
      heroTitle: "The tribute meme coin inspired by Satoshi Nakamoto's legacy.",
      heroDescription: "SatoshiNakaCoin celebrates Bitcoin culture: self-custody, public verification and a Genesis community through a BNB Smart Chain presale experience with real wallet connection and a BNB purchase flow.",
      heroBuy: "Buy SNC",
      heroHow: "See how it works",
      statApy: "Genesis APY",
      statCommunity: "Genesis community",
      statRate: "1 BNB = SNC",
      presaleEyebrow: "GENESIS BSC ROUND",
      presaleTitle: "Buy SNC now",
      bscReal: "BSC",
      days: "Days",
      hours: "Hours",
      minutes: "Min",
      seconds: "Sec",
      totalRaised: "Total raised",
      amountBnb: "BNB amount",
      amountPlaceholder: "Ex: 0.05",
      receiveApprox: "You will receive approximately",
      referEarn: "Refer and earn",
      trustAudit: "Audit prepared",
      trustContract: "BSC contract ready",
      trustDashboard: "Responsive dashboard",
      trustReferral: "Referral admin panel",
      trustCommunity: "Global community",
      aboutEyebrow: "ABOUT SNC",
      aboutTitle: "SatoshiNakaCoin is born as a meme tribute to Nakamoto culture.",
      feature1Title: "Fast purchase",
      feature1Text: "BNB Smart Chain presale with wallet connection, SNC calculation and clear validations.",
      feature2Title: "Security-first",
      feature2Text: "Preventive messages, real EVM connection and checks for network, amount and destination.",
      feature3Title: "Nakamoto identity",
      feature3Text: "Dark interface with blue neon, golden accents, premium cards and smooth animations.",
      tokenEyebrow: "GENESIS DISTRIBUTION",
      tokenTitle: "SNC Tokenomics",
      totalSupply: "Total supply",
      fixedSupply: "Fixed Genesis supply",
      presaleGenesis: "Genesis Presale",
      buyersPercent: "50% for buyers",
      mainNetwork: "Main network",
      buyWithBnb: "Buy with BNB",
      supplyLabel: "100M supply",
      totalDistribution: "Total distribution",
      phase: "Phase",
      liquidity: "Initial liquidity",
      marketing: "Marketing",
      development: "Development",
      reserve: "Reserve",
      tokenPresaleText: "50,000,000 SNC allocated to early presale buyers.",
      tokenLiquidityText: "25,000,000 SNC reserved to create the SNC/BNB liquidity pair.",
      tokenMarketingText: "10,000,000 SNC for campaigns, referrals, community and growth.",
      tokenDevelopmentText: "10,000,000 SNC for technical support, web improvements and project operations.",
      tokenReserveText: "5,000,000 SNC kept for contingencies, partnerships or future needs.",
      mini1Title: "Main presale",
      mini1Text: "50% of the supply is allocated to Genesis buyers, keeping the presale strong and sustainable.",
      mini2Title: "Separate liquidity",
      mini2Text: "25% is reserved to create liquidity without touching presale tokens.",
      mini3Title: "Controlled funds",
      mini3Text: "Marketing, development and reserve are separated to operate without improvised selling.",
      roadmapEyebrow: "EXPANSION PLAN",
      roadmapTitle: "Roadmap phases",
      phase1: "Phase 1: Launch",
      phase2: "Phase 2: Community",
      phase3: "Phase 3: Expansion",
      phase4: "Phase 4: Listings / growth",
      howEyebrow: "HOW IT WORKS",
      howTitle: "Buy in 4 steps",
      step1Title: "Connect wallet",
      step1Text: "Open the modal and connect a wallet compatible with BNB Smart Chain.",
      step2Title: "Enter BNB",
      step2Text: "Enter the BNB amount and check the SNC and USDT estimate.",
      step3Title: "Confirm purchase",
      step3Text: "Verify network, amount and receiver wallet before signing the transaction.",
      step4Title: "Genesis record",
      step4Text: "The confirmed purchase is linked to your wallet and txHash.",
      faqEyebrow: "FAQ",
      faqTitle: "Frequently asked questions",
      footerCommunity: "Community",
      footerSupport: "FAQ support",
      legalTitle: "Legal notice",
      legalText: "Every crypto project carries risk. SatoshiNakaCoin is not financial advice and does not guarantee results, future price, liquidity or profits. Always verify the network, amount and receiver address before confirming any transaction.",
      copyright: "© 2026 SatoshiNakaCoin. All rights reserved.",
      walletTitle: "Connect wallet",
      walletText: "Choose a wallet to connect and continue with the purchase.",
      metamaskSub: "EVM extension",
      bestSub: "Recommended wallet",
      walletConnectSub: "Scan or connect",
      baseSub: "Base Wallet",
      referralEyebrow: "REFER AND EARN",
      referralTitle: "Referral link",
      referralText: "Share this link. The 5% is calculated and shown in the admin panel only when the purchase is confirmed with a txHash on BNB Smart Chain.",
      referralPlaceholder: "Generating link...",
      close: "Close"
    },
    PT: {
      connectWallet: "Conectar Wallet",
      buySnc: "Comprar SNC",
      navInicio: "Início",
      navAcerca: "Sobre",
      navTokenomics: "Tokenomics",
      navRoadmap: "Roadmap",
      navComoComprar: "Como comprar",
      navFaq: "FAQ",
      navWhitepaper: "Whitepaper",
      brandSubtitle: "Genesis Presale",
      heroEyebrow: "PRÉ-VENDA GENESIS · TOKEN SNC",
      heroTitle: "A moeda meme tributo inspirada no legado de Satoshi Nakamoto.",
      heroDescription: "SatoshiNakaCoin celebra a cultura Bitcoin: autocustódia, verificação pública e comunidade Genesis em uma experiência de pré-venda conectada à BNB Smart Chain, com wallet real e fluxo preparado para compras em BNB.",
      heroBuy: "Comprar SNC",
      heroHow: "Ver como funciona",
      statApy: "APY Genesis",
      statCommunity: "Comunidade Genesis",
      statRate: "1 BNB = SNC",
      presaleEyebrow: "RODADA GENESIS BSC",
      presaleTitle: "Compre SNC agora",
      bscReal: "BSC",
      days: "Dias",
      hours: "Horas",
      minutes: "Min",
      seconds: "Seg",
      totalRaised: "Total arrecadado",
      amountBnb: "Quantidade de BNB",
      amountPlaceholder: "Ex: 0.05",
      receiveApprox: "Você receberá aproximadamente",
      referEarn: "Indique e ganhe",
      trustAudit: "Auditoria preparada",
      trustContract: "Contrato BSC preparado",
      trustDashboard: "Dashboard responsivo",
      trustReferral: "Painel de indicados",
      trustCommunity: "Comunidade global",
      aboutEyebrow: "SOBRE SNC",
      aboutTitle: "SatoshiNakaCoin nasce como um tributo meme à cultura Nakamoto.",
      feature1Title: "Compra rápida",
      feature1Text: "Pré-venda na BNB Smart Chain com conexão de wallet, cálculo de SNC e validações claras.",
      feature2Title: "Foco em segurança",
      feature2Text: "Mensagens preventivas, conexão EVM real e verificação de rede, valor e destino.",
      feature3Title: "Identidade Nakamoto",
      feature3Text: "Interface escura com neon azul, detalhes dourados, cards premium e animações suaves.",
      tokenEyebrow: "DISTRIBUIÇÃO GENESIS",
      tokenTitle: "Tokenomics SNC",
      totalSupply: "Fornecimento total",
      fixedSupply: "Oferta fixa Genesis",
      presaleGenesis: "Pré-venda Genesis",
      buyersPercent: "50% para compradores",
      mainNetwork: "Rede principal",
      buyWithBnb: "Compra com BNB",
      supplyLabel: "100M supply",
      totalDistribution: "Distribuição total",
      phase: "Fase",
      liquidity: "Liquidez inicial",
      marketing: "Marketing",
      development: "Desenvolvimento",
      reserve: "Reserva",
      tokenPresaleText: "50.000.000 SNC destinados aos compradores iniciais da pré-venda.",
      tokenLiquidityText: "25.000.000 SNC reservados para criar o par de liquidez SNC/BNB.",
      tokenMarketingText: "10.000.000 SNC para campanhas, indicações, comunidade e crescimento.",
      tokenDevelopmentText: "10.000.000 SNC para suporte técnico, melhorias web e operação do projeto.",
      tokenReserveText: "5.000.000 SNC guardados para imprevistos, parcerias ou necessidades futuras.",
      mini1Title: "Pré-venda principal",
      mini1Text: "50% do fornecimento fica para compradores Genesis, mantendo uma pré-venda forte e sustentável.",
      mini2Title: "Liquidez separada",
      mini2Text: "25% é reservado para criar liquidez sem tocar nos tokens da pré-venda.",
      mini3Title: "Fundos controlados",
      mini3Text: "Marketing, desenvolvimento e reserva ficam separados para operar sem vendas improvisadas.",
      roadmapEyebrow: "PLANO DE EXPANSÃO",
      roadmapTitle: "Fases do roadmap",
      phase1: "Fase 1: Lançamento",
      phase2: "Fase 2: Comunidade",
      phase3: "Fase 3: Expansão",
      phase4: "Fase 4: Listagens / crescimento",
      howEyebrow: "COMO FUNCIONA",
      howTitle: "Compre em 4 passos",
      step1Title: "Conectar wallet",
      step1Text: "Abra o modal e conecte uma wallet compatível com BNB Smart Chain.",
      step2Title: "Inserir BNB",
      step2Text: "Digite a quantidade de BNB e confira a estimativa em SNC e USDT.",
      step3Title: "Confirmar compra",
      step3Text: "Verifique rede, valor e wallet receptora antes de assinar a transação.",
      step4Title: "Registro Genesis",
      step4Text: "A compra confirmada fica associada à sua wallet e ao txHash.",
      faqEyebrow: "FAQ",
      faqTitle: "Perguntas frequentes",
      footerCommunity: "Comunidade",
      footerSupport: "Suporte FAQ",
      legalTitle: "Aviso legal",
      legalText: "Todo projeto cripto tem riscos. SatoshiNakaCoin não é conselho financeiro e não garante resultados, preço futuro, liquidez ou lucros. Verifique sempre a rede, o valor e o endereço receptor antes de confirmar qualquer transação.",
      copyright: "© 2026 SatoshiNakaCoin. Todos os direitos reservados.",
      walletTitle: "Conectar wallet",
      walletText: "Escolha uma wallet para conectar e continuar com a compra.",
      metamaskSub: "Extensão EVM",
      bestSub: "Wallet recomendada",
      walletConnectSub: "Escanear ou conectar",
      baseSub: "Wallet Base",
      referralEyebrow: "INDIQUE E GANHE",
      referralTitle: "Link de indicação",
      referralText: "Compartilhe este link. Os 5% só são calculados e aparecem no painel admin quando a compra for confirmada com txHash na BNB Smart Chain.",
      referralPlaceholder: "Gerando link...",
      close: "Fechar"
    },
    FR: {
      connectWallet: "Connecter Wallet",
      buySnc: "Acheter SNC",
      navInicio: "Accueil",
      navAcerca: "À propos",
      navTokenomics: "Tokenomics",
      navRoadmap: "Roadmap",
      navComoComprar: "Comment acheter",
      navFaq: "FAQ",
      navWhitepaper: "Whitepaper",
      brandSubtitle: "Genesis Presale",
      heroEyebrow: "PRÉVENTE GENESIS · TOKEN SNC",
      heroTitle: "La monnaie meme hommage inspirée par l'héritage de Satoshi Nakamoto.",
      heroDescription: "SatoshiNakaCoin célèbre la culture Bitcoin : autocustodie, vérification publique et communauté Genesis dans une expérience de prévente connectée à BNB Smart Chain, avec wallet réel et flux d'achat en BNB.",
      heroBuy: "Acheter SNC",
      heroHow: "Voir comment ça marche",
      statApy: "APY Genesis",
      statCommunity: "Communauté Genesis",
      statRate: "1 BNB = SNC",
      presaleEyebrow: "ROUND GENESIS BSC",
      presaleTitle: "Acheter SNC maintenant",
      bscReal: "BSC",
      days: "Jours",
      hours: "Heures",
      minutes: "Min",
      seconds: "Sec",
      totalRaised: "Total collecté",
      amountBnb: "Montant BNB",
      amountPlaceholder: "Ex : 0.05",
      receiveApprox: "Vous recevrez environ",
      referEarn: "Recommandez et gagnez",
      trustAudit: "Audit préparé",
      trustContract: "Contrat BSC prêt",
      trustDashboard: "Dashboard responsive",
      trustReferral: "Panel de parrainage",
      trustCommunity: "Communauté globale",
      aboutEyebrow: "À PROPOS DE SNC",
      aboutTitle: "SatoshiNakaCoin naît comme un hommage meme à la culture Nakamoto.",
      feature1Title: "Achat rapide",
      feature1Text: "Prévente sur BNB Smart Chain avec connexion wallet, calcul SNC et validations claires.",
      feature2Title: "Approche sécurisée",
      feature2Text: "Messages préventifs, connexion EVM réelle et vérification du réseau, du montant et de la destination.",
      feature3Title: "Identité Nakamoto",
      feature3Text: "Interface sombre avec néon bleu, accents dorés, cartes premium et animations fluides.",
      tokenEyebrow: "DISTRIBUTION GENESIS",
      tokenTitle: "Tokenomics SNC",
      totalSupply: "Offre totale",
      fixedSupply: "Offre fixe Genesis",
      presaleGenesis: "Prévente Genesis",
      buyersPercent: "50% pour les acheteurs",
      mainNetwork: "Réseau principal",
      buyWithBnb: "Achat avec BNB",
      supplyLabel: "100M supply",
      totalDistribution: "Distribution totale",
      phase: "Phase",
      liquidity: "Liquidité initiale",
      marketing: "Marketing",
      development: "Développement",
      reserve: "Réserve",
      tokenPresaleText: "50 000 000 SNC destinés aux premiers acheteurs de la prévente.",
      tokenLiquidityText: "25 000 000 SNC réservés pour créer la paire de liquidité SNC/BNB.",
      tokenMarketingText: "10 000 000 SNC pour campagnes, parrainages, communauté et croissance.",
      tokenDevelopmentText: "10 000 000 SNC pour support technique, améliorations web et opérations du projet.",
      tokenReserveText: "5 000 000 SNC gardés pour imprévus, partenariats ou besoins futurs.",
      mini1Title: "Prévente principale",
      mini1Text: "50% de l'offre est réservée aux acheteurs Genesis, pour une prévente forte et durable.",
      mini2Title: "Liquidité séparée",
      mini2Text: "25% est réservé pour créer de la liquidité sans toucher aux tokens de prévente.",
      mini3Title: "Fonds contrôlés",
      mini3Text: "Marketing, développement et réserve sont séparés pour opérer sans ventes improvisées.",
      roadmapEyebrow: "PLAN D'EXPANSION",
      roadmapTitle: "Phases du roadmap",
      phase1: "Phase 1 : Lancement",
      phase2: "Phase 2 : Communauté",
      phase3: "Phase 3 : Expansion",
      phase4: "Phase 4 : Listings / croissance",
      howEyebrow: "COMMENT ÇA MARCHE",
      howTitle: "Acheter en 4 étapes",
      step1Title: "Connecter wallet",
      step1Text: "Ouvrez le modal et connectez un wallet compatible avec BNB Smart Chain.",
      step2Title: "Saisir BNB",
      step2Text: "Entrez le montant BNB et vérifiez l'estimation SNC et USDT.",
      step3Title: "Confirmer l'achat",
      step3Text: "Vérifiez le réseau, le montant et le wallet récepteur avant de signer.",
      step4Title: "Registre Genesis",
      step4Text: "L'achat confirmé est associé à votre wallet et au txHash.",
      faqEyebrow: "FAQ",
      faqTitle: "Questions fréquentes",
      footerCommunity: "Communauté",
      footerSupport: "Support FAQ",
      legalTitle: "Avis légal",
      legalText: "Tout projet crypto comporte des risques. SatoshiNakaCoin n'est pas un conseil financier et ne garantit pas les résultats, le prix futur, la liquidité ou les gains. Vérifiez toujours le réseau, le montant et l'adresse réceptrice avant de confirmer toute transaction.",
      copyright: "© 2026 SatoshiNakaCoin. Tous droits réservés.",
      walletTitle: "Connecter wallet",
      walletText: "Choisissez un wallet pour vous connecter et continuer l'achat.",
      metamaskSub: "Extension EVM",
      bestSub: "Wallet recommandé",
      walletConnectSub: "Scanner ou connecter",
      baseSub: "Wallet Base",
      referralEyebrow: "RECOMMANDEZ ET GAGNEZ",
      referralTitle: "Lien de parrainage",
      referralText: "Partagez ce lien. Les 5% ne sont calculés et affichés dans le panel admin que lorsque l'achat est confirmé avec txHash sur BNB Smart Chain.",
      referralPlaceholder: "Génération du lien...",
      close: "Fermer"
    }
,
    ZH: {
      connectWallet: "连接钱包",
      buySnc: "购买 SNC",
      navInicio: "首页",
      navAcerca: "关于",
      navTokenomics: "代币经济",
      navRoadmap: "路线图",
      navComoComprar: "如何购买",
      navFaq: "常见问题",
      navWhitepaper: "白皮书",
      brandSubtitle: "Genesis 预售",
      heroEyebrow: "GENESIS 预售 · TOKEN SNC",
      heroTitle: "受中本聪精神启发的致敬型 Meme 代币。",
      heroDescription: "SatoshiNakaCoin 致敬 Bitcoin 文化：自托管、公开验证和 Genesis 社区，并通过 BNB Smart Chain 提供真实钱包连接和 BNB 购买流程。",
      heroBuy: "购买 SNC",
      heroHow: "查看流程",
      statApy: "Genesis APY",
      statCommunity: "Genesis 社区",
      statRate: "1 BNB = SNC",
      presaleEyebrow: "GENESIS BSC 轮",
      presaleTitle: "立即购买 SNC",
      bscReal: "BSC",
      days: "天",
      hours: "时",
      minutes: "分",
      seconds: "秒",
      totalRaised: "已募集",
      amountBnb: "BNB 数量",
      amountPlaceholder: "例：0.05",
      receiveApprox: "预计收到",
      referEarn: "推荐并赚取",
      trustAudit: "审计准备中",
      trustContract: "BSC 合约就绪",
      trustDashboard: "响应式面板",
      trustReferral: "推荐管理面板",
      trustCommunity: "全球社区",
      aboutEyebrow: "关于 SNC",
      aboutTitle: "SatoshiNakaCoin 是对 Nakamoto 文化的 Meme 致敬。",
      feature1Title: "快速购买",
      feature1Text: "BNB Smart Chain 预售，支持钱包连接、SNC 计算和清晰验证。",
      feature2Title: "安全优先",
      feature2Text: "风险提示、真实 EVM 连接，并检查网络、金额和收款地址。",
      feature3Title: "Nakamoto 身份",
      feature3Text: "深色界面、蓝色霓虹、金色点缀、高级卡片和流畅动画。",
      tokenEyebrow: "GENESIS 分配",
      tokenTitle: "SNC 代币经济",
      totalSupply: "总供应量",
      fixedSupply: "Genesis 固定供应",
      presaleGenesis: "Genesis 预售",
      buyersPercent: "50% 给买家",
      mainNetwork: "主网络",
      buyWithBnb: "使用 BNB 购买",
      supplyLabel: "100M 供应",
      totalDistribution: "总分配",
      phase: "阶段",
      liquidity: "初始流动性",
      marketing: "营销",
      development: "开发",
      reserve: "储备",
      tokenPresaleText: "50,000,000 SNC 分配给早期预售买家。",
      tokenLiquidityText: "25,000,000 SNC 用于创建 SNC/BNB 流动性池。",
      tokenMarketingText: "10,000,000 SNC 用于活动、推荐、社区和增长。",
      tokenDevelopmentText: "10,000,000 SNC 用于技术支持、网站改进和项目运营。",
      tokenReserveText: "5,000,000 SNC 用于应急、合作或未来需求。",
      mini1Title: "主预售",
      mini1Text: "50% 供应分配给 Genesis 买家，保持预售强度和可持续性。",
      mini2Title: "独立流动性",
      mini2Text: "25% 用于创建流动性，不动用预售代币。",
      mini3Title: "资金分离",
      mini3Text: "营销、开发和储备分开管理，避免临时抛售。",
      roadmapEyebrow: "扩展计划",
      roadmapTitle: "路线图阶段",
      phase1: "阶段 1：启动",
      phase2: "阶段 2：社区",
      phase3: "阶段 3：扩展",
      phase4: "阶段 4：上线 / 增长",
      howEyebrow: "运作方式",
      howTitle: "4 步购买",
      step1Title: "连接钱包",
      step1Text: "打开弹窗并连接兼容 BNB Smart Chain 的钱包。",
      step2Title: "输入 BNB",
      step2Text: "输入 BNB 数量并查看 SNC 与 USDT 估算。",
      step3Title: "确认购买",
      step3Text: "签名前检查网络、金额和收款钱包。",
      step4Title: "Genesis 记录",
      step4Text: "确认后的购买会关联到你的钱包和 txHash。",
      faqEyebrow: "FAQ",
      faqTitle: "常见问题",
      footerCommunity: "社区",
      footerSupport: "FAQ 支持",
      legalTitle: "法律声明",
      legalText: "所有加密项目都有风险。SatoshiNakaCoin 不构成财务建议，也不保证结果、未来价格、流动性或收益。确认交易前请始终检查网络、金额和收款地址。",
      copyright: "© 2026 SatoshiNakaCoin. 保留所有权利。",
      walletTitle: "连接钱包",
      walletText: "选择钱包以连接并继续购买。",
      metamaskSub: "EVM 扩展",
      bestSub: "推荐钱包",
      walletConnectSub: "扫码或连接",
      baseSub: "Base 钱包",
      referralEyebrow: "推荐并赚取",
      referralTitle: "推荐链接",
      referralText: "分享此链接。只有在 BNB Smart Chain 上通过 txHash 确认购买后，5% 才会计算并显示在管理面板中。",
      referralPlaceholder: "正在生成链接...",
      close: "关闭"
    },
    JA: {
      connectWallet: "ウォレット接続",
      buySnc: "SNCを購入",
      navInicio: "ホーム",
      navAcerca: "概要",
      navTokenomics: "トークノミクス",
      navRoadmap: "ロードマップ",
      navComoComprar: "購入方法",
      navFaq: "FAQ",
      navWhitepaper: "ホワイトペーパー",
      brandSubtitle: "Genesis Presale",
      heroEyebrow: "GENESIS プレセール · TOKEN SNC",
      heroTitle: "Satoshi Nakamoto のレガシーに着想を得たトリビュート Meme コイン。",
      heroDescription: "SatoshiNakaCoin は Bitcoin 文化、自主保管、公開検証、Genesis コミュニティを称え、BNB Smart Chain 上で実ウォレット接続と BNB 購入フローを提供します。",
      heroBuy: "SNCを購入",
      heroHow: "仕組みを見る",
      statApy: "Genesis APY",
      statCommunity: "Genesis コミュニティ",
      statRate: "1 BNB = SNC",
      presaleEyebrow: "GENESIS BSC ラウンド",
      presaleTitle: "今すぐSNCを購入",
      bscReal: "BSC",
      days: "日",
      hours: "時",
      minutes: "分",
      seconds: "秒",
      totalRaised: "調達合計",
      amountBnb: "BNB数量",
      amountPlaceholder: "例：0.05",
      receiveApprox: "受取予定",
      referEarn: "紹介して獲得",
      trustAudit: "監査準備済み",
      trustContract: "BSC契約準備済み",
      trustDashboard: "レスポンシブ管理画面",
      trustReferral: "紹介管理パネル",
      trustCommunity: "グローバルコミュニティ",
      aboutEyebrow: "SNCについて",
      aboutTitle: "SatoshiNakaCoin は Nakamoto 文化への Meme トリビュートとして誕生しました。",
      feature1Title: "高速購入",
      feature1Text: "BNB Smart Chain プレセール、ウォレット接続、SNC計算、明確な検証。",
      feature2Title: "安全重視",
      feature2Text: "注意メッセージ、実EVM接続、ネットワーク・金額・送信先確認。",
      feature3Title: "Nakamoto アイデンティティ",
      feature3Text: "ダークUI、青いネオン、金色のアクセント、プレミアムカード、滑らかなアニメーション。",
      tokenEyebrow: "GENESIS 配分",
      tokenTitle: "SNC トークノミクス",
      totalSupply: "総供給量",
      fixedSupply: "Genesis固定供給",
      presaleGenesis: "Genesis プレセール",
      buyersPercent: "50% 購入者向け",
      mainNetwork: "メインネット",
      buyWithBnb: "BNBで購入",
      supplyLabel: "100M supply",
      totalDistribution: "総配分",
      phase: "フェーズ",
      liquidity: "初期流動性",
      marketing: "マーケティング",
      development: "開発",
      reserve: "リザーブ",
      tokenPresaleText: "50,000,000 SNC は初期プレセール購入者に割り当て。",
      tokenLiquidityText: "25,000,000 SNC は SNC/BNB 流動性ペア作成用。",
      tokenMarketingText: "10,000,000 SNC はキャンペーン、紹介、コミュニティ、成長用。",
      tokenDevelopmentText: "10,000,000 SNC は技術サポート、Web改善、運営用。",
      tokenReserveText: "5,000,000 SNC は予備、提携、将来ニーズ用。",
      mini1Title: "メインプレセール",
      mini1Text: "供給量の50%をGenesis購入者に割り当て、強く持続可能なプレセールを維持。",
      mini2Title: "独立した流動性",
      mini2Text: "25%を流動性作成に確保し、プレセール用トークンには触れません。",
      mini3Title: "資金管理",
      mini3Text: "マーケティング、開発、リザーブを分離し、場当たり的な売却に依存しません。",
      roadmapEyebrow: "拡張計画",
      roadmapTitle: "ロードマップ",
      phase1: "フェーズ1：ローンチ",
      phase2: "フェーズ2：コミュニティ",
      phase3: "フェーズ3：拡張",
      phase4: "フェーズ4：上場 / 成長",
      howEyebrow: "仕組み",
      howTitle: "4ステップで購入",
      step1Title: "ウォレット接続",
      step1Text: "モーダルを開き、BNB Smart Chain 対応ウォレットを接続します。",
      step2Title: "BNBを入力",
      step2Text: "BNB数量を入力し、SNCとUSDTの見積もりを確認します。",
      step3Title: "購入を確認",
      step3Text: "署名前にネットワーク、金額、受取ウォレットを確認します。",
      step4Title: "Genesis 記録",
      step4Text: "確認済み購入はあなたのウォレットとtxHashに関連付けられます。",
      faqEyebrow: "FAQ",
      faqTitle: "よくある質問",
      footerCommunity: "コミュニティ",
      footerSupport: "FAQサポート",
      legalTitle: "法的注意",
      legalText: "すべての暗号資産プロジェクトにはリスクがあります。SatoshiNakaCoin は投資助言ではなく、結果、将来価格、流動性、利益を保証しません。取引前にネットワーク、金額、受取アドレスを必ず確認してください。",
      copyright: "© 2026 SatoshiNakaCoin. All rights reserved.",
      walletTitle: "ウォレット接続",
      walletText: "購入を続けるためにウォレットを選択してください。",
      metamaskSub: "EVM拡張",
      bestSub: "推奨ウォレット",
      walletConnectSub: "スキャンまたは接続",
      baseSub: "Base Wallet",
      referralEyebrow: "紹介して獲得",
      referralTitle: "紹介リンク",
      referralText: "このリンクを共有してください。5%はBNB Smart ChainでtxHash確認済みの購入だけ管理パネルに表示されます。",
      referralPlaceholder: "リンク生成中...",
      close: "閉じる"
    },
    KO: {
      connectWallet: "지갑 연결",
      buySnc: "SNC 구매",
      navInicio: "홈",
      navAcerca: "소개",
      navTokenomics: "토크노믹스",
      navRoadmap: "로드맵",
      navComoComprar: "구매 방법",
      navFaq: "FAQ",
      navWhitepaper: "백서",
      brandSubtitle: "Genesis Presale",
      heroEyebrow: "GENESIS 프리세일 · TOKEN SNC",
      heroTitle: "Satoshi Nakamoto의 유산에서 영감을 받은 트리뷰트 Meme 코인.",
      heroDescription: "SatoshiNakaCoin은 Bitcoin 문화, 자기 보관, 공개 검증, Genesis 커뮤니티를 기념하며 BNB Smart Chain에서 실제 지갑 연결과 BNB 구매 흐름을 제공합니다.",
      heroBuy: "SNC 구매",
      heroHow: "작동 방식 보기",
      statApy: "Genesis APY",
      statCommunity: "Genesis 커뮤니티",
      statRate: "1 BNB = SNC",
      presaleEyebrow: "GENESIS BSC 라운드",
      presaleTitle: "지금 SNC 구매",
      bscReal: "BSC",
      days: "일",
      hours: "시",
      minutes: "분",
      seconds: "초",
      totalRaised: "총 모금액",
      amountBnb: "BNB 수량",
      amountPlaceholder: "예: 0.05",
      receiveApprox: "예상 수령",
      referEarn: "추천하고 보상받기",
      trustAudit: "감사 준비",
      trustContract: "BSC 계약 준비",
      trustDashboard: "반응형 대시보드",
      trustReferral: "추천 관리자 패널",
      trustCommunity: "글로벌 커뮤니티",
      aboutEyebrow: "SNC 소개",
      aboutTitle: "SatoshiNakaCoin은 Nakamoto 문화에 대한 Meme 트리뷰트로 탄생했습니다.",
      feature1Title: "빠른 구매",
      feature1Text: "BNB Smart Chain 프리세일, 지갑 연결, SNC 계산, 명확한 검증.",
      feature2Title: "보안 중심",
      feature2Text: "예방 메시지, 실제 EVM 연결, 네트워크·금액·수신 주소 확인.",
      feature3Title: "Nakamoto 아이덴티티",
      feature3Text: "다크 인터페이스, 블루 네온, 골드 포인트, 프리미엄 카드, 부드러운 애니메이션.",
      tokenEyebrow: "GENESIS 분배",
      tokenTitle: "SNC 토크노믹스",
      totalSupply: "총 공급량",
      fixedSupply: "Genesis 고정 공급",
      presaleGenesis: "Genesis 프리세일",
      buyersPercent: "구매자 50%",
      mainNetwork: "메인 네트워크",
      buyWithBnb: "BNB로 구매",
      supplyLabel: "100M supply",
      totalDistribution: "총 분배",
      phase: "단계",
      liquidity: "초기 유동성",
      marketing: "마케팅",
      development: "개발",
      reserve: "준비금",
      tokenPresaleText: "50,000,000 SNC는 초기 프리세일 구매자에게 배정됩니다.",
      tokenLiquidityText: "25,000,000 SNC는 SNC/BNB 유동성 페어 생성을 위해 예약됩니다.",
      tokenMarketingText: "10,000,000 SNC는 캠페인, 추천, 커뮤니티, 성장에 사용됩니다.",
      tokenDevelopmentText: "10,000,000 SNC는 기술 지원, 웹 개선, 프로젝트 운영에 사용됩니다.",
      tokenReserveText: "5,000,000 SNC는 비상 상황, 파트너십, 미래 필요를 위해 보관됩니다.",
      mini1Title: "메인 프리세일",
      mini1Text: "공급량의 50%를 Genesis 구매자에게 배정하여 강하고 지속 가능한 프리세일을 유지합니다.",
      mini2Title: "분리된 유동성",
      mini2Text: "25%는 프리세일 토큰을 건드리지 않고 유동성 생성을 위해 예약됩니다.",
      mini3Title: "통제된 자금",
      mini3Text: "마케팅, 개발, 준비금을 분리하여 즉흥적인 매도에 의존하지 않습니다.",
      roadmapEyebrow: "확장 계획",
      roadmapTitle: "로드맵 단계",
      phase1: "1단계: 출시",
      phase2: "2단계: 커뮤니티",
      phase3: "3단계: 확장",
      phase4: "4단계: 상장 / 성장",
      howEyebrow: "작동 방식",
      howTitle: "4단계 구매",
      step1Title: "지갑 연결",
      step1Text: "모달을 열고 BNB Smart Chain 호환 지갑을 연결합니다.",
      step2Title: "BNB 입력",
      step2Text: "BNB 수량을 입력하고 SNC 및 USDT 예상치를 확인합니다.",
      step3Title: "구매 확인",
      step3Text: "서명 전에 네트워크, 금액, 수신 지갑을 확인합니다.",
      step4Title: "Genesis 기록",
      step4Text: "확인된 구매는 지갑과 txHash에 연결됩니다.",
      faqEyebrow: "FAQ",
      faqTitle: "자주 묻는 질문",
      footerCommunity: "커뮤니티",
      footerSupport: "FAQ 지원",
      legalTitle: "법적 고지",
      legalText: "모든 암호화폐 프로젝트에는 위험이 있습니다. SatoshiNakaCoin은 재정 조언이 아니며 결과, 미래 가격, 유동성 또는 수익을 보장하지 않습니다. 거래 전 네트워크, 금액, 수신 주소를 항상 확인하세요.",
      copyright: "© 2026 SatoshiNakaCoin. 모든 권리 보유.",
      walletTitle: "지갑 연결",
      walletText: "구매를 계속하려면 지갑을 선택하세요.",
      metamaskSub: "EVM 확장",
      bestSub: "추천 지갑",
      walletConnectSub: "스캔 또는 연결",
      baseSub: "Base Wallet",
      referralEyebrow: "추천하고 보상받기",
      referralTitle: "추천 링크",
      referralText: "이 링크를 공유하세요. 5%는 BNB Smart Chain에서 txHash로 구매가 확인된 경우에만 관리자 패널에 표시됩니다.",
      referralPlaceholder: "링크 생성 중...",
      close: "닫기"
    }  };

  const getLang = () => {
    const saved = window.localStorage.getItem("sncLanguage");
    return languageTexts[saved] ? saved : "ES";
  };

  state.language = getLang();

  const t = (key) => languageTexts[state.language]?.[key] || languageTexts.ES[key] || key;

  const setTextBySelector = (selector, key) => {
    const element = $(selector);
    if (element) element.textContent = t(key);
  };

  const setPlaceholderBySelector = (selector, key) => {
    const element = $(selector);
    if (element) element.setAttribute("placeholder", t(key));
  };

  const setHtmlBySelector = (selector, key) => {
    const element = $(selector);
    if (element) element.innerHTML = t(key);
  };

  const translateFaq = () => {
    const faq = {
      ES: [
        ["¿Qué es SatoshiNakaCoin?", "SatoshiNakaCoin es una moneda meme tributo inspirada en la cultura Nakamoto, creada como una preventa Genesis en BNB Smart Chain."],
        ["¿En qué red se realiza la preventa?", "La preventa se realiza en BNB Smart Chain. Antes de comprar, verifica que tu wallet esté conectada a la red correcta."],
        ["¿Con qué moneda puedo comprar SNC?", "La compra de SNC se realiza con BNB. Al ingresar la cantidad, la web muestra una estimación de los SNC que recibirás."],
        ["¿Cuál es la tasa de la preventa?", "La tasa actual de la preventa es 1 BNB = 12,500 SNC. Esta tasa puede cambiar en futuras fases del proyecto."],
        ["¿Cuándo recibiré mis tokens SNC?", "Los tokens SNC estarán asociados a la compra confirmada. El proceso de entrega o reclamo se anunciará según avance la preventa Genesis."],
        ["¿Qué pasa si compro desde un enlace de referido?", "Si compras desde un enlace de referido válido, la compra podrá quedar registrada para calcular la comisión del 5% correspondiente al referidor."],
        ["¿SNC solicita mi frase semilla?", "No. SatoshiNakaCoin nunca solicita frases semilla, claves privadas ni accesos secretos. Solo debes conectar tu wallet desde proveedores compatibles."],
        ["¿La preventa tiene riesgos?", "Sí. Toda preventa cripto implica riesgo. Verifica siempre la red, el monto, la wallet receptora y participa solo con fondos que estés dispuesto a arriesgar."],
        ["¿Dónde puedo ver el Whitepaper?", "Puedes abrir el Whitepaper desde el enlace del menú superior. El documento explica la visión Genesis, la preventa y la distribución del proyecto."]
      ],
      EN: [
        ["What is SatoshiNakaCoin?", "SatoshiNakaCoin is a tribute meme coin inspired by Nakamoto culture, created as a Genesis presale on BNB Smart Chain."],
        ["Which network is the presale on?", "The presale runs on BNB Smart Chain. Before buying, verify that your wallet is connected to the correct network."],
        ["Which coin can I use to buy SNC?", "SNC purchases are made with BNB. When you enter the amount, the website shows an estimate of the SNC you will receive."],
        ["What is the presale rate?", "The current presale rate is 1 BNB = 12,500 SNC. This rate may change in future project phases."],
        ["When will I receive my SNC tokens?", "SNC tokens are associated with the confirmed purchase. The delivery or claim process will be announced as the Genesis presale advances."],
        ["What happens if I buy through a referral link?", "If you buy through a valid referral link, the purchase may be recorded to calculate the 5% commission for the referrer."],
        ["Does SNC ask for my seed phrase?", "No. SatoshiNakaCoin never asks for seed phrases, private keys or secret access. Only connect your wallet through compatible providers."],
        ["Does the presale have risks?", "Yes. Every crypto presale involves risk. Always verify the network, amount and receiver wallet, and participate only with funds you can afford to risk."],
        ["Where can I view the Whitepaper?", "You can open the Whitepaper from the top menu link. The document explains the Genesis vision, presale and project distribution."]
      ],
      PT: [
        ["O que é SatoshiNakaCoin?", "SatoshiNakaCoin é uma moeda meme tributo inspirada na cultura Nakamoto, criada como uma pré-venda Genesis na BNB Smart Chain."],
        ["Em qual rede acontece a pré-venda?", "A pré-venda acontece na BNB Smart Chain. Antes de comprar, verifique se sua wallet está conectada à rede correta."],
        ["Com qual moeda posso comprar SNC?", "A compra de SNC é feita com BNB. Ao inserir a quantidade, o site mostra uma estimativa dos SNC que você receberá."],
        ["Qual é a taxa da pré-venda?", "A taxa atual da pré-venda é 1 BNB = 12.500 SNC. Essa taxa pode mudar em fases futuras do projeto."],
        ["Quando receberei meus tokens SNC?", "Os tokens SNC ficam associados à compra confirmada. O processo de entrega ou reivindicação será anunciado conforme a pré-venda Genesis avançar."],
        ["O que acontece se eu comprar por um link de indicação?", "Se você comprar por um link de indicação válido, a compra poderá ser registrada para calcular a comissão de 5% do indicador."],
        ["A SNC solicita minha frase semente?", "Não. SatoshiNakaCoin nunca solicita frases semente, chaves privadas ou acessos secretos. Conecte sua wallet apenas por provedores compatíveis."],
        ["A pré-venda tem riscos?", "Sim. Toda pré-venda cripto envolve risco. Verifique sempre a rede, o valor e a wallet receptora, e participe apenas com fundos que você aceita arriscar."],
        ["Onde posso ver o Whitepaper?", "Você pode abrir o Whitepaper pelo link do menu superior. O documento explica a visão Genesis, a pré-venda e a distribuição do projeto."]
      ],
      FR: [
        ["Qu'est-ce que SatoshiNakaCoin ?", "SatoshiNakaCoin est une monnaie meme hommage inspirée par la culture Nakamoto, créée comme une prévente Genesis sur BNB Smart Chain."],
        ["Sur quel réseau se déroule la prévente ?", "La prévente se déroule sur BNB Smart Chain. Avant d'acheter, vérifiez que votre wallet est connecté au bon réseau."],
        ["Avec quelle monnaie puis-je acheter SNC ?", "L'achat de SNC se fait avec BNB. Lorsque vous saisissez le montant, le site affiche une estimation des SNC que vous recevrez."],
        ["Quel est le taux de la prévente ?", "Le taux actuel de la prévente est 1 BNB = 12 500 SNC. Ce taux peut changer dans les futures phases du projet."],
        ["Quand recevrai-je mes tokens SNC ?", "Les tokens SNC sont associés à l'achat confirmé. Le processus de livraison ou de réclamation sera annoncé au fur et à mesure de l'avancement de la prévente Genesis."],
        ["Que se passe-t-il si j'achète via un lien de parrainage ?", "Si vous achetez via un lien de parrainage valide, l'achat peut être enregistré pour calculer la commission de 5% du parrain."],
        ["SNC demande-t-il ma phrase seed ?", "Non. SatoshiNakaCoin ne demande jamais de phrase seed, de clé privée ou d'accès secret. Connectez seulement votre wallet via des fournisseurs compatibles."],
        ["La prévente comporte-t-elle des risques ?", "Oui. Toute prévente crypto comporte des risques. Vérifiez toujours le réseau, le montant et le wallet récepteur, et participez uniquement avec des fonds que vous acceptez de risquer."],
        ["Où puis-je voir le Whitepaper ?", "Vous pouvez ouvrir le Whitepaper depuis le lien du menu supérieur. Le document explique la vision Genesis, la prévente et la distribution du projet."]
      ],
      ZH: [
        ["什么是 SatoshiNakaCoin？", "SatoshiNakaCoin 是受 Nakamoto 文化启发的致敬型 Meme 代币，在 BNB Smart Chain 上进行 Genesis 预售。"],
        ["预售在哪个网络进行？", "预售在 BNB Smart Chain 上进行。购买前请确认你的钱包连接到正确网络。"],
        ["可以用什么币购买 SNC？", "SNC 使用 BNB 购买。输入数量后，网站会显示预计收到的 SNC。"],
        ["预售兑换率是多少？", "当前预售兑换率为 1 BNB = 12,500 SNC。未来阶段可能调整。"],
        ["什么时候收到 SNC？", "SNC 会与已确认购买关联。领取或发放流程会随 Genesis 预售进展公布。"],
        ["通过推荐链接购买会怎样？", "通过有效推荐链接购买后，系统可记录该购买并计算推荐人的 5% 奖励。"],
        ["SNC 会要求助记词吗？", "不会。SatoshiNakaCoin 永远不会要求助记词、私钥或秘密访问权限。"],
        ["预售有风险吗？", "有。所有加密预售都有风险。请始终检查网络、金额和收款地址。"],
        ["在哪里查看白皮书？", "可以从顶部菜单打开白皮书，查看 Genesis 愿景、预售和项目分配。"]
      ],
      JA: [
        ["SatoshiNakaCoinとは？", "SatoshiNakaCoin は Nakamoto 文化に着想を得たトリビュート Meme コインで、BNB Smart Chain 上の Genesis プレセールです。"],
        ["プレセールはどのネットワークですか？", "プレセールは BNB Smart Chain で行われます。購入前に正しいネットワークを確認してください。"],
        ["どの通貨で購入できますか？", "SNC は BNB で購入できます。数量を入力すると受取予定のSNCが表示されます。"],
        ["プレセールレートは？", "現在のレートは 1 BNB = 12,500 SNC です。今後のフェーズで変更される場合があります。"],
        ["いつSNCを受け取れますか？", "SNC は確認済み購入に関連付けられます。受取または請求方法はプレセールの進行に合わせて発表されます。"],
        ["紹介リンクで購入すると？", "有効な紹介リンクから購入すると、紹介者の5%報酬計算のために記録されます。"],
        ["SNCはシードフレーズを求めますか？", "いいえ。SatoshiNakaCoin はシードフレーズや秘密鍵を要求しません。"],
        ["プレセールにリスクはありますか？", "はい。暗号資産のプレセールにはリスクがあります。ネットワーク、金額、受取先を必ず確認してください。"],
        ["ホワイトペーパーはどこで見られますか？", "上部メニューからホワイトペーパーを開けます。Genesis構想、プレセール、配分を確認できます。"]
      ],
      KO: [
        ["SatoshiNakaCoin이란?", "SatoshiNakaCoin은 Nakamoto 문화에서 영감을 받은 트리뷰트 Meme 코인이며 BNB Smart Chain의 Genesis 프리세일입니다."],
        ["프리세일은 어떤 네트워크에서 진행되나요?", "프리세일은 BNB Smart Chain에서 진행됩니다. 구매 전 올바른 네트워크인지 확인하세요."],
        ["어떤 코인으로 구매할 수 있나요?", "SNC는 BNB로 구매합니다. 수량을 입력하면 받을 SNC 예상치가 표시됩니다."],
        ["프리세일 비율은 얼마인가요?", "현재 비율은 1 BNB = 12,500 SNC 입니다. 향후 단계에서 변경될 수 있습니다."],
        ["언제 SNC를 받을 수 있나요?", "SNC는 확인된 구매와 연결됩니다. 수령 또는 클레임 절차는 프리세일 진행에 따라 공지됩니다."],
        ["추천 링크로 구매하면 어떻게 되나요?", "유효한 추천 링크로 구매하면 추천자 5% 보상 계산을 위해 기록될 수 있습니다."],
        ["SNC가 시드 문구를 요구하나요?", "아니요. SatoshiNakaCoin은 시드 문구, 개인키 또는 비밀 접근 권한을 요구하지 않습니다."],
        ["프리세일에 위험이 있나요?", "네. 모든 암호화폐 프리세일에는 위험이 있습니다. 네트워크, 금액, 수신 주소를 항상 확인하세요."],
        ["화이트페이퍼는 어디에서 볼 수 있나요?", "상단 메뉴에서 화이트페이퍼를 열 수 있습니다. Genesis 비전, 프리세일, 분배 내용을 확인할 수 있습니다."]
      ]
    };

    const list = faq[state.language] || faq.ES;
    $$(".faq-item").forEach((item, index) => {
      const question = $(".faq-question", item);
      const answer = $(".faq-answer p", item);
      const plus = question ? $("span", question) : null;
      if (question && list[index]) {
        question.childNodes[0].nodeValue = `${list[index][0]} `;
        if (plus) plus.textContent = "+";
      }
      if (answer && list[index]) answer.textContent = list[index][1];
    });
  };

  const applyLanguage = () => {
    document.documentElement.lang = state.language.toLowerCase();
    const currentLanguage = $("#currentLanguage");
    if (currentLanguage) currentLanguage.textContent = LANGUAGE_LABELS[state.language] || "ES";

    $$("#languageDropdown [data-lang]").forEach((button) => {
      button.classList.toggle("active", button.dataset.lang === state.language);
    });

    setTextBySelector(".brand-text small", "brandSubtitle");
    setTextBySelector('.nav-links a[href="#inicio"]', "navInicio");
    setTextBySelector('.nav-links a[href="#acerca"]', "navAcerca");
    setTextBySelector('.nav-links a[href="#tokenomics"]', "navTokenomics");
    setTextBySelector('.nav-links a[href="#roadmap"]', "navRoadmap");
    setTextBySelector('.nav-links a[href="#como-comprar"]', "navComoComprar");
    setTextBySelector('.nav-links a[href="#faq"]', "navFaq");
    setTextBySelector('.nav-links a[href="SNC-Whitepaper.pdf"]', "navWhitepaper");

    setTextBySelector(".hero-content > .eyebrow", "heroEyebrow");
    setTextBySelector(".hero-content h1", "heroTitle");
    setTextBySelector(".hero-description", "heroDescription");
    setTextBySelector('.hero-buttons a[href="#presale-widget"]', "heroBuy");
    setTextBySelector('.hero-buttons a[href="#como-comprar"]', "heroHow");
    setTextBySelector(".hero-stats article:nth-child(1) span", "statApy");
    setTextBySelector(".hero-stats article:nth-child(2) span", "statCommunity");
    setTextBySelector(".hero-stats article:nth-child(3) span", "statRate");

    setTextBySelector(".presale-card .presale-header .eyebrow", "presaleEyebrow");
    setTextBySelector(".presale-card .presale-header h2", "presaleTitle");
    setTextBySelector(".presale-card .status-pill", "bscReal");
    setTextBySelector(".countdown div:nth-child(1) span", "days");
    setTextBySelector(".countdown div:nth-child(2) span", "hours");
    setTextBySelector(".countdown div:nth-child(3) span", "minutes");
    setTextBySelector(".countdown div:nth-child(4) span", "seconds");
    setTextBySelector(".progress-info span", "totalRaised");
    setTextBySelector('label[for="amountInput"]', "amountBnb");
    setPlaceholderBySelector("#amountInput", "amountPlaceholder");
    setTextBySelector(".token-preview span", "receiveApprox");
    setTextBySelector("#openReferralModalButton", "referEarn");

    setTextBySelector(".trust-grid span:nth-child(1)", "trustAudit");
    setTextBySelector(".trust-grid span:nth-child(2)", "trustContract");
    setTextBySelector(".trust-grid span:nth-child(3)", "trustDashboard");
    setTextBySelector(".trust-grid span:nth-child(4)", "trustReferral");
    setTextBySelector(".trust-grid span:nth-child(5)", "trustCommunity");

    setTextBySelector("#acerca .section-heading .eyebrow", "aboutEyebrow");
    setTextBySelector("#acerca .section-heading h2", "aboutTitle");
setTextBySelector("#acerca .feature-card:nth-child(1) h3", "feature1Title");
    setTextBySelector("#acerca .feature-card:nth-child(1) p", "feature1Text");
    setTextBySelector("#acerca .feature-card:nth-child(2) h3", "feature2Title");
    setTextBySelector("#acerca .feature-card:nth-child(2) p", "feature2Text");
    setTextBySelector("#acerca .feature-card:nth-child(3) h3", "feature3Title");
    setTextBySelector("#acerca .feature-card:nth-child(3) p", "feature3Text");

    setTextBySelector("#tokenomics .tokenomics-copy .eyebrow", "tokenEyebrow");
    setTextBySelector("#tokenomics .tokenomics-copy h2", "tokenTitle");
    setTextBySelector("#tokenomics .tokenomics-highlights article:nth-child(1) span", "totalSupply");
    setTextBySelector("#tokenomics .tokenomics-highlights article:nth-child(1) small", "fixedSupply");
    setTextBySelector("#tokenomics .tokenomics-highlights article:nth-child(2) span", "presaleGenesis");
    setTextBySelector("#tokenomics .tokenomics-highlights article:nth-child(2) small", "buyersPercent");
    setTextBySelector("#tokenomics .tokenomics-highlights article:nth-child(3) span", "mainNetwork");
    setTextBySelector("#tokenomics .tokenomics-highlights article:nth-child(3) small", "buyWithBnb");
    setTextBySelector("#tokenomics .donut-center span", "supplyLabel");
    setTextBySelector("#tokenomics .token-orbit-footer div:nth-child(1) span", "totalDistribution");
    setTextBySelector("#tokenomics .token-orbit-footer div:nth-child(2) span", "phase");

    setTextBySelector("#tokenomics .token-allocation:nth-child(1) .token-allocation-top span", "presaleGenesis");
    setTextBySelector("#tokenomics .token-allocation:nth-child(1) p", "tokenPresaleText");
    setTextBySelector("#tokenomics .token-allocation:nth-child(2) .token-allocation-top span", "liquidity");
    setTextBySelector("#tokenomics .token-allocation:nth-child(2) p", "tokenLiquidityText");
    setTextBySelector("#tokenomics .token-allocation:nth-child(3) .token-allocation-top span", "marketing");
    setTextBySelector("#tokenomics .token-allocation:nth-child(3) p", "tokenMarketingText");
    setTextBySelector("#tokenomics .token-allocation:nth-child(4) .token-allocation-top span", "development");
    setTextBySelector("#tokenomics .token-allocation:nth-child(4) p", "tokenDevelopmentText");
    setTextBySelector("#tokenomics .token-allocation:nth-child(5) .token-allocation-top span", "reserve");
    setTextBySelector("#tokenomics .token-allocation:nth-child(5) p", "tokenReserveText");
    setTextBySelector("#tokenomics .tokenomics-mini-grid article:nth-child(1) strong", "mini1Title");
    setTextBySelector("#tokenomics .tokenomics-mini-grid article:nth-child(1) p", "mini1Text");
    setTextBySelector("#tokenomics .tokenomics-mini-grid article:nth-child(2) strong", "mini2Title");
    setTextBySelector("#tokenomics .tokenomics-mini-grid article:nth-child(2) p", "mini2Text");
    setTextBySelector("#tokenomics .tokenomics-mini-grid article:nth-child(3) strong", "mini3Title");
    setTextBySelector("#tokenomics .tokenomics-mini-grid article:nth-child(3) p", "mini3Text");

    setTextBySelector("#roadmap .section-heading .eyebrow", "roadmapEyebrow");
    setTextBySelector("#roadmap .section-heading h2", "roadmapTitle");
setTextBySelector("#roadmap .timeline-item:nth-child(1) h3", "phase1");
    setTextBySelector("#roadmap .timeline-item:nth-child(2) h3", "phase2");
    setTextBySelector("#roadmap .timeline-item:nth-child(3) h3", "phase3");
    setTextBySelector("#roadmap .timeline-item:nth-child(4) h3", "phase4");

    setTextBySelector("#como-comprar .section-heading .eyebrow", "howEyebrow");
    setTextBySelector("#como-comprar .section-heading h2", "howTitle");
setTextBySelector("#como-comprar .step-card:nth-child(1) h3", "step1Title");
    setTextBySelector("#como-comprar .step-card:nth-child(1) p", "step1Text");
    setTextBySelector("#como-comprar .step-card:nth-child(2) h3", "step2Title");
    setTextBySelector("#como-comprar .step-card:nth-child(2) p", "step2Text");
    setTextBySelector("#como-comprar .step-card:nth-child(3) h3", "step3Title");
    setTextBySelector("#como-comprar .step-card:nth-child(3) p", "step3Text");
    setTextBySelector("#como-comprar .step-card:nth-child(4) h3", "step4Title");
    setTextBySelector("#como-comprar .step-card:nth-child(4) p", "step4Text");

    setTextBySelector("#faq .section-heading .eyebrow", "faqEyebrow");
    setTextBySelector("#faq .section-heading h2", "faqTitle");
translateFaq();

    setTextBySelector(".site-footer h3", "footerCommunity");
    setTextBySelector('.site-footer a[href="#faq"]', "footerSupport");
    setTextBySelector(".site-footer .footer-grid > div:nth-child(3) h3", "legalTitle");
    setTextBySelector(".site-footer .footer-grid > div:nth-child(3) p", "legalText");
    setTextBySelector(".footer-bottom span", "copyright");

    setTextBySelector("#walletModalTitle", "walletTitle");
    setTextBySelector("#walletModal .modal-content > p", "walletText");
    setTextBySelector(".wallet-option-metamask small", "metamaskSub");
    setTextBySelector(".wallet-option-best small", "bestSub");
    setTextBySelector(".wallet-option-walletconnect small", "walletConnectSub");
    setTextBySelector(".wallet-option-base small", "baseSub");

    setTextBySelector("#referralModal .eyebrow", "referralEyebrow");
    setTextBySelector("#referralModalTitle", "referralTitle");
    setHtmlBySelector("#referralModal .referral-copy", "referralText");
    setPlaceholderBySelector("#referralLinkInput", "referralPlaceholder");
    setTextBySelector(".referral-close-btn", "close");

    const languageAwareWalletText = state.walletConnected && state.account
      ? `${shortAddress(state.account)} · BSC`
      : t("connectWallet");

    $$(".open-wallet").forEach((button) => {
      button.textContent = languageAwareWalletText;
    });

    const currentBuyButton = $("#buyButton");
    if (currentBuyButton) {
      currentBuyButton.textContent = state.walletConnected ? t("buySnc") : t("connectWallet");
    }
  };

  const languageMenu = $("#languageMenu");
  const languageToggle = $("#languageToggle");
  const languageDropdown = $("#languageDropdown");

  if (languageToggle && languageMenu) {
    languageToggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isOpen = languageMenu.classList.toggle("open");
      languageToggle.setAttribute("aria-expanded", String(isOpen));
    });
  }

  $$("#languageDropdown [data-lang]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const selected = button.dataset.lang;
      if (!languageTexts[selected]) return;
      state.language = selected;
      window.localStorage.setItem("sncLanguage", selected);
      if (languageMenu) languageMenu.classList.remove("open");
      if (languageToggle) languageToggle.setAttribute("aria-expanded", "false");
      try { applyLanguage(); } catch (error) { console.warn("Error aplicando idioma:", error); }
    });
  });

  document.addEventListener("click", (event) => {
    if (!languageDropdown || !languageMenu || !languageToggle) return;
    if (languageMenu.contains(event.target)) return;
    languageMenu.classList.remove("open");
    languageToggle.setAttribute("aria-expanded", "false");
  });

  try { applyLanguage(); } catch (error) { console.warn("Error aplicando idioma inicial:", error); }

  /* Header y menú responsive */
  const siteHeader = $("#siteHeader");
  const menuToggle = $("#menuToggle");
  const navMenu = $("#navMenu");

  let lockedMenuScrollY = 0;

  const lockPageForMobileMenu = () => {
    if (document.body.classList.contains("menu-open")) return;

    lockedMenuScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.classList.add("menu-open");
    document.body.style.position = "fixed";
    document.body.style.top = `-${lockedMenuScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  };

  const unlockPageFromMobileMenu = () => {
    if (!document.body.classList.contains("menu-open")) return;

    document.body.classList.remove("menu-open");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, lockedMenuScrollY);
  };

  const closeMenu = () => {
    if (!menuToggle || !navMenu) return;
    menuToggle.classList.remove("active");
    navMenu.classList.remove("active");
    menuToggle.setAttribute("aria-expanded", "false");
    if (languageMenu && languageToggle) {
      languageMenu.classList.remove("open");
      languageToggle.setAttribute("aria-expanded", "false");
    }
    unlockPageFromMobileMenu();
  };

  const toggleMenu = () => {
    if (!menuToggle || !navMenu) return;
    const isOpen = !navMenu.classList.contains("active");

    navMenu.classList.toggle("active", isOpen);
    menuToggle.classList.toggle("active", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));

    if (isOpen) {
      lockPageForMobileMenu();
    } else {
      closeMenu();
    }
  };

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1120) closeMenu();
  });

  if (menuToggle) {
    menuToggle.addEventListener("click", toggleMenu);
  }

  $$(".nav-links a, .nav-actions a").forEach((link) => {
    link.addEventListener("click", () => {
      closeMenu();
    });
  });

  window.addEventListener("scroll", () => {
    if (!siteHeader) return;
    siteHeader.classList.toggle("scrolled", window.scrollY > 20);
  });

  /* Scroll suave con offset del header */
  $$('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      const targetId = anchor.getAttribute("href");

      if (!targetId || targetId === "#") {
        event.preventDefault();
        return;
      }

      const target = $(targetId);
      if (!target) return;

      event.preventDefault();

      const headerHeight = siteHeader ? siteHeader.offsetHeight : 80;
      const isHome = targetId === "#inicio";
      const isMobile = window.matchMedia("(max-width: 760px)").matches;

      /*
        Ajuste extra para que, al navegar desde el menú, el contenido de cada
        sección quede visible cerca del header y no aparezca demasiado espacio vacío arriba.
      */
      const isTokenomics = targetId === "#tokenomics";
      const baseSectionVisualOffset = isMobile ? 57 : 91;
      const sectionVisualOffset = isHome ? 0 : isTokenomics ? baseSectionVisualOffset : baseSectionVisualOffset + 15;
      const targetPosition = isHome
        ? 0
        : target.getBoundingClientRect().top + window.scrollY - headerHeight + sectionVisualOffset;

      window.scrollTo({
        top: Math.max(targetPosition, 0),
        behavior: "smooth"
      });
    });
  });

  /* Animaciones al aparecer */
  const revealElements = $$(".reveal");
  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.14 }
    );

    revealElements.forEach((element) => revealObserver.observe(element));
  } else {
    revealElements.forEach((element) => element.classList.add("visible"));
  }

  /* Contador regresivo */
  const countdownStartedAt = Date.now();
  const countdownInitial = {
    days: Number(CONFIG.countdownDays || 0),
    hours: Number(CONFIG.countdownHours || 0),
    minutes: Number(CONFIG.countdownMinutes || 0),
    seconds: Number(CONFIG.countdownSeconds || 0)
  };
  const countdownTotalSeconds =
    countdownInitial.days * 24 * 60 * 60 +
    countdownInitial.hours * 60 * 60 +
    countdownInitial.minutes * 60 +
    countdownInitial.seconds;

  const normalizeCountdown = (remainingSeconds) => {
    let secondsLeft = Math.max(Number(remainingSeconds || 0), 0);
    const days = Math.floor(secondsLeft / (24 * 60 * 60));
    secondsLeft -= days * 24 * 60 * 60;
    const hours = Math.floor(secondsLeft / (60 * 60));
    secondsLeft -= hours * 60 * 60;
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft - minutes * 60;
    return { days, hours, minutes, seconds };
  };

  const updateCountdown = () => {
    const elapsedSeconds = Math.floor((Date.now() - countdownStartedAt) / 1000);
    const remainingSeconds = Math.max(countdownTotalSeconds - elapsedSeconds, 0);
    const values = elapsedSeconds === 0 ? countdownInitial : normalizeCountdown(remainingSeconds);

    Object.entries(values).forEach(([id, value]) => {
      const element = $(`#${id}`);
      if (element) element.textContent = String(value).padStart(2, "0");
    });
  };

  updateCountdown();
  setInterval(updateCountdown, 1000);

  /* Barra de progreso de preventa en USDT */
  const saleProgress = $("#saleProgress");
  const raisedAmount = $("#raisedAmount");

  const updateRaisedDisplay = () => {
    const goalBnb = getPresaleGoalBnb();
    const raisedBnb = Number(CONFIG.raisedBnb || 0);
    const progressPercent = goalBnb > 0 ? Math.min((raisedBnb / goalBnb) * 100, 100) : 0;
    const raisedUsdt = raisedBnb * state.bnbUsdtPrice;
    const goalUsdt = goalBnb * state.bnbUsdtPrice;

    if (raisedAmount) {
      raisedAmount.textContent = `${formatUsdtTotal(raisedUsdt)} USDT / ${formatUsdtTotal(goalUsdt)} USDT`;
      raisedAmount.setAttribute("title", "Total global recaudado por todas las compras confirmadas");
    }

    if (saleProgress) {
      const visualProgress = raisedBnb > 0 && progressPercent > 0 && progressPercent < 1 ? 1.8 : progressPercent;
      saleProgress.style.width = `${visualProgress}%`;
      saleProgress.setAttribute("aria-valuenow", String(progressPercent.toFixed(6)));
    }
  };

  const loadPresaleStats = async () => {
    try {
      // Este total es GLOBAL: suma todas las compras confirmadas guardadas en PostgreSQL.
      const data = await apiRequest("/presale/stats");

      if (Number.isFinite(Number(data.raisedBnb))) {
        CONFIG.raisedBnb = Number(data.raisedBnb);
      }

      if (Number(data.sncPerBnb) > 0) {
        CONFIG.sncPerBnb = Number(data.sncPerBnb);
      }

      if (Number(data.presaleTokensForSale) > 0) {
        CONFIG.presaleTokensForSale = Number(data.presaleTokensForSale);
      }

      updateRaisedDisplay();
    } catch (error) {
      console.warn("No se pudo cargar el total recaudado:", error.message);
      CONFIG.raisedBnb = Number(CONFIG.raisedBnb || 0);
      updateRaisedDisplay();
    }
  };

  updateRaisedDisplay();
  loadPublicBackendConfig();
  loadPresaleStats();

  /* Detección EIP-6963 para múltiples wallets instaladas */
  window.addEventListener("eip6963:announceProvider", (event) => {
    const providerDetail = event.detail;
    if (!providerDetail || !providerDetail.provider) return;

    const alreadyAdded = state.discoveredProviders.some((item) => item.uuid === providerDetail.info?.uuid);
    if (!alreadyAdded) state.discoveredProviders.push(providerDetail);
  });

  window.dispatchEvent(new Event("eip6963:requestProvider"));

  const getInjectedProviders = () => {
    const providers = [];

    state.discoveredProviders.forEach((item) => {
      providers.push({
        provider: item.provider,
        name: item.info?.name || "",
        rdns: item.info?.rdns || ""
      });
    });

    if (window.ethereum?.providers?.length) {
      window.ethereum.providers.forEach((provider) => {
        providers.push({ provider, name: "", rdns: "" });
      });
    } else if (window.ethereum) {
      providers.push({ provider: window.ethereum, name: "", rdns: "" });
    }

    return providers;
  };

  const findInjectedProvider = (walletType) => {
    const providers = getInjectedProviders();

    if (!providers.length) return null;

    const includes = (value, keyword) => String(value || "").toLowerCase().includes(keyword);

    if (walletType === "metamask") {
      return (
        providers.find((item) => item.provider?.isMetaMask || includes(item.name, "metamask"))?.provider ||
        null
      );
    }

    if (walletType === "best") {
      return (
        providers.find(
          (item) =>
            item.provider?.isBestWallet ||
            item.provider?.isBestWalletProvider ||
            includes(item.name, "best") ||
            includes(item.rdns, "best")
        )?.provider || null
      );
    }

    if (walletType === "base") {
      return (
        providers.find(
          (item) =>
            item.provider?.isCoinbaseWallet ||
            includes(item.name, "coinbase") ||
            includes(item.name, "base") ||
            includes(item.rdns, "coinbase")
        )?.provider || null
      );
    }

    return providers[0]?.provider || null;
  };

  const ensureBscNetwork = async (provider) => {
    const activeChainId = await provider.request({ method: "eth_chainId" }).catch(() => null);

    if (String(activeChainId).toLowerCase() === CONFIG.bsc.chainId.toLowerCase()) {
      return true;
    }

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CONFIG.bsc.chainId }]
      });
      return true;
    } catch (switchError) {
      const shouldAddNetwork =
        switchError?.code === 4902 ||
        String(switchError?.message || "").toLowerCase().includes("unrecognized") ||
        String(switchError?.message || "").toLowerCase().includes("not added");

      if (!shouldAddNetwork) throw switchError;

      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CONFIG.bsc.chainId,
            chainName: CONFIG.bsc.chainName,
            nativeCurrency: CONFIG.bsc.nativeCurrency,
            rpcUrls: CONFIG.bsc.rpcUrls,
            blockExplorerUrls: CONFIG.bsc.blockExplorerUrls
          }
        ]
      });

      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CONFIG.bsc.chainId }]
      });

      return true;
    }
  };

  const walletAddressText = $("#walletAddressText");
  const networkStatusText = $("#networkStatusText");
  const walletModal = $("#walletModal");
  const walletMessage = $("#walletMessage");
  const openWalletButtons = $$(".open-wallet");
  
  const referralButton = $("#openReferralModalButton");
  const referralModal = $("#referralModal");
  const referralLinkInput = $("#referralLinkInput");
  const copyReferralLink = $("#copyReferralLink");
  const referralMessage = $("#referralMessage");
  const closeReferralButtons = $$("[data-close-referral]");
  const walletOptions = $$("[data-wallet]");
  const closeWalletButtons = $$("[data-close-modal]");
  const purchaseMessage = $("#purchaseMessage");
  const buyButton = $("#buyButton");
  const sncBalanceChip = $("#sncBalanceChip");
  const sncBalanceValue = $("#sncBalanceValue");

  const openWalletModal = () => {
    if (!walletModal) return;
    walletModal.classList.add("active");
    walletModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (walletMessage) {
      walletMessage.textContent = "";
      walletMessage.classList.remove("success", "error");
    }
  };

  const closeWalletModal = () => {
    if (!walletModal) return;
    walletModal.classList.remove("active");
    walletModal.setAttribute("aria-hidden", "true");
    if (!$("#whitepaperModal")?.classList.contains("active")) {
      document.body.classList.remove("modal-open");
    }
  };

  const updateSncBalanceChip = () => {
    if (!sncBalanceValue) return;

    if (!state.walletConnected) {
      sncBalanceValue.textContent = "0 SNC";
      if (sncBalanceChip) {
        sncBalanceChip.title = "Conecta tu wallet para ver cuántos SNC has comprado";
      }
      return;
    }

    sncBalanceValue.textContent = formatPurchasedSnc(state.sncPurchased);

    if (sncBalanceChip) {
      const purchasesText = state.sncPurchaseCount === 1 ? "1 compra" : `${state.sncPurchaseCount} compras`;
      sncBalanceChip.title = `Wallet: ${shortAddress(state.account)} · ${purchasesText} · Total comprado: ${formatPurchasedSnc(state.sncPurchased)}`;
    }
  };

  const loadWalletPurchasedSNC = async () => {
    if (!state.walletConnected || !isValidAddress(state.account)) {
      state.sncPurchased = 0;
      state.sncPurchaseCount = 0;
      updateSncBalanceChip();
      return;
    }

    try {
      const result = await apiRequest(`/wallet-summary/${state.account}`);
      state.sncPurchased = Number(result.totalPurchasedSnc || 0);
      state.sncPurchaseCount = Number(result.purchaseCount || 0);
    } catch (error) {
      console.warn("No se pudo cargar el total de SNC comprados:", error.message);
      state.sncPurchased = 0;
      state.sncPurchaseCount = 0;
    }

    updateSncBalanceChip();
  };

  const updateWalletButtons = () => {
    const text = state.walletConnected
      ? `${shortAddress(state.account)} · BSC`
      : t("connectWallet");

    document.body.classList.toggle("wallet-connected", state.walletConnected);

    if (referralButton) {
      referralButton.hidden = !state.walletConnected;
      referralButton.disabled = !state.walletConnected;
    }

    if (
      state.walletConnected &&
      isValidAddress(state.referralAddress) &&
      state.account &&
      state.referralAddress.toLowerCase() === state.account.toLowerCase()
    ) {
      state.referralAddress = "";
      window.localStorage.removeItem("sncReferralRef");
    }

    openWalletButtons.forEach((button) => {
      button.textContent = text;
      button.classList.toggle("connected", state.walletConnected);
    });

    if (buyButton) {
      buyButton.textContent = state.walletConnected ? t("buySnc") : t("connectWallet");
      buyButton.classList.toggle("connected", state.walletConnected);
    }

    if (walletAddressText) {
      walletAddressText.textContent = state.walletConnected
        ? `${state.walletName}: ${shortAddress(state.account)}`
        : "No conectada";
    }

    if (networkStatusText) {
      networkStatusText.textContent = state.walletConnected
        ? "Conectado en BNB Smart Chain"
        : "Red objetivo: BNB Smart Chain";
    }

    updateSncBalanceChip();
  };

  const registerProviderEvents = (provider) => {
    if (!provider?.on) return;

    provider.on("accountsChanged", async (accounts) => {
      const account = accounts?.[0] || "";
      state.account = account;
      state.walletConnected = Boolean(account);
      updateWalletButtons();

      if (!account) {
        state.sncPurchased = 0;
        state.sncPurchaseCount = 0;
        updateSncBalanceChip();
        setMessage(purchaseMessage, "Wallet desconectada.", "error");
        return;
      }

      await loadWalletPurchasedSNC();
    });

    provider.on("chainChanged", (chainId) => {
      if (String(chainId).toLowerCase() !== CONFIG.bsc.chainId.toLowerCase()) {
        setMessage(purchaseMessage, "Cambia nuevamente a BNB Smart Chain para comprar.", "error");
        if (networkStatusText) networkStatusText.textContent = `Red actual: ${chainId}`;
      } else if (networkStatusText) {
        networkStatusText.textContent = "Conectado en BNB Smart Chain";
      }
    });

    provider.on("disconnect", () => {
      state.walletConnected = false;
      state.account = "";
      state.provider = null;
      state.sncPurchased = 0;
      state.sncPurchaseCount = 0;
      updateWalletButtons();
    });
  };

  const finishWalletConnection = async (provider, walletName) => {
    setMessage(walletMessage, "Solicitando autorización de wallet...", "success");

    const accounts = await provider.request({ method: "eth_requestAccounts" });

    if (!accounts || !accounts[0]) {
      throw new Error("No se recibió ninguna cuenta de wallet.");
    }

    await ensureBscNetwork(provider);

    state.provider = provider;
    state.account = accounts[0];
    state.walletName = walletName;
    state.walletConnected = true;

    registerProviderEvents(provider);
    updateWalletButtons();
    await loadWalletPurchasedSNC();

    setMessage(walletMessage, `${walletName} conectada en BNB Smart Chain.`, "success");
    window.setTimeout(closeWalletModal, 750);
  };

  const connectInjectedWallet = async (walletType, walletName) => {
    const provider = findInjectedProvider(walletType);

    if (!provider) {
      if (walletType === "best") {
        setMessage(walletMessage, "Best Wallet no fue detectada. Abriendo WalletConnect como alternativa.", "error");
        await connectWalletConnect("Best Wallet / WalletConnect");
        return;
      }

      throw new Error(`No se detectó ${walletName}. Instala la extensión o usa WalletConnect.`);
    }

    await finishWalletConnection(provider, walletName);
  };

  const connectWalletConnect = async (walletName = "WalletConnect") => {
    if (
      !CONFIG.walletConnectProjectId ||
      CONFIG.walletConnectProjectId === "WALLETCONNECT_PROJECT_ID"
    ) {
      throw new Error("Falta configurar WALLETCONNECT_PROJECT_ID en script.js.");
    }

    setMessage(walletMessage, "Cargando WalletConnect...", "success");

    const walletConnectModule = await import("https://esm.sh/@walletconnect/ethereum-provider@2.23.7");
    const EthereumProvider = walletConnectModule.default || walletConnectModule.EthereumProvider;

    const provider = await EthereumProvider.init({
      projectId: CONFIG.walletConnectProjectId,
      chains: [CONFIG.bsc.chainIdDecimal],
      optionalChains: [CONFIG.bsc.chainIdDecimal],
      showQrModal: true,
      rpcMap: {
        [CONFIG.bsc.chainIdDecimal]: CONFIG.bsc.rpcUrls[0]
      },
      metadata: {
        name: CONFIG.appName,
        description: "SatoshiNakaCoin Genesis Presale en BNB Smart Chain",
        url: window.location.origin || "https://satoshinakacoin.local",
        icons: [`${window.location.origin}/download.png`]
      }
    });

    await provider.connect();
    await finishWalletConnection(provider, walletName);
  };

  const connectBaseWallet = async () => {
    const injectedCoinbase = findInjectedProvider("base");

    if (injectedCoinbase) {
      await finishWalletConnection(injectedCoinbase, "Base Wallet");
      return;
    }

    setMessage(walletMessage, "Cargando Base Wallet...", "success");

    const coinbaseModule = await import("https://esm.sh/@coinbase/wallet-sdk@4");
    const CoinbaseWalletSDK = coinbaseModule.CoinbaseWalletSDK || coinbaseModule.default;

    const sdk = new CoinbaseWalletSDK({
      appName: CONFIG.appName,
      appLogoUrl: `${window.location.origin}/download.png`
    });

    const provider = sdk.makeWeb3Provider();
    await finishWalletConnection(provider, "Base Wallet");
  };

  const handleWalletConnection = async (walletType) => {
    try {
      if (walletType === "metamask") {
        await connectInjectedWallet("metamask", "MetaMask");
        return;
      }

      if (walletType === "best") {
        await connectInjectedWallet("best", "Best Wallet");
        return;
      }

      if (walletType === "walletconnect") {
        await connectWalletConnect("WalletConnect");
        return;
      }

      if (walletType === "base") {
        await connectBaseWallet();
      }
    } catch (error) {
      setMessage(walletMessage, error?.message || "No se pudo conectar la wallet.", "error");
    }
  };

  openWalletButtons.forEach((button) => {
    button.addEventListener("click", openWalletModal);
  });

  closeWalletButtons.forEach((button) => {
    button.addEventListener("click", closeWalletModal);
  });

  walletOptions.forEach((button) => {
    button.addEventListener("click", () => {
      handleWalletConnection(button.dataset.wallet);
    });
  });

  updateWalletButtons();

  /* Compra real en BNB Smart Chain */
  const buyForm = $("#buyForm");
  const currencySelect = $("#currencySelect");
  const amountInput = $("#amountInput");
  const currencyBadge = $("#currencyBadge");
  const tokensOutput = $("#tokensOutput");
  const bnbUsdtConverter = $("#bnbUsdtConverter");

  const updateTokenPreview = () => {
    if (!amountInput || !tokensOutput) return;

    const amount = Number(amountInput.value);

    if (currencyBadge) currencyBadge.textContent = "BNB";

    if (!amount || amount <= 0) {
      tokensOutput.textContent = "0 SNC";
      if (bnbUsdtConverter) bnbUsdtConverter.innerHTML = "≈ <strong>0.00 USDT</strong>";
      return;
    }

    const tokens = amount * CONFIG.sncPerBnb;
    const usdtValue = amount * state.bnbUsdtPrice;

    tokensOutput.textContent = `${formatToken(tokens)} SNC`;
    if (bnbUsdtConverter) {
      bnbUsdtConverter.innerHTML = `≈ <strong>${formatUsdt(usdtValue)} USDT</strong>`;
    }
  };

  if (currencySelect) {
    currencySelect.addEventListener("change", () => {
      updateTokenPreview();
      setMessage(purchaseMessage, "BNB Smart Chain seleccionada.", "success");
    });
  }

  if (amountInput) {
    amountInput.addEventListener("input", () => {
      updateTokenPreview();
      if (purchaseMessage) {
        purchaseMessage.textContent = "";
        purchaseMessage.classList.remove("success", "error");
      }
    });
  }

  if (buyForm) {
    buyForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const amount = Number(amountInput ? amountInput.value : 0);

      if (!state.walletConnected || !state.provider || !state.account) {
        openWalletModal();
        setMessage(walletMessage, "Conecta una wallet para continuar con la compra de SNC.", "success");
        return;
      }

      if (!amount || amount <= 0) {
        setMessage(purchaseMessage, "Ingresa una cantidad de BNB mayor a cero.", "error");
        if (amountInput) amountInput.focus();
        return;
      }

      if (amount < 0.0001) {
        setMessage(purchaseMessage, "La compra mínima configurada es 0.0001 BNB.", "error");
        return;
      }

      if (amount > 1000) {
        setMessage(purchaseMessage, "La cantidad es demasiado alta. Reduce el monto para continuar.", "error");
        return;
      }

      if (!isReceiverConfigured()) {
        setMessage(
          purchaseMessage,
          "Falta configurar SALE_RECEIVER_ADDRESS en script.js. No se enviará BNB hasta poner una dirección real.",
          "error"
        );
        return;
      }

      try {
        await ensureBscNetwork(state.provider);

        const valueWei = parseUnits(amountInput.value, 18);
        const tokens = amount * CONFIG.sncPerBnb;

        setMessage(purchaseMessage, "Abre tu wallet y revisa red, monto y dirección antes de firmar...", "success");

        const txParams = {
          from: state.account,
          to: CONFIG.saleReceiverAddress,
          value: toHex(valueWei)
        };

        if (isValidReferralValue(state.referralAddress)) {
          txParams.data = textToHex(`SNC_REF:${state.referralAddress}`);
        }

        const txHash = await state.provider.request({
          method: "eth_sendTransaction",
          params: [txParams]
        });

        const explorerUrl = `${CONFIG.bsc.blockExplorerUrls[0]}/tx/${txHash}`;

        setHtmlMessage(
          purchaseMessage,
          `Compra enviada. Esperando confirmación en BNB Smart Chain... <a href="${explorerUrl}" target="_blank" rel="noopener">Ver transacción</a>`,
          "success"
        );

        try {
          await registerPurchaseUntilConfirmed({
            txHash,
            buyerWallet: state.account,
            ref: state.referralAddress || ""
          });

          await loadWalletPurchasedSNC();

          setHtmlMessage(
            purchaseMessage,
            `Compra confirmada: ${formatBnb(amount)} BNB ≈ ${formatToken(tokens)} SNC. El total recaudado ya fue actualizado. <a href="${explorerUrl}" target="_blank" rel="noopener">Ver transacción</a>`,
            "success"
          );
        } catch (backendError) {
          console.warn("Compra enviada, pero el backend aún no pudo registrarla:", backendError.message);
          setHtmlMessage(
            purchaseMessage,
            `Compra enviada, pero aún no fue confirmada por el backend. Revisa la transacción y recarga la página en unos minutos. <a href="${explorerUrl}" target="_blank" rel="noopener">Ver transacción</a>`,
            "success"
          );
        }

        if (amountInput) amountInput.value = "";
        updateTokenPreview();
      } catch (error) {
        setMessage(
          purchaseMessage,
          error?.message || "La transacción fue cancelada o no pudo enviarse.",
          "error"
        );
      }
    });
  }


  const loadBnbUsdtPrice = async () => {
    if (!CONFIG.bnbUsdtPriceUrl) return;

    try {
      const response = await fetch(CONFIG.bnbUsdtPriceUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo cargar el precio BNB/USDT.");

      const data = await response.json();
      const price = Number(data.price);

      if (Number.isFinite(price) && price > 0) {
        state.bnbUsdtPrice = price;
        updateTokenPreview();
        updateRaisedDisplay();
      }
    } catch (error) {
      state.bnbUsdtPrice = CONFIG.bnbUsdtFallback;
      updateTokenPreview();
      updateRaisedDisplay();
    }
  };

  updateTokenPreview();
  updateRaisedDisplay();
  updateSncBalanceChip();
  loadBnbUsdtPrice();

  /* Recompensas / staking visual */
  const stakeInput = $("#stakeInput");
  const stakeButton = $("#stakeButton");
  const claimButton = $("#claimButton");
  const rewardsButton = $("#rewardsButton");
  const stakingMessage = $("#stakingMessage");
  const stakedAmount = $("#stakedAmount");
  const rewardAmount = $("#rewardAmount");

  const updateStakingUI = () => {
    if (stakedAmount) stakedAmount.textContent = `${formatToken(state.staked)} SNC`;
    if (rewardAmount) rewardAmount.textContent = `${formatToken(state.rewards)} SNC`;
  };

  if (stakeButton) {
    stakeButton.addEventListener("click", () => {
      const amount = Number(stakeInput ? stakeInput.value : 0);

      if (!amount || amount <= 0) {
        setMessage(stakingMessage, "Ingresa una cantidad válida para stakear.", "error");
        if (stakeInput) stakeInput.focus();
        return;
      }

      state.staked += amount;
      state.rewards += amount * 0.018;
      updateStakingUI();
      setMessage(stakingMessage, `Stake Genesis registrado: ${formatToken(amount)} SNC.`, "success");
      if (stakeInput) stakeInput.value = "";
    });
  }

  if (claimButton) {
    claimButton.addEventListener("click", () => {
      if (state.rewards <= 0) {
        setMessage(stakingMessage, "Aún no hay recompensas disponibles para reclamar.", "error");
        return;
      }

      const claimed = state.rewards;
      state.rewards = 0;
      updateStakingUI();
      setMessage(stakingMessage, `Reclamaste ${formatToken(claimed)} SNC en modo Genesis.`, "success");
    });
  }

  if (rewardsButton) {
    rewardsButton.addEventListener("click", () => {
      if (state.staked <= 0) {
        setMessage(stakingMessage, "Stakea SNC para generar recompensas Genesis.", "error");
        return;
      }

      const bonus = Math.max(state.staked * 0.006, 1);
      state.rewards += bonus;
      updateStakingUI();
      setMessage(stakingMessage, `Recompensa actualizada: +${formatToken(bonus)} SNC.`, "success");
    });
  }

  updateStakingUI();

  /* FAQ acordeón */
  $$(".faq-question").forEach((question) => {
    question.addEventListener("click", () => {
      const item = question.closest(".faq-item");
      const answer = item ? $(".faq-answer", item) : null;
      const isOpen = item ? item.classList.contains("active") : false;

      $$(".faq-item").forEach((faqItem) => {
        const faqAnswer = $(".faq-answer", faqItem);
        const faqQuestion = $(".faq-question", faqItem);

        faqItem.classList.remove("active");
        if (faqAnswer) faqAnswer.style.maxHeight = null;
        if (faqQuestion) faqQuestion.setAttribute("aria-expanded", "false");
      });

      if (!isOpen && item && answer) {
        item.classList.add("active");
        answer.style.maxHeight = `${answer.scrollHeight}px`;
        question.setAttribute("aria-expanded", "true");
      }
    });
  });

  /* Modal whitepaper: el PDF se abre en una pestaña nueva */
  const whitepaperModal = $("#whitepaperModal");
  const openWhitepaper = $("#openWhitepaper");
  const closeWhitepaperButtons = $$("[data-close-whitepaper]");

  const openWhitepaperModal = () => {
    if (!whitepaperModal) return;
    whitepaperModal.classList.add("active");
    whitepaperModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  };

  const closeWhitepaperModal = () => {
    if (!whitepaperModal) return;
    whitepaperModal.classList.remove("active");
    whitepaperModal.setAttribute("aria-hidden", "true");
    if (!walletModal?.classList.contains("active")) {
      document.body.classList.remove("modal-open");
    }
  };

  if (openWhitepaper) {
    openWhitepaper.addEventListener("click", openWhitepaperModal);
  }

  closeWhitepaperButtons.forEach((button) => {
    button.addEventListener("click", closeWhitepaperModal);
  });

  /* Referidos integrados: genera el enlace sin abrir otro panel */
  const cleanCurrentPageUrl = () => {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    return url.toString();
  };

  const openReferralModal = () => {
    if (!referralModal) return;
    referralModal.classList.add("active");
    referralModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  };

  const closeReferralModal = () => {
    if (!referralModal) return;
    referralModal.classList.remove("active");
    referralModal.setAttribute("aria-hidden", "true");

    const anyModalOpen = Boolean(
      $("#walletModal")?.classList.contains("active") ||
      $("#whitepaperModal")?.classList.contains("active")
    );

    if (!anyModalOpen) document.body.classList.remove("modal-open");
  };

  const generateReferralLink = async (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!state.walletConnected || !isValidAddress(state.account)) {
      openWalletModal();
      setMessage(walletMessage, state.language === "EN" ? "Connect your wallet to generate your referral link." : state.language === "PT" ? "Conecte sua wallet para gerar seu link de indicação." : state.language === "FR" ? "Connectez votre wallet pour générer votre lien de parrainage." : "Conecta tu wallet para generar tu enlace de referido.", "success");
      return;
    }

    try {
      if (referralLinkInput) referralLinkInput.value = t("referralPlaceholder");
      setMessage(referralMessage, state.language === "EN" ? "Generating link with your wallet..." : state.language === "PT" ? "Gerando link com sua wallet..." : state.language === "FR" ? "Génération du lien avec votre wallet..." : "Generando enlace con tu wallet...", "success");
      openReferralModal();

      const data = await apiRequest("/referrals/create", {
        method: "POST",
        body: {
          wallet: state.account,
          pageUrl: cleanCurrentPageUrl()
        }
      });

      if (referralLinkInput) referralLinkInput.value = data.referralUrl || "";
      setMessage(
        referralMessage,
        state.language === "EN" ? "Ready. When someone buys through this link, the commission will appear in SNC | Admin." : state.language === "PT" ? "Pronto. Quando alguém comprar por este link, a comissão aparecerá em SNC | Admin." : state.language === "FR" ? "Prêt. Quand quelqu’un achète via ce lien, la commission apparaît dans SNC | Admin." : "Listo. Cuando alguien compre desde este enlace, la comisión aparecerá en SNC | Admin.",
        "success"
      );
    } catch (error) {
      if (referralLinkInput) referralLinkInput.value = "";
      setMessage(referralMessage, error.message || state.language === "EN" ? "Could not generate the referral link." : state.language === "PT" ? "Não foi possível gerar o link de indicação." : state.language === "FR" ? "Impossible de générer le lien de parrainage." : "No se pudo generar el enlace de referido.", "error");
    }
  };

  if (referralButton) {
    referralButton.setAttribute("type", "button");
    referralButton.addEventListener("click", generateReferralLink);
  }

  if (copyReferralLink) {
    copyReferralLink.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const value = String(referralLinkInput?.value || "").trim();

      if (!value || value === t("referralPlaceholder")) {
        setMessage(referralMessage, state.language === "EN" ? "Generate your link first." : state.language === "PT" ? "Gere seu link primeiro." : state.language === "FR" ? "Générez d’abord votre lien." : "Primero genera tu enlace.", "error");
        return;
      }

      try {
        await navigator.clipboard.writeText(value);
        setMessage(referralMessage, state.language === "EN" ? "Link copied successfully." : state.language === "PT" ? "Link copiado corretamente." : state.language === "FR" ? "Lien copié avec succès." : "Enlace copiado correctamente.", "success");
      } catch (error) {
        if (referralLinkInput) {
          referralLinkInput.select();
          document.execCommand("copy");
        }
        setMessage(referralMessage, state.language === "EN" ? "Link copied." : state.language === "PT" ? "Link copiado." : state.language === "FR" ? "Lien copié." : "Enlace copiado.", "success");
      }
    });
  }

  closeReferralButtons.forEach((button) => {
    button.addEventListener("click", closeReferralModal);
  });

  /* Cierre de modales con Escape */
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeWalletModal();
    closeWhitepaperModal();
    closeReferralModal();
    closeMenu();
  });
});
