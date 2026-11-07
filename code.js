/*
 * IG Checker v3.3 — refatorado com funções separadas e comentadas
 *
 * MUDANÇAS DA v3.3:
 *  - Unfollow usa primeiro /api/v1/web/friendships/{id}/unfollow/ (endpoint do site);
 *    o antigo /friendships/destroy/ devolvia a página HTML de erro e fica só como alternativa
 *  - Adicionado o cabeçalho x-ig-d: www
 *  - removeFollowerById não conta mais uma resposta HTML como sucesso
 *
 * MUDANÇAS DA v3.2:
 *  - O alerta de erro do unfollow agora inclui um resumo da resposta do Instagram
 *    (destroy + show), para mostrar o motivo real da falha
 *  - Detecção de HTML sem diferenciar maiúsculas e tratamento do prefixo "for (;;);"
 *
 * MUDANÇAS DA v3.1:
 *  - Cabeçalhos completos (x-ig-www-claim, x-instagram-ajax) nos POSTs de
 *    unfollow / remover seguidor (getIgHeaders)
 *  - console.log da resposta de cada POST para diagnóstico (F12 > Console)
 *  - Intervalo aleatório entre ações (evita bloqueio por ação em massa)
 *  - A ação usa apenas os IDs selecionados da lista ativa (a seleção não
 *    "vaza" mais entre Seguindo / Seguidores / Não seguem)
 *  - Seleção é limpa ao trocar de lista
 *  - Cache é limpo após executar a ação
 *
 * ESTRUTURA GERAL:
 *  0. Configuração
 *  1. Utilitários (sleep, randomDelay, parseCookies, getIgHeaders)
 *  2. API do Instagram (fetchGraphqlPage, fetchAllPages, unfollowById, removeFollowerById)
 *  3. Construção da UI (buildShell, injectSpinnerStyles)
 *  4. Renderização de cards de estatísticas (renderStatCards)
 *  5. Renderização da lista de usuários (createUserRow)
 *  6. "Selecionar Todos" (renderSelectAllButton)
 *  7. Lógica dos botões de ação (wireExportButton, wireActionButton)
 *  8. Orquestrador principal (igChecker)
 */

(async function igChecker() {

  // ─────────────────────────────────────────────
  // 0. CONFIGURAÇÃO
  // ─────────────────────────────────────────────

  const CONFIG = {
    pageDelayMs:      700,              // pausa entre páginas ao listar seguindo/seguidores
    actionDelayMinMs: 3000,             // pausa mínima entre cada unfollow / remoção
    actionDelayMaxMs: 7000,             // pausa máxima entre cada unfollow / remoção
    cacheMaxAgeMs:    30 * 60 * 1000,   // validade do cache local (30 min)
  };


  // ─────────────────────────────────────────────
  // 1. UTILITÁRIOS
  // ─────────────────────────────────────────────

  /** Pausa a execução por `ms` milissegundos — usado para evitar rate-limit da API */
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  /** Pausa por um tempo aleatório entre os limites de CONFIG (parece menos robótico) */
  const randomDelay = () =>
    sleep(
      CONFIG.actionDelayMinMs +
        Math.random() * (CONFIG.actionDelayMaxMs - CONFIG.actionDelayMinMs)
    );

  /** Lê todos os cookies do documento e devolve um objeto { nome: valor } */
  const parseCookies = () =>
    Object.fromEntries(
      document.cookie.split(";").map((c) => {
        const [key, ...rest] = c.trim().split("=");
        return [key, rest.join("=")];
      })
    );

  /** Hash de versão do site (lido uma única vez da página) */
  let _rolloutHash;

  /**
   * Monta os cabeçalhos usados pelo site do Instagram nas requisições de escrita (POST).
   * Sem x-ig-www-claim / x-instagram-ajax o Instagram pode recusar o unfollow.
   *
   * @param {string} csrf - Token CSRF a enviar
   */
  const getIgHeaders = (csrf) => {
    if (_rolloutHash === undefined) {
      const match = document.documentElement.innerHTML.match(/"rollout_hash":"([^"]+)"/);
      _rolloutHash = (match && match[1]) || "1";
    }
    let claim = "0";
    try {
      claim = sessionStorage.getItem("www-claim-v2") || "0";
    } catch {
      // sessionStorage indisponível: usa o valor padrão
    }
    return {
      "accept":           "application/json",
      "content-type":     "application/x-www-form-urlencoded; charset=UTF-8",
      "x-asbd-id":        "359341",
      "x-csrftoken":      csrf,
      "x-ig-app-id":      "936619743392459",
      "x-ig-d":           "www",
      "x-ig-www-claim":   claim,
      "x-instagram-ajax": _rolloutHash,
      "x-requested-with": "XMLHttpRequest",
    };
  };


  // ─────────────────────────────────────────────
  // 2. API DO INSTAGRAM
  // ─────────────────────────────────────────────

  /**
   * Busca uma única página (até 50 itens) da lista de "following" ou "followers"
   * via endpoint GraphQL legado do Instagram.
   *
   * @param {"following"|"followers"} listType - Qual lista buscar
   * @param {string} userId   - ID numérico do usuário logado
   * @param {string} after    - Cursor de paginação (vazio na primeira chamada)
   * @returns {Promise<object>} JSON de resposta da API
   */
  const fetchGraphqlPage = async (listType, userId, after = "") => {
    const endpoint =
      "https://www.instagram.com/api/v1/friendships/" +
      userId +
      "/" +
      listType +
      "/?count=50" +
      (after ? "&max_id=" + encodeURIComponent(after) : "");
    const resp = await fetch(endpoint, {
      headers: {
        "x-csrftoken": parseCookies().csrftoken || "",
        "x-ig-app-id": "936619743392459",
        "x-requested-with": "XMLHttpRequest",
      },
      credentials: "include",
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);

    const data = await resp.json();
    return {
      users: data.users || [],
      nextMaxId: data.next_max_id || "",
      hasNext: Boolean(data.next_max_id),
    };
  };

  /**
   * Percorre todas as páginas de uma lista ("following" ou "followers")
   * e devolve um array com todos os usuários no formato:
   *   { id, un (username), fn (full_name), p (profile_pic_url) }
   *
   * @param {"following"|"followers"} listType
   * @param {string} userId
   * @param {(got: number, total: number) => void} progressCallback - Atualiza a barra de progresso
   */
  const fetchAllPages = async (listType, userId, progressCallback) => {
    const results = [];
    let cursor = "";
    let hasNext = true;

    while (hasNext) {
      const data = await fetchGraphqlPage(listType, userId, cursor);
      if (!Array.isArray(data.users)) throw new Error("Resposta inesperada da API");

      data.users.forEach((user) =>
        results.push({
          id:  String(user.pk),
          un:  user.username,
          fn:  user.full_name || "",
          p:   user.profile_pic_url,
        })
      );

      hasNext = data.hasNext;
      cursor  = data.nextMaxId;
      progressCallback(results.length, results.length);
      if (hasNext) await sleep(CONFIG.pageDelayMs); // aguarda para evitar rate-limit
    }
    return results;
  };

  /**
   * Deixa de seguir um usuário (usado para sources "following" e "notFollowing")
   * Faz o POST em friendships/destroy e, se a resposta não confirmar, consulta
   * friendships/show para verificar se realmente deixou de seguir.
   *
   * @param {string} id - ID do usuário alvo
   * @returns {Promise<boolean>} true se a requisição foi bem-sucedida
   */
  const unfollowById = async (id) => {
    const cookies = parseCookies();
    const csrfToken = cookies.csrftoken || "";
    const csrfTokens = Array.from(new Set([
      csrfToken,
      decodeURIComponent(csrfToken || ""),
    ])).filter(Boolean);
    if (!csrfTokens.length) {
      throw new Error("Sessao do Instagram sem token CSRF. Atualize a pagina e tente novamente.");
    }

    const isNotFollowing = (status) => {
      return status &&
        typeof status.following === "boolean" &&
        !status.following &&
        (typeof status.outgoing_request !== "boolean" || !status.outgoing_request);
    };

    const pageHtml = document.documentElement.innerHTML;
    const lsdMatch = pageHtml.match(/"LSD",\[\],\{"token":"([^"]+)"/) ||
      pageHtml.match(/"LSD"[^}]*"token":"([^"]+)"/) ||
      pageHtml.match(/<input[^>]+name="lsd"[^>]+value="([^"]+)"/);
    const dtsgMatch = pageHtml.match(/"DTSGInitialData"[^}]*"token":"([^"]+)"/) ||
      pageHtml.match(/"DTSGInitData",\[\],\{"token":"([^"]+)"/) ||
      pageHtml.match(/name="fb_dtsg"[^>]+value="([^"]+)"/);
    const lsdToken = lsdMatch ? lsdMatch[1] : "";
    const dtsgToken = dtsgMatch ? dtsgMatch[1] : "";

    // O fluxo atual da interface usa esta mutation GraphQL. Os endpoints REST
    // continuam como fallback para navegadores com HTML de bootstrap diferente.
    const graphqlCalls = [];
    if (lsdToken && dtsgToken) {
      graphqlCalls.push({
        endpoint: "https://www.instagram.com/api/graphql",
        body: new URLSearchParams({
          av: document.cookie.match(/(?:^|;\s*)ds_user_id=([^;]+)/)?.[1] || "",
          __a: "1",
          __comet_req: "7",
          fb_dtsg: dtsgToken,
          lsd: lsdToken,
          fb_api_caller_class: "RelayModern",
          fb_api_req_friendly_name: "usePolarisUnfollowMutation",
          server_timestamps: "true",
          variables: JSON.stringify({
            target_user_id: String(id),
            container_module: "profile",
            nav_chain: "PolarisProfilePostsTabRoot:profilePage:1:via_cold_start",
          }),
          doc_id: "27789106940691111",
        }).toString(),
        friendlyHeaders: {
          "x-fb-friendly-name": "usePolarisUnfollowMutation",
          "x-fb-lsd": lsdToken,
        },
      });
    }

    const endpoints = [
      "https://www.instagram.com/api/v1/web/friendships/" + id + "/unfollow/",
      "https://www.instagram.com/api/v1/friendships/destroy/" + id + "/",
    ];

    let lastHttpStatus = 0;
    let lastApiMessage = "";
    let lastDetail = ""; // resumo das respostas, exibido no alerta de erro

    // Detecta página HTML (login / app shell) em vez de JSON — sem diferenciar maiúsculas
    const looksLikeHtml = (text) => /^\s*<(!doctype|html)/i.test(text);

    const requests = graphqlCalls.concat(endpoints.map((endpoint) => ({
      endpoint: endpoint,
      body: new URLSearchParams({
        container_module: "profile",
        user_id: id,
      }).toString(),
      friendlyHeaders: {},
    })));

    for (const request of requests) {
      const endpoint = request.endpoint;
      await sleep(300);
      let resp;
      let body = "";
      for (const token of csrfTokens) {
        resp = await fetch(endpoint, {
          method: "POST",
          headers: Object.assign(getIgHeaders(token), request.friendlyHeaders),
          credentials: "include",
          body: request.body,
        });
        body = await resp.text();
        // Diagnóstico: veja em F12 > Console o que o Instagram respondeu
        console.log("[IG Checker] unfollow", endpoint, resp.status, body.slice(0, 300));
        if (!looksLikeHtml(body)) break;
      }
      lastHttpStatus = resp.status;
      lastDetail +=
        (lastDetail ? " || " : "") +
        endpoint.replace("https://www.instagram.com", "") +
        " -> HTTP " + resp.status + " " +
        body.trim().slice(0, 80).replace(/\s+/g, " ");
      let data = {};
      try {
        // Algumas respostas do Instagram vêm com o prefixo "for (;;);"
        data = body ? JSON.parse(body.replace(/^\s*for \(;;\);/, "")) : {};
      } catch {
        data = {};
      }
      if (data.message) lastApiMessage = String(data.message);

      if (!resp.ok || looksLikeHtml(body)) {
        continue;
      }

      if (resp.ok && data.status !== "fail" && data.status !== "error" &&
          isNotFollowing(data.friendship_status || data)) return true;

      // Resposta não confirmou: consulta o status real da amizade
      await sleep(800);
      const verifyResp = await fetch(
        "https://www.instagram.com/api/v1/friendships/show/" + id +
          "/?_=" + Date.now(),
        {
          headers: {
            "accept": "application/json",
            "x-csrftoken": csrfTokens[0],
            "x-ig-app-id": "936619743392459",
            "x-requested-with": "XMLHttpRequest",
          },
          credentials: "include",
          cache: "no-store",
        }
      );
      const verifyText = await verifyResp.text();
      console.log("[IG Checker] show", id, verifyResp.status, verifyText.slice(0, 300));
      lastDetail +=
        " | show: HTTP " + verifyResp.status + " " +
        verifyText.trim().slice(0, 120).replace(/\s+/g, " ");
      if (!verifyResp.ok) continue;

      let verifyData = {};
      try {
        verifyData = JSON.parse(verifyText);
      } catch {
        verifyData = {};
      }
      const verifiedStatus = verifyData.friendship_status || verifyData;
      if (isNotFollowing(verifiedStatus)) return true;
    }

    throw new Error(
      (lastApiMessage ||
        ("Instagram respondeu HTTP " + lastHttpStatus +
          ", mas nao confirmou que deixou de seguir o perfil.")) +
      " [" + lastDetail + "]"
    );
  };

  /**
   * Remove um seguidor do seu próprio perfil (source "followers")
   * @param {string} id - ID do seguidor a ser removido
   * @returns {Promise<boolean>}
   */
  const removeFollowerById = async (id) => {
    const resp = await fetch(
      "https://www.instagram.com/api/v1/friendships/remove_follower/" + id + "/",
      {
        method: "POST",
        headers: getIgHeaders(decodeURIComponent(parseCookies().csrftoken || "")),
        credentials: "include",
        body: "user_id=" + encodeURIComponent(id),
      }
    );

    const body = await resp.text();
    // Diagnóstico: veja em F12 > Console o que o Instagram respondeu
    console.log("[IG Checker] remove_follower", id, resp.status, body.slice(0, 300));
    // HTML = o Instagram não reconheceu a chamada de API; não pode contar como sucesso
    if (/^\s*<(!doctype|html)/i.test(body)) {
      throw new Error("Instagram devolveu uma página HTML (HTTP " + resp.status + ") em vez de JSON.");
    }
    let data = {};
    try {
      data = body ? JSON.parse(body) : {};
    } catch {
      data = {};
    }

    if (!resp.ok || data.status === "fail" || data.status === "error") {
      throw new Error(data.message || data.error_type || ("HTTP " + resp.status));
    }

    return true;
  };


  // ─────────────────────────────────────────────
  // 3. CONSTRUÇÃO DA UI
  // ─────────────────────────────────────────────

  /** Injeta no <head> a keyframe do spinner (executada apenas uma vez) */
  const injectSpinnerStyles = () => {
    if (document.getElementById("_igc_style")) return;
    const style = document.createElement("style");
    style.id = "_igc_style";
    style.textContent = "@keyframes _igc_spin{to{transform:rotate(360deg)}}";
    document.head.appendChild(style);
  };

  /**
   * Cria e insere no DOM o esqueleto completo do modal.
   * Retorna o elemento container para que o restante do código possa removê-lo se necessário.
   *
   * Estrutura do modal:
   *  ┌─ Header (título + spinner + botões lupa/fechar) ─────────┐
   *  │  Body (_b)                                               │
   *  │   ├ Status / cards de stats (_s)                        │
   *  │   ├ Barra de progresso (_p)                             │
   *  │   ├ Botão "Selecionar todos" (_selectAllContainer)      │
   *  │   ├ Lista de usuários (_l)                              │
   *  │   └ Footer de paginação (_f)                            │
   *  └─ Action Footer (_af) — botões Unfollow + Exportar CSV ──┘
   */
  const buildShell = () => {
    injectSpinnerStyles();

    const container = document.createElement("div");
    container.id = "_igc";
    container.style.cssText =
      "position:fixed;top:16px;right:16px;width:350px;max-height:80vh;" +
      "background:#111;border:1px solid #2a2a2a;border-radius:12px;" +
      "box-shadow:0 20px 50px #000c;z-index:99999;" +
      "font-family:system-ui,sans-serif;color:#f0f0f0;" +
      "display:flex;flex-direction:column;overflow:hidden";

    container.innerHTML =
      // ── Header ──────────────────────────────────────────────────────
      '<div style="padding:12px;border-bottom:1px solid #222;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<b style="font-size:13px">IG Checker</b>' +
          '<span id="_spin" style="display:inline-block;width:12px;height:12px;border:2px solid #444;border-top-color:#b0ff3e;border-radius:50%;animation:_igc_spin .7s linear infinite"></span>' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button id="_crrg" style="background:none;border:none;padding:8px;font-weight:900;cursor:pointer;">🔎</button>' +
          '<button id="_rmv"  style="background:none;border:none;color:red;padding:8px;cursor:pointer;font-weight:bold;font-size:16px;">X</button>' +
        '</div>' +
      '</div>' +

      // ── Body ────────────────────────────────────────────────────────
      '<div id="_b" style="padding:12px;flex:1;overflow-y:auto">' +
        '<div id="_s" style="font-size:12px;color:#888;margin-bottom:8px">Iniciando...</div>' +
        '<div style="height:3px;background:#222;border-radius:2px;margin-bottom:10px">' +
          '<div id="_p" style="height:100%;background:#b0ff3e;border-radius:2px;width:0;transition:width .3s"></div>' +
        '</div>' +
        '<div id="_selectAllContainer"></div>' + // botão "Selecionar todos" injetado dinamicamente
        '<div id="_l"></div>' +                  // lista de usuários
        '<div id="_f"></div>' +                  // rodapé de paginação ("X restantes")
      '</div>' +

      // ── Action Footer (sempre visível após carregamento) ─────────────
      '<div id="_af" style="padding:8px 12px 12px;border-top:1px solid #222;flex-shrink:0;display:none">' +
        '<div style="display:flex;gap:6px">' +
          '<button id="_ubtn" style="flex:1;padding:7px;background:#4caf50;border:none;border-radius:5px;color:#000;font-size:11px;font-weight:500;cursor:pointer;font-family:monospace">' +
            'Unfollow (<span id="_cnt">0</span>)' +
          '</button>' +
          '<button id="_exportBtn" style="flex:1;padding:7px;background:#1a1a1a;border:1px solid #333;border-radius:5px;color:#b0ff3e;font-size:11px;font-family:monospace;cursor:pointer">' +
            'Exportar CSV' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(container);
    return container;
  };


  // ─────────────────────────────────────────────
  // 4. CARDS DE ESTATÍSTICAS
  // ─────────────────────────────────────────────

  /**
   * Renderiza os três cards clicáveis (Seguindo / Seguidores / Não seguem)
   * dentro do elemento de status.
   *
   * Cada card, ao ser clicado, atualiza a lista exibida e o source ativo.
   *
   * @param {{ following: object[], followers: object[], notFollowing: object[] }} listas
   * @param {HTMLElement} statusEl           - Onde os cards serão renderizados
   * @param {(source: string) => void} onCardClick - Callback chamado ao clicar num card
   */
  const renderStatCards = (listas, statusEl, onCardClick) => {
    const cardBaseStyle =
      "background:#1a1a1a;border-radius:6px;padding:7px;text-align:center;" +
      "cursor:pointer;border:1px solid transparent;transition:border-color .2s,background .2s";

    const cardDefs = [
      { id: "card-seguindo",   label: "Seguindo",   count: listas.following.length,    color: "#b0ff3e", source: "following"    },
      { id: "card-seguidores", label: "Seguidores", count: listas.followers.length,    color: "#b0ff3e", source: "followers"    },
      { id: "card-nao-seguem", label: "Não seguem", count: listas.notFollowing.length, color: "#ff5c5c", source: "notFollowing" },
    ];

    statusEl.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px">' +
      cardDefs.map(({ id, label, count, color }) =>
        '<div id="' + id + '" style="' + cardBaseStyle + '">' +
          '<div style="font-size:15px;font-weight:600;color:' + color + '">' + count + '</div>' +
          '<div style="font-size:10px;color:#555;margin-top:1px">' + label + '</div>' +
        '</div>'
      ).join("") +
      "</div>";

    // Vincula o evento de clique em cada card
    cardDefs.forEach(({ id, source }) => {
      document.getElementById(id).addEventListener("click", () => {
        // Destaque visual no card ativo — reseta todos e marca o clicado
        cardDefs.forEach(({ id: otherId }) => {
          const el = document.getElementById(otherId);
          el.style.background   = "#1a1a1a";
          el.style.borderColor  = "transparent";
        });
        const activeCard = document.getElementById(id);
        activeCard.style.background  = "#333";
        activeCard.style.borderColor = "#444";

        onCardClick(source);
      });
    });
  };


  // ─────────────────────────────────────────────
  // 5. RENDERIZAÇÃO DA LISTA DE USUÁRIOS
  // ─────────────────────────────────────────────

  /**
   * Cria o elemento de linha (div) de um usuário na lista.
   * Contém: checkbox de seleção | avatar + nome | link para o perfil
   *
   * @param {object}   user        - { id, un, fn, p }
   * @param {Set}      selected    - Set com IDs selecionados (atualizado pelo checkbox)
   * @param {Function} onChange    - Chamado sempre que o Set muda (para atualizar contador)
   * @returns {HTMLElement}
   */
  const createUserRow = (user, selected, onChange) => {
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:center;gap:8px;padding:7px 4px;border-radius:7px;cursor:pointer";
    row.onmouseenter = () => (row.style.background = "#1a1a1a");
    row.onmouseleave = () => (row.style.background = "");

    // ── Checkbox ──────────────────────────────────────────────────────
    const label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:center;padding:8px;cursor:pointer;flex-shrink:0";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.style.cssText = "width:16px;height:16px;cursor:pointer;flex-shrink:0";
    cb.checked = selected.has(user.id);

    cb.onchange = () => {
      if (cb.checked) selected.add(user.id);
      else            selected.delete(user.id);
      onChange();
    };

    label.appendChild(cb);
    row.appendChild(label);

    // ── Link para o perfil (avatar + nome + @username) ─────────────────
    const link = document.createElement("a");
    link.href = "https://www.instagram.com/" + user.un + "/";
    link.target = "_blank";
    link.style.cssText =
      "display:flex;align-items:center;gap:9px;flex:1;text-decoration:none;" +
      "color:inherit;overflow:hidden;text-overflow:ellipsis";
    link.innerHTML =
      '<img src="' + user.p + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;background:#222" loading="lazy">' +
      '<div style="min-width:0">' +
        '<div style="font-size:13px;font-weight:500;color:#f0f0f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (user.fn || user.un) + '</div>' +
        '<div style="font-size:11px;color:#555">@' + user.un + '</div>' +
      '</div>';

    link.addEventListener("mouseenter", () => {
      link.style.background    = "#66666660";
      link.style.borderRadius  = "7px";
    });
    link.addEventListener("mouseleave", () => {
      setTimeout(() => {
        link.style.background   = "none";
        link.style.borderRadius = "0";
      }, 1500);
    });

    row.appendChild(link);

    // Clique na row (fora do checkbox e do link) também marca/desmarca
    row.onclick = (e) => {
      if (label.contains(e.target) || link.contains(e.target)) return;
      cb.checked = !cb.checked;
      cb.onchange();
    };

    return row;
  };


  // ─────────────────────────────────────────────
  // 6. BOTÃO "SELECIONAR TODOS"
  // ─────────────────────────────────────────────

  /**
   * Renderiza (ou atualiza) o botão "Selecionar todos" no container dedicado.
   * O botão mostra a contagem total do source ativo e alterna entre
   * "selecionar todos" e "desmarcar todos" a cada clique.
   *
   * Ao selecionar todos, TODOS os IDs da lista (mesmo os não carregados)
   * são adicionados ao Set `selected`.
   *
   * @param {HTMLElement} container   - Onde o botão será renderizado (#_selectAllContainer)
   * @param {object[]}    list        - Lista COMPLETA do source ativo
   * @param {Set}         selected    - Set de IDs selecionados
   * @param {Function}    onChange    - Callback para atualizar contador no botão de ação
   */
  const renderSelectAllButton = (container, list, selected, onChange) => {
    container.innerHTML = ""; // limpa botão anterior

    // Calcula estado inicial: todos já estão selecionados?
    const allSelected = list.length > 0 && list.every((u) => selected.has(u.id));

    const btn = document.createElement("button");
    btn.style.cssText =
      "width:100%;padding:7px;margin-bottom:8px;background:#1a1a1a;" +
      "border:1px solid #444;border-radius:5px;color:#b0ff3e;" +
      "font-size:11px;cursor:pointer;display:flex;align-items:center;gap:6px;font-family:monospace";

    const updateButtonLabel = (selecting) => {
      btn.innerHTML =
        '<input type="checkbox" style="width:14px;height:14px;pointer-events:none" ' + (selecting ? "" : 'checked') + '>' +
        (selecting
          ? "Selecionar todos (" + list.length + ")"
          : "Desmarcar todos  (" + selected.size + " selecionados)");
    };

    // Estado inicial do botão
    updateButtonLabel(!allSelected);

    btn.onclick = () => {
      const willSelectAll = list.some((u) => !selected.has(u.id));

      if (willSelectAll) {
        // Adiciona TODOS os IDs da lista ao Set (incluindo não carregados na tela)
        list.forEach((u) => selected.add(u.id));
        // Marca todos os checkboxes visíveis na lista
        document.querySelectorAll('#_l input[type="checkbox"]').forEach((cb) => (cb.checked = true));
      } else {
        // Remove TODOS os IDs da lista do Set
        list.forEach((u) => selected.delete(u.id));
        // Desmarca todos os checkboxes visíveis
        document.querySelectorAll('#_l input[type="checkbox"]').forEach((cb) => (cb.checked = false));
      }

      onChange();
      updateButtonLabel(!willSelectAll);
    };

    container.appendChild(btn);
  };


  // ─────────────────────────────────────────────
  // 7. BOTÕES DE AÇÃO (EXPORTAR CSV / UNFOLLOW)
  // ─────────────────────────────────────────────

  /**
   * Retorna o texto correto para o botão de ação com base no source ativo.
   *
   * "following"    → "Deixar de seguir"
   * "notFollowing" → "Deixar de seguir"
   * "followers"    → "Remover seguidores"
   *
   * @param {string} source
   * @param {number} count - Quantidade selecionada
   */
  const getActionButtonLabel = (source, count) => {
    const verb = source === "followers" ? "Remover seguidores" : "Deixar de seguir";
    return verb + ' (<span id="_cnt">' + count + '</span>)';
  };

  /**
   * Liga o botão "Exportar CSV".
   * Exporta os usuários selecionados (ou toda a lista ativa se nenhum estiver selecionado).
   *
   * @param {HTMLElement}      exportBtnEl
   * @param {Set}              selected
   * @param {{ getList: () => object[], getSource: () => string }} state
   */
  const wireExportButton = (exportBtnEl, selected, state) => {
    exportBtnEl.onclick = () => {
      exportBtnEl.textContent = "Exportando...";
      setTimeout(() => {
        exportBtnEl.textContent = "Exportar CSV";

        const activeList = state.getList();
        const currentSource = state.getSource();
        // Considera só os selecionados que pertencem à lista ativa
        const selectedInList = activeList.filter((u) => selected.has(u.id));
        const lista = selectedInList.length > 0 ? selectedInList : activeList;

        const rows = [
          ["usuario", "nome", "perfil"],
          ...lista.map((u) => [u.un, u.fn, "https://instagram.com/" + u.un + "/"]),
        ];

        const fileName =
          selectedInList.length > 0
            ? "selecionados_" + currentSource + ".csv"
            : currentSource + ".csv";

        const csvContent = rows
          .map((row) => row.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(","))
          .join("\n");

        const anchor = document.createElement("a");
        anchor.href = URL.createObjectURL(new Blob([csvContent], { type: "text/csv" }));
        anchor.download = fileName;
        anchor.click();
      }, 1000);
    };
  };

  /**
   * Liga o botão de ação principal (Deixar de seguir / Remover seguidores).
   * Exibe confirmação antes de executar, com aviso extra quando "Selecionar todos" está ativo.
   *
   * Só age sobre os IDs selecionados que pertencem à lista ativa.
   *
   * @param {HTMLElement}      ubtnEl
   * @param {Set}              selected
   * @param {{ getList: () => object[], getSource: () => string }} state
   * @param {HTMLElement}      containerEl - Modal inteiro (removido após a ação)
   */
  const wireActionButton = (ubtnEl, selected, state, containerEl) => {
    ubtnEl.onclick = async () => {
      const currentSource = state.getSource();
      const activeList    = state.getList();

      // IDs selecionados que realmente pertencem à lista ativa
      const ids = activeList.filter((u) => selected.has(u.id)).map((u) => u.id);

      if (!ids.length) {
        alert("Selecione ao menos um perfil antes de executar a ação.");
        return;
      }

      const isRemoveFollower = currentSource === "followers";
      const verb = isRemoveFollower ? "remover seguidor de" : "deixar de seguir";

      // Aviso extra quando todos os itens estão selecionados (inclusive não carregados)
      const allSelected = ids.length === activeList.length;
      const aviso = allSelected
        ? "\n\n⚠️  ATENÇÃO: TODOS os " + activeList.length + " usuários da lista estão selecionados, incluindo os não exibidos na tela."
        : "";

      // Estimativa baseada no intervalo médio entre ações
      const avgDelaySec = (CONFIG.actionDelayMinMs + CONFIG.actionDelayMaxMs) / 2000;
      const estMinutes  = Math.max(1, Math.ceil((ids.length * (avgDelaySec + 1)) / 60));

      const confirmMsg =
        "Você está prestes a " + verb + " " + ids.length + " perfis." +
        aviso +
        "\n\nEssa ação levará cerca de " + estMinutes + " minuto(s). Deseja continuar?";

      if (!confirm(confirmMsg)) return;

      let ok = 0, err = 0;
      const errors = [];

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        try {
          const success = isRemoveFollower
            ? await removeFollowerById(id)
            : await unfollowById(id);
          if (success) ok++; else err++;
        } catch (error) {
          err++;
          const msg = error instanceof Error ? error.message : String(error);
          errors.push(msg);
          console.error("[IG Checker] erro ao processar", id, msg);
        }
        ubtnEl.innerHTML =
          (isRemoveFollower ? "Removendo... " : "Deixando de seguir... ") +
          ok + "/" + ids.length + (err ? " (" + err + " erros)" : "");

        // Intervalo aleatório entre ações (não precisa esperar depois da última)
        if (i < ids.length - 1) await randomDelay();
      }

      const errorSummary = errors.length
        ? "\n\nPrimeiro erro: " + errors[0] + "\n(Veja todos em F12 > Console)"
        : "";
      alert("Concluído: " + ok + " OK, " + err + " erros." + errorSummary);

      // Limpa o cache para não reexibir perfis que acabaram de ser processados
      try {
        localStorage.removeItem("_igc_state_" + parseCookies().ds_user_id);
      } catch {
        // Storage indisponível: ignora
      }

      containerEl.remove();
    };
  };


  // ─────────────────────────────────────────────
  // 8. ORQUESTRADOR PRINCIPAL
  // ─────────────────────────────────────────────

  // Evita múltiplas instâncias: se já existe um modal, remove-o e sai
  if (document.getElementById("_igc")) {
    document.getElementById("_igc").remove();
    return;
  }

  // Verifica se o usuário está logado
  const cookies = parseCookies();
  const userId  = cookies.ds_user_id;
  if (!userId) return alert("Faça login no Instagram antes de usar o IG Checker.");

  // ── Constrói o modal e obtém referências aos elementos ──────────────
  const containerEl     = buildShell();
  const statusEl        = document.getElementById("_s");
  const progressBar     = document.getElementById("_p");
  const spinnerEl       = document.getElementById("_spin");
  const listEl          = document.getElementById("_l");
  const paginationEl    = document.getElementById("_f");       // "X restantes"
  const selectAllEl     = document.getElementById("_selectAllContainer");
  const actionFooterEl  = document.getElementById("_af");
  const ubtnEl          = document.getElementById("_ubtn");
  const exportBtnEl     = document.getElementById("_exportBtn");
  const toggleListBtn   = document.getElementById("_crrg");
  const closeBtn        = document.getElementById("_rmv");

  // Set que mantém os IDs selecionados pelo usuário
  const selected = new Set();

  // Source ativo no momento ("following" | "followers" | "notFollowing")
  let currentSource = "notFollowing";

  // Controla quantos itens já foram renderizados na lista visível
  let renderOffset = 0;

  // Listas (preenchidas após o fetch)
  let following    = [];
  let followers    = [];
  let notFollowing = [];

  const CACHE_KEY = "_igc_state_" + userId;

  const readState = () => {
    try {
      const stateData = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!stateData || Date.now() - stateData.savedAt > CONFIG.cacheMaxAgeMs) return null;
      if (!Array.isArray(stateData.following) ||
          !Array.isArray(stateData.followers) ||
          !Array.isArray(stateData.notFollowing) ||
          !Array.isArray(stateData.selected)) return null;
      return stateData;
    } catch {
      return null;
    }
  };

  const savedState = readState();
  if (savedState) {
    following = savedState.following;
    followers = savedState.followers;
    notFollowing = savedState.notFollowing;
    savedState.selected.forEach((id) => selected.add(String(id)));
    if (["following", "followers", "notFollowing"].includes(savedState.currentSource)) {
      currentSource = savedState.currentSource;
    }
  }

  const saveState = () => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        following,
        followers,
        notFollowing,
        currentSource,
        selected: Array.from(selected),
      }));
    } catch {
      // Storage pode estar indisponivel em navegacao privada ou por restricao do navegador.
    }
  };

  // Helper: retorna a lista correspondente ao source ativo
  const getActiveList = () => {
    if (currentSource === "following")    return following;
    if (currentSource === "followers")    return followers;
    return notFollowing;
  };

  // Objeto de estado compartilhado pelos botões de ação
  const state = {
    getList:   () => getActiveList(),
    getSource: () => currentSource,
  };

  // ── Hover nos botões do header ──────────────────────────────────────
  [toggleListBtn, closeBtn].forEach((btn) => {
    btn.addEventListener("mouseover", () => (btn.style.background = "#474747"));
    btn.addEventListener("mouseout",  () => (btn.style.background = "none"));
  });

  // ── Fechar modal ────────────────────────────────────────────────────
  closeBtn.onclick = () => {
    saveState();
    containerEl.remove();
  };

  // ── Botão lupa: alterna visibilidade da lista ───────────────────────
  toggleListBtn.onclick = () => {
    const isOpen = toggleListBtn.innerHTML.includes("_");
    if (isOpen) {
      // Fecha: esconde lista e volta ao ícone de lupa
      listEl.style.display          = "none";
      selectAllEl.style.display     = "none";
      paginationEl.style.display    = "none";
      toggleListBtn.style.fontSize  = "";
      toggleListBtn.style.marginBottom = "";
      toggleListBtn.innerHTML       = "🔎";
      saveState();
    } else {
      // Abre: carrega a lista do source atual se ainda não carregada
      listEl.style.removeProperty("display");
      selectAllEl.style.removeProperty("display");
      paginationEl.style.removeProperty("display");
      toggleListBtn.style.fontSize     = "24px";
      toggleListBtn.style.marginBottom = "16px";
      toggleListBtn.innerHTML          = "_";

      // Renderiza lista do source ativo (resetando o offset)
      openList(currentSource);
      saveState();
    }
  };

  /**
   * Reseta e abre a lista de um source, renderizando os primeiros itens.
   * Também atualiza o botão "Selecionar todos" e o label do botão de ação.
   *
   * Se o source mudou, a seleção é limpa — assim IDs marcados numa lista
   * (ex.: "Não seguem") nunca são usados por engano em outra (ex.: "Seguidores").
   *
   * @param {string} source - "following" | "followers" | "notFollowing"
   */
  const openList = (source) => {
    if (source !== currentSource) selected.clear();
    currentSource  = source;
    renderOffset   = 0;
    listEl.innerHTML      = "";
    paginationEl.innerHTML = "";

    const list = getActiveList();

    // Atualiza label do botão de ação
    ubtnEl.innerHTML = getActionButtonLabel(source, selected.size);

    // Exibe botão "Selecionar todos" com total da lista
    renderSelectAllButton(selectAllEl, list, selected, () => {
      ubtnEl.innerHTML = getActionButtonLabel(currentSource, selected.size);
    });

    // Renderiza os primeiros itens (20 por vez)
    renderNextBatch(source);
  };

  /**
   * Renderiza o próximo lote de 20 usuários na lista visível.
   * Adiciona botão "X restantes" ao rodapé se ainda houver mais.
   *
   * @param {string} source
   */
  const renderNextBatch = (source) => {
    const list = getActiveList();

    list.slice(renderOffset, renderOffset + 20).forEach((user) => {
      const row = createUserRow(user, selected, () => {
        ubtnEl.innerHTML = getActionButtonLabel(currentSource, selected.size);
        // Sincroniza o botão "Selecionar todos" (pode ter sido desmarcado individualmente)
        renderSelectAllButton(selectAllEl, list, selected, () => {
          ubtnEl.innerHTML = getActionButtonLabel(currentSource, selected.size);
        });
      });
      listEl.appendChild(row);
    });

    renderOffset = Math.min(renderOffset + 20, list.length);

    // Rodapé de paginação
    if (renderOffset < list.length) {
      paginationEl.innerHTML =
        '<button style="width:100%;padding:7px;background:transparent;border:1px solid #2a2a2a;border-radius:5px;color:#666;font-size:11px;cursor:pointer">' +
        (list.length - renderOffset) + " restantes</button>";
      paginationEl.firstChild.onclick = () => {
        paginationEl.innerHTML = "";
        renderNextBatch(source);
      };
    } else {
      paginationEl.innerHTML = "";
    }
  };

  // ── Carregamento dos dados ──────────────────────────────────────────
  try {
    if (!savedState) {
      statusEl.textContent = "Buscando seguindo...";
      following = await fetchAllPages("following", userId, (got, total) => {
        progressBar.style.width =
          Math.min(50, ((got / Math.max(total, 1)) * 50) | 0) + "%";
        statusEl.textContent = "Seguindo: " + got + "/" + total;
      });

      statusEl.textContent = "Buscando seguidores...";
      followers = await fetchAllPages("followers", userId, (got, total) => {
        progressBar.style.width =
          50 + Math.min(50, ((got / Math.max(total, 1)) * 50) | 0) + "%";
        statusEl.textContent = "Seguidores: " + got + "/" + total;
      });

      // Calcula quem você segue mas não te segue de volta
      const followerIds = new Set(followers.map((x) => x.id));
      notFollowing = following.filter((x) => !followerIds.has(x.id));
      saveState();
    }

    // ── Finaliza carregamento ─────────────────────────────────────────
    spinnerEl.style.display = "none";
    progressBar.style.width      = "100%";
    progressBar.style.background = notFollowing.length ? "#ff5c5c" : "#4caf50";
    actionFooterEl.style.display = "block";

    // Renderiza os cards de estatísticas e define o que acontece ao clicar em cada um
    renderStatCards(
      { following, followers, notFollowing },
      statusEl,
      (source) => {
        // OBS: não atribuir currentSource aqui — o openList compara o source
        // novo com o atual para decidir se limpa a seleção.
        listEl.innerHTML      = "";
        paginationEl.innerHTML = "";
        renderOffset   = 0;

        // Garante que a lista fique visível e o botão em estado "aberto"
        listEl.style.removeProperty("display");
        selectAllEl.style.removeProperty("display");
        paginationEl.style.removeProperty("display");
        toggleListBtn.style.fontSize     = "24px";
        toggleListBtn.style.marginBottom = "16px";
        toggleListBtn.innerHTML = "_";

        openList(source);
      }
    );

    // Mensagem de parabéns se todo mundo te segue de volta
    if (!notFollowing.length) {
      listEl.innerHTML =
        '<p style="text-align:center;color:#555;font-size:13px;padding:2rem">🎉 Todos te seguem de volta!</p>';
    }

    // Liga botões de ação (CSV e Unfollow/Remover)
    wireExportButton(exportBtnEl, selected, state);
    wireActionButton(ubtnEl, selected, state, containerEl);
    if (savedState) openList(currentSource);

  } catch (e) {
    spinnerEl.style.display  = "none";
    statusEl.style.color     = "#ff5c5c";
    statusEl.textContent     = "Erro: " + e.message;
  }

})();