# Atualizar os motores da Receita

O GitHub confere os três repositórios oficiais diariamente, com início previsto para 07h19 no horário de Brasília. A verificação também roda quando os pins mudam na `main`. Para iniciá-la manualmente, abra **Actions → Acompanhar projetos oficiais da Receita → Run workflow**, selecione a branch principal e confirme. O resumo da execução informa as três revisões consultadas.

Se houver novidade, o monitor abre uma issue com as comparações entre os commits. As execuções seguintes atualizam essa mesma issue somente se o conteúdo mudar. Caso a equipe feche a issue sem incorporar o commit, a mesma revisão não dispara outro aviso. Uma revisão diferente pode reabrir o acompanhamento. Se uma consulta ao GitHub falhar, a execução falha e preserva o estado anterior. O monitor tem permissão de escrita apenas em issues e nunca baixa ou executa o código dos motores.

O Dependabot verifica semanalmente os pacotes npm, as Actions do GitHub e os módulos Go mantidos em `deploy/danfse-go/`. Ele abre propostas de atualização para revisão. Em um PR que mude os módulos Go, recompile o gerador, atualize os hashes e as licenças e compare o PDF fictício antes de incorporar a alteração. [Configuração do Dependabot](../.github/dependabot.yml)

## Preparar a atualização

1. Crie uma branch no repositório Mesa Fiscal. Para conferir as revisões diretamente da API do GitHub, rode `node scripts/upstreams.mjs check` (Node 22 ou superior).
2. Execute o comando `node scripts/upstreams.mjs apply` com os três SHAs mostrados na issue. Ele verifica a origem na branch padrão e recusa revisão desatualizada ou histórico divergente. O comando atualiza `upstream.lock.env`, a tabela de revisões do README e os quatro endereços do Compose, incluindo o catálogo que o Simples compartilha com o regime regular. Para reconstruir a tabela e os endereços a partir do manifesto, use `node scripts/upstreams.mjs sync`.
3. Se o SHA do DANFSe mudar, execute `bash scripts/compilar-danfse.sh` com a versão de Go exigida pela revisão. Inclua no PR o conjunto gerado em `public/engine/` e o PDF de exemplo. Revise o registro de origem, as licenças do Go, do projeto e das dependências e os hashes.
4. Confira as mudanças nos contratos e migrações. Rode `node scripts/upstreams.mjs verify`, `npm test`, `npm run build` e `node scripts/testar-motor-wasm.mjs`. Para verificar com os serviços reais, rode `docker compose up --build -d`, `npm run test:engines` e, ao terminar, `docker compose down`.
5. Abra um PR com o diff, incluindo eventuais ajustes nos adaptadores, exemplos e testes de paridade. O workflow de homologação exercita navegador e motores locais com dados fictícios e permissões de leitura. Incorpore a revisão após as verificações passarem e as diferenças fiscais serem conferidas. O monitor diário, por si só, não faz merge, publicação ou deploy.

O arquivo `upstream.lock.env` contém apenas três identificadores públicos de commit. A fonte de cada projeto está definida em `scripts/upstreams.mjs`. O Compose preserva os endereços de build completos para continuar aceitando `docker compose up --build` diretamente. A homologação recusa um Compose desatualizado ou um WASM com origem incompatível com o manifesto.

## O que revisar quando a versão muda

| Mudança observada | Como ela aparece | O que fazer no PR |
| --- | --- | --- |
| Commit novo na branch padrão de um dos três projetos oficiais | A issue aponta para a comparação completa dos commits. Isso inclui mudanças exclusivas em documentação ou no CI do projeto. | Leia o diff e registre se há impacto no cálculo, no catálogo ou só no processo de desenvolvimento. |
| Requisito de Java, Maven ou migrações do catálogo | A mudança no projeto da Receita gera uma issue; o comando de preparação atualiza os pins de origem. | Confira o POM, as notas de versão e as migrações. Ajuste as imagens Java de construção e execução quando necessário. Homologue as duas calculadoras com o catálogo compartilhado. |
| Versão mínima de Go ou alteração no gerador de PDF | Um commit no DANFSe gera a comparação, inclusive se o contrato HTTP continuar igual. | Confira `go.mod` e `go.sum`. Quando necessário, ajuste a versão de Go em `deploy/danfse.Dockerfile`. Regenere o WASM, o runtime, o manifesto de integridade, o PDF de exemplo e as licenças. A checagem identifica incompatibilidade entre a versão de Go do construtor e a do artefato. |
| Workflow ou GitHub Action alterado na Receita | A alteração aparece no diff do projeto. Os workflows do Mesa Fiscal têm ciclo próprio. | Revise o impacto. Para adotar mudança equivalente, edite o workflow local em PR, confira permissões e o commit completo da Action escolhida. |
| Patch lançado por Go, Java, Maven, imagem Docker ou Action sem commit nos três projetos oficiais | O monitor diário pode continuar mostrando os três como idênticos. Os pins identificam o código da Receita; tags de imagens podem receber novas publicações. | Consulte os boletins dos mantenedores e as versões efetivas dos construtores. Se o patch for aplicável, abra um PR de manutenção separado e repita os testes antes de publicar. |

Uma tag nova em um commit já registrado ou um commit em outra branch não muda a revisão usada pelo Mesa Fiscal. O histórico reescrito exige análise humana. A atualização dos forks é independente da atualização dos motores da aplicação.

### Dependências do gerador de PDF

O serviço HTTP e o motor de navegador usam os mesmos arquivos de dependências em `deploy/danfse-go/`. O construtor confere os SHA-256 dos `go.mod` e `go.sum` originais da Receita antes de aplicar as versões revistas. Uma mudança nesses arquivos de origem interrompe o build para que a equipe compare a nova lista e retire os ajustes que já entraram no projeto oficial.

Para revisar a lista, use uma cópia limpa do commit em `upstream.lock.env`, o Go registrado em `deploy/danfse.Dockerfile` e os módulos indicados na revisão de segurança. Inspecione o diff de `go.mod` e `go.sum`, inclusive as versões indiretas. Atualize `upstream.sha256` com os hashes dos **originais** e versione os dois arquivos **revistos**. A base de compilação usa o digest do índice publicado pelo projeto Docker. [Índice da imagem Go](https://github.com/docker-library/repo-info/blob/master/repos/golang/remote/1.27.4-bookworm.md)

Execute `bash scripts/compilar-danfse.sh`. O script confere os módulos, testa três situações de nota fictícia, regenera o PDF e calcula o manifesto que entra no JavaScript da aplicação. Confira a distribuição com `node scripts/verificar-distribuicao-danfse.mjs`. O workflow de compilação também analisa as chamadas dos alvos HTTP e WebAssembly com govulncheck usando a base pública da equipe Go. A análise considera o conjunto de avisos disponível no dia em que roda. [Documentação do govulncheck](https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck)

O navegador verifica os bytes do runtime, do worker e do WASM em memória antes de criar o worker. A verificação cobre tanto a entrega do arquivo gzip quanto a descompressão automática pelo servidor. O HTML e a edição da aplicação que contém os hashes precisam vir de uma publicação confiável. [Integridade de subrecursos no navegador](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Subresource_Integrity)
