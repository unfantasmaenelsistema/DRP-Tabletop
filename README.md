<div align="center">
  <a href="https://www.unfantasmaenelsistema.com/" target="_blank" rel="noopener noreferrer">
    <img src="public/assets/aistudio/icono_81a3db5b.png" alt="Logo Un Fantasma en el Sistema — GhostAcademy" width="88" />
  </a>

  # DRP Tabletop — Centro de Mando y Simulación SOC

  **Simulador educativo 100% frontend de Planes de Recuperación ante Desastres (Disaster Recovery Plan) estilo Centro de Operaciones de Seguridad (SOC)**

  [![GitHub Pages Ready](https://img.shields.io/badge/Deploy-GitHub%20Pages-0ea5e9?style=flat-square&logo=github)](./.github/workflows/deploy.yml)
  [![Vanilla JS](https://img.shields.io/badge/Stack-Vanilla%20JS%20%2B%20Tailwind%20%2B%20D3.js-10b981?style=flat-square)](#arquitectura-y-stack-técnico)
  [![100% Client-Side](https://img.shields.io/badge/Backend-Ninguno%20(100%25%20Local)-64748b?style=flat-square)](#)
  [![License: MIT](https://img.shields.io/badge/Licencia-MIT-f59e0b?style=flat-square)](./LICENSE)

  Desarrollado para **[GhostAcademy — Un Fantasma en el Sistema](https://www.unfantasmaenelsistema.com/)**
</div>

---

## Descripción General

**DRP Tabletop** es un simulador interactivo de ejercicios de mesa (*Tabletop Exercises*) diseñado para entrenar a equipos de seguridad, sistemas y continuidad de negocio en la toma de decisiones críticas bajo presión temporal.

La aplicación funciona **íntegramente en el navegador** (sin backend ni llamadas externas a APIs de datos), combinando telemetría de impacto económico en tiempo real, un motor de turnos con *Injects* y consecuencias ocultas, indicadores dinámicos de **BIA (Business Impact Analysis)**, visualización analítica con **D3.js** y un informe ejecutivo **After Action Report (AAR)** exportable a PDF y Markdown.

---

## Capturas Reales de la Aplicación

### 1. Dashboard de Mando (Estado de Preparación)
Selector de escenarios integrados, KPIs operativos en tiempo real, barra de estrés y matriz BIA inicial.

![Dashboard de Mando en Preparación](docs/screenshots/01-dashboard-preparacion.png)

### 2. Motor de Turnos, Injects y Registro SOC con D3.js
Gestión de *Injects* bajo cuenta regresiva de 60 segundos, decisiones con impacto oculto, barra de estrés con transición cromática progresiva y gráfico de barras agrupadas en D3.js por severidad y turno.

![Incidente Activo y Triaje](docs/screenshots/02-incidente-activo-triaje.png)

### 3. Escalado Ejecutivo por Incumplimiento de SLA / RTO
Cuando un servicio crítico supera su RTO teórico, el simulador pausa el reloj de decisión, activa el banner rojo de alerta y lanza el modal de llamada urgente de Dirección o clientes.

![Modal de Escalado Crítico SLA/RTO](docs/screenshots/03-alerta-sla-modal.png)

### 4. After Action Report (AAR), Rango Corporativo y CTF Mode
Evaluación de 0 a 100 puntos, medidor circular SVG, comparativa visual Teórico vs. Real de RTO/RPO por servicio, desglose de aciertos/errores, Lecciones Aprendidas automatizadas y generación del token `CTF{DRP_M4st3r_...}`.

![After Action Report y Flag CTF](docs/screenshots/04-after-action-report-ctf.png)

---

## Funcionalidades Principales

- **3 Escenarios Corporativos Integrados**:
  1. `DRP-TTX-2026-01` — **Ataque de Ransomware en la sede principal** (*Grupo Ibérico de Logística S.A.*): movimiento lateral SMB/445, compromiso de Directorio Activo, Pasarela de Pagos y evaluación de copias inmutables WORM.
  2. `DRP-TTX-2026-02` — **Caída de Región Cloud y Corrupción de Base de Datos** (*Fintech Ibérica Pay S.L.*): failover multi-región, protección de réplicas PostgreSQL, *Point-in-Time Recovery (PITR)*, idempotencia en Kafka y notificación regulatoria DORA.
  3. `DRP-TTX-2026-03` — **Compromiso Supply Chain en Pipeline CI/CD** (*NubeSalud Digital S.A.*): rollback de artefactos firmados (Cosign/SLSA), rotación de secretos en Vault, verificación de integridad WORM clínica y notificación RGPD Art. 33.
- **Panel de Estado Operativo (4 KPIs en tiempo real)**:
  - **Tiempo Inactivo (RTO Real)** y recuento de servicios críticos afectados.
  - **Pérdida de Datos (RPO Real)** acumulada por decisiones.
  - **Coste Económico Acumulado** (lucro cesante por minuto de caída + coste directo de decisiones).
  - **Nivel de Estrés del Equipo** con transición cromática dinámica (`emerald` → `lime` → `amber` → `orange` → `red`) y marcador de umbral crítico al `80%`.
- **Motor de Presión Temporal (60 s por turno)**:
  - Temporizador visual por turno con velocidades simuladas (`1x`, `5x`, `15x`) y pausa/reanudación.
  - Si el tiempo se agota, el simulador aplica automáticamente la opción más adversa con penalización añadida de RTO, RPO, coste y estrés.
- **Matriz BIA Interactiva**:
  - Comparativa continua de RTO/RPO teórico frente a real con cambio de estado visual (`verde` → `ámbar` → `rojo` pulsante).
  - Filtros (`Todos`, `Nivel Crítico`, `Afectados`) e inspector técnico inferior con responsable, dependencias y estrategia de recuperación.
- **Consola de Eventos SOC + Gráfico D3.js v7**:
  - Gráfico de barras agrupadas interactivo (*Crítico*, *Alerta*, *Info* a través de `Prep` y `T1..T5`) con *tooltip* y clic para filtrar la consola.
  - Exportación del registro completo a archivo `.txt`.
- **After Action Report (AAR) Completo**:
  - **Puntuación 0–100** ponderada en 3 pilares: **RTO (35 pts)**, **RPO (30 pts)** y **Dinero Salvado (35 pts)**.
  - **Rangos corporativos**: `CISO Legendario` (`≥ 90`), `Arquitecto de Resiliencia` (`81–89`), `Analista SOC Senior` (`65–80`), `Administrador Novato` (`45–64`) y `Despedido` (`< 45`).
  - **CTF Mode (GhostAcademy)**: Al superar **80/100 puntos**, genera un token verificable `CTF{DRP_M4st3r_<PUNTOS>PTS_<HASH>}`.
  - Exportación optimizada a **PDF** (`window.print()` con `@media print` en blanco limpio), **Markdown (`.md`)** y **Escenario Base64**.
- **Persistencia y Modo Docente (Base64 + JSON)**:
  - Guardado automático de sesión en `localStorage`.
  - Botones **Cargar Escenario desde String** y **Exportar Escenario (Base64)** / **Descargar JSON editable** para que instructores diseñen y compartan escenarios personalizados.
- **Guía Táctica DRP y Atajos de Teclado**:
  - Modal de referencia rápida accesible desde la barra superior o pulsando `?`.

---

## Atajos de Teclado

| Tecla | Acción |
| :---: | :--- |
| `A`–`D` o `1`–`4` | Ejecutar opción del turno activo (*Decisiones Bajo Presión*) |
| `P` | Pausar o reanudar la simulación |
| `?` | Abrir o cerrar la Guía Táctica DRP y glosario |
| `Esc` | Cerrar el modal activo (Guía, Base64 o Alerta SLA) |

---

## Arquitectura y Stack Técnico

- **HTML5 semántico** (`index.html`) con accesibilidad ARIA y diseño responsive.
- **CSS3 + Tailwind CSS CDN** (`styles.css` + `@media print` dedicado para informes PDF y soporte `prefers-reduced-motion`).
- **Vanilla JavaScript ES Module** (`app.js`) sin dependencias de frameworks ni servidor.
- **D3.js v7** (vía CDN) para el gráfico de frecuencia de alertas en el Registro SOC.
- **Vite** configurado con `base: './'` (`vite.config.ts`) para empaquetado estático compatible con subrutas de GitHub Pages.

---

## Despliegue en GitHub Pages y Desarrollo Local

### Despliegue automático con GitHub Actions (Recomendado)
Este repositorio incluye el flujo [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml):
1. Sube el proyecto a la rama `main` de tu repositorio en GitHub.
2. Ve a **Settings → Pages → Build and deployment** y selecciona **GitHub Actions** como fuente (*Source*).
3. Cada *push* a `main` compilará `dist/` con `npm run build` y publicará la web automáticamente.

### Ejecución local
```bash
# 1. Instalar dependencias de compilación (Vite)
npm install

# 2. Levantar servidor local de desarrollo (puerto 3000)
npm run dev

# 3. Generar build estático para producción en /dist
npm run build
```

> También puedes abrir directamente el proyecto con cualquier servidor estático (`npx serve .`), ya que `index.html`, `styles.css` y `app.js` funcionan de forma autónoma en el navegador.

---

## Autoría y Licencia

- Proyecto educativo creado para **[Un Fantasma en el Sistema — GhostAcademy](https://www.unfantasmaenelsistema.com/)**.
- Distribuido bajo licencia [MIT](./LICENSE).
