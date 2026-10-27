# Enterprise ERP Runtime Optimizer - Extensao de Navegador

> **Engenharia de Runtime, Estabilidade ExtJS 4 e Otimizacao de Performance para ERP Industrial Legado.**  
> Desenvolvido em **JavaScript puro (ES6+)** e **Manifest V3**, com injecao direta no contexto de execucao (`world: "MAIN"`).

---

## 1. Resumo Executivo e Contexto de Engenharia

O **Enterprise ERP Runtime Optimizer** e uma extensao de alta performance para navegadores baseados em Chromium (Google Chrome, Microsoft Edge) concebida para atuar como uma camada de modernizacao em tempo de execucao (*runtime patcher & performance booster*) sobre um ERP corporativo industrial amplamente utilizado no setor de manufatura (estruturado sobre o framework **Sencha ExtJS versao 4.1.1** com backend **ASP.NET / IIS**).

### O Desafio Tecnico
Sistemas legados corporativos em producao enfrentam limitacoes severas de escalabilidade e experiencia do usuario:
* **Falta de acesso ao backend**: Impossibilidade de alterar a base de codigo do servidor ou do ERP de terceiros.
* **Gargalos de interface (ExtJS 4.1.1)**: Framework pesado que instancia arvores extensas de componentes para cada linha de tabela, provocando vazamento de memoria (*memory leaks*), exceptions nao tratadas de manipulacao de DOM (`Ext.DomHelper.doInsert`) e bloqueio permanente da interface por mascaras de carregamento orfas (`Ext.LoadMask`).
* **Paginacao restritiva e lenta**: Tabelas limitadas originalmente a 30 registros por pagina, com recarregamento remoto lento (2 a 4 segundos por pagina) e *auto-refresh* periodico intrusivo que limpava as selecoes do operador.
* **Ordenacao remota corrompida**: O servidor realizava o corte da paginacao antes de aplicar a ordenacao e nao tratava colunas cruciais (como datas de previsao, autorizacao e percentual de apontamento), gerando resultados incompletos ou nulos.
* **Sobrecarga de tarefas manuais**: Operacoes repetitivas de finalizacao de Ordens de Producao (OPs) e preenchimento de formularios fabris exigiam centenas de cliques diarios dos operadores.

### A Solucao de Engenharia
A extensao atua de forma nao destrutiva diretamente na memoria do navegador, injetando correcoes estruturais, componentes virtualizados ultraleves em Vanilla HTML/CSS e motores de processamento em lote, transformando uma aplicacao com travamentos recorrentes em um ambiente estavel, fluido e produtivo.

---

## 2. Diagrama de Arquitetura

```
+-----------------------------------------------------------------------------------+
|                            NAVEGADOR CHROMIUM                                     |
|                                                                                   |
|  +--------------------+                   +------------------------------------+  |
|  |   Popup Panel      |  Chrome Storage   |      Aba Ativa: Sistema ERP        |  |
|  |   (popup.html/.js) | <===============> |                                    |  |
|  |                    |   Custom Events   |  +------------------------------+  |  |
|  | - Modo Liberacao   |                   |  |    Execution World: "MAIN"   |  |  |
|  | - Bloqueio Refresh |                   |  |                              |  |  |
|  | - Gestao MRP       |                   |  |  +------------------------+  |  |  |
|  | - Baixa em Lote    |                   |  |  | ExtJS 4.1.1 Runtime    |  |  |  |
|  +--------------------+                   |  |  | (ComponentTree/Stores) |  |  |  |
|                                           |  |  +-----------+------------+  |  |  |
|                                           |  |              |                |  |  |
|                                           |  |  +-----------v------------+  |  |  |
|                                           |  |  | ERP Runtime Patches    |  |  |  |
|                                           |  |  | - DomHelper / LoadMask |  |  |  |
|                                           |  |  | - 500 Records / Cache  |  |  |  |
|                                           |  |  | - Client Sort Engine   |  |  |  |
|                                           |  |  | - Batch Processor      |  |  |  |
|                                           |  |  +-----------+------------+  |  |  |
|                                           |  |              |                |  |  |
|                                           |  |  +-----------v------------+  |  |  |
|                                           |  |  | Virtualized DOM Render |  |  |  |
|                                           |  |  | (Light HTML/CSS Rows)  |  |  |  |
|                                           |  |  +------------------------+  |  |  |
|                                           |  +------------------------------+  |  |
|                                           +-----------------+------------------+  |
+-------------------------------------------------------------|---------------------+
                                                              |
                                                    Ext.Ajax Requests (HTTP)
                                                              |
                                                              v
                                              +-------------------------------+
                                              | Servidor ERP (IIS / ASP.NET)  |
                                              | Controladores e Banco de Dados|
                                              +-------------------------------+
```

---

## 3. Estrutura do Repositorio

A estrutura do projeto foi planejada para manter foco exclusivo no codigo funcional da extensao, sem poluicao de arquivos temporarios ou artefatos do ERP:

```text
.
├── manifest.json        # Configurador da extensao no padrao Chrome Manifest V3
├── content.js           # Motor de injecao, monkey-patching do ExtJS e automacoes fabris
├── popup.html           # Interface visual do painel de controle da extensao
├── popup.js             # Controlador reativo de configuracoes e eventos da aba ativa
├── .gitignore           # Protecao de artefatos de seguranca, midias e arquivos temporarios
├── LICENSE              # Licenca de codigo aberto (MIT)
└── README.md            # Documentacao tecnica e arquitetural do projeto
```

---

## 4. Modulos e Implementacoes de Engenharia

### 4.1. Estabilidade de Runtime e Hotfixes no ExtJS 4.1.1

O ExtJS versao 4.1.1 apresenta incompatibilidades conhecidas com as especificacoes modernas de DOM dos navegadores Chromium atuais. A extensao intercepta esses pontos antes da renderizacao:

* **Blindagem do DOM (`Ext.DomHelper.doInsert`)**:
  * *Causa Raiz*: Excecoes do tipo `Cannot read property 'dom' of null` e erros de leitura em `componentLayoutCounter` ocorriam quando o ExtJS tentava anexar nós a containers orfaos ou ja destruidos por fechamento de modais.
  * *Solucao*: Interceptacao segura da funcao `doInsert`, validando a presenca real do elemento no DOM ativo e de seu nó pai. Em caso de elemento desconectado, a execucao e desviada silenciosamente, evitando a parada total do JavaScript na pagina.
* **Prevencao de Quebra de Mascara (`Ext.LoadMask`)**:
  * *Causa Raiz*: Excecao na linha 62204 do framework gerada por chamadas de redimensionamento e destruicao em componentes que mantinham ponteiros desatualizados de `loadMask`.
  * *Solucao*: Protecao no `bindComponent` e nas rotinas de mascaramento, validando se o alvo e visivel e se possui dimensoes validas no DOM antes de executar animacoes ou bloqueios.
* **Eliminacao de Mascaras Fantasmas (`.x-mask` e `.x-mask-msg`)**:
  * Rotina de sentinela em baixa frequencia que inspeciona o documento a cada 4 segundos. Caso existam divs de bloqueio modal na arvore do documento sem correspondencia com uma janela ExtJS (`Ext.window.Window`) visivel, as mascaras sao removidas imediatamente, impedindo que a tela fique congelada para o operador.
* **Supressao de Dialogos Bloqueantes**:
  * Filtro direcionado em `window.alert` e ouvintes de erro globais para abafar erros internos de renderizacao do motor ExtJS que nao afetam a integridade dos dados de producao.

---

### 4.2. Painel de Controle de Producao: Escala para 500 Registros e Renderizacao Virtualizada

No modulo principal de producao (`Producao -> Controle de Producao`), a extensao executa uma reestruturacao completa da camada visual:

* **Ampliador do Limite de Consulta**:
  * O grid do ERP consultava apenas 30 itens por requisicao. A extensao reprograma o prototipo de `StoreDePainelDeControleDeProducao` e a instancia em execucao para operar com `pageSize = 500` e injeta `proxy.extraParams.limit = 500`, mantendo perfeita sincronia com o `pagingtoolbar` e respeitando o teto de serializacao JSON do backend.
* **Virtualizacao de Linhas (Vanilla HTML/CSS vs Widgets ExtJS)**:
  * *Problema de Performance*: O ERP instanciaba objetos `Ext.widget('progressbar')` e `new Ext.Button()` dentro do renderer de cada celula da grade. Em uma listagem com centenas de linhas, isso gerava milhares de instancias de componentes, elevando o uso de memoria acima de 1 GB e travando a rolagem da pagina.
  * *Otimizacao*: Substituicao total dos renderers pesados por geradores de marcacao HTML e CSS puro (`renderizarProgressBarInline` e `renderizarBotaoFinalizarInline`). O layout visual permanece identico ao padrao nativo do ERP, porem com renderizacao instantanea e consumo residual de memoria.
* **Clique Delegado com Debounce no Grid**:
  * O acionamento de finalizacao de ordens utiliza um unico ouvinte de eventos delegado no container da grade (`configurarCliqueDelegadoFinalizar`), extraindo o ID da linha pelo atributo `data-id` e disparando a acao correspondente, eliminando *listeners* individuais em cada celula.

---

### 4.3. Motor de Ordenacao Local Inteligente (Zero Latencia e Multi-Tipo)

#### A Falha Estrutural do ERP
Historicamente, o recurso de ordenacao de colunas (ascendente/descendente) do Controle de Producao apresentava falhas graves:
1. O backend C# (`ConsultaDePainelDeControleDeProducao.cs`) executava o corte da paginacao antes de aplicar a ordenacao:
   ```csharp
   // Codigo original do ERP: fatiamento prematuro
   List<ProjecaoDePainelDeControleDeProducao> list = source.ToList()
       .Skip(extGrid.PaginaInicial)
       .Take(extGrid.QuantidadeDeRegistros)
       .ToList();
   // Tentativa de ordenar apenas os 30 itens ja cortados da pagina atual
   list = flag ? list.OrderBy(...).ToList() : list.OrderByDescending(...).ToList();
   ```
2. Colunas essenciais (como `DataDeAutorizacao`, `DataDePrevisaoInicio`, `DataDePrevisaoFim` e `TotalEmPercentualApontado`) nao existiam no tratamento do servidor, retornando dados sem qualquer ordenacao.
3. Como a store vinha configurada com `remoteSort: true`, cada clique no cabecalho disparava uma requisicao lenta de rede que recarregava a tela com dados incoerentes.

#### A Solucao Implementada
A extensao desativa a ordenacao remota (`store.remoteSort = false`) e implementa um comparador inteligente multi-tipo (`compararValoresGridProducao`) acoplado diretamente ao motor de ordenacao em memoria do ExtJS (`store.createComparator` e `store.data.sortBy`):

* **Datas**: Converte dinamicamente formatos variados (objetos `Date`, strings `/Date(1730000000000)/`, ISO strings e formatos brasileiros `DD/MM/YYYY HH:mm:ss`) para timestamps inteiros comparaveis.
* **Quantidades e Decimais**: Normaliza pontuacao brasileira (`1.500,50` -> `1500.50`), garantindo ordenacao puramente numerica em vez de alfabetica.
* **Alfanumericos Naturais (Collation pt-BR)**: Strings como o numero da ORP (`NumeroCompletoDocumento`, ex: `50/1`, `50/2`, `50/10`) e descricoes sao processadas via `localeCompare('pt-BR', { numeric: true, sensitivity: 'base' })`.
* **Tratamento de Nulos**: Linhas com campos nulos ou vazios sao mantidas de forma previsivel no final da lista em ambas as direcoes de ordenacao.
* **Integracao com Cache**: Ao alternar cabecalhos durante o Modo Liberacao, todo o cache de milhares de registros e ordenado na memoria, atualizando a visao e a paginacao instantaneamente.

---

### 4.4. Finalizacao em Lote de Ordens de Producao (Batch Processing)

Permite ao operador selecionar dezenas de ordens de producao de uma so vez e executa-las com um unico comando de confirmacao:

* **Algoritmo de Deteccao Multi-Camada**:
  Garante que nenhuma selecao seja ignorada, inspecionando simultaneamente:
  1. `grid.getSelectionModel().getSelection()`
  2. Array interno do modelo de selecao (`selModel.selected.items`)
  3. Varredura fisica de nós selecionados no DOM (`.x-grid-row-selected` e `input.x-grid-check-custom`)
  4. Indicador de selecao global no cabecalho (`.x-grid-hd-checker-on`)
* **Janela Modal de Seguranca**:
  Exibe a contagem confirmada de itens selecionados, alerta de impacto operacional e permite a selecao do motivo padrao da baixa (com suporte a *lookup* nativo do ERP se disponivel).
* **Pipeline em Lotes com Indicador de Progresso**:
  Para prevenir sobrecarga no servidor IIS e bloqueio por timeout de rede, as requisicoes sao disparadas em blocos assincronos com controle de concorrencia e barra de progresso visual no topo do grid.

---

### 4.5. Modo Liberacao de OP e Gestao de Bloqueios MRP

* **Filtro de Ordens Prontas (Sem Dependencias)**:
  Oculta automaticamente operacoes que dependem de etapas anteriores pendentes na arvore da estrutura do produto (`PossuiDependencia === false`), isolando apenas o que a fabrica pode produzir imediatamente.
* **Extincao do Auto-Refresh Intrusivo**:
  O ERP executava chamadas periodicas de 30 segundos (`iniciaPolling`) que forçavam a atualizacao do grid, cancelando as caixas de selecao marcadas pelo operador. A extensao neutraliza o timer na raiz do controlador e so permite recargas manuais ou pos-processamento.
* **Gestao de OPs Bloqueadas por MRP**:
  Itens bloqueados por indisponibilidade de materiais sao indexados por chave composta (`Documento + Item + Subitem`) e salvos no `localStorage`. Podem ser consultados e reexibidos a qualquer momento atraves do painel popup da extensao.

---

### 4.6. Automacoes em Manutencao de Datas e Cadastros

* **Modulo de Manutencao de Datas (`Movimentacao -> Manutencao de Datas`)**:
  * **Preenchimento Automatico**: Intervalo decenal (`01/01/2020` a `01/01/2030`), perfil TMV `VDA0601` e tipo de movimento inicial `I507`.
  * **Botao de Alternancia Rapida de TMV**: Alterna entre os codigos `I507` e `I516` com um clique, sem necessidade de navegar pelo catalogo de busca do lookup.
  * **Filtro de Documento Auxiliar**: Permite restringir as buscas estritamente ao numero do documento/codigo auxiliar.
  * **Espelhamento de Datas**: Digitar a data de inicio replica instantaneamente a data para o campo de termino ao pressionar `Enter` ou `Tab`, com motivo `P4` pre-preenchido.
  * **Algoritmo de Datas Anteriores**: Identifica cirurgicamente registros com datas pertencentes ao mes anterior que foram empurrados para a frente, abrindo uma modal de confirmacao que permite descarta-los em lote do array interno do controlador (`listaDeItensParaManutencao`).
* **Sequencia de Operacoes**:
  * Posicionamento automatico de foco no campo "Posto de Trabalho" ao abrir a janela modal "Nova Operacao".
  * Auto-preenchimento da descricao da operacao com a denominacao do posto selecionado.

---

## 5. Comparativo de Impacto e Metricas de Performance

| Recurso / Cenario | Comportamento Original do ERP | Com a Extensao Otimizadora |
| :--- | :--- | :--- |
| **Limite de Exibicao** | 30 registros por pagina | **500 registros por pagina** sincronizados |
| **Tempo de Ordenacao** | 2 a 4 segundos (via rede, falho) | **0 milissegundos** (local em memoria) |
| **Ordenacao de Datas/Apontamento** | Nula / Inexistente no servidor | **100% funcional** para todas as colunas |
| **Uso de Memoria (Grid 500 linhas)** | ~1.1 GB (widgets ExtJS por celula) | **~60 MB** (marcacao HTML/CSS pura) |
| **Excecoes de DOM / Layout** | Travamento frequente por nós nulos | **Zero travamentos** (interceptacao segura) |
| **Mascaras Fantasma na Tela** | Tela bloqueada exigindo F5 manual | **Limpeza automatica** em segundo plano |
| **Baixa de 50 OPs de Producao** | ~150 cliques individuais lentos | **1 clique em lote** com confirmacao segura |
| **Atualizacao de Tela Indesejada** | Refresh a cada 30s desmarcando itens | **Bloqueado**; refresh apenas sob demanda |

---

## 6. Seguranca, Higienizacao e Boas Praticas

Este projeto foi completamente higienizado para publicacao publica em portfolio:
* **Zero IPs ou Rotas Internas**: Configuracoes de rede e enderecos IP de rede privada foram substituidos por padroes de correspondencia genericos.
* **Sem Credenciais ou Segredos**: Nenhum dado de autenticacao, usuario, senha, token ou chave de API esta embutido no codigo.
* **Protecao de Midias e Backups via `.gitignore`**:
  * A pasta `backup/` (contendo fontes descompilados e analises internas do ERP) esta estritamente ignorada no Git.
  * Capturas de tela internas de producao estao ignoradas no Git para resguardo de sigilo de clientes e conformidade com a LGPD.

---

## 7. Instrucoes de Instalacao (Modo Desenvolvedor)

Como se trata de uma extensao voltada a um sistema empresarial privado, a execucao requer o navegador Google Chrome ou Microsoft Edge:

1. Clone ou baixe este repositorio para a sua maquina local:
   ```bash
   git clone https://github.com/SEU_USUARIO/enterprise-erp-optimizer.git
   ```
2. Abra o navegador e acesse a pagina de gerenciamento de extensoes:
   * Google Chrome: `chrome://extensions/`
   * Microsoft Edge: `edge://extensions/`
3. Ative a opcao **Modo do desenvolvedor** (*Developer mode*) no canto superior direito.
4. Clique no botao **Carregar sem compactacao** (*Load unpacked*).
5. Selecione a pasta raiz deste projeto clonado.
6. A extensao sera carregada instantaneamente e passara a monitorar e otimizar as abas do sistema ERP.

---

## 8. Licenca

Este projeto esta sob a licenca **MIT** - consulte o arquivo [LICENSE](LICENSE) para obter detalhes.
