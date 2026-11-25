# Títulos maiores nos painéis do Grafana

Este ajuste aumenta apenas os cabeçalhos dos painéis, como **E · Eficiência**, **Estado atual**, **Tempo parada**, **Linha do tempo da operação** e **Ocorrências do período**.

O tamanho padrão é **22 px**. A personalização vale para os painéis de toda a instalação, tanto no site do Grafana quanto na janela incorporada ao portal. As consultas e os dashboards salvos permanecem os mesmos.

Esta versão corrige a identificação dos cabeçalhos: o atributo usado pelo Grafana pode incluir o prefixo literal `data-testid ` no valor. O CSS agora compara o final do identificador e reconhece as duas formas. Para atualizar uma aplicação anterior, execute o instalador desta versão novamente.

## Aplicar na VM

1. Extraia o ZIP.
2. Abra o **PowerShell como administrador** e entre na pasta extraída que contém `ajustar-titulos.ps1`.
3. Execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\ajustar-titulos.ps1
```

O script utiliza a instalação confirmada neste projeto: `C:\Program Files\GrafanaLabs\grafana`. Cria uma cópia de segurança, adiciona o CSS e reinicia o serviço **Grafana**. Durante a reinicialização o portal pode perder a conexão por alguns instantes.

Depois, pressione **Ctrl+F5** no navegador. No portal, use **Voltar** e abra o card novamente. Se o conteúdo incorporado ainda mantiver a aparência antiga, abra o dashboard diretamente no Grafana, pressione Ctrl+F5 e volte ao portal.

## Escolher outro tamanho

Por exemplo, para 24 px:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\ajustar-titulos.ps1 -Fonte 24
```

São aceitos tamanhos de 12 a 28 px. Títulos compridos podem ficar abreviados em painéis estreitos; nesse caso, diminua a fonte ou aumente a largura do painel. Os gráficos não são ampliados pelo ajuste.

## Desfazer

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\ajustar-titulos.ps1 -Desfazer
```

O script remove somente o bloco da personalização do modelo da página. O arquivo CSS fica sem uso. Há uma cópia de segurança de cada execução em `triade-backups`, dentro da pasta do Grafana.

## Como funciona e limites

É uma personalização local dos arquivos da instalação, sem plugin e sem mudar as opções de autenticação. O script acrescenta um link para `public/triade-titulos.css` em `public/views/index.html`. O CSS usa os seletores do cabeçalho conferidos no código do Grafana 13.3.0.

**Uma atualização ou reinstalação do Grafana pode substituir o modelo e remover o ajuste.** Nesse caso, execute o script novamente e confira a aparência. Se uma versão futura mudar a estrutura dos cabeçalhos, o CSS poderá precisar de adaptação.

Fontes usadas para preparar a personalização:

- https://github.com/grafana/grafana/blob/v13.3.0/packages/grafana-ui/src/components/PanelChrome/PanelChrome.tsx
- https://github.com/grafana/grafana/blob/main/packages/grafana-e2e-selectors/src/selectors/components.ts
- https://github.com/grafana/grafana/blob/main/public/views/index.html

O instalador é conferido em uma estrutura de arquivos de teste. A aparência final precisa ser conferida no Grafana da VM após a aplicação.
