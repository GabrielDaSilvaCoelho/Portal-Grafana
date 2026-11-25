"use strict";

const cards = document.querySelector("#cards");
const busca = document.querySelector("#busca");
const pasta = document.querySelector("#pasta");
const status = document.querySelector("#status");
const erro = document.querySelector("#erro");
const vazio = document.querySelector("#vazio");
const visualizador = document.querySelector("#visualizador");
const dashboardFrame = document.querySelector("#dashboard-frame");
let dashboardAberto = null;
let dashboards = [];
let carregado = false;
let consultando = false;
let carregando = false;
let consultandoEstado = false;
const resumos = new Map();

function abrirDashboard(item) {
  const url = new URL(item.url);
  if (!["http:", "https:"].includes(url.protocol)) return;
  dashboardAberto = { uid: item.uid, url: url.href };
  document.querySelector("#visualizador-titulo").textContent = item.titulo;
  dashboardFrame.title = "Dashboard " + item.titulo;
  // Preserva organização, período e variáveis; oculta a navegação do Grafana.
  url.searchParams.set("kiosk", "");
  if (!url.searchParams.has("refresh")) url.searchParams.set("refresh", "30s");
  const aviso = document.querySelector("#aviso-endereco");
  aviso.replaceChildren();
  aviso.hidden = true;
  const locais = new Set(["localhost", "127.0.0.1"]);
  if (locais.has(url.hostname) && locais.has(location.hostname) && url.hostname !== location.hostname) {
    const portal = new URL(location.href);
    portal.hostname = url.hostname;
    const link = elemento("a", "", "Abrir portal em " + url.hostname);
    link.href = portal.href;
    aviso.append("Para usar sua sessão do Grafana nesta janela, abra os dois com o mesmo endereço. ", link, ".");
    aviso.hidden = false;
  }
  visualizador.querySelector("details").open = false;
  dashboardFrame.src = url.href;
  if (!visualizador.open) visualizador.showModal();
  document.body.classList.add("dashboard-aberto");
}

document.querySelector("#fechar-dashboard").addEventListener("click", () => visualizador.close());
document.querySelector("#recarregar-dashboard").addEventListener("click", () => {
  if (dashboardAberto) dashboardFrame.src = dashboardFrame.src;
});
visualizador.addEventListener("close", () => {
  dashboardFrame.removeAttribute("src");
  document.body.classList.remove("dashboard-aberto");
  if (dashboardAberto) {
    const card = [...cards.querySelectorAll(".card")].find(card => card.dataset.uid === dashboardAberto.uid);
    card?.querySelector(".card-principal")?.focus();
  }
  dashboardAberto = null;
});

function preencherIndicadores(card, uid) {
  const dados = resumos.get(uid);
  card.querySelector(".valor-eficiencia").textContent = typeof dados?.eficiencia === "number"
    ? dados.eficiencia.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "%" : "—";
  const estado = card.querySelector(".valor-estado");
  estado.textContent = dados?.estado?.texto || (dados ? "Indisponível" : "Consultando…");
  estado.className = "valor-estado " + (dados?.estado?.tom || "semsinal");
  const observacao = card.querySelector(".indicador-aviso");
  observacao.textContent = [...(dados?.eficienciaAvisos || []), ...(dados?.estadoAvisos || [])].join(" ") || (dados?.eficienciaAtualizadaEm
    ? "Eficiência atualizada às " + horario(dados.eficienciaAtualizadaEm) : "Buscando indicadores…");
  card.querySelector(".estado-horario").textContent = dados?.estado?.recebidoEm
    ? "Leitura de " + horario(dados.estado.recebidoEm)
    : dados?.estadoAtualizadoEm ? "Consultado às " + horario(dados.estadoAtualizadoEm) : "";
}

function horario(valor) {
  return new Date(valor).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function normalizar(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function elemento(tag, classe, texto) {
  const no = document.createElement(tag);
  no.className = classe;
  no.textContent = texto;
  return no;
}

function renderizar() {
  const termo = normalizar(busca.value.trim());
  const lista = dashboards.filter(item =>
    (!pasta.value || item.pasta === pasta.value) &&
    normalizar([item.titulo, item.pasta, ...item.tags].join(" ")).includes(termo)
  );
  const fragmento = document.createDocumentFragment();
  for (const item of lista) {
    const card = elemento("article", "card", "");
    card.dataset.uid = item.uid;
    const principal = elemento("button", "card-principal", "");
    principal.type = "button";
    principal.setAttribute("aria-label", "Visualizar " + item.titulo);
    principal.setAttribute("aria-haspopup", "dialog");
    principal.addEventListener("click", () => abrirDashboard(item));
    const topo = elemento("div", "card-top", "");
    const seta = elemento("span", "seta", "⤢");
    seta.setAttribute("aria-hidden", "true");
    topo.append(elemento("span", "card-pasta", item.pasta), seta);
    principal.append(topo, elemento("span", "card-titulo", item.titulo));
    if (item.tags.length) {
      const tags = elemento("div", "tags", "");
      for (const tag of item.tags.slice(0, 4)) tags.append(elemento("span", "tag", tag));
      principal.append(tags);
    }
    const indicadores = elemento("div", "indicadores", "");
    const eficiencia = elemento("div", "metrica", "");
    eficiencia.append(elemento("span", "metrica-label", "Eficiência"), elemento("strong", "valor-eficiencia", "—"));
    const estado = elemento("div", "metrica", "");
    estado.append(elemento("span", "metrica-label", "Estado atual"), elemento("strong", "valor-estado semsinal", "Consultando…"), elemento("span", "estado-horario", ""));
    indicadores.append(eficiencia, estado);
    principal.append(indicadores, elemento("span", "indicador-aviso", ""));
    const acoes = elemento("div", "card-acoes", "");
    const ver = elemento("button", "card-ver", "Ver dashboard");
    ver.type = "button";
    ver.addEventListener("click", () => abrirDashboard(item));
    const externo = elemento("a", "card-externo", "Ir para o Grafana ↗");
    externo.href = item.url;
    externo.target = "_blank";
    externo.rel = "noopener noreferrer";
    acoes.append(ver, externo);
    card.append(principal, acoes);
    preencherIndicadores(card, item.uid);
    fragmento.append(card);
  }
  cards.replaceChildren(fragmento);
  document.querySelector("#quantidade").textContent = String(dashboards.length);
  document.querySelector("#rotulo-quantidade").textContent = dashboards.length === 1 ? "dashboard disponível" : "dashboards disponíveis";
  status.textContent = `${lista.length} ${lista.length === 1 ? "dashboard" : "dashboards"}${lista.length !== dashboards.length ? ` de ${dashboards.length}` : ""}`;
  vazio.hidden = lista.length > 0 || !carregado;
  document.querySelector("#titulo-vazio").textContent = dashboards.length ? "Nenhum dashboard encontrado" : "Nenhum dashboard disponível";
  document.querySelector("#texto-vazio").textContent = dashboards.length
    ? "Tente outro nome ou selecione outra pasta."
    : "Confira se a conta conectada tem acesso aos dashboards da organização.";
}

async function carregar() {
  if (carregando) return;
  carregando = true;
  cards.setAttribute("aria-busy", "true");
  erro.hidden = true;
  status.textContent = "Consultando o Grafana…";
  try {
    const resposta = await fetch("/api/dashboards", { cache: "no-store", signal: AbortSignal.timeout(25000) });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || "Não foi possível carregar os dashboards.");
    const mudou = JSON.stringify(dashboards) !== JSON.stringify(dados.dashboards);
    dashboards = dados.dashboards;
    carregado = true;
    const selecionada = pasta.value;
    pasta.replaceChildren(new Option("Todas as pastas", ""));
    for (const nome of [...new Set(dashboards.map(item => item.pasta))].sort((a, b) => a.localeCompare(b, "pt-BR"))) {
      pasta.add(new Option(nome, nome));
    }
    pasta.value = [...pasta.options].some(item => item.value === selecionada) ? selecionada : "";
    const grafana = document.querySelector("#abrir-grafana");
    grafana.href = dados.grafanaUrl;
    grafana.hidden = false;
    document.querySelector("#horario").textContent = "Atualizado às " + new Date(dados.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (mudou || !cards.children.length) renderizar();
    else status.textContent = `${cards.children.length} dashboards`;
    await carregarIndicadores();
  } catch (falha) {
    erro.textContent = ["TimeoutError", "AbortError"].includes(falha.name)
      ? "A consulta demorou para responder. Tentaremos novamente automaticamente."
      : falha.message === "Failed to fetch"
        ? "O portal perdeu a conexão. Confira se a janela que iniciou o portal continua aberta."
        : falha.message;
    erro.hidden = false;
    status.textContent = carregado ? "Exibindo a última lista carregada" : "Aguardando conexão com o Grafana";
    vazio.hidden = true;
  } finally {
    carregando = false;
    cards.setAttribute("aria-busy", "false");
  }
}

async function carregarIndicadores() {
  if (consultando) return;
  consultando = true;
  const pendentes = [...dashboards];
  async function consultar() {
    while (pendentes.length) {
      const item = pendentes.shift();
      try {
        const resposta = await fetch(`/api/dashboards/${encodeURIComponent(item.uid)}/resumo`, { cache: "no-store", signal: AbortSignal.timeout(45000) });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.erro || "Falha ao consultar os indicadores.");
        const anterior = resumos.get(item.uid) || {};
        const maisRecente = !anterior.estadoAtualizadoEm || Date.parse(dados.atualizadoEm) >= Date.parse(anterior.estadoAtualizadoEm);
        resumos.set(item.uid, { ...anterior, eficiencia: dados.eficiencia, eficienciaAtualizadaEm: dados.atualizadoEm,
          eficienciaAvisos: dados.avisos.filter(aviso => /efici[eê]ncia/i.test(aviso)),
          ...(maisRecente ? { estado: dados.estado, estadoAtualizadoEm: dados.atualizadoEm,
            estadoAvisos: dados.avisos.filter(aviso => !/efici[eê]ncia/i.test(aviso)) } : {}) });
      } catch (erro) {
        resumos.set(item.uid, { ...resumos.get(item.uid), eficiencia: null, eficienciaAvisos: [erro.name === "TimeoutError" ? "A consulta da eficiência demorou para responder." : erro.message] });
      }
      for (const card of cards.querySelectorAll(".card")) {
        if (card.dataset.uid === item.uid) preencherIndicadores(card, item.uid);
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(3, pendentes.length) }, consultar));
  } finally {
    consultando = false;
  }
}

async function carregarEstados() {
  if (consultandoEstado || !carregado) return;
  consultandoEstado = true;
  const pendentes = [...dashboards];
  async function consultar() {
    while (pendentes.length) {
      const item = pendentes.shift();
      try {
        const resposta = await fetch(`/api/dashboards/${encodeURIComponent(item.uid)}/estado`, { cache: "no-store", signal: AbortSignal.timeout(45000) });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.erro || "Falha ao consultar o estado.");
        const anterior = resumos.get(item.uid) || {};
        if (!anterior.estadoAtualizadoEm || Date.parse(dados.atualizadoEm) >= Date.parse(anterior.estadoAtualizadoEm)) {
          resumos.set(item.uid, { ...anterior, estado: dados.estado, estadoAtualizadoEm: dados.atualizadoEm, estadoAvisos: dados.avisos });
        }
      } catch {
        resumos.set(item.uid, { ...resumos.get(item.uid), estado: null, estadoAtualizadoEm: new Date().toISOString(), estadoAvisos: ["Estado indisponível. Tentando reconectar…"] });
      }
      for (const card of cards.querySelectorAll(".card")) {
        if (card.dataset.uid === item.uid) preencherIndicadores(card, item.uid);
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(3, pendentes.length) }, consultar));
  } finally {
    consultandoEstado = false;
  }
}

busca.addEventListener("input", renderizar);
pasta.addEventListener("change", renderizar);
carregar();
setInterval(() => { if (!document.hidden && carregado) carregarIndicadores(); }, 30000);
setInterval(() => { if (!document.hidden) carregarEstados(); }, 5000);
setInterval(() => { if (!document.hidden) carregar(); }, 60000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) { carregar(); carregarEstados(); }
});
