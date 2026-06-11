# Security & Architecture Lessons Learned

## 1. Client-side Price Manipulation

### Problema
El precio era enviado desde el frontend a la API de Mercado Pago.

### Riesgo
Un usuario podía modificar `unitPrice` desde DevTools y pagar menos.

### Cómo se detectó
Auditoría manual intentando manipular el flujo de compra desde el navegador.

### Solución
Validación server-side de todos los productos contra una lista de precios autorizada.

### Aprendizaje
Nunca confiar en valores económicos enviados por el cliente.

## 2. Payment Status Forgery

### Problema
La URL de retorno incluía `status=approved`.

### Riesgo
Un usuario podía acceder manualmente a la página de éxito.

### Cómo se detectó
Análisis del flujo post-pago.

### Solución
Validar pagos contra Mercado Pago mediante webhook y verificación server-side.

### Aprendizaje
Los parámetros de URL no constituyen evidencia de pago.

## 3. Secret Exposure

### Problema
Un token de Mercado Pago fue incluido accidentalmente en PLAN.md.

### Riesgo
Compromiso de credenciales.

### Cómo se detectó
Revisión del repositorio.

### Solución
Revocación inmediata del token, generación de nuevas credenciales y limpieza del historial.

### Aprendizaje
Los secretos deben vivir exclusivamente en variables de entorno y deben auditarse antes de cada push.

## 4. Origin Validation

### Problema
Los endpoints aceptaban requests de cualquier origen.

### Riesgo
Spam de pedidos o abuso de APIs.

### Solución
Validación explícita del header Origin.

### Aprendizaje
No asumir que una API solo será consumida por el frontend oficial.
