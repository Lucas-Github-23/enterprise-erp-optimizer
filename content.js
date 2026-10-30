// ==========================================================================
// Enterprise ERP Runtime Optimizer - Content Script Oficial
// Correções estruturais do ERP, Limite 500, Finalização em Lote com Confirmação
// ==========================================================================

function extrairTimestamp(dataStr) {
    if (!dataStr) return null;
    const match = /\/Date\((-?\d+)/.exec(dataStr);
    if (match) {
        return parseInt(match[1], 10);
    }
    const parsed = Date.parse(dataStr);
    return isNaN(parsed) ? null : parsed;
}

// Utilitário 100% blindado para obter elemento DOM de componentes ExtJS ou nós nativos
function extrairDom(cmp) {
    if (!cmp) return null;
    try {
        if (cmp.nodeType) return cmp;
        if (cmp.dom && cmp.dom.nodeType) return cmp.dom;
        if (typeof cmp.getEl === 'function') {
            var el = cmp.getEl();
            if (el) {
                if (el.dom && el.dom.nodeType) return el.dom;
                if (el.nodeType) return el;
            }
        }
        if (cmp.id && typeof cmp.id === 'string') {
            return document.getElementById(cmp.id);
        }
    } catch(e) {}
    return null;
}

function isVisivelNoDom(cmp) {
    var dom = extrairDom(cmp);
    return !!(dom && dom.offsetParent !== null && dom.offsetWidth > 0 && dom.offsetHeight > 0);
}

// --------------------------------------------------------------------------
// 1. Controle de Ações do Usuário e Interação
// --------------------------------------------------------------------------
let primeiraCargaFeita = false;
let ultimoMomentoUsuario = Date.now();

const registrarInteracaoUsuario = () => {
    ultimoMomentoUsuario = Date.now();
    try {
        sessionStorage.setItem('ULTIMO_CLIQUE_MANUAL', String(Date.now()));
    } catch (e) {}
};

['mousedown', 'mouseup', 'click', 'pointerdown', 'keydown', 'keyup', 'input', 'change'].forEach(evt => {
    window.addEventListener(evt, registrarInteracaoUsuario, { capture: true, passive: true });
    document.addEventListener(evt, registrarInteracaoUsuario, { capture: true, passive: true });
});

// --------------------------------------------------------------------------
// 2. Blindagem contra erros e alertas de DOM do ExtJS 4.1.1
// --------------------------------------------------------------------------
const originalAlert = window.alert;
window.alert = function(msg) {
    if (typeof msg === 'string' && (
        msg.includes("reading 'dom'") || 
        msg.includes("Cannot read property 'dom' of null") || 
        msg.includes("Cannot read properties of undefined") ||
        msg.includes("Erro de script") || 
        msg.includes("12910")
    )) {
        console.warn('[ERP Optimizer] Alert de erro de DOM bloqueado para não travar a tela:', msg);
        return;
    }
    return originalAlert.apply(this, arguments);
};

window.addEventListener('error', function(event) {
    if (event.message && (
        event.message.includes("reading 'dom'") || 
        event.message.includes("Cannot read property 'dom' of null") ||
        event.message.includes("Cannot read properties of undefined")
    )) {
        console.warn('[ERP Optimizer] Erro de DOM suprimido com sucesso:', event.message);
        event.preventDefault();
        event.stopImmediatePropagation();
        return true;
    }
}, true);

window.onerror = function(message) {
    if (typeof message === 'string' && (
        message.includes("reading 'dom'") || 
        message.includes("Cannot read property 'dom' of null") ||
        message.includes("Cannot read properties of undefined")
    )) {
        console.warn('[ERP Optimizer] Alerta de erro de DOM suprimido via onerror:', message);
        return true;
    }
    return false;
};

// --------------------------------------------------------------------------
// 3. Limpeza de máscaras presas e botões órfãos do topo
// --------------------------------------------------------------------------
function limparMascarasOrfas() {
    try {
        var temJanelaModal = false;
        if (window.Ext && window.Ext.ComponentQuery) {
            var janelas = window.Ext.ComponentQuery.query('window');
            temJanelaModal = janelas.some(w => w.modal && w.isVisible && w.isVisible(true) && w.rendered && !w.isDestroyed);
            if (window.Ext.Msg && window.Ext.Msg.isVisible && window.Ext.Msg.isVisible()) {
                temJanelaModal = true;
            }
        }

        if (!temJanelaModal) {
            document.querySelectorAll('.x-mask').forEach(m => {
                m.style.display = 'none';
                m.style.opacity = '0';
                m.style.pointerEvents = 'none';
            });
            document.querySelectorAll('.x-mask-msg').forEach(m => {
                m.style.display = 'none';
            });
            if (window.Ext && window.Ext.WindowManager) {
                if (window.Ext.WindowManager.mask) {
                    try { window.Ext.WindowManager.mask.hide(); } catch(e){}
                }
                if (window.Ext.WindowManager._mask) {
                    try { window.Ext.WindowManager._mask.hide(); } catch(e){}
                }
            }
        }
    } catch (e) {}
}

// Fecha forçadamente qualquer popup ou máscara de "Autorização de Produção" presa na tela
function fecharPopupAutorizacaoProducao() {
    try {
        if (window.Ext) {
            // 1. Fecha o singleton Ext.Msg se for a mensagem de autorização
            if (window.Ext.Msg) {
                try {
                    var isMsgAberta = (typeof window.Ext.Msg.isVisible === 'function') ? window.Ext.Msg.isVisible() : false;
                    var tit = (window.Ext.Msg.title || (window.Ext.Msg.header && window.Ext.Msg.header.title) || '').toString();
                    if (isMsgAberta || tit.indexOf('Autoriza') !== -1 || tit.indexOf('trabalhando') !== -1) {
                        if (typeof window.Ext.Msg.hide === 'function') window.Ext.Msg.hide();
                        if (typeof window.Ext.Msg.close === 'function') window.Ext.Msg.close();
                    }
                } catch(e) {}
            }

            // 2. Procura qualquer janela aberta com título "Autorização de Produção"
            if (window.Ext.ComponentQuery) {
                var janelas = window.Ext.ComponentQuery.query('window') || [];
                janelas.forEach(function(w) {
                    if (w && !w.isDestroyed) {
                        var t = (w.title || '').toString();
                        if (t.indexOf('Autorização de Produção') !== -1 || (t.indexOf('Autoriza') !== -1 && w.down && w.down('progressbar'))) {
                            try { w.close(); } catch(e) { try { w.hide(); } catch(e2){} }
                        }
                    }
                });
            }

            // 3. Oculta suavemente a máscara de Loading do grid de produção (sem destruir o LoadMask)
            var grid = obterGridProducaoAtivo();
            if (grid) {
                try {
                    if (grid.loadMask && typeof grid.loadMask.hide === 'function') grid.loadMask.hide();
                    var view = grid.getView ? grid.getView() : null;
                    if (view && view.loadMask && typeof view.loadMask.hide === 'function') view.loadMask.hide();
                } catch(e) {}
            }
        }

        limparMascarasOrfas();
    } catch(err) {
        console.warn('[ERP Optimizer] Erro ao fechar popup de autorização:', err);
    }
}

function limparBotoesOrfaosDoTopo() {
    try {
        var btnFlutuante = document.getElementById('erp_btn_flutuante_finalizar');
        if (btnFlutuante) {
            btnFlutuante.remove();
        }
        var flutuantes = document.querySelectorAll('[id*="btn_flutuante"]');
        flutuantes.forEach(b => b.remove());

        var diretos = document.querySelectorAll('body > .x-btn, body > div.x-btn');
        diretos.forEach(btn => {
            if (btn.innerText && btn.innerText.includes('Finalizar')) {
                btn.remove();
            }
        });

        var todosBotoes = document.querySelectorAll('.x-btn');
        todosBotoes.forEach(btn => {
            if (btn.closest && (btn.closest('.x-grid') || btn.closest('.x-window') || btn.closest('.x-toolbar'))) {
                return;
            }
            if (btn.innerText && btn.innerText.trim() === 'Finalizar') {
                btn.remove();
            }
        });
    } catch (e) {}
}

document.addEventListener('click', () => {
    limparBotoesOrfaosDoTopo();
    limparMascarasOrfas();
    limparElementosInjetadosDeOutrosGrids();
    preencherDatasPadraoProducao();
    preencherDatasPadraoManutencaoDeDatas();
    configurarJanelasAlteracaoDatasManutencao();
    var gridConf = obterGridConfirmacaoManutencaoDatas();
    if (gridConf) configurarGridConfirmacaoManutencaoDatas(gridConf);
}, true);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        limparMascarasOrfas();
        fecharPopupAutorizacaoProducao();
    }
}, true);

setInterval(limparBotoesOrfaosDoTopo, 2000);

function mostrarToastNotificacao(texto, corBorda = '#15428b') {
    try {
        var toast = document.createElement('div');
        toast.innerHTML = texto;
        toast.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999999; ' +
                              'background: #ffffff; color: #15428b; padding: 10px 18px; border-radius: 4px; ' +
                              'font-family: tahoma, arial, verdana, sans-serif; font-size: 12px; font-weight: bold; ' +
                              'box-shadow: 0 4px 15px rgba(0,0,0,0.18); border: 1px solid #a3bde3; ' +
                              'border-left: 5px solid ' + corBorda + '; transition: opacity 0.4s ease; pointer-events: none;';
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { toast.remove(); }, 400);
        }, 3200);
    } catch(e) {}
}

// --------------------------------------------------------------------------
// 4. Localização Inteligente do Grid e da Seleção Ativa (Multi-Camadas)
// --------------------------------------------------------------------------

// Identifica se o grid pertence à aba de Dados de Apontamento (NUNCA deve ser tratado como grid de OPs)
function isGridDeApontamentos(grid) {
    if (!grid || grid.isDestroyed) return false;

    var itemId = String(grid.itemId || grid.itemid || '').toLowerCase();
    if (itemId === 'listadeapontamentosproducao' || itemId.indexOf('apontamento') !== -1) return true;

    var xtype = String(grid.xtype || '').toLowerCase();
    if (xtype === 'listviewdeapontamentoscontroledeproducao' || xtype.indexOf('apontamento') !== -1) return true;

    var cls = String(grid.$className || '');
    if (cls.indexOf('ListViewDeApontamentos') !== -1 || cls.indexOf('ApontamentosControleDeProducao') !== -1) return true;

    if (grid.store) {
        var sCls = String(grid.store.$className || '');
        if (sCls.indexOf('StoreDeApontamento') !== -1) return true;
        if (grid.store.proxy && grid.store.proxy.url && grid.store.proxy.url.indexOf('ListarApontamentos') !== -1) return true;
    }

    var headerCt = grid.headerCt || (grid.getView && grid.getView().headerCt);
    if (headerCt && typeof headerCt.getGridColumns === 'function') {
        try {
            var cols = headerCt.getGridColumns() || [];
            for (var i = 0; i < cols.length; i++) {
                var dIndex = cols[i] ? cols[i].dataIndex : '';
                if (dIndex === 'Acao' || dIndex === 'QuantidadeApontada' || dIndex === 'Hora') {
                    return true;
                }
            }
        } catch(e) {}
    }

    return false;
}

// Identifica se um grid pertence com 100% de precisão ao Painel de Controle de Produção (Aba 1: Consulta de OP)
function isGridDeProducao(grid) {
    if (!grid || grid.isDestroyed) return false;

    // Se for o grid da segunda aba (Dados de Apontamento), rejeita categoricamente
    if (isGridDeApontamentos(grid)) return false;

    // Se for grid de manutenção de datas, rejeita categoricamente
    if (typeof isGridSelecaoManutencaoDatas === 'function' && isGridSelecaoManutencaoDatas(grid)) return false;
    if (typeof isGridConfirmacaoManutencaoDatas === 'function' && isGridConfirmacaoManutencaoDatas(grid)) return false;

    // 1. itemId específico da tela de Controle de Produção (Aba 1: Consulta de Ordem de Produção)
    var itemId = String(grid.itemId || grid.itemid || '').toLowerCase();
    if (itemId === 'listordensdeproducaoparacontrole') return true;

    // 2. xtype ou classe do componente ESTRITAMENTE do ListViewDePainelDeControleDeProducao
    var xtype = String(grid.xtype || '').toLowerCase();
    if (xtype === 'listviewdepaineldecontroledeproducao') return true;

    var cls = String(grid.$className || '');
    if (cls === 'GMF.view.dominio.Industria.PainelDeControleDeProducao.ListViewDePainelDeControleDeProducao' ||
        cls.endsWith('.ListViewDePainelDeControleDeProducao')) return true;

    // 3. Store de Produção (ListarProducao - NUNCA ListarApontamentos)
    if (grid.store) {
        var sCls = String(grid.store.$className || '');
        if (sCls.indexOf('StoreDeApontamento') !== -1) return false;
        if (sCls.indexOf('StoreDePainelDeControleDeProducao') !== -1) return true;
        if (grid.store.proxy && grid.store.proxy.url) {
            if (grid.store.proxy.url.indexOf('ListarApontamentos') !== -1) return false;
            if (grid.store.proxy.url.indexOf('PainelDeControleDeProducao/ListarProducao') !== -1 ||
                grid.store.proxy.url.indexOf('PainelDeControleDeProducao') !== -1) return true;
        }
    }

    // 4. Colunas características obrigatórias (ORP + Coluna de Produção)
    var headerCt = grid.headerCt || (grid.getView && grid.getView().headerCt);
    if (headerCt && typeof headerCt.getGridColumns === 'function') {
        try {
            var cols = headerCt.getGridColumns() || [];
            var temOrp = false;
            var temProducao = false;
            for (var i = 0; i < cols.length; i++) {
                var dIndex = cols[i] ? cols[i].dataIndex : '';
                if (dIndex === 'Acao') return false; // NUNCA existe dataIndex Acao no grid de produção!
                if (dIndex === 'NumeroCompletoDocumento') temOrp = true;
                if (dIndex === 'TotalEmPercentualApontado' || dIndex === 'EstagioProducao' || dIndex === 'IDDoDocumentoDePrevisaoDeProducao') {
                    temProducao = true;
                }
            }
            if (temOrp && temProducao) return true;
        } catch(e) {}
    }

    return false;
}

// Obtém com segurança a instância do Grid a partir de uma View de Tabela (Ext.view.Table)
function obterGridDaView(view) {
    if (!view) return null;
    if (view.panel && (view.panel.isXType || view.panel.columns || view.panel.headerCt)) return view.panel;
    if (view.grid && (view.grid.isXType || view.grid.columns || view.grid.headerCt)) return view.grid;
    if (view.ownerCt && (view.ownerCt.isXType || view.ownerCt.columns || view.ownerCt.headerCt)) return view.ownerCt;
    if (typeof view.up === 'function') {
        try {
            var g = view.up('grid') || view.up('gridpanel') || view.up('tablepanel');
            if (g) return g;
        } catch(e) {}
    }
    return null;
}

// Remove imediatamente qualquer botão ou modificação de limite que tenha sido aplicada indevidamente em telas fora do Painel de Produção (ex: Lista de Itens, Sequência de Operações)
function limparElementosInjetadosDeOutrosGrids() {
    if (!window.Ext) return;
    try {
        var todosGrids = [];
        if (window.Ext.ComponentQuery) {
            try {
                todosGrids = window.Ext.ComponentQuery.query('grid') || [];
            } catch(e) {}
        }
        if (todosGrids.length === 0 && window.Ext.ComponentManager && window.Ext.ComponentManager.each) {
            try {
                window.Ext.ComponentManager.each(function(id, cmp) {
                    if (cmp && (cmp.isXType && cmp.isXType('grid') || cmp.columns)) {
                        todosGrids.push(cmp);
                    }
                });
            } catch(e) {}
        }

        todosGrids.forEach(function(g) {
            if (!g || g.isDestroyed) return;
            // Ignora o verdadeiro Grid de Produção e os Grids de Manutenção de Datas
            if (isGridDeProducao(g) || isGridSelecaoManutencaoDatas(g) || isGridConfirmacaoManutencaoDatas(g)) return;

            // 1. Limpa componentes indevidos da Toolbar Superior
            var topTb = g.down ? g.down('toolbar[dock="top"]') : null;
            if (topTb) {
                var seletoresTop = [
                    '#chkModoLiberacaoTop',
                    '#btnOpsBloqueadasMRP',
                    '#btnMrpBloqueadasTop',
                    '#btnFinalizarSelecionadasTop',
                    '#lblProgressoChunksTop'
                ];
                var alterouTop = false;
                seletoresTop.forEach(function(sel) {
                    var cmp = topTb.down ? topTb.down(sel) : null;
                    if (cmp) {
                        try {
                            topTb.remove(cmp, true);
                            alterouTop = true;
                        } catch(e) {}
                    }
                });
                if (alterouTop && topTb.updateLayout) {
                    topTb.updateLayout();
                }
            }

            // 2. Limpa botão indevido e restaura pageSize da PagingToolbar (rodapé)
            var pt = g.down ? g.down('pagingtoolbar') : null;
            if (pt) {
                var btnPt = pt.down ? pt.down('#btnFinalizarSelecionadasPt') : null;
                var alterouPt = false;
                if (btnPt) {
                    try {
                        var idx = pt.items ? pt.items.indexOf(btnPt) : -1;
                        if (idx > 0) {
                            var prev = pt.items.getAt(idx - 1);
                            if (prev && prev.isXType && prev.isXType('tbseparator')) {
                                try { pt.remove(prev, true); } catch(e){}
                            }
                        }
                        pt.remove(btnPt, true);
                        alterouPt = true;
                    } catch(e) {}
                }

                var store = g.getStore ? g.getStore() : pt.store;
                if (store && (pt.pageSize === 500 || store.pageSize === 500)) {
                    var tamanhoOriginal = 30; // Padrão do ERP
                    if (store.self && store.self.prototype && store.self.prototype.pageSize && store.self.prototype.pageSize !== 500) {
                        tamanhoOriginal = store.self.prototype.pageSize;
                    } else if (store.data && store.data.length > 0 && store.data.length < 500) {
                        tamanhoOriginal = store.data.length;
                    }

                    store.pageSize = tamanhoOriginal;
                    pt.pageSize = tamanhoOriginal;

                    if (store.proxy && store.proxy.extraParams) {
                        delete store.proxy.extraParams.limit;
                        delete store.proxy.extraParams.pageSize;
                    }

                    alterouPt = true;
                    if (typeof pt.onLoad === 'function') {
                        try { pt.onLoad(); } catch(e) {}
                    }
                }

                if (alterouPt && pt.updateLayout) {
                    pt.updateLayout();
                }
            }

            // 3. Restaura colunas que possam ter sido contaminadas em telas externas (ex: Sequência de Operações ou Dados de Apontamento)
            var headerCt = g.headerCt || (g.getView && g.getView().headerCt);
            if (headerCt) {
                var cols = (typeof headerCt.getGridColumns === 'function' ? headerCt.getGridColumns() : null) || (headerCt.items && headerCt.items.items) || [];
                var alterouCol = false;
                for (var cIdx = 0; cIdx < cols.length; cIdx++) {
                    var c = cols[cIdx];
                    if (!c) continue;
                    var headerTxt = String(c.text || c.header || '').trim();
                    var dIndex = String(c.dataIndex || '').trim();

                    // Se for a coluna de Ação do grid de Apontamentos (dataIndex: 'Acao')
                    if (dIndex === 'Acao') {
                        if (c.renderer === renderizarBotaoFinalizarInline || c._rendererOtimizadoFinalizar) {
                            delete c._rendererOtimizadoFinalizar;
                            if (c.origRenderer && c.origRenderer !== renderizarBotaoFinalizarInline) {
                                c.renderer = c.origRenderer;
                            } else {
                                delete c.renderer;
                                c.renderer = null;
                            }
                            c.width = 40;
                            c.text = 'Ação';
                            c.header = 'Ação';
                            alterouCol = true;
                        }
                    } else if (headerTxt === 'Dependências' || headerTxt === 'Dependencias' || c._headerOriginal === 'Dependências') {
                        if (c.renderer === renderizarBotaoFinalizarInline || c._rendererOtimizadoFinalizar) {
                            delete c._rendererOtimizadoFinalizar;
                            var originalFn = window.formatarDependencias || c.origRenderer;
                            c.renderer = originalFn;
                            c.origRenderer = originalFn;
                            c.text = 'Dependências';
                            c.header = 'Dependências';
                            c.width = 40;
                            alterouCol = true;
                        }
                    } else if (c._rendererOtimizadoFinalizar || c.renderer === renderizarBotaoFinalizarInline) {
                        delete c._rendererOtimizadoFinalizar;
                        if (c.origRenderer && c.origRenderer !== renderizarBotaoFinalizarInline) {
                            c.renderer = c.origRenderer;
                        } else {
                            delete c.renderer;
                            c.renderer = null;
                        }
                        if (c._headerOriginal) {
                            c.text = c._headerOriginal;
                            c.header = c._headerOriginal;
                        }
                        alterouCol = true;
                    }

                    if (c._rendererOtimizadoProgressBar || c.renderer === renderizarProgressBarInline) {
                        delete c._rendererOtimizadoProgressBar;
                        if (c.origRenderer && c.origRenderer !== renderizarProgressBarInline) {
                            c.renderer = c.origRenderer;
                        } else {
                            delete c.renderer;
                            c.renderer = null;
                        }
                        alterouCol = true;
                    }
                }
                if (alterouCol && g.rendered && g.getView && g.getView().refresh) {
                    try { g.getView().refresh(); } catch(e) {}
                }
            }
        });
    } catch(err) {
        console.warn('[ERP Optimizer] Erro ao limpar elementos de outros grids:', err);
    }
}

// Encontra o grid da tela ATIVA de Produção que está visível no DOM (NUNCA grids de outras telas)
function obterGridProducaoAtivo() {
    if (!window.Ext) return null;
    
    var candidatos = [];
    if (window.Ext.ComponentQuery) {
        try {
            var seletores = [
                'listviewdepaineldecontroledeproducao',
                '[itemId="listOrdensDeProducaoParaControle"]',
                '[itemid="listOrdensDeProducaoParaControle"]'
            ];
            seletores.forEach(function(sel) {
                try {
                    var list = window.Ext.ComponentQuery.query(sel) || [];
                    list.forEach(function(item) {
                        var target = (item.isXType && (item.isXType('grid') || item.isXType('gridpanel'))) ? item : (item.grid || item.ownerCt || item);
                        if (target && isGridDeProducao(target) && candidatos.indexOf(target) === -1) {
                            candidatos.push(target);
                        }
                    });
                } catch(e) {}
            });
        } catch(e) {}
    }
    
    if (candidatos.length === 0 && window.Ext.ComponentManager && window.Ext.ComponentManager.each) {
        try {
            window.Ext.ComponentManager.each(function(id, cmp) {
                if (cmp && isGridDeProducao(cmp)) {
                    if (candidatos.indexOf(cmp) === -1) candidatos.push(cmp);
                }
            });
        } catch(e) {}
    }

    if (candidatos.length === 0) {
        return null;
    }

    var gridsValidos = candidatos.filter(function(g) {
        return g && !g.isDestroyed && g.rendered;
    });
    
    if (gridsValidos.length === 0) {
        return null;
    }
    
    // Procura o grid de produção que está fisicamente visível no DOM
    for (var i = gridsValidos.length - 1; i >= 0; i--) {
        var g = gridsValidos[i];
        if (isVisivelNoDom(g) || (g.isVisible && g.isVisible(true))) {
            return g;
        }
    }
    
    // Se a aba de Produção não estiver visível (ex: usuário está na aba de Itens), retorna null
    return null;
}

// Extrai os registros selecionados varrendo apenas os grids de PRODUÇÃO por todos os métodos
function obterRegistrosSelecionadosGeral() {
    if (!window.Ext) return { grid: null, records: [] };

    var candidatos = [];
    var gAtivo = obterGridProducaoAtivo();
    if (gAtivo && isGridDeProducao(gAtivo)) candidatos.push(gAtivo);

    if (window.Ext.ComponentQuery) {
        try {
            var list = window.Ext.ComponentQuery.query('grid') || [];
            list.forEach(function(g) {
                if (g && isGridDeProducao(g) && candidatos.indexOf(g) === -1) candidatos.push(g);
            });
        } catch(e) {}
    }

    // Ordena os candidatos priorizando o que está visível no DOM (100% seguro)
    try {
        candidatos.sort(function(a, b) {
            var visA = isVisivelNoDom(a) ? 1 : 0;
            var visB = isVisivelNoDom(b) ? 1 : 0;
            return visB - visA;
        });
    } catch(e) {}

    for (var i = 0; i < candidatos.length; i++) {
        var g = candidatos[i];
        if (!g || g.isDestroyed) continue;
        
        var selecionados = [];
        var sm = g.getSelectionModel ? g.getSelectionModel() : null;
        var store = g.getStore ? g.getStore() : null;
        var view = g.getView ? g.getView() : null;
        var dom = extrairDom(g);

        // 1. SelectionModel getSelection()
        if (sm && typeof sm.getSelection === 'function') {
            try {
                var s = sm.getSelection() || [];
                if (s.length > 0) {
                    selecionados = s.slice();
                }
            } catch(e) {}
        }

        // 2. SelectionModel selected.items / getRange()
        if (selecionados.length === 0 && sm && sm.selected) {
            try {
                if (typeof sm.selected.getRange === 'function') {
                    var sRange = sm.selected.getRange() || [];
                    if (sRange.length > 0) selecionados = sRange.slice();
                } else if (Array.isArray(sm.selected.items) && sm.selected.items.length > 0) {
                    selecionados = sm.selected.items.slice();
                }
            } catch(e) {}
        }

        // 3. Cabeçalho "Marcar Todos" ativo (.x-grid-hd-checker-on)
        if (selecionados.length === 0 && dom && store) {
            try {
                var hdChecker = dom.querySelector('.x-grid-hd-checker-on');
                if (hdChecker && typeof store.getRange === 'function') {
                    var todos = store.getRange() || [];
                    if (todos.length > 0) {
                        selecionados = todos.slice();
                    }
                }
            } catch(e) {}
        }

        // 4. Linhas selecionadas no DOM (.x-grid-row-selected)
        if (selecionados.length === 0 && dom && (view || store)) {
            try {
                var trs = dom.querySelectorAll('tr.x-grid-row-selected, tr.x-grid-row.x-grid-row-selected');
                if (!trs || trs.length === 0) {
                    trs = dom.querySelectorAll('tr.x-grid-row:has(.x-grid-row-checker-on)');
                }
                trs.forEach(function(tr) {
                    var rec = null;
                    if (view && typeof view.getRecord === 'function') {
                        try { rec = view.getRecord(tr); } catch(e) {}
                    }
                    if (!rec && view && typeof view.indexOf === 'function' && store) {
                        try {
                            var idx = view.indexOf(tr);
                            if (idx >= 0) rec = store.getAt(idx);
                        } catch(e) {}
                    }
                    if (rec && selecionados.indexOf(rec) === -1) {
                        selecionados.push(rec);
                    }
                });
            } catch(e) {}
        }

        if (selecionados.length > 0) {
            return { grid: g, records: selecionados };
        }
    }

    var gridVisivel = candidatos[0] || null;
    return { grid: gridVisivel, records: [] };
}

// --------------------------------------------------------------------------
// 5. Lógica de Finalização Individual e em Lote (com Confirmação)
// --------------------------------------------------------------------------

function executarFinalizacaoIndividual(record, grid) {
    if (!record) return;

    var numDoc = (record.get && record.get('NumeroCompletoDocumento')) || 
                 (record.get && record.get('NumeroDoDocumento') ? ('ORP ' + record.get('NumeroDoDocumento')) : '') || 
                 (record.data && record.data.NumeroCompletoDocumento) || 
                 'Ordem de Produção';

    var motivoPadrao = sessionStorage.getItem('MOTIVO_PADRAO_OP') || localStorage.getItem('MOTIVO_PADRAO_OP') || '55';

    // Se o xtype LookupDeMotivo estiver registrado no ExtJS, utiliza o lookup nativo do ERP
    var temLookupMotivo = !!(window.Ext && window.Ext.ClassManager && (
        window.Ext.ClassManager.getByAlias('widget.LookupDeMotivo') || 
        window.Ext.ClassManager.get('GMF.view.controlesEspecializados.Lookup.LookupDeMotivo')
    ));

    var campoItem = temLookupMotivo ? {
        name: "lkMotivo",
        itemid: "lkMotivo",
        fieldLabel: "Motivo",
        allowBlank: false,
        xtype: "LookupDeMotivo",
        campoBind: "codigoMotivo",
        labelWidth: 80,
        value: motivoPadrao
    } : {
        xtype: 'textfield',
        itemid: 'lkMotivo',
        fieldLabel: 'Motivo',
        allowBlank: false,
        value: motivoPadrao,
        labelWidth: 80
    };

    var win = Ext.create('Ext.window.Window', {
        title: "Controle de Produção",
        height: 110,
        width: 320,
        bodyPadding: 8,
        modal: true,
        draggable: true,
        resizable: false,
        items: [campoItem],
        buttons: [
            {
                text: "Finalizar",
                cls: 'ag-btn-extjs',
                handler: function() {
                    var campo = win.down("[itemid=lkMotivo]");
                    var mot = campo ? (campo.getValue ? campo.getValue() : campo.value) : motivoPadrao;
                    if (!mot) {
                        Ext.Msg.alert('Atenção', 'Informe o código do motivo.');
                        return;
                    }
                    sessionStorage.setItem('MOTIVO_PADRAO_OP', String(mot));
                    localStorage.setItem('MOTIVO_PADRAO_OP', String(mot));
                    win.close();

                    var mask = Ext.Msg.show({
                        title: "Finalização de Produção",
                        msg: "O sistema está trabalhando, por favor aguarde ...",
                        wait: true,
                        icon: Ext.MessageBox.INFO
                    });

                    var payload = Ext.apply({}, record.data || record);
                    payload.CodigoDoMotivo = mot;

                    Ext.Ajax.request({
                        timeout: 600000,
                        url: "PainelDeControleDeProducao/FinalizarProducao",
                        method: "POST",
                        params: Ext.encode(payload),
                        headers: { "Content-Type": "application/json" },
                        success: function() {
                            mask.close();
                            if (record.set) {
                                record.set('Autorizado', true);
                                record.set('Estagio', 107);
                                record.set('EstagioProducao', 'ORP Finalizada');
                                record.commit();
                            }
                            if (grid && grid.getView && grid.getView().refresh) {
                                try { grid.getView().refresh(); } catch(e) {}
                            }
                            if (window.GMF && window.GMF.servico && window.GMF.servico.Util && window.GMF.servico.Util.Funcoes && window.GMF.servico.Util.Funcoes.customMessageBox) {
                                window.GMF.servico.Util.Funcoes.customMessageBox("Controle de Produção", "Produção finalizada com sucesso.", Ext.MessageBox.INFO);
                            } else {
                                mostrarToastNotificacao('' + numDoc + ' finalizada com sucesso!');
                            }
                        },
                        failure: function() {
                            mask.close();
                            if (record.set) {
                                record.set('EstagioProducao', 'Erro ao finalizar');
                            }
                            Ext.Msg.alert('Erro', 'Não foi possível finalizar a ' + numDoc + '. Verifique se a ordem possui dependências.');
                        }
                    });
                }
            },
            {
                text: "Cancelar",
                cls: 'ag-btn-extjs',
                handler: function() {
                    win.close();
                }
            }
        ]
    });

    win.show();
}

// Janela de Confirmação para Finalização em Lote (Segurança)
function mostrarJanelaConfirmacaoLote(selecionadas, grid, motivoPadrao) {
    var motivoFinal = motivoPadrao || '55';
    var qtd = selecionadas.length;
    
    var resumoOrdens = selecionadas.slice(0, 8).map(function(r) {
        var num = (r.get && r.get('NumeroCompletoDocumento')) || ('ORP ' + (r.get ? r.get('NumeroDoDocumento') : ''));
        var desc = (r.get && r.get('DescricaoProduto')) || (r.get && r.get('IDRefProduto')) || '';
        return '• <b>' + Ext.String.htmlEncode(num) + '</b> - ' + Ext.String.htmlEncode(desc);
    }).join('<br>');
    
    if (qtd > 8) {
        resumoOrdens += '<br><i>... e mais ' + (qtd - 8) + ' ordem(ns) selecionada(s).</i>';
    }

    var win = Ext.create('Ext.window.Window', {
        title: 'Confirmação de Finalização em Lote',
        width: 490,
        height: 380,
        modal: true,
        resizable: false,
        draggable: true,
        bodyPadding: 16,
        layout: 'vbox',
        items: [
            {
                xtype: 'component',
                html: '<div style="font-size: 13px; font-family: tahoma, arial, sans-serif; margin-bottom: 10px; color: #15428b; font-weight: bold;">' +
                      'Você está prestes a finalizar <b>' + qtd + ' ordem(ns) de produção</b> selecionada(s).' +
                      '</div>' +
                      '<div style="background: #ffffff; padding: 10px; border-radius: 3px; font-family: tahoma, arial, sans-serif; font-size: 11px; max-height: 120px; overflow-y: auto; margin-bottom: 14px; border: 1px solid #a3bde3; width: 100%; box-sizing: border-box; line-height: 18px;">' +
                      resumoOrdens +
                      '</div>'
            },
            {
                xtype: 'textfield',
                fieldLabel: 'Código do Motivo',
                labelWidth: 120,
                value: motivoFinal,
                itemId: 'txtMotivoLote',
                width: 250,
                allowBlank: false
            },
            {
                xtype: 'component',
                html: '<div style="font-size: 11px; font-family: tahoma, arial, sans-serif; color: #555555; margin-top: 4px;">' +
                      'Por padrão é utilizado o motivo <b>55</b> exigido pelo sistema ERP.' +
                      '</div>'
            }
        ],
        buttons: [
            {
                text: 'Cancelar',
                cls: 'ag-btn-extjs',
                handler: function() {
                    win.close();
                }
            },
            {
                text: 'Finalizar ' + qtd + ' Ordens',
                iconCls: 'finalizar',
                cls: 'ag-btn-extjs',
                handler: function() {
                    var campoMotivo = win.down('#txtMotivoLote');
                    var mot = (campoMotivo ? campoMotivo.getValue() : '').trim() || '55';
                    win.close();
                    executarFinalizacaoEmLote(selecionadas, grid, mot);
                }
            }
        ]
    });
    
    win.show();
}

function executarFinalizacaoEmLote(selecionadas, grid, motivo) {
    var total = selecionadas.length;
    var concluidas = 0;
    var erros = 0;
    
    var pbar = Ext.Msg.progress('Finalizando em Lote', 'Iniciando finalização...', '0%');
    var index = 0;

    function processarProxima() {
        if (index >= total) {
            pbar.close();
            limparMascarasOrfas();
            
            var msg = '<b>' + concluidas + '</b> ordem(ns) de produção finalizada(s) com sucesso com o motivo ' + motivo + '!';
            if (erros > 0) {
                msg += '<br><br><span style="color: #ef4444; font-weight: bold;">' + erros + ' ordem(ns) não puderam ser finalizadas (verifique dependências).</span>';
            }
            Ext.Msg.alert('Concluído', msg);
            
            if (grid && grid.getSelectionModel && grid.getSelectionModel().deselectAll) {
                grid.getSelectionModel().deselectAll();
            }
            if (typeof desmarcarCabecalhoSelecaoGrid === 'function') {
                desmarcarCabecalhoSelecaoGrid(grid);
            }
            return;
        }
        
        var record = selecionadas[index];
        index++;
        
        var percent = index / total;
        var num = (record.get && record.get('NumeroCompletoDocumento')) || ('ORP ' + (record.get ? record.get('NumeroDoDocumento') : '')) || ('Item ' + index);
        pbar.updateProgress(percent, 'Finalizando (' + index + ' de ' + total + '): ' + num);
        
        var payload = Ext.apply({}, record.data);
        payload.CodigoDoMotivo = motivo;
        
        Ext.Ajax.request({
            timeout: 60000,
            url: 'PainelDeControleDeProducao/FinalizarProducao',
            method: 'POST',
            params: Ext.encode(payload),
            headers: { 'Content-Type': 'application/json' },
            success: function() {
                concluidas++;
                if (record.set) {
                    record.set('Autorizado', true);
                    record.set('Estagio', 107);
                    record.set('EstagioProducao', 'ORP Finalizada');
                    record.commit();
                }
                setTimeout(processarProxima, 80);
            },
            failure: function() {
                erros++;
                if (record.set) {
                    record.set('EstagioProducao', 'Erro ao finalizar');
                }
                setTimeout(processarProxima, 80);
            }
        });
    }
    
    processarProxima();
}

function dispararFluxoFinalizacaoLote() {
    var resultado = obterRegistrosSelecionadosGeral();
    var gridAlvo = resultado.grid || obterGridProducaoAtivo();
    var selecionadas = resultado.records || [];
    
    console.info('[ERP Optimizer] OPs selecionadas encontradas:', selecionadas.length);
    
    if (selecionadas.length === 0) {
        if (window.Ext && window.Ext.Msg) {
            Ext.Msg.alert('Atenção', 'Nenhuma Ordem de Produção selecionada.<br><br>Por favor, marque as caixinhas de seleção na coluna à esquerda da tabela.');
        } else {
            alert('Nenhuma Ordem de Produção selecionada.');
        }
        return;
    }
    
    var pendentes = selecionadas.filter(function(r) {
        var est = (r.get && typeof r.get === 'function') ? r.get('Estagio') : (r.data ? r.data.Estagio : r.Estagio);
        var estDesc = (r.get && typeof r.get === 'function') ? r.get('EstagioProducao') : (r.data ? r.data.EstagioProducao : r.EstagioProducao);
        if (est == 107 || est == '107' || estDesc == 'ORP Finalizada' || estDesc == 'Finalizada') {
            return false;
        }
        return true;
    });
    
    if (pendentes.length === 0) {
        if (window.Ext && window.Ext.Msg) {
            Ext.Msg.alert('Aviso', 'Todas as ' + selecionadas.length + ' ordens selecionadas já estão finalizadas.');
        }
        return;
    }
    
    var motivo = sessionStorage.getItem('MOTIVO_PADRAO_OP') || localStorage.getItem('MOTIVO_PADRAO_OP') || '55';
    mostrarJanelaConfirmacaoLote(pendentes, gridAlvo, motivo);
}

// --------------------------------------------------------------------------
// 6. Preenchimento Automático das Datas de Produção (01/01/2020 a 01/01/2030)
// --------------------------------------------------------------------------

function preencherDatasPadraoProducao() {
    if (!window.Ext) return;

    try {
        var dtIniValor = new Date(2020, 0, 1); // 01/01/2020
        var dtFimValor = new Date(2030, 0, 1); // 01/01/2030
        var dtIniStr = '01/01/2020';
        var dtFimStr = '01/01/2030';

        // 1. Preenchimento via ComponentQuery do ExtJS
        if (window.Ext.ComponentQuery) {
            var dtIniFields = window.Ext.ComponentQuery.query('[itemid=txtDataInicialPainelControleProducao]') || [];
            var dtFimFields = window.Ext.ComponentQuery.query('[itemid=txtDataFinalPainelControleProducao]') || [];

            dtIniFields.forEach(function(field) {
                if (field && !field.isDestroyed) {
                    var val = field.getValue();
                    var rawVal = field.getRawValue ? field.getRawValue() : '';
                    if (!field._dataAutoPreenchida || (!val && !rawVal)) {
                        field.setValue(dtIniValor);
                        if (field.setRawValue) field.setRawValue(dtIniStr);
                        if (field.validate) field.validate();
                        field._dataAutoPreenchida = true;
                    }
                }
            });

            dtFimFields.forEach(function(field) {
                if (field && !field.isDestroyed) {
                    var val = field.getValue();
                    var rawVal = field.getRawValue ? field.getRawValue() : '';
                    if (!field._dataAutoPreenchida || (!val && !rawVal)) {
                        field.setValue(dtFimValor);
                        if (field.setRawValue) field.setRawValue(dtFimStr);
                        if (field.validate) field.validate();
                        field._dataAutoPreenchida = true;
                    }
                }
            });
        }

        // 2. Fallback via DOM direto em inputs
        var inputIni = document.querySelector('input[name="txtDataInicialPainelControleProducao"]') || 
                       document.querySelector('[itemid="txtDataInicialPainelControleProducao"] input') ||
                       document.querySelector('input[placeholder*="Data inicial"]');
        if (inputIni && (!inputIni.value || inputIni.value.trim() === '')) {
            inputIni.value = dtIniStr;
            inputIni.dispatchEvent(new Event('input', { bubbles: true }));
            inputIni.dispatchEvent(new Event('change', { bubbles: true }));
        }

        var inputFim = document.querySelector('input[name="txtDataFinalPainelControleProducao"]') || 
                       document.querySelector('[itemid="txtDataFinalPainelControleProducao"] input') ||
                       document.querySelector('input[placeholder*="Data final"]');
        if (inputFim && (!inputFim.value || inputFim.value.trim() === '')) {
            inputFim.value = dtFimStr;
            inputFim.dispatchEvent(new Event('input', { bubbles: true }));
            inputFim.dispatchEvent(new Event('change', { bubbles: true }));
        }
    } catch(e) {}
}

// --------------------------------------------------------------------------
// 6.1 Alternância de Tipo de Movimento (I507 / I516) e Preenchimento Automático
// --------------------------------------------------------------------------

function obterCodigoTMVAtual(lkTMV) {
    // 1. Prioridade: estado explicitamente definido nesta sessão para o componente
    if (lkTMV && lkTMV._tmvUsuarioAlternado) {
        return String(lkTMV._tmvUsuarioAlternado).trim().toUpperCase();
    }

    // 2. Prioridade: atributo do botão existente no DOM
    var btnExistente = document.querySelector('.ag-btn-toggle-tmv');
    if (btnExistente) {
        var attr = btnExistente.getAttribute('data-atual');
        if (attr === 'I516' || attr === 'I507') return attr;
    }

    // 3. Prioridade: valor no input visível do DOM
    var domInput = document.querySelector('[itemid="lkTMVManutencaoDatas"] input') || 
                   document.querySelector('input[name="IdDoTipoDeMovimento"]') ||
                   document.querySelector('input[name*="TipoDeMovimento"]');
    if (domInput && domInput.value) {
        var vDom = String(domInput.value).trim().toUpperCase();
        if (vDom.indexOf('I516') !== -1) return 'I516';
        if (vDom.indexOf('I507') !== -1) return 'I507';
    }

    // 4. Prioridade: componentes internos do ExtJS
    if (lkTMV && lkTMV.down) {
        var cp = lkTMV.down('[itemid=campoDePesquisa]') || lkTMV.down('campoDePesquisa');
        if (cp) {
            var vCp = cp.getValue ? cp.getValue() : (cp.getRawValue ? cp.getRawValue() : '');
            vCp = String(vCp || '').trim().toUpperCase();
            if (vCp.indexOf('I516') !== -1) return 'I516';
            if (vCp.indexOf('I507') !== -1) return 'I507';
        }
        var txtId = lkTMV.down('[itemid=txtLookupId]');
        if (txtId) {
            var vId = txtId.getValue ? txtId.getValue() : (txtId.getRawValue ? txtId.getRawValue() : '');
            vId = String(vId || '').trim().toUpperCase();
            if (vId.indexOf('I516') !== -1) return 'I516';
            if (vId.indexOf('I507') !== -1) return 'I507';
        }
    }

    // 5. Prioridade: valor salvo na sessão
    var salvo = sessionStorage.getItem('TMV_PADRAO_MANUTENCAO') || localStorage.getItem('TMV_PADRAO_MANUTENCAO');
    if (salvo) {
        var vSalvo = String(salvo).trim().toUpperCase();
        if (vSalvo.indexOf('I516') !== -1) return 'I516';
        if (vSalvo.indexOf('I507') !== -1) return 'I507';
    }

    return 'I507';
}

function definirValorTMV(lkTMV, codigo) {
    if (!codigo) return;
    codigo = String(codigo).trim().toUpperCase();

    try {
        if ((!lkTMV || lkTMV.isDestroyed) && window.Ext && window.Ext.ComponentQuery) {
            var lks = window.Ext.ComponentQuery.query('[itemid=lkTMVManutencaoDatas]') || [];
            if (lks[0] && !lks[0].isDestroyed) lkTMV = lks[0];
        }

        if (lkTMV) {
            lkTMV._tmvUsuarioAlternado = codigo;
            lkTMV._tmvAutoPreenchido = true;
        }

        sessionStorage.setItem('TMV_PADRAO_MANUTENCAO', codigo);
        localStorage.setItem('TMV_PADRAO_MANUTENCAO', codigo);

        // 1. Atualiza componentes ExtJS
        if (lkTMV && !lkTMV.isDestroyed) {
            var txtId = lkTMV.down ? lkTMV.down('[itemid=txtLookupId]') : null;
            var cp = lkTMV.down ? (lkTMV.down('[itemid=campoDePesquisa]') || lkTMV.down('campoDePesquisa')) : null;

            if (txtId && typeof txtId.setValue === 'function') {
                try { txtId.setValue(codigo); } catch(e) {}
                if (txtId.inputEl && txtId.inputEl.dom) txtId.inputEl.dom.value = codigo;
            }

            if (typeof lkTMV.setValue === 'function') {
                try { lkTMV.setValue(codigo); } catch(e) {}
            }
            if (lkTMV.inputEl && lkTMV.inputEl.dom) {
                lkTMV.inputEl.dom.value = codigo;
            }

            if (cp) {
                try {
                    if (typeof cp.setValue === 'function') cp.setValue(codigo);
                    if (typeof cp.setRawValue === 'function') cp.setRawValue(codigo);
                } catch(e) {}
                if (cp.inputEl && cp.inputEl.dom) {
                    cp.inputEl.dom.value = codigo;
                    cp.inputEl.dom.dispatchEvent(new Event('input', { bubbles: true }));
                    cp.inputEl.dom.dispatchEvent(new Event('change', { bubbles: true }));
                }
                if (typeof cp.validate === 'function') cp.validate();
            }

            if (typeof lkTMV.validate === 'function') lkTMV.validate();
        }

        // 2. Atualiza inputs correspondentes no DOM
        var domInputs = document.querySelectorAll('[itemid="lkTMVManutencaoDatas"] input, input[name="IdDoTipoDeMovimento"], input[name*="TipoDeMovimento"]');
        domInputs.forEach(function(inp) {
            if (inp && inp.type !== 'hidden') {
                inp.value = codigo;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (inp && inp.type === 'hidden') {
                inp.value = codigo;
            }
        });

        // 3. Atualiza o único botão no DOM
        atualizarBotaoAlternarTMV(lkTMV, codigo);

        // 4. Feedback visual
        mostrarToastNotificacao('Tipo de Movimento alternado para <b>' + codigo + '</b>');
    } catch(e) {
        console.warn('[ERP Optimizer] Erro ao definir TMV:', e);
    }
}

function alternarValorTMV(lkTMV) {
    try {
        var atual = obterCodigoTMVAtual(lkTMV);
        var novoCodigo = (atual === 'I516') ? 'I507' : 'I516';
        definirValorTMV(lkTMV, novoCodigo);
    } catch(e) {
        console.warn('[ERP Optimizer] Erro ao alternar TMV:', e);
    }
}

function obterBodyDomTMV(lkTMV) {
    if (!lkTMV) return null;
    try {
        if (lkTMV.bodyEl) {
            if (lkTMV.bodyEl.dom && lkTMV.bodyEl.dom.nodeType) return lkTMV.bodyEl.dom;
            if (lkTMV.bodyEl.nodeType) return lkTMV.bodyEl;
        }
        var domCmp = extrairDom(lkTMV);
        if (domCmp) {
            var b = domCmp.querySelector ? (domCmp.querySelector('.x-form-item-body') || domCmp) : domCmp;
            if (b) return b;
        }
    } catch(e) {}
    return null;
}

function atualizarBotaoAlternarTMV(lkTMV, codigoAtual) {
    try {
        var codigo = codigoAtual || obterCodigoTMVAtual(lkTMV);
        var is516 = String(codigo).toUpperCase().indexOf('I516') !== -1;
        var proximo = is516 ? 'I507' : 'I516';
        var textoAtual = is516 ? 'I516' : 'I507';

        var botoes = document.querySelectorAll('.ag-btn-toggle-tmv');
        if (botoes.length === 0) return;

        // Se houver mais de um botão, remove todos os duplicados imediatamente
        for (var i = 1; i < botoes.length; i++) {
            botoes[i].remove();
        }

        var btn = botoes[0];
        btn.innerHTML = '⇄ Alternar para ' + proximo;
        btn.title = 'Tipo de Movimento atual: ' + textoAtual + '. Clique para alternar para ' + proximo + '.';
        btn.setAttribute('data-atual', textoAtual);
        btn.setAttribute('data-proximo', proximo);
    } catch(e) {}
}

function garantirBotaoAlternarTMV(lkTMV) {
    try {
        // 1. Limpeza rigorosa: se já houver mais de um botão no documento, remove os excedentes
        var botoesExistentes = document.querySelectorAll('.ag-btn-toggle-tmv');
        if (botoesExistentes.length > 1) {
            for (var i = 1; i < botoesExistentes.length; i++) {
                botoesExistentes[i].remove();
            }
        }

        // Se já existe exatamente 1 botão no documento, apenas atualiza seu texto/estado e encerra
        if (botoesExistentes.length === 1) {
            atualizarBotaoAlternarTMV(lkTMV);
            return;
        }

        // 2. Se lkTMV não foi fornecido, tenta localizá-lo via ExtJS
        if ((!lkTMV || lkTMV.isDestroyed) && window.Ext && window.Ext.ComponentQuery) {
            var lks = window.Ext.ComponentQuery.query('[itemid=lkTMVManutencaoDatas]') || [];
            if (lks[0] && !lks[0].isDestroyed) lkTMV = lks[0];
        }

        // 3. Localiza o elemento container alvo no DOM
        var bodyDom = null;
        if (lkTMV && !lkTMV.isDestroyed) {
            bodyDom = obterBodyDomTMV(lkTMV);
        }

        if (!bodyDom) {
            var domInput = document.querySelector('[itemid="lkTMVManutencaoDatas"] input') || 
                           document.querySelector('input[name="IdDoTipoDeMovimento"]') ||
                           document.querySelector('input[name*="TipoDeMovimento"]');
            if (domInput) {
                var containerParent = domInput.closest ? domInput.closest('[itemid="lkTMVManutencaoDatas"]') : null;
                if (containerParent) {
                    bodyDom = containerParent.querySelector('.x-form-item-body') || containerParent;
                } else {
                    bodyDom = (domInput.closest && domInput.closest('.x-form-item-body')) || domInput.parentElement;
                }
            }
        }

        if (!bodyDom) {
            if (lkTMV && typeof lkTMV.on === 'function' && !lkTMV._agHookedRenderTMV) {
                lkTMV.on('afterrender', function() {
                    garantirBotaoAlternarTMV(lkTMV);
                }, null, { single: true });
                lkTMV._agHookedRenderTMV = true;
            }
            return;
        }

        // 4. Ajusta estilo do container para alinhamento horizontal
        bodyDom.style.display = 'flex';
        bodyDom.style.alignItems = 'center';
        bodyDom.style.whiteSpace = 'nowrap';

        var cp = (lkTMV && lkTMV.down && typeof lkTMV.down === 'function') ? (lkTMV.down('[itemid=campoDePesquisa]') || lkTMV.down('campoDePesquisa')) : null;
        if (cp) {
            var cpDom = extrairDom(cp);
            if (cpDom && cpDom.style) {
                cpDom.style.maxWidth = 'calc(100% - 165px)';
                cpDom.style.display = 'inline-block';
                cpDom.style.verticalAlign = 'middle';
            }
        } else {
            var wrap = bodyDom.querySelector('.x-form-trigger-wrap');
            if (wrap && wrap.style) {
                wrap.style.maxWidth = 'calc(100% - 165px)';
                wrap.style.display = 'inline-block';
                wrap.style.verticalAlign = 'middle';
            }
        }

        // 5. Cria o único botão de alternância
        var codigoAtual = obterCodigoTMVAtual(lkTMV);
        var is516 = (codigoAtual === 'I516');
        var proximo = is516 ? 'I507' : 'I516';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ag-btn-toggle-tmv';
        btn.innerHTML = '⇄ Alternar para ' + proximo;
        btn.title = 'Tipo de Movimento atual: ' + codigoAtual + '. Clique para alternar para ' + proximo + '.';
        btn.setAttribute('data-atual', codigoAtual);
        btn.setAttribute('data-proximo', proximo);

        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            alternarValorTMV(lkTMV);
        });

        bodyDom.appendChild(btn);
    } catch(e) {
        console.warn('[ERP Optimizer] Erro ao garantir botão alternar TMV:', e);
    }
}

function preencherDatasPadraoManutencaoDeDatas() {
    if (!window.Ext) return;

    try {
        var dtIniValor = new Date(2020, 0, 1); // 01/01/2020
        dtIniValor.setHours(0, 0, 0, 0);
        var dtFimValor = new Date(2030, 0, 1); // 01/01/2030
        dtFimValor.setHours(0, 0, 0, 0);
        var dtIniStr = '01/01/2020';
        var dtFimStr = '01/01/2030';

        // 1. Preenchimento via ComponentQuery do ExtJS
        if (window.Ext.ComponentQuery) {
            var dtIniFields = window.Ext.ComponentQuery.query('[itemid=txtDataInicialManutencaoDedatas]') || [];
            var dtFimFields = window.Ext.ComponentQuery.query('[itemid=txtDataFinalManutencaoDedatas]') || [];

            dtIniFields.forEach(function(field) {
                if (field && !field.isDestroyed) {
                    var val = field.getValue ? field.getValue() : null;
                    var rawVal = field.getRawValue ? field.getRawValue() : '';
                    if (!field._dataAutoPreenchida || (!val && !rawVal)) {
                        try {
                            if (typeof field.setValue === 'function') field.setValue(dtIniValor);
                            if (typeof field.setRawValue === 'function') field.setRawValue(dtIniStr);
                            if (field.inputEl && field.inputEl.dom) field.inputEl.dom.value = dtIniStr;
                            if (typeof field.validate === 'function') field.validate();
                            field._dataAutoPreenchida = true;
                        } catch(e) {}
                    }
                }
            });

            dtFimFields.forEach(function(field) {
                if (field && !field.isDestroyed) {
                    var val = field.getValue ? field.getValue() : null;
                    var rawVal = field.getRawValue ? field.getRawValue() : '';
                    if (!field._dataAutoPreenchida || (!val && !rawVal)) {
                        try {
                            if (typeof field.setValue === 'function') field.setValue(dtFimValor);
                            if (typeof field.setRawValue === 'function') field.setRawValue(dtFimStr);
                            if (field.inputEl && field.inputEl.dom) field.inputEl.dom.value = dtFimStr;
                            if (typeof field.validate === 'function') field.validate();
                            field._dataAutoPreenchida = true;
                        } catch(e) {}
                    }
                }
            });

            // Varre também pelo formulário EditViewDeParametrosManutencaoDeDatas
            var formsParam = window.Ext.ComponentQuery.query('EditViewDeParametrosManutencaoDeDatas') || [];
            formsParam.forEach(function(form) {
                if (form && !form.isDestroyed) {
                    // Preenche Perfil TMV (VDA0601) se vazio para habilitar o campo de Tipo de Movimento
                    var cboPerfil = form.down ? form.down('[itemid=cboPerfilTMVManutencao]') : null;
                    if (cboPerfil && !cboPerfil.isDestroyed) {
                        var valPerfil = cboPerfil.getValue ? cboPerfil.getValue() : null;
                        if (!valPerfil) {
                            try {
                                if (typeof cboPerfil.setValue === 'function') cboPerfil.setValue('VDA0601');
                            } catch(e) {}
                        }
                    }

                    // Preenche Tipo de Movimento (I507 por padrão, ou mantém o alternado pelo usuário)
                    var lkTMV = form.down ? (form.down('[itemid=lkTMVManutencaoDatas]') || form.down('[name=IdDoTipoDeMovimento]')) : null;
                    if (lkTMV && !lkTMV.isDestroyed) {
                        var valTMV = lkTMV.getValue ? lkTMV.getValue() : null;
                        var rawTMV = lkTMV.getRawValue ? lkTMV.getRawValue() : '';
                        if (!lkTMV._tmvAutoPreenchido && (!valTMV && !rawTMV)) {
                            try {
                                if (lkTMV.hidden && typeof lkTMV.show === 'function') lkTMV.show();
                                var valorPadrao = lkTMV._tmvUsuarioAlternado || sessionStorage.getItem('TMV_PADRAO_MANUTENCAO') || localStorage.getItem('TMV_PADRAO_MANUTENCAO') || 'I507';
                                if (typeof lkTMV.setValue === 'function') lkTMV.setValue(valorPadrao);
                                if (typeof lkTMV.setRawValue === 'function') lkTMV.setRawValue(valorPadrao);
                                var cp = lkTMV.down ? (lkTMV.down('[itemid=campoDePesquisa]') || lkTMV.down('campoDePesquisa')) : null;
                                if (cp) {
                                    if (typeof cp.setValue === 'function') cp.setValue(valorPadrao);
                                    if (typeof cp.setRawValue === 'function') cp.setRawValue(valorPadrao);
                                    if (cp.inputEl && cp.inputEl.dom) cp.inputEl.dom.value = valorPadrao;
                                }
                                if (lkTMV.inputEl && lkTMV.inputEl.dom) lkTMV.inputEl.dom.value = valorPadrao;
                                if (typeof lkTMV.validate === 'function') lkTMV.validate();
                                lkTMV._tmvAutoPreenchido = true;
                            } catch(e) {}
                        }
                        garantirBotaoAlternarTMV(lkTMV);
                    }

                    var cIni = form.down ? (form.down('[itemid=txtDataInicialManutencaoDedatas]') || form.down('[name=DataInicial]')) : null;
                    var cFim = form.down ? (form.down('[itemid=txtDataFinalManutencaoDedatas]') || form.down('[name=DataFinal]')) : null;
                    if (cIni && !cIni.isDestroyed && (!cIni.getValue() && !(cIni.getRawValue && cIni.getRawValue()))) {
                        try {
                            if (typeof cIni.setValue === 'function') cIni.setValue(dtIniValor);
                            if (typeof cIni.setRawValue === 'function') cIni.setRawValue(dtIniStr);
                            if (cIni.inputEl && cIni.inputEl.dom) cIni.inputEl.dom.value = dtIniStr;
                            if (typeof cIni.validate === 'function') cIni.validate();
                            cIni._dataAutoPreenchida = true;
                        } catch(e) {}
                    }
                    if (cFim && !cFim.isDestroyed && (!cFim.getValue() && !(cFim.getRawValue && cFim.getRawValue()))) {
                        try {
                            if (typeof cFim.setValue === 'function') cFim.setValue(dtFimValor);
                            if (typeof cFim.setRawValue === 'function') cFim.setRawValue(dtFimStr);
                            if (cFim.inputEl && cFim.inputEl.dom) cFim.inputEl.dom.value = dtFimStr;
                            if (typeof cFim.validate === 'function') cFim.validate();
                            cFim._dataAutoPreenchida = true;
                        } catch(e) {}
                    }
                }
            });

            // Preenchimento via ComponentQuery direto no lkTMVManutencaoDatas
            var lkTMVFields = window.Ext.ComponentQuery.query('[itemid=lkTMVManutencaoDatas]') || [];
            lkTMVFields.forEach(function(lk) {
                if (lk && !lk.isDestroyed) {
                    var v = lk.getValue ? lk.getValue() : null;
                    var rv = lk.getRawValue ? lk.getRawValue() : '';
                    if (!lk._tmvAutoPreenchido && (!v && !rv)) {
                        try {
                            if (lk.hidden && typeof lk.show === 'function') lk.show();
                            var valorPadrao2 = lk._tmvUsuarioAlternado || sessionStorage.getItem('TMV_PADRAO_MANUTENCAO') || localStorage.getItem('TMV_PADRAO_MANUTENCAO') || 'I507';
                            if (typeof lk.setValue === 'function') lk.setValue(valorPadrao2);
                            if (typeof lk.setRawValue === 'function') lk.setRawValue(valorPadrao2);
                            var cp2 = lk.down ? (lk.down('[itemid=campoDePesquisa]') || lk.down('campoDePesquisa')) : null;
                            if (cp2) {
                                if (typeof cp2.setValue === 'function') cp2.setValue(valorPadrao2);
                                if (typeof cp2.setRawValue === 'function') cp2.setRawValue(valorPadrao2);
                                if (cp2.inputEl && cp2.inputEl.dom) cp2.inputEl.dom.value = valorPadrao2;
                            }
                            if (lk.inputEl && lk.inputEl.dom) lk.inputEl.dom.value = valorPadrao2;
                            if (typeof lk.validate === 'function') lk.validate();
                            lk._tmvAutoPreenchido = true;
                        } catch(e) {}
                    }
                    garantirBotaoAlternarTMV(lk);
                }
            });
        }

        // 2. Fallback via DOM direto em inputs
        var inputTmv = document.querySelector('[itemid="lkTMVManutencaoDatas"] input') || 
                       document.querySelector('input[name="IdDoTipoDeMovimento"]');
        if (inputTmv) {
            var valorPadraoDom = sessionStorage.getItem('TMV_PADRAO_MANUTENCAO') || localStorage.getItem('TMV_PADRAO_MANUTENCAO') || 'I507';
            if (!inputTmv.value || inputTmv.value.trim() === '') {
                inputTmv.value = valorPadraoDom;
                inputTmv.dispatchEvent(new Event('input', { bubbles: true }));
                inputTmv.dispatchEvent(new Event('change', { bubbles: true }));
            }
            garantirBotaoAlternarTMV(null);
        }

        var inputIni = document.querySelector('input[name="DataInicial"]') || 
                       document.querySelector('[itemid="txtDataInicialManutencaoDedatas"] input');
        if (inputIni && (!inputIni.value || inputIni.value.trim() === '')) {
            inputIni.value = dtIniStr;
            inputIni.dispatchEvent(new Event('input', { bubbles: true }));
            inputIni.dispatchEvent(new Event('change', { bubbles: true }));
        }

        var inputFim = document.querySelector('input[name="DataFinal"]') || 
                       document.querySelector('[itemid="txtDataFinalManutencaoDedatas"] input');
        if (inputFim && (!inputFim.value || inputFim.value.trim() === '')) {
            inputFim.value = dtFimStr;
            inputFim.dispatchEvent(new Event('input', { bubbles: true }));
            inputFim.dispatchEvent(new Event('change', { bubbles: true }));
        }
    } catch(e) {}
}

// --------------------------------------------------------------------------
// 6.2 Configuração da Seleção de Itens da Manutenção de Datas
// --------------------------------------------------------------------------

function isGridSelecaoManutencaoDatas(grid) {
    if (!grid || grid.isDestroyed) return false;
    try {
        var itemId = String(grid.itemId || grid.itemid || '').toLowerCase();
        if (itemId === 'listadedocumentosparamanutencaodedatas') return true;

        var xtype = String(grid.xtype || '').toLowerCase();
        if (xtype.indexOf('listviewdeselecaodedocumentosparamanutencaodedatas') !== -1) return true;

        var cls = String(grid.$className || '');
        if (cls.indexOf('ListViewDeSelecaoDeDocumentosParaManutencaoDeDatas') !== -1) return true;

        if (grid.store) {
            var sCls = String(grid.store.$className || '');
            if (sCls.indexOf('StoreDeDocumentosParaManutencaoDeDatas') !== -1) return true;
            if (grid.store.proxy && grid.store.proxy.url && grid.store.proxy.url.indexOf('ManutencaoDeDatas/Listar') !== -1) return true;
        }

        var headerCt = grid.headerCt || (grid.getView && grid.getView().headerCt);
        if (headerCt && typeof headerCt.getGridColumns === 'function') {
            var cols = headerCt.getGridColumns() || [];
            var temDoc = false, temAux = false, temPrev = false;
            for (var i = 0; i < cols.length; i++) {
                var dIndex = cols[i] ? cols[i].dataIndex : '';
                if (dIndex === 'NumeroCompletoDocumento') temDoc = true;
                if (dIndex === 'CodigoDeDocumentoAuxiliar') temAux = true;
                if (dIndex === 'DataPrevisaoInicioAnterior' || dIndex === 'DataPrevisaoFinalAnterior') temPrev = true;
            }
            if (temDoc && temAux && temPrev) return true;
        }
    } catch(e) {}
    return false;
}

function obterGridSelecaoManutencaoDatas() {
    if (!window.Ext || !window.Ext.ComponentQuery) return null;
    try {
        var grids = window.Ext.ComponentQuery.query('ListViewDeSelecaoDeDocumentosParaManutencaoDeDatas') || [];
        for (var i = 0; i < grids.length; i++) {
            if (grids[i] && !grids[i].isDestroyed) return grids[i];
        }
        grids = window.Ext.ComponentQuery.query('[itemid=listaDeDocumentosParaManutencaoDeDatas]') || [];
        for (var j = 0; j < grids.length; j++) {
            if (grids[j] && !grids[j].isDestroyed) return grids[j];
        }
    } catch(e) {}
    return null;
}

function registroCorrespondeDocOuAux(reg, termo) {
    if (!termo) return true;
    var t = String(termo).trim().toUpperCase();
    if (!t) return true;

    var tNorm = t.replace(/[\s\-_/]/g, '');

    // 1. Número do documento (ex: 2003)
    var numDoc = (reg.NumeroDoDocumento !== undefined && reg.NumeroDoDocumento !== null) ? String(reg.NumeroDoDocumento).trim().toUpperCase() : '';
    if (numDoc) {
        if (numDoc === t || numDoc.indexOf(t) !== -1) return true;
        if (tNorm && numDoc.indexOf(tNorm) !== -1) return true;
    }

    // 2. Número completo do documento (ex: 100-SOP -1 -2003)
    var numCompleto = (reg.NumeroCompletoDocumento !== undefined && reg.NumeroCompletoDocumento !== null) ? String(reg.NumeroCompletoDocumento).trim().toUpperCase() : '';
    if (numCompleto) {
        if (numCompleto.indexOf(t) !== -1) return true;
        var numCompNorm = numCompleto.replace(/[\s\-_/]/g, '');
        if (tNorm && numCompNorm.indexOf(tNorm) !== -1) return true;
    }

    // 3. Código auxiliar (ex: BRA2804/20P)
    var codAux = (reg.CodigoDeDocumentoAuxiliar !== undefined && reg.CodigoDeDocumentoAuxiliar !== null) ? String(reg.CodigoDeDocumentoAuxiliar).trim().toUpperCase() : '';
    if (codAux) {
        if (codAux.indexOf(t) !== -1) return true;
        var codAuxNorm = codAux.replace(/[\s\-_/]/g, '');
        if (tNorm && codAuxNorm.indexOf(tNorm) !== -1) return true;
    }

    return false;
}


// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// 6.3.1 Importacao e Selecao em Massa de Itens via CSV / Lista (Manutencao de Datas)
// --------------------------------------------------------------------------

function converterDataBr(str) {
    if (!str) return null;
    if (str instanceof Date) return str;
    var partes = String(str).trim().split(/[\/\-]/);
    if (partes.length === 3) {
        var dia = parseInt(partes[0], 10);
        var mes = parseInt(partes[1], 10) - 1;
        var ano = parseInt(partes[2], 10);
        if (ano < 100) ano += 2000;
        return new Date(ano, mes, dia);
    }
    return new Date();
}

function parsearCsvManutencaoDatas(texto) {
    if (!texto || typeof texto !== 'string') return [];
    var linhas = texto.split(/\r?\n/);
    var itens = [];
    var ehCabecalho = true;

    for (var i = 0; i < linhas.length; i++) {
        var linha = linhas[i].trim();
        if (!linha) continue;

        // Detecta separador (; ou , ou tab)
        var sep = ';';
        if (linha.indexOf('\t') !== -1) sep = '\t';
        else if (linha.indexOf(';') !== -1) sep = ';';
        else if (linha.indexOf(',') !== -1) sep = ',';

        var colunas = linha.split(sep).map(function(c) {
            return c.trim().replace(/^["']|["']$/g, '');
        });

        // Ignora cabecalho comum (se primeira linha contiver palavras-chave)
        var linhaLower = linha.toLowerCase();
        if (ehCabecalho && (linhaLower.indexOf('doc') !== -1 || linhaLower.indexOf('op') !== -1 || linhaLower.indexOf('item') !== -1)) {
            ehCabecalho = false;
            continue;
        }
        ehCabecalho = false;

        var col0 = colunas[0] || '';
        if (!col0) continue;

        var doc = col0;
        var numItem = colunas[1] || '';
        var codAux = '';
        var novaData = '';

        // Se coluna 2 ou 3 for data (formato DD/MM/AAAA)
        if (colunas[2] && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(colunas[2])) {
            novaData = colunas[2];
        } else if (colunas[3] && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(colunas[3])) {
            codAux = colunas[2] || '';
            novaData = colunas[3];
        } else {
            codAux = colunas[2] || '';
            if (colunas[3] && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(colunas[3])) {
                novaData = colunas[3];
            } else if (colunas[4] && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(colunas[4])) {
                novaData = colunas[4];
            }
        }

        // Se numItem parecer data, ajusta
        if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(numItem)) {
            novaData = numItem;
            numItem = '';
        }

        itens.push({
            documento: doc,
            item: numItem,
            codigoAuxiliar: codAux,
            novaData: novaData
        });
    }

    return itens;
}

function itemCorrespondeAoRegistro(itemCsv, reg) {
    if (!itemCsv || !reg) return false;
    var docCsv = String(itemCsv.documento || '').trim().toUpperCase();
    var itemNumCsv = String(itemCsv.item || '').trim();
    var codAuxCsv = String(itemCsv.codigoAuxiliar || '').trim().toUpperCase();

    var regData = reg.data || reg;
    var regDocNum = String(regData.NumeroDoDocumento !== undefined && regData.NumeroDoDocumento !== null ? regData.NumeroDoDocumento : '').trim().toUpperCase();
    var regDocCompleto = String(regData.NumeroCompletoDocumento !== undefined && regData.NumeroCompletoDocumento !== null ? regData.NumeroCompletoDocumento : '').trim().toUpperCase();
    var regCodAux = String(regData.CodigoDeDocumentoAuxiliar !== undefined && regData.CodigoDeDocumentoAuxiliar !== null ? regData.CodigoDeDocumentoAuxiliar : '').trim().toUpperCase();
    var regItem = String(regData.NumeroDoItem !== undefined && regData.NumeroDoItem !== null ? regData.NumeroDoItem : '').trim();
    var regItemESubitem = String(regData.NumeroItemESubitem !== undefined && regData.NumeroItemESubitem !== null ? regData.NumeroItemESubitem : '').trim();

    // 1. Validar documento / OP / codigo auxiliar
    var bateuDoc = false;
    if (docCsv) {
        var matchNumCsv = docCsv.match(/(?:-|\s|^)(\d+)$/);
        var puroNumCsv = matchNumCsv ? matchNumCsv[1] : docCsv;

        if (regDocNum && (regDocNum === puroNumCsv || regDocNum === docCsv)) {
            bateuDoc = true;
        } else if (regDocCompleto && (regDocCompleto.indexOf(docCsv) !== -1 || (puroNumCsv && regDocCompleto.indexOf(puroNumCsv) !== -1))) {
            bateuDoc = true;
        } else if (regCodAux && (regCodAux === docCsv || (codAuxCsv && regCodAux === codAuxCsv))) {
            bateuDoc = true;
        }
    } else if (codAuxCsv && regCodAux && regCodAux === codAuxCsv) {
        bateuDoc = true;
    }

    if (!bateuDoc) return false;

    // 2. Validar item (se informado no CSV)
    if (itemNumCsv) {
        var itemNumFloat = parseFloat(itemNumCsv);
        var regItemFloat = parseFloat(regItemESubitem || regItem);
        if (!isNaN(itemNumFloat) && !isNaN(regItemFloat)) {
            if (itemNumFloat === regItemFloat) return true;
        }
        if (regItem === itemNumCsv || regItemESubitem === itemNumCsv) return true;
        return false;
    }

    // Se nao especificou item no CSV, bate com todos os itens do documento
    return true;
}

function adicionarItemSeNaoExistir(lista, modelReg) {
    if (!lista || !modelReg) return false;
    var d = modelReg.data || modelReg;
    var idDoc = d.IDDoDocumento;
    var numItem = d.NumeroDoItem;
    var numSub = d.NumeroDoSubItem;

    for (var i = 0; i < lista.length; i++) {
        var exist = lista[i].data || lista[i];
        if (exist.IDDoDocumento == idDoc && exist.NumeroDoItem == numItem && exist.NumeroDoSubItem == numSub) {
            lista[i] = modelReg;
            return false;
        }
    }
    lista.push(modelReg);
    return true;
}

function avancarParaPasso3Manutencao(ctrl, grid) {
    if (!ctrl) ctrl = obterControllerManutencao(grid);
    if (!ctrl) return;

    var p = grid.up('EditViewDeSelecaoDeDocumentoParaManutencaoDeDatas') || grid.up('formularioPadrao') || grid.up('panel');
    var cfg = (p && p.config) ? p.config : null;

    if (cfg && typeof ctrl.acaoProximo === 'function') {
        ctrl.acaoProximo(cfg);
    } else if (ctrl.assistente && typeof ctrl.ativarPasso === 'function' && cfg) {
        ctrl.ativarPasso(cfg, ctrl.assistente.setarPasso(3));
    } else {
        var botoes = Ext.ComponentQuery.query('button') || [];
        for (var i = 0; i < botoes.length; i++) {
            var b = botoes[i];
            var txt = (b.text || '').toLowerCase().trim();
            if ((txt === 'próximo' || txt === 'proximo' || txt.indexOf('próximo') !== -1 || txt.indexOf('proximo') !== -1) && !b.isDisabled()) {
                if (typeof b.handler === 'function') {
                    b.handler.call(b.scope || b, b);
                } else {
                    b.fireEvent('click', b);
                }
                break;
            }
        }
    }
}

function buscarItensNoServidorEAvancar(ctrl, grid, itensCsv, dtIniVal, dtFimVal, motivoVal, obsVal, win, progressBar, lblStatus, btnAcao) {
    var mapaOps = {};
    itensCsv.forEach(function(it) {
        var d = String(it.documento || '').trim();
        if (d) {
            var matchNum = d.match(/(?:-|\s|^)(\d+)$/);
            var puro = matchNum ? matchNum[1] : d;
            if (!mapaOps[puro]) {
                mapaOps[puro] = [];
            }
            mapaOps[puro].push(it);
        }
    });

    var listaOps = Object.keys(mapaOps);
    var totalOps = listaOps.length;

    if (totalOps === 0) {
        lblStatus.update('<div style="font-size: 11px; color: #dc2626; font-weight: bold;">Nenhuma OP ou Documento identificado no texto/CSV.</div>');
        btnAcao.setDisabled(false);
        return;
    }

    btnAcao.setDisabled(true);
    progressBar.setVisible(true);
    progressBar.updateProgress(0, 'Iniciando busca no servidor...');
    lblStatus.update('<div style="font-size: 11px; color: #15428b; font-weight: bold;">Consultando ' + totalOps + ' OPs no banco de dados do ERP...</div>');

    var urlListar = (grid.store && grid.store.proxy && grid.store.proxy.url) ? grid.store.proxy.url : 'ManutencaoDeDatas/Listar';
    var extraParamsPadrao = (grid.store && grid.store.proxy && grid.store.proxy.extraParams) ? grid.store.proxy.extraParams : {};

    var tmvPadrao = extraParamsPadrao.tmv || (ctrl.model && ctrl.model.data ? ctrl.model.data.IdDoTipoDeMovimento : null);
    var perfilPadrao = extraParamsPadrao.perfilTMV || (ctrl.model && ctrl.model.data ? ctrl.model.data.PerfilTMV : null);

    if (!Array.isArray(ctrl.listaDeItensParaManutencao)) {
        ctrl.listaDeItensParaManutencao = [];
    }

    var itensEncontrados = 0;
    var opsConcluidas = 0;
    var opsNaoEncontradas = [];
    var cancelado = false;

    var CONCORRENCIA = 4;
    var indiceOpAtual = 0;

    function processarProximaOp() {
        if (cancelado) return;

        if (indiceOpAtual >= totalOps) {
            if (opsConcluidas >= totalOps) {
                finalizarBusca();
            }
            return;
        }

        var opAtual = listaOps[indiceOpAtual++];
        var params = {
            valorDeConsulta: opAtual,
            limit: 100,
            page: 1,
            start: 0
        };
        if (tmvPadrao) params.tmv = tmvPadrao;
        if (perfilPadrao) params.perfilTMV = perfilPadrao;

        Ext.Ajax.request({
            url: urlListar,
            method: 'GET',
            params: params,
            timeout: 30000,
            success: function(resp) {
                var dados;
                try {
                    dados = Ext.decode(resp.responseText);
                } catch(e) {
                    dados = {};
                }

                var registros = (dados && Array.isArray(dados.registros)) ? dados.registros : [];
                var achouAlgum = false;

                if (registros.length > 0) {
                    var itensDestaOp = mapaOps[opAtual] || [];
                    for (var r = 0; r < registros.length; r++) {
                        var regRaw = registros[r];
                        var modelReg = Ext.create('GMF.model.Projecao.MovimentacaoDeEntradaESaida.ManutencaoDeDatas.ProjecaoDeManutencaoDeDatasDeProducao', regRaw);

                        for (var k = 0; k < itensDestaOp.length; k++) {
                            var itCsv = itensDestaOp[k];
                            if (itemCorrespondeAoRegistro(itCsv, modelReg)) {
                                achouAlgum = true;
                                var dataIniFinal = itCsv.novaData ? converterDataBr(itCsv.novaData) : dtIniVal;
                                var dataFimFinal = itCsv.novaData ? converterDataBr(itCsv.novaData) : (dtFimVal || dtIniVal);

                                modelReg.data.DataPrevisaoInicioAtual = dataIniFinal;
                                modelReg.data.DataPrevisaoFinalAtual = dataFimFinal;
                                modelReg.data.CodigoDoMotivo = motivoVal;
                                modelReg.data.Observacao = obsVal;

                                adicionarItemSeNaoExistir(ctrl.listaDeItensParaManutencao, modelReg);
                                itensEncontrados++;
                            }
                        }
                    }
                }

                if (!achouAlgum) {
                    opsNaoEncontradas.push(opAtual);
                }

                opsConcluidas++;
                var pct = totalOps > 0 ? (opsConcluidas / totalOps) : 1;
                progressBar.updateProgress(pct, Math.round(pct * 100) + '% (' + opsConcluidas + ' de ' + totalOps + ' OPs)');
                lblStatus.update('<div style="font-size: 11px; color: #1e293b;">Buscando no servidor... <b>' + itensEncontrados + '</b> item(ns) prontos localizados.</div>');

                if (indiceOpAtual < totalOps) {
                    processarProximaOp();
                } else if (opsConcluidas >= totalOps) {
                    finalizarBusca();
                }
            },
            failure: function() {
                opsNaoEncontradas.push(opAtual);
                opsConcluidas++;
                var pct = totalOps > 0 ? (opsConcluidas / totalOps) : 1;
                progressBar.updateProgress(pct, Math.round(pct * 100) + '% (' + opsConcluidas + ' de ' + totalOps + ' OPs)');

                if (indiceOpAtual < totalOps) {
                    processarProximaOp();
                } else if (opsConcluidas >= totalOps) {
                    finalizarBusca();
                }
            }
        });
    }

    function finalizarBusca() {
        btnAcao.setDisabled(false);
        progressBar.updateProgress(1, '100% - Busca concluida!');

        if (itensEncontrados > 0) {
            var msgSucesso = '<div style="font-size: 12px; color: #15803d; font-weight: bold; margin-top: 6px;">' + itensEncontrados + ' item(ns) localizado(s) no servidor e preparados com as novas datas!</div>';
            if (opsNaoEncontradas.length > 0) {
                msgSucesso += '<div style="font-size: 10px; color: #b45309; margin-top: 4px;">OPs nao localizadas no ERP (' + opsNaoEncontradas.length + '): ' + opsNaoEncontradas.slice(0, 8).join(', ') + (opsNaoEncontradas.length > 8 ? '...' : '') + '</div>';
            }
            msgSucesso += '<div style="font-size: 11px; color: #15428b; font-weight: 600; margin-top: 6px;">Avancando para o Passo 3 (Confirmacao)...</div>';
            lblStatus.update(msgSucesso);

            setTimeout(function() {
                try { win.close(); } catch(e) {}
                avancarParaPasso3Manutencao(ctrl, grid);
                mostrarToastNotificacao(ctrl.listaDeItensParaManutencao.length + ' item(ns) carregados para confirmacao no Passo 3!');
            }, 1000);
        } else {
            lblStatus.update('<div style="font-size: 11px; color: #dc2626; font-weight: bold; margin-top: 6px;">Nenhum dos itens informados foi localizado no servidor do ERP. Verifique se os numeros das OPs estao corretos.</div>');
        }
    }

    for (var i = 0; i < Math.min(CONCORRENCIA, totalOps); i++) {
        processarProximaOp();
    }
}

function abrirModalImportacaoCsvManutencaoDatas(grid) {
    if (!grid || grid.isDestroyed) return;
    var ctrl = obterControllerManutencao(grid);

    var txtCsv = Ext.create('Ext.form.field.TextArea', {
        itemId: 'txtConteudoCsv',
        fieldLabel: 'Conteudo CSV ou Lista de OPs',
        labelAlign: 'top',
        emptyText: 'Cole aqui os dados do CSV exportado pelo painel ou uma lista simples de OPs.\n\nExemplos aceitos:\n2013;5.0;30/10/2026\n20489;1.0;30/10/2026\n\nOu apenas o numero das OPs (uma por linha):\n2013\n20489\n21372',
        height: 180,
        width: '100%',
        cls: 'ag-textarea-csv'
    });

    var dtInicio = Ext.create('Ext.form.field.Date', {
        itemId: 'dtPrevisaoInicioCsv',
        fieldLabel: 'Nova Previsao Inicio',
        format: 'd/m/Y',
        submitFormat: 'Y-m-d',
        value: new Date(),
        width: 250,
        labelWidth: 130
    });

    var dtFim = Ext.create('Ext.form.field.Date', {
        itemId: 'dtPrevisaoFimCsv',
        fieldLabel: 'Nova Previsao Termino',
        format: 'd/m/Y',
        submitFormat: 'Y-m-d',
        value: new Date(),
        width: 250,
        labelWidth: 130
    });

    dtInicio.on('change', function(cmp, newVal) {
        if (newVal) dtFim.setValue(newVal);
    });

    var txtMotivo = Ext.create('Ext.form.field.Text', {
        itemId: 'txtMotivoCsv',
        fieldLabel: 'Codigo do Motivo',
        value: 'P4',
        width: 250,
        labelWidth: 130
    });

    var txtObs = Ext.create('Ext.form.field.Text', {
        itemId: 'txtObsCsv',
        fieldLabel: 'Observacao',
        value: 'Adiantamento de producao - itens prontos',
        width: '100%',
        labelWidth: 130
    });

    var progressBar = Ext.create('Ext.ProgressBar', {
        itemId: 'progressImportacaoCsv',
        width: '100%',
        height: 20,
        value: 0,
        text: 'Aguardando inicio...',
        hidden: true,
        cls: 'ag-progressbar-lote',
        margin: '8 0 4 0'
    });

    var lblStatus = Ext.create('Ext.Component', {
        itemId: 'lblStatusCsv',
        html: '<div style="font-size: 11px; color: #64748b; margin-top: 6px;">Cole os dados ou carregue o CSV e clique em Buscar no Servidor e Avancar para o Passo 3.</div>'
    });

    var btnCarregarArquivo = Ext.create('Ext.button.Button', {
        text: 'Carregar Arquivo CSV (.csv / .txt)',
        cls: 'ag-btn-extjs',
        handler: function() {
            var fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.csv,.txt';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);

            fileInput.onchange = function(e) {
                var file = e.target.files && e.target.files[0];
                if (!file) return;
                var reader = new FileReader();
                reader.onload = function(evt) {
                    var conteudo = evt.target.result;
                    txtCsv.setValue(conteudo);
                    var itensLidos = parsearCsvManutencaoDatas(conteudo);
                    lblStatus.update('<div style="font-size: 11px; color: #15803d; font-weight: bold; margin-top: 6px;">Arquivo carregado com sucesso: ' + itensLidos.length + ' item(ns) identificado(s).</div>');
                };
                reader.readAsText(file, 'UTF-8');
                document.body.removeChild(fileInput);
            };

            fileInput.click();
        }
    });

    var btnBuscarEAvancar = Ext.create('Ext.button.Button', {
        text: 'Buscar no Servidor e Avancar para o Passo 3',
        tooltip: 'Localiza todos os itens do CSV diretamente no banco do ERP, aplica as novas datas e leva direto para a Confirmacao',
        cls: 'ag-btn-extjs ag-btn-destaque-csv',
        handler: function() {
            var texto = txtCsv.getValue();
            var itens = parsearCsvManutencaoDatas(texto);
            if (!itens.length) {
                lblStatus.update('<div style="font-size: 11px; color: #dc2626; font-weight: bold;">Nenhum item valido encontrado no texto/CSV.</div>');
                return;
            }

            var dtIniVal = dtInicio.getValue();
            var dtFimVal = dtFim.getValue();
            var motivoVal = txtMotivo.getValue() || 'P4';
            var obsVal = txtObs.getValue() || '';

            if (!dtIniVal) {
                lblStatus.update('<div style="font-size: 11px; color: #dc2626; font-weight: bold;">Informe a Nova Previsao Inicio.</div>');
                return;
            }

            ctrl = ctrl || obterControllerManutencao(grid);
            if (!ctrl) {
                lblStatus.update('<div style="font-size: 11px; color: #dc2626; font-weight: bold;">Controller de Manutencao de Datas nao localizado.</div>');
                return;
            }

            buscarItensNoServidorEAvancar(ctrl, grid, itens, dtIniVal, dtFimVal, motivoVal, obsVal, win, progressBar, lblStatus, btnBuscarEAvancar);
        }
    });

    var win = Ext.create('Ext.window.Window', {
        title: 'Manutencao de Datas - Importacao de Itens (via CSV / Lista)',
        width: 600,
        bodyPadding: '14 18',
        modal: true,
        resizable: true,
        items: [
            {
                xtype: 'component',
                html: '<div style="font-size: 13px; font-weight: bold; color: #15428b; margin-bottom: 4px;">Alteracao de Datas em Massa via CSV / Lista</div>' +
                      '<div style="font-size: 11px; color: #64748b; margin-bottom: 12px;">Cole a lista exportada do painel ou carregue o CSV. A extensao busca cada OP diretamente no banco do ERP, aplica as novas datas e o motivo P4, e envia tudo direto para a Confirmacao (Passo 3).</div>'
            },
            btnCarregarArquivo,
            { xtype: 'component', html: '<div style="margin-top: 8px;"></div>' },
            txtCsv,
            {
                xtype: 'container',
                layout: 'hbox',
                margin: '8 0 4 0',
                items: [dtInicio, { xtype: 'component', width: 20 }, dtFim]
            },
            {
                xtype: 'container',
                layout: 'hbox',
                margin: '4 0 4 0',
                items: [txtMotivo]
            },
            txtObs,
            progressBar,
            lblStatus
        ],
        buttons: [
            btnBuscarEAvancar,
            {
                text: 'Fechar',
                cls: 'ag-btn-extjs',
                handler: function() {
                    win.close();
                }
            }
        ]
    });

    win.show();
}


function configurarGridSelecaoManutencaoDatas(grid) {
    if (!grid || grid.isDestroyed || !isGridSelecaoManutencaoDatas(grid)) return;

    try {
        // 1. Toolbar Superior (Filtro Doc. / Cód. Auxiliar somente)
        var topTb = grid.getDockedItems ? grid.getDockedItems('toolbar[dock="top"]')[0] : (grid.down ? grid.down('toolbar[dock="top"]') : null);
        if (topTb) {
            var chk = topTb.down ? topTb.down('#chkPesquisarDocAuxSomente') : null;
            var isDocAuxAtivo = (sessionStorage.getItem('PESQUISAR_DOC_AUX_SOMENTE') || localStorage.getItem('PESQUISAR_DOC_AUX_SOMENTE')) === 'true';

            if (!chk) {
                if (!topTb.down('#sepDocAuxTop')) {
                    topTb.add({
                        xtype: 'tbseparator',
                        itemId: 'sepDocAuxTop'
                    });
                }

                chk = Ext.create('Ext.form.field.Checkbox', {
                    itemId: 'chkPesquisarDocAuxSomente',
                    boxLabel: 'Doc. / Cód. Auxiliar somente',
                    tooltip: 'Quando marcado, a busca considera apenas o Documento ou Código Auxiliar (desconsidera produto, estágio, item)',
                    checked: isDocAuxAtivo,
                    width: 210,
                    cls: 'ag-checkbox-extjs',
                    listeners: {
                        change: function(campo, novoValor) {
                            var valStr = String(!!novoValor);
                            sessionStorage.setItem('PESQUISAR_DOC_AUX_SOMENTE', valStr);
                            localStorage.setItem('PESQUISAR_DOC_AUX_SOMENTE', valStr);

                            var g = campo.up('grid') || obterGridSelecaoManutencaoDatas();
                            if (g) {
                                var sf = g.textField || (g.down ? g.down('[name=searchField]') : null);
                                if (sf && sf.getValue && sf.getValue().trim() !== '') {
                                    if (typeof sf.onTrigger2Click === 'function') {
                                        sf.onTrigger2Click();
                                    }
                                } else {
                                    var pt = g.down ? g.down('pagingtoolbar') : null;
                                    if (pt && typeof pt.doRefresh === 'function') {
                                        pt.doRefresh();
                                    } else if (g.getStore) {
                                        g.getStore().loadPage(1);
                                    }
                                }
                            }
                        }
                    }
                });

                                topTb.add(chk);

                if (!topTb.down('#sepImportarCsvTop')) {
                    topTb.add({
                        xtype: 'tbseparator',
                        itemId: 'sepImportarCsvTop'
                    });
                }

                var btnImportarCsv = topTb.down ? topTb.down('#btnImportarCsvManutencao') : null;
                if (!btnImportarCsv) {
                    btnImportarCsv = Ext.create('Ext.button.Button', {
                        itemId: 'btnImportarCsvManutencao',
                        text: 'Importar Lista / CSV',
                        tooltip: 'Importar arquivo CSV ou colar lista de OPs e Itens para alteracao de datas em massa',
                        cls: 'ag-btn-extjs ag-btn-destaque-csv',
                        handler: function() {
                            abrirModalImportacaoCsvManutencaoDatas(grid);
                        }
                    });
                    topTb.add(btnImportarCsv);
                }
                if (topTb.updateLayout) topTb.updateLayout();
            } else {
                if (chk.getValue() !== isDocAuxAtivo) {
                    chk.suspendEvents(false);
                    chk.setValue(isDocAuxAtivo);
                    chk.resumeEvents();
                }

                var btnExistente = topTb.down ? topTb.down('#btnImportarCsvManutencao') : null;
                if (!btnExistente) {
                    if (!topTb.down('#sepImportarCsvTop')) {
                        topTb.add({
                            xtype: 'tbseparator',
                            itemId: 'sepImportarCsvTop'
                        });
                    }
                    var btnNovo = Ext.create('Ext.button.Button', {
                        itemId: 'btnImportarCsvManutencao',
                        text: 'Importar Lista / CSV',
                        tooltip: 'Importar arquivo CSV ou colar lista de OPs e Itens para alteracao de datas em massa',
                        cls: 'ag-btn-extjs ag-btn-destaque-csv',
                        handler: function() {
                            abrirModalImportacaoCsvManutencaoDatas(grid);
                        }
                    });
                    topTb.add(btnNovo);
                    if (topTb.updateLayout) topTb.updateLayout();
                }
            }
        }

        // 2. Toolbar Inferior (Seletor de Quantidade de Itens por Página: 30 padrão, 50, 100, 150, 200, 500)
        var pt = grid.getDockedItems ? grid.getDockedItems('pagingtoolbar')[0] : (grid.down ? grid.down('pagingtoolbar') : null);
        if (pt) {
            var cbo = pt.down ? pt.down('#cboQtdItensPorPaginaManutencao') : null;
            var valorSalvo = parseInt(sessionStorage.getItem('MANUTENCAO_DATAS_PAGE_SIZE') || localStorage.getItem('MANUTENCAO_DATAS_PAGE_SIZE'), 10);
            var opcoesValidas = [30, 50, 100, 150, 200, 500];
            var valorInicial = opcoesValidas.indexOf(valorSalvo) !== -1 ? valorSalvo : 30;

            grid.pageSize = valorInicial;
            var st = grid.getStore ? grid.getStore() : null;
            if (st) {
                st.pageSize = valorInicial;
                if (st.proxy) {
                    st.proxy.extraParams = st.proxy.extraParams || {};
                    st.proxy.extraParams.limit = valorInicial;
                }
            }
            pt.pageSize = valorInicial;
            if (pt.store) pt.store.pageSize = valorInicial;

            if (!cbo) {
                var refreshBtn = pt.child ? pt.child('#refresh') : null;
                var insertIdx = refreshBtn ? (pt.items.indexOf(refreshBtn) + 1) : -1;

                var sep = Ext.create('Ext.toolbar.Separator', {
                    itemId: 'sepPagingManutencao'
                });

                var lbl = Ext.create('Ext.toolbar.TextItem', {
                    itemId: 'lblPagingManutencao',
                    text: 'Itens por página:',
                    style: 'margin-left: 6px; margin-right: 4px; font-size: 11px; color: #15428b; font-family: tahoma, arial, verdana, sans-serif; font-weight: normal; vertical-align: middle;'
                });

                cbo = Ext.create('Ext.form.field.ComboBox', {
                    itemId: 'cboQtdItensPorPaginaManutencao',
                    width: 65,
                    store: opcoesValidas,
                    value: valorInicial,
                    editable: false,
                    queryMode: 'local',
                    triggerAction: 'all',
                    listeners: {
                        change: function(combo, novoValor) {
                            var n = parseInt(novoValor, 10);
                            if (!n || isNaN(n)) return;
                            sessionStorage.setItem('MANUTENCAO_DATAS_PAGE_SIZE', String(n));
                            localStorage.setItem('MANUTENCAO_DATAS_PAGE_SIZE', String(n));

                            var g = combo.up('grid') || obterGridSelecaoManutencaoDatas();
                            if (g) {
                                g.pageSize = n;
                                var store = g.getStore ? g.getStore() : null;
                                if (store) {
                                    store.pageSize = n;
                                    if (store.proxy) {
                                        store.proxy.extraParams = store.proxy.extraParams || {};
                                        store.proxy.extraParams.limit = n;
                                    }
                                    store.currentPage = 1;
                                    store.loadPage(1);
                                }
                                var ptoolbar = g.down ? g.down('pagingtoolbar') : null;
                                if (ptoolbar) {
                                    ptoolbar.pageSize = n;
                                    if (ptoolbar.store) ptoolbar.store.pageSize = n;
                                }
                            }
                        }
                    }
                });

                if (insertIdx !== -1) {
                    pt.insert(insertIdx, sep);
                    pt.insert(insertIdx + 1, lbl);
                    pt.insert(insertIdx + 2, cbo);
                } else {
                    pt.add(sep);
                    pt.add(lbl);
                    pt.add(cbo);
                }
                if (pt.updateLayout) pt.updateLayout();
            } else {
                if (cbo.getValue() !== valorInicial) {
                    cbo.suspendEvents(false);
                    cbo.setValue(valorInicial);
                    cbo.resumeEvents();
                }
            }
        }
    } catch(e) {}
}

// --------------------------------------------------------------------------
// 7. Sincronização do Limite de 500 Registros e Injeção de Botões
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Motor de Ordenacao Local e Inteligente do Painel de Controle de Producao
// --------------------------------------------------------------------------

function normalizarValorParaComparacaoProducao(val, property) {
    if (val === null || val === undefined || val === '') {
        return null;
    }

    // Campos de Data (DataDeMovimentacao, DataDeAutorizacao, DataDePrevisaoInicio, DataDePrevisaoFim, etc.)
    if (property === 'DataDeMovimentacao' || property === 'DataDeAutorizacao' || 
        property === 'DataDePrevisaoInicio' || property === 'DataDePrevisaoFim' ||
        property === 'DataDeEmissao' || property === 'DataDeProducao' || property === 'DataCancelamento') {
        
        if (val instanceof Date) {
            var t = val.getTime();
            return isNaN(t) ? null : t;
        }
        if (typeof val === 'number') {
            return isNaN(val) ? null : val;
        }
        if (typeof val === 'string') {
            var str = val.trim();
            if (!str) return null;
            // Formato /Date(1234567890)/
            var matchMs = /\/Date\((-?\d+)/.exec(str);
            if (matchMs) {
                return parseInt(matchMs[1], 10);
            }
            // Formato brasileiro DD/MM/YYYY ou DD/MM/YYYY HH:mm:ss
            var matchBr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/.exec(str);
            if (matchBr) {
                var dia = parseInt(matchBr[1], 10);
                var mes = parseInt(matchBr[2], 10) - 1;
                var ano = parseInt(matchBr[3], 10);
                var hora = matchBr[4] ? parseInt(matchBr[4], 10) : 0;
                var min = matchBr[5] ? parseInt(matchBr[5], 10) : 0;
                var seg = matchBr[6] ? parseInt(matchBr[6], 10) : 0;
                var d = new Date(ano, mes, dia, hora, min, seg);
                return isNaN(d.getTime()) ? null : d.getTime();
            }
            // ISO ou parse padrao
            var parsed = Date.parse(str);
            return isNaN(parsed) ? null : parsed;
        }
        return null;
    }

    // Campos Numericos (QuantidadeASerProduzida, TotalEmPercentualApontado, etc.)
    if (property === 'QuantidadeASerProduzida' || property === 'QuantidadeProduzida' ||
        property === 'TotalEmPercentualApontado' || property === 'PercentualDeProgresso' ||
        property === 'NumeroDoDocumento' || property === 'NumeroDoDocumentoAuxiliar' ||
        property === 'Estagio') {

        if (typeof val === 'number') {
            return isNaN(val) ? null : val;
        }
        if (typeof val === 'string') {
            var s = val.trim();
            if (!s) return null;
            if (s.indexOf(',') !== -1) {
                s = s.replace(/\./g, '').replace(',', '.');
            }
            var num = parseFloat(s);
            return isNaN(num) ? null : num;
        }
        return null;
    }

    // Demais campos: String normalizada
    return String(val).trim();
}

function extrairValorDoItemProducao(item, property) {
    if (!item) return null;
    if (typeof item.get === 'function') {
        var v = item.get(property);
        if (v !== undefined) return v;
    }
    if (item.data && item.data[property] !== undefined) {
        return item.data[property];
    }
    return item[property];
}

function compararValoresGridProducao(itemA, itemB, property, direction) {
    var rawA = extrairValorDoItemProducao(itemA, property);
    var rawB = extrairValorDoItemProducao(itemB, property);

    var vA = normalizarValorParaComparacaoProducao(rawA, property);
    var vB = normalizarValorParaComparacaoProducao(rawB, property);

    var dir = (direction || 'ASC').toUpperCase();
    var mult = dir === 'DESC' ? -1 : 1;

    // Nulos sempre no final da lista, tanto em ASC quanto em DESC
    if (vA === null && vB === null) return 0;
    if (vA === null) return 1;
    if (vB === null) return -1;

    if (typeof vA === 'number' && typeof vB === 'number') {
        if (vA === vB) return 0;
        return (vA < vB ? -1 : 1) * mult;
    }

    // Strings: comparacao natural em portugues com suporte numerico (ex: ORP 50/1 < 50/2 < 50/10)
    var strA = String(vA);
    var strB = String(vB);
    var cmp = strA.localeCompare(strB, 'pt-BR', { numeric: true, sensitivity: 'base' });
    return cmp * mult;
}

function configurarOrdenacaoGridProducao(grid) {
    if (!grid || !isGridDeProducao(grid)) return;
    try {
        grid.sortableColumns = true;
        if (grid.headerCt) {
            grid.headerCt.sortable = true;
        }

        // 1. Configura todas as colunas visiveis do grid de producao
        var colecoesDeColunas = [];
        if (grid.headerCt && typeof grid.headerCt.getGridColumns === 'function') {
            try { colecoesDeColunas.push(grid.headerCt.getGridColumns()); } catch(e) {}
        }
        if (grid.headerCt && grid.headerCt.items && grid.headerCt.items.items) {
            colecoesDeColunas.push(grid.headerCt.items.items);
        }
        if (Array.isArray(grid.columns)) {
            colecoesDeColunas.push(grid.columns);
        }

        for (var c = 0; c < colecoesDeColunas.length; c++) {
            var cols = colecoesDeColunas[c];
            if (!cols || !cols.length) continue;
            for (var i = 0; i < cols.length; i++) {
                var col = cols[i];
                if (!col) continue;

                // Colunas de acao ou botoes nao sao ordenaveis
                if (col.xtype === 'actioncolumn' || isColunaDoBotaoFinalizar(col, grid)) {
                    col.sortable = false;
                    continue;
                }

                // Todas as colunas com dataIndex passam a ser sortaveis
                if (col.dataIndex && String(col.dataIndex).trim() !== '') {
                    col.sortable = true;
                    col.possibleSortStates = ['ASC', 'DESC'];
                }
            }
        }

        // 2. Configura a store para ordenacao local instantanea
        var store = grid.getStore ? grid.getStore() : null;
        if (store) {
            store.remoteSort = false;

            // Injeta comparador inteligente customizado no store
            store.createComparator = function(sorters) {
                if (!sorters || !sorters.length) return function() { return 0; };
                return function(r1, r2) {
                    for (var sIdx = 0; sIdx < sorters.length; sIdx++) {
                        var s = sorters[sIdx];
                        var prop = s.property;
                        var dir = (s.direction || 'ASC').toUpperCase();
                        var res = compararValoresGridProducao(r1, r2, prop, dir);
                        if (res !== 0) return res;
                    }
                    return 0;
                };
            };

            // Hook no store.sort para sincronizar perfeitamente com Modo Liberacao (Cache Integral)
            if (!store._agSortHooked) {
                var origSort = store.sort;
                store.sort = function(sorters, direction, where, doSort) {
                    var prop = null, dir = 'ASC';
                    if (typeof sorters === 'string') {
                        prop = sorters;
                        dir = direction || 'ASC';
                    } else if (Array.isArray(sorters) && sorters.length) {
                        prop = sorters[0].property;
                        dir = sorters[0].direction || 'ASC';
                    } else if (sorters && typeof sorters === 'object') {
                        prop = sorters.property;
                        dir = sorters.direction || 'ASC';
                    }

                    // Se estiver em Modo Liberacao e possuir cache integral carregado
                    if (prop && window.__ERP_CACHE_LIBERACAO && Array.isArray(window.__ERP_CACHE_LIBERACAO.registros) && window.__ERP_CACHE_LIBERACAO.registros.length > 0) {
                        window.__ERP_CACHE_LIBERACAO.registros.sort(function(a, b) {
                            return compararValoresGridProducao(a, b, prop, dir);
                        });

                        // Atualiza sorters no store para manter o estado sincronizado
                        if (this.sorters && this.sorters.clear && this.decodeSorters) {
                            try {
                                this.sorters.clear();
                                this.sorters.addAll(this.decodeSorters([{ property: prop, direction: dir }]));
                            } catch(e) {}
                        }

                        var primeiros500 = window.__ERP_CACHE_LIBERACAO.registros.slice(0, 500);
                        if (this.loadData) {
                            this.loadData(primeiros500);
                        }
                        this.totalCount = window.__ERP_CACHE_LIBERACAO.registros.length;

                        // Atualiza paging toolbar se presente
                        var pt = grid.down ? grid.down('pagingtoolbar') : null;
                        if (pt && typeof pt.onLoad === 'function') {
                            try { pt.onLoad(); } catch(e) {}
                        }
                        return;
                    }

                    // Modo padrao: ordenacao local em memoria via comparator ExtJS
                    this.remoteSort = false;
                    return origSort.apply(this, arguments);
                };
                store._agSortHooked = true;
            }
        }
    } catch(e) {
        console.warn('[ERP Optimizer] Erro ao configurar ordenacao do grid de producao:', e);
    }
}

function sincronizarGridPara500(grid) {
    if (!grid || !isGridDeProducao(grid)) return;
    try {
        var store = grid.getStore ? grid.getStore() : null;
        if (store) {
            store.pageSize = 500;
            store.remoteSort = false;
            if (store.proxy) {
                store.proxy.extraParams = store.proxy.extraParams || {};
                store.proxy.extraParams.limit = 500;
            }
        }
        var pt = grid.down ? grid.down('pagingtoolbar') : null;
        if (pt) {
            pt.pageSize = 500;
            if (pt.store) {
                pt.store.pageSize = 500;
                pt.store.remoteSort = false;
            }
        }
        configurarOrdenacaoGridProducao(grid);
    } catch(e) {}
}

// --------------------------------------------------------------------------
// 6. Estilos Customizados e Injeção de Botões Padrão ExtJS 4 / ERP
// --------------------------------------------------------------------------

function injetarEstilosPersonalizados() {
    if (document.getElementById('erp-ext-custom-css')) return;
    var style = document.createElement('style');
    style.id = 'erp-ext-custom-css';
    style.textContent = `
        /* Botões padrão ExtJS 4 da Extensão para Toolbars e Janelas */
        .ag-btn-extjs {
            background: #f0f4f9 linear-gradient(to bottom, #ffffff 0%, #e2ecf7 100%) !important;
            border: 1px solid #a3bde3 !important;
            border-radius: 3px !important;
            box-shadow: inset 0 1px 0 #ffffff, 0 1px 1px rgba(0,0,0,0.06) !important;
            cursor: pointer !important;
            padding: 2px 10px !important;
        }
        .ag-btn-destaque-csv {
            background: #f0fdf4 linear-gradient(to bottom, #ffffff 0%, #dcfce7 100%) !important;
            border-color: #86efac !important;
        }
        .ag-btn-destaque-csv .x-btn-inner {
            color: #166534 !important;
            font-weight: bold !important;
        }
        .ag-textarea-csv textarea {
            font-family: Consolas, monospace, sans-serif !important;
            font-size: 11px !important;
            line-height: 1.4 !important;
        }
        .ag-btn-extjs .x-btn-inner {
            color: #15428b !important;
            font-family: tahoma, arial, verdana, sans-serif !important;
            font-size: 11px !important;
            font-weight: bold !important;
            line-height: 16px !important;
        }
        .ag-btn-extjs:hover, .ag-btn-extjs.x-btn-over {
            background: linear-gradient(to bottom, #eaf2fd 0%, #d3e5fa 100%) !important;
            border-color: #7da2ce !important;
            box-shadow: inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.1) !important;
        }
        .ag-btn-extjs:hover .x-btn-inner, .ag-btn-extjs.x-btn-over .x-btn-inner {
            color: #0c2c62 !important;
        }
        .ag-btn-extjs:active, .ag-btn-extjs.x-btn-pressed {
            background: linear-gradient(to bottom, #d0e3f8 0%, #e6effa 100%) !important;
            border-color: #6d93c0 !important;
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.15) !important;
        }

        /* Botão / Badge de OPs Bloqueadas por MRP na Toolbar */
        .ag-btn-mrp {
            background: #fff5f5 linear-gradient(to bottom, #ffffff 0%, #fee2e2 100%) !important;
            border: 1px solid #f87171 !important;
            border-radius: 3px !important;
            box-shadow: inset 0 1px 0 #ffffff, 0 1px 1px rgba(220, 38, 38, 0.1) !important;
            cursor: pointer !important;
            padding: 2px 8px !important;
            margin-left: 8px !important;
            vertical-align: middle !important;
        }
        .ag-btn-mrp .x-btn-inner {
            color: #b91c1c !important;
            font-family: tahoma, arial, verdana, sans-serif !important;
            font-size: 11px !important;
            font-weight: bold !important;
            line-height: 16px !important;
        }
        .ag-btn-mrp:hover, .ag-btn-mrp.x-btn-over {
            background: linear-gradient(to bottom, #fee2e2 0%, #fecaca 100%) !important;
            border-color: #ef4444 !important;
            box-shadow: inset 0 1px 0 #ffffff, 0 1px 2px rgba(220, 38, 38, 0.2) !important;
        }
        .ag-btn-mrp:hover .x-btn-inner, .ag-btn-mrp.x-btn-over .x-btn-inner {
            color: #991b1b !important;
        }

        /* Indicadores visuais reforcados de ordenacao nas colunas do grid */
        .x-column-header-sort-ASC, .x-column-header-sort-DESC {
            background-color: #dceaf8 !important;
        }
        .x-column-header-sort-ASC .x-column-header-text {
            font-weight: bold !important;
            color: #0b497b !important;
            padding-right: 16px !important;
        }
        .x-column-header-sort-DESC .x-column-header-text {
            font-weight: bold !important;
            color: #0b497b !important;
            padding-right: 16px !important;
        }

        /* Botão inline dentro da coluna de Ação da tabela */
        .ag-btn-finalizar-inline {
            display: inline-block;
            background: #f0f4f9 linear-gradient(to bottom, #ffffff 0%, #e2ecf7 100%);
            border: 1px solid #a3bde3;
            border-radius: 3px;
            color: #15428b;
            font-family: tahoma, arial, verdana, sans-serif;
            font-size: 11px;
            font-weight: bold;
            padding: 2px 10px;
            cursor: pointer;
            box-shadow: inset 0 1px 0 #ffffff, 0 1px 1px rgba(0, 0, 0, 0.08);
            line-height: 15px;
            text-align: center;
            vertical-align: middle;
            text-decoration: none;
            user-select: none;
            box-sizing: border-box;
            transition: border-color 0.15s, background-color 0.15s;
        }
        .ag-btn-finalizar-inline:hover {
            background: linear-gradient(to bottom, #eaf2fd 0%, #d3e5fa 100%);
            border-color: #7da2ce;
            color: #0c2c62;
            box-shadow: inset 0 1px 0 #ffffff, 0 1px 2px rgba(0, 0, 0, 0.12);
        }
        .ag-btn-finalizar-inline:active {
            background: linear-gradient(to bottom, #d0e3f8 0%, #e6effa 100%);
            border-color: #6d93c0;
            box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
        }

        /* Barra de Progresso Ultra-Otimizada para Apontamento */
        .ag-prog-bar-container {
            width: 85px;
            height: 15px;
            position: relative;
            background: #e0e6ed;
            border: 1px solid #a3bde3;
            border-radius: 2px;
            overflow: hidden;
            margin: 0 auto;
            display: block;
            box-sizing: border-box;
        }
        .ag-prog-bar-fill {
            height: 100%;
            background: linear-gradient(to bottom, #a3c2e8 0%, #689bd2 100%);
            transition: width 0.15s ease-out;
        }
        .ag-prog-bar-text {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            text-align: center;
            font-size: 10px;
            line-height: 13px;
            font-family: tahoma, arial, verdana, sans-serif;
            font-weight: bold;
            color: #15428b;
            text-shadow: 0 1px 0 rgba(255, 255, 255, 0.85);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            pointer-events: none;
        }

        /* Checkbox do Modo Liberação de OP no estilo nativo do ERP */
        .ag-checkbox-extjs {
            margin-left: 12px !important;
            margin-right: 8px !important;
            vertical-align: middle !important;
        }
        .ag-checkbox-extjs td.x-form-item-body {
            vertical-align: middle !important;
        }
        .ag-checkbox-extjs .x-form-cb-label {
            font-family: tahoma, arial, verdana, sans-serif !important;
            font-size: 11px !important;
            font-weight: bold !important;
            color: #15428b !important;
            cursor: pointer !important;
            user-select: none !important;
            line-height: 16px !important;
            padding-left: 5px !important;
        }
        .ag-checkbox-extjs:hover .x-form-cb-label {
            color: #0c2c62 !important;
        }
        .ag-checkbox-extjs .x-form-checkbox {
            cursor: pointer !important;
            vertical-align: middle !important;
        }

        /* Botão de Meses Anteriores no Grid de Confirmação */
        .ag-btn-meses-ant {
            margin-left: 8px !important;
            vertical-align: middle !important;
        }
        .ag-btn-meses-ant .x-btn-inner {
            font-family: tahoma, arial, verdana, sans-serif !important;
            font-size: 11px !important;
            font-weight: bold !important;
            color: #15428b !important;
        }
        .ag-btn-meses-ant-destaque {
            border-color: #d97706 !important;
            background-color: #fef3c7 !important;
        }
        .ag-btn-meses-ant-destaque .x-btn-inner {
            color: #b45309 !important;
        }

        /* Botão de Alternar TMV (I507 / I516) ao lado do campo */
        .ag-btn-toggle-tmv {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            height: 22px !important;
            padding: 0 10px !important;
            margin-left: 8px !important;
            background: linear-gradient(180deg, #f9fafb 0%, #e5e9f0 100%) !important;
            border: 1px solid #a3b8cc !important;
            border-radius: 3px !important;
            color: #15428b !important;
            font-family: tahoma, arial, verdana, sans-serif !important;
            font-size: 11px !important;
            font-weight: bold !important;
            cursor: pointer !important;
            white-space: nowrap !important;
            user-select: none !important;
            box-shadow: 0 1px 2px rgba(0,0,0,0.06) !important;
            line-height: 20px !important;
            vertical-align: middle !important;
            flex-shrink: 0 !important;
            outline: none !important;
            transition: background 0.15s, border-color 0.15s, color 0.15s !important;
        }
        .ag-btn-toggle-tmv:hover {
            background: linear-gradient(180deg, #ffffff 0%, #d8e4f1 100%) !important;
            border-color: #15428b !important;
            color: #0b2c64 !important;
            box-shadow: 0 1px 3px rgba(21,66,139,0.18) !important;
        }
        .ag-btn-toggle-tmv:active {
            background: #d0deec !important;
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.15) !important;
        }

        /* Barra de progresso da Manutencao de Datas em Lote */
        .ag-progressbar-lote .x-progress-bar {
            background-color: #15428b !important;
            background-image: linear-gradient(to bottom, #2563eb 0%, #15428b 100%) !important;
            border-color: #1d4ed8 !important;
        }
        .ag-progressbar-lote .x-progress-text {
            font-weight: bold !important;
            font-size: 11px !important;
            color: #ffffff !important;
        }

        /* Supressão total do botão flutuante */
        #erp_btn_flutuante_finalizar {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }

        /* Animação do spinner do badge de progresso */
        @keyframes erp-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        /* Estilo perfeitamente alinhado com o design do ERP na Toolbar */
        .ag-progresso-toolbar {
            margin-left: 12px !important;
            vertical-align: middle !important;
            display: inline-block !important;
        }
        .ag-progresso-ativo {
            display: inline-flex;
            align-items: center;
            background: #eaf2fd linear-gradient(to bottom, #ffffff 0%, #e2ecf7 100%);
            border: 1px solid #a3bde3;
            border-radius: 3px;
            padding: 2px 10px;
            font-family: tahoma, arial, verdana, sans-serif;
            font-size: 11px;
            color: #15428b;
            box-shadow: inset 0 1px 0 #ffffff, 0 1px 1px rgba(0, 0, 0, 0.06);
            line-height: 16px;
            white-space: nowrap;
        }
        .ag-progresso-concluido {
            display: inline-flex;
            align-items: center;
            background: #edf7ed linear-gradient(to bottom, #ffffff 0%, #e8f5e9 100%);
            border: 1px solid #b7dfb9;
            border-radius: 3px;
            padding: 2px 10px;
            font-family: tahoma, arial, verdana, sans-serif;
            font-size: 11px;
            font-weight: bold;
            color: #2e7d32;
            box-shadow: inset 0 1px 0 #ffffff, 0 1px 1px rgba(0, 0, 0, 0.06);
            line-height: 16px;
            white-space: nowrap;
        }
        .ag-tb-spinner {
            display: inline-block;
            width: 10px;
            height: 10px;
            border: 2px solid #a3bde3;
            border-top-color: #15428b;
            border-radius: 50%;
            animation: erp-spin 0.75s linear infinite;
            margin-right: 6px;
            vertical-align: middle;
        }
    `;
    try {
        (document.head || document.documentElement).appendChild(style);
    } catch(e) {}
}

// ==========================================================================
// 8. Sistema de Captura, Armazenamento e Ocultação de OPs Bloqueadas no MRP
// ==========================================================================

function obterOpsBloqueadasMRP() {
    try {
        var str = localStorage.getItem('ERP_BLOQUEADAS_MRP');
        if (str) {
            return JSON.parse(str);
        }
    } catch (e) {
        console.warn('[ERP Optimizer] Erro ao carregar ERP_BLOQUEADAS_MRP do localStorage:', e);
    }
    return {};
}

function salvarOpBloqueadaMRP(op, motivo) {
    if (!op) return;
    try {
        var mapa = obterOpsBloqueadasMRP();
        var idDoc = op.IDDoDocumento || op.NumeroCompletoDocumento || (op.NumeroDoDocumento ? String(op.NumeroDoDocumento) : 'DOC');
        var numItem = op.NumeroDoItem != null ? op.NumeroDoItem : (op.NumeroItem != null ? op.NumeroItem : 0);
        var numSub = op.NumeroDoSubItem != null ? op.NumeroDoSubItem : (op.NumeroSubItem != null ? op.NumeroSubItem : 0);
        var codOp = op.CodigoOperacao || '';
        var opcPcp = op.OpcaoPcp || '';

        var idUnico = op.ID || (idDoc + '|' + numItem + '|' + numSub + '-' + codOp + '|' + opcPcp);
        
        mapa[idUnico] = {
            id: idUnico,
            idDoDocumento: idDoc,
            numeroCompletoDocumento: op.NumeroCompletoDocumento || idDoc,
            numeroDoDocumento: op.NumeroDoDocumento || null,
            numeroItem: numItem,
            numeroSubItem: numSub,
            codigoOperacao: codOp,
            idRefProduto: op.IDRefProduto || (op.IDDoProduto ? (op.IDDoProduto + '.' + (op.RefProduto || '')) : ''),
            descricaoProduto: op.DescricaoProduto || '',
            operacao: op.Operacao || (codOp ? (codOp + '-' + (op.DescricaoOperacao || '')) : ''),
            dataBloqueio: new Date().toISOString(),
            motivo: motivo || 'Item não analisado pela rotina de MRP'
        };

        localStorage.setItem('ERP_BLOQUEADAS_MRP', JSON.stringify(mapa));
        atualizarBadgeOpsBloqueadasMRP();
        return idUnico;
    } catch(e) {
        console.error('[ERP Optimizer] Erro ao salvar op bloqueada no localStorage:', e);
    }
}

function removerOpBloqueadaMRP(idUnico) {
    try {
        var mapa = obterOpsBloqueadasMRP();
        if (mapa && mapa[idUnico]) {
            delete mapa[idUnico];
            localStorage.setItem('ERP_BLOQUEADAS_MRP', JSON.stringify(mapa));
            atualizarBadgeOpsBloqueadasMRP();
            return true;
        }
    } catch(e) {
        console.error('[ERP Optimizer] Erro ao remover op bloqueada do localStorage:', e);
    }
    return false;
}

function limparTodasOpsBloqueadasMRP() {
    try {
        localStorage.removeItem('ERP_BLOQUEADAS_MRP');
        atualizarBadgeOpsBloqueadasMRP();
        if (typeof desmarcarCabecalhoSelecaoGrid === 'function') {
            desmarcarCabecalhoSelecaoGrid();
        }
        return true;
    } catch(e) {
        console.error('[ERP Optimizer] Erro ao limpar ERP_BLOQUEADAS_MRP:', e);
    }
    return false;
}

function isOpBloqueadaMRP(item, mapaBloqueadas) {
    if (!item || !mapaBloqueadas) return false;

    var id = item.get ? item.get('ID') : item.ID;
    var idDoc = item.get ? item.get('IDDoDocumento') : item.IDDoDocumento;
    var numDoc = item.get ? item.get('NumeroDoDocumento') : item.NumeroDoDocumento;
    var numCompl = item.get ? item.get('NumeroCompletoDocumento') : item.NumeroCompletoDocumento;
    var numItem = item.get ? item.get('NumeroDoItem') : (item.NumeroDoItem != null ? item.NumeroDoItem : item.NumeroItem);
    var numSub = item.get ? item.get('NumeroDoSubItem') : (item.NumeroDoSubItem != null ? item.NumeroDoSubItem : item.NumeroSubItem);
    var codOp = item.get ? item.get('CodigoOperacao') : item.CodigoOperacao;
    var opcPcp = item.get ? item.get('OpcaoPcp') : item.OpcaoPcp;
    var idRefProd = item.get ? item.get('IDRefProduto') : item.IDRefProduto;

    // 1. Match direto pelo ID do record se for chave
    if (id && mapaBloqueadas[id]) return true;

    // 2. Match por chave composta padrão
    var docKey = idDoc || numCompl || '';
    if (docKey) {
        var compKey = docKey + '|' + (numItem != null ? numItem : 0) + '|' + (numSub != null ? numSub : 0) + '-' + (codOp || '') + '|' + (opcPcp || '');
        if (mapaBloqueadas[compKey]) return true;
    }

    // 3. Itera o mapa para checar compatibilidade de Documento + Item
    for (var k in mapaBloqueadas) {
        if (!mapaBloqueadas.hasOwnProperty(k)) continue;
        var b = mapaBloqueadas[k];
        if (!b) continue;

        if (id && (b.id === id || k === id)) return true;

        var bDoc = b.idDoDocumento || b.numeroCompletoDocumento || (b.numeroDoDocumento ? String(b.numeroDoDocumento) : '');
        var curDoc = idDoc || numCompl || (numDoc ? String(numDoc) : '');

        if (bDoc && curDoc) {
            var mesmoDoc = (bDoc === curDoc || bDoc.indexOf(curDoc) !== -1 || curDoc.indexOf(bDoc) !== -1);
            if (mesmoDoc) {
                var bItem = b.numeroItem != null ? String(b.numeroItem) : '';
                var curItem = numItem != null ? String(numItem) : '';
                if (!bItem || !curItem || bItem === curItem) {
                    if (!b.codigoOperacao || !codOp || b.codigoOperacao === codOp) {
                        return true;
                    }
                }
            }
        }

        if (b.idRefProduto && idRefProd && b.idRefProduto === idRefProd && bDoc && curDoc && (bDoc === curDoc || bDoc.indexOf(curDoc) !== -1 || curDoc.indexOf(bDoc) !== -1)) {
            return true;
        }
    }

    return false;
}

function atualizarBadgeOpsBloqueadasMRP() {
    try {
        var mapa = obterOpsBloqueadasMRP();
        var count = Object.keys(mapa).length;
        var grid = obterGridProducaoAtivo();
        if (grid) {
            var topTb = grid.down ? grid.down('toolbar[dock="top"]') : null;
            if (topTb) {
                var btn = topTb.down ? topTb.down('#btnOpsBloqueadasMRP') : null;
                if (btn) {
                    if (count > 0) {
                        btn.setText('MRP (' + count + ')');
                        btn.show();
                    } else {
                        btn.hide();
                    }
                    if (topTb.updateLayout) topTb.updateLayout();
                }
            }
        }
    } catch(e) {}
}

function abrirJanelaOpsBloqueadasMRP() {
    var mapa = obterOpsBloqueadasMRP();
    var lista = [];
    for (var k in mapa) {
        if (mapa.hasOwnProperty(k) && mapa[k]) {
            lista.push(mapa[k]);
        }
    }

    if (lista.length === 0) {
        mostrarToastNotificacao('Nenhuma operação bloqueada por MRP no momento.');
        return;
    }

    var storeBloqueadas = Ext.create('Ext.data.Store', {
        fields: [
            'id', 'idDoDocumento', 'numeroCompletoDocumento', 'numeroDoDocumento',
            'numeroItem', 'numeroSubItem', 'codigoOperacao', 'idRefProduto',
            'descricaoProduto', 'operacao', 'dataBloqueio', 'motivo'
        ],
        data: lista
    });

    var win = Ext.create('Ext.window.Window', {
        title: 'Operações Ocultadas por Pendência no MRP (' + lista.length + ')',
        width: 780,
        height: 420,
        layout: 'fit',
        modal: true,
        draggable: true,
        resizable: true,
        bodyPadding: 5,
        items: [{
            xtype: 'grid',
            store: storeBloqueadas,
            forceFit: true,
            columns: [
                { header: 'ORP', dataIndex: 'numeroCompletoDocumento', width: 95 },
                { header: 'Item', dataIndex: 'numeroItem', width: 35, align: 'center' },
                { header: 'Cód. Prod.', dataIndex: 'idRefProduto', width: 65 },
                { header: 'Descrição do Produto', dataIndex: 'descricaoProduto', width: 140 },
                { header: 'Operação', dataIndex: 'operacao', width: 90 },
                { 
                    header: 'Data Bloqueio', 
                    dataIndex: 'dataBloqueio', 
                    width: 75,
                    renderer: function(v) {
                        if (!v) return '';
                        var d = new Date(v);
                        return Ext.Date.format(d, 'd/m/Y H:i');
                    }
                },
                {
                    xtype: 'actioncolumn',
                    header: 'Ação',
                    width: 45,
                    align: 'center',
                    items: [{
                        iconCls: 'x-grid-check-custom',
                        tooltip: 'Desbloquear e reexibir na consulta',
                        handler: function(grid, rowIndex, colIndex, actionItem, event, record) {
                            var id = record.get('id');
                            removerOpBloqueadaMRP(id);
                            storeBloqueadas.remove(record);
                            win.setTitle('Operações Ocultadas por Pendência no MRP (' + storeBloqueadas.getCount() + ')');
                            mostrarToastNotificacao('Operação desbloqueada! Recarregue a consulta para reexibi-la.');
                            if (storeBloqueadas.getCount() === 0) {
                                win.close();
                            }
                        }
                    }]
                }
            ]
        }],
        buttons: [
            {
                text: 'Limpar Todas e Reexibir no Painel',
                iconCls: 'cancelar',
                cls: 'ag-btn-extjs',
                handler: function() {
                    Ext.Msg.confirm(
                        'Confirmar Desbloqueio',
                        'Deseja remover todas as ' + lista.length + ' operações da lista de bloqueadas no MRP e recarregar a busca?',
                        function(btn) {
                            if (btn === 'yes') {
                                limparTodasOpsBloqueadasMRP();
                                win.close();
                                mostrarToastNotificacao('Todas as operações foram desbloqueadas!');
                                var g = obterGridProducaoAtivo();
                                if (g) {
                                    var pt = g.down ? g.down('pagingtoolbar') : null;
                                    if (pt) pt.doRefresh();
                                    else if (g.getStore) g.getStore().load();
                                }
                            }
                        }
                    );
                }
            },
            {
                text: 'Fechar',
                handler: function() {
                    win.close();
                }
            }
        ]
    });

    win.show();
}

// Desmarca o checkbox "Marcar Todas" do cabeçalho do grid e limpa qualquer seleção ativa
function desmarcarCabecalhoSelecaoGrid(grid) {
    try {
        var grids = [];
        if (grid) {
            grids.push(grid);
        }
        var ativo = (typeof obterGridProducaoAtivo === 'function') ? obterGridProducaoAtivo() : null;
        if (ativo && grids.indexOf(ativo) === -1) {
            grids.push(ativo);
        }
        if (window.Ext && window.Ext.ComponentQuery) {
            try {
                var todosGrids = window.Ext.ComponentQuery.query('grid') || [];
                todosGrids.forEach(function(g) {
                    if (g && !g.isDestroyed && grids.indexOf(g) === -1) {
                        grids.push(g);
                    }
                });
            } catch(e) {}
        }

        grids.forEach(function(g) {
            try {
                if (!g || g.isDestroyed) return;
                var sm = g.getSelectionModel ? g.getSelectionModel() : null;
                if (sm) {
                    if (typeof sm.deselectAll === 'function') {
                        sm.deselectAll(true);
                    }
                    if (typeof sm.clearSelections === 'function') {
                        sm.clearSelections();
                    }
                    if (sm.selected && typeof sm.selected.clear === 'function') {
                        sm.selected.clear();
                    }
                    if (typeof sm.toggleUiHeader === 'function') {
                        sm.toggleUiHeader(false);
                    }
                    if (typeof sm.updateHeaderState === 'function') {
                        sm.updateHeaderState();
                    }
                }

                // Desmarca visualmente no HeaderContainer e componentes de coluna ExtJS
                var headerCt = g.headerCt || (g.getView && g.getView().headerCt) || (g.down ? g.down('headercontainer') : null);
                if (headerCt) {
                    var cols = (typeof headerCt.getGridColumns === 'function' ? headerCt.getGridColumns() : null) || (headerCt.items && headerCt.items.items) || [];
                    cols.forEach(function(col) {
                        if (!col) return;
                        if (col.isCheckerHd || (col.cls && col.cls.indexOf('checker') !== -1) || (col.hasCls && col.hasCls('x-grid-hd-checker-on'))) {
                            if (typeof col.removeCls === 'function') {
                                col.removeCls('x-grid-hd-checker-on');
                            }
                            if (col.el && typeof col.el.removeCls === 'function') {
                                col.el.removeCls('x-grid-hd-checker-on');
                            }
                        }
                    });
                }

                // Desmarca nós DOM pertencentes ao grid
                if (g.el && g.el.dom) {
                    g.el.dom.querySelectorAll('.x-grid-hd-checker-on').forEach(function(el) {
                        el.classList.remove('x-grid-hd-checker-on');
                    });
                    g.el.dom.querySelectorAll('.x-grid-row-selected, .x-grid-row-checker-on').forEach(function(el) {
                        el.classList.remove('x-grid-row-selected');
                        el.classList.remove('x-grid-row-checker-on');
                    });
                }
            } catch(e) {}
        });

        // Limpa qualquer checkbox de cabeçalho restante no documento inteiro
        document.querySelectorAll('.x-grid-hd-checker-on').forEach(function(el) {
            el.classList.remove('x-grid-hd-checker-on');
        });

        // Ticks de garantia assíncrona contra renderizadores internos do ExtJS
        setTimeout(function() {
            try {
                document.querySelectorAll('.x-grid-hd-checker-on').forEach(function(el) {
                    el.classList.remove('x-grid-hd-checker-on');
                });
                grids.forEach(function(g) {
                    if (g && !g.isDestroyed && g.getSelectionModel) {
                        var s = g.getSelectionModel();
                        if (s && typeof s.toggleUiHeader === 'function') s.toggleUiHeader(false);
                        if (s && typeof s.updateHeaderState === 'function') s.updateHeaderState();
                    }
                });
            } catch(e) {}
        }, 50);

        setTimeout(function() {
            try {
                document.querySelectorAll('.x-grid-hd-checker-on').forEach(function(el) {
                    el.classList.remove('x-grid-hd-checker-on');
                });
            } catch(e) {}
        }, 200);

    } catch(err) {
        console.warn('[ERP Optimizer] Erro ao desmarcar botão de marcar todas:', err);
    }
}

function tratarPossivelErroMRP(response, options) {
    try {
        if (!response) return;
        var respText = response.responseText || '';
        if (!respText) return;

        var ehErroMRP = (
            respText.indexOf('rotina de MRP') !== -1 ||
            respText.indexOf('não analisado(s) pelo MRP') !== -1 ||
            respText.indexOf('não analisado pelo MRP') !== -1 ||
            respText.indexOf('não foi completamente analisado') !== -1 ||
            (respText.indexOf('MRP') !== -1 && (respText.indexOf('Liberação por PCP') !== -1 || respText.indexOf('não está configurada corretamente') !== -1))
        );

        if (!ehErroMRP) return;

        console.warn('[ERP Optimizer] Erro de MRP interceptado ao liberar!', respText);

        limparMascarasOrfas();
        if (window.Ext && window.Ext.Msg && typeof window.Ext.Msg.hide === 'function') {
            try { window.Ext.Msg.hide(); } catch(e){}
        }

        var tentativa = (window.__ERP_ULTIMA_TENTATIVA_LIBERACAO && Array.isArray(window.__ERP_ULTIMA_TENTATIVA_LIBERACAO.projecoes))
            ? window.__ERP_ULTIMA_TENTATIVA_LIBERACAO.projecoes
            : [];

        var afetadas = [];

        var matchOrp = respText.match(/Ordem de Produção\s+([^\s\r\n]+)\s+não está configurada/i);
        var orpEncontrada = matchOrp ? matchOrp[1].trim() : null;

        var matchItem = respText.match(/Item\s+([0-9]+(?:\.[0-9A-Za-z]+)?)\s*-\s*([^não\r\n]+)\s+não foi completamente analisado/i);
        var prodEncontrado = matchItem ? matchItem[1].trim() : null;

        if (tentativa.length > 0) {
            tentativa.forEach(function(p) {
                var match = false;
                if (orpEncontrada) {
                    if (p.NumeroCompletoDocumento === orpEncontrada || 
                        String(p.NumeroDoDocumento) === orpEncontrada || 
                        p.IDDoDocumento === orpEncontrada ||
                        (p.NumeroCompletoDocumento && p.NumeroCompletoDocumento.indexOf(orpEncontrada) !== -1)) {
                        match = true;
                    }
                }
                if (prodEncontrado) {
                    var ref = p.IDRefProduto || (p.IDDoProduto ? (p.IDDoProduto + '.' + (p.RefProduto || '')) : '');
                    if (ref === prodEncontrado || p.IDDoProduto === prodEncontrado) {
                        match = true;
                    }
                }
                if (!match && orpEncontrada && respText.indexOf(p.NumeroCompletoDocumento) !== -1) {
                    match = true;
                }
                if (match) {
                    afetadas.push(p);
                }
            });

            if (afetadas.length === 0 && tentativa.length === 1) {
                afetadas = tentativa;
            }
            if (afetadas.length === 0) {
                afetadas = tentativa;
            }
        }

        // Se ainda vazio, procura no store do grid pela ORP/produto
        if (afetadas.length === 0 && (orpEncontrada || prodEncontrado)) {
            var g = obterGridProducaoAtivo();
            if (g && g.getStore) {
                g.getStore().each(function(rec) {
                    var p = rec.data || rec;
                    if (orpEncontrada && (p.NumeroCompletoDocumento === orpEncontrada || String(p.NumeroDoDocumento) === orpEncontrada || p.IDDoDocumento === orpEncontrada)) {
                        afetadas.push(p);
                    } else if (prodEncontrado && (p.IDRefProduto === prodEncontrado || (p.IDDoProduto + '.' + p.RefProduto) === prodEncontrado)) {
                        afetadas.push(p);
                    }
                });
            }
        }

        var nomesDocumentos = [];
        afetadas.forEach(function(op) {
            salvarOpBloqueadaMRP(op, 'Não analisado pelo MRP');
            var docNome = op.NumeroCompletoDocumento || (op.NumeroDoDocumento ? ('ORP ' + op.NumeroDoDocumento) : 'Item');
            if (nomesDocumentos.indexOf(docNome) === -1) {
                nomesDocumentos.push(docNome);
            }
        });

        // Remove imediatamente do store do grid ativo
        var grid = obterGridProducaoAtivo();
        if (grid && grid.getStore) {
            var store = grid.getStore();
            var bloqueadas = obterOpsBloqueadasMRP();
            var recsParaRemover = [];
            store.each(function(rec) {
                var d = rec.data || rec;
                if (isOpBloqueadaMRP(d, bloqueadas)) {
                    recsParaRemover.push(rec);
                }
            });
            if (recsParaRemover.length > 0) {
                store.remove(recsParaRemover);
                if (store.totalCount) {
                    store.totalCount = Math.max(0, store.totalCount - recsParaRemover.length);
                }
                var pt = grid.down ? grid.down('pagingtoolbar') : null;
                if (pt && typeof pt.onLoad === 'function') {
                    pt.onLoad();
                }
            }
        }

        // Remove do cache de liberação
        if (window.__ERP_CACHE_LIBERACAO && Array.isArray(window.__ERP_CACHE_LIBERACAO.registros)) {
            var bloqueadas = obterOpsBloqueadasMRP();
            window.__ERP_CACHE_LIBERACAO.registros = window.__ERP_CACHE_LIBERACAO.registros.filter(function(item) {
                return !isOpBloqueadaMRP(item, bloqueadas);
            });
            if (window.__ERP_CACHE_LIBERACAO.totalReal) {
                window.__ERP_CACHE_LIBERACAO.totalReal = window.__ERP_CACHE_LIBERACAO.registros.length;
            }
        }

        // Desmarca imediatamente o botão de marcar todas do cabeçalho e qualquer seleção restante
        desmarcarCabecalhoSelecaoGrid(grid);

        atualizarBadgeOpsBloqueadasMRP();

        var txtDocs = nomesDocumentos.length > 0 ? nomesDocumentos.join(', ') : 'Operação';
        mostrarToastNotificacao('<b>' + txtDocs + '</b> retida por pendência no MRP e ocultada da lista.<br>Armazenada para permitir liberar as demais sem travamentos!');

    } catch (err) {
        console.error('[ERP Optimizer] Erro ao tratar erro de MRP:', err);
    }
}

function hookCustomMessageBox() {
    try {
        if (window.GMF && window.GMF.servico && window.GMF.servico.Util && window.GMF.servico.Util.Funcoes) {
            var fns = window.GMF.servico.Util.Funcoes;
            if (typeof fns.customMessageBox === 'function' && !fns.customMessageBox._hookMRP) {
                var origCustomMsg = fns.customMessageBox;
                fns.customMessageBox = function(titulo, msg, icone) {
                    if (typeof msg === 'string') {
                        var ehMRP = (
                            msg.indexOf('rotina de MRP') !== -1 ||
                            msg.indexOf('não analisado(s) pelo MRP') !== -1 ||
                            msg.indexOf('não analisado pelo MRP') !== -1 ||
                            msg.indexOf('não foi completamente analisado') !== -1
                        );
                        if (ehMRP) {
                            msg = msg + '<br><br><span style="color:#15428b;font-weight:bold;">ERP Optimizer:</span> Esta operação foi retida no armazenamento da extensão e ocultada da tela para você continuar liberando as demais.';
                            limparMascarasOrfas();
                        }
                    }
                    return origCustomMsg.call(this, titulo, msg, icone);
                };
                fns.customMessageBox._hookMRP = true;
            }
        }
    } catch(e) {}
}

function removerBotaoFlutuante() {
    try {
        var idBtn = 'erp_btn_flutuante_finalizar';
        var existente = document.getElementById(idBtn);
        if (existente) {
            existente.remove();
        }
        var todosFlutuantes = document.querySelectorAll('[id*="btn_flutuante"]');
        todosFlutuantes.forEach(function(el) { el.remove(); });
    } catch(e) {}
}

function htmlEncodeSeguro(str) {
    if (str === undefined || str === null) return '';
    if (window.Ext && window.Ext.String && window.Ext.String.htmlEncode) {
        return window.Ext.String.htmlEncode(String(str));
    }
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Renderer ultrarrápido para botão Finalizar: retorna string HTML pura sem instanciar Ext.Button
function renderizarBotaoFinalizarInline(val, metaData, record, rowIndex) {
    if (!record) return '';
    var est = record.get ? record.get('Estagio') : (record.data ? record.data.Estagio : record.Estagio);
    var estDesc = record.get ? record.get('EstagioProducao') : (record.data ? record.data.EstagioProducao : record.EstagioProducao);

    if (est == 107 || est == '107' || estDesc == 'ORP Finalizada' || estDesc == 'Finalizada') {
        return '<span style="color: #15428b; font-weight: bold; font-size: 11px;">Finalizada</span>';
    }

    var recId = (record.internalId !== undefined && record.internalId !== null) ? htmlEncodeSeguro(record.internalId) : '';
    var idDoc = (record.get && record.get('ID')) ? htmlEncodeSeguro(record.get('ID')) : '';
    var rowIdx = (typeof rowIndex === 'number') ? rowIndex : '';

    return '<button type="button" class="ag-btn-finalizar-inline" data-recid="' + recId + '" data-id="' + idDoc + '" data-rowidx="' + rowIdx + '" title="Finalizar esta ordem de produção">Finalizar</button>';
}

// Renderer ultrarrápido para Apontamento: retorna string HTML/CSS pura sem instanciar Ext.ProgressBar
function renderizarProgressBarInline(value, metaData, record) {
    var num = parseFloat(value) || 0;
    var pct = Math.max(0, Math.min(100, Math.round(num)));
    var status = (record && record.get) ? (record.get('StatusApontamento') || (pct + '%')) : (pct + '%');
    var texto = htmlEncodeSeguro(status);

    return '<div class="ag-prog-bar-container" title="' + texto + '">' +
           '<div class="ag-prog-bar-fill" style="width: ' + pct + '%;"></div>' +
           '<div class="ag-prog-bar-text">' + texto + '</div>' +
           '</div>';
}

// Ouvinte de clique delegado único no grid para capturar os botões inline instantâneos
function configurarCliqueDelegadoFinalizar(grid) {
    if (!grid || grid._cliqueDelegadoFinalizarConfigurado) return;

    var el = extrairDom(grid);
    if (!el) {
        if (grid.on) {
            grid.on('afterrender', function() {
                configurarCliqueDelegadoFinalizar(grid);
            }, null, { single: true });
        }
        return;
    }

    grid._cliqueDelegadoFinalizarConfigurado = true;

    el.addEventListener('click', function(e) {
        var btn = e.target && e.target.closest ? e.target.closest('.ag-btn-finalizar-inline') : null;
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        var recId = btn.getAttribute('data-recid');
        var idDoc = btn.getAttribute('data-id');
        var rowIdx = btn.getAttribute('data-rowidx');
        var store = grid.getStore ? grid.getStore() : null;
        if (!store) return;

        var record = null;
        if (recId && store.getByInternalId) {
            record = store.getByInternalId(recId);
        }
        if (!record && idDoc && store.findRecord) {
            record = store.findRecord('ID', idDoc);
        }
        if (!record && rowIdx !== null && rowIdx !== undefined && rowIdx !== '') {
            var idx = parseInt(rowIdx, 10);
            if (!isNaN(idx) && store.getAt) {
                record = store.getAt(idx);
            }
        }

        if (record) {
            executarFinalizacaoIndividual(record, grid);
        }
    }, true);
}

// Ouvinte universal de clique em botões Finalizar inline no documento inteiro
document.addEventListener('click', function(e) {
    var btn = e.target && e.target.closest ? e.target.closest('.ag-btn-finalizar-inline') : null;
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    var grid = obterGridProducaoAtivo();
    if (!grid) return;

    var recId = btn.getAttribute('data-recid');
    var idDoc = btn.getAttribute('data-id');
    var rowIdx = btn.getAttribute('data-rowidx');
    var store = grid.getStore ? grid.getStore() : null;
    if (!store) return;

    var record = null;
    if (recId && store.getByInternalId) {
        record = store.getByInternalId(recId);
    }
    if (!record && idDoc && store.findRecord) {
        record = store.findRecord('ID', idDoc);
    }
    if (!record && rowIdx !== null && rowIdx !== undefined && rowIdx !== '') {
        var idx = parseInt(rowIdx, 10);
        if (!isNaN(idx) && store.getAt) {
            record = store.getAt(idx);
        }
    }

    if (record) {
        executarFinalizacaoIndividual(record, grid);
    }
}, true);

// Identifica se a coluna é a coluna do botão Finalizar com 100% de precisão (mesmo com forceFit)
function isColunaDoBotaoFinalizar(col, grid) {
    if (!col) return false;

    // Se a coluna possuir dataIndex definido (como 'Acao', 'Usuario', etc.), NUNCA é a coluna do botão Finalizar!
    if (col.dataIndex && String(col.dataIndex).trim() !== '') {
        return false;
    }

    // Se o grid for fornecido ou inferido e NÃO for o de produção, rejeita categoricamente
    var targetGrid = grid || col.grid || (col.up && col.up('grid')) || (col.ownerCt && (col.ownerCt.grid || col.ownerCt.panel || (col.ownerCt.up && col.ownerCt.up('grid'))));
    if (!targetGrid || !isGridDeProducao(targetGrid)) {
        return false;
    }

    var txt = String(col.text || col.header || '').trim();

    // Blacklist explícita de nomes de colunas que NUNCA são o botão Finalizar
    var blacklist = [
        'dependências', 'dependencias', 'operações', 'operacoes', 'código', 'codigo',
        'descrição', 'descricao', 'item', 'posto', 'quantidade', 'status', 'tipo',
        'autorizar', 'liberar', 'estoque', 'saldo', 'unidade', 'preço', 'preco',
        'valor', 'data', 'dt. movto.', 'dt. aut.', 'dt. previsão inicial', 'dt. previsão final',
        'cliente', 'cód. est.', 'cód.'
    ];
    var txtLower = txt.toLowerCase();
    for (var b = 0; b < blacklist.length; b++) {
        if (txtLower === blacklist[b]) {
            return false;
        }
    }

    // 1. Inspeciona o código fonte do renderer original da coluna no ERP
    if (col.renderer && typeof col.renderer === 'function') {
        try {
            var fnStr = col.renderer.toString();
            if (fnStr.indexOf('FinalizarProducao') !== -1 || fnStr.indexOf('LookupDeMotivo') !== -1 || 
               (fnStr.indexOf('Finalizar') !== -1 && (fnStr.indexOf('Button') !== -1 || fnStr.indexOf('btn') !== -1))) {
                return true;
            }
        } catch(e) {}
    }

    if (col._rendererOtimizadoFinalizar) {
        return isGridDeProducao(targetGrid);
    }

    // 2. Regra estrutural do ERP: APENAS no Grid de Produção, coluna centralizada SEM dataIndex e sem texto ou com texto Ação/Finalizar
    if (col.align === 'center' && (!col.dataIndex || col.dataIndex === '') && 
        col.xtype !== 'actioncolumn' && col.xtype !== 'checkcolumn' && (txt === '' || txt === 'Ação' || txt === 'Finalizar')) {
        return true;
    }

    return false;
}

// Identifica se a coluna é a de Apontamento (barra de progresso)
function isColunaDeApontamento(col, grid) {
    if (!col) return false;

    var targetGrid = grid || col.grid || (col.up && col.up('grid')) || (col.ownerCt && (col.ownerCt.grid || col.ownerCt.panel || (col.ownerCt.up && col.ownerCt.up('grid'))));
    if (targetGrid && !isGridDeProducao(targetGrid)) {
        return false;
    }

    if (col.dataIndex === 'TotalEmPercentualApontado') return true;

    var txt = String(col.text || col.header || '').trim();
    if (txt === 'Apontamento') return true;

    if (col._rendererOtimizadoProgressBar) {
        return targetGrid ? isGridDeProducao(targetGrid) : true;
    }

    if (col.renderer && typeof col.renderer === 'function') {
        try {
            var fnStr = col.renderer.toString();
            if (fnStr.indexOf('progressbar') !== -1 || fnStr.indexOf('StatusApontamento') !== -1) {
                return true;
            }
        } catch(e) {}
    }

    return false;
}

// Otimiza colunas de um grid já instanciado ou visível sem tocar em protótipos ou callParent
function otimizarColunasGrid(grid) {
    if (!grid || !isGridDeProducao(grid)) return;

    var colecoesDeColunas = [];
    if (grid.headerCt && typeof grid.headerCt.getGridColumns === 'function') {
        try { colecoesDeColunas.push(grid.headerCt.getGridColumns()); } catch(e) {}
    }
    if (grid.headerCt && grid.headerCt.items && grid.headerCt.items.items) {
        colecoesDeColunas.push(grid.headerCt.items.items);
    }
    if (Array.isArray(grid.columns)) {
        colecoesDeColunas.push(grid.columns);
    }
    if (grid.getView && grid.getView().headerCt && typeof grid.getView().headerCt.getGridColumns === 'function') {
        try { colecoesDeColunas.push(grid.getView().headerCt.getGridColumns()); } catch(e) {}
    }

    var alterouAlguma = false;

    for (var c = 0; c < colecoesDeColunas.length; c++) {
        var cols = colecoesDeColunas[c];
        if (!cols || !cols.length) continue;

        for (var i = 0; i < cols.length; i++) {
            var col = cols[i];
            if (!col) continue;

            // 1. Apontamento (ProgressBar)
            if (isColunaDeApontamento(col, grid)) {
                if (col.renderer !== renderizarProgressBarInline) {
                    col.renderer = renderizarProgressBarInline;
                    col.origRenderer = renderizarProgressBarInline;
                    col._rendererOtimizadoProgressBar = true;
                    alterouAlguma = true;
                }
            }

            // 2. Botão Finalizar
            if (isColunaDoBotaoFinalizar(col, grid)) {
                if (col.renderer !== renderizarBotaoFinalizarInline) {
                    if (!col._origRendererSalvo) {
                        col._origRendererSalvo = true;
                        col.origRenderer = col.renderer;
                    }
                    col._headerOriginal = col._headerOriginal || col.text || col.header;
                    col.text = 'Ação';
                    col.header = 'Ação';
                    col.width = 85;
                    col.renderer = renderizarBotaoFinalizarInline;
                    col._rendererOtimizadoFinalizar = true;
                    alterouAlguma = true;
                }
            }

            // 3. Ordenacao de Colunas com dataIndex
            if (col.dataIndex && String(col.dataIndex).trim() !== '') {
                col.sortable = true;
                col.possibleSortStates = ['ASC', 'DESC'];
            }
        }
    }

    configurarCliqueDelegadoFinalizar(grid);
    configurarOrdenacaoGridProducao(grid);

    // Conecta ouvinte no beforerefresh da view para garantir colunas leves antes de qualquer renderização
    try {
        if (!grid._viewListenerOtimizado && grid.getView) {
            var v = grid.getView();
            if (v && v.on) {
                grid._viewListenerOtimizado = true;
                v.on('beforerefresh', function() {
                    otimizarColunasGrid(grid);
                });
            }
        }
    } catch(e) {}

    // Se houve alteração de renderer em grid com dados renderizados, atualiza a view instantaneamente
    if (alterouAlguma && grid.rendered && grid.getView && grid.getView().refresh) {
        try {
            var store = grid.getStore ? grid.getStore() : null;
            if (store && store.getCount && store.getCount() > 0) {
                grid.getView().refresh();
            }
        } catch(e) {}
    }
}

// Otimiza as colunas de todas as instâncias de Grid de Produção presentes na aplicação
function otimizarColunasDeTodosOsGrids() {
    if (!window.Ext) return;
    try {
        var gridsEncontrados = [];
        var idsVistos = {};

        function registrarGrid(g) {
            if (g && g.id && !idsVistos[g.id] && isGridDeProducao(g)) {
                idsVistos[g.id] = true;
                gridsEncontrados.push(g);
            }
        }

        // 1. ComponentQuery genérico e específico
        if (window.Ext.ComponentQuery) {
            var seletores = [
                'listviewdepaineldecontroledeproducao',
                '[itemId="listOrdensDeProducaoParaControle"]',
                '[itemid="listOrdensDeProducaoParaControle"]',
                'gridpanel'
            ];
            seletores.forEach(function(sel) {
                try {
                    var list = window.Ext.ComponentQuery.query(sel) || [];
                    list.forEach(function(item) {
                        var target = (item.isXType && (item.isXType('grid') || item.isXType('gridpanel'))) ? item : (item.grid || item.ownerCt || item);
                        if (target && isGridDeProducao(target)) registrarGrid(target);
                    });
                } catch(e) {}
            });
        }

        // 2. ComponentManager (varre todos os componentes instanciados no app)
        if (window.Ext.ComponentManager && window.Ext.ComponentManager.each) {
            try {
                window.Ext.ComponentManager.each(function(id, cmp) {
                    if (cmp && (cmp.isXType && (cmp.isXType('grid') || cmp.isXType('gridpanel')) || cmp.columns)) {
                        if (isGridDeProducao(cmp)) registrarGrid(cmp);
                    }
                });
            } catch(e) {}
        }

        for (var i = 0; i < gridsEncontrados.length; i++) {
            otimizarColunasGrid(gridsEncontrados[i]);
        }

        // Garante limpeza de qualquer outro grid que não seja de Produção
        limparElementosInjetadosDeOutrosGrids();
    } catch(e) {}
}

function atualizarElementosDoGrid(grid) {
    if (!grid || !grid.rendered || grid.isDestroyed || !isGridDeProducao(grid)) return;
    
    injetarEstilosPersonalizados();
    removerBotaoFlutuante();
    preencherDatasPadraoProducao();

    // 1. Sincroniza limite para 500 registros
    sincronizarGridPara500(grid);

    // 2. Injeta botão no rodapé da tabela (PagingToolbar)
    var pt = grid.down ? grid.down('pagingtoolbar') : null;
    if (pt) {
        pt.pageSize = 500;
        
        // Remove eventuais botões antigos com estilo verde ou duplicados
        if (pt.items && pt.items.each) {
            pt.items.each(function(item) {
                if (item && item.text && (item.text.indexOf('') !== -1 || (item.text.indexOf('Finalizar') !== -1 && item.itemId !== 'btnFinalizarSelecionadasPt'))) {
                    try { pt.remove(item); } catch(e){}
                }
            });
        }

        var btnExistentePt = pt.down ? pt.down('#btnFinalizarSelecionadasPt') : null;
        if (!btnExistentePt) {
            try {
                pt.add([
                    '-',
                    {
                        xtype: 'button',
                        itemId: 'btnFinalizarSelecionadasPt',
                        text: 'Finalizar Selecionadas',
                        iconCls: 'finalizar',
                        tooltip: 'Finalizar ordens de produção selecionadas em lote',
                        cls: 'ag-btn-extjs',
                        handler: function() {
                            dispararFluxoFinalizacaoLote();
                        }
                    }
                ]);
                pt.updateLayout();
            } catch(e) {}
        }
    }

    // 3. Injeta checkbox de Modo Liberação e botão na barra de ferramentas superior (tbar com Pesquisar)
    var topTb = grid.down ? grid.down('toolbar[dock="top"]') : null;
    if (topTb) {
        // Remove eventuais botões antigos com estilo verde ou duplicados
        if (topTb.items && topTb.items.each) {
            topTb.items.each(function(item) {
                if (item && item.text && (item.text.indexOf('') !== -1 || (item.text.indexOf('Finalizar') !== -1 && item.itemId !== 'btnFinalizarSelecionadasTop'))) {
                    try { topTb.remove(item); } catch(e){}
                }
            });
        }

        var chkExistente = topTb.down ? topTb.down('#chkModoLiberacaoTop') : null;
        var btnExistenteTop = topTb.down ? topTb.down('#btnFinalizarSelecionadasTop') : null;

        // A. Injeta ou sincroniza o Checkbox do Modo Liberação de OP
        if (!chkExistente) {
            try {
                var isModoAtivo = (sessionStorage.getItem('MODO_LIBERACAO_OP') || localStorage.getItem('MODO_LIBERACAO_OP')) === 'true';
                
                var chkComp = Ext.create('Ext.form.field.Checkbox', {
                    itemId: 'chkModoLiberacaoTop',
                    boxLabel: 'Modo Liberação de OP',
                    tooltip: 'Filtra todas as OPs da busca ocultando as que possuem dependências anteriores',
                    checked: isModoAtivo,
                    width: 150,
                    cls: 'ag-checkbox-extjs',
                    listeners: {
                        change: function(campo, novoValor) {
                            var valStr = String(novoValor);
                            sessionStorage.setItem('MODO_LIBERACAO_OP', valStr);
                            localStorage.setItem('MODO_LIBERACAO_OP', valStr);
                            sessionStorage.setItem('ULTIMO_CLIQUE_MANUAL', String(Date.now()));
                            window.__ERP_CACHE_LIBERACAO = null;
                            
                            try {
                                if (window.chrome && window.chrome.storage && window.chrome.storage.local) {
                                    window.chrome.storage.local.set({ modoLiberacao: !!novoValor });
                                }
                            } catch(e) {}

                            window.dispatchEvent(new CustomEvent('erp_modo_liberacao_alterado', { detail: { ativo: !!novoValor } }));
                                                        mostrarToastNotificacao(novoValor ? 'Modo Liberação ativado: buscando todas as OPs...' : 'Modo Liberação desativado');

                            var pt = grid.down ? grid.down('pagingtoolbar') : null;
                            if (pt) {
                                pt.doRefresh();
                            } else if (grid.getStore) {
                                grid.getStore().loadPage(1);
                            }
                        }
                    }
                });

                var progressoComp = Ext.create('Ext.Component', {
                    itemId: 'lblProgressoChunksTop',
                    cls: 'ag-progresso-toolbar',
                    hidden: true,
                    html: ''
                });

                var mapaBloqInicial = obterOpsBloqueadasMRP();
                var qtdBloqInicial = Object.keys(mapaBloqInicial).length;
                var btnMrpComp = Ext.create('Ext.button.Button', {
                    itemId: 'btnOpsBloqueadasMRP',
                    text: 'MRP (' + qtdBloqInicial + ')',
                    tooltip: 'Operações com pendência de MRP ocultadas (clique para listar ou restaurar)',
                    cls: 'ag-btn-mrp',
                    hidden: qtdBloqInicial === 0,
                    handler: function() {
                        abrirJanelaOpsBloqueadasMRP();
                    }
                });

                var fillItem = topTb.down ? topTb.down('tbfill') : null;
                if (fillItem) {
                    var idxFill = topTb.items.indexOf(fillItem);
                    topTb.insert(idxFill, '-');
                    topTb.insert(idxFill + 1, chkComp);
                    topTb.insert(idxFill + 2, progressoComp);
                    topTb.insert(idxFill + 3, btnMrpComp);
                } else if (btnExistenteTop) {
                    var idxBtn = topTb.items.indexOf(btnExistenteTop);
                    topTb.insert(idxBtn, '-');
                    topTb.insert(idxBtn + 1, chkComp);
                    topTb.insert(idxBtn + 2, progressoComp);
                    topTb.insert(idxBtn + 3, btnMrpComp);
                } else {
                    topTb.add(['-', chkComp, progressoComp, btnMrpComp]);
                }
                if (topTb.updateLayout) topTb.updateLayout();
                else if (topTb.doLayout) topTb.doLayout();
            } catch(e) {
                console.warn('[ERP Optimizer] Erro ao injetar checkbox de Modo Liberação:', e);
            }
        } else {
            var isModoAtivo = (sessionStorage.getItem('MODO_LIBERACAO_OP') || localStorage.getItem('MODO_LIBERACAO_OP')) === 'true';
            if (chkExistente.getValue() !== isModoAtivo) {
                chkExistente.suspendEvents(false);
                chkExistente.setValue(isModoAtivo);
                chkExistente.resumeEvents();
            }

            var progressoExistente = topTb.down ? topTb.down('#lblProgressoChunksTop') : null;
            if (!progressoExistente && chkExistente) {
                try {
                    var progressoComp = Ext.create('Ext.Component', {
                        itemId: 'lblProgressoChunksTop',
                        cls: 'ag-progresso-toolbar',
                        hidden: true,
                        html: ''
                    });
                    var idxChk = topTb.items.indexOf(chkExistente);
                    topTb.insert(idxChk + 1, progressoComp);
                    if (topTb.updateLayout) topTb.updateLayout();
                } catch(e) {}
            }

            var btnMrpExistente = topTb.down ? topTb.down('#btnOpsBloqueadasMRP') : null;
            if (!btnMrpExistente && chkExistente) {
                try {
                    var mapaBloqAtual = obterOpsBloqueadasMRP();
                    var qtdBloqAtual = Object.keys(mapaBloqAtual).length;
                    var btnMrp = Ext.create('Ext.button.Button', {
                        itemId: 'btnOpsBloqueadasMRP',
                        text: 'MRP (' + qtdBloqAtual + ')',
                        tooltip: 'Operações com pendência de MRP ocultadas (clique para listar ou restaurar)',
                        cls: 'ag-btn-mrp',
                        hidden: qtdBloqAtual === 0,
                        handler: function() {
                            abrirJanelaOpsBloqueadasMRP();
                        }
                    });
                    var progRef = topTb.down ? topTb.down('#lblProgressoChunksTop') : null;
                    var refIdx = progRef ? topTb.items.indexOf(progRef) : topTb.items.indexOf(chkExistente);
                    topTb.insert(refIdx + 1, btnMrp);
                    if (topTb.updateLayout) topTb.updateLayout();
                } catch(e) {}
            } else {
                atualizarBadgeOpsBloqueadasMRP();
            }
        }

        // B. Injeta o Botão de Finalizar Selecionadas em Lote
        if (!btnExistenteTop) {
            try {
                topTb.add([
                    '->',
                    {
                        xtype: 'button',
                        itemId: 'btnFinalizarSelecionadasTop',
                        text: 'Finalizar Selecionadas (Lote)',
                        iconCls: 'finalizar',
                        tooltip: 'Finalizar ordens de produção marcadas com confirmação prévia',
                        cls: 'ag-btn-extjs',
                        handler: function() {
                            dispararFluxoFinalizacaoLote();
                        }
                    }
                ]);
                if (topTb.updateLayout) topTb.updateLayout();
                else if (topTb.doLayout) topTb.doLayout();
            } catch(e) {}
        }
    }

    // 4. Otimiza renderização das colunas (Botão Finalizar e Apontamento leves em HTML/CSS)
    try {
        otimizarColunasGrid(grid);
    } catch(e) {}
}

// --------------------------------------------------------------------------
// 6.5. Automação da Sequência de Operações (Auto-preenchimento de Descrição e Foco)
// --------------------------------------------------------------------------

// Extrai o nome limpo do posto removendo o código numérico inicial (Ex: "25 - RECORTE" -> "RECORTE")
function extrairNomeDoPosto(texto) {
    if (!texto || typeof texto !== 'string') return '';
    var limpo = texto.trim();
    if (!limpo) return '';
    // Se for apenas número (ex: enquanto o usuário está apenas digitando "25"), não coloca na descrição
    if (/^\s*\d+\s*$/.test(limpo)) return '';
    // Formato padrão do ERP: "25 - RECORTE" ou "002 - FUNILARIA" ou "022 - CONFERENCIA E EMBALAGEM"
    var match = limpo.match(/^\s*[0-9a-zA-Z]+\s*[-–—]\s*(.+)$/);
    if (match && match[1]) {
        return match[1].trim();
    }
    return limpo;
}

// Obtém o nome/texto do Posto a partir do LookupDePostoDeTrabalho
function obterTextoDoPosto(lkPosto) {
    if (!lkPosto) return '';
    try {
        // 1. Tenta obter pelo model selecionado no lookup (DTODePostoDeTrabalho)
        if (lkPosto.model && typeof lkPosto.model.get === 'function') {
            var nomeModel = lkPosto.model.get('Nome');
            if (nomeModel && typeof nomeModel === 'string' && nomeModel.trim()) {
                return nomeModel.trim();
            }
            var idNomeModel = lkPosto.model.get('IDNome');
            if (idNomeModel && typeof idNomeModel === 'string' && idNomeModel.trim()) {
                return extrairNomeDoPosto(idNomeModel);
            }
        }
        // 2. Tenta obter pelo campoDePesquisa interno da Lookup
        var campoPesquisa = lkPosto.down ? lkPosto.down('[itemid=campoDePesquisa]') : null;
        if (campoPesquisa) {
            var val = (campoPesquisa.getValue && campoPesquisa.getValue()) || (campoPesquisa.getRawValue && campoPesquisa.getRawValue()) || '';
            if (!val && campoPesquisa.inputEl && campoPesquisa.inputEl.dom) {
                val = campoPesquisa.inputEl.dom.value || '';
            }
            if (val && typeof val === 'string' && val.trim()) {
                return extrairNomeDoPosto(val);
            }
        }
        // 3. Fallback no próprio componente lookup
        if (typeof lkPosto.getRawValue === 'function') {
            var raw = lkPosto.getRawValue();
            if (raw && typeof raw === 'string' && raw.trim()) {
                return extrairNomeDoPosto(raw);
            }
        }
        if (typeof lkPosto.getValue === 'function') {
            var v = lkPosto.getValue();
            if (v && typeof v === 'string' && v.trim()) {
                return extrairNomeDoPosto(v);
            }
        }
    } catch(e) {}
    return '';
}

// Aplica o nome na Descrição do formulário e valida o campo
function aplicarDescricaoNaOperacao(txtDescricao, nome) {
    if (!txtDescricao || !nome) return;
    try {
        if (typeof txtDescricao.setValue === 'function') {
            txtDescricao.setValue(nome);
        }
        txtDescricao.value = nome;
        if (txtDescricao.inputEl && txtDescricao.inputEl.dom) {
            txtDescricao.inputEl.dom.value = nome;
        }
        if (typeof txtDescricao.validate === 'function') {
            txtDescricao.validate();
        }
    } catch(e) {}
}

// Foca suavemente no campo de pesquisa do Posto ao abrir a janela
function focarCampoPosto(win, lkPosto) {
    if (!win || win.isDestroyed || !lkPosto || win._agPostoFocado) return;
    win._agPostoFocado = true;

    var campoPesquisa = lkPosto.down ? (
        lkPosto.down('[itemid=campoDePesquisa]') || 
        lkPosto.down('campoDePesquisa')
    ) : null;

    try {
        win.defaultFocus = campoPesquisa || lkPosto;
    } catch(e) {}

    setTimeout(function() {
        if (!win || win.isDestroyed) return;
        try {
            var campo = lkPosto.down ? (
                lkPosto.down('[itemid=campoDePesquisa]') || 
                lkPosto.down('campoDePesquisa')
            ) : null;

            if (campo) {
                if (typeof campo.focus === 'function') {
                    campo.focus(false, 10);
                }
                if (campo.inputEl && campo.inputEl.dom) {
                    campo.inputEl.dom.focus();
                }
            } else if (typeof lkPosto.focus === 'function') {
                lkPosto.focus(false, 10);
            }
        } catch(e) {}
    }, 40);
}

// Configura a sincronização automática entre Posto e Descrição em uma janela de "Nova Operação"
function configurarJanelaNovaOperacao(win) {
    if (!win || win.isDestroyed || win._agAutoDescricaoConfigurada) return;

    var lkPosto = win.down ? (
        win.down('[itemid=lkPostoTrabalho]') || 
        win.down('[itemid=lkPostoTrabalhoDoc]') || 
        win.down('LookupDePostoDeTrabalho') ||
        win.down('[name=postoTrabalho]')
    ) : null;

    var txtDescricao = win.down ? (
        win.down('[itemid=txtDescricao]') || 
        win.down('[itemid=txtDescricaoDoc]') || 
        win.down('textfieldGMF[name=Descricao]') ||
        win.down('[name=Descricao]')
    ) : null;

    if (!lkPosto || !txtDescricao) return;

    win._agAutoDescricaoConfigurada = true;

    // Foco inicial suave no campo Posto
    focarCampoPosto(win, lkPosto);

    var ultimoValorPosto = '';

    function sincronizar() {
        if (!win || win.isDestroyed) return;
        var nomePosto = obterTextoDoPosto(lkPosto);
        if (nomePosto && nomePosto !== ultimoValorPosto) {
            ultimoValorPosto = nomePosto;
            aplicarDescricaoNaOperacao(txtDescricao, nomePosto);
        }
    }

    // 1. Evento nativo do Lookup ao selecionar um registro (via modal ou autocompletado nativo do ERP)
    lkPosto.on('RegistroSelecionado', function(lk, record) {
        var nome = '';
        if (record && typeof record.get === 'function') {
            nome = record.get('Nome') || extrairNomeDoPosto(record.get('IDNome'));
        }
        if (!nome) {
            nome = obterTextoDoPosto(lkPosto);
        }
        if (nome) {
            ultimoValorPosto = nome;
            aplicarDescricaoNaOperacao(txtDescricao, nome);
        }
    });

    // 2. Evento change no Lookup
    lkPosto.on('change', sincronizar);

    // 3. Ouvintes no campo interno de texto (campoDePesquisa) usando o autocomplete nativo do ERP
    var campoPesquisa = lkPosto.down ? lkPosto.down('[itemid=campoDePesquisa]') : null;
    if (campoPesquisa) {
        campoPesquisa.on('change', sincronizar);
        campoPesquisa.on('blur', sincronizar);

        // Garante que tanto TAB quanto ENTER acionem a busca nativa da lookup do ERP
        campoPesquisa.on('specialkey', function(cmp, ev) {
            var k = ev && typeof ev.getKey === 'function' ? ev.getKey() : 0;
            var isTab = (k === 9 || (window.Ext && k === window.Ext.EventObject.TAB));
            var isEnter = (k === 13 || (window.Ext && k === window.Ext.EventObject.ENTER));

            if (isTab || isEnter) {
                var txtId = lkPosto.down ? lkPosto.down('[itemid=txtLookupId]') : null;
                var val = (cmp.getValue && cmp.getValue()) || '';
                // Se o usuário digitou algo e ainda não está com registro selecionado, aciona a busca nativa
                if (val && (!txtId || !txtId.getValue())) {
                    if (typeof cmp.onTrigger2Click === 'function') {
                        cmp.onTrigger2Click();
                    }
                }
            }
        });
    }

    // 4. Ouvinte no campo hidden com o ID da lookup
    var txtLookupId = lkPosto.down ? lkPosto.down('[itemid=txtLookupId]') : null;
    if (txtLookupId) {
        txtLookupId.on('change', sincronizar);
    }

    // 5. Polling ultra-leve (150ms) enquanto a janela estiver aberta para capturar retornos assíncronos
    var intervalId = setInterval(function() {
        if (!win || win.isDestroyed || (typeof win.isVisible === 'function' && !win.isVisible())) {
            clearInterval(intervalId);
            return;
        }
        sincronizar();
    }, 150);

    win.on('destroy', function() { 
        clearInterval(intervalId); 
    });
    win.on('close', function() { 
        clearInterval(intervalId); 
    });

    // Executa imediatamente se já houver valor
    sincronizar();
}

// Varre janelas ativas para plugar a sincronização caso alguma já esteja aberta
function configurarJanelasNovaOperacao() {
    if (!window.Ext || !window.Ext.ComponentQuery) return;
    try {
        var janelas = window.Ext.ComponentQuery.query('window') || [];
        for (var i = 0; i < janelas.length; i++) {
            var w = janelas[i];
            if (w && !w.isDestroyed && !w._agAutoDescricaoConfigurada) {
                if (w.down('[itemid=lkPostoTrabalho]') || w.down('[itemid=lkPostoTrabalhoDoc]') || w.down('LookupDePostoDeTrabalho') || w.down('[name=postoTrabalho]')) {
                    configurarJanelaNovaOperacao(w);
                }
            }
        }
    } catch(e) {}
}

// Hook nos controllers de Sequência de Operações (padrão e por documento)
function hookControllersDeSequenciaDeOperacao() {
    if (!window.GMF || !window.GMF.controller || !window.GMF.controller.dominio || !window.GMF.controller.dominio.Estoque) return;
    var est = window.GMF.controller.dominio.Estoque;

    if (est.ControllerDeSequenciaDeOperacao && est.ControllerDeSequenciaDeOperacao.prototype) {
        var proto = est.ControllerDeSequenciaDeOperacao.prototype;
        if (proto.adicionarNovaOperacao && !proto.adicionarNovaOperacao._agAutoDescricao) {
            var origAdd = proto.adicionarNovaOperacao;
            proto.adicionarNovaOperacao = function() {
                var ret = origAdd.apply(this, arguments);
                setTimeout(configurarJanelasNovaOperacao, 10);
                setTimeout(configurarJanelasNovaOperacao, 40);
                setTimeout(configurarJanelasNovaOperacao, 150);
                setTimeout(configurarJanelasNovaOperacao, 400);
                return ret;
            };
            proto.adicionarNovaOperacao._agAutoDescricao = true;
        }
    }

    if (est.ControllerDeSequenciaDeOperacaoPorDocumento && est.ControllerDeSequenciaDeOperacaoPorDocumento.prototype) {
        var protoDoc = est.ControllerDeSequenciaDeOperacaoPorDocumento.prototype;
        if (protoDoc.adicionarNovaOperacao && !protoDoc.adicionarNovaOperacao._agAutoDescricao) {
            var origAddDoc = protoDoc.adicionarNovaOperacao;
            protoDoc.adicionarNovaOperacao = function() {
                var ret = origAddDoc.apply(this, arguments);
                setTimeout(configurarJanelasNovaOperacao, 10);
                setTimeout(configurarJanelasNovaOperacao, 40);
                setTimeout(configurarJanelasNovaOperacao, 150);
                setTimeout(configurarJanelasNovaOperacao, 400);
                return ret;
            };
            protoDoc.adicionarNovaOperacao._agAutoDescricao = true;
        }
    }
}

// Hook global no Ext.window.Window.prototype.show para capturar a abertura de modais instantaneamente
function ehJanelaLiberacaoControleProducao(win) {
    if (!win || win.isDestroyed) return false;
    var tit = (win.title || '').toString();
    if (tit.indexOf('Controle de Produ') === -1) return false;

    var dtFim = win.down ? (
        win.down('[name=txtDataPrevisaoFim]') || 
        win.down('[itemid=txtDataPrevisaoFim]') ||
        win.down('[emptyText="Previsão Final"]') ||
        win.down('datefieldGMF[fieldLabel*="Término"]')
    ) : null;

    if (!dtFim && Array.isArray(win.items)) {
        dtFim = win.items.find(function(it) {
            return it && (it.name === 'txtDataPrevisaoFim' || it.itemid === 'txtDataPrevisaoFim' || it.emptyText === 'Previsão Final');
        });
    }

    var btnAutorizar = win.down ? (
        win.down('button[text=Autorizar]') ||
        (win.query && win.query('button').find(function(b) { return b.text && b.text.trim() === 'Autorizar'; }))
    ) : null;

    if (!btnAutorizar && Array.isArray(win.buttons)) {
        btnAutorizar = win.buttons.find(function(b) {
            return b && b.text && b.text.trim() === 'Autorizar';
        });
    }

    return !!(dtFim && btnAutorizar);
}

// Configura as datas (Hoje e Hoje + 7 dias) e foco no botão "Autorizar" no modal "Controle de Produção"
function configurarJanelaLiberacaoControleProducao(win) {
    if (!win || win.isDestroyed) return;
    if (!ehJanelaLiberacaoControleProducao(win)) return;

    var dtInicio = win.down ? (
        win.down('[name=txtDataPrevisaoInicio]') || 
        win.down('[itemid=txtDataPrevisaoInicio]') || 
        win.down('[itemid=txtDataPrevisao]') ||
        win.down('[emptyText="Previsão Inicial"]') ||
        win.down('datefieldGMF[fieldLabel*="Início"]')
    ) : null;

    var dtFim = win.down ? (
        win.down('[name=txtDataPrevisaoFim]') || 
        win.down('[itemid=txtDataPrevisaoFim]') || 
        win.down('[emptyText="Previsão Final"]') ||
        win.down('datefieldGMF[fieldLabel*="Término"]')
    ) : null;

    var btnAutorizar = win.down ? (
        win.down('button[text=Autorizar]') ||
        (win.query && win.query('button').find(function(b) { return b.text && b.text.trim() === 'Autorizar'; }))
    ) : null;

    if (!dtFim || !btnAutorizar) return;

    // 1. Preenche as datas automaticamente se ainda não preenchidas nesta janela
    if (!win._agDatasPreenchidas) {
        var hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        var termino = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 7);
        termino.setHours(0, 0, 0, 0);

        var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
        var strHoje = pad(hoje.getDate()) + '/' + pad(hoje.getMonth() + 1) + '/' + hoje.getFullYear();
        var strTermino = pad(termino.getDate()) + '/' + pad(termino.getMonth() + 1) + '/' + termino.getFullYear();

        if (dtInicio) {
            try {
                if (typeof dtInicio.setValue === 'function') dtInicio.setValue(hoje);
                if (typeof dtInicio.setRawValue === 'function') dtInicio.setRawValue(strHoje);
                if (dtInicio.inputEl && dtInicio.inputEl.dom) dtInicio.inputEl.dom.value = strHoje;
                if (typeof dtInicio.validate === 'function') dtInicio.validate();
            } catch(e) {}
        }

        try {
            if (typeof dtFim.setValue === 'function') dtFim.setValue(termino);
            if (typeof dtFim.setRawValue === 'function') dtFim.setRawValue(strTermino);
            if (dtFim.inputEl && dtFim.inputEl.dom) dtFim.inputEl.dom.value = strTermino;
            if (typeof dtFim.validate === 'function') dtFim.validate();
        } catch(e) {}

        win._agDatasPreenchidas = true;
    }

    // 2. Foco no botão Autorizar
    win.defaultFocus = btnAutorizar;

    function focarAutorizar() {
        if (!win || win.isDestroyed || !btnAutorizar || btnAutorizar.isDestroyed) return;
        try {
            if (typeof btnAutorizar.focus === 'function') {
                btnAutorizar.focus(false, 10);
            }
            if (btnAutorizar.btnEl && btnAutorizar.btnEl.dom) {
                btnAutorizar.btnEl.dom.focus();
            } else if (btnAutorizar.el && btnAutorizar.el.dom) {
                btnAutorizar.el.dom.focus();
            }
        } catch(e) {}
    }

    if (!win._agFocoAutorizarAplicado) {
        focarAutorizar();
        setTimeout(focarAutorizar, 20);
        setTimeout(focarAutorizar, 50);
        setTimeout(focarAutorizar, 100);
        setTimeout(focarAutorizar, 250);
        setTimeout(function() {
            focarAutorizar();
            win._agFocoAutorizarAplicado = true;
        }, 450);
    }

    // 3. Listener se o usuário apertar Enter no campo de data para navegar ao botão Autorizar
    if (!win._agEnterHooked) {
        var onDateSpecialKey = function(cmp, ev) {
            var k = ev && typeof ev.getKey === 'function' ? ev.getKey() : 0;
            if (k === 13 || (window.Ext && k === window.Ext.EventObject.ENTER)) {
                setTimeout(focarAutorizar, 10);
            }
        };
        if (dtInicio && typeof dtInicio.on === 'function') dtInicio.on('specialkey', onDateSpecialKey);
        if (dtFim && typeof dtFim.on === 'function') dtFim.on('specialkey', onDateSpecialKey);
        win._agEnterHooked = true;
    }

    // 4. Marcação de início de operação no clique de Autorizar para nunca sofrer cancelamento de reload
    if (btnAutorizar && !btnAutorizar._agHandlerProtegido && typeof btnAutorizar.handler === 'function') {
        var origBtnHandler = btnAutorizar.handler;
        btnAutorizar.handler = function() {
            window.__ERP_EM_OPERACAO_PRODUCAO = Date.now();
            window.__ERP_ULTIMO_ACAO_EXECUTAR = Date.now();
            ultimoMomentoUsuario = Date.now();
            try {
                sessionStorage.setItem('ULTIMO_CLIQUE_MANUAL', String(Date.now()));
            } catch(e) {}
            return origBtnHandler.apply(this, arguments);
        };
        btnAutorizar._agHandlerProtegido = true;
    }
}

// Varre janelas ativas para plugar liberação com datas automáticas
function configurarJanelasLiberacaoControleProducao() {
    if (!window.Ext || !window.Ext.ComponentQuery) return;
    try {
        var janelas = window.Ext.ComponentQuery.query('window') || [];
        for (var i = 0; i < janelas.length; i++) {
            var w = janelas[i];
            if (w && !w.isDestroyed && ehJanelaLiberacaoControleProducao(w)) {
                configurarJanelaLiberacaoControleProducao(w);
            }
        }
    } catch(e) {}
}

// Hook nos controllers do Painel de Controle de Produção
function hookControllerPainelControleProducao() {
    if (!window.GMF || !window.GMF.controller || !window.GMF.controller.dominio || !window.GMF.controller.dominio.Industria) return;
    var ind = window.GMF.controller.dominio.Industria;
    if (ind.ControllerDePainelDeControleDeProducao && ind.ControllerDePainelDeControleDeProducao.prototype) {
        var proto = ind.ControllerDePainelDeControleDeProducao.prototype;
        if (proto.acaoExecutarSegundaAcao && !proto.acaoExecutarSegundaAcao._agLiberacaoHooked) {
            var origSegunda = proto.acaoExecutarSegundaAcao;
            proto.acaoExecutarSegundaAcao = function() {
                window.__ERP_EM_OPERACAO_PRODUCAO = Date.now();
                window.__ERP_ULTIMO_ACAO_EXECUTAR = Date.now();
                ultimoMomentoUsuario = Date.now();
                try {
                    sessionStorage.setItem('ULTIMO_CLIQUE_MANUAL', String(Date.now()));
                } catch(e) {}
                var ret = origSegunda.apply(this, arguments);
                setTimeout(configurarJanelasLiberacaoControleProducao, 10);
                setTimeout(configurarJanelasLiberacaoControleProducao, 50);
                setTimeout(configurarJanelasLiberacaoControleProducao, 150);
                setTimeout(configurarJanelasLiberacaoControleProducao, 300);
                return ret;
            };
            proto.acaoExecutarSegundaAcao._agLiberacaoHooked = true;
        }
        if (proto.acaoExecutarTerceiraAcao && !proto.acaoExecutarTerceiraAcao._agLiberacaoHooked) {
            var origTerceira = proto.acaoExecutarTerceiraAcao;
            proto.acaoExecutarTerceiraAcao = function() {
                window.__ERP_EM_OPERACAO_PRODUCAO = Date.now();
                window.__ERP_ULTIMO_ACAO_EXECUTAR = Date.now();
                ultimoMomentoUsuario = Date.now();
                try {
                    sessionStorage.setItem('ULTIMO_CLIQUE_MANUAL', String(Date.now()));
                } catch(e) {}
                var ret = origTerceira.apply(this, arguments);
                setTimeout(configurarJanelasLiberacaoControleProducao, 10);
                setTimeout(configurarJanelasLiberacaoControleProducao, 50);
                setTimeout(configurarJanelasLiberacaoControleProducao, 150);
                setTimeout(configurarJanelasLiberacaoControleProducao, 300);
                return ret;
            };
            proto.acaoExecutarTerceiraAcao._agLiberacaoHooked = true;
        }
    }
}

// --------------------------------------------------------------------------
// 6.3 Janela "Alteração de Datas" (Manutenção de Datas)
// --------------------------------------------------------------------------

function ehJanelaAlteracaoDatasManutencao(win) {
    if (!win || win.isDestroyed) return false;
    try {
        var titulo = String(win.title || '');
        if (titulo.indexOf('Alteração de Datas') !== -1) return true;
        if (win.down && win.down('[itemid=txtNovaDataPrevisaoInicioM]') && win.down('[itemid=txtNovaDataPrevisaoFimM]')) return true;
    } catch(e) {}
    return false;
}

function configurarJanelaAlteracaoDatasManutencao(win) {
    if (!win || win.isDestroyed || !ehJanelaAlteracaoDatasManutencao(win)) return;

    try {
        var dtInicio = win.down ? (
            win.down('[itemid=txtNovaDataPrevisaoInicioM]') || 
            win.down('[name=txtNovaDataPrevisaoInicio]') ||
            win.down('datefieldGMF[fieldLabel*="Início"]')
        ) : null;

        var dtFim = win.down ? (
            win.down('[itemid=txtNovaDataPrevisaoFimM]') || 
            win.down('[name=txtNovaDataPrevisaoFim]') ||
            win.down('datefieldGMF[fieldLabel*="Término"]')
        ) : null;

        var lkMotivo = win.down ? (
            win.down('[itemid=lkMotivoM]') || 
            win.down('[name=lkMotivo]') ||
            win.down('LookupDeMotivo')
        ) : null;

        // Foco automático no campo Nova Previsão Início ao abrir
        if (dtInicio && !win._agFocoInicioAplicado) {
            win.defaultFocus = dtInicio;
            setTimeout(function() {
                try {
                    if (dtInicio && !dtInicio.isDestroyed) {
                        dtInicio.focus(true, 10);
                        win._agFocoInicioAplicado = true;
                    }
                } catch(e) {}
            }, 60);
        }

        // 1. Motivo padrão "P4" ao abrir a janela (sem forçar se o usuário alterar)
        if (!win._agMotivoPadraoP4Definido && lkMotivo) {
            var cpMotivo = lkMotivo.down ? (lkMotivo.down('[itemid=campoDePesquisa]') || lkMotivo.down('campoDePesquisa')) : null;
            var valMotivo = lkMotivo.getValue ? lkMotivo.getValue() : null;
            var rawMotivo = cpMotivo && cpMotivo.getRawValue ? cpMotivo.getRawValue() : '';

            // Só preenche se o campo estiver vazio ao entrar
            if (!valMotivo && !rawMotivo) {
                try {
                    if (typeof lkMotivo.setValue === 'function') lkMotivo.setValue('P4');
                    if (cpMotivo) {
                        if (typeof cpMotivo.setValue === 'function') cpMotivo.setValue('P4');
                        if (typeof cpMotivo.setRawValue === 'function') cpMotivo.setRawValue('P4');
                        if (cpMotivo.inputEl && cpMotivo.inputEl.dom) cpMotivo.inputEl.dom.value = 'P4';
                    }
                    var hiddenId = lkMotivo.down ? lkMotivo.down('[itemid=txtLookupId]') : null;
                    if (hiddenId) {
                        hiddenId.value = 'P4';
                        if (typeof hiddenId.setValue === 'function') hiddenId.setValue('P4');
                    }
                    win._agMotivoPadraoP4Definido = true;
                } catch(e) {}
            }
        }

        // 2. Espelhar Nova Previsão Início -> Nova Previsão Término ao dar Enter ou Tab
        if (!win._agEspelhamentoDatasHooked && dtInicio && dtFim) {
            var espelharDataInicioParaTermino = function() {
                try {
                    var val = dtInicio.getValue ? dtInicio.getValue() : null;
                    var raw = dtInicio.getRawValue ? dtInicio.getRawValue() : '';
                    if (!raw && dtInicio.inputEl && dtInicio.inputEl.dom) {
                        raw = dtInicio.inputEl.dom.value;
                    }

                    if (val || (raw && raw.trim() !== '')) {
                        if (val && typeof dtFim.setValue === 'function') {
                            dtFim.setValue(val);
                        }
                        if (raw && typeof dtFim.setRawValue === 'function') {
                            dtFim.setRawValue(raw);
                        }
                        if (dtFim.inputEl && dtFim.inputEl.dom && raw) {
                            dtFim.inputEl.dom.value = raw;
                        }
                        if (typeof dtFim.validate === 'function') {
                            dtFim.validate();
                        }
                    }
                } catch(e) {}
            };

            // ExtJS specialkey (Enter ou Tab)
            dtInicio.on('specialkey', function(cmp, ev) {
                var k = ev && typeof ev.getKey === 'function' ? ev.getKey() : 0;
                if (k === 13 || k === 9 || (window.Ext && (k === window.Ext.EventObject.ENTER || k === window.Ext.EventObject.TAB))) {
                    espelharDataInicioParaTermino();
                }
            });

            // ExtJS blur (ao sair do campo)
            dtInicio.on('blur', function() {
                espelharDataInicioParaTermino();
            });

            // ExtJS select (ao escolher no calendário)
            dtInicio.on('select', function() {
                espelharDataInicioParaTermino();
            });

            // DOM nativo keydown (Enter ou Tab)
            if (dtInicio.inputEl && dtInicio.inputEl.dom) {
                dtInicio.inputEl.dom.addEventListener('keydown', function(ev) {
                    if (ev.key === 'Enter' || ev.keyCode === 13 || ev.key === 'Tab' || ev.keyCode === 9) {
                        setTimeout(espelharDataInicioParaTermino, 15);
                    }
                });
            }

            win._agEspelhamentoDatasHooked = true;
        }
    } catch(e) {}
}

function configurarJanelasAlteracaoDatasManutencao() {
    if (!window.Ext || !window.Ext.ComponentQuery) return;
    try {
        var janelas = window.Ext.ComponentQuery.query('window') || [];
        for (var i = 0; i < janelas.length; i++) {
            var w = janelas[i];
            if (w && !w.isDestroyed && ehJanelaAlteracaoDatasManutencao(w)) {
                configurarJanelaAlteracaoDatasManutencao(w);
            }
        }
    } catch(e) {}
}

// --------------------------------------------------------------------------
// 6.4 Confirmação de Itens da Manutenção de Datas (Filtro e Exclusão de Meses Anteriores)
// --------------------------------------------------------------------------

function converterParaDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val === 'number') return new Date(val);
    if (typeof val === 'string') {
        var matchAsp = /\/Date\((-?\d+)/.exec(val);
        if (matchAsp) return new Date(parseInt(matchAsp[1], 10));

        var matchBr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(val.trim());
        if (matchBr) {
            return new Date(parseInt(matchBr[3], 10), parseInt(matchBr[2], 10) - 1, parseInt(matchBr[1], 10));
        }

        var parsed = Date.parse(val);
        if (!isNaN(parsed)) return new Date(parsed);
    }
    return null;
}

function ehItemDeDataAnterior(record) {
    if (!record) return false;
    var d = record.data || record;
    var rawAnt = d.DataPrevisaoInicioAnterior || d.DataPrevisaoFinalAnterior;
    var rawNova = d.DataPrevisaoInicioAtual || d.DataPrevisaoFinalAtual;

    var dtAnt = converterParaDate(rawAnt);
    var dtNova = converterParaDate(rawNova);

    if (!dtAnt) return false;

    // Normaliza para o início do dia (00:00:00)
    var dAnt = new Date(dtAnt.getFullYear(), dtAnt.getMonth(), dtAnt.getDate(), 0, 0, 0, 0);

    // Se houver nova data definida, verifica se foi colocada para frente
    if (dtNova) {
        var dNova = new Date(dtNova.getFullYear(), dtNova.getMonth(), dtNova.getDate(), 0, 0, 0, 0);
        if (dNova.getTime() <= dAnt.getTime()) {
            return false; // Não foi colocada para a frente
        }
    }

    // Regra: pegar apenas as datas que são até o último dia do mês anterior e foram colocadas para frente.
    // Datas que já estão no mês atual (ou futuro) e forem mudadas não devem aparecer.
    var hoje = new Date();
    var primeiroDiaMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1, 0, 0, 0, 0);

    return dAnt.getTime() < primeiroDiaMesAtual.getTime();
}
var ehItemDeMesAnterior = ehItemDeDataAnterior;

function isGridConfirmacaoManutencaoDatas(grid) {
    if (!grid || grid.isDestroyed) return false;
    try {
        var itemId = String(grid.itemId || grid.itemid || '').toLowerCase();
        if (itemId === 'listadeitensconfirmacaomanutencaodedatas') return true;

        var xtype = String(grid.xtype || '').toLowerCase();
        if (xtype.indexOf('listviewdeconfirmacaodedocumentosparamanutencaodedatas') !== -1) return true;

        var cls = String(grid.$className || '');
        if (cls.indexOf('ListViewDeConfirmacaoDeDocumentosParaManutencaoDeDatas') !== -1) return true;

        var headerCt = grid.headerCt || (grid.getView && grid.getView().headerCt);
        if (headerCt && typeof headerCt.getGridColumns === 'function') {
            var cols = headerCt.getGridColumns() || [];
            var temAnt = false, temAtual = false;
            for (var i = 0; i < cols.length; i++) {
                var dIndex = cols[i] ? cols[i].dataIndex : '';
                if (dIndex === 'DataPrevisaoInicioAnterior') temAnt = true;
                if (dIndex === 'DataPrevisaoInicioAtual') temAtual = true;
            }
            if (temAnt && temAtual) return true;
        }
    } catch(e) {}
    return false;
}

function obterGridConfirmacaoManutencaoDatas() {
    if (!window.Ext || !window.Ext.ComponentQuery) return null;
    try {
        var grids = window.Ext.ComponentQuery.query('ListViewDeConfirmacaoDeDocumentosParaManutencaoDeDatas') || [];
        for (var i = 0; i < grids.length; i++) {
            if (grids[i] && !grids[i].isDestroyed) return grids[i];
        }
        grids = window.Ext.ComponentQuery.query('[itemid=listaDeitensConfirmacaoManutencaoDeDatas]') || [];
        for (var j = 0; j < grids.length; j++) {
            if (grids[j] && !grids[j].isDestroyed) return grids[j];
        }
    } catch(e) {}
    return null;
}

function obterItensDatasAnteriores(grid) {
    if (!grid) return [];
    var store = grid.getStore ? grid.getStore() : null;
    if (!store) return [];
    var itens = [];
    store.each(function(rec) {
        if (ehItemDeDataAnterior(rec)) {
            itens.push(rec);
        }
    });
    return itens;
}
var obterItensMesesAnteriores = obterItensDatasAnteriores;

function obterControllerManutencao(grid) {
    if (grid && grid._controllerManutencao) return grid._controllerManutencao;
    if (grid) {
        var p = grid.up('EditViewDeConfirmacaoDeAlteracoesParaManutencaoDeDatas') || grid.up('formularioPadrao') || grid.up('panel');
        if (p && p.config && p.config.contexto) {
            grid._controllerManutencao = p.config.contexto;
            return p.config.contexto;
        }
    }
    if (window.GMF && window.GMF.app && window.GMF.app.controllers) {
        var c = window.GMF.app.controllers.get('dominio.MovimentacaoDeEntradaESaida.ManutencaoDeDatas.ControllerDeManutencaoDeDatas');
        if (c) return c;
    }
    return null;
}

function configurarGridConfirmacaoManutencaoDatas(grid) {
    if (!grid || grid.isDestroyed || !isGridConfirmacaoManutencaoDatas(grid)) return;

    try {
        var topTb = grid.getDockedItems ? grid.getDockedItems('toolbar[dock="top"]')[0] : (grid.down ? grid.down('toolbar[dock="top"]') : null);
        if (topTb) {
            if (topTb.hidden && typeof topTb.show === 'function') {
                topTb.show();
            }

            var btn = topTb.down ? (topTb.down('#btnItensDatasAnteriores') || topTb.down('#btnItensMesesAnteriores')) : null;
            var itens = obterItensDatasAnteriores(grid);
            var qtd = itens.length;

            if (!btn) {
                if (!topTb.down('#sepMesesAntTop')) {
                    topTb.add({ xtype: 'tbseparator', itemId: 'sepMesesAntTop' });
                }

                btn = Ext.create('Ext.button.Button', {
                    itemId: 'btnItensDatasAnteriores',
                    text: 'Datas Anteriores (' + qtd + ')',
                    tooltip: 'Visualizar e excluir itens com data até o último dia do mês anterior colocados para frente',
                    cls: 'ag-btn-meses-ant' + (qtd > 0 ? ' ag-btn-meses-ant-destaque' : ''),
                    handler: function() {
                        abrirModalItensDatasAnteriores(grid);
                    }
                });
                topTb.add(btn);
                if (topTb.updateLayout) topTb.updateLayout();
            } else {
                btn.setText('Datas Anteriores (' + qtd + ')');
                if (qtd > 0) {
                    btn.addCls('ag-btn-meses-ant-destaque');
                } else {
                    btn.removeCls('ag-btn-meses-ant-destaque');
                }
            }
        }

        var st = grid.getStore ? grid.getStore() : null;
        if (st && !st._agMonitorMesesAnt) {
            var atualizarBtn = function() {
                var b = grid.down ? (grid.down('#btnItensDatasAnteriores') || grid.down('#btnItensMesesAnteriores')) : null;
                if (b) {
                    var it = obterItensDatasAnteriores(grid);
                    b.setText('Datas Anteriores (' + it.length + ')');
                    if (it.length > 0) {
                        b.addCls('ag-btn-meses-ant-destaque');
                    } else {
                        b.removeCls('ag-btn-meses-ant-destaque');
                    }
                }
            };
            st.on('datachanged', atualizarBtn);
            st.on('load', atualizarBtn);
            st.on('remove', atualizarBtn);
            st._agMonitorMesesAnt = true;
        }
    } catch(e) {}
}

function abrirModalItensDatasAnteriores(grid) {
    if (!grid || grid.isDestroyed) return;

    var itens = obterItensDatasAnteriores(grid);
    if (!itens || itens.length === 0) {
        Ext.Msg.alert('Informação', 'Não foram encontrados itens com data até o último dia do mês anterior colocados para frente no lote atual.');
        return;
    }

    var dadosGrid = itens.map(function(rec) {
        var d = Ext.apply({}, rec.data);
        d._origRecord = rec;
        return d;
    });

    var popupStore = Ext.create('Ext.data.Store', {
        fields: [
            'ID', 'IDDoDocumento', 'NumeroDoItem', 'NumeroDoSubItem',
            'NumeroCompletoDocumento', 'NumeroItemESubitem', 'Produto',
            'PostoDeTrabalho', 'DataPrevisaoInicioAnterior', 'DataPrevisaoFinalAnterior',
            'DataPrevisaoInicioAtual', 'DataPrevisaoFinalAtual', 'Observacao', '_origRecord'
        ],
        data: dadosGrid
    });

    var selModelPopup = Ext.create('Ext.selection.CheckboxModel', {
        mode: 'MULTI',
        showHeaderCheckbox: true,
        checkOnly: false
    });

    var popupGrid = Ext.create('Ext.grid.Panel', {
        store: popupStore,
        selModel: selModelPopup,
        border: 0,
        columns: [
            { header: "Documento", dataIndex: "NumeroCompletoDocumento", width: 140 },
            { header: "Núm. Item", dataIndex: "NumeroItemESubitem", width: 70 },
            { header: "Produto", dataIndex: "Produto", flex: 1 },
            { header: "Posto de Trabalho", dataIndex: "PostoDeTrabalho", width: 130 },
            { 
                header: "Data Anterior", 
                dataIndex: "DataPrevisaoInicioAnterior", 
                width: 105, 
                renderer: Ext.util.Format.dateRenderer("d/m/Y") 
            },
            { 
                header: "Nova Data", 
                dataIndex: "DataPrevisaoInicioAtual", 
                width: 105, 
                renderer: Ext.util.Format.dateRenderer("d/m/Y") 
            }
        ],
        tbar: [
            {
                xtype: 'tbtext',
                text: 'Itens com data até o último dia do mês anterior colocados para frente: <b>' + itens.length + '</b>',
                style: 'font-size: 11px; color: #15428b; font-family: tahoma, arial, verdana, sans-serif;'
            },
            '->',
            {
                text: 'Marcar Todos',
                handler: function() {
                    selModelPopup.selectAll();
                }
            },
            {
                text: 'Desmarcar Todos',
                handler: function() {
                    selModelPopup.deselectAll();
                }
            }
        ]
    });

    var win = Ext.create('Ext.window.Window', {
        title: 'Itens com Datas de Meses Anteriores Colocados para Frente',
        width: 880,
        height: 480,
        modal: true,
        layout: 'fit',
        items: [popupGrid],
        buttons: [
            {
                text: 'Excluir Selecionados da Alteração',
                iconCls: 'iconeExcluir',
                style: 'font-weight: bold;',
                handler: function() {
                    var selecionados = selModelPopup.getSelection();
                    if (!selecionados || selecionados.length === 0) {
                        Ext.Msg.alert('Atenção', 'Selecione ao menos um item da lista para excluir da alteração.');
                        return;
                    }

                    Ext.Msg.confirm(
                        'Confirmar Exclusão',
                        'Deseja realmente excluir os <b>' + selecionados.length + '</b> item(ns) selecionado(s) da alteração de datas?<br/><br/><small>Esses itens serão removidos desta alteração e manterão suas datas originais.</small>',
                        function(resp) {
                            if (resp === 'yes') {
                                var ctrl = obterControllerManutencao(grid);
                                var storePrincipal = grid.getStore();
                                var removidos = 0;

                                selecionados.forEach(function(sel) {
                                    var idDoc = sel.get('IDDoDocumento');
                                    var numItem = sel.get('NumeroDoItem');
                                    var numSub = sel.get('NumeroDoSubItem');

                                    // 1. Remove da Store da Grid de Confirmação Principal
                                    if (storePrincipal) {
                                        var idxGrid = storePrincipal.findBy(function(rec) {
                                            return rec.get('IDDoDocumento') == idDoc &&
                                                   rec.get('NumeroDoItem') == numItem &&
                                                   rec.get('NumeroDoSubItem') == numSub;
                                        });
                                        if (idxGrid !== -1) {
                                            storePrincipal.removeAt(idxGrid);
                                        }
                                    }

                                    // 2. Remove do array interno do Controller (listaDeItensParaManutencao)
                                    if (ctrl && Array.isArray(ctrl.listaDeItensParaManutencao)) {
                                        for (var k = 0; k < ctrl.listaDeItensParaManutencao.length; k++) {
                                            var it = ctrl.listaDeItensParaManutencao[k];
                                            var d = it.data || it;
                                            if (d.IDDoDocumento == idDoc && d.NumeroDoItem == numItem && d.NumeroDoSubItem == numSub) {
                                                ctrl.listaDeItensParaManutencao.splice(k, 1);
                                                break;
                                            }
                                        }
                                    }

                                    // 3. Remove da Store da Grid do Popup
                                    popupStore.remove(sel);
                                    removidos++;
                                });

                                if (grid.getView && typeof grid.getView().refresh === 'function') {
                                    grid.getView().refresh();
                                }

                                var itRestantes = obterItensDatasAnteriores(grid);
                                var btnTop = grid.down ? (grid.down('#btnItensDatasAnteriores') || grid.down('#btnItensMesesAnteriores')) : null;
                                if (btnTop) {
                                    btnTop.setText('Datas Anteriores (' + itRestantes.length + ')');
                                    if (itRestantes.length > 0) {
                                        btnTop.addCls('ag-btn-meses-ant-destaque');
                                    } else {
                                        btnTop.removeCls('ag-btn-meses-ant-destaque');
                                    }
                                }

                                mostrarToastNotificacao('<b>' + removidos + '</b> item(ns) removido(s) da alteração com sucesso!');

                                if (popupStore.getCount() === 0) {
                                    win.close();
                                }
                            }
                        }
                    );
                }
            },
            {
                text: 'Fechar',
                handler: function() {
                    win.close();
                }
            }
        ]
    });

    win.show();
}
var abrirModalItensMesesAnteriores = abrirModalItensDatasAnteriores;


// --------------------------------------------------------------------------
// 6.4.1 Janela de Progresso Real e Processamento Otimizado (Manutencao de Datas)
// --------------------------------------------------------------------------

function combinarIdsDosLogs(acumulador, novosIds) {
    if (novosIds === null || novosIds === undefined || novosIds === '') return acumulador;
    if (acumulador === null || acumulador === undefined || acumulador === '') {
        return Array.isArray(novosIds) ? novosIds.slice() : novosIds;
    }
    if (Array.isArray(acumulador) && Array.isArray(novosIds)) {
        return acumulador.concat(novosIds);
    }
    if (Array.isArray(novosIds)) {
        var strAcum = String(acumulador);
        var strNovos = novosIds.join(',');
        return strAcum ? (strAcum + ',' + strNovos) : strNovos;
    }
    if (Array.isArray(acumulador)) {
        var partes = String(novosIds).split(',');
        return acumulador.concat(partes);
    }
    var s1 = String(acumulador).trim();
    var s2 = String(novosIds).trim();
    if (!s1) return s2;
    if (!s2) return s1;
    return s1 + ',' + s2;
}

function removerItensSalvosDaManutencao(controller, grid, itensSalvos) {
    if (!itensSalvos || !itensSalvos.length) return;
    var store = (grid && grid.getStore) ? grid.getStore() : null;

    // 1. Remove da Store da Grid de Confirmacao visual
    if (store) {
        var recordsParaRemover = [];
        itensSalvos.forEach(function(item) {
            var d = item.data || item;
            var idDoc = d.IDDoDocumento;
            var numItem = d.NumeroDoItem;
            var numSub = d.NumeroDoSubItem;
            var idx = store.findBy(function(rec) {
                var rd = rec.data || rec;
                return rd.IDDoDocumento == idDoc &&
                       rd.NumeroDoItem == numItem &&
                       rd.NumeroDoSubItem == numSub;
            });
            if (idx !== -1) {
                recordsParaRemover.push(store.getAt(idx));
            }
        });
        if (recordsParaRemover.length > 0) {
            store.remove(recordsParaRemover);
        }
    }

    // 2. Remove do array interno do Controller (listaDeItensParaManutencao)
    if (controller && Array.isArray(controller.listaDeItensParaManutencao)) {
        var mapaSalvos = {};
        itensSalvos.forEach(function(item) {
            var d = item.data || item;
            var chave = d.IDDoDocumento + '_' + d.NumeroDoItem + '_' + d.NumeroDoSubItem;
            mapaSalvos[chave] = true;
        });

        controller.listaDeItensParaManutencao = controller.listaDeItensParaManutencao.filter(function(itCtrl) {
            var cd = itCtrl.data || itCtrl;
            var chave = cd.IDDoDocumento + '_' + cd.NumeroDoItem + '_' + cd.NumeroDoSubItem;
            return !mapaSalvos[chave];
        });
    }

    if (grid && grid.getView && typeof grid.getView().refresh === 'function') {
        grid.getView().refresh();
    }

    // 3. Atualiza botao de Datas Anteriores se existir
    if (grid && typeof obterItensDatasAnteriores === 'function') {
        var itRestantes = obterItensDatasAnteriores(grid);
        var btnTop = grid.down ? (grid.down('#btnItensDatasAnteriores') || grid.down('#btnItensMesesAnteriores')) : null;
        if (btnTop) {
            btnTop.setText('Datas Anteriores (' + itRestantes.length + ')');
            if (itRestantes.length > 0) {
                btnTop.addCls('ag-btn-meses-ant-destaque');
            } else {
                btnTop.removeCls('ag-btn-meses-ant-destaque');
            }
        }
    }
}

function criarJanelaProgressoManutencaoDatas(totalItens, totalLotes) {
    var segundosDecorridos = 0;
    var timerInterval = null;

    var lblTitulo = Ext.create('Ext.Component', {
        html: '<div style="font-size: 13px; font-weight: bold; color: #15428b; margin-bottom: 4px;">Atualizando Datas de Previsao</div>' +
              '<div style="font-size: 11px; color: #64748b; margin-bottom: 12px;">' +
              (totalLotes > 1 ? 'Processando alteracoes em lotes com remocao em tempo real e protecao contra perda de dados.' : 'Gravando alteracoes com timeout expandido para garantir estabilidade.') +
              '</div>'
    });

    var barraProgresso = Ext.create('Ext.ProgressBar', {
        width: '100%',
        height: 22,
        value: 0,
        text: 'Iniciando (0 de ' + totalItens + ')...',
        cls: 'ag-progressbar-lote'
    });

    var lblStatusLote = Ext.create('Ext.Component', {
        html: '<div style="font-size: 11px; font-weight: 600; color: #1e293b; margin-top: 10px;">' +
              (totalLotes > 1 ? 'Lote 1 de ' + totalLotes + ' em processamento...' : 'Gravando ' + totalItens + ' item(ns)...') +
              '</div>'
    });

    var lblInfoDoc = Ext.create('Ext.Component', {
        html: '<div style="font-size: 10px; color: #64748b; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Aguardando resposta do servidor...</div>'
    });

    var lblTimer = Ext.create('Ext.Component', {
        html: '<div style="font-size: 10px; color: #94a3b8; text-align: right; margin-top: 6px;">Tempo decorrido: 00:00</div>'
    });

    var btnCancelar = Ext.create('Ext.button.Button', {
        text: 'Cancelar',
        cls: 'ag-btn-extjs',
        handler: function() {
            if (win.onCancelar) win.onCancelar();
        }
    });

    var btnTentarNovamente = Ext.create('Ext.button.Button', {
        text: 'Tentar Novamente Lote',
        cls: 'ag-btn-extjs',
        style: 'margin-right: 6px;',
        hidden: true,
        handler: function() {
            if (win.onTentarNovamente) win.onTentarNovamente();
        }
    });

    var btnPularLote = Ext.create('Ext.button.Button', {
        text: 'Pular Este Lote',
        cls: 'ag-btn-extjs',
        style: 'margin-right: 6px;',
        hidden: true,
        handler: function() {
            if (win.onPularLote) win.onPularLote();
        }
    });

    var btnPausarManter = Ext.create('Ext.button.Button', {
        text: 'Manter Restantes na Tela',
        cls: 'ag-btn-extjs',
        hidden: true,
        handler: function() {
            if (win.onPausarManter) win.onPausarManter();
        }
    });

    var win = Ext.create('Ext.window.Window', {
        title: 'Manutencao de Datas - ' + (totalLotes > 1 ? 'Processamento em Lote' : 'Gravando'),
        width: 520,
        bodyPadding: '14 18',
        modal: true,
        closable: false,
        resizable: false,
        layout: 'anchor',
        items: [lblTitulo, barraProgresso, lblStatusLote, lblInfoDoc, lblTimer],
        buttons: [btnTentarNovamente, btnPularLote, btnPausarManter, btnCancelar]
    });

    function iniciarTimer() {
        if (!timerInterval) {
            timerInterval = setInterval(function() {
                segundosDecorridos++;
                var min = String(Math.floor(segundosDecorridos / 60));
                if (min.length < 2) min = '0' + min;
                var seg = String(segundosDecorridos % 60);
                if (seg.length < 2) seg = '0' + seg;
                lblTimer.update('<div style="font-size: 10px; color: #94a3b8; text-align: right; margin-top: 6px;">Tempo decorrido: ' + min + ':' + seg + '</div>');
            }, 1000);
        }
    }

    function pararTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    win.on('show', function() {
        segundosDecorridos = 0;
        iniciarTimer();
    });

    win.atualizar = function(loteNum, totLotes, concluidos, totItens, infoItem) {
        var pct = totItens > 0 ? (concluidos / totItens) : 0;
        if (pct > 1) pct = 1;
        var pctNum = Math.round(pct * 100);
        barraProgresso.updateProgress(pct, pctNum + '% (' + concluidos + ' de ' + totItens + ' itens)');
        if (totLotes > 1) {
            lblStatusLote.update('<div style="font-size: 11px; font-weight: 600; color: #1e293b; margin-top: 10px;">Lote ' + loteNum + ' de ' + totLotes + ' (' + concluidos + ' de ' + totItens + ' concluidos)</div>');
        } else {
            lblStatusLote.update('<div style="font-size: 11px; font-weight: 600; color: #1e293b; margin-top: 10px;">Gravando dados no servidor...</div>');
        }
        if (infoItem) {
            lblInfoDoc.update('<div style="font-size: 10px; color: #64748b; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Documento: <b>' + htmlEncodeSeguro(infoItem) + '</b></div>');
        }
    };

    win.modoRecuperacao = function(loteNum, totLotes, concluidos, totItens, detalheErro) {
        pararTimer();
        btnCancelar.setVisible(false);
        btnTentarNovamente.setVisible(true);
        btnPularLote.setVisible(true);
        btnPausarManter.setVisible(true);

        lblStatusLote.update(
            '<div style="font-size: 12px; font-weight: bold; color: #dc2626; margin-top: 10px;">Falha ao gravar Lote ' + loteNum + ' de ' + totLotes + '</div>' +
            '<div style="font-size: 11px; color: #475569; margin-top: 4px;">' + htmlEncodeSeguro(detalheErro || 'O servidor nao respondeu apos tentativas automaticas.') + '</div>' +
            '<div style="font-size: 11px; color: #15803d; margin-top: 4px; font-weight: 600;">' + concluidos + ' de ' + totItens + ' itens ja foram salvos e removidos da tela com sucesso.</div>'
        );
        lblInfoDoc.update('<div style="font-size: 11px; color: #64748b; margin-top: 4px;">Escolha uma acao abaixo para prosseguir com seguranca:</div>');
    };

    win.retomarProcessamento = function() {
        btnCancelar.setVisible(true);
        btnTentarNovamente.setVisible(false);
        btnPularLote.setVisible(false);
        btnPausarManter.setVisible(false);
        iniciarTimer();
    };

    win.concluir = function(callback) {
        pararTimer();
        barraProgresso.updateProgress(1, '100% - Concluido!');
        lblStatusLote.update('<div style="font-size: 11px; font-weight: 600; color: #15803d; margin-top: 10px;">Todas as alteracoes foram gravadas com sucesso!</div>');
        setTimeout(function() {
            if (typeof callback === 'function') callback();
        }, 150);
    };

    win.fechar = function() {
        pararTimer();
        try {
            win.close();
            win.destroy();
        } catch(e) {}
    };

    return win;
}

function executarSalvarManutencaoEmLotes(controller, b) {
    if (!b || !b.formulario || !b.formulario.getForm().isValid()) {
        if (window.GMF && window.GMF.servico && window.GMF.servico.Util && window.GMF.servico.Util.Funcoes) {
            window.GMF.servico.Util.Funcoes.customMessageBox("Status", "Por favor, preencha todos os campos corretamente.", Ext.MessageBox.WARNING);
        } else {
            Ext.Msg.alert("Status", "Por favor, preencha todos os campos corretamente.");
        }
        return;
    }

    var itensOriginais = controller.listaDeItensParaManutencao;
    if (!itensOriginais || !Array.isArray(itensOriginais) || itensOriginais.length === 0) {
        if (window.GMF && window.GMF.servico && window.GMF.servico.Util && window.GMF.servico.Util.Funcoes) {
            window.GMF.servico.Util.Funcoes.customMessageBox("Status", "Nenhum item selecionado para alteracao de datas.", Ext.MessageBox.WARNING);
        } else {
            Ext.Msg.alert("Status", "Nenhum item selecionado para alteracao de datas.");
        }
        return;
    }

    // Grid do Passo 3 (Confirmacao de Itens Selecionados)
    var gridConfirmacao = (b.formulario && b.formulario.down ? (b.formulario.down('grid') || b.formulario.down('ListViewDeConfirmacaoDeDocumentosParaManutencaoDeDatas') || b.formulario.down('[itemid=listaDeitensConfirmacaoManutencaoDeDatas]')) : null) || obterGridConfirmacaoManutencaoDatas();

    // 1. Mapear todos os itens para o formato ProjecaoDeManutencaoDeDatasDeProducao (SEM poluir f.data com campos extras)
    var listaCompleta = [];
    var infoItens = [];
    var registrosOriginais = [];

    Ext.each(itensOriginais, function(g) {
        var f = Ext.create("GMF.model.Projecao.MovimentacaoDeEntradaESaida.ManutencaoDeDatas.ProjecaoDeManutencaoDeDatasDeProducao");
        f.data.ID = g.data.ID;
        f.data.IDDoDocumento = g.data.IDDoDocumento;
        f.data.NumeroDoItem = g.data.NumeroDoItem;
        f.data.NumeroDoSubItem = g.data.NumeroDoSubItem;
        f.data.DataPrevisaoInicioAnterior = g.data.DataPrevisaoInicioAnterior;
        f.data.DataPrevisaoInicioAtual = g.data.DataPrevisaoInicioAtual;
        f.data.DataPrevisaoFinalAnterior = g.data.DataPrevisaoFinalAnterior;
        f.data.DataPrevisaoFinalAtual = g.data.DataPrevisaoFinalAtual;
        f.data.CodigoDoMotivo = g.data.CodigoDoMotivo;
        f.data.Observacao = g.data.Observacao;
        f.data.EhEntrada = g.data.EhEntrada;
        listaCompleta.push(f.data);
        registrosOriginais.push(g);

        // Metadados amigaveis para a interface mantidos fora do objeto f.data enviado ao servidor
        var doc = g.data.NumeroCompletoDocumento || (g.data.NumeroDoDocumento ? ('Doc ' + g.data.NumeroDoDocumento) : 'OP');
        var item = g.data.NumeroItemESubitem != null ? g.data.NumeroItemESubitem : (g.data.NumeroDoItem + (g.data.NumeroDoSubItem ? '.' + g.data.NumeroDoSubItem : ''));
        infoItens.push(doc + (item ? ' (Item ' + item + ')' : ''));
    });

    var totalItens = listaCompleta.length;
    var tmv = b.model && b.model.data ? b.model.data.IdDoTipoDeMovimento : null;
    var perfil = b.model && b.model.data ? b.model.data.PerfilTMV : null;

    // Se houver poucos itens (<= 25), executa em ENVIO DIRETO UNICO (super rapido, < 1s, sem overhead de loop)
    var LIMITE_LOTE_UNICO = 25;
    if (totalItens <= LIMITE_LOTE_UNICO) {
        var modalProgressoDireto = criarJanelaProgressoManutencaoDatas(totalItens, 1);
        modalProgressoDireto.show();
        modalProgressoDireto.atualizar(1, 1, 0, totalItens, infoItens[0] || '');

        var payloadDireto = {
            lista: listaCompleta,
            tmv: tmv,
            perfil: perfil
        };

        var tentativasDireto = 0;
        function enviarLoteDireto() {
            Ext.Ajax.request({
                timeout: 120000,
                url: "ManutencaoDeDatas/Salvar",
                method: "POST",
                params: Ext.encode(payloadDireto),
                headers: { "Content-Type": "application/json" },
                scope: controller,
                success: function(resp) {
                    var dadosResp;
                    try {
                        dadosResp = Ext.decode(resp.responseText);
                    } catch(e) {
                        dadosResp = {};
                    }

                    removerItensSalvosDaManutencao(controller, gridConfirmacao, registrosOriginais);

                    modalProgressoDireto.concluir(function() {
                        modalProgressoDireto.fechar();
                        if (Ext.Msg && Ext.Msg.isVisible && Ext.Msg.isVisible()) {
                            Ext.Msg.hide();
                        }

                        // Atribui exatamente o idDosLogs retornado (como no ERP nativo)
                        var logsId = dadosResp ? dadosResp.idDosLogs : null;
                        if (!logsId || (Array.isArray(logsId) && logsId.length === 0)) {
                            logsId = '0'; // Protege para que ListarAlteracoes nao faca full scan no banco
                        }
                        controller.idsLogAlteracoes = logsId;

                        if (window.GMF && window.GMF.servico && window.GMF.servico.Util && window.GMF.servico.Util.Funcoes) {
                            GMF.servico.Util.Funcoes.customMessageBox("Status", "Alteracoes de data realizadas com sucesso.", Ext.MessageBox.INFO);
                        } else {
                            mostrarToastNotificacao("Alteracoes de data realizadas com sucesso.");
                        }

                        controller.ativarPasso(b, controller.assistente.setarPasso(4));

                        if (b.formulario && b.formulario.up('tabContainer')) {
                            b.formulario.up('tabContainer').destroy();
                        }
                    });
                },
                failure: function(resp) {
                    if (tentativasDireto < 1) {
                        tentativasDireto++;
                        setTimeout(enviarLoteDireto, 2000);
                        return;
                    }
                    modalProgressoDireto.fechar();
                    if (Ext.Msg && Ext.Msg.isVisible && Ext.Msg.isVisible()) {
                        Ext.Msg.hide();
                    }
                    var msgErro = "Ocorreu um erro ao salvar as alteracoes no servidor.";
                    if (resp && resp.timedout) {
                        msgErro = "O tempo de resposta do servidor expirou ao gravar as alteracoes.";
                    }
                    if (window.GMF && window.GMF.servico && window.GMF.servico.Util && window.GMF.servico.Util.Funcoes) {
                        window.GMF.servico.Util.Funcoes.customMessageBox("Erro na Gravacao", msgErro, Ext.MessageBox.ERROR);
                    } else {
                        Ext.Msg.alert("Erro", msgErro);
                    }
                }
            });
        }
        enviarLoteDireto();
        return;
    }

    // Para grandes volumes (> 25 itens), executa em LOTES SEGUROS de 20 itens com remocao em tempo real e auto-retry
    var TAMANHO_LOTE = 20;

    // Montar os lotes estruturados com seus itens e registros correspondentes
    var lotes = [];
    for (var i = 0; i < totalItens; i += TAMANHO_LOTE) {
        var fim = Math.min(i + TAMANHO_LOTE, totalItens);
        lotes.push({
            indice: lotes.length,
            inicio: i,
            fim: fim,
            itensData: listaCompleta.slice(i, fim),
            registros: registrosOriginais.slice(i, fim),
            infoDoc: infoItens[i] || ''
        });
    }

    var totalLotes = lotes.length;
    var modalProgresso = criarJanelaProgressoManutencaoDatas(totalItens, totalLotes);
    modalProgresso.show();

    var canceladoPeloUsuario = false;
    modalProgresso.onCancelar = function() {
        canceladoPeloUsuario = true;
    };

    var todosIdsLogs = null;
    var itensSalvosComSucesso = 0;
    var lotesPulados = [];
    var indiceLoteAtual = 0;
    var tentativasLoteAtual = 0;
    var MAX_AUTO_RETRIES = 2;
    var DELAY_ENTRE_LOTES_MS = 350;

    function finalizarProcessamento() {
        modalProgresso.concluir(function() {
            modalProgresso.fechar();
            if (Ext.Msg && Ext.Msg.isVisible && Ext.Msg.isVisible()) {
                Ext.Msg.hide();
            }

            var itensPendentes = totalItens - itensSalvosComSucesso;

            // Se 100% dos itens foram salvos sem pendencias:
            if (itensPendentes === 0 && lotesPulados.length === 0) {
                controller.idsLogAlteracoes = todosIdsLogs || '0';

                if (window.GMF && window.GMF.servico && window.GMF.servico.Util && window.GMF.servico.Util.Funcoes) {
                    var msgSucesso = "Todas as <b>" + totalItens + "</b> alteracoes de datas foram realizadas com sucesso em " + totalLotes + " lotes!";
                    window.GMF.servico.Util.Funcoes.customMessageBox("Sucesso", msgSucesso, Ext.MessageBox.INFO);
                } else {
                    mostrarToastNotificacao("Alteracoes de data concluidas com sucesso!");
                }

                controller.ativarPasso(b, controller.assistente.setarPasso(4));

                if (b.formulario && b.formulario.up('tabContainer')) {
                    b.formulario.up('tabContainer').destroy();
                }
            } else {
                // Houve lotes pulados ou pendentes: NUNCA fecha a aba para nao perder os itens pendentes
                var msgAviso = "Processamento concluido com pendencias: <b>" + itensSalvosComSucesso + "</b> de <b>" + totalItens + "</b> itens foram salvos com sucesso e removidos da tela.<br><br><b>" + itensPendentes + "</b> itens permanecem na tela para que voce possa tentar novamente sem perder suas alteracoes.";
                if (window.GMF && window.GMF.servico && window.GMF.servico.Util && window.GMF.servico.Util.Funcoes) {
                    window.GMF.servico.Util.Funcoes.customMessageBox("Atencao", msgAviso, Ext.MessageBox.WARNING);
                } else {
                    Ext.Msg.alert("Atencao", msgAviso);
                }
            }
        });
    }

    function executarLote() {
        if (canceladoPeloUsuario) {
            modalProgresso.fechar();
            var msgCanc = 'Processamento interrompido. ' + itensSalvosComSucesso + ' itens foram salvos com sucesso e removidos da tela. Os itens restantes continuam disponiveis na tela.';
            mostrarToastNotificacao(msgCanc);
            return;
        }

        if (indiceLoteAtual >= totalLotes) {
            finalizarProcessamento();
            return;
        }

        var lote = lotes[indiceLoteAtual];
        modalProgresso.atualizar(indiceLoteAtual + 1, totalLotes, itensSalvosComSucesso, totalItens, lote.infoDoc);

        var payload = {
            lista: lote.itensData,
            tmv: tmv,
            perfil: perfil
        };

        Ext.Ajax.request({
            timeout: 120000,
            url: "ManutencaoDeDatas/Salvar",
            method: "POST",
            params: Ext.encode(payload),
            headers: { "Content-Type": "application/json" },
            scope: controller,
            success: function(resp) {
                var dadosResp;
                try {
                    dadosResp = Ext.decode(resp.responseText);
                } catch(err) {
                    dadosResp = {};
                }

                if (dadosResp && dadosResp.idDosLogs) {
                    todosIdsLogs = combinarIdsDosLogs(todosIdsLogs, dadosResp.idDosLogs);
                }

                // SUCESSO DO LOTE:
                // Remove os itens deste lote do controller e da grid visual em tempo real!
                removerItensSalvosDaManutencao(controller, gridConfirmacao, lote.registros);

                itensSalvosComSucesso += lote.itensData.length;
                indiceLoteAtual++;
                tentativasLoteAtual = 0;

                modalProgresso.atualizar(indiceLoteAtual, totalLotes, itensSalvosComSucesso, totalItens, lote.infoDoc);

                if (indiceLoteAtual < totalLotes) {
                    setTimeout(executarLote, DELAY_ENTRE_LOTES_MS);
                } else {
                    finalizarProcessamento();
                }
            },
            failure: function(resp) {
                // Se ainda restam tentativas automaticas, tenta novamente com backoff de 2.5s
                if (tentativasLoteAtual < MAX_AUTO_RETRIES) {
                    tentativasLoteAtual++;
                    var segEspera = 2.5;
                    var msgTentativa = "Instabilidade no servidor ao salvar lote " + (indiceLoteAtual + 1) + ". Tentando novamente em " + segEspera + "s (tentativa " + tentativasLoteAtual + " de " + MAX_AUTO_RETRIES + ")...";
                    modalProgresso.atualizar(indiceLoteAtual + 1, totalLotes, itensSalvosComSucesso, totalItens, msgTentativa);
                    setTimeout(executarLote, segEspera * 1000);
                    return;
                }

                // Esgotou tentativas automaticas: entra em modo de recuperacao com opcoes sem perda de dados
                var loteFalho = lotes[indiceLoteAtual];
                var detalheErro = (resp && resp.timedout) ? "Tempo de conexao com o servidor expirou." : "O servidor retornou codigo de erro ou rejeitou a gravacao.";

                modalProgresso.modoRecuperacao(
                    indiceLoteAtual + 1,
                    totalLotes,
                    itensSalvosComSucesso,
                    totalItens,
                    detalheErro
                );

                modalProgresso.onTentarNovamente = function() {
                    tentativasLoteAtual = 0;
                    modalProgresso.retomarProcessamento();
                    executarLote();
                };

                modalProgresso.onPularLote = function() {
                    lotesPulados.push(loteFalho);
                    indiceLoteAtual++;
                    tentativasLoteAtual = 0;
                    modalProgresso.retomarProcessamento();
                    executarLote();
                };

                modalProgresso.onPausarManter = function() {
                    modalProgresso.fechar();
                    var pendentes = totalItens - itensSalvosComSucesso;
                    var msgPausa = "Processamento pausado. <b>" + itensSalvosComSucesso + "</b> itens foram salvos com sucesso e removidos da tela.<br><br>Os <b>" + pendentes + "</b> itens restantes continuam na tela para que voce nao perca suas alteracoes. Voce pode clicar em 'Concluir' novamente quando o servidor estabilizar.";
                    if (window.GMF && window.GMF.servico && window.GMF.servico.Util && window.GMF.servico.Util.Funcoes) {
                        window.GMF.servico.Util.Funcoes.customMessageBox("Pausado com Seguranca", msgPausa, Ext.MessageBox.INFO);
                    } else {
                        Ext.Msg.alert("Pausado com Seguranca", msgPausa);
                    }
                };
            }
        });
    }

    executarLote();
}


// Hook nos controllers e views de Manutenção de Datas
function hookControllerManutencaoDeDatas() {
    if (!window.GMF || !window.GMF.controller || !window.GMF.controller.dominio || !window.GMF.controller.dominio.MovimentacaoDeEntradaESaida) return;
    var mov = window.GMF.controller.dominio.MovimentacaoDeEntradaESaida;
    if (mov.ManutencaoDeDatas && mov.ManutencaoDeDatas.ControllerDeManutencaoDeDatas && mov.ManutencaoDeDatas.ControllerDeManutencaoDeDatas.prototype) {
        var proto = mov.ManutencaoDeDatas.ControllerDeManutencaoDeDatas.prototype;
        // Hook no acaoSalvar (Botao Concluir do Passo 3) -> Processamento em Lotes com Barra de Progresso Real
        // Blindagem do Passo 4 contra travamento por full-scan na tabela de logs
        if (proto.criarJanelaDeLogDelteracoes && !proto.criarJanelaDeLogDelteracoes._agHooked) {
            var origCriarLog = proto.criarJanelaDeLogDelteracoes;
            proto.criarJanelaDeLogDelteracoes = function(b) {
                if (!this.idsLogAlteracoes || (Array.isArray(this.idsLogAlteracoes) && this.idsLogAlteracoes.length === 0)) {
                    this.idsLogAlteracoes = '0';
                }
                return origCriarLog.apply(this, arguments);
            };
            proto.criarJanelaDeLogDelteracoes._agHooked = true;
        }

        if (proto.acaoSalvar && !proto.acaoSalvar._agHooked) {
            proto.acaoSalvar = function(b) {
                return executarSalvarManutencaoEmLotes(this, b);
            };
            proto.acaoSalvar._agHooked = true;
        }

        if (proto.criarJanelaDeParametros && !proto.criarJanelaDeParametros._agHooked) {
            var origCriar = proto.criarJanelaDeParametros;
            proto.criarJanelaDeParametros = function(a) {
                if (a && a.model && a.model.data) {
                    if (!a.model.data.DataInicial) a.model.data.DataInicial = new Date(2020, 0, 1);
                    if (!a.model.data.DataFinal) a.model.data.DataFinal = new Date(2030, 0, 1);
                    if (!a.model.data.PerfilTMV) a.model.data.PerfilTMV = 'VDA0601';
                    if (!a.model.data.IdDoTipoDeMovimento) a.model.data.IdDoTipoDeMovimento = 'I507';
                }
                var f = origCriar.apply(this, arguments);
                setTimeout(preencherDatasPadraoManutencaoDeDatas, 20);
                setTimeout(preencherDatasPadraoManutencaoDeDatas, 80);
                setTimeout(preencherDatasPadraoManutencaoDeDatas, 200);
                setTimeout(preencherDatasPadraoManutencaoDeDatas, 500);
                return f;
            };
            proto.criarJanelaDeParametros._agHooked = true;
        }

        // Hook na abertura do modal "Alteração de Datas"
        if (proto.botaoDeAcaoDoAssistente && !proto.botaoDeAcaoDoAssistente._agHooked) {
            var origBotaoAcao = proto.botaoDeAcaoDoAssistente;
            proto.botaoDeAcaoDoAssistente = function(a) {
                var ret = origBotaoAcao.apply(this, arguments);
                setTimeout(configurarJanelasAlteracaoDatasManutencao, 10);
                setTimeout(configurarJanelasAlteracaoDatasManutencao, 50);
                setTimeout(configurarJanelasAlteracaoDatasManutencao, 150);
                setTimeout(configurarJanelasAlteracaoDatasManutencao, 300);
                return ret;
            };
            proto.botaoDeAcaoDoAssistente._agHooked = true;
        }

        // Hook na abertura do passo 3 (Confirmação de Itens Selecionados)
        if (proto.criarJanelaDeConfirmacao && !proto.criarJanelaDeConfirmacao._agHooked) {
            var origCriarConf = proto.criarJanelaDeConfirmacao;
            proto.criarJanelaDeConfirmacao = function(b) {
                var ret = origCriarConf.apply(this, arguments);
                var ctrl = this;
                setTimeout(function() {
                    var grid = obterGridConfirmacaoManutencaoDatas();
                    if (grid) {
                        grid._controllerManutencao = ctrl;
                        configurarGridConfirmacaoManutencaoDatas(grid);
                    }
                }, 30);
                setTimeout(function() {
                    var grid = obterGridConfirmacaoManutencaoDatas();
                    if (grid) {
                        grid._controllerManutencao = ctrl;
                        configurarGridConfirmacaoManutencaoDatas(grid);
                    }
                }, 150);
                setTimeout(function() {
                    var grid = obterGridConfirmacaoManutencaoDatas();
                    if (grid) {
                        grid._controllerManutencao = ctrl;
                        configurarGridConfirmacaoManutencaoDatas(grid);
                    }
                }, 400);
                return ret;
            };
            proto.criarJanelaDeConfirmacao._agHooked = true;
        }
    }
}

function hookViewParametrosManutencaoDeDatas() {
    if (!window.GMF || !window.GMF.view || !window.GMF.view.dominio || !window.GMF.view.dominio.MovimentacaoDeEntradaESaida) return;
    var mov = window.GMF.view.dominio.MovimentacaoDeEntradaESaida;
    if (mov.ManutencaoDeDatas && mov.ManutencaoDeDatas.EditViewDeParametrosManutencaoDeDatas && mov.ManutencaoDeDatas.EditViewDeParametrosManutencaoDeDatas.prototype) {
        var proto = mov.ManutencaoDeDatas.EditViewDeParametrosManutencaoDeDatas.prototype;
        if (!proto._agHooked) {
            var origInit = proto.initComponent;
            proto.initComponent = function() {
                var ret = origInit.apply(this, arguments);
                this.on('afterrender', function() {
                    setTimeout(preencherDatasPadraoManutencaoDeDatas, 10);
                    setTimeout(preencherDatasPadraoManutencaoDeDatas, 80);
                    setTimeout(preencherDatasPadraoManutencaoDeDatas, 250);
                });
                return ret;
            };
            proto._agHooked = true;
        }
    }
}

function hookViewSelecaoDocumentosManutencaoDeDatas() {
    if (!window.GMF || !window.GMF.view || !window.GMF.view.dominio || !window.GMF.view.dominio.MovimentacaoDeEntradaESaida) return;
    var mov = window.GMF.view.dominio.MovimentacaoDeEntradaESaida;
    if (mov.ManutencaoDeDatas && mov.ManutencaoDeDatas.ListViewDeSelecaoDeDocumentosParaManutencaoDeDatas && mov.ManutencaoDeDatas.ListViewDeSelecaoDeDocumentosParaManutencaoDeDatas.prototype) {
        var proto = mov.ManutencaoDeDatas.ListViewDeSelecaoDeDocumentosParaManutencaoDeDatas.prototype;
        if (!proto._agHookedConfig) {
            var origInit = proto.initComponent;
            proto.initComponent = function() {
                var valorSalvo = parseInt(sessionStorage.getItem('MANUTENCAO_DATAS_PAGE_SIZE') || localStorage.getItem('MANUTENCAO_DATAS_PAGE_SIZE'), 10);
                var opcoesValidas = [30, 50, 100, 150, 200, 500];
                var tamanhoPadrao = opcoesValidas.indexOf(valorSalvo) !== -1 ? valorSalvo : 30;
                this.pageSize = tamanhoPadrao;

                var ret = origInit.apply(this, arguments);

                if (this.store) {
                    this.store.pageSize = tamanhoPadrao;
                    if (this.store.proxy) {
                        this.store.proxy.extraParams = this.store.proxy.extraParams || {};
                        this.store.proxy.extraParams.limit = tamanhoPadrao;
                    }
                }

                this.on('afterrender', function() {
                    configurarGridSelecaoManutencaoDatas(this);
                    var me = this;
                    setTimeout(function() { configurarGridSelecaoManutencaoDatas(me); }, 80);
                    setTimeout(function() { configurarGridSelecaoManutencaoDatas(me); }, 300);
                });
                return ret;
            };
            proto._agHookedConfig = true;
        }
    }
}

function hookViewConfirmacaoDocumentosManutencaoDeDatas() {
    if (!window.GMF || !window.GMF.view || !window.GMF.view.dominio || !window.GMF.view.dominio.MovimentacaoDeEntradaESaida) return;
    var mov = window.GMF.view.dominio.MovimentacaoDeEntradaESaida;
    if (mov.ManutencaoDeDatas && mov.ManutencaoDeDatas.ListViewDeConfirmacaoDeDocumentosParaManutencaoDeDatas && mov.ManutencaoDeDatas.ListViewDeConfirmacaoDeDocumentosParaManutencaoDeDatas.prototype) {
        var proto = mov.ManutencaoDeDatas.ListViewDeConfirmacaoDeDocumentosParaManutencaoDeDatas.prototype;
        if (!proto._agHookedConfig) {
            var origInit = proto.initComponent;
            proto.initComponent = function() {
                var ret = origInit.apply(this, arguments);
                this.on('afterrender', function() {
                    configurarGridConfirmacaoManutencaoDatas(this);
                    var me = this;
                    setTimeout(function() { configurarGridConfirmacaoManutencaoDatas(me); }, 80);
                    setTimeout(function() { configurarGridConfirmacaoManutencaoDatas(me); }, 300);
                });
                return ret;
            };
            proto._agHookedConfig = true;
        }
    }
}

// Hook global no Ext.window.Window.prototype.show para capturar a abertura de modais instantaneamente
function hookJanelaExtJSNovaOperacao() {
    if (!window.Ext) return;
    var protos = [];
    if (window.Ext.window && window.Ext.window.Window && window.Ext.window.Window.prototype) {
        protos.push(window.Ext.window.Window.prototype);
    }
    if (window.Ext.Window && window.Ext.Window.prototype && protos.indexOf(window.Ext.Window.prototype) === -1) {
        protos.push(window.Ext.Window.prototype);
    }

    protos.forEach(function(winProto) {
        if (!winProto || winProto._agModalShowHooked) return;
        var origWinShow = winProto.show;
        winProto.show = function() {
            var win = this;
            try {
                // 1. Nova Operação: Foco no campo Posto
                var lk = win.down ? (
                    win.down('[itemid=lkPostoTrabalho]') || 
                    win.down('[itemid=lkPostoTrabalhoDoc]') || 
                    win.down('LookupDePostoDeTrabalho') ||
                    win.down('[name=postoTrabalho]')
                ) : null;
                if (lk) {
                    var cp = lk.down ? (lk.down('[itemid=campoDePesquisa]') || lk.down('campoDePesquisa')) : null;
                    win.defaultFocus = cp || lk;
                }

                // 2. Controle de Produção (Liberação): Foco no botão Autorizar
                if (ehJanelaLiberacaoControleProducao(win)) {
                    var btnAut = win.down ? (
                        win.down('button[text=Autorizar]') || 
                        (win.query && win.query('button').find(function(b) { return b.text && b.text.trim() === 'Autorizar'; }))
                    ) : null;
                    if (btnAut) {
                        win.defaultFocus = btnAut;
                    }
                }
            } catch(e) {}

            var ret = origWinShow.apply(this, arguments);

            try {
                // Pós-show Nova Operação
                setTimeout(function() {
                    if (win && !win.isDestroyed && (win.down('[itemid=lkPostoTrabalho]') || win.down('[itemid=lkPostoTrabalhoDoc]') || win.down('LookupDePostoDeTrabalho') || win.down('[name=postoTrabalho]'))) {
                        configurarJanelaNovaOperacao(win);
                    }
                }, 10);

                // Pós-show Controle de Produção (Liberação)
                if (ehJanelaLiberacaoControleProducao(win)) {
                    configurarJanelaLiberacaoControleProducao(win);
                    setTimeout(function() { configurarJanelaLiberacaoControleProducao(win); }, 15);
                    setTimeout(function() { configurarJanelaLiberacaoControleProducao(win); }, 50);
                    setTimeout(function() { configurarJanelaLiberacaoControleProducao(win); }, 150);
                    setTimeout(function() { configurarJanelaLiberacaoControleProducao(win); }, 300);
                }

                // Pós-show Alteração de Datas (Manutenção de Datas)
                if (ehJanelaAlteracaoDatasManutencao(win)) {
                    configurarJanelaAlteracaoDatasManutencao(win);
                    setTimeout(function() { configurarJanelaAlteracaoDatasManutencao(win); }, 15);
                    setTimeout(function() { configurarJanelaAlteracaoDatasManutencao(win); }, 50);
                    setTimeout(function() { configurarJanelaAlteracaoDatasManutencao(win); }, 150);
                    setTimeout(function() { configurarJanelaAlteracaoDatasManutencao(win); }, 300);
                }
            } catch(e) {}

            return ret;
        };
        winProto._agModalShowHooked = true;
    });
}

// --------------------------------------------------------------------------
// 7. Patches Estruturais do ExtJS e Monitor Contínuo
// --------------------------------------------------------------------------

function aplicarPatchesEstruturaisExtJS() {
    if (!window.Ext) return;

    try {
        injetarEstilosPersonalizados();
        removerBotaoFlutuante();
        hookCustomMessageBox();

        // A. Hotfix direto no bug do ExtJS 4.1.1 (ext-all-debug.js linha 12910 - Ext.DomHelper.doInsert)
        const domHelper = window.Ext.DomHelper || (window.Ext.dom && window.Ext.dom.Helper && window.Ext.dom.Helper.prototype);
        if (domHelper && typeof domHelper.doInsert === 'function' && !domHelper.doInsert._corrigido) {
            const originalDoInsert = domHelper.doInsert;
            const safeDoInsert = function(el, o, returnElement, pos, sibling, append) {
                if (!el) return null;
                try {
                    var targetDom = (el && el.dom) ? el.dom : (window.Ext.getDom ? window.Ext.getDom(el) : el);
                    if (!targetDom) return null;
                    if (!targetDom.parentNode && sibling !== 'firstChild' && !append) return null;
                    return originalDoInsert.call(this, targetDom, o, returnElement, pos, sibling, append);
                } catch (err) {
                    console.warn('[ERP Optimizer] Interceptou erro do ExtJS no doInsert:', err);
                    return null;
                }
            };
            safeDoInsert._corrigido = true;
            domHelper.doInsert = safeDoInsert;
            if (window.Ext.DomHelper) window.Ext.DomHelper.doInsert = safeDoInsert;
            if (window.Ext.dom && window.Ext.dom.Helper && window.Ext.dom.Helper.prototype) {
                window.Ext.dom.Helper.prototype.doInsert = safeDoInsert;
            }
        }

        // A2. Hotfix direto no bug do Ext.LoadMask do ExtJS 4.1.1 (ext-all-debug.js linha 62204)
        // Evita erro fatal "Cannot read properties of undefined (reading 'componentLayoutCounter')" e destravamento do botão Buscar
        if (window.Ext && window.Ext.LoadMask && window.Ext.LoadMask.prototype) {
            var lmProto = window.Ext.LoadMask.prototype;
            if (!lmProto._safeLoadMaskHooked) {
                var origOnBeforeLoad = lmProto.onBeforeLoad;
                lmProto.onBeforeLoad = function() {
                    var me = this;
                    var owner = me.getOwner ? me.getOwner() : (me.ownerCt || me.floatParent);
                    if (!owner || me.isDestroyed || owner.isDestroyed) {
                        return;
                    }
                    try {
                        return origOnBeforeLoad.apply(this, arguments);
                    } catch(err) {
                        console.warn('[ERP Optimizer] Erro prevenido em LoadMask.onBeforeLoad:', err);
                    }
                };

                var origMaybeShow = lmProto.maybeShow;
                lmProto.maybeShow = function() {
                    var me = this;
                    var owner = me.getOwner ? me.getOwner() : (me.ownerCt || me.floatParent);
                    if (!owner || me.isDestroyed || owner.isDestroyed) {
                        return;
                    }
                    try {
                        return origMaybeShow.apply(this, arguments);
                    } catch(err) {
                        console.warn('[ERP Optimizer] Erro prevenido em LoadMask.maybeShow:', err);
                    }
                };

                lmProto._safeLoadMaskHooked = true;
            }
        }

        // B. Bloqueio TOTAL preventivo no Ext.defer e Ext.Function.defer contra criação de botões pesados pelo ERP
        function criarInterceptorDefer(orig) {
            if (!orig || typeof orig !== 'function') return orig;
            return function(fn, millis, scope, args) {
                if (typeof fn === 'function') {
                    try {
                        var s = fn.toString();
                        if (s.indexOf('Finalizar') !== -1 && (s.indexOf('Button') !== -1 || s.indexOf('button') !== -1 || s.indexOf('LookupDeMotivo') !== -1)) {
                            return 0; // Cancela e impede a criação de 500 botões ExtJS pesados
                        }
                        if (s.indexOf('progressbar') !== -1 || s.indexOf('StatusApontamento') !== -1) {
                            return 0; // Cancela e impede a criação de 500 barras de progresso ExtJS pesadas
                        }
                    } catch(e) {}
                }
                return orig.apply(this, arguments);
            };
        }

        if (window.Ext.defer && !window.Ext.defer._interceptorBotoesFinalizar) {
            window.Ext.defer = criarInterceptorDefer(window.Ext.defer);
            window.Ext.defer._interceptorBotoesFinalizar = true;
        }
        if (window.Ext.Function && window.Ext.Function.defer && !window.Ext.Function.defer._interceptorBotoesFinalizar) {
            window.Ext.Function.defer = criarInterceptorDefer(window.Ext.Function.defer);
            window.Ext.Function.defer._interceptorBotoesFinalizar = true;
        }

        // C. Hook ultra-rápido no Ext.view.Table (refresh e renderCell) para interceptar antes de desenhar qualquer linha
        // C. Hook ultra-rápido no Ext.view.Table (refresh e renderCell) para interceptar antes de desenhar qualquer linha
        if (window.Ext.view && window.Ext.view.Table) {
            var tableProto = window.Ext.view.Table.prototype;

            if (tableProto.refresh && !tableProto._agRefreshHooked) {
                var origRefresh = tableProto.refresh;
                tableProto.refresh = function() {
                    try {
                        var view = this;
                        var grid = obterGridDaView(view);
                        // Otimiza colunas ESTRITAMENTE para o grid de Produção
                        if (grid && isGridDeProducao(grid)) {
                            var hCt = view.headerCt;
                            if (hCt) {
                                var cols = (typeof hCt.getGridColumns === 'function' ? hCt.getGridColumns() : null) || (hCt.items && hCt.items.items) || [];
                                for (var k = 0; k < cols.length; k++) {
                                    var cItem = cols[k];
                                    if (!cItem) continue;
                                    if (isColunaDoBotaoFinalizar(cItem, grid)) {
                                        if (cItem.renderer !== renderizarBotaoFinalizarInline) {
                                            if (!cItem._origRendererSalvo) {
                                                cItem._origRendererSalvo = true;
                                                cItem.origRenderer = cItem.renderer;
                                            }
                                            cItem._headerOriginal = cItem._headerOriginal || cItem.text || cItem.header;
                                            cItem.renderer = renderizarBotaoFinalizarInline;
                                            cItem.width = 85;
                                            cItem.text = 'Ação';
                                            cItem.header = 'Ação';
                                            cItem._rendererOtimizadoFinalizar = true;
                                        }
                                    } else if (isColunaDeApontamento(cItem, grid)) {
                                        if (cItem.renderer !== renderizarProgressBarInline) {
                                            if (!cItem._origRendererSalvo) {
                                                cItem._origRendererSalvo = true;
                                                cItem.origRenderer = cItem.renderer;
                                            }
                                            cItem.renderer = renderizarProgressBarInline;
                                            cItem._rendererOtimizadoProgressBar = true;
                                        }
                                    }
                                }
                            }
                        } else if (view.headerCt) {
                            // Se for outro grid (ex: Dados de Apontamento ou Sequência de Operações), garante que nenhuma coluna foi contaminada
                            var otherCols = (typeof view.headerCt.getGridColumns === 'function' ? view.headerCt.getGridColumns() : null) || (view.headerCt.items && view.headerCt.items.items) || [];
                            for (var oc = 0; oc < otherCols.length; oc++) {
                                var oCol = otherCols[oc];
                                if (!oCol) continue;
                                var oDIndex = String(oCol.dataIndex || '').trim();
                                if (oDIndex === 'Acao') {
                                    if (oCol.renderer === renderizarBotaoFinalizarInline || oCol._rendererOtimizadoFinalizar) {
                                        delete oCol._rendererOtimizadoFinalizar;
                                        if (oCol.origRenderer && oCol.origRenderer !== renderizarBotaoFinalizarInline) {
                                            oCol.renderer = oCol.origRenderer;
                                        } else {
                                            delete oCol.renderer;
                                            oCol.renderer = null;
                                        }
                                        oCol.width = 40;
                                        oCol.text = 'Ação';
                                        oCol.header = 'Ação';
                                    }
                                } else if (oCol.renderer === renderizarBotaoFinalizarInline || oCol._rendererOtimizadoFinalizar) {
                                    delete oCol._rendererOtimizadoFinalizar;
                                    var oColTxt = String(oCol.text || oCol.header || '').trim();
                                    if (oColTxt === 'Dependências' || oColTxt === 'Dependencias' || (typeof window.formatarDependencias === 'function')) {
                                        oCol.renderer = window.formatarDependencias || oCol.origRenderer;
                                        oCol.text = 'Dependências';
                                        oCol.header = 'Dependências';
                                        oCol.width = 40;
                                    } else if (oCol.origRenderer && oCol.origRenderer !== renderizarBotaoFinalizarInline) {
                                        oCol.renderer = oCol.origRenderer;
                                    } else {
                                        delete oCol.renderer;
                                        oCol.renderer = null;
                                    }
                                }
                                if (oCol.renderer === renderizarProgressBarInline || oCol._rendererOtimizadoProgressBar) {
                                    delete oCol._rendererOtimizadoProgressBar;
                                    if (oCol.origRenderer && oCol.origRenderer !== renderizarProgressBarInline) {
                                        oCol.renderer = oCol.origRenderer;
                                    } else {
                                        delete oCol.renderer;
                                        oCol.renderer = null;
                                    }
                                }
                            }
                        }
                    } catch(e) {}
                    return origRefresh.apply(this, arguments);
                };
                tableProto._agRefreshHooked = true;
            }

            if (tableProto.renderCell && !tableProto._agRenderCellHooked) {
                var origRenderCell = tableProto.renderCell;
                tableProto.renderCell = function(column, record, recordIndex, rowIndex, columnIndex, out) {
                    if (column) {
                        var grid = obterGridDaView(this) || column.grid || (column.up && column.up('grid'));
                        // NUNCA modifica renderer de coluna se não for grid de produção
                        if (grid && isGridDeProducao(grid)) {
                            if (isColunaDoBotaoFinalizar(column, grid)) {
                                if (column.renderer !== renderizarBotaoFinalizarInline) {
                                    if (!column._origRendererSalvo) {
                                        column._origRendererSalvo = true;
                                        column.origRenderer = column.renderer;
                                    }
                                    column._headerOriginal = column._headerOriginal || column.text || column.header;
                                    column.renderer = renderizarBotaoFinalizarInline;
                                    column.width = 85;
                                    column.text = 'Ação';
                                    column.header = 'Ação';
                                    column._rendererOtimizadoFinalizar = true;
                                }
                            } else if (isColunaDeApontamento(column, grid)) {
                                if (column.renderer !== renderizarProgressBarInline) {
                                    if (!column._origRendererSalvo) {
                                        column._origRendererSalvo = true;
                                        column.origRenderer = column.renderer;
                                    }
                                    column.renderer = renderizarProgressBarInline;
                                    column._rendererOtimizadoProgressBar = true;
                                }
                            }
                        } else {
                            // Se for outro grid e a coluna tiver sido contaminada, reverte na hora
                            var colDIndex = String(column.dataIndex || '').trim();
                            if (colDIndex === 'Acao') {
                                if (column.renderer === renderizarBotaoFinalizarInline || column._rendererOtimizadoFinalizar) {
                                    delete column._rendererOtimizadoFinalizar;
                                    if (column.origRenderer && column.origRenderer !== renderizarBotaoFinalizarInline) {
                                        column.renderer = column.origRenderer;
                                    } else {
                                        delete column.renderer;
                                        column.renderer = null;
                                    }
                                    column.width = 40;
                                    column.text = 'Ação';
                                    column.header = 'Ação';
                                }
                            } else if (column.renderer === renderizarBotaoFinalizarInline || column._rendererOtimizadoFinalizar) {
                                delete column._rendererOtimizadoFinalizar;
                                var colTxt = String(column.text || column.header || '').trim();
                                if (colTxt === 'Dependências' || colTxt === 'Dependencias' || (typeof window.formatarDependencias === 'function')) {
                                    column.renderer = window.formatarDependencias || column.origRenderer;
                                } else if (column.origRenderer && column.origRenderer !== renderizarBotaoFinalizarInline) {
                                    column.renderer = column.origRenderer;
                                } else {
                                    delete column.renderer;
                                    column.renderer = null;
                                }
                            }
                            if (column.renderer === renderizarProgressBarInline || column._rendererOtimizadoProgressBar) {
                                delete column._rendererOtimizadoProgressBar;
                                if (column.origRenderer && column.origRenderer !== renderizarProgressBarInline) {
                                    column.renderer = column.origRenderer;
                                } else {
                                    delete column.renderer;
                                    column.renderer = null;
                                }
                            }
                        }
                    }
                    return origRenderCell.apply(this, arguments);
                };
                tableProto._agRenderCellHooked = true;
            }
        }

        // C. Força Store de Produção a sempre usar pageSize = 500 no prototype
        if (window.GMF && window.GMF.store && window.GMF.store.dominio && window.GMF.store.dominio.Industria && window.GMF.store.dominio.Industria.StoreDePainelDeControleDeProducao) {
            window.GMF.store.dominio.Industria.StoreDePainelDeControleDeProducao.prototype.pageSize = 500;
            window.GMF.store.dominio.Industria.StoreDePainelDeControleDeProducao.prototype.remoteSort = false;
        }

        if (window.GMF && window.GMF.view && window.GMF.view.dominio && window.GMF.view.dominio.Industria && 
            window.GMF.view.dominio.Industria.PainelDeControleDeProducao && 
            window.GMF.view.dominio.Industria.PainelDeControleDeProducao.ListViewDePainelDeControleDeProducao) {
            window.GMF.view.dominio.Industria.PainelDeControleDeProducao.ListViewDePainelDeControleDeProducao.prototype.sortableColumns = true;
        }

        // C. Intercepta acaoExecutar (Buscar) para sempre usar 500 registros, preenche datas ao abrir e desativa polling na raiz
        if (window.GMF && window.GMF.controller && window.GMF.controller.dominio && window.GMF.controller.dominio.Industria && window.GMF.controller.dominio.Industria.ControllerDePainelDeControleDeProducao) {
            var ctrlProto = window.GMF.controller.dominio.Industria.ControllerDePainelDeControleDeProducao.prototype;
            
            if (!ctrlProto.criarJanela._autoDatasInterceptado) {
                var origCriarJanela = ctrlProto.criarJanela;
                ctrlProto.criarJanela = function() {
                    var res = origCriarJanela.apply(this, arguments);
                    try {
                        var grid = res && res.down ? res.down("[itemid=listOrdensDeProducaoParaControle]") : null;
                        if (grid) {
                            sincronizarGridPara500(grid);
                            otimizarColunasGrid(grid);
                            configurarOrdenacaoGridProducao(grid);
                        }
                        setTimeout(preencherDatasPadraoProducao, 80);
                        setTimeout(preencherDatasPadraoProducao, 250);
                        setTimeout(preencherDatasPadraoProducao, 600);
                        setTimeout(preencherDatasPadraoProducao, 1200);
                    } catch(e) {}
                    return res;
                };
                ctrlProto.criarJanela._autoDatasInterceptado = true;
            }

            if (!ctrlProto.iniciaPolling._desativadoExtensao) {
                ctrlProto.iniciaPolling = function() {
                    console.info('[ERP Optimizer] Auto-refresh de 30s desativado na raiz com sucesso.');
                };
                ctrlProto.iniciaPolling._desativadoExtensao = true;
            }

            if (ctrlProto.acaoExecutar && !ctrlProto.acaoExecutar._interceptado500) {
                var origAcaoExecutar = ctrlProto.acaoExecutar;
                ctrlProto.acaoExecutar = function(a, r) {
                    // Se for chamada periódica de auto-refresh (r === true), bloqueia antes de emitir q.load()
                    if (r === true) {
                        const bloquearAutoRefresh = (sessionStorage.getItem('BLOQUEAR_AUTO_REFRESH_OP') ?? localStorage.getItem('BLOQUEAR_AUTO_REFRESH_OP')) !== 'false';
                        if (bloquearAutoRefresh) {
                            console.info('[ERP Optimizer] Auto-refresh periódico de 30s prevenido com sucesso.');
                            return;
                        }
                    }

                    // Registra que a busca foi disparada explicitamente (manual ou pós-ação)
                    window.__ERP_ULTIMO_ACAO_EXECUTAR = Date.now();
                    ultimoMomentoUsuario = Date.now();
                    try {
                        sessionStorage.setItem('ULTIMO_CLIQUE_MANUAL', String(Date.now()));
                    } catch(e) {}

                    try {
                        window.__ERP_CACHE_LIBERACAO = null;
                        otimizarColunasDeTodosOsGrids();
                        if (a && a.formulario) {
                            var grid = a.formulario.down("[itemid=listOrdensDeProducaoParaControle]");
                            if (grid) {
                                sincronizarGridPara500(grid);
                                otimizarColunasGrid(grid);
                                var view = grid.getView ? grid.getView() : null;
                                if (view && (!view.loadMask || view.loadMask.isDestroyed || (view.loadMask.getOwner && !view.loadMask.getOwner()))) {
                                    try {
                                        view.loadMask = Ext.create('Ext.LoadMask', view, {
                                            store: view.store || grid.getStore(),
                                            msg: view.loadingText || 'Carregando...'
                                        });
                                    } catch(e) {}
                                }
                            }
                        }
                    } catch(e) {}
                    return origAcaoExecutar.apply(this, arguments);
                };
                ctrlProto.acaoExecutar._interceptado500 = true;
            }
        }

        // D. Aplica correções exclusivamente no grid de produção ativo (e NUNCA em outros grids)
        var gridAtivo = obterGridProducaoAtivo();
        if (gridAtivo && isGridDeProducao(gridAtivo)) {
            atualizarElementosDoGrid(gridAtivo);
        }

        // D2. Remove imediatamente qualquer injeção indevida em grids de outras telas (ex: Lista de Itens)
        limparElementosInjetadosDeOutrosGrids();

        // D3. Hook para alternância de abas no Ext.tab.Panel
        if (window.Ext && window.Ext.tab && window.Ext.tab.Panel) {
            var tabProto = window.Ext.tab.Panel.prototype;
            if (!tabProto._agTabChangeHooked) {
                var origSetActiveTab = tabProto.setActiveTab;
                tabProto.setActiveTab = function() {
                    var ret = origSetActiveTab.apply(this, arguments);
                    try {
                        setTimeout(function() {
                            limparElementosInjetadosDeOutrosGrids();
                            var g = obterGridProducaoAtivo();
                            if (g && isGridDeProducao(g)) {
                                atualizarElementosDoGrid(g);
                            }
                        }, 50);
                    } catch(e) {}
                    return ret;
                };
                tabProto._agTabChangeHooked = true;
            }
        }

        // E. Preenche automaticamente as datas de produção (01/01/2020 a 01/01/2030)
        preencherDatasPadraoProducao();

        // F. Remove qualquer resquício de botão flutuante
        removerBotaoFlutuante();

        // G. Auto-preenchimento da Descrição a partir do Posto na janela "Nova Operação"
        hookControllersDeSequenciaDeOperacao();
        hookJanelaExtJSNovaOperacao();
        configurarJanelasNovaOperacao();

        // H. Auto-preenchimento de datas e foco em "Autorizar" no Controle de Produção (Liberação de OP)
        hookControllerPainelControleProducao();
        configurarJanelasLiberacaoControleProducao();

        // I. Auto-preenchimento de datas na Manutenção de Datas (01/01/2020 a 01/01/2030)
        hookControllerManutencaoDeDatas();
        hookViewParametrosManutencaoDeDatas();
        preencherDatasPadraoManutencaoDeDatas();

        // J. Configuração de Busca e Paginação na Seleção de Itens da Manutenção de Datas
        hookViewSelecaoDocumentosManutencaoDeDatas();
        var gridMD = obterGridSelecaoManutencaoDatas();
        if (gridMD) {
            configurarGridSelecaoManutencaoDatas(gridMD);
        }

        // K. Janela "Alteração de Datas" (Espelhamento de datas e Motivo P4 padrão)
        configurarJanelasAlteracaoDatasManutencao();

        // L. Configuração da Confirmação de Itens da Manutenção de Datas (Filtro e Exclusão de Meses Anteriores)
        hookViewConfirmacaoDocumentosManutencaoDeDatas();
        var gridConf = obterGridConfirmacaoManutencaoDatas();
        if (gridConf) {
            configurarGridConfirmacaoManutencaoDatas(gridConf);
        }
    } catch(err) {
        // Silencioso para não gerar exceções não capturadas
    }
}

// Executa injeção de estilos, limpeza de outros grids e remoção de botão flutuante imediatamente
injetarEstilosPersonalizados();
removerBotaoFlutuante();
limparElementosInjetadosDeOutrosGrids();
aplicarPatchesEstruturaisExtJS();

const extJsInitializationMonitor = setInterval(() => {
    if (window.Ext && window.Ext.Ajax) {
        clearInterval(extJsInitializationMonitor);

        aplicarPatchesEstruturaisExtJS();
        setInterval(aplicarPatchesEstruturaisExtJS, 1500);

        window.Ext.Ajax.timeout = 300000;

        var idBuscaAtual = 0;
        var CHUNK_SIZE_SEGURO = 800; // Limite otimizado para acelerar em mais de 2.5x com total segurança contra maxJsonLength (2 MB)

        function obterOuCriarComponenteProgresso(topTb) {
            if (!topTb) return null;
            var comp = topTb.down ? topTb.down('#lblProgressoChunksTop') : null;
            if (!comp) {
                try {
                    comp = Ext.create('Ext.Component', {
                        itemId: 'lblProgressoChunksTop',
                        cls: 'ag-progresso-toolbar',
                        hidden: true,
                        html: ''
                    });
                    var chk = topTb.down ? topTb.down('#chkModoLiberacaoTop') : null;
                    if (chk) {
                        var idx = topTb.items.indexOf(chk);
                        topTb.insert(idx + 1, comp);
                    } else {
                        topTb.add(comp);
                    }
                    if (topTb.updateLayout) topTb.updateLayout();
                } catch(e) {}
            }
            return comp;
        }

        function removerBadgeProgresso() {
            try {
                var elAntigo = document.getElementById('erp-badge-progresso');
                if (elAntigo) elAntigo.remove();

                var grid = obterGridProducaoAtivo();
                if (grid) {
                    var topTb = grid.down ? grid.down('toolbar[dock="top"]') : null;
                    if (topTb) {
                        var comp = topTb.down ? topTb.down('#lblProgressoChunksTop') : null;
                        if (comp) {
                            comp.hide();
                            if (topTb.updateLayout) topTb.updateLayout();
                        }
                    }
                }
            } catch(e) {}
        }

        function removerMascaraCarregamento() {
            try {
                var grid = obterGridProducaoAtivo();
                if (grid) {
                    if (grid.loadMask && typeof grid.loadMask.hide === 'function') grid.loadMask.hide();
                    var view = grid.getView ? grid.getView() : null;
                    if (view && view.loadMask && typeof view.loadMask.hide === 'function') view.loadMask.hide();
                }
                removerBadgeProgresso();
                // Limpa resquícios de divs de máscara
                document.querySelectorAll('.x-mask-msg').forEach(function(el) {
                    el.remove();
                });
            } catch(e) {}
        }

        function atualizarBadgeProgresso(processados, totalBanco, totalSemDep, concluido) {
            try {
                // Remove qualquer badge flutuante antigo se houver
                var elAntigo = document.getElementById('erp-badge-progresso');
                if (elAntigo) elAntigo.remove();

                var grid = obterGridProducaoAtivo();
                if (!grid) return;
                var topTb = grid.down ? grid.down('toolbar[dock="top"]') : null;
                if (!topTb) return;

                var comp = obterOuCriarComponenteProgresso(topTb);
                if (!comp) return;

                if (concluido) {
                    comp.show();
                    if (comp.update) {
                        comp.update(
                            '<span class="ag-progresso-concluido">' +
                            '<b>' + totalSemDep.toLocaleString('pt-BR') + '</b> OPs prontas (' + totalBanco.toLocaleString('pt-BR') + ' no banco)' +
                            '</span>'
                        );
                    }
                    if (topTb.updateLayout) topTb.updateLayout();
                    setTimeout(function() {
                        try {
                            if (comp && !comp.isDestroyed) {
                                comp.hide();
                                if (topTb.updateLayout) topTb.updateLayout();
                            }
                        } catch(e) {}
                    }, 6000);
                    return;
                }

                var pct = totalBanco > 0 ? Math.round((processados / totalBanco) * 100) : 0;
                comp.show();
                if (comp.update) {
                    comp.update(
                        '<span class="ag-progresso-ativo">' +
                        '<span class="ag-tb-spinner"></span>' +
                        'Carregando banco: <b>' + processados.toLocaleString('pt-BR') + '</b> / ' + totalBanco.toLocaleString('pt-BR') + ' (' + pct + '%) • <b>' + totalSemDep.toLocaleString('pt-BR') + '</b> prontas' +
                        '</span>'
                    );
                }
                if (topTb.updateLayout) topTb.updateLayout();
            } catch(e) {}
        }

        function carregarRestanteChunksLiberacao(optionsOriginais, totalBanco, idBusca) {
            if (idBusca !== idBuscaAtual) return;

            var offsets = [];
            for (var offset = CHUNK_SIZE_SEGURO; offset < totalBanco; offset += CHUNK_SIZE_SEGURO) {
                offsets.push(offset);
            }

            if (offsets.length === 0) {
                finalizarCargaChunks(idBusca);
                return;
            }

            var indiceAtual = 0;
            var maxConcorrencia = 6; // Máximo de conexões simultâneas permitidas pelo Chrome por domínio (50% mais vazão)
            var ativos = 0;
            var processadosContador = CHUNK_SIZE_SEGURO;

            function processarProximos() {
                if (idBusca !== idBuscaAtual) {
                    removerMascaraCarregamento();
                    return;
                }

                while (ativos < maxConcorrencia && indiceAtual < offsets.length) {
                    var off = offsets[indiceAtual++];
                    ativos++;
                    executarChunk(off);
                }

                if (ativos === 0 && indiceAtual >= offsets.length) {
                    finalizarCargaChunks(idBusca);
                }
            }

            function executarChunk(off) {
                // Remove parâmetros prévios de paginação da URL para não duplicar start/limit no ASP.NET MVC
                var urlLimpa = (optionsOriginais.url || '')
                    .replace(/([?&])start=\d+/g, '')
                    .replace(/([?&])limit=\d+/g, '')
                    .replace(/([?&])page=\d+/g, '')
                    .replace(/([?&])pageSize=\d+/g, '')
                    .replace(/\?&/, '?')
                    .replace(/[?&]$/, '');

                var paramsChunk = Ext.apply({}, optionsOriginais.params || {});
                paramsChunk.start = off;
                paramsChunk.limit = CHUNK_SIZE_SEGURO;
                paramsChunk.pageSize = CHUNK_SIZE_SEGURO;
                paramsChunk.page = Math.floor(off / CHUNK_SIZE_SEGURO) + 1;

                Ext.Ajax.request({
                    url: urlLimpa,
                    method: optionsOriginais.method || 'GET',
                    params: paramsChunk,
                    timeout: 90000,
                    _ehChunkInterno: true,
                    success: function(resp) {
                        ativos--;
                        if (idBusca === idBuscaAtual) {
                            try {
                                var pacote = Ext.decode(resp.responseText);
                                if (pacote && Array.isArray(pacote.registros) && pacote.registros.length > 0) {
                                    var bloqueadasChunks = obterOpsBloqueadasMRP();
                                    var semDep = pacote.registros.filter(function(item) {
                                        return item && item.PossuiDependencia === false && !isOpBloqueadaMRP(item, bloqueadasChunks);
                                    });
                                    if (window.__ERP_CACHE_LIBERACAO && Array.isArray(window.__ERP_CACHE_LIBERACAO.registros)) {
                                        window.__ERP_CACHE_LIBERACAO.registros.push.apply(window.__ERP_CACHE_LIBERACAO.registros, semDep);
                                    }
                                }
                                processadosContador += CHUNK_SIZE_SEGURO;
                                var totalSemDepAtual = (window.__ERP_CACHE_LIBERACAO && window.__ERP_CACHE_LIBERACAO.registros) ? window.__ERP_CACHE_LIBERACAO.registros.length : 0;
                                atualizarBadgeProgresso(Math.min(processadosContador, totalBanco), totalBanco, totalSemDepAtual, false);

                                // Atualiza a barra de paginação em tempo real conforme os dados chegam
                                var grid = obterGridProducaoAtivo();
                                if (grid) {
                                    var store = grid.getStore ? grid.getStore() : null;
                                    var pt = grid.down ? grid.down('pagingtoolbar') : null;
                                    if (store && pt) {
                                        store.totalCount = totalSemDepAtual;
                                        if (typeof pt.onLoad === 'function') {
                                            pt.onLoad();
                                        }
                                    }
                                }
                            } catch(e) {}
                        }
                        processarProximos();
                    },
                    failure: function() {
                        ativos--;
                        processarProximos();
                    }
                });
            }

            processarProximos();
        }

        function finalizarCargaChunks(idBusca) {
            if (idBusca !== idBuscaAtual) return;
            if (!window.__ERP_CACHE_LIBERACAO || !Array.isArray(window.__ERP_CACHE_LIBERACAO.registros)) return;

            window.__ERP_CACHE_LIBERACAO.carregando = false;

            // Ordenação global se configurada
            // Ordenacao global da carga: se o usuario ja tiver uma coluna ordenada no grid, respeita ela; senao usa a preferencia de data
            var gridTemp = obterGridProducaoAtivo();
            var storeTemp = (gridTemp && gridTemp.getStore) ? gridTemp.getStore() : null;
            var sorterAtivo = (storeTemp && storeTemp.sorters && storeTemp.sorters.first) ? storeTemp.sorters.first() : null;

            if (sorterAtivo && sorterAtivo.property) {
                window.__ERP_CACHE_LIBERACAO.registros.sort(function(a, b) {
                    return compararValoresGridProducao(a, b, sorterAtivo.property, sorterAtivo.direction);
                });
            } else {
                var ordenacaoData = sessionStorage.getItem('ORDENACAO_DATA_OP') || localStorage.getItem('ORDENACAO_DATA_OP') || 'padrao';
                if (ordenacaoData === 'desc' || ordenacaoData === 'asc') {
                    window.__ERP_CACHE_LIBERACAO.registros.sort(function(a, b) {
                        return compararValoresGridProducao(a, b, 'DataDeMovimentacao', ordenacaoData);
                    });
                }
            }

            var totalReal = window.__ERP_CACHE_LIBERACAO.registros.length;
            var grid = obterGridProducaoAtivo();
            if (grid) {
                otimizarColunasGrid(grid);
                var store = grid.getStore ? grid.getStore() : null;
                var pt = grid.down ? grid.down('pagingtoolbar') : null;
                if (store) {
                    var primeiros500 = window.__ERP_CACHE_LIBERACAO.registros.slice(0, 500);
                    if (store.loadData) {
                        store.loadData(primeiros500);
                    }
                    store.totalCount = totalReal;
                }
                if (pt && typeof pt.onLoad === 'function') {
                    pt.onLoad();
                }
            }

            atualizarBadgeProgresso(window.__ERP_CACHE_LIBERACAO.totalBanco, window.__ERP_CACHE_LIBERACAO.totalBanco, totalReal, true);
            mostrarToastNotificacao('<b>' + totalReal.toLocaleString('pt-BR') + '</b> OPs sem dependência carregadas de toda a busca (' + window.__ERP_CACHE_LIBERACAO.totalBanco.toLocaleString('pt-BR') + ' no banco)!');
            console.info('[ERP Optimizer] Carga integral concluída: ' + totalReal + ' OPs sem dependência disponíveis.');
        }

        window.Ext.Ajax.on('beforerequest', function(connection, options) {
            if (options._ehChunkInterno) {
                return true;
            }

            if (options.url && options.url.indexOf('GravarMensagemDeErroDeScript') !== -1) {
                return false;
            }

            // Intercepta tentativas de autorização/liberação para capturar as OPs do lote ou individuais
            if (options.url && (options.url.indexOf('AutorizarProducao') !== -1 || options.url.indexOf('AutorizarProducaoAdministrativamente') !== -1)) {
                window.__ERP_EM_OPERACAO_PRODUCAO = Date.now();
                window.__ERP_ULTIMO_ACAO_EXECUTAR = Date.now();
                ultimoMomentoUsuario = Date.now();
                try {
                    sessionStorage.setItem('ULTIMO_CLIQUE_MANUAL', String(Date.now()));
                } catch (e) {}

                options.timeout = 600000; // 10 minutos para autorizações volumosas

                var projecoes = [];
                try {
                    if (options.jsonData && options.jsonData.projecoes) {
                        projecoes = options.jsonData.projecoes;
                    } else if (typeof options.params === 'string') {
                        var parsed = window.Ext.decode(options.params);
                        if (parsed && parsed.projecoes) projecoes = parsed.projecoes;
                    } else if (options.params && options.params.projecoes) {
                        projecoes = options.params.projecoes;
                    }
                } catch (e) {}

                window.__ERP_ULTIMA_TENTATIVA_LIBERACAO = {
                    timestamp: Date.now(),
                    url: options.url,
                    projecoes: Array.isArray(projecoes) ? projecoes : []
                };
            }

            if (options.url && options.url.indexOf('ManutencaoDeDatas/Listar') !== -1) {
                var isDocAuxAtivo = (sessionStorage.getItem('PESQUISAR_DOC_AUX_SOMENTE') || localStorage.getItem('PESQUISAR_DOC_AUX_SOMENTE')) === 'true';
                var gridMD = obterGridSelecaoManutencaoDatas();
                if (gridMD) {
                    var chk = gridMD.down ? gridMD.down('#chkPesquisarDocAuxSomente') : null;
                    if (chk) isDocAuxAtivo = !!chk.getValue();
                }

                var tamPagina = 30;
                if (gridMD && gridMD.pageSize) {
                    tamPagina = gridMD.pageSize;
                } else {
                    var valSalvo = parseInt(sessionStorage.getItem('MANUTENCAO_DATAS_PAGE_SIZE') || localStorage.getItem('MANUTENCAO_DATAS_PAGE_SIZE'), 10);
                    if ([30, 50, 100, 150, 200, 500].indexOf(valSalvo) !== -1) tamPagina = valSalvo;
                }

                if (options.params) {
                    options.params.limit = tamPagina;

                    if (isDocAuxAtivo && options.params.valorDeConsulta) {
                        var termo = String(options.params.valorDeConsulta).trim();
                        options._filtroDocAuxOriginal = termo;

                        var matchNumeroFinal = termo.match(/(?:-|\s|^)(\d+)$/);
                        if (matchNumeroFinal && matchNumeroFinal[1] && termo.indexOf('-') !== -1) {
                            options.params.valorDeConsulta = matchNumeroFinal[1];
                        }
                    }
                }
            }

            if (options.url && options.url.indexOf('ListarProducao') !== -1) {
                const bloquearAutoRefresh = (sessionStorage.getItem('BLOQUEAR_AUTO_REFRESH_OP') ?? localStorage.getItem('BLOQUEAR_AUTO_REFRESH_OP')) !== 'false';
                
                const agora = Date.now();
                const ultimoCliqueStorage = parseInt(sessionStorage.getItem('ULTIMO_CLIQUE_MANUAL') || '0', 10);
                const ultimoMomento = Math.max(
                    ultimoMomentoUsuario, 
                    ultimoCliqueStorage,
                    window.__ERP_ULTIMO_ACAO_EXECUTAR || 0,
                    window.__ERP_EM_OPERACAO_PRODUCAO || 0
                );
                // Margem segura de 5 minutos para processamentos demorados do ERP (ex: autorização de 50+ OPs)
                const isAcaoManual = (agora - ultimoMomento < 300000);

                if (primeiraCargaFeita && !isAcaoManual && bloquearAutoRefresh) {
                    console.info('[ERP Optimizer] Auto-refresh em segundo plano prevenido de forma segura.');
                    var respVazia = {
                        responseText: window.Ext.encode({ total: 0, registros: [] }),
                        status: 200,
                        statusText: "OK"
                    };
                    setTimeout(function() {
                        try {
                            if (typeof options.success === 'function') options.success.call(options.scope || window, respVazia, options);
                            if (typeof options.callback === 'function') options.callback.call(options.scope || window, options, true, respVazia);
                        } catch(e) {}
                    }, 10);
                    return false;
                }

                const isModoLiberacaoAtivo = (sessionStorage.getItem('MODO_LIBERACAO_OP') || localStorage.getItem('MODO_LIBERACAO_OP')) === 'true';

                if (!options.params) {
                    options.params = {};
                }

                options.timeout = 180000;

                var start = parseInt(options.params.start, 10) || 0;
                var page = parseInt(options.params.page, 10) || 1;

                // 1. Paginação instantânea em cache:
                // Se Modo Liberação estiver ativo e o usuário estiver navegando para Página 2, 3, etc.
                if (isModoLiberacaoAtivo && window.__ERP_CACHE_LIBERACAO && Array.isArray(window.__ERP_CACHE_LIBERACAO.registros) && (start > 0 || page > 1)) {
                    var idadeCache = Date.now() - (window.__ERP_CACHE_LIBERACAO.timestamp || 0);
                    if (idadeCache < 180000) { // Cache válido por 3 minutos
                        var todos = window.__ERP_CACHE_LIBERACAO.registros;
                        var tamanhoPagina = 500;
                        var fatiados = todos.slice(start, start + tamanhoPagina);
                        
                        var respostaSimulada = {
                            total: todos.length,
                            registros: fatiados
                        };
                        
                        var objResposta = {
                            responseText: window.Ext.encode(respostaSimulada),
                            status: 200,
                            statusText: "OK"
                        };
                        
                        setTimeout(function() {
                            try {
                                if (typeof options.success === 'function') {
                                    options.success.call(options.scope || window, objResposta, options);
                                }
                                if (typeof options.callback === 'function') {
                                    options.callback.call(options.scope || window, options, true, objResposta);
                                }
                            } catch(err) {
                                console.error('[ERP Optimizer] Erro na paginação em cache:', err);
                            }
                        }, 10);
                        
                        return false; // Evita requisição de rede repetida
                    }
                }

                // 2. Consulta ao Servidor:
                var limiteDesejado = isModoLiberacaoAtivo ? CHUNK_SIZE_SEGURO : 500;

                options.params.limit = limiteDesejado;
                options.params.pageSize = limiteDesejado;
                if (options.jsonData && typeof options.jsonData === 'object') {
                    options.jsonData.limit = limiteDesejado;
                }
                if (options.url && options.url.indexOf('limit=') !== -1) {
                    options.url = options.url.replace(/limit=\d+/, 'limit=' + limiteDesejado);
                }

                if (isModoLiberacaoAtivo) {
                    idBuscaAtual++;
                    options._ehPrimeiroChunkLiberacao = true;
                    removerBadgeProgresso();
                }

                try {
                    otimizarColunasDeTodosOsGrids();
                    var gridAtivo = obterGridProducaoAtivo();
                    if (gridAtivo) {
                        sincronizarGridPara500(gridAtivo);
                        otimizarColunasGrid(gridAtivo);
                    }
                } catch(e) {}
            }
        });

        window.Ext.Ajax.on('requestcomplete', function(connection, response, options) {
            if (options._ehChunkInterno) {
                return; // Chunk interno já tratado pelo callback
            }

            // Se terminou uma autorização de produção, fecha o popup e limpa qualquer máscara travada
            if (options.url && (options.url.indexOf('AutorizarProducao') !== -1 || options.url.indexOf('AutorizarProducaoAdministrativamente') !== -1)) {
                window.__ERP_EM_OPERACAO_PRODUCAO = Date.now();
                window.__ERP_ULTIMO_ACAO_EXECUTAR = Date.now();
                ultimoMomentoUsuario = Date.now();
                try {
                    sessionStorage.setItem('ULTIMO_CLIQUE_MANUAL', String(Date.now()));
                } catch(e) {}

                fecharPopupAutorizacaoProducao();
                setTimeout(fecharPopupAutorizacaoProducao, 30);
                setTimeout(fecharPopupAutorizacaoProducao, 120);
                setTimeout(fecharPopupAutorizacaoProducao, 350);
                setTimeout(fecharPopupAutorizacaoProducao, 800);
            }

            // Verifica se a resposta foi de AutorizarProducao e se retornou algum erro de MRP em 200
            tratarPossivelErroMRP(response, options);
            if (options && options.url && (options.url.indexOf('ManutencaoDeDatas') !== -1 || options.url.indexOf('ListarAlteracoes') !== -1)) {
                if (window.Ext && window.Ext.Msg && window.Ext.Msg.isVisible && window.Ext.Msg.isVisible()) {
                    window.Ext.Msg.hide();
                }
                var gridLog = window.Ext.ComponentQuery ? window.Ext.ComponentQuery.query('[itemid=listaDeLogDeManutencaoDeDatas]')[0] : null;
                if (gridLog) {
                    if (gridLog.loadMask && gridLog.loadMask.hide) gridLog.loadMask.hide();
                    var vl = gridLog.getView ? gridLog.getView() : null;
                    if (vl && vl.loadMask && vl.loadMask.hide) vl.loadMask.hide();
                }
            }

            if (options.url && options.url.indexOf('ListarProducao') !== -1) {
                primeiraCargaFeita = true;
                otimizarColunasDeTodosOsGrids();

                setTimeout(function() {
                    fecharPopupAutorizacaoProducao();
                    limparBotoesOrfaosDoTopo();
                    limparMascarasOrfas();
                    otimizarColunasDeTodosOsGrids();
                    var gridAtivo = obterGridProducaoAtivo();
                    if (gridAtivo) {
                        atualizarElementosDoGrid(gridAtivo);
                    }
                }, 100);

                const isModoLiberacaoAtivo = (sessionStorage.getItem('MODO_LIBERACAO_OP') || localStorage.getItem('MODO_LIBERACAO_OP')) === 'true';
                const ordenacaoData = sessionStorage.getItem('ORDENACAO_DATA_OP') || localStorage.getItem('ORDENACAO_DATA_OP') || 'padrao';
                var bloqueadas = obterOpsBloqueadasMRP();
                var temBloqueadas = Object.keys(bloqueadas).length > 0;
                
                if (isModoLiberacaoAtivo || ordenacaoData !== 'padrao' || temBloqueadas) {
                    try {
                        let dados = window.Ext.decode(response.responseText);
                        
                        if (dados && Array.isArray(dados.registros)) {
                            let totalOriginalBruto = dados.total || dados.registros.length;
                            let registrosProcessados = dados.registros;

                            // Filtra todas as operações bloqueadas por MRP salvas no localStorage
                            if (temBloqueadas) {
                                registrosProcessados = registrosProcessados.filter(item => !isOpBloqueadaMRP(item, bloqueadas));
                            }

                            // Filtra todas as OPs trazidas pelo primeiro chunk que não possuem dependências
                            if (isModoLiberacaoAtivo) {
                                registrosProcessados = registrosProcessados.filter(item => item && item.PossuiDependencia === false);
                            }

                            // Ordenação por data
                            if (ordenacaoData === 'desc' || ordenacaoData === 'asc') {
                                registrosProcessados.sort(function(a, b) {
                                    return compararValoresGridProducao(a, b, 'DataDeMovimentacao', ordenacaoData);
                                });
                            }

                            if (isModoLiberacaoAtivo) {
                                // Armazena em cache as OPs do primeiro lote
                                window.__ERP_CACHE_LIBERACAO = {
                                    timestamp: Date.now(),
                                    registros: registrosProcessados.slice(),
                                    totalBanco: totalOriginalBruto,
                                    carregando: totalOriginalBruto > CHUNK_SIZE_SEGURO
                                };

                                var tamanhoPagina = 500;
                                dados.total = registrosProcessados.length;
                                dados.registros = registrosProcessados.slice(0, tamanhoPagina);

                                response.responseText = window.Ext.encode(dados);

                                // Se o banco de dados tem mais registros do que o primeiro chunk seguro, busca o restante em paralelo sem bloquear a tela
                                if (totalOriginalBruto > CHUNK_SIZE_SEGURO) {
                                    atualizarBadgeProgresso(CHUNK_SIZE_SEGURO, totalOriginalBruto, registrosProcessados.length, false);
                                    var meuIdBusca = idBuscaAtual;
                                    setTimeout(function() {
                                        carregarRestanteChunksLiberacao(options, totalOriginalBruto, meuIdBusca);
                                    }, 40);
                                } else {
                                    mostrarToastNotificacao('<b>' + registrosProcessados.length + '</b> OPs sem dependência encontradas!');
                                }
                            } else {
                                window.__ERP_CACHE_LIBERACAO = null;
                                dados.registros = registrosProcessados;
                                dados.total = Math.max(0, totalOriginalBruto - (dados.registros.length < totalOriginalBruto ? (totalOriginalBruto - registrosProcessados.length) : 0));
                                response.responseText = window.Ext.encode(dados);
                            }

                            if (registrosProcessados.length === 0) {
                                setTimeout(function() {
                                    if (typeof desmarcarCabecalhoSelecaoGrid === 'function') {
                                        desmarcarCabecalhoSelecaoGrid();
                                    }
                                }, 50);
                            }
                        }
                    } catch (e) {
                        console.error("[ERP Optimizer] Erro ao tentar processar pacote do servidor.", e);
                    }
                } else {
                    window.__ERP_CACHE_LIBERACAO = null;
                }
            }

            if (options.url && options.url.indexOf('ManutencaoDeDatas/Listar') !== -1) {
                try {
                    var isDocAuxAtivo = (sessionStorage.getItem('PESQUISAR_DOC_AUX_SOMENTE') || localStorage.getItem('PESQUISAR_DOC_AUX_SOMENTE')) === 'true';
                    var gridMD = obterGridSelecaoManutencaoDatas();
                    if (gridMD) {
                        var chk = gridMD.down ? gridMD.down('#chkPesquisarDocAuxSomente') : null;
                        if (chk) isDocAuxAtivo = !!chk.getValue();
                        configurarGridSelecaoManutencaoDatas(gridMD);
                    }

                    var termoBusca = options._filtroDocAuxOriginal || (options.params && options.params.valorDeConsulta) || '';
                    if (!termoBusca && gridMD) {
                        var sf = gridMD.textField || (gridMD.down ? gridMD.down('[name=searchField]') : null);
                        if (sf && sf.getValue) termoBusca = sf.getValue();
                    }

                    if (isDocAuxAtivo && termoBusca && termoBusca.trim() !== '') {
                        var t = termoBusca.trim().toUpperCase();
                        var jsonRes = window.Ext.decode(response.responseText);
                        if (jsonRes && Array.isArray(jsonRes.registros)) {
                            var totalOriginal = jsonRes.total || jsonRes.registros.length;
                            var filtrados = jsonRes.registros.filter(function(reg) {
                                return registroCorrespondeDocOuAux(reg, t);
                            });

                            if (filtrados.length !== jsonRes.registros.length) {
                                var diff = jsonRes.registros.length - filtrados.length;
                                jsonRes.registros = filtrados;
                                jsonRes.total = Math.max(filtrados.length, totalOriginal - diff);
                                response.responseText = window.Ext.encode(jsonRes);
                            }
                        }
                    }
                } catch(e) {
                    console.error("[ERP Optimizer] Erro ao processar Manutenção de Datas/Listar:", e);
                }
            }
        });

        window.Ext.Ajax.on('requestexception', function(connection, response, options) {
            if (options.url && (options.url.indexOf('AutorizarProducao') !== -1 || options.url.indexOf('AutorizarProducaoAdministrativamente') !== -1)) {
                fecharPopupAutorizacaoProducao();
                setTimeout(fecharPopupAutorizacaoProducao, 30);
                setTimeout(fecharPopupAutorizacaoProducao, 120);
                setTimeout(fecharPopupAutorizacaoProducao, 350);
            }
            tratarPossivelErroMRP(response, options);
        });

        // Função global chamada pelo Popup da extensão ou atalhos
        window.__ERP_FINALIZAR_EM_LOTE = function() {
            dispararFluxoFinalizacaoLote();
        };

        // Ouvinte de sincronização imediata com o Popup da extensão
        var sincronizarComPopup = function() {
            try {
                var grid = obterGridProducaoAtivo();
                if (grid) {
                    var chk = grid.down ? grid.down('#chkModoLiberacaoTop') : null;
                    if (chk) {
                        var isModoAtivo = (sessionStorage.getItem('MODO_LIBERACAO_OP') || localStorage.getItem('MODO_LIBERACAO_OP')) === 'true';
                        if (chk.getValue() !== isModoAtivo) {
                            chk.suspendEvents(false);
                            chk.setValue(isModoAtivo);
                            chk.resumeEvents();
                        }
                    }
                }
            } catch(e) {}
        };
        window.addEventListener('erp_modo_liberacao_alterado', sincronizarComPopup);
        
        console.info("[ERP Optimizer] Extensão carregada com sucesso! Limite 500, Detecção Multi-Camadas e Finalização com Confirmação ativas.");
    }
}, 50);