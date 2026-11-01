# Anexo C — Protótipo

Protótipo no Pencil: https://app.pen.dev/s/swhm7Xfy1krKDIc-QyqE9J8ZI2xFB0qbNvHIncCXcLg

Os dados que aparecem nele são ilustrativos. Siga layout e estilo; há liberdade nos detalhes.

| Tela | O que mostra | Captura | HTML exportado |
|---|---|---|---|
| 1. Login | E-mail corporativo e senha, com a apresentação do Nexo Assist | `tela-1-login.png` | `tela-1-login.html` |
| 2. Abertura de chamado | Perguntas para completar o chamado, prioridade com prazo e rascunho para confirmação | `tela-2-novo-chamado.png` | `tela-2-novo-chamado.html` |
| 3. Consulta de chamado | Seleção entre os chamados abertos, status com prazo vencido e oferta de chamar um analista | `tela-3-consulta-transferencia.png` | `tela-3-consulta-transferencia.html` |
| 4. Console: conversa transferida | Lista de conversas, conversa aguardando atendente com o agent pausado e chamados do funcionário | `tela-4-console-conversas.png` | `tela-4-console-conversas.html` |
| 5. Console: analista atendendo | Analista assumiu a conversa e pode devolvê-la ao agent ou encerrar | `tela-5-console-atendimento.png` | `tela-5-console-atendimento.html` |
| Extra: Meu perfil (funcionário) | Tela presente no Pencil, fora da tabela do desafio | `extra-meu-perfil.png` | `extra-meu-perfil.html` |

## Arquivos só locais
Os PNG e HTML desta pasta **não são commitados** (`.gitignore`); só este README vai para o repositório.
Em outra máquina, reexporte do Pencil: selecione cada frame → painel Code → "Copy HTML" e salve com os nomes
da tabela; gere o PNG abrindo o HTML no Chrome headless em 1440×900 (Tela 5: 1567×900). Se os arquivos não
existirem, use o link do Pencil diretamente.

## Como usar
- **PNG** (1440×900; a Tela 5 tem 1567×900): referência visual para comparar lado a lado.
- **HTML + Tailwind** exportado pelo próprio Pencil ("Copy HTML"): fonte exata de cores, fontes, tamanhos,
  espaçamentos e raios. Use para extrair os tokens (`docs/design/tokens.md`) e conferir medidas.
  **Não copie como código de produção** — é markup absoluto de canvas, carregando Tailwind por CDN; as telas
  reais são componentes Next.js responsivos.
- Em caso de dúvida entre os arquivos e o Pencil, o link do Pencil prevalece. Se o protótipo mudar,
  reexporte os arquivos.
