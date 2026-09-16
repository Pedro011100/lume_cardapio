# Lume — Cardápio Digital

Aplicação web de cardápio digital construída com HTML, CSS, JavaScript, Express e SQLite. A interface oferece catálogo com busca, filtros, paginação, carrinho local e envio de pedidos para a API.

## Estrutura

- `public/index.html`: estrutura da interface.
- `public/style.css`: estilos responsivos.
- `public/app.js`: catálogo, busca, carrinho e checkout.
- `public/menu-data.js`: categorias e 150 produtos.
- `server/index.js`: API Express e validações de pedidos.
- `server/db.js`: inicialização SQLite e transações serializadas.
- `database/schema.sqlite.sql`: schema de referência do SQLite.
- `docker-compose.yml`: execução com volume persistente local.

## Requisitos

- Node.js `22.5.0` ou superior.
- npm.
- Docker opcional para execução em container.

## Execução local

```bash
npm ci
npm start
```

Abra `http://localhost:3000` e verifique a API com:

```bash
curl http://localhost:3000/api/health
```

O banco `database/lume.db` será criado automaticamente. As categorias e os 150 produtos serão sincronizados a partir de `public/menu-data.js`.

## Testes disponíveis

```bash
npm run check
npm audit --omit=dev
```

`npm run check` verifica a sintaxe dos arquivos JavaScript. O projeto não exige banco externo para funcionar.

## Docker Compose

```bash
cp .env.example .env
docker compose up -d --build
```

A aplicação ficará disponível em `http://localhost:3000` ou na porta definida por `PORT`. O volume `sqlite_data` preserva o arquivo SQLite entre reinícios.

Para acompanhar os logs:

```bash
docker compose logs -f app
```

Para parar a aplicação:

```bash
docker compose down
```

O volume não é apagado por `docker compose down`. Remova-o somente se quiser apagar os pedidos persistidos:

```bash
docker compose down -v
```

## Render

O arquivo `render.yaml` configura um serviço Docker usando a porta fornecida pelo Render. Sem disco persistente, o SQLite pode ser recriado em um redeploy. Use essa opção para demonstração. Para produção, prefira um banco gerenciado ou adicione armazenamento persistente e backup.

## API de pedidos

Exemplo:

```bash
curl -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{
    "customerName": "Marina",
    "tableNumber": 12,
    "paymentMethod": "pix",
    "serviceFeeEnabled": true,
    "items": [{"productId": "entradas-1", "quantity": 2}]
  }'
```

A API consulta os produtos ativos no banco, consolida itens repetidos, recalcula subtotal, taxa e total, e grava tudo de forma transacional. Ela não confia em preços enviados pelo navegador.

## Observação de produção

Esta versão foi preparada para demonstração e operação pequena. A fila de escrita evita conflitos de transação dentro de um único processo Node.js. Para escalar horizontalmente ou suportar grande volume, migre a persistência para um banco servidor com pool de conexões, backups e controle de concorrência nativo.
