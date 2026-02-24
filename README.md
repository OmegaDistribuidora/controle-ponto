# Sistema de Registro de Ponto

Sistema full-stack com:
- `frontend` em React (Vite), com camera ativada automaticamente na tela inicial.
- `backend` em Node.js + Express.
- banco Postgres (local para testes e Railway em producao).
- criacao automatica das tabelas na primeira execucao.

## Regras implementadas

- 3 perfis: `RH`, `ADMIN`, `USER`.
- Seed inicial automatico:
  - 1 login RH
  - 1 login Admin
  - setores iniciais:
    - `Licitacao - Barroso` (07:30 / 17:30)
    - `Administrativo - Barroso` (08:00 / 18:00)
  - empresas iniciais: `Orion`, `Omega`
  - cargo inicial: `Licitacao`
- Timezone de negocio fixo: `America/Fortaleza`.
- Batida por CPF sem login (na pagina inicial), com foto da camera.
- Registro diario por usuario:
  - 1a batida do dia: `ENTRADA`
  - 2a batida do dia: `SAIDA`
  - maximo 2 batidas por dia.
- Tolerancia de 5 minutos (configuravel via env).
- Fora da tolerancia: status `PENDENTE` e RH/Admin decide `CONFIRMADO` ou `NEGADO`.
- Usuario ve os ultimos 50 registros com status e observacoes.
- RH/Admin:
  - painel de pendencias como primeira secao
  - historico completo com filtros (setor, cargo, empresa, nome/cpf, data, status)
  - CRUD de usuarios, setores, cargos, empresas
  - exportacao de relatorio geral e por usuario em Excel (`.xlsx`)
- Upload da foto:
  - Google Drive via OAuth quando configurado.
  - fallback local para testes sem OAuth (`/uploads/...`).

## Estrutura

- `backend`: API e regras de negocio
- `frontend`: interface React

## Executar localmente

1. Instale dependencias:
```bash
npm install
```

2. Configure variaveis:
- copie `backend/.env.example` para `backend/.env`
- copie `frontend/.env.example` para `frontend/.env`

3. Rode backend + frontend:
```bash
npm run dev
```

4. Acesse:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000/api/health`

## Logins iniciais (padrao)

Configuraveis via env no backend:
- RH: usuario `rh`, senha `Carlos@123`
- Admin: usuario `admin`, senha `Omega@123`

Usuarios comuns criados pelo RH:
- login = CPF
- senha inicial = 3 primeiros digitos do CPF

## Deploy Railway

Sugestao:
1. Criar um service para `backend` e outro para `frontend`.
2. Backend:
   - comando start: `npm run start -w backend`
   - configurar `DATABASE_URL` do Postgres Railway
   - configurar `DB_SSL=true`
   - configurar variaveis do Google Drive OAuth
3. Frontend:
   - build: `npm run build -w frontend`
   - publicar `frontend/dist` (ou usar service static no Railway)
   - `VITE_API_URL` apontando para URL publica do backend

## Personalizacao visual rapida

Para mudar identidade visual sem mexer em logica:
- cores/fonte/estilo: `frontend/src/styles.css` (variaveis em `:root`)
- nome/slogan/logo: `frontend/src/brand.js`

## Observacoes

- `cpf` e armazenado como `TEXT` no banco.
- Sistema foi desenhado para simplicidade de alteracao futura e manutencao.
