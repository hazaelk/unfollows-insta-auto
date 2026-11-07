/*
 * IG Checker — readable, formatted version (refatorado v2)
 * Mudanças:
 *  - rc(source) aceita "following" | "followers" | "notFollowing"; checkbox em todos
 *  - Cards de stats são botões clicáveis que chamam rc(source)
 *  - Loading spinner no cabeçalho durante o carregamento
 *  - Footer de ação (Unfollow + CSV) faz parte do layout inicial (_af)
 *  - removeFollowerById() para remover seguidor via endpoint próprio
 *  - remover(source) despacha para unfollowById ou removeFollowerById conforme source
 */

(async function igChecker() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const parseCookies = () =>
    Object.fromEntries(
      document.cookie.split(";").map((c) => {
        const [key, ...rest] = c.trim().split("=");
        return [key, rest.join("=")];
      }),
    );

  const fetchGraphqlPage = async (listType, userId, after = "") => {
    const queryHashes = {
      following: "d04b0a864b4b54837c0d870b0e77e076",
      followers: "c76146de99bb02f6415203be841dd25a",
    };
    const resp = await fetch(
      "/graphql/query/?query_hash=" +
        queryHashes[listType] +
        "&variables=" +
        encodeURIComponent(JSON.stringify({ id: userId, first: 50, after })),
      {
        headers: {
          "x-csrftoken": parseCookies().csrftoken || "",
          "x-ig-app-id": "936619743392459",
        },
        credentials: "include",
      },
    );
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    return resp.json();
  };

  const fetchAllPages = async (listType, userId, progressCallback) => {
    const results = [];
    let cursor = "";
    let hasNext = true;
    while (hasNext) {
      const data = await fetchGraphqlPage(listType, userId, cursor);
      const edge =
        listType === "following"
          ? data?.data?.user?.edge_follow
          : data?.data?.user?.edge_followed_by;
      if (!edge) throw new Error("Erro API");
      edge.edges.forEach((n) =>
        results.push({
          id: n.node.id,
          un: n.node.username,
          fn: n.node.full_name || "",
          p: n.node.profile_pic_url,
        }),
      );
      hasNext = edge.page_info.has_next_page;
      cursor = edge.page_info.end_cursor;
      progressCallback(results.length, edge.count || results.length);
      if (hasNext) await sleep(700);
    }
    return results;
  };

  // Deixa de seguir um usuário (following / notFollowing)
  const unfollowById = async (id) => {
    const token = parseCookies().csrftoken;
    const resp = await fetch(
      "https://www.instagram.com/api/v1/friendships/destroy/" + id + "/",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-csrftoken": token,
          "x-ig-app-id": "936619743392459",
          "x-requested-with": "XMLHttpRequest",
        },
        credentials: "include",
        body: "user_id=" + id + "&container_module=profile",
      },
    );
    return resp.ok;
  };

  // Remove um seguidor do seu perfil (source === "followers")
  const removeFollowerById = async (id) => {
    const token = parseCookies().csrftoken;
    const resp = await fetch(
      "https://www.instagram.com/api/v1/friendships/remove_follower/" + id + "/",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-csrftoken": token,
          "x-ig-app-id": "936619743392459",
          "x-requested-with": "XMLHttpRequest",
        },
        credentials: "include",
        body: "user_id=" + id,
      },
    );
    return resp.ok;
  };

  // Prevent multiple instances
  if (document.getElementById("_igc"))
    return document.getElementById("_igc").remove();

  const cookies = parseCookies();
  const userId = cookies.ds_user_id;
  if (!userId) return alert("Faca login no Instagram.");

  // Build UI shell
  const container = document.createElement("div");
  container.id = "_igc";
  container.style.cssText =
    "position:fixed;top:16px;right:16px;width:350px;max-height:80vh;background:#111;border:1px solid #2a2a2a;border-radius:12px;box-shadow:0 20px 50px #000c;z-index:99999;font-family:system-ui,sans-serif;color:#f0f0f0;display:flex;flex-direction:column;overflow:hidden";

  // Spinner keyframes injetado uma única vez
  if (!document.getElementById("_igc_style")) {
    const style = document.createElement("style");
    style.id = "_igc_style";
    style.textContent =
      "@keyframes _igc_spin{to{transform:rotate(360deg)}}";
    document.head.appendChild(style);
  }

  container.innerHTML =
    '<div style="padding:12px;border-bottom:1px solid #222;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">' +
    '<div style="display:flex;align-items:center;gap:8px">' +
    '<b style="font-size:13px">IG Checker</b>' +
    '<span id="_spin" style="display:inline-block;width:12px;height:12px;border:2px solid #444;border-top-color:#b0ff3e;border-radius:50%;animation:_igc_spin .7s linear infinite"></span>' +
    '</div>' +
    '<div style="display:flex;gap:8px">' +
    '<button id="_crrg" style="background:none;border:none;padding:8px;font-weight:900;cursor:pointer;">🔎</button>' +
    '<button id="_rmv" style="background:none;border:none;color:red;padding:8px;cursor:pointer;font-weight:bold;font-size:16px;">X</button>' +
    '</div>' +
    '</div>' +
    '<div id="_b" style="padding:12px;flex:1;overflow-y:auto">' +
    '<div id="_s" style="font-size:12px;color:#888;margin-bottom:8px">Iniciando...</div>' +
    '<div style="height:3px;background:#222;border-radius:2px;margin-bottom:10px"><div id="_p" style="height:100%;background:#b0ff3e;border-radius:2px;width:0;transition:width .3s"></div></div>' +
    '<div id="_todos"></div>' +
    '<div id="_l"></div>' +
    '<div id="_f"></div>' +
    '</div>' +
    // Action footer fixo — sempre visível após o carregamento
    '<div id="_af" style="padding:8px 12px 12px;border-top:1px solid #222;flex-shrink:0;display:none">' +
    '<div style="display:flex;gap:6px">' +
    '<button id="_ubtn" style="flex:1;padding:7px;background:#4caf50;border:none;border-radius:5px;color:#000;font-size:11px;font-weight:500;cursor:pointer;font-family:monospace">' +
    'Deixar de seguir (<span id="_cnt">0</span>)' +
    '</button>' +
    '<button id="_exportBtn" style="flex:1;padding:7px;background:#1a1a1a;border:1px solid #333;border-radius:5px;color:#b0ff3e;font-size:11px;font-family:monospace;cursor:pointer">' +
    'Exportar CSV' +
    '</button>' +
    '</div>' +
    '</div>';
  document.body.appendChild(container);

  const containerElemId = document.getElementById("_igc");
  const statusEl       = document.getElementById("_s");
  const progressBar    = document.getElementById("_p");
  const carregarbtn    = document.getElementById("_crrg");
  const fecharModal    = document.getElementById("_rmv");
  const selectTdsEl    = document.getElementById("_todos");
  const listEl         = document.getElementById("_l");
  const footerEl       = document.getElementById("_f");   // "X restantes" paginação
  const actionFooterEl = document.getElementById("_af");  // footer fixo de ação
  const ubtnEl         = document.getElementById("_ubtn");
  const exportBtnEl    = document.getElementById("_exportBtn");
  const spinnerEl      = document.getElementById("_spin");

  carregarbtn.addEventListener("mouseover", () => {
    carregarbtn.style.background = "#474747";
  });
  carregarbtn.addEventListener("mouseout", () => {
    carregarbtn.style.background = "none";
  });
  fecharModal.addEventListener("mouseover", () => {
    fecharModal.style.background = "#474747";
  });
  fecharModal.addEventListener("mouseout", () => {
    fecharModal.style.background = "none";
  });

  const selected = new Set();
  const bodyModal = document.getElementById("_b");

  // Source ativo — atualizado sempre que um card de stats é clicado
  let currentSource = "notFollowing";

  fecharModal.onclick = () => {
    containerElemId.remove();
  };

  carregarbtn.onclick = () => {
    if (carregarbtn.innerHTML.includes("🔎")) {
      rc(currentSource);
      listEl.style.removeProperty("display");
      carregarbtn.style.fontSize = "24px";
      carregarbtn.style.marginBottom = "16px";
      carregarbtn.innerHTML = "_";
    } else {
      listEl.style.display = "none";
      carregarbtn.style.removeProperty("font-size");
      carregarbtn.style.removeProperty("margin-bottom");
      carregarbtn.innerHTML = "🔎";
    }
  };

  // Variáveis que serão preenchidas após o fetch
  let following = [];
  let followers = [];
  let notFollowing = [];

  try {
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

    const followerIds = new Set(followers.map((x) => x.id));
    notFollowing = following.filter((x) => !followerIds.has(x.id));

    // Esconde spinner após carregamento concluído
    spinnerEl.style.display = "none";

    progressBar.style.width = "100%";
    progressBar.style.background = notFollowing.length ? "#ff5c5c" : "#4caf50";

    // Exibe o action footer fixo agora que os dados estão disponíveis
    actionFooterEl.style.display = "block";

    // --- Cards de stats como botões clicáveis ---
    const cardBaseStyle =
      "background:#1a1a1a;border-radius:6px;padding:7px;text-align:center;cursor:pointer;border:1px solid transparent;transition:border-color .2s,background .2s";

    const cardDefs = [
      { id: "seguindo",    label: "Seguindo",   count: following.length,    color: "#b0ff3e", source: "following"    },
      { id: "seguidores",  label: "Seguidores", count: followers.length,    color: "#b0ff3e", source: "followers"    },
      { id: "nao-seguem",  label: "Não seguem", count: notFollowing.length, color: "#ff5c5c", source: "notFollowing" },
    ];

    statusEl.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px">' +
      cardDefs
        .map(
          ({ id, label, count, color }) =>
            '<div id="' + id + '" style="' + cardBaseStyle + '">' +
            '<div style="font-size:15px;font-weight:600;color:' + color + '">' + count + '</div>' +
            '<div style="font-size:10px;color:#555;margin-top:1px">' + label + '</div>' +
            '</div>',
        )
        .join("") +
      "</div>";

    // Vincula clique de cada card ao rc(source) correspondente
    cardDefs.forEach(({ id, source }) => {
      const btn = document.getElementById(id);
      btn.addEventListener("click", () => {
        // Destaque visual no card ativo
        cardDefs.forEach(({ id: otherId }) => {
          const other = document.getElementById(otherId);
          other.style.background = "#1a1a1a";
          other.style.borderColor = "transparent";
        });
        btn.style.background = "#333";
        btn.style.borderColor = "#444";

        // Atualiza source ativo e renderiza lista
        currentSource = source;
        selectTdsEl.innerHTML = '<button style="width:100%;padding:7px;background:#333;border:1px solid #444;border-radius:5px;color:#b0ff3e;font-size:11px;cursor:pointer">'
        +'<input type="checkbox" id="_selectTds" >' + 
          '<label for="_selectTds">Selecionar todos (' + 
          source.length + 
          ')</label></button>';
        const allIds = list.map((u) => u.id);
        const allSelected = allIds.every((id) => selected.has(id));
         
        listEl.innerHTML = "";
        footerEl.innerHTML = "";
        renderizacoes = 0;
        rc(source);

        // Garante que a lista esteja visível e o botão de toggle em modo "fechar"
        listEl.style.removeProperty("display");
        carregarbtn.style.fontSize = "24px";
        carregarbtn.style.marginBottom = "16px";
        carregarbtn.innerHTML = "_";
      });
    });

    if (!notFollowing.length) {
      listEl.innerHTML =
        '<p style="text-align:center;color:#555;font-size:13px;padding:2rem">Todos te seguem de volta!</p>';
    }

    // -------------------------------------------------------
    // rc(source) — renderiza até 20 itens da lista indicada
    // source: "following" | "followers" | "notFollowing"
    // -------------------------------------------------------
    let renderizacoes = 0;

    const getList = (source) => {
      if (source === "following") return following;
      if (source === "followers") return followers;
      return notFollowing;
    };

    // Habilita seleção de checkbox em todas as listas
    const updateCount = () => {
      ubtnEl.innerHTML = 'Unfollow (<span id="_cnt">' + selected.size + '</span>)';
    };

    selectTdsEl.addEventListener("onclick", (e) => {
      isTodos = true;
      isTodos = true ? false : true;
    }
  );
    function rc(source, isTodos) {
      const list = getList(source);

      list.slice(renderizacoes, renderizacoes + 20).forEach((u) => {

        const d = document.createElement("div");
        d.style.cssText =
          "display:flex;align-items:center;gap:8px;padding:7px 4px;border-radius:7px;cursor:pointer";
        d.onmouseenter = () => (d.style.background = "#1a1a1a");
        d.onmouseleave = () => (d.style.background = "");

        // Checkbox em todas as listas
        const lbl = document.createElement("label");
        lbl.style.cssText =
          "display:inline-block;padding:16px;cursor:pointer;display:flex;align-items:center";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.style.cssText =
          "display:inline-block;width:16px;height:16px;cursor:pointer;flex-shrink:0";
        if (selected.has(u.id)) cb.checked = true;
        lbl.appendChild(cb);
        cb.onchange = () => {
          if (cb.checked) selected.add(u.id);
          else            selected.delete(u.id);
          updateCount();
        };
        d.appendChild(lbl);

        const a = document.createElement("a");
        a.href = "https://www.instagram.com/" + u.un + "/";
        a.target = "_blank";
        a.style.cssText =
          "display:flex;align-items:center;gap:9px;flex:1;text-decoration:none;color:inherit;overflow:hidden;text-overflow:ellipsis";
        a.innerHTML =
          '<img src="' + u.p + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;background:#222" loading="lazy">' +
          '<div style="min-width:0">' +
          '<div style="font-size:13px;font-weight:500;color:#f0f0f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
          (u.fn || u.un) +
          '</div>' +
          '<div style="font-size:11px;color:#555">@' + u.un + '</div>' +
          '</div>';
        a.addEventListener("mouseenter", () => {
          a.style.background = "#66666660";
          a.style.borderRadius = "7px";
        });
        a.addEventListener("mouseleave", () => {
          setInterval(() => {
            a.style.background = "none";
            a.style.borderRadius = "0";
          }, 1500);
        });
        d.appendChild(a);

        // Clique na div (fora do checkbox/link) também marca o checkbox
        d.onclick = (e) => {
          if (lbl.contains(e.target) || a.contains(e.target)) return;
          cb.checked = !cb.checked;
          cb.onchange();
        };

        listEl.appendChild(d);
      });
      
      if (isTodos) {
      //TODO: implementar lógica de selecionar todos os checkboxes visíveis e atualizar o Set selected com os IDs correspondentes, além de atualizar o contador no botão de ação.
       const checkboxes = listEl.querySelectorAll('input[type="checkbox"]');
         checkboxes.forEach((cb, index) => {
          cb.checked = true;
          const item = list[renderizacoes + index];
          if (item) selected.add(item.id);
          
        });

      };

      renderizacoes = Math.min(renderizacoes + 20, list.length);
      if (renderizacoes < list.length) {

        footerEl.innerHTML =
          '<button style="width:100%;padding:7px;background:transparent;border:1px solid #2a2a2a;border-radius:5px;color:#666;font-size:11px;cursor:pointer">' +
          (list.length - renderizacoes) + " restantes</button>";
        footerEl.firstChild.onclick = () => {
          footerEl.innerHTML = "";
          rc(source);
        };
      } else {
        footerEl.innerHTML = "";
      }
    }

    // --- Wire do botão Exportar CSV ---
    exportBtnEl.onclick = () => {
      exportBtnEl.textContent = "Exportando...";
      setTimeout(() => {
        exportBtnEl.textContent = "Exportar CSV";
        const activeList = getList(currentSource);
        const lista =
          selected.size > 0
            ? activeList.filter((u) => selected.has(u.id))
            : activeList;
        const r = [
          ["usuario", "nome", "perfil"],
          ...lista.map((u) => [
            u.un,
            u.fn,
            "https://instagram.com/" + u.un + "/",
          ]),
        ];
        const nomeCsv =
          selected.size > 0
            ? "selecionados_" + currentSource + ".csv"
            : currentSource + ".csv";
        const anchor = document.createElement("a");
        anchor.href = URL.createObjectURL(
          new Blob(
            [r.map((x) => x.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(",")).join("\n")],
            { type: "text/csv" },
          ),
        );
        anchor.download = nomeCsv;
        anchor.click();
      }, 1000);
    };

    // --- Wire do botão Unfollow ---
    // "followers"              → removeFollowerById (remove seguidor do seu perfil)
    // "following" | "notFollowing" → unfollowById  (deixa de seguir)
    ubtnEl.onclick = async () => {
      if (!selected.size) {
        alert("Selecione perfis para executar a ação");
        return;
      }
      const isRemoveFollower = currentSource === "followers";
      const acao = isRemoveFollower ? "remover seguidor" : "parar de seguir";
      if (!confirm("Ação: " + acao + " em " + selected.size + " perfis? Isso levará alguns minutos...")) return;

      const ids = Array.from(selected);
      let ok = 0, err = 0;
      for (const id of ids) {
        try {
          const success = isRemoveFollower
            ? await removeFollowerById(id)
            : await unfollowById(id);
          if (success) ok++; else err++;
        } catch {
          err++;
        }
        ubtnEl.textContent =
          (isRemoveFollower ? "Removendo... " : "Deixando de seguir... ") + ok + "/" + ids.length;
        await sleep(300);
      }
      alert("Concluído: " + ok + " OK, " + err + " erros");
      containerElemId.remove();
    };

  } catch (e) {
    spinnerEl.style.display = "none";
    statusEl.style.color = "#ff5c5c";
    statusEl.textContent = "Erro: " + e.message;
  }
})();