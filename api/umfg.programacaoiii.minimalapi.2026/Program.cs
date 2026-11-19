using Microsoft.EntityFrameworkCore;
using QuestPDF;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using umfg.programacaoiii.minimalapi._2026.Contexto;
using umfg.programacaoiii.minimalapi._2026.DTO;
using umfg.programacaoiii.minimalapi._2026.Entidades;

namespace umfg.programacaoiii.minimalapi._2026;

public class Program
{    
    //método de startup do projeto
    public static void Main(string[] args)
    {
        //variavel padrão do .net permite definir as caracteristicas que a api irá ter
        //ex: autenticação e autorização via JWT / qual banco de dados
        var builder = WebApplication.CreateBuilder(args);
        var connectionString = builder.Configuration["ConnectionString"] ?? string.Empty;

        //aqui configuramos a conexão da API com o banco de dados
        builder.Services
            .AddDbContext<MySqlContexto>(options => options.UseMySQL(connectionString));
            //.AddDbContext<MySqlContexto>(options => options.UseMySQL("Server=localhost;Port=3308;Database=umfg_lembrete_develop;Uid=root;Pwd=root;"));

        //implementacao do CORS para permitir que a aplicação frontend acesse a API (localhost)
        //no mundo real, restrinja o acesso apenas para o dominio do frontend conhecido. Ex.: .WithOrigins("https://app.empresa.com.br")
        builder.Services.AddCors(options =>
        {
            options.AddPolicy("Frontend", policy =>
            {
                policy
                    .AllowAnyOrigin()
                    .AllowAnyHeader()
                    .AllowAnyMethod();
            });
        });

        //aqui a aplicação é construída
        var app = builder.Build();

        app.MapPost("/lembretes", async (LembreteDTO dto, MySqlContexto contexto) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Descricao))
                return Results.BadRequest("A descrição é obrigatória.");

            var lembrete = new Lembrete(dto.Descricao.Trim());
            await contexto.Lembrete.AddAsync(lembrete);
            await contexto.SaveChangesAsync();

            return Results.Created($"/lembretes/{lembrete.Id}", lembrete);
        });

        app.MapGet("/lembretes/{id}", async (string id, MySqlContexto contexto) =>
        {
            if (!Guid.TryParse(id, out var guid))
                return Results.BadRequest("id invalido!");

            return await contexto.Lembrete.FirstOrDefaultAsync(x => x.Id == guid && x.IsAtivo)
            is Lembrete lembrete ? Results.Ok(lembrete) : Results.NotFound();
        });

        app.MapGet("/lembretes", async (MySqlContexto contexto) =>
        {
            return await contexto.Lembrete.Where(x => x.IsAtivo).ToListAsync();            
        });

        app.MapGet("/lembretes/filtro", async ([AsParameters] LembreteQueryDTO.LembreteQueryRequestDTO dto, MySqlContexto contexto) =>
        {
            dto.NumeroPagina ??= 1; dto.TamanhoPagina ??= 10;
            if (dto.NumeroPagina <= 0 || dto.TamanhoPagina <= 0)
                return Results.BadRequest("Página e tamanho da página são obrigatórios.");

            var (lembretes, total) = await FiltrarLembretes(dto, contexto);

            var resultado = new LembreteQueryDTO.LembreteQueryResponseDTO()
            {
                Total = total,
                NumeroPagina = dto.NumeroPagina.Value,
                TamanhoPagina = dto.TamanhoPagina.Value,
                Lembretes = lembretes,
            };

            return Results.Ok(resultado);
        });

        //Biblioteca -> QuestPDF
        Settings.License = LicenseType.Community;

        app.MapGet("/lembretes/imprimir", async ([AsParameters] LembreteQueryDTO.LembreteQueryRequestDTO dto, MySqlContexto contexto) =>
        {
            dto.NumeroPagina ??= 1; dto.TamanhoPagina ??= 10;
            if (dto.NumeroPagina <= 0 || dto.TamanhoPagina <= 0)
                return Results.BadRequest("Página e tamanho da página são obrigatórios.");

            var (lembretes, total) = await FiltrarLembretes(dto, contexto);

            var documento = Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(2, Unit.Centimetre);
                    page.PageColor(Color.FromHex("#FFFFFF"));

                    page.Header()
                        .Text("Relatório de Lembretes")
                        .SemiBold()
                        .FontSize(20)
                        .FontColor(Colors.Blue.Medium);

                    page
                        .Content()
                        .PaddingVertical(10)
                        .Column(column =>
                        {
                            column.Spacing(10);
                            column.Item().Text($"Gerado em: {DateTime.Now.ToLocalTime()}");

                            column
                                .Item()
                                .Table(tabela =>
                                {
                                    tabela.ColumnsDefinition(columns =>
                                    {
                                        columns.RelativeColumn();
                                        columns.ConstantColumn(110);
                                        columns.ConstantColumn(110);                                        
                                        columns.ConstantColumn(80);                                        
                                    });

                                    tabela.Header(header =>
                                    {
                                        header.Cell().Text("Descrição").SemiBold();
                                        header.Cell().Text("Cadastro").SemiBold();
                                        header.Cell().Text("Atualização").SemiBold();
                                        header.Cell().Text("Status").SemiBold();
                                    });

                                    foreach (var lembrete in lembretes)
                                    {
                                        tabela.Cell().Text(lembrete.Descricao).FontSize(10);
                                        tabela.Cell().Text(lembrete.DataCadastro.ToLocalTime()).FontSize(10);
                                        tabela.Cell().Text(lembrete.DataAtualizacao.ToLocalTime()).FontSize(10);
                                        tabela.Cell()
                                            .Text(lembrete.IsAtivo  ? "Ativo" : "Inativo")
                                            .FontSize(10)
                                            .FontColor(lembrete.IsAtivo ? Colors.Green.Medium : Colors.Red.Medium);
                                    }
                                });
                        });

                    page.Footer().AlignCenter().Text(x => x.CurrentPageNumber());
                });
            });

            return Results.File(documento.GeneratePdf(), "application/pdf", "relatorio-lembretes.pdf");
        });


        app.MapDelete("/lembretes/{id}", async (string id, MySqlContexto contexto) =>
        {
            if (!Guid.TryParse(id, out var guid))
                return Results.BadRequest("id invalido!");

            var lembrete = await contexto.Lembrete.FindAsync(guid);

            //conceito de fail first
            if (lembrete is null)
                return Results.NotFound();

            lembrete.SetAtivo(false);
            lembrete.Update();

            contexto.Lembrete.Update(lembrete);
            await contexto.SaveChangesAsync();

            return Results.NoContent();
        });

        app.MapPut("/lembretes/{id}", async (string id, LembreteDTO dto, MySqlContexto contexto) =>
        {
            if (!Guid.TryParse(id, out var guid))
                return Results.BadRequest("id invalido!");

            if (string.IsNullOrWhiteSpace(dto.Descricao))
                return Results.BadRequest("A descrição é obrigatória.");

            var lembreteExistente = await contexto.Lembrete.FindAsync(guid);

            if (lembreteExistente is null)
                return Results.NotFound();

            lembreteExistente.SetDescricao(dto.Descricao.Trim());
            lembreteExistente.Update();

            contexto.Lembrete.Update(lembreteExistente);
            await contexto.SaveChangesAsync();

            return Results.Ok(lembreteExistente);
        });

        //aqui habilitamos as funcionalidades da api
        app.UseHttpsRedirection();

        //habilitar o uso da regra de CORS
        app.UseCors("Frontend");

        //a api é iniciada de fato
        app.Run();
        //tudo que for colocado após o run será executado somente quando a api for parada
    }

    private static async Task<(List<Lembrete>, long)>FiltrarLembretes(
        LembreteQueryDTO.LembreteQueryRequestDTO dto, MySqlContexto contexto)
    {
        var query = contexto.Lembrete
                .AsNoTracking()
                .Where(x => x.IsAtivo);

        //busca por descrição com tratamento de caracteres especiais para LIKE
        if (!string.IsNullOrWhiteSpace(dto.Descricao))
        {
            var termo = dto.Descricao.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
            query = query.Where(x => EF.Functions.Like(x.Descricao, $"%{termo}%"));
        }

        // Filtros opcionais
        // Filtros opcionais (datas informadas como yyyy-MM-dd)
        if (dto.DataCadastroInicial.HasValue)
        {
            var ini = dto.DataCadastroInicial.Value.Date;
            query = query.Where(x => x.DataCadastro >= ini);
        }

        if (dto.DataCadastroFinal.HasValue)
        {
            var fim = dto.DataCadastroFinal.Value.Date.AddDays(1); // inclui o dia inteiro
            query = query.Where(x => x.DataCadastro < fim);
        }

        if (dto.DataAtualizacaoInicial.HasValue)
        {
            var ini = dto.DataAtualizacaoInicial.Value.Date;
            query = query.Where(x => x.DataAtualizacao >= ini);
        }

        if (dto.DataAtualizacaoFinal.HasValue)
        {
            var fim = dto.DataAtualizacaoFinal.Value.Date.AddDays(1); // inclui o dia inteiro
            query = query.Where(x => x.DataAtualizacao < fim);
        }

        //direção padrão: do mais recente para o mais antigo
        var direcao = (dto.Direcao ?? "DESC").ToUpper();
        if (direcao != "ASC" && direcao != "DESC")
            direcao = "DESC";
        dto.Direcao = direcao;

        //ordenação pelo campo informado (antes ordenava por uma constante e não tinha efeito)
        var desc = direcao == "DESC";
        query = (dto.Ordem ?? string.Empty).ToLower() switch
        {
            "descricao" => desc ? query.OrderByDescending(x => x.Descricao) : query.OrderBy(x => x.Descricao),
            "dataatualizacao" => desc ? query.OrderByDescending(x => x.DataAtualizacao) : query.OrderBy(x => x.DataAtualizacao),
            "isativo" => desc ? query.OrderByDescending(x => x.IsAtivo) : query.OrderBy(x => x.IsAtivo),
            _ => desc ? query.OrderByDescending(x => x.DataCadastro) : query.OrderBy(x => x.DataCadastro),
        };

        // paginação
        var numeroPagina = dto.NumeroPagina ?? 1;
        var tamanhoPagina = dto.TamanhoPagina ?? 10;
        var pular = (numeroPagina - 1) * tamanhoPagina;
        var total = await query.CountAsync();
        var lembretes = await query.Skip(pular).Take(tamanhoPagina).ToListAsync();

        return (lembretes, total);
    }
}
