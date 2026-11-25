# Portal de painéis do Grafana — Tríade

Abra **Portal-Grafana.code-workspace** no VS Code.

## Pastas

- **backend:** servidor Node.js e consultas de eficiência e estado ao Grafana.
- **frontend:** tela de cards, logo, fontes ampliadas e janela interna com Recarregar/Voltar.
- **grafana/dashboards:** JSONs BOMBA 01/TRD2001 e BOMBA 02/TRD2002 disponíveis neste chat.
- **grafana/ajuste-titulos:** personalização dos títulos com backup e opção de desfazer.

O backend serve o frontend e as rotas /api na mesma porta. O serviço Grafana continua sendo uma instalação separada; este pacote não contém o código-fonte do produto Grafana nem uma cópia dos bancos da VM.

## Iniciar

Use Node.js 20 ou superior. Não precisa instalar pacotes npm. Na pasta deste projeto:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\iniciar.ps1
```

Ou Terminal > Executar Tarefa > **Portal: iniciar**.

Informe a URL interna do Grafana, a URL que usa para fazer login no navegador e o token de leitura. Exemplo: interna http://127.0.0.1:3000 e pública http://localhost:3000. Abra então **http://localhost:8090**. Use localhost nos dois programas para aproveitar sua sessão.

Se 8090 estiver ocupada, no mesmo terminal use:

```powershell
$env:PORTAL_PORT = '8091'
powershell -NoProfile -ExecutionPolicy Bypass -File .\iniciar.ps1
```

Nesse caso abra **http://localhost:8091**. Mantenha o terminal aberto.

## Exibição dentro do portal

O Grafana deve ter allow_embedding = true na seção [security] do arquivo de configuração ativo. Faça login em http://localhost:3000 antes de abrir os cards. O token do backend não substitui essa sessão.

Os cards atualizam estado a cada 5 segundos, eficiência a cada 30 segundos e lista a cada 60 segundos. O clique abre uma janela no portal. Recarregar atualiza o dashboard; Voltar retorna aos cards. Os links para ir ao Grafana permanecem na página de cards.

## Editar e verificar

Salve os arquivos de frontend e atualize o navegador com Ctrl+F5. Ao modificar o backend, encerre o portal com Ctrl+C e inicie novamente.

```powershell
npm run check
```

O comando acima confere a sintaxe sem instalar dependências. npm start também pode iniciar o servidor quando as variáveis GRAFANA_URL, GRAFANA_PUBLIC_URL e GRAFANA_TOKEN já estiverem definidas no processo. O script iniciar.ps1 é a opção com perguntas interativas e token oculto.

Os JSONs incluídos são as cópias disponíveis neste chat; alterações feitas depois diretamente no Grafana da VM não são exportadas automaticamente. Importe-os somente se precisar criar/restaurar esses dashboards. As consultas atuais usam DI1/DI2 e não interpretam uma função Falha cadastrada no configurador.
