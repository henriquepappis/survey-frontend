# Survey Frontend (React + TypeScript)

Frontend público para exibir pesquisas de satisfação e coletar votos. Construído com React, TypeScript e Vite.

## Requisitos
- Node.js 18+ e npm

## Como rodar
1) Instalar dependências:
```bash
npm install
```
2) (Opcional) Configurar a URL da API no `.env`:
```bash
echo "VITE_API_BASE_URL=http://localhost:8080" > .env
```
Se não informado, as chamadas usam o mesmo host/porta do front.
3) Ambiente de desenvolvimento com HMR:
```bash
npm run dev
```
4) Build de produção:
```bash
npm run build
```
5) Preview do build:
```bash
npm run preview
```
6) Lint:
```bash
npm run lint
```

## Estrutura inicial
- `src/main.tsx`: monta a aplicação React.
- `src/App.tsx`: página raiz para evoluir a UI das pesquisas.
- `public/`: assets estáticos.
- `vite.config.ts` e `tsconfig*.json`: configuração do Vite e TypeScript.

## Próximos passos
- Integrar com a API de pesquisas (Spring Boot) para listar pesquisas, perguntas e registrar votos.
- Definir estado global/queries (ex.: React Query) para lidar com cache e loading.
- Criar layout público (ex.: página de boas-vindas, formulário de voto, confirmação).
