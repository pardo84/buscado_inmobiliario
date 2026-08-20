# 🏡 Bot de Búsqueda y Seguimiento de Viviendas (Telegram)

Bot de Telegram inteligente para la **búsqueda continua, alertas inmediatas y seguimiento de precios** de inmuebles (pisos, casas, chalets, dúplex, áticos, parkings, terrenos, etc.) en **Granollers**, **La Roca del Vallès**, **Cardedeu** y **Les Franqueses del Vallès**.

Cubre portales líderes (**Pisos.com, Fotocasa, Habitaclia**), **inmuebles de bancos/embargos** (Servihabitat, Solvia, Aliseda, Haya) e inmobiliarias de la comarca del Vallès Oriental.

---

## ✨ Características Principales

1. **Configuración 100% desde Telegram**:
   - Menús interactivos con botones inline (`/start`, `/rutinas`, `/seguimientos`, `/buscar_ahora`, `/stats`).
   - Asistente paso a paso (`/crear_rutina`) para configurar nuevas búsquedas automáticas con filtros visuales.

2. **Filtros Granulares por Zona**:
   - **Granollers** (posibilidad de buscar en todo el municipio o filtrar por barrios: *Centre, Font Verda, Tres Torres, Congost, Ponent, Can Bassa, Palou, Sant Miquel, Can Mònic, Lledoner, Terra Alta, Joan Prim*).
   - **Cardedeu**
   - **La Roca del Vallès**
   - **Les Franqueses del Vallès** (*Corró d'Avall, Bellavista, etc.*)

3. **Tipos de Inmuebles y Operación**:
   - Pisos / Apartamentos, Casas / Chalets / Torres, Dúplex, Áticos, Parkings / Garajes, Terrenos / Solares, Locales.
   - Venta / Compra o Alquiler.
   - Filtro de precio máximo / mínimo, habitaciones mínimas, m², extras (ascensor, parking, terraza, piscina).
   - Filtro especial para **Activos Bancarios / Embargos** (incluir, excluir o buscar solo bancos).

4. **Notificaciones Enriquecidas**:
   - Foto del inmueble, título, precio, precio/m², barrio, habitaciones, baños, m², inmobiliaria y **enlace directo con hipervínculo**.
   - Botón directo `⭐ Seguir Anuncio` para añadirlo al radar de seguimiento con un solo toque.

5. **Radar de Seguimiento de Inmuebles (`⭐ Seguimientos`)**:
   - Monitoreo continuo de anuncios guardados.
   - 📉 **Alerta inmediata de bajada de precio** (con cálculo de rebaja en € y en %).
   - 📈 **Alerta de subida de precio**.
   - 🔴 **Alerta si el anuncio desaparece, se vende o se reserva**.
   - Posibilidad de pegar **cualquier enlace directo** de un portal en el chat para ponerlo en seguimiento automático.

6. **Frecuencias Autónomas en Segundo Plano**:
   - Rastreo automático programado (cada 15m, 30m, 1h, 2h o 1 vez al día).
   - Base de datos SQLite integrada con deduplicación para no repetir notificaciones ya enviadas.

---

## 🚀 Puesta en Marcha Rápida

### 1. Requisitos
- [Node.js](https://nodejs.org/) (versión 18, 20 o superior).
- Un bot de Telegram creado en [@BotFather](https://t.me/botfather).

### 2. Configurar el Token de Telegram
1. Abre Telegram y busca a [@BotFather](https://t.me/botfather).
2. Envía `/newbot`, ponle un nombre y un usuario (ejemplo: `MiBuscadorViviendaBot`).
3. Copia el token que te dé (ejemplo: `7123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).
4. Abre el archivo `.env` en la carpeta del proyecto y pega tu token:
   ```env
   TELEGRAM_BOT_TOKEN=tu_token_aqui
   ```

### 3. Iniciar el Bot
Ejecuta en tu terminal:
```bash
npm start
```
*(o para modo desarrollo con recarga automática)*:
```bash
npm run dev
```

¡Listo! Abre Telegram, busca tu bot y escribe `/start`.

---

## 📱 Comandos del Bot en Telegram

| Comando | Descripción |
| :--- | :--- |
| `/start` | Abre el panel principal interactivo con botones. |
| `/crear_rutina` | Inicia el asistente visual paso a paso para crear una nueva búsqueda. |
| `/rutinas` | Lista tus rutinas configuradas (permite pausar, activar, buscar o eliminar). |
| `/seguimientos` | Muestra los inmuebles que tienes en seguimiento de precio. |
| `/buscar_ahora` | Ejecuta un rastreo inmediato en tiempo real. |
| `/stats` | Muestra el estado del sistema y número de inmuebles monitorizados. |
| `/help` | Muestra la guía de ayuda y consejos de uso. |

---

## 🛠️ Estructura del Código

```
├── src/
│   ├── index.ts                     # Punto de entrada y arranque
│   ├── config.ts                    # Carga de variables de entorno
│   ├── database/                    # Persistencia en SQLite
│   │   ├── db.ts                    # Conexión SQLite y esquema
│   │   ├── schema.sql               # Esquema de tablas e índices
│   │   ├── users.repo.ts            # Repositorio de usuarios
│   │   ├── routines.repo.ts         # Repositorio de rutinas
│   │   ├── listings.repo.ts         # Caché de viviendas y snapshots de precio
│   │   └── tracking.repo.ts         # Inmuebles en seguimiento
│   ├── scrapers/                    # Motor de extracción multi-portal
│   │   ├── base.scraper.ts          # Cliente HTTP con headers realistas
│   │   ├── habitaclia.scraper.ts    # Extractor de Habitaclia
│   │   ├── fotocasa.scraper.ts      # Extractor de Fotocasa
│   │   ├── pisos.scraper.ts         # Extractor de Pisos.com
│   │   ├── bank.scraper.ts          # Extractor de inmuebles de bancos
│   │   ├── tracker.scraper.ts       # Verificador individual de precio/estado
│   │   └── index.ts                 # Orquestador unificado
│   ├── bot/                         # Lógica del Bot de Telegram (GrammY)
│   │   ├── bot.ts                   # Configuración del bot
│   │   ├── context.ts               # Tipos de sesión y contexto
│   │   ├── formatters/              # Formateador de mensajes con fotos y botones
│   │   ├── menus/                   # Menús de navegación interactivos
│   │   ├── conversations/           # Asistente de creación de rutinas
│   │   └── handlers/                # Manejadores de comandos, botones y enlaces
│   ├── scheduler/                   # Planificador cron en segundo plano
│   │   └── scheduler.service.ts     # Ejecutor de rutinas y rastreo de precios
│   └── utils/                       # Utilidades de texto, precios y loggers
```
