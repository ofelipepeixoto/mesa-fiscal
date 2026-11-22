# Versão do cálculo no histórico

Cada conclusão válida de uma simulação captura um resumo imutável com `calculationVersion`. A lista continua apenas na memória da aba, até 60 operações. Recarregar e limpar removem os registros. Não há envio adicional nem persistência de entradas ou documentos.

| Campo | Significado |
| --- | --- |
| `schema` | Versão 1 deste contrato de metadados. |
| `kind` | `regular` ou `simples`. |
| `mode` | `projection` para fórmula no navegador; `engine` para API local. |
| `codeRevision` | SHA-256 das fontes da fórmula e do arredondamento, ou do adaptador e suas dependências diretas. |
| `expectedEngineRevision` | Somente no modo motor: commit declarado em `upstream.lock.env`. Não é uma atestação do processo em execução. |
| `expectedCatalogRevision` | Somente no modo motor: commit declarado do catálogo, proveniente do regime regular nos dois regimes. |

`public/calculation-versions.mjs` é gerado das fontes e do manifesto. O gerador usa conteúdo e caminhos estáveis, sem horário, máquina ou dados do usuário. Verifique com `node scripts/calculation-versions.mjs verify`. Depois de alterar uma fonte coberta ou atualizar as revisões, gere novamente com `node scripts/calculation-versions.mjs --write` e inclua o módulo gerado no mesmo commit. A suíte e a homologação recusam metadados desatualizados.

A API acrescenta a versão apenas depois de um cálculo aceito pelo adaptador. O cliente usa os metadados recebidos naquela resposta para o motor; nunca preenche uma ausência com a revisão do próprio navegador. Para projeções, usa a identificação da fórmula embarcada. Requisições obsoletas por alteração de formulário ou saída da tela continuam descartadas antes da inclusão no histórico.

O histórico copia somente campos permitidos e valida esquema, regime, modo e identificadores. Dados extras são descartados. Informação ausente ou malformada vira “Versão não informada”, preservando o resumo de um cálculo válido. A apresentação usa `textContent`. O PDF permanece sem metadados de cálculo nesta etapa.

Os identificadores completos podem ser abertos no histórico. Não são a versão do contrato de requisição fiscal nem a versão do site. Mudanças de entradas, tabelas e motor também podem alterar resultados; o histórico não armazena entradas para reproduzir uma operação. O contrato não depende nem modifica a PR #7 do Radar Fiscal.
