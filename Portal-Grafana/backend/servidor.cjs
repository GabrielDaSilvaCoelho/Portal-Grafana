const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { consultarResumo } = require("./resumo.cjs");

function endereco(valor) {
  const url = new URL(valor);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("Informe uma URL HTTP ou HTTPS do Grafana, sem usuário, senha ou parâmetros.");
  }
  url.pathname = url.pathname.replace(/\/$/, "") + "/";
  return url;
}

function criarServidor(config = {}) {
  const grafana = endereco(config.url || process.env.GRAFANA_URL || "http://127.0.0.1:3000");
  const publico = endereco(config.publicUrl || process.env.GRAFANA_PUBLIC_URL || grafana.href);
  const token = (config.token ?? process.env.GRAFANA_TOKEN ?? "").trim();
  const arquivos = new Map([
    ["/", ["index.html", "text/html; charset=utf-8"]],
    ["/estilo.css", ["estilo.css", "text/css; charset=utf-8"]],
    ["/portal.js", ["portal.js", "application/javascript; charset=utf-8"]],
    ["/logo-triade.png", ["logo-triade.png", "image/png"]],
  ]);
  let consultaEmCurso;
  const resumos = new Map();
  const dashboards = new Map();

  function documento(uid) {
    const existente = dashboards.get(uid);
    if (existente && Date.now() - existente.criado < 60000) return existente.valor;
    const entrada = { criado: Date.now() };
    entrada.valor = requisitar(`api/dashboards/uid/${encodeURIComponent(uid)}`)
      .catch(erro => { if (dashboards.get(uid) === entrada) dashboards.delete(uid); throw erro; });
    dashboards.delete(uid);
    dashboards.set(uid, entrada);
    if (dashboards.size > 1000) dashboards.delete(dashboards.keys().next().value);
    return entrada.valor;
  }

  async function requisitar(rota, options = {}) {
    const headers = { Accept: "application/json", "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const resposta = await fetch(new URL(rota, grafana), { ...options, headers, signal: AbortSignal.timeout(20000), redirect: "error" });
    if (resposta.status === 401 || resposta.status === 403) throw new Error("Confira se a conta do token tem acesso ao dashboard e à fonte de dados.");
    if (!resposta.ok) throw new Error(`O Grafana respondeu com HTTP ${resposta.status}.`);
    if (!(resposta.headers.get("content-type") || "").includes("application/json")) throw new Error("O Grafana respondeu com uma página de login.");
    return resposta.json();
  }

  async function resumo(uid, somenteEstado = false) {
    const chave = `${uid}:${somenteEstado ? "estado" : "resumo"}`;
    const existente = resumos.get(chave);
    if (existente && Date.now() - existente.criado < (somenteEstado ? 2000 : 15000)) return existente.valor;
    const entrada = { criado: Date.now() };
    entrada.valor = documento(uid)
      .then(dados => consultarResumo(dados, requisitar, { somenteEstado }))
      .catch(erro => { if (resumos.get(chave) === entrada) resumos.delete(chave); throw erro; });
    resumos.delete(chave);
    resumos.set(chave, entrada);
    if (resumos.size > 1000) resumos.delete(resumos.keys().next().value);
    return entrada.valor;
  }

  async function buscarDashboards() {
    const encontrados = new Map();
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const signal = AbortSignal.timeout(20000);
    for (let pagina = 1; pagina <= 100; pagina += 1) {
      const url = new URL("api/search", grafana);
      url.search = new URLSearchParams({ type: "dash-db", limit: "1000", page: String(pagina), sort: "alpha-asc" });
      const resposta = await fetch(url, { headers, signal, redirect: "error" });
      if (resposta.status === 401 || resposta.status === 403) {
        throw new Error("O Grafana recusou o acesso. Confira o token de uma conta de serviço com permissão de leitura dos dashboards.");
      }
      if (!resposta.ok) throw new Error(`O Grafana respondeu com HTTP ${resposta.status}. Confira o endereço configurado.`);
      const tipo = resposta.headers.get("content-type") || "";
      if (!tipo.includes("application/json")) {
        throw new Error("O endereço respondeu com uma página de login. Confira a URL do Grafana e o token de leitura.");
      }
      const dados = await resposta.json();
      if (!Array.isArray(dados)) throw new Error("A resposta do Grafana não contém uma lista de dashboards.");
      for (const item of dados) {
        if (item.type !== "dash-db" || typeof item.uid !== "string" || !item.uid) continue;
        const link = new URL(`d/${encodeURIComponent(item.uid)}`, publico);
        // Mantém organização, variáveis e demais opções de navegação fornecidas pelo Grafana.
        if (typeof item.url === "string") {
          try {
            const original = new URL(item.url, grafana);
            const prefixo = grafana.pathname;
            const caminho = original.pathname.startsWith(prefixo)
              ? original.pathname.slice(prefixo.length)
              : original.pathname.replace(/^\//, "");
            const esperado = `d/${encodeURIComponent(item.uid)}`;
            if (original.origin === grafana.origin && (caminho === esperado || caminho.startsWith(esperado + "/"))) {
              link.pathname = publico.pathname + caminho;
              link.search = original.search;
              link.hash = original.hash;
            }
          } catch { /* O UID fornece um link válido quando a URL original é inválida. */ }
        }
        encontrados.set(item.uid, {
          uid: item.uid,
          titulo: typeof item.title === "string" ? item.title : "Dashboard sem título",
          pasta: typeof item.folderTitle === "string" && item.folderTitle ? item.folderTitle : "Sem pasta",
          tags: Array.isArray(item.tags) ? item.tags.filter(tag => typeof tag === "string") : [],
          url: link.href,
        });
      }
      if (dados.length < 1000) {
        return {
          dashboards: [...encontrados.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR")),
          grafanaUrl: publico.href,
          atualizadoEm: new Date().toISOString(),
        };
      }
    }
    throw new Error("A lista ultrapassou 100 páginas. Ajuste as permissões da conta de serviço para os dashboards que deseja listar.");
  }

  return http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; frame-src ${publico.origin}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`);
    try {
      if (req.method !== "GET") {
        res.writeHead(405, { Allow: "GET" });
        res.end();
        return;
      }
      const rota = new URL(req.url, "http://portal.local").pathname;
      const indicador = /^\/api\/dashboards\/([^/]+)\/(resumo|estado)$/.exec(rota);
      if (indicador) {
        try {
          const dados = await resumo(decodeURIComponent(indicador[1]), indicador[2] === "estado");
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(dados));
        } catch {
          res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ erro: "Não foi possível consultar os indicadores deste dashboard. Confira o acesso da conta ao dashboard e à fonte de dados." }));
        }
        return;
      }
      if (rota === "/api/dashboards") {
        try {
          if (!consultaEmCurso) consultaEmCurso = buscarDashboards().finally(() => { consultaEmCurso = undefined; });
          const dados = await consultaEmCurso;
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(dados));
        } catch (erro) {
          const mensagem = ["TimeoutError", "AbortError"].includes(erro.name)
            ? "O Grafana demorou para responder. Verifique se ele está em execução e tente atualizar."
            : erro.message === "fetch failed" || erro.cause
              ? "Não foi possível conectar ao Grafana. Confira o endereço, a porta e se o serviço está em execução."
              : erro.message;
          res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ erro: mensagem }));
        }
        return;
      }
      const arquivo = arquivos.get(rota);
      if (!arquivo) {
        res.writeHead(404);
        res.end("Página não encontrada.");
        return;
      }
      const conteudo = await fs.readFile(path.join(__dirname, "..", "frontend", arquivo[0]));
      res.writeHead(200, { "Content-Type": arquivo[1] });
      res.end(conteudo);
    } catch {
      res.writeHead(500);
      res.end("Não foi possível abrir a página.");
    }
  });
}

if (require.main === module) {
  const porta = Number(process.env.PORTAL_PORT || "8090");
  const host = process.env.PORTAL_HOST || "127.0.0.1";
  try {
    if (!Number.isInteger(porta) || porta < 1 || porta > 65535) throw new Error("A porta deve estar entre 1 e 65535.");
    const servidor = criarServidor();
    servidor.on("error", erro => {
      console.error(erro.code === "EADDRINUSE" ? `A porta ${porta} já está em uso. Defina outra em PORTAL_PORT.` : "Não foi possível iniciar o portal.");
      process.exitCode = 1;
    });
    servidor.listen(porta, host, () => console.log(`Portal disponível em http://${host}:${porta}\nMantenha esta janela aberta. Ctrl+C encerra o portal.`));
  } catch (erro) {
    console.error(erro.message);
    process.exitCode = 1;
  }
}

module.exports = { criarServidor };
