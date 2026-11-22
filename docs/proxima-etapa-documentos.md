# Próxima etapa: conferir CPF ou CNPJ

Planejamento de 22/11/2026. A ferramenta será separada e opcional. Esta etapa ainda não implementa nem ativa a conferência.

## Fluxo e limites

Escolher CPF ou CNPJ, informar o número com ou sem a máscara padrão, clicar em **Conferir** e receber uma indicação de formato e dígitos. **Limpar** apaga entrada e resultado. Não consultar existência, titularidade, situação cadastral ou autorização de uso. Não extrair documentos do XML. Nenhuma simulação nem geração de PDF deve passar a exigir CPF ou CNPJ.

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

Preservar a validação estrita ao adaptar Python para JavaScript. O `$` em expressões regulares JavaScript pode aceitar uma quebra de linha final. Conferir ASCII antes de converter para maiúsculas. Não usar limpeza genérica que transforme conteúdo inválido em válido.

## Origem e créditos

Referência inspecionada: [Radar Fiscal, revisão 14368391](https://github.com/ofelipepeixoto/radar-fiscal-chatgpt/tree/14368391aee1a04b597274cfccdf0e3055c134cf). Arquivos: `src/radar_fiscal/validators.py`, `tests/test_validators.py`, `NOTICE.md`, `LICENSE` e `third_party/mcp-fiscal-brasil-LICENSE.txt`.

Os algoritmos derivam de `DeHor-Labs/mcp-fiscal-brasil`, commit `bba0a9f896969940ab2f49a171fc75ea592401e4`, sob MIT, copyright 2026 Nikolas DeHor. As adaptações e fronteiras de entrada têm créditos de Carlos Felipe. Incluir os créditos e a licença integral do componente reutilizado; isso não relicencia o conjunto dos motores da Receita.

Antes da entrega, conferir o algoritmo alfanumérico contra documentação técnica primária atual da Receita e registrar a revisão. O código de referência não substitui essa confirmação. Não é necessário alterar nem integrar a PR #7 do Radar Fiscal.

## Verificação prevista

Reaproveitar vetores públicos e sintéticos, identificados como testes sem comprovação de titulares. Comparar a implementação Python e a JavaScript. Cobrir tipos inesperados e entradas excessivas. No navegador, conferir teclado, mensagens, limpeza e ausência de requisições depois de informar o documento. Gerar novamente o PDF do exemplo e verificar que o histórico não recebeu CPF ou CNPJ.
