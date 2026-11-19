const API_URL = "http://localhost:5207";

const estado = {
    paginaAtual: 1,
    totalPaginas: 1,
    ordem: "DataCadastro",
    direcao: "DESC",
    carregando: false
};

const $ = id => document.getElementById(id);

const formulario = $("formulario");
const formLembrete = $("formLembrete");
const tituloFormulario = $("tituloFormulario");
const lembreteId = $("lembreteId");
const descricao = $("descricao");
const erroDescricao = $("erroDescricao");
const contador = $("contador");
const btnSalvar = $("btnSalvar");

const formFiltro = $("formFiltro");
const filtroDescricao = $("filtroDescricao");
const filtroCadastroInicial = $("filtroCadastroInicial");
const filtroCadastroFinal = $("filtroCadastroFinal");
const filtroAtualizacaoInicial = $("filtroAtualizacaoInicial");
const filtroAtualizacaoFinal = $("filtroAtualizacaoFinal");
const erroFiltro = $("erroFiltro");
const tamanhoPagina = $("tamanhoPagina");

const listaLembretes = $("listaLembretes");
const mensagemVazia = $("mensagemVazia");
const mensagemVaziaDetalhe = $("mensagemVaziaDetalhe");
const carregando = $("carregando");
const totalRegistros = $("totalRegistros");
const intervaloRegistros = $("intervaloRegistros");
const numerosPagina = $("numerosPagina");

const btnPrimeira = $("btnPrimeira");
const btnAnterior = $("btnAnterior");
const btnProximo = $("btnProximo");
const btnUltima = $("btnUltima");

const alertaApi = $("alertaApi");
const statusApi = $("statusApi");
const statusApiTexto = $("statusApiTexto");

const modalConfirmar = $("modalConfirmar");
const textoConfirmar = $("textoConfirmar");

document.addEventListener("DOMContentLoaded", () => {
    $("apiUrlTexto").textContent = API_URL;
    atualizarIndicadoresOrdenacao();
    filtrarLembretes();
});

async function requisicao(caminho, opcoes = {}) {
    let response;

    try {
        response = await fetch(`${API_URL}${caminho}`, opcoes);
    } catch (erroRede) {
        definirStatusApi(false);
        const erro = new Error("Falha de comunicação com a API. Verifique se ela está em execução.");
        erro.rede = true;
        throw erro;
    }

    definirStatusApi(true);

    if (!response.ok) {
        let detalhe = "";
        try {
            detalhe = (await response.text()).replace(/^"|"$/g, "");
        } catch {}

        const mensagens = {
            400: detalhe || "Requisição inválida.",
            404: "Registro não encontrado.",
            500: "Erro interno na API."
        };

        const erro = new Error(mensagens[response.status] || `Erro ${response.status} na API.`);
        erro.status = response.status;
        throw erro;
    }

    return response;
}

function definirStatusApi(online) {
    statusApi.classList.toggle("online", online);
    statusApi.classList.toggle("offline", !online);
    statusApiTexto.textContent = online ? "API online" : "API offline";
    alertaApi.classList.toggle("hidden", online);
}

function montarParametros() {
    const params = new URLSearchParams();

    params.append("NumeroPagina", estado.paginaAtual);
    params.append("TamanhoPagina", tamanhoPagina.value);
    params.append("Ordem", estado.ordem);
    params.append("Direcao", estado.direcao);

    const opcionais = {
        Descricao: filtroDescricao.value.trim(),
        DataCadastroInicial: filtroCadastroInicial.value,
        DataCadastroFinal: filtroCadastroFinal.value,
        DataAtualizacaoInicial: filtroAtualizacaoInicial.value,
        DataAtualizacaoFinal: filtroAtualizacaoFinal.value
    };

    Object.entries(opcionais).forEach(([chave, valor]) => {
        if (valor) params.append(chave, valor);
    });

    return params;
}

function filtrosAtivos() {
    return [filtroDescricao, filtroCadastroInicial, filtroCadastroFinal, filtroAtualizacaoInicial, filtroAtualizacaoFinal]
        .some(campo => campo.value.trim() !== "");
}

async function filtrarLembretes() {
    if (!validarFiltros()) return;

    estado.carregando = true;
    carregando.classList.remove("hidden");
    mensagemVazia.classList.add("hidden");

    try {
        const params = montarParametros();
        console.log("GET /lembretes/filtro ->", params.toString());

        const response = await requisicao(`/lembretes/filtro?${params}`);
        const resultado = await response.json();

        const total = resultado.total;
        const tamanho = resultado.tamanhoPagina;
        estado.totalPaginas = Math.max(1, Math.ceil(total / tamanho));

        if (resultado.lembretes.length === 0 && total > 0 && estado.paginaAtual > estado.totalPaginas) {
            estado.paginaAtual = estado.totalPaginas;
            return filtrarLembretes();
        }

        renderizarLembretes(resultado.lembretes);
        renderizarPaginacao(total, resultado.numeroPagina, tamanho, resultado.lembretes.length);

    } catch (error) {
        console.error(error);
        listaLembretes.innerHTML = "";
        mensagemVazia.classList.remove("hidden");
        mensagemVaziaDetalhe.textContent = error.rede
            ? "Não foi possível carregar os dados: a API não respondeu."
            : error.message;
        renderizarPaginacao(0, 1, Number(tamanhoPagina.value), 0);
        mostrarToast(error.message || "Erro ao realizar o filtro.", "erro");
    } finally {
        estado.carregando = false;
        carregando.classList.add("hidden");
    }
}

function validarFiltros() {
    erroFiltro.textContent = "";
    [filtroCadastroInicial, filtroCadastroFinal, filtroAtualizacaoInicial, filtroAtualizacaoFinal]
        .forEach(c => c.classList.remove("invalido"));

    const pares = [
        [filtroCadastroInicial, filtroCadastroFinal, "cadastro"],
        [filtroAtualizacaoInicial, filtroAtualizacaoFinal, "atualização"]
    ];

    for (const [ini, fim, nome] of pares) {
        if (ini.value && fim.value && ini.value > fim.value) {
            ini.classList.add("invalido");
            fim.classList.add("invalido");
            erroFiltro.textContent = `A data inicial de ${nome} não pode ser maior que a final.`;
            mostrarToast(erroFiltro.textContent, "aviso");
            return false;
        }
    }

    return true;
}

async function imprimirLembretes() {
    if (!validarFiltros()) return;

    const btn = $("btnImprimir");
    btn.disabled = true;

    try {
        const response = await requisicao(`/lembretes/imprimir?${montarParametros()}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "relatorio-lembretes.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);

        mostrarToast("Relatório PDF gerado com sucesso!", "sucesso");
    } catch (error) {
        console.error(error);
        mostrarToast(error.message || "Erro ao gerar o relatório.", "erro");
    } finally {
        btn.disabled = false;
    }
}

async function criarLembrete() {
    try {
        await requisicao("/lembretes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ descricao: descricao.value.trim() })
        });

        mostrarToast("Lembrete criado com sucesso!", "sucesso");
        fecharFormulario();

        estado.paginaAtual = 1;
        await filtrarLembretes();
    } catch (error) {
        console.error(error);
        mostrarToast(`Não foi possível criar o lembrete. ${error.message}`, "erro");
    }
}

async function buscarLembrete(id) {
    try {
        const response = await requisicao(`/lembretes/${encodeURIComponent(id)}`);
        const lembrete = await response.json();

        abrirFormulario("Editar lembrete", lembrete.id, lembrete.descricao);
    } catch (error) {
        console.error(error);
        mostrarToast(`Não foi possível buscar o lembrete. ${error.message}`, "erro");
    }
}

async function atualizarLembrete() {
    try {
        await requisicao(`/lembretes/${encodeURIComponent(lembreteId.value)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ descricao: descricao.value.trim() })
        });

        mostrarToast("Lembrete atualizado com sucesso!", "sucesso");
        fecharFormulario();
        await filtrarLembretes();
    } catch (error) {
        console.error(error);
        mostrarToast(`Não foi possível atualizar o lembrete. ${error.message}`, "erro");
    }
}

async function excluirLembrete(id, texto) {
    const confirmou = await confirmar(texto);
    if (!confirmou) return;

    try {
        await requisicao(`/lembretes/${encodeURIComponent(id)}`, { method: "DELETE" });

        mostrarToast("Lembrete excluído com sucesso!", "sucesso");
        await filtrarLembretes();
    } catch (error) {
        console.error(error);
        mostrarToast(`Não foi possível excluir o lembrete. ${error.message}`, "erro");
    }
}

function renderizarLembretes(lembretes) {
    listaLembretes.innerHTML = "";

    if (!lembretes || lembretes.length === 0) {
        mensagemVazia.classList.remove("hidden");
        mensagemVaziaDetalhe.textContent = filtrosAtivos()
            ? "Nenhum resultado para os filtros informados. Tente ajustá-los ou limpe os filtros."
            : "Você ainda não tem lembretes. Clique em “+ Novo lembrete” para começar.";
        return;
    }

    mensagemVazia.classList.add("hidden");

    lembretes.forEach(lembrete => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td class="td-descricao" data-label="Descrição">${escaparHtml(lembrete.descricao)}</td>
            <td class="td-data" data-label="Cadastro">${formatarData(lembrete.dataCadastro)}</td>
            <td class="td-data" data-label="Atualização">${formatarData(lembrete.dataAtualizacao)}</td>
            <td data-label="Status">
                <span class="status ${lembrete.isAtivo ? "status-ativo" : "status-inativo"}">
                    ${lembrete.isAtivo ? "Ativo" : "Inativo"}
                </span>
            </td>
            <td class="td-acoes">
                <div class="actions">
                    <button type="button" class="btn-icone editar">✎ Editar</button>
                    <button type="button" class="btn-icone excluir">🗑 Excluir</button>
                </div>
            </td>
        `;

        tr.querySelector(".editar").addEventListener("click", () => buscarLembrete(lembrete.id));
        tr.querySelector(".excluir").addEventListener("click", () => excluirLembrete(lembrete.id, lembrete.descricao));

        listaLembretes.appendChild(tr);
    });
}

function renderizarPaginacao(total, pagina, tamanho, quantidadeNaPagina) {
    totalRegistros.textContent = `${total} ${total === 1 ? "registro" : "registros"}`;

    if (total === 0) {
        intervaloRegistros.textContent = "Nenhum registro para exibir";
    } else {
        const inicio = (pagina - 1) * tamanho + 1;
        const fim = inicio + quantidadeNaPagina - 1;
        intervaloRegistros.textContent = `Mostrando ${inicio}–${fim} de ${total} · página ${pagina} de ${estado.totalPaginas}`;
    }

    btnPrimeira.disabled = btnAnterior.disabled = pagina <= 1;
    btnProximo.disabled = btnUltima.disabled = pagina >= estado.totalPaginas;

    numerosPagina.innerHTML = "";
    const paginas = calcularPaginasVisiveis(pagina, estado.totalPaginas);

    paginas.forEach(p => {
        if (p === "…") {
            const span = document.createElement("span");
            span.className = "reticencias";
            span.textContent = "…";
            numerosPagina.appendChild(span);
            return;
        }

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-pag" + (p === pagina ? " atual" : "");
        btn.textContent = p;
        btn.setAttribute("aria-label", `Página ${p}`);
        if (p === pagina) btn.setAttribute("aria-current", "page");
        btn.addEventListener("click", () => irParaPagina(p));
        numerosPagina.appendChild(btn);
    });
}

function calcularPaginasVisiveis(atual, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const paginas = [1];
    const inicio = Math.max(2, atual - 1);
    const fim = Math.min(total - 1, atual + 1);

    if (inicio > 2) paginas.push("…");
    for (let i = inicio; i <= fim; i++) paginas.push(i);
    if (fim < total - 1) paginas.push("…");
    paginas.push(total);

    return paginas;
}

$("btnImprimir").addEventListener("click", imprimirLembretes);
$("btnNovo").addEventListener("click", () => abrirFormulario("Novo lembrete", "", ""));
$("btnCancelar").addEventListener("click", fecharFormulario);
$("btnTentarNovamente").addEventListener("click", filtrarLembretes);

formulario.addEventListener("click", e => { if (e.target === formulario) fecharFormulario(); });

descricao.addEventListener("input", () => {
    contador.textContent = `${descricao.value.length}/500`;
    if (descricao.value.trim()) limparErroDescricao();
});

formLembrete.addEventListener("submit", async event => {
    event.preventDefault();

    if (!descricao.value.trim()) {
        descricao.classList.add("invalido");
        erroDescricao.textContent = "A descrição é obrigatória.";
        mostrarToast("Preencha o campo obrigatório: descrição.", "aviso");
        descricao.focus();
        return;
    }

    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando…";

    try {
        if (lembreteId.value) {
            await atualizarLembrete();
        } else {
            await criarLembrete();
        }
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar";
    }
});

function abrirFormulario(titulo, id, texto) {
    tituloFormulario.textContent = titulo;
    lembreteId.value = id;
    descricao.value = texto;
    contador.textContent = `${texto.length}/500`;
    limparErroDescricao();

    formulario.classList.remove("hidden");
    descricao.focus();
}

function fecharFormulario() {
    formulario.classList.add("hidden");
    formLembrete.reset();
    lembreteId.value = "";
    limparErroDescricao();
}

function limparErroDescricao() {
    descricao.classList.remove("invalido");
    erroDescricao.textContent = "";
}

function confirmar(texto) {
    return new Promise(resolve => {
        textoConfirmar.innerHTML = `O lembrete <strong>“${escaparHtml(texto)}”</strong> será removido da lista. Deseja continuar?`;
        modalConfirmar.classList.remove("hidden");
        $("btnConfirmarSim").focus();

        const finalizar = resposta => {
            modalConfirmar.classList.add("hidden");
            $("btnConfirmarSim").onclick = $("btnConfirmarNao").onclick = modalConfirmar.onclick = null;
            resolve(resposta);
        };

        $("btnConfirmarSim").onclick = () => finalizar(true);
        $("btnConfirmarNao").onclick = () => finalizar(false);
        modalConfirmar.onclick = e => { if (e.target === modalConfirmar) finalizar(false); };
    });
}

document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!modalConfirmar.classList.contains("hidden")) $("btnConfirmarNao").click();
    else if (!formulario.classList.contains("hidden")) fecharFormulario();
});

formFiltro.addEventListener("submit", event => {
    event.preventDefault();
    estado.paginaAtual = 1;
    filtrarLembretes();
});

$("btnLimpar").addEventListener("click", () => {
    formFiltro.reset();
    erroFiltro.textContent = "";
    estado.paginaAtual = 1;
    filtrarLembretes();
    mostrarToast("Filtros limpos.", "info");
});

tamanhoPagina.addEventListener("change", () => {
    estado.paginaAtual = 1;
    filtrarLembretes();
});

document.querySelectorAll(".ordenar").forEach(botao => {
    botao.addEventListener("click", () => {
        const campo = botao.dataset.campo;

        if (estado.ordem === campo) {
            estado.direcao = estado.direcao === "ASC" ? "DESC" : "ASC";
        } else {
            estado.ordem = campo;
            estado.direcao = campo === "Descricao" ? "ASC" : "DESC";
        }

        estado.paginaAtual = 1;
        atualizarIndicadoresOrdenacao();
        filtrarLembretes();
    });
});

function atualizarIndicadoresOrdenacao() {
    document.querySelectorAll(".ordenar").forEach(botao => {
        const ativo = botao.dataset.campo === estado.ordem;
        botao.classList.toggle("ativo", ativo);
        botao.dataset.direcao = ativo ? estado.direcao : "";
        botao.closest("th").setAttribute("aria-sort",
            ativo ? (estado.direcao === "ASC" ? "ascending" : "descending") : "none");
    });
}

function irParaPagina(pagina) {
    if (estado.carregando) return;
    pagina = Math.min(Math.max(1, pagina), estado.totalPaginas);
    if (pagina === estado.paginaAtual) return;

    estado.paginaAtual = pagina;
    filtrarLembretes();
}

btnPrimeira.addEventListener("click", () => irParaPagina(1));
btnAnterior.addEventListener("click", () => irParaPagina(estado.paginaAtual - 1));
btnProximo.addEventListener("click", () => irParaPagina(estado.paginaAtual + 1));
btnUltima.addEventListener("click", () => irParaPagina(estado.totalPaginas));

function formatarData(data) {
    if (!data) return "-";

    return new Date(data).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

function escaparHtml(texto) {
    const div = document.createElement("div");
    div.textContent = texto ?? "";
    return div.innerHTML;
}

const iconesToast = { sucesso: "✔", erro: "✖", aviso: "!", info: "i" };

function mostrarToast(mensagem, tipo = "info") {
    const toast = document.createElement("div");
    toast.className = `toast ${tipo}`;
    toast.setAttribute("role", tipo === "erro" ? "alert" : "status");
    toast.innerHTML = `<strong>${iconesToast[tipo] || ""}</strong><span class="toast-texto"></span>`;
    toast.querySelector(".toast-texto").textContent = mensagem;

    $("toasts").appendChild(toast);

    setTimeout(() => {
        toast.classList.add("saindo");
        setTimeout(() => toast.remove(), 300);
    }, tipo === "erro" ? 5000 : 3200);
}
