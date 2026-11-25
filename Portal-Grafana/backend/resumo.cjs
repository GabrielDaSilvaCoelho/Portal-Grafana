function normalizar(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function modelo(dados) {
  const dashboard = dados.dashboard || dados.spec || dados;
  if (dashboard.elements) {
    return {
      variaveis: (dashboard.variables || []).map(v => v.spec),
      tempo: dashboard.timeSettings,
      paineis: Object.values(dashboard.elements).filter(p => p.kind === "Panel").map(({ spec: p }) => ({
        title: p.title,
        fieldConfig: p.vizConfig?.spec?.fieldConfig,
        targets: (p.data?.spec?.queries || []).filter(q => !q.spec.hidden).map(({ spec: q }) => ({
          ...q.query.spec, refId: q.refId,
          datasource: { uid: q.query.datasource?.name, type: q.query.group },
        })),
      })),
    };
  }
  function listar(paineis) {
    return (paineis || []).flatMap(p => [p, ...listar(p.panels)]);
  }
  return { variaveis: dashboard.templating?.list || [], tempo: dashboard.time, paineis: listar(dashboard.panels) };
}

function interpolar(texto, variaveis) {
  const resultado = texto.replace(/\$\{([\w]+)(?::([\w]+))?\}|\$([a-zA-Z_]\w*)/g, (original, nome, formato, simples) => {
    const variavel = variaveis.get(nome || simples);
    if (variavel === undefined || variavel === null || variavel === "" || Array.isArray(variavel)) throw new Error("Salve uma seleção única das variáveis no dashboard do Grafana.");
    if (formato === "doublequote" || formato === "json") return JSON.stringify(String(variavel));
    if (formato && formato !== "raw") throw new Error("O formato de uma variável deste painel precisa de configuração no portal.");
    return String(variavel);
  });
  return resultado;
}

function instante(texto, agora, inicioDia) {
  if (!texto || texto === "now") return agora;
  if (texto === "now/d") return inicioDia;
  const relativo = /^now-(\d+)([smhdw])$/.exec(texto);
  if (relativo) return agora - Number(relativo[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 }[relativo[2]];
  const absoluto = /^\d+$/.test(texto) ? Number(texto) : Date.parse(texto);
  if (!Number.isFinite(absoluto)) throw new Error("O período deste dashboard precisa de configuração no portal.");
  return absoluto;
}

function extrairValor(dados, nomes) {
  for (const resultado of Object.values(dados.results || {})) {
    if (resultado.error || (resultado.status && resultado.status >= 400)) {
      throw new Error("O Grafana não conseguiu consultar a fonte de dados deste indicador.");
    }
    for (const frame of resultado.frames || []) {
      const campos = frame.schema?.fields || [];
      let indice = -1;
      for (const nome of nomes) {
        indice = campos.findIndex(c => normalizar(c.name) === normalizar(nome));
        if (indice >= 0) break;
      }
      if (indice < 0) continue;
      const valores = frame.data?.values?.[indice] || [];
      for (let i = valores.length - 1; i >= 0; i -= 1) {
        if (valores[i] !== null && valores[i] !== undefined) return { valor: valores[i], campo: campos[indice] };
      }
    }
  }
  return null;
}

function consultaAtual(query) {
  const bucket = /from\s*\(\s*bucket:\s*("(?:[^"\\]|\\.)*")/.exec(query)?.[1];
  const dispositivo = /r\.dispositivo_id\s*==\s*("(?:[^"\\]|\\.)*")/.exec(query)?.[1];
  if (!bucket || !dispositivo || !query.includes('"DI1"') || !query.includes('"DI2"')) return null;
  return [
    'import "array"',
    'agora = now()',
    'leituras = from(bucket: ' + bucket + ')',
    '  |> range(start: -3m, stop: agora)',
    '  |> filter(fn: (r) => r._measurement == "estado_maquina" and r._field == "ligado" and',
    '    r.dispositivo_id == ' + dispositivo + ' and (r.canal == "DI1" or r.canal == "DI2") and (r._value == 0 or r._value == 1))',
    '  |> keep(columns: ["_time", "_value", "canal"])',
    '  |> group(columns: ["canal"]) |> sort(columns: ["_time"]) |> last()',
    'vazio = array.from(rows: [{_time: time(v: 0), canal: "DI1", _value: -1}, {_time: time(v: 0), canal: "DI2", _value: -1}])',
    'canais = union(tables: [vazio, leituras])',
    '  |> group(columns: ["canal"]) |> sort(columns: ["_time"]) |> last()',
    'valores = canais |> map(fn: (r) => ({_time: agora, canal: r.canal, _value: if int(v: agora) - int(v: r._time) > int(v: 2m) then -1 else int(v: r._value)}))',
    'horarios = canais |> map(fn: (r) => ({_time: agora, canal: r.canal + "Horario", _value: int(v: r._time)}))',
    'union(tables: [valores, horarios])',
    '  |> group() |> pivot(rowKey: ["_time"], columnKey: ["canal"], valueColumn: "_value")',
    '  |> map(fn: (r) => ({_time: r._time,',
    '    Estado: if r.DI1 == 0 and r.DI2 == 1 then 3 else if r.DI1 == 0 then 0',
    '      else if r.DI1 == -1 or r.DI2 == -1 then -1 else if r.DI2 == 1 then 2 else 1,',
    '    RecebidoEm: time(v: if r.DI1 == 0 then r.DI1Horario else if r.DI1Horario < r.DI2Horario then r.DI1Horario else r.DI2Horario)',
    '  }))',
  ].join("\n");
}
async function consultarResumo(dados, requisitar, options = {}) {
  const dashboard = modelo(dados);
  const variaveis = new Map(dashboard.variaveis.map(v => [v.name, v.current?.value ?? (v.type === "constant" || v.kind === "ConstantVariable" ? v.query : undefined)]));
  const agora = Date.now();
  // Os dashboards OEE usam o dia operacional em UTC−3.
  const inicioDia = Math.floor((agora - 3 * 3600000) / 86400000) * 86400000 + 3 * 3600000;
  const inicio = instante(dashboard.tempo?.from || "now/d", agora, inicioDia);
  const fim = Math.min(instante(dashboard.tempo?.to || "now", agora, inicioDia), agora);

  async function executar(painel, atual = false) {
    const consultas = (painel.targets || []).filter(t => !t.hide);
    if (!consultas.length) throw new Error("Este painel não possui uma consulta disponível.");
    const queries = consultas.map((t, i) => {
      const ds = t.datasource || painel.datasource;
      const uid = typeof ds === "string" ? ds : ds?.uid;
      if (!uid || !t.query || (ds?.type && ds.type !== "influxdb")) {
        throw new Error("O resumo automático usa painéis com consultas Flux do InfluxDB.");
      }
      const original = interpolar(t.query, variaveis);
      const direta = atual ? consultaAtual(original) : null;
      const query = (direta || original)
        .replace(/\bv\.timeRangeStart\b/g, `time(v: "${new Date(inicio).toISOString()}")`)
        .replace(/\bv\.timeRangeStop\b/g, `time(v: "${new Date(fim).toISOString()}")`)
        .replace(/\bv\.windowPeriod\b/g, "30s");
      return { ...t, datasource: { type: "influxdb", uid: interpolar(uid, variaveis) }, query,
        refId: t.refId || String.fromCharCode(65 + i), intervalMs: 30000, maxDataPoints: 500 };
    });
    return requisitar("api/ds/query", { method: "POST", body: JSON.stringify({ queries, from: String(inicio), to: String(fim) }) });
  }

  const eficiencia = dashboard.paineis.find(p => {
    const titulo = normalizar(p.title || "");
    return titulo.includes("eficiencia") && !titulo.includes("historico");
  });
  const estado = dashboard.paineis.find(p => /estado atual|status da (bomba|maquina)/.test(normalizar(p.title || "")));
  const resultado = { eficiencia: null, estado: null, avisos: [], atualizadoEm: new Date(agora).toISOString() };

  await Promise.all([
    (async () => {
      if (options.somenteEstado) return;
      if (!eficiencia) { resultado.avisos.push("Painel de eficiência não encontrado."); return; }
      try {
        const valor = extrairValor(await executar(eficiencia), ["Eficiência", "Eficiência de uso", "_value"]);
        if (!valor) { resultado.avisos.push("Eficiência sem dados no período do dashboard."); return; }
        if (typeof valor.valor !== "number" || !Number.isFinite(valor.valor)) throw new Error("A eficiência precisa retornar um valor numérico.");
        const unit = valor.campo.config?.unit || eficiencia.fieldConfig?.overrides?.flatMap(o =>
          o.matcher?.options === valor.campo.name ? o.properties.filter(p => p.id === "unit").map(p => p.value) : []
        )[0] || eficiencia.fieldConfig?.defaults?.unit;
        resultado.eficiencia = valor.valor * (unit === "percentunit" ? 100 : 1);
      } catch (erro) { resultado.avisos.push("Eficiência: " + erro.message); }
    })(),
    (async () => {
      if (!estado) { resultado.avisos.push("Painel de estado atual não encontrado."); return; }
      try {
        const dadosEstado = await executar(estado, true);
        const valor = extrairValor(dadosEstado, ["Estado", "Status", "_value"]);
        if (!valor) { resultado.avisos.push("Estado atual sem dados."); return; }
        const mappings = [
          ...(valor.campo.config?.mappings || []),
          ...(estado.fieldConfig?.overrides?.flatMap(o => o.matcher?.options === valor.campo.name
            ? o.properties.filter(p => p.id === "mappings").flatMap(p => p.value) : []) || []),
          ...(estado.fieldConfig?.defaults?.mappings || []),
        ];
        const mapeado = mappings.find(m => m.type === "value" && m.options?.[String(valor.valor)])?.options[String(valor.valor)];
        const original = estado.targets?.[0]?.query;
        const direta = original && consultaAtual(interpolar(original, variaveis));
        const texto = direta ? ({"-1": "Sem sinal", "0": "Parada", "1": "Disponível", "2": "Produzindo", "3": "Erro de sinal"})[String(valor.valor)]
          : mapeado?.text || (typeof valor.valor === "string" ? valor.valor : null);
        if (!texto) throw new Error("Configure os nomes dos estados em Value mappings no painel do Grafana.");
        const normal = normalizar(texto);
        const tom = /erro|falha|parada|desligad/.test(normal) ? "parada"
          : /produz|trabalh/.test(normal) ? "produzindo"
            : /disponivel|ligada|ligado/.test(normal) ? "disponivel" : "semsinal";
        const recebido = extrairValor(dadosEstado, ["RecebidoEm"]);
        const instanteLeitura = recebido && (typeof recebido.valor === "number" ? recebido.valor : Date.parse(recebido.valor));
        resultado.estado = { texto, tom, recebidoEm: instanteLeitura > 0 ? new Date(instanteLeitura).toISOString() : null };
      } catch (erro) { resultado.avisos.push("Estado: " + erro.message); }
    })(),
  ]);
  return resultado;
}

module.exports = { consultarResumo };
