# Bloco de Notas — Lembretes (Programação III · UMFG 2026)

Aplicação de lembretes com **front-end em HTML/CSS/JavaScript puro** consumindo uma **Minimal API em .NET 8 + MySQL**.
Baseada nos projetos do professor:

- API — <https://github.com/leicam/umfg-programacao-iii-minimal-api-2026>
- Front-end — <https://github.com/leicam/umfg-programacao-iii-front-end-2026>

```
.
├── api/                 # Minimal API (.NET 8, EF Core, MySQL, QuestPDF)
├── front/               # index.html, css/style.css, js/app.js
└── docker-compose.yml   # MySQL 8 para desenvolvimento
```

## Como executar

1. **Banco de dados** (Docker):
   ```bash
   docker compose up -d
   ```
   As migrations são aplicadas automaticamente na primeira requisição.

2. **API** (perfil `http`, porta 5207):
   ```bash
   cd api/umfg.programacaoiii.minimalapi.2026
   dotnet run --launch-profile http
   ```

3. **Front-end**: sirva a pasta `front/` com qualquer servidor estático
   (ex.: extensão *Live Server* do VS Code → `http://127.0.0.1:5500`).
   A URL da API fica em `front/js/app.js` (`API_URL`).

> Para usar HTTPS (`https://localhost:7063`) execute `dotnet dev-certs https --trust`, rode com o perfil `https` e altere `API_URL`.

## Endpoints da API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/lembretes` | Lista todos os lembretes ativos |
| GET | `/lembretes/{id}` | Busca um lembrete pelo ID |
| GET | `/lembretes/filtro` | Lista com filtros, paginação e ordenação |
| GET | `/lembretes/imprimir` | Gera PDF com os mesmos parâmetros do filtro |
| POST | `/lembretes` | Cadastra (`{ "descricao": "..." }`) |
| PUT | `/lembretes/{id}` | Atualiza a descrição |
| DELETE | `/lembretes/{id}` | Exclusão lógica (`IsAtivo = false`) |

Parâmetros de `/lembretes/filtro` (query string, todos opcionais):
`NumeroPagina`, `TamanhoPagina`, `Ordem` (`Descricao`, `DataCadastro`, `DataAtualizacao`, `IsAtivo`),
`Direcao` (`ASC`/`DESC`), `Descricao`, `DataCadastroInicial`, `DataCadastroFinal`,
`DataAtualizacaoInicial`, `DataAtualizacaoFinal` (formato `yyyy-MM-dd`).

Exemplo:
```
GET /lembretes/filtro?NumeroPagina=2&TamanhoPagina=5&Ordem=Descricao&Direcao=ASC&Descricao=prova&DataCadastroInicial=2026-11-01
```

## Como o front-end conversa com a API

Todo acesso passa pela função `requisicao()` em `js/app.js`, que usa `fetch`:

- **GET** com `URLSearchParams` para montar a query string dos filtros (campos vazios não são enviados);
- **POST/PUT** com `Content-Type: application/json` e corpo `JSON.stringify({ descricao })`;
- **DELETE** sem corpo;
- falhas de rede (API fora do ar / CORS) e status HTTP de erro (400, 404, 500) viram mensagens amigáveis.

O estado da tela (página atual, ordem e direção) fica no objeto `estado`.

## CORS — por que é necessário

O navegador aplica a **Same-Origin Policy**: uma página só pode ler respostas de requisições feitas para a
**mesma origem** (protocolo + host + porta). O front roda em `http://127.0.0.1:5500` e a API em
`http://localhost:5207` — origens diferentes. Sem CORS, o navegador bloqueia a resposta (o erro aparece no console
como *“blocked by CORS policy”*), mesmo que a API tenha processado a requisição.

Para `PUT`, `DELETE` e `POST` com JSON, o navegador ainda envia antes uma requisição **preflight** (`OPTIONS`)
perguntando se o método/cabeçalho são permitidos. A API responde com os cabeçalhos
`Access-Control-Allow-Origin`, `Access-Control-Allow-Methods` e `Access-Control-Allow-Headers`.

Na API isso é configurado em `Program.cs`:

```csharp
builder.Services.AddCors(o => o.AddPolicy("Frontend", p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));
app.UseCors("Frontend");
```

`AllowAnyOrigin()` é aceitável em desenvolvimento; em produção deve-se restringir com
`.WithOrigins("https://meu-front.com.br")`.

## O que foi implementado

**Front-end**
- Interface própria (“Bloco de Notas”): fundo de papel milimetrado, verde-garrafa + amarelo marca-texto,
  tipografia Bricolage Grotesque / Figtree / JetBrains Mono, modais com sombra sólida, toasts coloridos por tipo.
- Responsiva: no celular a tabela vira cartões e os cabeçalhos viram “chips” de ordenação.
- Filtros: descrição, cadastro inicial/final, atualização inicial/final (com validação de intervalo) e botão *Limpar filtros*.
- Paginação: primeira/anterior/números de página/próxima/última, registros por página (5/10/20/50) e “Mostrando X–Y de Z”.
- Ordenação clicando no título da coluna (alterna ASC/DESC, com indicador ▲/▼).
- Mensagens: API offline (alerta + indicador de status + “Tentar novamente”), nenhum registro encontrado,
  campo obrigatório, sucesso em cadastro/edição/exclusão/PDF, carregando.
- Confirmação de exclusão em modal, contador de caracteres, tecla Esc fecha modais, escape de HTML (evita XSS).
- Exportar PDF respeitando os filtros e ordenação atuais.

**Correções na API** (necessárias para os filtros/ordenação funcionarem)
- A ordenação usava `OrderBy(x => dto.Ordem)` (uma constante) e não ordenava nada — agora ordena pelo campo informado.
- Os valores padrão de `DataCadastroFinal` e `DataAtualizacaoInicial` estavam invertidos e excluíam todos os registros
  quando o filtro não era enviado; os filtros agora são opcionais (`DateTime?`, `string?`, `int?`).
- `Total` era contado corretamente, mas agora é calculado antes do `Skip/Take` para maior clareza.
- `GET/PUT/DELETE` com ID inválido retornam `400` em vez de erro 500; `POST/PUT` validam descrição obrigatória.

## Validação com DevTools (Etapa 7)

Na aba **Network** do navegador é possível conferir, para cada ação:
método HTTP, URL com query string (ex.: `NumeroPagina=1&TamanhoPagina=10&Ordem=Descricao&Direcao=ASC`),
headers (`Content-Type: application/json`, `Origin`, e na resposta `Access-Control-Allow-Origin: *`),
o corpo JSON enviado no POST/PUT, a preflight `OPTIONS` e a resposta da API (`201`, `200`, `204`, `400`, `404`).
O console também registra os parâmetros de cada filtro.

## Testes realizados (Etapa 9)

Cadastro, consulta, edição, exclusão, campo obrigatório vazio, filtro por descrição, filtros de data
(inclusive data inicial > final), paginação (avançar/voltar/última página), troca de registros por página,
ordenação ASC/DESC em todas as colunas, exportação de PDF e comportamento com a API desligada.
