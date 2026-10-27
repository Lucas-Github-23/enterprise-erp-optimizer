function isErpTab(tab) {
    if (!tab || !tab.url) return false;
    const url = tab.url.toLowerCase();
    return url.includes('aplicacao') || url.includes('erp') || url.includes('sistema') || url.includes('producao');
}

document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggleLiberacao');
    const toggleBloquearAutoRefresh = document.getElementById('toggleBloquearAutoRefresh');
    const selectOrdenacao = document.getElementById('selectOrdenacao');
    const inputMotivoPadrao = document.getElementById('inputMotivoPadrao');
    const btnFinalizarSelecionadasPopup = document.getElementById('btnFinalizarSelecionadasPopup');

    const grupoBloqueadasMRP = document.getElementById('grupoBloqueadasMRP');
    const lblContadorMRP = document.getElementById('lblContadorMRP');
    const btnVerMRP = document.getElementById('btnVerMRP');
    const btnLimparMRP = document.getElementById('btnLimparMRP');
    const containerListaMRP = document.getElementById('containerListaMRP');

    let listaOpsBloqueadasCache = [];

    function renderizarListaMRP(itens) {
        listaOpsBloqueadasCache = itens || [];
        if (!containerListaMRP) return;

        if (listaOpsBloqueadasCache.length === 0) {
            containerListaMRP.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 11px; padding: 12px 0;">Nenhuma OP bloqueada no momento.</div>';
            if (lblContadorMRP) lblContadorMRP.innerText = '0 ocultadas';
            if (btnLimparMRP) btnLimparMRP.style.display = 'none';
            return;
        }

        if (btnLimparMRP) btnLimparMRP.style.display = 'inline-block';
        if (lblContadorMRP) {
            lblContadorMRP.innerText = listaOpsBloqueadasCache.length + (listaOpsBloqueadasCache.length === 1 ? ' operação ocultada' : ' operações ocultadas');
        }

        let html = '';
        listaOpsBloqueadasCache.forEach(item => {
            const id = item.id || '';
            const orp = item.numeroCompletoDocumento || (item.numeroDoDocumento ? ('ORP ' + item.numeroDoDocumento) : 'ORP');
            const itemSub = (item.numeroItem != null ? item.numeroItem : '') + (item.numeroSubItem != null && item.numeroSubItem > 0 ? ('.' + item.numeroSubItem) : '');
            const prodDesc = item.descricaoProduto || '';
            const prodRef = item.idRefProduto || '';
            const tituloProd = prodRef ? (prodRef + ' - ' + prodDesc) : (prodDesc || 'Produto sem descrição');
            const operacao = item.operacao || item.codigoOperacao || 'Operação';
            
            let dataStr = '';
            if (item.dataBloqueio) {
                try {
                    const d = new Date(item.dataBloqueio);
                    const dia = String(d.getDate()).padStart(2, '0');
                    const mes = String(d.getMonth() + 1).padStart(2, '0');
                    const hora = String(d.getHours()).padStart(2, '0');
                    const min = String(d.getMinutes()).padStart(2, '0');
                    dataStr = `${dia}/${mes} ${hora}:${min}`;
                } catch(e) {}
            }

            html += `
                <div class="card-op-bloqueada" data-id="${id}">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <span class="op-tag-orp">${orp}</span>
                            ${itemSub ? `<span class="op-tag-item">Item ${itemSub}</span>` : ''}
                        </div>
                        <button type="button" class="btn-desbloquear-item" data-id="${id}" title="Desbloquear e reexibir esta OP">
                            Reexibir
                        </button>
                    </div>
                    <div class="op-produto-titulo" title="${tituloProd}">
                        ${tituloProd}
                    </div>
                    <div class="op-detalhes-sub">
                        <span>Op: <b>${operacao}</b></span>
                        ${dataStr ? `<span style="font-size: 10px; color: #94a3b8;">${dataStr}</span>` : ''}
                    </div>
                </div>
            `;
        });

        containerListaMRP.innerHTML = html;

        // Ouvintes individuais de desbloqueio por item
        containerListaMRP.querySelectorAll('.btn-desbloquear-item').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const idParaDesbloquear = e.currentTarget.getAttribute('data-id');
                if (!idParaDesbloquear) return;

                let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (isErpTab(tab)) {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        world: "MAIN",
                        func: (idAlvo) => {
                            try {
                                var raw = localStorage.getItem('ERP_BLOQUEADAS_MRP');
                                if (raw) {
                                    var mapa = JSON.parse(raw);
                                    if (mapa && mapa[idAlvo]) {
                                        delete mapa[idAlvo];
                                        localStorage.setItem('ERP_BLOQUEADAS_MRP', JSON.stringify(mapa));
                                    }
                                }
                                window.__ERP_CACHE_LIBERACAO = null;
                                if (typeof atualizarBadgeOpsBloqueadasMRP === 'function') {
                                    atualizarBadgeOpsBloqueadasMRP();
                                }
                                var grid = window.Ext ? window.Ext.ComponentQuery.query('ListViewDePainelDeControleDeProducao')[0] : null;
                                if (grid) {
                                    var pt = grid.down ? grid.down('pagingtoolbar') : null;
                                    if (pt) pt.doRefresh();
                                    else if (grid.getStore) grid.getStore().load();
                                }
                                if (typeof mostrarToastNotificacao === 'function') {
                                    mostrarToastNotificacao('✔ Operação desbloqueada! A listagem foi atualizada.');
                                }
                            } catch(err) {}
                        },
                        args: [idParaDesbloquear]
                    });

                    listaOpsBloqueadasCache = listaOpsBloqueadasCache.filter(op => op.id !== idParaDesbloquear);
                    renderizarListaMRP(listaOpsBloqueadasCache);

                    if (listaOpsBloqueadasCache.length === 0) {
                        grupoBloqueadasMRP.style.display = 'none';
                    }
                }
            });
        });
    }

    chrome.storage.local.get(['modoLiberacao', 'ordenacaoData', 'bloquearAutoRefresh', 'motivoPadrao'], (result) => {
        toggle.checked = !!result.modoLiberacao;
        toggleBloquearAutoRefresh.checked = result.bloquearAutoRefresh !== false;
        inputMotivoPadrao.value = result.motivoPadrao || '55';

        if (result.ordenacaoData) {
            selectOrdenacao.value = result.ordenacaoData;
        }

        // Sincroniza com o estado atual da aba ativa do ERP
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs[0] && isErpTab(tabs[0])) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    world: "MAIN",
                    func: () => {
                        var modo = (sessionStorage.getItem('MODO_LIBERACAO_OP') || localStorage.getItem('MODO_LIBERACAO_OP')) === 'true';
                        var itens = [];
                        try {
                            var raw = localStorage.getItem('ERP_BLOQUEADAS_MRP');
                            if (raw) {
                                var obj = JSON.parse(raw);
                                for (var k in obj) {
                                    if (obj.hasOwnProperty(k) && obj[k]) {
                                        itens.push(obj[k]);
                                    }
                                }
                            }
                        } catch(e) {}
                        return { modoLiberacao: modo, itensBloqueados: itens };
                    }
                }, (results) => {
                    if (results && results[0] && results[0].result) {
                        var res = results[0].result;
                        if (typeof res.modoLiberacao === 'boolean') {
                            toggle.checked = res.modoLiberacao;
                            chrome.storage.local.set({ modoLiberacao: res.modoLiberacao });
                        }
                        if (res.itensBloqueados && Array.isArray(res.itensBloqueados)) {
                            listaOpsBloqueadasCache = res.itensBloqueados;
                            if (lblContadorMRP) {
                                lblContadorMRP.innerText = res.itensBloqueados.length + (res.itensBloqueados.length === 1 ? ' operação ocultada' : ' operações ocultadas');
                            }
                            if (btnLimparMRP) {
                                btnLimparMRP.style.display = res.itensBloqueados.length > 0 ? 'inline-block' : 'none';
                            }
                            if (containerListaMRP && containerListaMRP.style.display !== 'none') {
                                renderizarListaMRP(listaOpsBloqueadasCache);
                            }
                        }
                    }
                });
            }
        });
    });

    async function aplicarConfiguracaoNaAba(chave, valor, recarregarGrid = true) {
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (isErpTab(tab)) {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: "MAIN",
                func: (chaveStorage, valorStorage, deveRecarregar) => {
                    sessionStorage.setItem(chaveStorage, valorStorage);
                    localStorage.setItem(chaveStorage, valorStorage);
                    sessionStorage.setItem('ULTIMO_CLIQUE_MANUAL', Date.now());
                    window.__ERP_CACHE_LIBERACAO = null;

                    try {
                        window.dispatchEvent(new CustomEvent('erp_modo_liberacao_alterado', { 
                            detail: { chave: chaveStorage, valor: valorStorage } 
                        }));

                    } catch(e) {}

                    if (deveRecarregar && window.Ext) {
                        var grid = window.Ext.ComponentQuery.query('ListViewDePainelDeControleDeProducao')[0];
                        if (grid) {
                            var barraPaginacao = grid.down('pagingtoolbar');
                            if (barraPaginacao) {
                                barraPaginacao.doRefresh();
                            } else {
                                grid.getStore().loadPage(1);
                            }
                        }
                    }
                },
                args: [chave, String(valor), recarregarGrid]
            });
        }
    }

    toggle.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        chrome.storage.local.set({ modoLiberacao: isChecked });
        aplicarConfiguracaoNaAba('MODO_LIBERACAO_OP', isChecked, true);
    });

    toggleBloquearAutoRefresh.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        chrome.storage.local.set({ bloquearAutoRefresh: isChecked });
        aplicarConfiguracaoNaAba('BLOQUEAR_AUTO_REFRESH_OP', isChecked, false);
    });

    selectOrdenacao.addEventListener('change', (e) => {
        const valor = e.target.value;
        chrome.storage.local.set({ ordenacaoData: valor });
        aplicarConfiguracaoNaAba('ORDENACAO_DATA_OP', valor, true);
    });

    inputMotivoPadrao.addEventListener('change', (e) => {
        const valor = e.target.value.trim() || '55';
        chrome.storage.local.set({ motivoPadrao: valor });
        aplicarConfiguracaoNaAba('MOTIVO_PADRAO_OP', valor, false);
    });

    btnFinalizarSelecionadasPopup.addEventListener('click', async () => {
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (isErpTab(tab)) {
            const motivo = inputMotivoPadrao.value.trim() || '55';
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: "MAIN",
                func: (mot) => {
                    const fnFinalizar = window.__ERP_FINALIZAR_EM_LOTE;
                    if (typeof fnFinalizar === 'function') {
                        fnFinalizar(mot);
                    } else {
                        alert("Painel de Controle de Produção não encontrado. Abra a tela de produção e tente novamente.");
                    }
                },
                args: [motivo]
            });
            window.close(); // Fecha o popup para exibir a janela de confirmação de segurança na aba
        }
    });

    if (btnVerMRP) {
        btnVerMRP.addEventListener('click', () => {
            if (!containerListaMRP) return;
            const estaVisivel = containerListaMRP.style.display !== 'none';
            if (estaVisivel) {
                containerListaMRP.style.display = 'none';
                btnVerMRP.innerText = 'Ver Lista';
            } else {
                containerListaMRP.style.display = 'block';
                btnVerMRP.innerText = 'Ocultar';
                renderizarListaMRP(listaOpsBloqueadasCache);
            }
        });
    }

    if (btnLimparMRP) {
        btnLimparMRP.addEventListener('click', async () => {
            let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (isErpTab(tab)) {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    world: "MAIN",
                    func: () => {
                        localStorage.removeItem('ERP_BLOQUEADAS_MRP');
                        window.__ERP_CACHE_LIBERACAO = null;
                        if (typeof atualizarBadgeOpsBloqueadasMRP === 'function') {
                            atualizarBadgeOpsBloqueadasMRP();
                        }
                        var grid = window.Ext ? window.Ext.ComponentQuery.query('ListViewDePainelDeControleDeProducao')[0] : null;
                        if (grid) {
                            var pt = grid.down ? grid.down('pagingtoolbar') : null;
                            if (pt) pt.doRefresh();
                            else if (grid.getStore) grid.getStore().load();
                        }
                        if (typeof mostrarToastNotificacao === 'function') {
                            mostrarToastNotificacao('✔ Lista de OPs bloqueadas no MRP foi limpa!');
                        }
                    }
                });
                listaOpsBloqueadasCache = [];
                renderizarListaMRP([]);
                if (grupoBloqueadasMRP) {
                    grupoBloqueadasMRP.style.display = 'none';
                }
            }
        });
    }
});