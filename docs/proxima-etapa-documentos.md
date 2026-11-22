# Conferir CPF ou CNPJ

Implementação de 22/11/2026, a partir do planejamento aprovado nesta data. A ferramenta fica separada em **Conferir CPF ou CNPJ**, acessível no menu e na visão geral. É opcional e executa a conferência no navegador, tanto na edição estática quanto na instalação local.

## Fluxo e limites

Escolha CPF ou CNPJ, informe o número com ou sem a máscara padrão e clique em **Conferir**. A tela informa se formato e dígitos conferem. **Limpar** apaga entrada e resultado e devolve o foco ao campo. Editar apaga o resultado anterior; trocar o tipo ou sair da ferramenta apaga o campo. A conferência não consulta existência, titularidade, situação cadastral ou autorização de uso. Não extrai documentos do XML. Nenhuma simulação nem geração de PDF exige CPF ou CNPJ.

O XML fictício atual usa `00000000000000`, rejeitado pelos validadores. Ele deve continuar gerando PDF normalmente. A chave de NF-e de 44 dígitos fica fora desta etapa.

## Aceite

| Área | Resultado esperado |
| --- | --- |
| CPF | Conferir 11 dígitos ASCII ou máscara padrão e os dois dígitos verificadores. |
| CNPJ | Conferir formato numérico ou alfanumérico, com 12 caracteres ASCII e dois dígitos finais, máscara padrão e letras minúsculas. |
| Rejeição | Sequências repetidas, tamanho errado, dígitos alterados, máscara quebrada, espaços extras, quebras de linha, caracteres Unicode semelhantes e conteúdo inesperado. |
| Privacidade | Não enviar entrada em requisições ou URLs, nem guardar em logs, telemetria, histórico, armazenamento do navegador ou banco. |
| Interface | Campo CNPJ aceita letras; mensagens acessíveis, teclado, limpeza e leitura em tela de 390 px. |
| Regressão | Cálculos e PDF do XML fictício funcionam sem documento. |
| Implementação | Módulo JavaScript sem dependências adicionais nem serviço externo. |

O módulo verifica tipo, comprimento exato e máscara antes de remover pontuação ou converter letras ASCII para maiúsculas. Isso impede que o `$` das expressões regulares JavaScript aceite uma quebra de linha final. A interface também recusa colagens e arrastes de texto com CR/LF antes da sanitização nativa do campo de texto. Nenhum resultado repete o número informado.

## Origem e créditos

Referência inspecionada: [Radar Fiscal, revisão 14368391](https://github.com/ofelipepeixoto/radar-fiscal-chatgpt/tree/14368391aee1a04b597274cfccdf0e3055c134cf). Arquivos: `src/radar_fiscal/validators.py`, `tests/test_validators.py`, `NOTICE.md`, `LICENSE` e `third_party/mcp-fiscal-brasil-LICENSE.txt`.

Os algoritmos derivam de `DeHor-Labs/mcp-fiscal-brasil`, commit `bba0a9f896969940ab2f49a171fc75ea592401e4`, sob MIT, copyright 2026 Nikolas DeHor. As adaptações e fronteiras de entrada têm créditos de Carlos Felipe. O [aviso de origem](../NOTICE.md) e a [licença integral](../public/document-validators-LICENSE.txt) preservam os créditos. A licença acompanha o site; isso não relicencia os motores da Receita.

O cálculo alfanumérico foi conferido em 22/11/2026 no [manual técnico disponibilizado pela Receita](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf), páginas 3–4. A [página do documento](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf/view) informa atualização de 05/11/2024. O manual usa 12 caracteres, dois verificadores numéricos, valores ASCII menos 48, módulo 11 e pesos de 2 a 9 da direita para a esquerda. O exemplo técnico `12.ABC.345/01DE-35` integra a regressão. Isso verifica a matemática descrita no documento, não uma integração com o cadastro. A PR #7 e os arquivos do Radar Fiscal não foram alterados.

## Verificação

A suíte Node cobre os vetores públicos/sintéticos, sem comprovação de titulares, além de tipos inesperados, entradas excessivas, máscaras quebradas, verificadores alterados e caracteres Unicode. A normalização e a validação JavaScript coincidiram com a referência Python fixada em 2.430 casos de strings, sendo 30 vetores de referência e 2.400 variações sintéticas determinísticas. A comparação foi local; não há dependência Python no aplicativo ou na suíte npm.

A homologação Chrome usa os mesmos vetores fictícios e confere resultados, teclado, mensagens acessíveis, limpeza e ausência de requisições durante a conferência, além de URLs, armazenamento e histórico. A jornada também gera novamente o PDF do exemplo com CNPJ de zeros e exercita os cálculos existentes. O teste de ida e volta registra se houve restauração real pelo cache de navegação; uma nova carga não deve ser descrita como comprovação de BFCache. Não houve aparelho físico, leitor de tela ou auditoria WCAG completa.

Para verificar: `npm test`, `npm run build` e a homologação **Homologar os três motores oficiais**. A verificação de distribuição exige a licença do módulo e os créditos no JavaScript compilado.
