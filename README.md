# Mesa Fiscal

Simule os tributos de uma operação no regime regular ou no Simples Nacional e transforme o XML de uma nota de serviço nacional em PDF. O Mesa Fiscal é um projeto independente que integra três projetos públicos da Receita Federal do Brasil.

## Experimentar

1. Abra o Mesa Fiscal e escolha **Ver um exemplo** na tela inicial.
2. Altere o valor da operação e clique em **Calcular projeção**. A tela mostra a parte da CBS, a do IBS e, quando aplicável, o Imposto Seletivo. O Simples trata um item do documento. O DAS mensal exige a apuração da empresa.
3. Em **PDF da NFS-e**, clique em **Usar o XML de exemplo** e depois em **Gerar PDF**. Quem já tem uma NFS-e nacional pode escolher o próprio XML. O arquivo fica no navegador nesse modo.
4. Em **Conferir CPF ou CNPJ**, escolha o tipo e clique em **Conferir**. A ferramenta confere formato e dígitos no navegador, aceita CNPJ numérico ou alfanumérico e não consulta existência, titularidade ou situação cadastral. É opcional e não altera os cálculos nem a geração do PDF.

A edição web oferece dois cenários educativos editáveis. Para testar outras classificações fiscais e datas com as tabelas da Receita, use a instalação local abaixo. Um resultado simulado pelo motor tem indicação própria. A aplicação reconhece respostas incompletas e erros do item mesmo quando o serviço responde HTTP 200.

## Abrir no computador

Com Node.js 22 ou superior e Git instalados:

```sh
git clone https://github.com/ofelipepeixoto/mesa-fiscal.git
cd mesa-fiscal
npm start
```

Abra **http://localhost:4173**. Os exemplos e o gerador de PDF funcionam sem chave de API e sem instalar pacotes npm. Para desligar, use Ctrl+C. O histórico fica apenas na memória da aba e é reiniciado ao atualizar a página.

## Usar os motores da Receita

No computador do escritório, instale Docker com o plugin Compose v2.17 ou mais recente e BuildKit. No Windows, é possível usar o Docker Desktop com a integração do WSL. Na pasta do projeto, execute:

```sh
docker compose up --build -d
```

A primeira construção precisa de internet para baixar as revisões do GitHub, as imagens e as dependências do Java e do Go. A construção prepara o catálogo SQLite com as migrações da Receita. Depois de construir, a instalação executa os cálculos com os motores locais. Os serviços fiscais usam uma rede interna sem saída direta para a internet. O contêiner do DANFSe compila para a arquitetura escolhida pelo Docker. A homologação automatizada usa Linux AMD64.

Abra **http://localhost:4173** e escolha uma das calculadoras. A opção **Motor da Receita** fica disponível quando a aplicação reconhece o serviço correspondente. Se a tela já estava aberta durante a inicialização, atualize-a. Somente a porta local da interface é publicada. Cada motor roda na rede interna do Compose. Para desligar, use `docker compose down`. Se você já estiver usando o modo `npm start`, encerre-o antes de iniciar o Compose na mesma porta.

Para conferir a instalação com dados fictícios, use `npm run test:engines` com Node 22+ no computador, enquanto o Compose estiver em execução. O teste compara os dois regimes com os exemplos, inclui casos de arredondamento e verifica se o gerador oficial devolve um PDF para o XML fictício.

## O que cada ferramenta faz

| Ferramenta | O que você informa | O que recebe |
| --- | --- | --- |
| Regime regular | No exemplo, o valor do serviço de educação. No motor local, também a data, o município, o produto ou serviço e seu enquadramento. | CBS, IBS, eventual IS e memória de cálculo quando devolvida pelo motor. |
| Simples Nacional | Base do item, percentuais e eventual IS já calculado. No motor local, também o documento, a atividade, a classificação e o NCM da mercadoria quando exigido. | Valores dos tributos desse item. A consulta de atividades usa a data e o tipo de documento. |
| PDF da NFS-e | XML nacional já emitido, até 5 MiB. A situação e o canhoto são opções de apresentação. | Documento auxiliar para leitura ou impressão. A situação selecionada não consulta o cadastro da nota. |
| Conferir CPF ou CNPJ | Número com ou sem a máscara padrão. CNPJ aceita letras. | Conferência local de formato e dígitos; sem consulta cadastral. |

A interface atende um item por operação. A calculadora do Simples cobre vendas a compradores privados com CRT 1 e documentos NF-e (55) ou NFC-e (65). Para a nota nacional de serviço, a ferramenta disponível é o gerador do PDF a partir do XML já emitido. Para datas a partir de 2027, o cenário do regime regular aceita alíquotas informadas e preserva o estado de simulação do motor. O exemplo de educação usa o caso de Porto Alegre, RS, de 10/03/2027. A base de R$ 1.200,00 gera R$ 42,24 de CBS e R$ 0,48 de IBS. No exemplo do Simples, a base de R$ 950,00, com R$ 50,00 de IS informado, resulta em R$ 88,00 no total. Alterar a base ou os percentuais gera uma projeção educativa para aquele mesmo cenário.

## Fontes, revisões e forks

O manifesto versionado reúne os três commits utilizados na construção. A interface e os motores compartilham essas revisões, e as duas calculadoras Java consultam o catálogo gerado a partir do projeto do regime regular. [Consultar os commits no manifesto](upstream.lock.env)

<!-- upstream-pins:start -->
| Projeto original | Revisão utilizada | Fork |
| --- | --- | --- |
| [Regime regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular) | [f1eebd7c](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/commit/f1eebd7ce3157423b1a6aaca7dc1d6c3395452c4) | [Fork do regime regular](https://github.com/ofelipepeixoto/calculadora-rtc-regime-regular) |
| [Simples Nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional) | [a926d5a7](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/commit/a926d5a76095ac0295a6612a9a54db7ffead2396) | [Fork do Simples Nacional](https://github.com/ofelipepeixoto/calculadora-rtc-simples-nacional) |
| [Gerador de DANFSe](https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse) | [8d79e6b2](https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse/commit/8d79e6b2f7fad6375340afcb51c85ed370c64a14) | [Fork do gerador de DANFSe](https://github.com/ofelipepeixoto/calculadora-rtc-gerador-danfse) |
<!-- upstream-pins:end -->

As referências dos exemplos de educação e de venda estão disponíveis no [projeto do regime regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/blob/f1eebd7ce3157423b1a6aaca7dc1d6c3395452c4/docs/exemplos.md) e no [teste do controlador do Simples](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/blob/a926d5a76095ac0295a6612a9a54db7ffead2396/src/test/java/br/gov/serpro/rtc/testesintegracao/simplesnacional/SimplesNacionalControllerTest.java). O [manual da Plataforma CBS, página 16](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/manuais/reforma-tributaria-do-consumo/manual-plataforma-cbs-21-maio-2026-07h40.pdf) descreve a integração com os motores locais.

Nesta revisão, as calculadoras usam Java 25 e o catálogo migrado até V0073. A construção do regime regular executa os testes oficiais de arredondamento. A do Simples executa os testes do controlador e da validação da nomenclatura no mesmo banco que acompanha o serviço.

Os dois projetos de origem declaram Spring Boot 4.1.2. O Mesa Fiscal aplica o patch de segurança 4.1.3 a essa dependência ao montar os JARs. A construção confere a versão de origem, executa os testes no ambiente atualizado e verifica a versão incluída em cada arquivo final. O regime regular recebe também o patch Spring Retry 2.0.13. A construção confere o POM original antes de aplicar essa atualização e exige a versão corrigida no JAR final. As duas imagens também usam a opção de proteção do Java publicada nos projetos da Receita. [Patch da distribuição](deploy/spring-parent.sh) · [Aviso de segurança do Spring](https://spring.io/security/cve-2026-59414/) · [Patch Spring Retry](deploy/spring-retry.sh) · [Aviso do Spring Retry](https://spring.io/security/cve-2026-41710/)

## Atualizações da Receita

A verificação diária no GitHub está programada para 07h19 no horário de Brasília. Quando encontra um commit novo, o monitor reúne as diferenças em uma única issue. Para testar uma atualização, prepare uma branch a partir dos commits indicados e abra um PR. A homologação compara os cálculos nos motores reais e testa o PDF no navegador. [Ver como atualizar os motores](docs/atualizar-motores.md)

## Como o sistema foi construído

O painel usa HTML, CSS responsivo e módulos JavaScript nativos. Os exemplos educativos fazem as contas com decimais representados em inteiros e arredondamento testado. O serviço Node separa os contratos dos três projetos em adaptadores. Os dois motores Java usam os dados locais da Receita. A geração de PDF prioriza o motor Go oficial compilado em WebAssembly, carregado em uma tarefa separada do navegador. Há também o adaptador para a versão HTTP local desse gerador.

A Central de ajuda inclui um assistente que identifica a intenção da pergunta por similaridade entre palavras e frases de referência em português. Ele mostra uma resposta revisada e o atalho correspondente. Perguntas sobre enquadramento e alíquotas recebem orientação para consultar a contabilidade. A pergunta fica no navegador. Não há chamada a modelos externos nem uso de IA para decidir valores de impostos.

A aplicação não pede CNPJ, CPF ou cadastro para simular os exemplos. A conferência opcional de documentos não envia o número, não o inclui em histórico, URLs, logs ou armazenamento do navegador e limpa o campo ao sair da ferramenta. O histórico registra apenas um resumo das operações da sessão. A aplicação não registra o conteúdo de XMLs nem guarda PDFs no servidor. Os arquivos baixados pelo usuário ficam no local escolhido no navegador.

Cada simulação no histórico também identifica a versão disponível do cálculo. Em **Projeção local**, a identificação cobre a fórmula do regime e o arredondamento em decimais. Em **Motor local**, o histórico registra a identificação do adaptador e as revisões previstas do motor e do catálogo na distribuição. Essas revisões declaradas não atestam a versão do serviço em execução. Uma API antiga ou com metadados inválidos mostra **Versão não informada**. Abra os detalhes da versão para consultar os identificadores completos.

O histórico continua limitado às últimas 60 operações na memória da aba. Limpar ou recarregar apaga os registros. Não guarda as entradas do cálculo, documentos, XMLs ou a memória fiscal completa; por isso, a versão identifica a implementação, mas não permite reproduzir a operação sozinha. PDFs continuam com o registro de geração. [Contrato e verificação das versões](docs/versoes-calculos.md) · [Conferência opcional de documentos](docs/proxima-etapa-documentos.md)

Para conferir o código e os artefatos, instale a ferramenta de compilação e execute os testes.

```sh
npm ci --ignore-scripts
npm test
npm run build
node scripts/testar-motor-wasm.mjs
```

`npm run build` gera a edição estática em `dist/`. O workflow de homologação executa as verificações com Docker e Chrome. Os scripts de construção e a pasta `public/engine/` registram a revisão do gerador, as dependências, os avisos de licença e os hashes dos arquivos distribuídos.

## Referências de interface e estrutura

A página inicial reúne as tarefas frequentes, seguindo o padrão observado na [visão geral da Conta Azul](https://ajuda.contaazul.com/hc/pt-br/articles/115007759147-Vis%C3%A3o-geral-o-que-%C3%A9-e-como-funciona). A orientação sobre o serviço disponível fica na própria tarefa, inspirada na [ajuda de NFS-e da Omie](https://ajuda.omie.com.br/pt-BR/articles/9583614-acompanhando-o-status-de-disponibilidade-de-emissao-de-nfs-e). A divisão dos serviços por finalidade tomou como referência a [documentação de APIs da Conta Azul](https://developers.contaazul.com/open-api-docs/open-api-service). A entrega de HTML leve, com interatividade localizada, segue o princípio descrito na [arquitetura de ilhas do Astro](https://docs.astro.build/en/concepts/islands/).


## Proteção do site

A edição publicada entrega JavaScript e CSS compactados, com nomes derivados do conteúdo e verificação de integridade. A política de conteúdo restringe as conexões do navegador à origem da aplicação. Antes de ler o XML, o gerador confere os arquivos usados para produzir o PDF. O código que roda no navegador continua inspecionável e tem sua versão legível no repositório público.

Os controles do servidor, os limites desta revisão e o canal para relatar problemas estão na [política de segurança](SECURITY.md).
