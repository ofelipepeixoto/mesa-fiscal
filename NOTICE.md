# Origem da conferência de documentos

O módulo `public/document-validators.mjs` adapta exclusivamente os validadores de CPF e CNPJ do [Radar Fiscal ChatGPT, commit 14368391aee1a04b597274cfccdf0e3055c134cf](https://github.com/ofelipepeixoto/radar-fiscal-chatgpt/blob/14368391aee1a04b597274cfccdf0e3055c134cf/src/radar_fiscal/validators.py), copyright 2026 Carlos Felipe.

Os algoritmos derivam de `DeHor-Labs/mcp-fiscal-brasil`, revisão `bba0a9f896969940ab2f49a171fc75ea592401e4`, copyright 2026 Nikolas DeHor, sob MIT. Os vetores de regressão foram adaptados de `tests/test_validators.py` da revisão fixada do Radar Fiscal. Eles são exemplos públicos e sintéticos e não comprovam titulares.

A [licença integral do componente](public/document-validators-LICENSE.txt) acompanha também a distribuição estática. A adaptação JavaScript mantém a fronteira estrita de entrada, sem consultas cadastrais ou serviços externos. O módulo não inclui chave de NF-e, CEP, servidores ou consultas do projeto de origem.

Este aviso se aplica ao componente identificado. Os motores da Receita e as demais dependências mantêm suas próprias licenças e avisos. O Mesa Fiscal é independente e não representa a Receita Federal nem os autores dos componentes utilizados.
