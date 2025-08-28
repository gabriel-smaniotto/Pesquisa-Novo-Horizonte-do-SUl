(function () {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, TABLE } = window.APP_CONFIG;
  const { createClient } = window.supabase;
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const state = { meta: null, perfil: {}, respostas: {} };
  const elPerfil = document.getElementById("formPerfil");
  const elQuestoes = document.getElementById("formQuestoes");
  const elStatus = document.getElementById("status");

  document.addEventListener("DOMContentLoaded", boot);

  async function boot() {
    try {
      const res = await fetch("./data/survey.json", { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao carregar survey.json");
      state.meta = await res.json();
      renderPerfil();
    } catch (e) {
      setStatus("Erro ao carregar a pesquisa.", true);
      console.error(e);
    }
  }

  function setStatus(msg, isError=false) { elStatus.innerHTML = `<p class="${isError?'error':''}">${msg}</p>`; }

  // ---------- PERFIL ----------
  function renderPerfil() {
    const { perfil, schools } = state.meta;
    elPerfil.innerHTML = "";
    const fs = document.createElement("fieldset");
    fs.innerHTML = `<legend>Perfil</legend>`;
    elPerfil.appendChild(fs);

    perfil.forEach(q => fs.appendChild(renderQuestion(q, { schools })));

    const btn = document.createElement("button");
    btn.type = "button"; btn.textContent = "Continuar"; btn.onclick = onPerfilNext;
    elPerfil.appendChild(btn);
  }

  function onPerfilNext() {
    const data = collectForm(elPerfil);
    const faltando = validateRequired(state.meta.perfil, data);
    if (faltando.length) { setStatus("Responda o Perfil: " + faltando.join(", "), true); return; }
    if (!data.escolas_atuacao || data.escolas_atuacao.length === 0) {
      setStatus("Selecione ao menos uma escola.", true); return;
    }
    state.perfil = data;
    elPerfil.style.display = "none";
    renderQuestoes();
    elQuestoes.style.display = "";
    setStatus("");
  }

  // ---------- QUESTÕES ----------
  function renderQuestoes() {
    const { questions, schools } = state.meta;
    elQuestoes.innerHTML = "";
    const fs = document.createElement("fieldset");
    fs.innerHTML = `<legend>Questionário</legend>`;
    elQuestoes.appendChild(fs);

    questions.forEach(q => {
      if (q.docenteOnly && state.perfil.funcao !== "Docente") return;
      fs.appendChild(renderQuestion(q, { schools, perfil: state.perfil }));
    });

    const actions = document.createElement("div"); actions.style.marginTop = "12px";
    const btnBack = document.createElement("button");
    btnBack.type="button"; btnBack.textContent="Voltar ao Perfil";
    btnBack.onclick = () => { elQuestoes.style.display = "none"; elPerfil.style.display = ""; };

    const btnSubmit = document.createElement("button");
    btnSubmit.type="button"; btnSubmit.style.marginLeft="8px"; btnSubmit.textContent="Enviar";
    btnSubmit.onclick = onSubmit;

    actions.appendChild(btnBack); actions.appendChild(btnSubmit);
    elQuestoes.appendChild(actions);
  }

  // ---------- RENDER ----------
  function renderQuestion(q, ctx) {
    const wrap = document.createElement("div"); wrap.className = "row";
    const label = document.createElement("label");
    label.innerHTML = `<strong>${q.title || q.name}</strong>${q.required ? " *" : ""}`;
    wrap.appendChild(label);

    if (q.type === "radiogroup") {
      const group = document.createElement("div");
      (q.choices||[]).forEach(opt => {
        const id = `${q.name}_${opt.value ?? opt}`;
        const v = opt.value ?? opt, t = opt.text ?? opt;
        group.innerHTML += `<div><input type="radio" name="${q.name}" id="${id}" value="${v}">
                            <label for="${id}">${t}</label></div>`;
      });
      wrap.appendChild(group);
    }

    if (q.type === "checkbox") {
      const group = document.createElement("div");
      if (q.choicesFrom === "schools") {
        (ctx.schools||[]).forEach(s => {
          const id = `${q.name}_${s.value}`;
          group.innerHTML += `<div><input type="checkbox" name="${q.name}" id="${id}" value="${s.value}">
                              <label for="${id}">${s.text}</label></div>`;
        });
        if (q.columns === 2) group.classList.add("columns-2");
      } else {
        (q.choices||[]).forEach(opt => {
          const id = `${q.name}_${opt.value ?? opt}`;
          const v = opt.value ?? opt, t = opt.text ?? opt;
          group.innerHTML += `<div><input type="checkbox" name="${q.name}" id="${id}" value="${v}">
                              <label for="${id}">${t}</label></div>`;
        });
      }
      wrap.appendChild(group);
    }

    if (q.type === "matrixBySchool") {
      const selected = state.perfil.escolas_atuacao || [];
      if (selected.length === 0) {
        const small = document.createElement("div"); small.className="hint";
        small.textContent = "Selecione escolas no Perfil para responder esta seção.";
        wrap.appendChild(small);
      } else {
        selected.forEach(escolaId => {
          const escola = (ctx.schools||[]).find(s => s.value===escolaId);
          const legend = document.createElement("div"); legend.style.marginTop="8px";
          legend.innerHTML = `<em>${escola ? escola.text : escolaId}</em>`;
          wrap.appendChild(legend);
          const group = document.createElement("div");
          (q.choices||[]).forEach(opt => {
            const id = `${q.name}_${escolaId}_${opt.value}`;
            group.innerHTML += `<div><input type="radio" name="${q.name}[${escolaId}]" id="${id}" value="${opt.value}">
                                <label for="${id}">${opt.text}</label></div>`;
          });
          wrap.appendChild(group);
        });
      }
    }

    return wrap;
  }

  // ---------- COLETA & VALIDAÇÃO ----------
  function collectForm(root) {
    const data = {};
    const fd = new FormData(root);
    for (const [k,v] of fd.entries()) {
      if (k.endsWith("]")) {
        const m = k.match(/^(.+?)\[(.+?)\]$/);
        if (m) { const base=m[1], key=m[2]; data[base]=data[base]||{}; data[base][key]=v; }
      } else if (data[k]!=null) {
        if (!Array.isArray(data[k])) data[k]=[data[k]];
        data[k].push(v);
      } else { data[k]=v; }
    }
    return data;
  }

  function validateRequired(schema, values) {
    const faltando = [];
    schema.forEach(q => {
      if (!q.required) return;
      const v = values[q.name];
      if (q.type === "checkbox") {
        if (!Array.isArray(v) || v.length===0) faltando.push(q.name);
      } else if (v==null || v==="") faltando.push(q.name);
    });
    return faltando;
  }

  // ---------- ENVIO ----------
  async function onSubmit() {
    // coleta respostas do questionário
    state.respostas = collectForm(elQuestoes);

    // valida obrigatórios nas questions ativas
    const active = (state.meta.questions||[]).filter(q => {
      if (q.docenteOnly && state.perfil.funcao !== "Docente") return false;
      return true;
    });

    const faltando = [];
    active.forEach(q => {
      if (!q.required) return;
      if (q.type === "matrixBySchool") {
        const sel = state.perfil.escolas_atuacao || [];
        const obj = state.respostas[q.name] || {};
        if (!sel.every(id => obj[id]!=null && obj[id] !== "")) faltando.push(q.name);
      } else {
        const v = state.respostas[q.name];
        if (v==null || v==="" || (Array.isArray(v) && v.length===0)) faltando.push(q.name);
      }
    });
    if (faltando.length) { setStatus("Responda: " + faltando.join(", "), true); return; }

    // monta payload final
    const payload = { perfil: state.perfil, respostas: state.respostas };

    try {
      setStatus("Enviando…");
      const { error } = await db.from(TABLE).insert([{ dados: payload }]);
      if (error) throw error;
      setStatus("Obrigado! Suas respostas foram salvas.");
      elQuestoes.querySelectorAll("input,textarea,button").forEach(x => x.disabled = true);
    } catch (e) {
      console.error(e);
      setStatus("Erro ao salvar. Tente novamente.", true);
    }
  }
})();
