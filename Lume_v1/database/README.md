# Banco de dados e API

A aplicação usa **SQLite local**. O banco é criado automaticamente em `database/lume.db` quando o servidor inicia. O schema é criado em `server/db.js` e está documentado em `schema.sqlite.sql`.

## Executar localmente

Na raiz do projeto:

```bash
npm ci
npm start
```

A API ficará disponível em `http://localhost:3000`.

```bash
curl http://localhost:3000/api/health
```

A resposta informa se o SQLite foi aberto e quantos produtos ativos existem.

## Pedidos

`POST /api/orders` recalcula os preços a partir do banco e grava o pedido e seus itens em uma transação serializada. O corpo esperado é:

```json
{
  "customerName": "Marina",
  "tableNumber": 12,
  "paymentMethod": "pix",
  "serviceFeeEnabled": true,
  "items": [{ "productId": "entradas-1", "quantity": 2 }]
}
```

O servidor valida o nome, a mesa, o pagamento, o tipo booleano da taxa, os produtos ativos e as quantidades. Itens repetidos são consolidados antes da persistência. Valores são arredondados para duas casas decimais.

## Persistência e deploy

No Docker Compose, o volume `sqlite_data` preserva o banco entre reinícios. Em serviços sem disco persistente, como um deploy Render sem volume, o arquivo pode ser recriado em um redeploy. Portanto, essa configuração é adequada para demonstração ou uso pequeno. Para produção com múltiplos processos ou necessidade de backup durável, migre para um banco gerenciado.

O banco de runtime não é fonte de catálogo: categorias e produtos são sincronizados a partir de `public/menu-data.js` na inicialização. Faça backup do arquivo SQLite antes de atualizações importantes quando estiver usando o Compose.
