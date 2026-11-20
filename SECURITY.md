# Segurança do Mesa Fiscal

Para relatar um problema, use o [canal privado do GitHub](https://github.com/ofelipepeixoto/mesa-fiscal/security/advisories/new). Informe a versão, o componente e o efeito observado. Use dados fictícios em exemplos. Para dúvidas sobre enquadramento tributário, consulte a contabilidade responsável.

## O que acontece com os dados

Na edição web, as projeções são feitas na aba. O navegador baixa o gerador da Receita, confere sua integridade e só então lê o XML escolhido. O documento e o PDF são processados em memória. O histórico da sessão contém resumos. Um PDF baixado fica no dispositivo do usuário.

Na instalação local, as calculadoras recebem os dados pela API local. Quando o usuário usa o serviço HTTP de PDF, o XML passa pelo servidor local e pelo motor DANFSe. A aplicação limita o tamanho da entrada, das respostas e o número de gerações de PDF ao mesmo tempo. A API verifica a origem das requisições. O Compose publica a interface em loopback, executa os motores sem privilégio de root e usa uma rede interna para a comunicação entre serviços.

## Distribuição

O site distribui uma lista definida de arquivos. Os módulos de desenvolvimento, mapas de código, documentação interna e código do servidor ficam fora do pacote. HTML, CSS e JavaScript são entregues pela mesma origem. O navegador verifica os hashes dos dois pacotes e dos arquivos do gerador de PDF. A política de conteúdo em HTML restringe os recursos aceitos. Há um arquivo de cabeçalhos para provedores que aceitam esse formato.

Minificar dificulta a leitura casual. Qualquer pessoa com acesso ao navegador pode inspecionar o que ele executa. As regras oficiais e o código-fonte do projeto são públicos. A integridade protege contra uma alteração isolada dos recursos. A conta que publica o HTML e o controle de acesso da hospedagem também fazem parte da proteção.

## Como verificar

Com Node.js 22 ou superior, instale as dependências do build com `npm ci --ignore-scripts`. Execute `npm test`, `npm run build` e `node scripts/verificar-distribuicao-danfse.mjs`. A homologação do GitHub também constrói os motores a partir dos commits oficiais, compara cálculos por HTTP e gera o PDF no Chrome com uma nota fictícia. [Ver execuções](https://github.com/ofelipepeixoto/mesa-fiscal/actions/workflows/official-engines.yml)

As revisões oficiais ficam no [manifesto](upstream.lock.env). A rotina diária confere mudanças na branch padrão dos três projetos e abre ou atualiza uma única issue. A atualização segue um [procedimento de homologação](docs/atualizar-motores.md). A cobertura tributária da interface está descrita no [README](README.md).

## Revisão de 20 de novembro de 2026

| Área | Correção ou verificação |
| --- | --- |
| Cálculos | A projeção de educação arredonda a alíquota efetiva antes do tributo e calcula IBS estadual e municipal separadamente. O Simples preserva as casas decimais das alíquotas, arredonda as parcelas e verifica o estado devolvido pelo motor. |
| PDF | O pacote oficial foi recompilado com Go 1.27.4. Antes de iniciar o processamento, o navegador compara o runtime, o worker e o WebAssembly com os hashes esperados. As licenças e a origem acompanham a distribuição. |
| API local | A entrega de arquivos resolve o caminho real dentro da pasta pública. Os formulários exigem JSON em UTF-8 válido. A consulta de disponibilidade reúne pedidos simultâneos e a geração de PDF tem limite de concorrência. |
| GitHub | O projeto recebe avisos pelo canal privado e tem análise CodeQL configurada. Os testes usam dados fictícios e motores fixados por commit. |

O Echo aparece nas dependências do projeto DANFSe. O aviso GHSA-v97q-3xf5-rj74 descreve condições específicas do middleware de arquivos estáticos. A revisão do código de entrada não identificou o uso dessa configuração pelo serviço integrado. A versão da dependência e seu alcance devem ser revistos a cada atualização. [Consultar aviso do Echo](https://github.com/advisories/GHSA-v97q-3xf5-rj74)

## Dependências e imagens conferidas em 20 de novembro de 2026

| Componente | Versão usada na distribuição | Evidência |
| --- | --- | --- |
| Interface e API local | Node.js 24.22.3 com Alpine 3.24. O Dockerfile identifica a imagem pelo digest do índice. | [Publicação de segurança do Node.js](https://nodejs.org/en/blog/release/v24.22.3/) e [índice da imagem](https://github.com/docker-library/repo-info/blob/master/repos/node/remote/24.22.3-alpine3.24.md) |
| Construção da interface | esbuild 0.28.2, fixado no arquivo de dependências. Os três avisos publicados no repositório do mantenedor até esta revisão tratam de versões corrigidas antes da 0.28.2. O build usa a API Node. | [Avisos do esbuild](https://github.com/evanw/esbuild/security/advisories) |
| Motores Java | Maven 3.10.0 e Temurin 25.0.5+8 nas imagens conferidas. Os dois estágios usam a mitigação indicada pelo fornecedor para CVE-2026-114938. A versão que contém a correção para Java 25 é 25.0.5.1+2. O build também atualiza o componente Spring Boot dos motores de 4.1.2 para 4.1.3 e confere a versão no JAR. | [Adoptium](https://adoptium.net/news/2026/11/temurin-november-2026-cspu-java4shell) e [Spring](https://spring.io/security/cve-2026-59414/) |
| Gerador de PDF | Compilado com Go 1.27.4. Os arquivos de dependências usados ao construir os dois formatos do gerador trazem Echo 5.4.6 e golang.org/x/image 0.45.0. O binário anterior incluía o decodificador VP8L citado no aviso. O exame de código não demonstrou que uma pessoa pudesse fornecer uma imagem a esse decodificador pela tela do XML. | [Versões do Go](https://go.dev/doc/devel/release), [aviso do Echo](https://github.com/labstack/echo/security/advisories/GHSA-v97q-3xf5-rj74) e [aviso de VP8L](https://pkg.go.dev/vuln/GO-2026-6222) |

A homologação consulta o registro oficial do npm com o arquivo de dependências do build. Um alerta de nível alto ou crítico faz a etapa falhar. O Dependabot verifica semanalmente npm, GitHub Actions e os módulos Go da distribuição. Uma atualização do gerador exige recompilar o WASM, conferir os hashes e homologar o PDF. Os registros de cada execução mostram o resultado para aquela revisão e para os avisos disponíveis na data. [Execuções da homologação](https://github.com/ofelipepeixoto/mesa-fiscal/actions/workflows/official-engines.yml) e [guia de atualização](docs/atualizar-motores.md)
