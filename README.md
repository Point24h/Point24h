# Painel Point 24h

Painel online da rede Point com visão mensal e quinzenal, rankings de faturamento e produtos, implantações e alertas.

## Fontes de dados

- Faturamentos e produtos: arquivos quinzenais V e P, consolidados no Supabase.
- Cadastro operacional dos PDVs: planilha compartilhada "Base de licenciados", abas BASE e IMPLANTAÇÃO. A sincronização ocorre diariamente à noite. São importados apenas situação, unidade, cidade/UF, quantidade de moradias ou funcionários, terminais, data de inauguração e datas de implantação.
- CPF, telefone, e-mail pessoal, endereço e valores de contrato da planilha não entram no painel.

O ticket geral por apartamento divide o faturamento somado dos condomínios com vendas e apartamentos cadastrados pela soma de seus apartamentos. Os alertas comparam médias diárias quinzenais e ficam na última página.

## Acesso

A interface usa autenticação do Supabase e políticas de acesso no banco. Cada dispositivo mantém sua própria sessão após o primeiro login; o botão **Sair** encerra a sessão naquele dispositivo. O painel atualiza os dados periodicamente enquanto estiver aberto.

Este repositório público contém apenas código e o logo. Dados financeiros, planilhas e credenciais ficam fora do GitHub.
