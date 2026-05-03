# Backend de referidos SNC con PostgreSQL

Este backend registra referidores en PostgreSQL, verifica compras reales en BNB Smart Chain por `txHash` y calcula automáticamente el 5% de comisión.

## Cómo funciona

1. El usuario conecta wallet.
2. La web muestra `Recomiéndanos y gana`.
3. El backend crea un enlace tipo `https://tuweb.com/?ref=snc_xxxxx`.
4. Si otra persona compra usando ese enlace, el frontend envía el `txHash` al backend.
5. El backend verifica en BSC:
   - que la transacción existe,
   - que fue exitosa,
   - que fue enviada a `SALE_RECEIVER_ADDRESS`,
   - que el comprador coincide,
   - que envió BNB.
6. Solo si la compra se verifica, PostgreSQL guarda la compra y calcula la comisión del 5%.

Los clicks del enlace no generan comisión.

## Instalación local

Entra a la carpeta backend:

```powershell
cd backend
npm install
Copy-Item .env.example .env
notepad .env
```

Edita `.env` y configura:

```env
DATABASE_URL=postgresql://postgres:TU_PASSWORD@localhost:5432/snc_presale
DATABASE_SSL=false
SALE_RECEIVER_ADDRESS=0xTU_WALLET_DE_RECAUDO_REAL
ADMIN_KEY=tu_clave_admin_segura
SNC_PER_BNB=12500
PRESALE_TOKENS_FOR_SALE=65000000
```

Luego inicia:

```powershell
npm start
```

Abre:

```text
http://localhost:3001
```

Admin:

```text
http://localhost:3001/admin-referidos.html
```

## Probar conexión

```text
http://localhost:3001/api/health
```

Debe responder `ok: true`.



## Total recaudado de la preventa

El endpoint público:

```text
http://localhost:3001/api/presale/stats
```

suma automáticamente todas las compras confirmadas guardadas en PostgreSQL.

La barra de progreso empieza en `0` si la tabla `purchases` está vacía. Cuando una compra real se confirma y el backend registra el `txHash`, el frontend vuelve a consultar el total y actualiza la barra en USDT.

El objetivo se calcula así:

```text
65.000.000 SNC / 12.500 SNC por BNB = 5.200 BNB objetivo
```

Después el frontend convierte ese total a USDT usando el precio BNB/USDT.

## PostgreSQL en producción

En Render, Neon, Supabase o Railway configura estas variables:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
DATABASE_SSL=true
SALE_RECEIVER_ADDRESS=0xTU_WALLET_DE_RECAUDO_REAL
ADMIN_KEY=tu_clave_admin_segura
PUBLIC_SITE_URL=https://tu-dominio.com
CORS_ORIGIN=https://tu-dominio.com
```

El backend crea automáticamente las tablas al iniciar.

## Tablas creadas

- `referrers`
- `purchases`
- `payouts`

## Importante

El backend calcula cuánto se debe pagar. No envía BNB automáticamente porque eso implicaría guardar una private key en el servidor. El pago del referido se hace manualmente y luego puedes marcarlo como pagado desde el endpoint admin.
