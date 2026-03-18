# Arquitetura Tecnica

## Camadas principais

- `apps/api/app/api/routes`: superficies HTTP do painel, importacoes e automacao operacional
- `apps/api/app/models`: entidades SQLAlchemy para monitoramento, matching, alertas, auditoria e acompanhamento
- `apps/api/app/services/integrations`: adaptadores externos com logging e retry
- `apps/api/app/services/ai`: prompts versionados, structured outputs e extracao juridica
- `apps/api/app/services/matching`: regras deterministicas e heuristicas com score
- `apps/api/app/services/operations.py`: parser da planilha LAW, consolidacao operacional e sumarios executivos
- `apps/api/app/services/notifications`: email e webhook desacoplados
- `apps/api/app/services/scheduler`: execucao diaria em `America/Sao_Paulo`
- `apps/web/app`: painel Next.js com navegacao por dominio funcional

## Fluxo de monitoramento juridico

1. o scheduler cria `scheduler_runs`
2. a base monitorada ativa e lida de `monitored_entities`
3. a integracao Escavador busca processos por CNPJ ou razao social
4. movimentacoes relevantes sao filtradas por palavras-chave juridicas sensiveis
5. o documento bruto e persistido em `legal_documents`
6. a OpenAI extrai estrutura juridica em `ai_extractions`
7. `legal_events` e consolidado com dados normalizados
8. o matching cruza o evento com a base interna e gera `match_results`
9. alertas sao materializados em `risk_alerts`
10. severidade critica pode disparar notificacao imediata

## Fluxo operacional incorporado da planilha

1. o arquivo `.xlsx` da LAW e lido por parser interno baseado em `zipfile` e XML
2. as abas `LAW FUNDO` e `LAW SEC` sao transformadas em registros estruturados
3. a camada `operations` infere:
   - portfolio
   - grupo de status
   - prioridade operacional
   - proxima acao recomendada
   - necessidade de revisao manual
4. registros sao persistidos em `operational_cases`
5. sincronizacoes sao rastreadas em `workbook_import_runs`
6. tratativas adicionais e historico ficam em `operational_case_events`
7. o dashboard consome o sumario operacional para expor fila, aging e exposicao

## Entidades relevantes

Base existente:

- `monitored_entities`
- `legal_documents`
- `ai_extractions`
- `legal_events`
- `match_results`
- `risk_alerts`
- `scheduler_runs`
- `integration_logs`
- `audit_logs`

Camada operacional nova:

- `workbook_import_runs`
- `operational_cases`
- `operational_case_events`

## Regras de matching

- `EXACT_MATCH`: igualdade exata de CNPJ
- `ROOT_MATCH`: coincidencia por raiz do CNPJ
- `ECONOMIC_GROUP_MATCH`: empresa vinculada ao mesmo grupo economico
- `FUZZY_NAME_MATCH`: razao social ou alias acima do threshold
- `PARTNER_MATCH`: socio ou administrador relacionado
- `MANUAL_REVIEW`: reservado para casos com baixa confianca e decisao humana

## Regras operacionais derivadas da planilha

Campos usados como base de produto:

- `Cedente`
- `Sacado`
- `Status`
- `Fase`
- `Data Envio Docs`
- `Data Ajuizamento`
- `Valor da Acao`
- `Custas Juridicas`
- `Ultimo Andamento`
- `Data Atualizacao`
- `Responsavel`
- `Prioridade`
- `Observacoes`

Transformacoes aplicadas:

- normalizacao textual para consolidar status equivalentes
- parse monetario para exposicao e custos
- derivacao de `aging_days` a partir da ultima atualizacao
- heuristica para `status_group` institucional
- inferencia de `next_action`
- preenchimento de `risk_score` e `match_confidence_score` para ordenacao

## Superficies HTTP novas

Modulo operacional:

- `GET /api/v1/operations/summary`
- `GET /api/v1/operations/cases`
- `GET /api/v1/operations/cases/{case_id}`
- `POST /api/v1/operations/cases/{case_id}/follow-up`
- `PATCH /api/v1/operations/cases/{case_id}`
- `POST /api/v1/operations/cases/{case_id}/analysis`
- `POST /api/v1/operations/cases/{case_id}/comments`
- `POST /api/v1/operations/sync`

Importacao da planilha:

- `GET /api/v1/imports/workbook/preview`
- `POST /api/v1/imports/workbook/commit`
- `POST /api/v1/imports/workbook/preview-upload`
- `POST /api/v1/imports/workbook/commit-upload`

## Dashboard executivo

O dashboard agora agrega monitoramento juridico e operacao interna em uma mesma visao:

- alertas criticos
- empresas monitoradas
- exposicao potencial
- distribuicao por severidade
- integracoes e scheduler
- fila operacional por prioridade
- distribuicao por portfolio
- aging buckets
- lideres de exposicao
- atualizacoes operacionais recentes

## Frontend

Direcao visual baseada na referencia LAW:

- topo azul-marinho institucional
- destaques em dourado executivo
- superficies claras com contraste discreto
- tipografia mais editorial para titulos e leitura mais limpa em tabelas

Modulos principais:

- `Dashboard`
- `Alertas`
- `Eventos`
- `Empresas`
- `Matches`
- `Documentos`
- `Agenda`
- `Configuracoes`
- `Auditoria`
- `Acompanhamento`

## Observabilidade e auditoria

- payload bruto e normalizado persistidos por documento
- logs de integracao por provider e operacao
- trilha de auditoria para alteracoes de entidades e alertas
- deduplicacao por `dedup_key` e `source_hash`
- importacoes da planilha com resumo de linhas lidas, aplicadas e descartadas

## Demo offline e apresentacao publica

O frontend suporta modo de demonstracao sem API:

- `NEXT_PUBLIC_OFFLINE_DEMO=true`
- autenticacao offline configuravel via `NEXT_PUBLIC_OFFLINE_DEMO_EMAIL` e `NEXT_PUBLIC_OFFLINE_DEMO_PASSWORD`
- mocks que reproduzem dashboard, alertas e acompanhamento operacional

Para exposicao temporaria fora da rede local:

- `scripts/start-public-demo.ps1`
- URL gravada em `public-url.txt`
