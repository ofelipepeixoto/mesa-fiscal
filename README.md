# Mesa Fiscal

Simule os tributos de uma operação no regime regular ou no Simples Nacional e transforme o XML de uma nota de serviço nacional em PDF. O Mesa Fiscal é um projeto independente que integra três projetos públicos da Receita Federal do Brasil.

## Experimentar

1. Abra o Mesa Fiscal e escolha **Ver um exemplo** na tela inicial.
2. Altere o valor da operação e clique em **Calcular projeção**. A tela mostra a parte da CBS, a do IBS e, quando aplicável, o Imposto Seletivo. O Simples trata um item do documento. O DAS mensal exige a apuração da empresa.
3. Em **PDF da NFS-e**, clique em **Usar o XML de exemplo** e depois em **Gerar PDF**. Quem já tem uma NFS-e nacional pode escolher o próprio XML. O arquivo fica no navegador nesse modo.

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

A primeira construção precisa de internet para baixar as revisões do GitHub, as imagens e as dependências do Java e do Go. A construção prepara o catálogo SQLite com as migrações da Receita. Depois de construir, a instalação executa os cálculos com os motores locais. O motor regular pode consultar a versão pública do catálogo na inicialização. A imagem do serviço DANFSe usa Linux AMD64. Computadores ARM precisam de emulação para esse contêiner.

Abra **http://localhost:4173** e escolha uma das calculadoras. A opção **Motor da Receita** fica disponível quando a aplicação reconhece o serviço correspondente. Se a tela já estava aberta durante a inicialização, atualize-a. Somente a porta local da interface é publicada. Cada motor roda na rede interna do Compose. Para desligar, use `docker compose down`. Se você já estiver usando o modo `npm start`, encerre-o antes de iniciar o Compose na mesma porta.

Para conferir a instalação com dados fictícios, use `npm run test:engines` com Node 22+ no computador, enquanto o Compose estiver em execução. O teste envia duas bases por regime e verifica se o serviço oficial de documentos devolve um PDF.

## O que cada ferramenta faz

| Ferramenta | O que você informa | O que recebe |
| --- | --- | --- |
| Regime regular | No exemplo, o valor do serviço de educação. No motor local, também a data, o município, o produto ou serviço e seu enquadramento. | CBS, IBS, eventual IS e memória de cálculo quando devolvida pelo motor. |
| Simples Nacional | Base do item, percentuais e eventual IS já calculado. No motor local, também o documento, a atividade e a classificação. | Valores dos tributos desse item. A consulta de atividades usa a data e o tipo de documento. |
| PDF da NFS-e | XML nacional já emitido, até 5 MiB. A situação e o canhoto são opções de apresentação. | Documento auxiliar para leitura ou impressão. A situação selecionada não consulta o cadastro da nota. |

A interface atende um item por operação. A calculadora do Simples cobre vendas a compradores privados com CRT 1 e documentos NF-e (55) ou NFC-e (65). Para a nota nacional de serviço, a ferramenta disponível é o gerador do PDF a partir do XML já emitido. Para datas a partir de 2027, o cenário do regime regular aceita alíquotas informadas e preserva o estado de simulação do motor. O exemplo de educação usa o caso de Porto Alegre, RS, de 10/03/2027. A base de R$ 1.200,00 gera R$ 42,24 de CBS e R$ 0,48 de IBS. No exemplo do Simples, a base de R$ 950,00, com R$ 50,00 de IS informado, resulta em R$ 88,00 no total. Alterar a base ou os percentuais gera uma projeção educativa para aquele mesmo cenário.

## Fontes, revisões e forks

| Projeto original | Revisão usada | Fork |
| --- | --- | --- |
| [Regime regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular) | [150cccb](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/commit/150cccbe414d4a5edea703e4f7a424af5aa222c7) | [ofelipepeixoto/calculadora-rtc-regime-regular](https://github.com/ofelipepeixoto/calculadora-rtc-regime-regular) |
| [Simples Nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional) | [c5b0f01](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/commit/c5b0f01c8351c3f0d0795cc617b29d233e9f98df) | [ofelipepeixoto/calculadora-rtc-simples-nacional](https://github.com/ofelipepeixoto/calculadora-rtc-simples-nacional) |
| [Gerador DANFSe](https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse) | [8d79e6b](https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse/commit/8d79e6b2f7fad6375340afcb51c85ed370c64a14) | [ofelipepeixoto/calculadora-rtc-gerador-danfse](https://github.com/ofelipepeixoto/calculadora-rtc-gerador-danfse) |

As situações de referência vêm do [exemplo publicado do regime regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/blob/150cccbe414d4a5edea703e4f7a424af5aa222c7/docs/exemplos.md) e do [teste de integração do Simples](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/blob/c5b0f01c8351c3f0d0795cc617b29d233e9f98df/src/test/java/br/gov/serpro/rtc/testesintegracao/simplesnacional/SimplesNacionalControllerTest.java). O [manual da Plataforma CBS, página 16](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/manuais/reforma-tributaria-do-consumo/manual-plataforma-cbs-21-maio-2026-07h40.pdf) descreve a integração via serviço local.

Na construção do Simples, o teste oficial `naoImplementadoTambemEmNfse` espera que a NFS-e de modelo 91 com classificação 820001 ainda esteja sem implementação. A migração V0059 habilita esse tratamento. A construção executa os 24 testes do controlador com a base V0058, aplica a V0059 e repete os 23 testes compatíveis com a nova base. A instalação usa o catálogo atualizado, e o teste das APIs exercita os cálculos do painel nessa versão. [Migração oficial V0059](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/blob/150cccbe414d4a5edea703e4f7a424af5aa222c7/flyway/sql/manutencao/V0059__habilitacao_820.sql)

## Como o sistema foi construído

O painel usa HTML, CSS responsivo e módulos JavaScript nativos. Os exemplos educativos fazem as contas com decimais representados em inteiros e arredondamento testado. O serviço Node separa os contratos dos três projetos em adaptadores. Os dois motores Java usam os dados locais da Receita. A geração de PDF prioriza o motor Go oficial compilado em WebAssembly, carregado em uma tarefa separada do navegador. Há também o adaptador para a versão HTTP local desse gerador.

A Central de ajuda inclui um assistente que identifica a intenção da pergunta por similaridade entre palavras e frases de referência em português. Ele mostra uma resposta revisada e o atalho correspondente. Perguntas sobre enquadramento e alíquotas recebem orientação para consultar a contabilidade. A pergunta fica no navegador. Não há chamada a modelos externos nem uso de IA para decidir valores de impostos.

A aplicação não pede CNPJ, CPF ou cadastro para simular os exemplos. O histórico registra apenas um resumo das operações da sessão. A aplicação não registra o conteúdo de XMLs nem guarda PDFs no servidor. Os arquivos baixados pelo usuário ficam no local escolhido no navegador.

Para conferir o código e os artefatos:

```sh
npm test
npm run build
node scripts/testar-motor-wasm.mjs
```

`npm run build` gera a edição estática em `dist/`. O workflow de homologação executa as verificações com Docker e Chrome. Os scripts de construção e a pasta `public/engine/` registram a revisão do gerador, as dependências, os avisos de licença e os hashes dos arquivos distribuídos.

## Referências de interface e estrutura

A página inicial reúne as tarefas frequentes, seguindo o padrão observado na [visão geral da Conta Azul](https://ajuda.contaazul.com/hc/pt-br/articles/115007759147-Vis%C3%A3o-geral-o-que-%C3%A9-e-como-funciona). A orientação sobre o serviço disponível fica na própria tarefa, inspirada na [ajuda de NFS-e da Omie](https://ajuda.omie.com.br/pt-BR/articles/9583614-acompanhando-o-status-de-disponibilidade-de-emissao-de-nfs-e). A divisão dos serviços por finalidade tomou como referência a [documentação de APIs da Conta Azul](https://developers.contaazul.com/open-api-docs/open-api-service). A entrega de HTML leve, com interatividade localizada, segue o princípio descrito na [arquitetura de ilhas do Astro](https://docs.astro.build/en/concepts/islands/).
