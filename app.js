/**
 * DRP Tabletop Simulator — Lógica principal y Motor de Turnos / Injects (Vanilla JS)
 * Simulador educativo 100% frontend para despliegue en GitHub Pages.
 */

'use strict';

const TURN_TIME_LIMIT_SECONDS = 60;
const SESSION_STORAGE_KEY = 'ghostacademy_drp_tabletop_v1';
const TIMEOUT_PENALTY = {
  rtoMinutes: 15,
  rpoMinutes: 10,
  costEur: 35000,
  stressDelta: 10,
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ==========================================================================
   1. ESTRUCTURA DE DATOS ESTÁTICA (JSON) DEL ESCENARIO BASE Y TURNOS
   ========================================================================== */

const DEFAULT_SCENARIO_DATA = {
  id: 'scn-ransomware-hq-01',
  code: 'DRP-TTX-2026-01',
  title: 'Ataque de Ransomware en la sede principal',
  organization: 'Grupo Ibérico de Logística S.A.',
  description:
    'A las 08:42 CET, los sistemas de detección en endpoint (EDR) reportan actividad anómala de cifrado masivo vía SMB en la VLAN de servidores centrales de la sede principal. Evalúa cada Inject bajo presión y gestiona la recuperación.',
  initialState: {
    phase: 'Preparación',
    downtimeSeconds: 0,
    realRpoMinutes: 0,
    accumulatedCostEur: 0,
    decisionCostEur: 0,
    teamStressPercent: 15,
  },
  biaServices: [
    {
      id: 'srv-ad-iam',
      name: 'Directorio Activo e Identidad (AD / IAM)',
      category: 'Infraestructura Core',
      criticality: 'Crítico',
      rtoMinutes: 60,
      rtoLabel: '1 h',
      rpoMinutes: 15,
      rpoLabel: '15 min',
      costPerMinuteEur: 850,
      initialStatus: 'Operativo',
      owner: 'Equipo de Sistemas e Identidad',
      dependencies: ['Controladores de Dominio HQ', 'DNS Interno', 'Federation SSO'],
      recoveryStrategy:
        'Aislamiento de controladores comprometidos, promoción desde réplica limpia en datacenter secundario y rotación de credenciales krbtgt.',
    },
    {
      id: 'srv-payments',
      name: 'Pasarela de Pagos y Facturación',
      category: 'Transaccional',
      criticality: 'Crítico',
      rtoMinutes: 30,
      rtoLabel: '30 min',
      rpoMinutes: 0,
      rpoLabel: '0 min (Síncrono)',
      costPerMinuteEur: 2100,
      initialStatus: 'Operativo',
      owner: 'Operaciones Financieras & DevSecOps',
      dependencies: ['Directorio Activo', 'Cluster HSM', 'Enlace MPLS Banco'],
      recoveryStrategy:
        'Conmutación automática (failover) al nodo de contingencia PCI-DSS aislado en región cloud independiente.',
    },
    {
      id: 'srv-erp',
      name: 'ERP Corporativo (SAP S/4HANA)',
      category: 'Operaciones Centrales',
      criticality: 'Crítico',
      rtoMinutes: 240,
      rtoLabel: '4 h',
      rpoMinutes: 15,
      rpoLabel: '15 min',
      costPerMinuteEur: 1250,
      initialStatus: 'Operativo',
      owner: 'Arquitectura SAP & Almacenamiento',
      dependencies: ['Directorio Activo', 'SAN Principal', 'Red Corporativa HQ'],
      recoveryStrategy:
        'Restauración desde snapshots inmutables (air-gapped) verificados tras validación forense de integridad.',
    },
    {
      id: 'srv-crm',
      name: 'CRM Comercial y Atención al Cliente',
      category: 'Comercial',
      criticality: 'Alto',
      rtoMinutes: 480,
      rtoLabel: '8 h',
      rpoMinutes: 60,
      rpoLabel: '1 h',
      costPerMinuteEur: 450,
      initialStatus: 'Operativo',
      owner: 'Plataforma Digital & Soporte',
      dependencies: ['Federation SSO', 'API Gateway', 'Base de Datos Clientes'],
      recoveryStrategy:
        'Reconfiguración de acceso federado mediante proveedor de identidad secundario en la nube.',
    },
    {
      id: 'srv-mail',
      name: 'Correo Corporativo y Colaboración',
      category: 'Comunicaciones',
      criticality: 'Medio',
      rtoMinutes: 240,
      rtoLabel: '4 h',
      rpoMinutes: 30,
      rpoLabel: '30 min',
      costPerMinuteEur: 300,
      initialStatus: 'Operativo',
      owner: 'Workplace & Seguridad',
      dependencies: ['Federation SSO', 'Relay SMTP'],
      recoveryStrategy:
        'Operación en modo contingencia cloud con bloqueo preventivo de adjuntos ejecutables y macros.',
    },
  ],
  initialLogs: [
    {
      timeOffsetSeconds: 0,
      level: 'INFO',
      source: 'SOC-PLATFORM',
      message: 'Escenario cargado: "Ataque de Ransomware en la sede principal" (DRP-TTX-2026-01).',
    },
    {
      timeOffsetSeconds: 0,
      level: 'INFO',
      source: 'BIA-ENGINE',
      message: '5 servicios críticos monitorizados. Todos los sistemas reportan estado Operativo.',
    },
    {
      timeOffsetSeconds: 0,
      level: 'INFO',
      source: 'DIRECTOR',
      message: 'Sistema en estado de Preparación. Pulsa "Iniciar Ejercicio" para activar el Turno 1.',
    },
  ],
  timelineEvents: [
    {
      delaySeconds: 0,
      onlyDuringTurnIndex: 0,
      level: 'CRITICAL',
      source: 'SIEM-EDR',
      message:
        'INCIDENTE ACTIVADO: Múltiples alertas de cifrado rápido detectadas en SRV-FILE-01 (sede principal). Extensión anómala ".locked_corp" observada.',
      stressDelta: 18,
      serviceChanges: [
        { serviceId: 'srv-ad-iam', newStatus: 'Degradado' },
        { serviceId: 'srv-erp', newStatus: 'Caído' },
      ],
    },
    {
      delaySeconds: 4,
      onlyDuringTurnIndex: 0,
      level: 'CRITICAL',
      source: 'NET-SOC',
      message:
        'Movimiento lateral confirmado vía SMB/445 y PsExec hacia controladores de dominio y segmento transaccional.',
      stressDelta: 10,
      serviceChanges: [{ serviceId: 'srv-payments', newStatus: 'Caído' }],
    },
  ],
  turns: [
    {
      turnNumber: 1,
      id: 'turn-1-detection',
      phaseName: 'Detección',
      phaseFullTitle: 'Turno 1: Detección y Triaje Inicial',
      inject: {
        code: 'INJ-01',
        severity: 'Crítica',
        source: 'SOC Tier 2 / EDR',
        headline: 'Cifrado activo en VLAN de servidores centrales',
        description:
          'El EDR confirma cifrado activo en servidores de archivos de la sede principal (SRV-FILE-01) y tráfico anómalo SMB/445 hacia el controlador de dominio. El ERP ya no responde y el equipo de soporte reporta bloqueos masivos de sesión.',
      },
      decisions: [
        {
          id: 't1-opt-a',
          key: 'A',
          title: 'Aislamiento selectivo vía EDR y bloqueo de SMB/445 en firewall interno',
          summary:
            'Contiene automáticamente los hosts con alertas activas y cierra puertos laterales manteniendo viva la segmentación de servicios no afectados.',
          hiddenImpact: {
            rtoImpactMinutes: 10,
            rpoImpactMinutes: 0,
            costImpactEur: 9500,
            stressDelta: 4,
            evaluation: 'optimal',
            whatWentWell:
              'Aislamiento rápido y quirúrgico que bloqueó la propagación lateral SMB/445 sin derribar servicios críticos no comprometidos.',
            whatWentWrong:
              'Ninguno significativo; el tiempo inicial de respuesta mantuvo el ERP fuera de servicio brevemente.',
            lessonRecommendation: '',
            outcomeSummary:
              'La contención selectiva frenó el cifrado en el segmento financiero sin cortar las sesiones de respaldo en la nube.',
            logLevel: 'INFO',
            serviceChanges: [
              { serviceId: 'srv-ad-iam', newStatus: 'Degradado' },
              { serviceId: 'srv-erp', newStatus: 'Caído' },
            ],
          },
        },
        {
          id: 't1-opt-b',
          key: 'B',
          title: 'Desconexión física inmediata de todos los troncales de red en sede principal',
          summary:
            'Corta toda conectividad entre la sede principal y el centro de datos secundario de forma abrupta para evitar propagación.',
          hiddenImpact: {
            rtoImpactMinutes: 25,
            rpoImpactMinutes: 10,
            costImpactEur: 24000,
            stressDelta: 8,
            evaluation: 'suboptimal',
            whatWentWell:
              'Detuvo con certeza la propagación física del ransomware hacia enlaces externos.',
            whatWentWrong:
              'El corte abrupto de troncales interrumpió sesiones activas y generó 10 minutos de pérdida de transacciones y mayor tiempo de recuperación.',
            lessonRecommendation:
              'En contención inicial, prioriza la microsegmentación y el aislamiento selectivo vía EDR antes de desconectar troncales completos que amplifican el impacto BIA.',
            outcomeSummary:
              'El corte físico detuvo la propagación lateral, pero interrumpió transacciones en curso y dejó incomunicadas las sedes remotas.',
            logLevel: 'WARN',
            serviceChanges: [
              { serviceId: 'srv-ad-iam', newStatus: 'Caído' },
              { serviceId: 'srv-erp', newStatus: 'Caído' },
              { serviceId: 'srv-crm', newStatus: 'Degradado' },
            ],
          },
        },
        {
          id: 't1-opt-c',
          key: 'C',
          title: 'Ejecutar análisis forense en vivo durante 45 minutos antes de aislar',
          summary:
            'Mantiene los servidores conectados temporalmente para volcar memoria RAM y trazar al atacante antes de aplicar bloqueos.',
          hiddenImpact: {
            rtoImpactMinutes: 45,
            rpoImpactMinutes: 25,
            costImpactEur: 58000,
            stressDelta: 15,
            evaluation: 'critical',
            whatWentWell:
              'Se recolectaron artefactos volátiles iniciales para el informe forense posterior.',
            whatWentWrong:
              'Demorar 45 minutos el aislamiento permitió que el ransomware cifrara controladores de dominio, pagos y CRM, disparando el RTO y el coste.',
            lessonRecommendation:
              'Se perdió demasiado tiempo en la contención inicial. Se recomienda aislar los segmentos comprometidos antes de iniciar la investigación forense en vivo.',
            outcomeSummary:
              'Priorizar la recolección forense sin aislar permitió que el ransomware avanzara sobre el controlador primario y el CRM.',
            logLevel: 'CRITICAL',
            serviceChanges: [
              { serviceId: 'srv-ad-iam', newStatus: 'Caído' },
              { serviceId: 'srv-payments', newStatus: 'Caído' },
              { serviceId: 'srv-erp', newStatus: 'Caído' },
              { serviceId: 'srv-crm', newStatus: 'Caído' },
            ],
          },
        },
      ],
    },
    {
      turnNumber: 2,
      id: 'turn-2-containment',
      phaseName: 'Contención',
      phaseFullTitle: 'Turno 2: Contención e Identidad',
      inject: {
        code: 'INJ-02',
        severity: 'Crítica',
        source: 'Equipo IAM & Operaciones Financieras',
        headline: 'Compromiso de credenciales privilegiadas y caída transaccional',
        description:
          'Las evidencias muestran uso de una cuenta de servicio con privilegios de Administrador de Dominio. La Pasarela de Pagos falla al validar tokens contra el Directorio Activo y la facturación está detenida.',
      },
      decisions: [
        {
          id: 't2-opt-a',
          key: 'A',
          title: 'Activar failover de Pasarela de Pagos a cloud aislada y revocar tokens SSO',
          summary:
            'Conmuta los cobros al nodo de contingencia PCI-DSS independiente y fuerza cierre global de sesiones activas en IAM.',
          hiddenImpact: {
            rtoImpactMinutes: 15,
            rpoImpactMinutes: 0,
            costImpactEur: 14000,
            stressDelta: -4,
            evaluation: 'optimal',
            whatWentWell:
              'Conmutación rápida del servicio con mayor impacto económico (2.100 €/min) y revocación inmediata de tokens Kerberos/SSO.',
            whatWentWrong:
              'El correo corporativo permaneció degradado temporalmente durante el reajuste de federación.',
            lessonRecommendation: '',
            outcomeSummary:
              'La Pasarela de Pagos recuperó operatividad en el nodo cloud aislado y se invalidaron los tokens Kerberos comprometidos.',
            logLevel: 'INFO',
            serviceChanges: [
              { serviceId: 'srv-payments', newStatus: 'Operativo' },
              { serviceId: 'srv-mail', newStatus: 'Degradado' },
            ],
          },
        },
        {
          id: 't2-opt-b',
          key: 'B',
          title: 'Bloquear todas las operaciones hasta recibir auditoría de equipo DFIR externo',
          summary:
            'Congela cualquier cambio de infraestructura durante la llegada y diagnóstico inicial del proveedor externo contratado.',
          hiddenImpact: {
            rtoImpactMinutes: 85,
            rpoImpactMinutes: 10,
            costImpactEur: 112000,
            stressDelta: 14,
            evaluation: 'critical',
            whatWentWell:
              'Se evitó modificar evidencia en sistemas locales antes de la llegada del equipo externo.',
            whatWentWrong:
              'Bloquear el failover de la Pasarela de Pagos provocó el incumplimiento del SLA de 30 min y un coste de lucro cesante superior a 112.000 €.',
            lessonRecommendation:
              'Preautoriza en el DRP la conmutación a entornos cloud aislados (failover) para servicios críticos sin esperar a la llegada del proveedor DFIR externo.',
            outcomeSummary:
              'La espera del equipo externo mantuvo paralizada la Pasarela de Pagos y elevó significativamente el coste por lucro cesante.',
            logLevel: 'CRITICAL',
            serviceChanges: [
              { serviceId: 'srv-payments', newStatus: 'Caído' },
              { serviceId: 'srv-crm', newStatus: 'Caído' },
              { serviceId: 'srv-mail', newStatus: 'Degradado' },
            ],
          },
        },
        {
          id: 't2-opt-c',
          key: 'C',
          title: 'Restablecer contraseñas críticas manualmente sin aislar el AD secundario',
          summary:
            'Intenta acelerar la vuelta al servicio rotando solo cuentas administrativas manteniendo la replicación del dominio activa.',
          hiddenImpact: {
            rtoImpactMinutes: 35,
            rpoImpactMinutes: 30,
            costImpactEur: 49000,
            stressDelta: 11,
            evaluation: 'suboptimal',
            whatWentWell:
              'Se intentó reducir el tiempo de bloqueo administrativo mediante rotación inmediata de claves.',
            whatWentWrong:
              'Mantener la replicación activa del Directorio Activo permitió persistencia del atacante y retrasó la recuperación real de la identidad.',
            lessonRecommendation:
              'Ante compromiso de credenciales de dominio, corta la replicación sospechosa y rota doblemente la cuenta krbtgt antes de reabrir servicios.',
            outcomeSummary:
              'La replicación activa reintrodujo persistencia del atacante, obligando a reiniciar el proceso de contención de identidad.',
            logLevel: 'WARN',
            serviceChanges: [
              { serviceId: 'srv-ad-iam', newStatus: 'Caído' },
              { serviceId: 'srv-payments', newStatus: 'Caído' },
            ],
          },
        },
      ],
    },
    {
      turnNumber: 3,
      id: 'turn-3-backups',
      phaseName: 'Backups',
      phaseFullTitle: 'Turno 3: Evaluación de Copias de Seguridad',
      inject: {
        code: 'INJ-03',
        severity: 'Alta',
        source: 'Infraestructura & Almacenamiento',
        headline: 'Backups on-premise cifrados; copias inmutables disponibles en la nube',
        description:
          'Los backups on-premise alojados en el NAS de la sede principal están completamente cifrados. Sin embargo, disponemos de copias inmutables (WORM) en la nube con un punto de recuperación de hace 15 minutos y una cinta offline del viernes pasado.',
      },
      decisions: [
        {
          id: 't3-opt-a',
          key: 'A',
          title: 'Restaurar desde copias inmutables en la nube tras escaneo limpio en sandbox',
          summary:
            'Aprovisiona infraestructura limpia, verifica los snapshots WORM de hace 15 minutos contra indicadores de compromiso y comienza la recuperación.',
          hiddenImpact: {
            rtoImpactMinutes: 35,
            rpoImpactMinutes: 15,
            costImpactEur: 28000,
            stressDelta: -7,
            evaluation: 'optimal',
            whatWentWell:
              'Uso eficaz de snapshots inmutables WORM con validación forense previa, ajustando el RPO real al límite teórico de 15 minutos.',
            whatWentWrong:
              'La descarga y validación en sandbox requirió 35 minutos adicionales de ventana técnica.',
            lessonRecommendation: '',
            outcomeSummary:
              'Los snapshots inmutables superaron la validación forense. Se limita la pérdida de datos a 15 minutos y se estabiliza el Directorio Activo.',
            logLevel: 'INFO',
            serviceChanges: [{ serviceId: 'srv-ad-iam', newStatus: 'Operativo' }],
          },
        },
        {
          id: 't3-opt-b',
          key: 'B',
          title: 'Restaurar inmediatamente la cinta offline del viernes para evitar descarga cloud',
          summary:
            'Prioriza la lectura física local de la última cinta desconectada sin asumir tiempos de transferencia desde la nube.',
          hiddenImpact: {
            rtoImpactMinutes: 75,
            rpoImpactMinutes: 4320,
            costImpactEur: 64000,
            stressDelta: 10,
            evaluation: 'critical',
            whatWentWell:
              'Se utilizó un soporte offline físicamente desconectado libre de cifrado.',
            whatWentWrong:
              'Descartar las copias inmutables en la nube provocó una pérdida masiva de datos de 72 horas (4.320 min de RPO real), rompiendo todos los RPO del BIA.',
            lessonRecommendation:
              'Prioriza siempre los snapshots inmutables (WORM) en la nube más recientes frente a cintas semanales para cumplir con el RPO objetivo de 15 minutos.',
            outcomeSummary:
              'La cinta offline estaba íntegra, pero restaurar datos del viernes generó una pérdida operativa de 72 horas de transacciones.',
            logLevel: 'CRITICAL',
            serviceChanges: [{ serviceId: 'srv-ad-iam', newStatus: 'Degradado' }],
          },
        },
        {
          id: 't3-opt-c',
          key: 'C',
          title: 'Reconstruir servidores desde cero y recuperar tablas parciales desde preproducción',
          summary:
            'Descarta las copias históricas para evitar reintroducir malware y levanta esquemas parciales desde entornos de desarrollo.',
          hiddenImpact: {
            rtoImpactMinutes: 55,
            rpoImpactMinutes: 360,
            costImpactEur: 46000,
            stressDelta: 8,
            evaluation: 'suboptimal',
            whatWentWell:
              'Se evitó el riesgo de persistencia al desplegar servidores completamente limpios.',
            whatWentWrong:
              'Utilizar datos de preproducción generó inconsistencias equivalentes a 6 horas de pérdida de datos productivos.',
            lessonRecommendation:
              'Nunca sustituyas copias de producción verificadas por esquemas de preproducción; valida los snapshots inmutables en entorno aislado.',
            outcomeSummary:
              'La reconstrucción manual redujo riesgo de persistencia pero provocó inconsistencias de datos equivalentes a 6 horas de operación.',
            logLevel: 'WARN',
            serviceChanges: [{ serviceId: 'srv-ad-iam', newStatus: 'Degradado' }],
          },
        },
        {
          id: 't3-opt-d',
          key: 'D',
          title: 'Evaluar herramientas públicas de descifrado y abrir contacto exploratorio en nota de rescate',
          summary:
            'Pospone el aprovisionamiento de copias mientras el equipo investiga si la variante tiene fallo criptográfico conocido.',
          hiddenImpact: {
            rtoImpactMinutes: 120,
            rpoImpactMinutes: 60,
            costImpactEur: 145000,
            stressDelta: 18,
            evaluation: 'critical',
            whatWentWell:
              'Se descartó la viabilidad de descifrado sin pagar rescate antes de comprometer fondos.',
            whatWentWrong:
              'Posponer la restauración mientras existían copias inmutables limpias añadió 2 horas de inactividad innecesaria y 145.000 € de impacto.',
            lessonRecommendation:
              'Cuando dispongas de copias inmutables verificables, inicia inmediatamente el aprovisionamiento de recuperación sin esperar por descifradores externos.',
            outcomeSummary:
              'No existía descifrador público para esta variante. La demora disparó el tiempo de inactividad y el incumplimiento de SLA.',
            logLevel: 'CRITICAL',
            serviceChanges: [],
          },
        },
      ],
    },
    {
      turnNumber: 4,
      id: 'turn-4-recovery',
      phaseName: 'Recuperación',
      phaseFullTitle: 'Turno 4: Recuperación y Restablecimiento',
      inject: {
        code: 'INJ-04',
        severity: 'Alta',
        source: 'Comité de Operaciones & Dirección',
        headline: 'Presión operativa para restablecer servicios simultáneamente',
        description:
          'Con la identidad base controlada, Dirección Comercial solicita levantar a la vez el ERP, la Pasarela de Pagos, el CRM y el Correo Corporativo para recuperar el volumen de pedidos acumulados.',
      },
      decisions: [
        {
          id: 't4-opt-a',
          key: 'A',
          title: 'Ejecutar recuperación escalonada por prioridad BIA (IAM → Pagos → ERP → CRM/Correo)',
          summary:
            'Respeta el árbol de dependencias del BIA y valida integridad de cada capa antes de abrir tráfico productivo.',
          hiddenImpact: {
            rtoImpactMinutes: 25,
            rpoImpactMinutes: 0,
            costImpactEur: 19500,
            stressDelta: -10,
            evaluation: 'optimal',
            whatWentWell:
              'Secuencia de arranque fiel al árbol de dependencias del BIA; evitó contención de IOPS y restauró Pagos y ERP con 0 pérdidas adicionales.',
            whatWentWrong:
              'El CRM quedó temporalmente degradado mientras finalizaba el despliegue de servicios prioritarios.',
            lessonRecommendation: '',
            outcomeSummary:
              'El arranque ordenado evitó cuellos de botella en base de datos. Pagos y ERP volvieron a estado Operativo sin errores de consistencia.',
            logLevel: 'INFO',
            serviceChanges: [
              { serviceId: 'srv-ad-iam', newStatus: 'Operativo' },
              { serviceId: 'srv-payments', newStatus: 'Operativo' },
              { serviceId: 'srv-erp', newStatus: 'Operativo' },
              { serviceId: 'srv-crm', newStatus: 'Degradado' },
            ],
          },
        },
        {
          id: 't4-opt-b',
          key: 'B',
          title: 'Lanzar restauración paralela masiva de todas las máquinas virtuales a la vez',
          summary:
            'Satura el ancho de banda y los hipervisores iniciando todos los servicios de forma concurrente para acortar plazos.',
          hiddenImpact: {
            rtoImpactMinutes: 65,
            rpoImpactMinutes: 25,
            costImpactEur: 58000,
            stressDelta: 14,
            evaluation: 'suboptimal',
            whatWentWell:
              'Intención de reducir el tiempo percibido por las áreas de negocio mediante paralelización.',
            whatWentWrong:
              'Arrancar sin respetar dependencias saturó el almacenamiento y corrompió colas del CRM, retrasando también al ERP.',
            lessonRecommendation:
              'Documenta y ensaya runbooks de arranque escalonado según dependencias del BIA (Identidad → Transaccional → ERP) para evitar saturar hipervisores.',
            outcomeSummary:
              'La contención de IOPS y los fallos de arranque sin IAM provocaron corrupción en colas del CRM y retrasaron el ERP.',
            logLevel: 'WARN',
            serviceChanges: [
              { serviceId: 'srv-erp', newStatus: 'Degradado' },
              { serviceId: 'srv-crm', newStatus: 'Caído' },
              { serviceId: 'srv-mail', newStatus: 'Caído' },
            ],
          },
        },
        {
          id: 't4-opt-c',
          key: 'C',
          title: 'Priorizar Correo y CRM para atención al cliente dejando el ERP para la noche',
          summary:
            'Desvía recursos de sistemas hacia canales de comunicación externos y pospone el núcleo logístico.',
          hiddenImpact: {
            rtoImpactMinutes: 110,
            rpoImpactMinutes: 15,
            costImpactEur: 98000,
            stressDelta: 6,
            evaluation: 'critical',
            whatWentWell:
              'El equipo de atención al cliente recuperó herramientas para contestar incidencias externas.',
            whatWentWrong:
              'Posponer el ERP (1.250 €/min) para priorizar servicios de menor impacto económico multiplicó las pérdidas operativas.',
            lessonRecommendation:
              'Alinea siempre el orden de recuperación con la criticidad financiera del BIA; nunca pospongas servicios core como el ERP frente a herramientas secundarias.',
            outcomeSummary:
              'Los clientes recibieron respuesta por correo, pero la paralización prolongada del ERP mantuvo detenido el despacho de mercancías.',
            logLevel: 'WARN',
            serviceChanges: [
              { serviceId: 'srv-crm', newStatus: 'Operativo' },
              { serviceId: 'srv-mail', newStatus: 'Operativo' },
              { serviceId: 'srv-erp', newStatus: 'Caído' },
            ],
          },
        },
      ],
    },
    {
      turnNumber: 5,
      id: 'turn-5-closure',
      phaseName: 'Cierre',
      phaseFullTitle: 'Turno 5: Comunicación de Crisis y Cierre',
      inject: {
        code: 'INJ-05',
        severity: 'Media',
        source: 'CISO, Legal & Prensa',
        headline: 'Consulta de prensa externa y plazo regulatorio de notificación',
        description:
          'Un medio especializado pregunta por interrupciones en la sede principal. Simultáneamente, Asesoría Jurídica recuerda el plazo legal de 72 horas ante posible exfiltración de datos corporativos.',
      },
      decisions: [
        {
          id: 't5-opt-a',
          key: 'A',
          title: 'Emitir comunicado transparente, notificar preventivamente a la autoridad y cerrar recuperación',
          summary:
            'Alinea a Legal, CISO y Comunicación con hechos verificados mientras completa el restablecimiento total bajo monitorización reforzada.',
          hiddenImpact: {
            rtoImpactMinutes: 10,
            rpoImpactMinutes: 0,
            costImpactEur: 12000,
            stressDelta: -12,
            evaluation: 'optimal',
            whatWentWell:
              'Comunicación coordinada entre CISO, Legal y Prensa dentro del plazo normativo de 72 horas y cierre total de servicios en estado Operativo.',
            whatWentWrong:
              'Coste administrativo menor derivado de la gestión regulatoria preventiva.',
            lessonRecommendation: '',
            outcomeSummary:
              'Gestión de crisis alineada con normativa. Todos los servicios críticos quedan restablecidos y bajo vigilancia SOC.',
            logLevel: 'INFO',
            serviceChanges: [
              { serviceId: 'srv-ad-iam', newStatus: 'Operativo' },
              { serviceId: 'srv-payments', newStatus: 'Operativo' },
              { serviceId: 'srv-erp', newStatus: 'Operativo' },
              { serviceId: 'srv-crm', newStatus: 'Operativo' },
              { serviceId: 'srv-mail', newStatus: 'Operativo' },
            ],
          },
        },
        {
          id: 't5-opt-b',
          key: 'B',
          title: 'Negar el incidente públicamente y posponer la notificación regulatoria',
          summary:
            'Evita exposición mediática inmediata esperando cerrar el expediente de forma interna antes de informar a terceros.',
          hiddenImpact: {
            rtoImpactMinutes: 20,
            rpoImpactMinutes: 0,
            costImpactEur: 88000,
            stressDelta: 12,
            evaluation: 'critical',
            whatWentWell:
              'Contención temporal de titulares en las primeras horas.',
            whatWentWrong:
              'Incumplir las obligaciones de notificación temprana y negar hechos comprobables expuso a la organización a sanciones y pérdida de confianza.',
            lessonRecommendation:
              'Establece plantillas preaprobadas de comunicación de crisis y cumple estrictamente los plazos legales de notificación ante brechas.',
            outcomeSummary:
              'La filtración posterior de evidencias agravó el riesgo sancionador administrativo y el desgaste reputacional.',
            logLevel: 'CRITICAL',
            serviceChanges: [
              { serviceId: 'srv-ad-iam', newStatus: 'Operativo' },
              { serviceId: 'srv-payments', newStatus: 'Operativo' },
              { serviceId: 'srv-erp', newStatus: 'Operativo' },
              { serviceId: 'srv-crm', newStatus: 'Operativo' },
              { serviceId: 'srv-mail', newStatus: 'Degradado' },
            ],
          },
        },
        {
          id: 't5-opt-c',
          key: 'C',
          title: 'Publicar nota interna mínima y reabrir la red sin periodo de cuarentena',
          summary:
            'Elimina reglas temporales de contención para dar normalidad inmediata a todas las oficinas sin fase de estabilización.',
          hiddenImpact: {
            rtoImpactMinutes: 5,
            rpoImpactMinutes: 10,
            costImpactEur: 32000,
            stressDelta: 6,
            evaluation: 'suboptimal',
            whatWentWell:
              'Rapidez para devolver la conectividad completa a los empleados.',
            whatWentWrong:
              'Reabrir la red sin periodo de cuarentena ni monitorización reforzada generó incidencias residuales y pérdida de 10 minutos de datos.',
            lessonRecommendation:
              'Mantén reglas de contención y monitorización SOC reforzada durante al menos 48–72 horas tras el restablecimiento antes de declarar normalidad total.',
            outcomeSummary:
              'La reapertura prematura obligó a revalidar alertas residuales durante las horas posteriores al restablecimiento.',
            logLevel: 'WARN',
            serviceChanges: [
              { serviceId: 'srv-ad-iam', newStatus: 'Operativo' },
              { serviceId: 'srv-payments', newStatus: 'Operativo' },
              { serviceId: 'srv-erp', newStatus: 'Operativo' },
              { serviceId: 'srv-crm', newStatus: 'Operativo' },
              { serviceId: 'srv-mail', newStatus: 'Operativo' },
            ],
          },
        },
      ],
    },
  ],
  slaEscalations: {
    'srv-ad-iam': {
      channel: 'ESCALADO CRÍTICO · DIRECCIÓN GENERAL',
      caller: 'CEO & Dirección de Operaciones',
      headline: 'Directorio Activo supera su RTO máximo de 1 hora',
      quote:
        '"Ninguna sede puede validar credenciales ni operar con normalidad. El Comité de Dirección exige saber de inmediato si las réplicas en la nube están limpias y cuándo volverá la autenticación."',
    },
    'srv-payments': {
      channel: 'LLAMADA URGENTE · CEO Y DIRECCIÓN FINANCIERA',
      caller: 'CEO & CFO Corporativo',
      headline: 'Pasarela de Pagos supera SLA crítico de 30 minutos',
      quote:
        '"Estamos perdiendo más de 2.000 € por minuto y el centro de soporte recibe cientos de quejas de clientes por cobros rechazados. Necesitamos conmutación a contingencia ya mismo."',
    },
    'srv-erp': {
      channel: 'ALERTA DE NEGOCIO · LOGÍSTICA Y EXPEDICIONES',
      caller: 'Dirección de Cadena de Suministro',
      headline: 'ERP Corporativo supera su RTO máximo de 4 horas',
      quote:
        '"Los muelles de carga están completamente detenidos sin albaranes ni órdenes de salida. Hay flotas de transporte retenidas y clientes reclamando penalizaciones por retraso."',
    },
    'srv-crm': {
      channel: 'ESCALADO COMERCIAL · QUEJAS DE CLIENTES',
      caller: 'Dirección Comercial & Atención al Cliente',
      headline: 'CRM Comercial supera su RTO límite de 8 horas',
      quote:
        '"Acumulamos cientos de reclamaciones en canales externos sin visibilidad del histórico de pedidos ni incidencias abiertas."',
    },
    'srv-mail': {
      channel: 'AVISO OPERATIVO · COMUNICACIÓN INTERNA',
      caller: 'Dirección de Personas & Workplace',
      headline: 'Correo Corporativo supera su RTO máximo de 4 horas',
      quote:
        '"Las delegaciones regionales están incomunicadas por correo y dependen de canales alternativos sin trazabilidad."',
    },
  },
};

const CLOUD_OUTAGE_SCENARIO_DATA = {
  id: 'scn-cloud-outage-02',
  code: 'DRP-TTX-2026-02',
  title: 'Caída de Región Cloud y Corrupción de Base de Datos',
  organization: 'Fintech Ibérica Pay S.L.',
  description:
    'A las 11:18 CET, un fallo en cascada en el plano de control de la región cloud primaria provoca desconexión de nodos Kubernetes y corrupción lógica en las réplicas síncronas de PostgreSQL. Dirige la conmutación multi-región sin perder integridad financiera.',
  initialState: {
    phase: 'Preparación',
    downtimeSeconds: 0,
    realRpoMinutes: 0,
    accumulatedCostEur: 0,
    decisionCostEur: 0,
    teamStressPercent: 18,
  },
  biaServices: [
    {
      id: 'srv-cloud-api',
      name: 'API Gateway y Banca Abierta (PSD2)',
      category: 'Transaccional',
      criticality: 'Crítico',
      rtoMinutes: 20,
      rtoLabel: '20 min',
      rpoMinutes: 0,
      rpoLabel: '0 min (Activa-Activa)',
      costPerMinuteEur: 2400,
      initialStatus: 'Operativo',
      owner: 'SRE & Plataforma Cloud',
      dependencies: ['Anycast DNS / WAF', 'Cluster K8s Secundario', 'HSM Cloud'],
      recoveryStrategy:
        'Redirección de tráfico DNS/Anycast hacia región secundaria verificada manteniendo límites de tasa para evitar avalanchas de reintentos.',
    },
    {
      id: 'srv-cloud-ledger',
      name: 'Base de Datos Ledger Financiero (PostgreSQL)',
      category: 'Datos Core',
      criticality: 'Crítico',
      rtoMinutes: 45,
      rtoLabel: '45 min',
      rpoMinutes: 5,
      rpoLabel: '5 min',
      costPerMinuteEur: 1850,
      initialStatus: 'Operativo',
      owner: 'DBA Core & Integridad Transaccional',
      dependencies: ['WAL Archiving Inmutable', 'Almacenamiento NVMe Multi-AZ'],
      recoveryStrategy:
        'Point-in-Time Recovery (PITR) previo al instante exacto de la corrupción lógica usando registros WAL inmutables.',
    },
    {
      id: 'srv-cloud-auth',
      name: 'Motor OAuth2 / MFA Clientes',
      category: 'Identidad',
      criticality: 'Crítico',
      rtoMinutes: 30,
      rtoLabel: '30 min',
      rpoMinutes: 5,
      rpoLabel: '5 min',
      costPerMinuteEur: 950,
      initialStatus: 'Operativo',
      owner: 'Seguridad de Producto & IAM',
      dependencies: ['Almacén de Secretos KMS', 'Redis Cluster DR'],
      recoveryStrategy:
        'Promoción del clúster de autenticación secundario con replicación de claves de firma activas.',
    },
    {
      id: 'srv-cloud-settlement',
      name: 'Motor de Compensación SEPA / Batch',
      category: 'Liquidación',
      criticality: 'Alto',
      rtoMinutes: 180,
      rtoLabel: '3 h',
      rpoMinutes: 15,
      rpoLabel: '15 min',
      costPerMinuteEur: 620,
      initialStatus: 'Operativo',
      owner: 'Operaciones Bancarias',
      dependencies: ['Ledger Financiero', 'Colas Kafka DR'],
      recoveryStrategy:
        'Reprocesamiento idempotente de colas Kafka tras certificar la coherencia del Ledger.',
    },
    {
      id: 'srv-cloud-bi',
      name: 'Portal de Auditoría y Reporting Regulatorio',
      category: 'Cumplimiento',
      criticality: 'Medio',
      rtoMinutes: 360,
      rtoLabel: '6 h',
      rpoMinutes: 60,
      rpoLabel: '1 h',
      costPerMinuteEur: 260,
      initialStatus: 'Operativo',
      owner: 'Data Engineering & Compliance',
      dependencies: ['Data Lake Réplica', 'Motor OAuth2'],
      recoveryStrategy:
        'Restauración diferida desde snapshot horario del Data Lake una vez estabilizados los flujos transaccionales.',
    },
  ],
  initialLogs: [
    {
      timeOffsetSeconds: 0,
      level: 'INFO',
      source: 'CLOUD-WATCH',
      message: 'Escenario cargado: "Caída de Región Cloud y Corrupción de Base de Datos" (DRP-TTX-2026-02).',
    },
    {
      timeOffsetSeconds: 0,
      level: 'INFO',
      source: 'BIA-ENGINE',
      message: '5 servicios cloud monitorizados en eu-west-1 (Primaria) y eu-central-1 (Contingencia).',
    },
    {
      timeOffsetSeconds: 0,
      level: 'INFO',
      source: 'DIRECTOR',
      message: 'Sistema en estado de Preparación. Pulsa "Iniciar Ejercicio" para simular la degradación regional.',
    },
  ],
  timelineEvents: [
    {
      delaySeconds: 0,
      onlyDuringTurnIndex: 0,
      level: 'CRITICAL',
      source: 'CLOUD-CONTROL',
      message:
        'INCIDENTE ACTIVADO: Pérdida de quórum en plano de control eu-west-1. API Gateway y Motor OAuth2 reportan errores HTTP 503 masivos.',
      stressDelta: 16,
      serviceChanges: [
        { serviceId: 'srv-cloud-api', newStatus: 'Caído' },
        { serviceId: 'srv-cloud-auth', newStatus: 'Degradado' },
      ],
    },
    {
      delaySeconds: 3,
      onlyDuringTurnIndex: 0,
      level: 'CRITICAL',
      source: 'DBA-MONITOR',
      message:
        'Anomalía de almacenamiento detectada en clúster primario PostgreSQL: bloques corruptos propagándose a réplica síncrona.',
      stressDelta: 12,
      serviceChanges: [{ serviceId: 'srv-cloud-ledger', newStatus: 'Caído' }],
    },
  ],
  turns: [
    {
      turnNumber: 1,
      id: 'c-turn-1-detection',
      phaseName: 'Detección',
      phaseFullTitle: 'Turno 1: Diagnóstico de Caída Multi-AZ',
      inject: {
        code: 'INJ-01',
        severity: 'Crítica',
        source: 'SRE / Cloud Operations',
        headline: 'Región primaria inestable y corrupción activa hacia réplica síncrona',
        description:
          'Los health-checks de eu-west-1 oscilan y el clúster PostgreSQL principal registra errores de checksum. Si la replicación física continúa abierta, la corrupción puede sobrescribir también el clúster standby.',
      },
      decisions: [
        {
          id: 'c1-opt-a',
          key: 'A',
          title: 'Congelar replicación hacia standby en eu-central-1 y declarar failover controlado',
          summary:
            'Corta inmediatamente la replicación física corrupta, protege el snapshot limpio en la región secundaria y activa el comité de conmutación.',
          hiddenImpact: {
            rtoImpactMinutes: 8,
            rpoImpactMinutes: 2,
            costImpactEur: 12000,
            stressDelta: 4,
            evaluation: 'optimal',
            whatWentWell:
              'Se detuvo la propagación de bloques corruptos a tiempo preservando una base sólida en la región secundaria.',
            whatWentWrong:
              'La ventana de corte generó 2 minutos de transacciones pendientes de conciliación en cola.',
            lessonRecommendation: '',
            outcomeSummary:
              'La replicación se detuvo antes de corromper eu-central-1, dejando intacto el punto de recuperación.',
            logLevel: 'INFO',
            serviceChanges: [{ serviceId: 'srv-cloud-auth', newStatus: 'Degradado' }],
          },
        },
        {
          id: 'c1-opt-b',
          key: 'B',
          title: 'Forzar reinicio completo del clúster en eu-west-1 esperando recuperación del proveedor',
          summary:
            'Intenta levantar los nodos en la misma región afectada sin cortar la replicación para evitar la complejidad del failover.',
          hiddenImpact: {
            rtoImpactMinutes: 35,
            rpoImpactMinutes: 20,
            costImpactEur: 68000,
            stressDelta: 16,
            evaluation: 'critical',
            whatWentWell:
              'Se evitó temporalmente un cambio de topología DNS.',
            whatWentWrong:
              'Mantener la región primaria y la replicación activas propagó la corrupción lógica a la réplica y superó el RTO de 20 min de la API.',
            lessonRecommendation:
              'Ante corrupción de almacenamiento con replicación síncrona, aísla la réplica secundaria de inmediato antes de intentar reinicios locales.',
            outcomeSummary:
              'El proveedor no estabilizó la región y la réplica síncrona recibió bloques dañados.',
            logLevel: 'CRITICAL',
            serviceChanges: [
              { serviceId: 'srv-cloud-api', newStatus: 'Caído' },
              { serviceId: 'srv-cloud-ledger', newStatus: 'Caído' },
              { serviceId: 'srv-cloud-settlement', newStatus: 'Degradado' },
            ],
          },
        },
        {
          id: 'c1-opt-c',
          key: 'C',
          title: 'Redirigir todo el tráfico al instante por DNS sin verificar estado del Ledger',
          summary:
            'Apunta el balanceador Anycast a eu-central-1 en frío mientras la base de datos secundaria aún está en modo solo lectura.',
          hiddenImpact: {
            rtoImpactMinutes: 22,
            rpoImpactMinutes: 10,
            costImpactEur: 39000,
            stressDelta: 10,
            evaluation: 'suboptimal',
            whatWentWell:
              'Se inició con rapidez la salida de la región degradada.',
            whatWentWrong:
              'Enviar tráfico transaccional contra una réplica en solo lectura provocó tormenta de errores y pérdida parcial de sesiones.',
            lessonRecommendation:
              'Ejecuta siempre el pre-check de escritura y promoción de base de datos antes de conmutar los registros DNS de producción.',
            outcomeSummary:
              'Las aplicaciones en eu-central-1 rechazaron escrituras generando reintentos masivos de clientes.',
            logLevel: 'WARN',
            serviceChanges: [{ serviceId: 'srv-cloud-auth', newStatus: 'Caído' }],
          },
        },
      ],
    },
    {
      turnNumber: 2,
      id: 'c-turn-2-identity',
      phaseName: 'Contención',
      phaseFullTitle: 'Turno 2: Identidad y Tráfico API',
      inject: {
        code: 'INJ-02',
        severity: 'Crítica',
        source: 'WAF & Seguridad de Producto',
        headline: 'Avalancha de reintentos automáticos y desincronización OAuth2',
        description:
          'Miles de TPVs y apps móviles reintentan pagos en bucle generando un pico 6x de tráfico sobre eu-central-1. El caché Redis de sesiones OAuth2 en la región secundaria está vacío.',
      },
      decisions: [
        {
          id: 'c2-opt-a',
          key: 'A',
          title: 'Activar rate-limiting gradual en WAF y promover clúster OAuth2 con claves KMS replicadas',
          summary:
            'Aplica colas de backoff en el borde WAF mientras levanta el motor de identidad en eu-central-1 sin saturar las réplicas.',
          hiddenImpact: {
            rtoImpactMinutes: 10,
            rpoImpactMinutes: 0,
            costImpactEur: 14500,
            stressDelta: -5,
            evaluation: 'optimal',
            whatWentWell:
              'El rate-limiting absorbió el pico de tráfico y restableció la autenticación OAuth2 y la API dentro de márgenes controlados.',
            whatWentWrong:
              'Algunos usuarios tuvieron que renovar su sesión MFA tras el cambio de clúster.',
            lessonRecommendation: '',
            outcomeSummary:
              'La API Gateway y el Motor OAuth2 vuelven a estado Operativo bajo control de caudal.',
            logLevel: 'INFO',
            serviceChanges: [
              { serviceId: 'srv-cloud-api', newStatus: 'Operativo' },
              { serviceId: 'srv-cloud-auth', newStatus: 'Operativo' },
            ],
          },
        },
        {
          id: 'c2-opt-b',
          key: 'B',
          title: 'Desactivar validación MFA temporalmente para absorber la cola de peticiones',
          summary:
            'Simplifica el flujo de autenticación eliminando comprobaciones de tokens hasta que baje el tráfico.',
          hiddenImpact: {
            rtoImpactMinutes: 18,
            rpoImpactMinutes: 5,
            costImpactEur: 74000,
            stressDelta: 15,
            evaluation: 'critical',
            whatWentWell:
              'Aumentó momentáneamente el caudal de peticiones aceptadas.',
            whatWentWrong:
              'Desactivar controles MFA PSD2 en producción abrió brecha de cumplimiento regulatorio y obligó a revertir el despliegue de emergencia.',
            lessonRecommendation:
              'Nunca relajes controles de autenticación fuerte (MFA/PSD2) como atajo de disponibilidad; usa rate-limiting y colas de espera en WAF.',
            outcomeSummary:
              'Cumplimiento detectó la excepción PSD2 y ordenó bloqueo preventivo inmediato de la API.',
            logLevel: 'CRITICAL',
            serviceChanges: [
              { serviceId: 'srv-cloud-api', newStatus: 'Caído' },
              { serviceId: 'srv-cloud-auth', newStatus: 'Degradado' },
            ],
          },
        },
        {
          id: 'c2-opt-c',
          key: 'C',
          title: 'Auto-escalar pods sin límites en Kubernetes ignorando la capacidad del Ledger',
          summary:
            'Multiplica por 10 las réplicas de aplicación para procesar todos los reintentos simultáneamente.',
          hiddenImpact: {
            rtoImpactMinutes: 25,
            rpoImpactMinutes: 5,
            costImpactEur: 43000,
            stressDelta: 11,
            evaluation: 'suboptimal',
            whatWentWell:
              'El plano de cómputo escaló sin errores de memoria.',
            whatWentWrong:
              'El exceso de conexiones simultáneas agotó el pool de PostgreSQL y retrasó la recuperación del Ledger.',
            lessonRecommendation:
              'Aplica circuit breakers y límites en connection poolers (PgBouncer) antes de autoescalar aplicaciones tras un failover.',
            outcomeSummary:
              'El pool de conexiones quedó saturado impidiendo que los servicios financieros consolidaran transacciones.',
            logLevel: 'WARN',
            serviceChanges: [{ serviceId: 'srv-cloud-api', newStatus: 'Degradado' }],
          },
        },
      ],
    },
    {
      turnNumber: 3,
      id: 'c-turn-3-pitr',
      phaseName: 'Backups',
      phaseFullTitle: 'Turno 3: Recuperación Point-in-Time del Ledger',
      inject: {
        code: 'INJ-03',
        severity: 'Alta',
        source: 'DBA Core & Almacenamiento',
        headline: 'Selección del punto de restauración tras corrupción lógica',
        description:
          'Debemos reconstruir el Ledger PostgreSQL en eu-central-1. Contamos con archivos WAL continuos hasta 3 minutos antes del fallo (PITR), un snapshot horario de hace 55 minutos y un dump nocturno de hace 14 horas.',
      },
      decisions: [
        {
          id: 'c3-opt-a',
          key: 'A',
          title: 'Ejecutar PITR con registros WAL inmutables hasta 3 minutos antes del primer error de checksum',
          summary:
            'Aplica replay de logs transaccionales verificados en una instancia limpia y valida sumas de control contables.',
          hiddenImpact: {
            rtoImpactMinutes: 20,
            rpoImpactMinutes: 3,
            costImpactEur: 18000,
            stressDelta: -8,
            evaluation: 'optimal',
            whatWentWell:
              'El Point-in-Time Recovery cumplió estrictamente el RPO de 5 minutos del BIA con integridad contable verificada.',
            whatWentWrong:
              'Requirió 20 minutos de verificación de checksums antes de aceptar tráfico de escritura.',
            lessonRecommendation: '',
            outcomeSummary:
              'El Ledger financiero queda consistente y operativo con una ventana máxima de pérdida de 3 minutos.',
            logLevel: 'INFO',
            serviceChanges: [{ serviceId: 'srv-cloud-ledger', newStatus: 'Operativo' }],
          },
        },
        {
          id: 'c3-opt-b',
          key: 'B',
          title: 'Restaurar directamente el snapshot horario de hace 55 minutos para evitar el replay WAL',
          summary:
            'Ahorra tiempo de verificación inicial asumiendo la pérdida de la última hora de operaciones.',
          hiddenImpact: {
            rtoImpactMinutes: 30,
            rpoImpactMinutes: 55,
            costImpactEur: 72000,
            stressDelta: 12,
            evaluation: 'critical',
            whatWentWell:
              'El arranque de la instancia base fue limpio y rápido.',
            whatWentWrong:
              'Descartar el WAL disponible generó 55 minutos de pérdida de datos financieros, multiplicando el RPO objetivo de 5 minutos por 11.',
            lessonRecommendation:
              'Utiliza siempre archivado continuo de WAL (PITR) en bases transaccionales para respetar RPOs de pocos minutos.',
            outcomeSummary:
              'Cientos de operaciones de la última hora desaparecieron del estado contable, disparando incidencias de conciliación.',
            logLevel: 'CRITICAL',
            serviceChanges: [{ serviceId: 'srv-cloud-ledger', newStatus: 'Degradado' }],
          },
        },
        {
          id: 'c3-opt-c',
          key: 'C',
          title: 'Ejecutar reparación manual en caliente sobre la tabla principal sin instancia limpia',
          summary:
            'Intenta borrar filas corruptas con scripts SQL directos sobre producción para no restaurar backups.',
          hiddenImpact: {
            rtoImpactMinutes: 45,
            rpoImpactMinutes: 25,
            costImpactEur: 54000,
            stressDelta: 14,
            evaluation: 'suboptimal',
            whatWentWell:
              'Se identificaron las páginas afectadas por el fallo.',
            whatWentWrong:
              'Manipular índices dañados en caliente bloqueó transacciones y obligó finalmente a restaurar desde backup.',
            lessonRecommendation:
              'Nunca ejecutes reparaciones destructivas en caliente sin clonar o restaurar primero en un entorno verificado.',
            outcomeSummary:
              'El bloqueo de tablas duplicó el tiempo de indisponibilidad antes de pasar a PITR.',
            logLevel: 'WARN',
            serviceChanges: [{ serviceId: 'srv-cloud-ledger', newStatus: 'Caído' }],
          },
        },
      ],
    },
    {
      turnNumber: 4,
      id: 'c-turn-4-recovery',
      phaseName: 'Recuperación',
      phaseFullTitle: 'Turno 4: Reconciliación SEPA y Servicios Secundarios',
      inject: {
        code: 'INJ-04',
        severity: 'Alta',
        source: 'Operaciones Bancarias & Kafka',
        headline: 'Mensajes duplicados en colas Kafka durante la conmutación',
        description:
          'Con el Ledger operativo, existen 14.000 eventos en Kafka pendientes de liquidación SEPA. Hay riesgo de cargos duplicados si se reinyectan sin control.',
      },
      decisions: [
        {
          id: 'c4-opt-a',
          key: 'A',
          title: 'Reprocesar colas Kafka con filtro de idempotencia y diferir el Portal BI hasta estabilizar SEPA',
          summary:
            'Valida claves únicas de transacción frente al Ledger y prioriza la compensación bancaria antes de levantar analytics.',
          hiddenImpact: {
            rtoImpactMinutes: 15,
            rpoImpactMinutes: 0,
            costImpactEur: 11000,
            stressDelta: -9,
            evaluation: 'optimal',
            whatWentWell:
              'Cero cargos duplicados y cumplimiento estricto de prioridades BIA entre liquidación SEPA y reporting.',
            whatWentWrong:
              'El Portal de Auditoría permaneció en cola 15 minutos adicionales sin impacto financiero crítico.',
            lessonRecommendation: '',
            outcomeSummary:
              'Las colas Kafka se drenaron sin duplicidades y el Motor SEPA volvió a estado Operativo.',
            logLevel: 'INFO',
            serviceChanges: [
              { serviceId: 'srv-cloud-settlement', newStatus: 'Operativo' },
              { serviceId: 'srv-cloud-bi', newStatus: 'Degradado' },
            ],
          },
        },
        {
          id: 'c4-opt-b',
          key: 'B',
          title: 'Purgar la cola de mensajes pendientes y pedir a los comercios reenviar remesas',
          summary:
            'Vacía los tópicos de Kafka para arrancar limpio evitando cualquier riesgo de duplicidad.',
          hiddenImpact: {
            rtoImpactMinutes: 40,
            rpoImpactMinutes: 35,
            costImpactEur: 69000,
            stressDelta: 12,
            evaluation: 'critical',
            whatWentWell:
              'Se evitó el envío de cargos duplicados.',
            whatWentWrong:
              'Purgar mensajes válidos supuso una pérdida adicional de 35 minutos de operaciones en tránsito y quebrantó la confianza de comercios.',
            lessonRecommendation:
              'Implementa claves de idempotencia en consumidores financieros en lugar de purgar colas válidas durante un failover.',
            outcomeSummary:
              'La pérdida de mensajes no confirmados provocó descuadres con comercios y trabajo manual masivo.',
            logLevel: 'CRITICAL',
            serviceChanges: [
              { serviceId: 'srv-cloud-settlement', newStatus: 'Degradado' },
              { serviceId: 'srv-cloud-bi', newStatus: 'Caído' },
            ],
          },
        },
        {
          id: 'c4-opt-c',
          key: 'C',
          title: 'Reinyectar toda la cola directamente sin deduplicación y levantar el Portal BI en paralelo',
          summary:
            'Ejecuta todos los consumidores al máximo para vaciar colas y mostrar datos en el portal de auditoría cuanto antes.',
          hiddenImpact: {
            rtoImpactMinutes: 30,
            rpoImpactMinutes: 10,
            costImpactEur: 47000,
            stressDelta: 9,
            evaluation: 'suboptimal',
            whatWentWell:
              'El vaciado inicial de colas fue veloz.',
            whatWentWrong:
              'Se generaron abonos y cargos duplicados que obligaron a ejecutar un proceso de retroceso contable.',
            lessonRecommendation:
              'Concilia siempre los identificadores de operación contra el Ledger tras un PITR antes de reabrir consumidores batch.',
            outcomeSummary:
              'Las duplicidades obligaron a pausar liquidaciones para conciliar manualmente decenas de lotes.',
            logLevel: 'WARN',
            serviceChanges: [{ serviceId: 'srv-cloud-settlement', newStatus: 'Degradado' }],
          },
        },
      ],
    },
    {
      turnNumber: 5,
      id: 'c-turn-5-closure',
      phaseName: 'Cierre',
      phaseFullTitle: 'Turno 5: Informe al Regulador y Estabilización',
      inject: {
        code: 'INJ-05',
        severity: 'Media',
        source: 'Compliance Bancario & Dirección',
        headline: 'Reporte DORA / Banco Central y plan de retorno (failback)',
        description:
          'eu-west-1 comienza a recuperarse. El regulador solicita informe inicial de incidente operativo grave (DORA) y Dirección pregunta si volver de inmediato a la región primaria.',
      },
      decisions: [
        {
          id: 'c5-opt-a',
          key: 'A',
          title: 'Mantener operación estable en eu-central-1 48h, enviar reporte DORA inicial y planificar failback en ventana controlada',
          summary:
            'Evita un segundo corte innecesario, completa el Portal BI y cumple con la notificación regulatoria con métricas verificadas.',
          hiddenImpact: {
            rtoImpactMinutes: 5,
            rpoImpactMinutes: 0,
            costImpactEur: 8500,
            stressDelta: -10,
            evaluation: 'optimal',
            whatWentWell:
              'Decisión madura de estabilidad: se evitó un failback precipitado, se cerró el reporte DORA y todos los servicios quedaron Operativos.',
            whatWentWrong:
              'Coste menor por mantener infraestructura redundante activa durante la ventana de observación.',
            lessonRecommendation: '',
            outcomeSummary:
              'Todos los servicios operan estables en eu-central-1 con respaldo verificado y comunicación regulatoria en regla.',
            logLevel: 'INFO',
            serviceChanges: [
              { serviceId: 'srv-cloud-api', newStatus: 'Operativo' },
              { serviceId: 'srv-cloud-ledger', newStatus: 'Operativo' },
              { serviceId: 'srv-cloud-auth', newStatus: 'Operativo' },
              { serviceId: 'srv-cloud-settlement', newStatus: 'Operativo' },
              { serviceId: 'srv-cloud-bi', newStatus: 'Operativo' },
            ],
          },
        },
        {
          id: 'c5-opt-b',
          key: 'B',
          title: 'Ejecutar failback inmediato a eu-west-1 en hora punta para ahorrar costes de cloud',
          summary:
            'Reinstala tráfico hacia la región recién recuperada sin validar estabilidad prolongada ni sincronizar deltas.',
          hiddenImpact: {
            rtoImpactMinutes: 45,
            rpoImpactMinutes: 15,
            costImpactEur: 62000,
            stressDelta: 14,
            evaluation: 'critical',
            whatWentWell:
              'Intento de reducir el sobrecoste de operación multi-región.',
            whatWentWrong:
              'Un failback precipitado en hora punta provocó una segunda micro-caída y pérdida de sincronía en el Ledger.',
            lessonRecommendation:
              'Nunca ejecutes un retorno (failback) en hora punta; estabiliza al menos 24–48h en la región DR y programa el retorno con resincronización previa.',
            outcomeSummary:
              'Una réplica inestable en eu-west-1 causó un nuevo corte de 45 minutos.',
            logLevel: 'CRITICAL',
            serviceChanges: [
              { serviceId: 'srv-cloud-api', newStatus: 'Degradado' },
              { serviceId: 'srv-cloud-bi', newStatus: 'Operativo' },
            ],
          },
        },
        {
          id: 'c5-opt-c',
          key: 'C',
          title: 'Cerrar el incidente internamente sin emitir notificación DORA por tratarse de fallo cloud externo',
          summary:
            'Traslada la responsabilidad al proveedor cloud y evita abrir expediente ante el supervisor.',
          hiddenImpact: {
            rtoImpactMinutes: 10,
            rpoImpactMinutes: 0,
            costImpactEur: 49000,
            stressDelta: 6,
            evaluation: 'suboptimal',
            whatWentWell:
              'Restablecimiento técnico completo de las plataformas.',
            whatWentWrong:
              'Bajo DORA, las entidades financieras siguen siendo responsables de notificar caídas graves aunque la raíz resida en un tercero TIC.',
            lessonRecommendation:
              'Incluye en los playbooks DORA que los incidentes graves de terceros críticos también requieren notificación temprana al supervisor.',
            outcomeSummary:
              'Auditoría interna requirió apertura retroactiva de expediente regulatorio con recargo sancionador.',
            logLevel: 'WARN',
            serviceChanges: [
              { serviceId: 'srv-cloud-api', newStatus: 'Operativo' },
              { serviceId: 'srv-cloud-ledger', newStatus: 'Operativo' },
              { serviceId: 'srv-cloud-auth', newStatus: 'Operativo' },
              { serviceId: 'srv-cloud-settlement', newStatus: 'Operativo' },
              { serviceId: 'srv-cloud-bi', newStatus: 'Operativo' },
            ],
          },
        },
      ],
    },
  ],
  slaEscalations: {
    'srv-cloud-api': {
      channel: 'ESCALADO CRÍTICO · BANCA ABIERTA & TPVs',
      caller: 'CEO & Dirección de Medios de Pago',
      headline: 'API Gateway supera su RTO máximo de 20 minutos',
      quote:
        '"Miles de comercios no pueden procesar cobros con tarjeta ni transferencias PSD2. El impacto reputacional y financiero supera los 2.400 € por minuto."',
    },
    'srv-cloud-ledger': {
      channel: 'ALERTA MÁXIMA · INTEGRIDAD CONTABLE',
      caller: 'CFO & Dirección de Riesgos',
      headline: 'Base de Datos Ledger supera su RTO límite de 45 minutos',
      quote:
        '"Sin confirmación del estado limpio del Ledger no podemos conciliar saldos ni reabrir liquidaciones."',
    },
    'srv-cloud-auth': {
      channel: 'INCIDENCIA DE ACCESO · SOPORTE CLIENTES',
      caller: 'Dirección de Experiencia Digital',
      headline: 'Motor OAuth2 / MFA supera su RTO de 30 minutos',
      quote:
        '"Los clientes no logran iniciar sesión en la app bancaria ni validar operaciones con segundo factor."',
    },
    'srv-cloud-settlement': {
      channel: 'AVISO OPERATIVO · CÁMARA DE COMPENSACIÓN',
      caller: 'Operaciones Bancarias',
      headline: 'Motor SEPA supera su RTO de 3 horas',
      quote:
        '"Se aproxima la ventana de corte de la cámara interbancaria y hay remesas pendientes de emisión."',
    },
    'srv-cloud-bi': {
      channel: 'AVISO COMPLIANCE · AUDITORÍA',
      caller: 'Dirección de Cumplimiento',
      headline: 'Portal de Auditoría supera su RTO de 6 horas',
      quote:
        '"Requerimos acceso al histórico para extraer evidencias de continuidad para el supervisor."',
    },
  },
};

const SUPPLY_CHAIN_SCENARIO_DATA = {
  id: 'scn-supply-chain-03',
  code: 'DRP-TTX-2026-03',
  title: 'Compromiso Supply Chain en Pipeline CI/CD',
  organization: 'NubeSalud Digital S.A.',
  description:
    'A las 09:05 CET, el monitoreo de integridad detecta un paquete comprometido inyectado en el registro interno de artefactos CI/CD que ha sido desplegado en producción, filtrando tokens de servicio y comprometiendo contenedores de historia clínica.',
  initialState: {
    phase: 'Preparación',
    downtimeSeconds: 0,
    realRpoMinutes: 0,
    accumulatedCostEur: 0,
    decisionCostEur: 0,
    teamStressPercent: 16,
  },
  biaServices: [
    {
      id: 'srv-sc-ehr',
      name: 'Plataforma de Historia Clínica Electrónica (EHR)',
      category: 'Asistencial Crítico',
      criticality: 'Crítico',
      rtoMinutes: 45,
      rtoLabel: '45 min',
      rpoMinutes: 5,
      rpoLabel: '5 min',
      costPerMinuteEur: 1950,
      initialStatus: 'Operativo',
      owner: 'Arquitectura Clínica & DevSecOps',
      dependencies: ['K8s Producción', 'Almacén Imágenes Firmadas', 'BD Clínica'],
      recoveryStrategy:
        'Rollback inmediato a última imagen firmada criptográficamente (Cosign/SLSA) verificada previa al build comprometido.',
    },
    {
      id: 'srv-sc-cicd',
      name: 'Pipeline CI/CD y Registro Privado de Artefactos',
      category: 'Ingeniería & Despliegue',
      criticality: 'Alto',
      rtoMinutes: 180,
      rtoLabel: '3 h',
      rpoMinutes: 30,
      rpoLabel: '30 min',
      costPerMinuteEur: 420,
      initialStatus: 'Operativo',
      owner: 'Platform Engineering & AppSec',
      dependencies: ['Git Repositorio', 'Vault Secretos', 'Runners Efímeros'],
      recoveryStrategy:
        'Congelamiento del registro, revocación de runners persistentes y reconstrucción desde repositorio verificado con firma obligatoria.',
    },
    {
      id: 'srv-sc-vault',
      name: 'Gestor de Secretos y KMS Clínico',
      category: 'Seguridad Core',
      criticality: 'Crítico',
      rtoMinutes: 30,
      rtoLabel: '30 min',
      rpoMinutes: 0,
      rpoLabel: '0 min (Síncrono)',
      costPerMinuteEur: 1350,
      initialStatus: 'Operativo',
      owner: 'Equipo de Criptografía & SecOps',
      dependencies: ['HSM Dedicado', 'Identidades Workload'],
      recoveryStrategy:
        'Revocación en lote de leases dinámicos, rotación de claves maestras de servicio y sellado selectivo de tokens filtrados.',
    },
    {
      id: 'srv-sc-portal',
      name: 'Portal de Pacientes y Telemedicina',
      category: 'Atención Digital',
      criticality: 'Alto',
      rtoMinutes: 90,
      rtoLabel: '1 h 30 min',
      rpoMinutes: 15,
      rpoLabel: '15 min',
      costPerMinuteEur: 780,
      initialStatus: 'Operativo',
      owner: 'Producto Digital',
      dependencies: ['EHR API', 'CDN / WAF'],
      recoveryStrategy:
        'Modo contingencia solo-lectura de citas mientras se sustituyen contenedores verificados en el clúster.',
    },
    {
      id: 'srv-sc-billing',
      name: 'Facturación Mutuas y Aseguradoras',
      category: 'Administrativo',
      criticality: 'Medio',
      rtoMinutes: 300,
      rtoLabel: '5 h',
      rpoMinutes: 60,
      rpoLabel: '1 h',
      costPerMinuteEur: 310,
      initialStatus: 'Operativo',
      owner: 'Sistemas Financieros',
      dependencies: ['BD Clínica', 'Gestor de Secretos'],
      recoveryStrategy:
        'Reconstrucción de credenciales de integración y reanudación tras validación de integridad del entorno clínico.',
    },
  ],
  initialLogs: [
    {
      timeOffsetSeconds: 0,
      level: 'INFO',
      source: 'APPSEC-SOC',
      message: 'Escenario cargado: "Compromiso Supply Chain en Pipeline CI/CD" (DRP-TTX-2026-03).',
    },
    {
      timeOffsetSeconds: 0,
      level: 'INFO',
      source: 'BIA-ENGINE',
      message: '5 servicios sanitarios y de ingeniería monitorizados. Integridad de imágenes inicial verificada.',
    },
    {
      timeOffsetSeconds: 0,
      level: 'INFO',
      source: 'DIRECTOR',
      message: 'Sistema en estado de Preparación. Pulsa "Iniciar Ejercicio" para detectar la anomalía de build.',
    },
  ],
  timelineEvents: [
    {
      delaySeconds: 0,
      onlyDuringTurnIndex: 0,
      level: 'CRITICAL',
      source: 'RUNTIME-FALCO',
      message:
        'INCIDENTE ACTIVADO: Contenedor en producción ehr-api-v4.12 realiza conexión saliente anómala hacia IP externa enviando variables de entorno.',
      stressDelta: 17,
      serviceChanges: [
        { serviceId: 'srv-sc-cicd', newStatus: 'Degradado' },
        { serviceId: 'srv-sc-vault', newStatus: 'Degradado' },
      ],
    },
    {
      delaySeconds: 4,
      onlyDuringTurnIndex: 0,
      level: 'CRITICAL',
      source: 'APPSEC-SBOM',
      message:
        'Alerta SBOM: La imagen desplegada hace 18 minutos incluye una dependencia modificada con backdoor en fase de compilación.',
      stressDelta: 11,
      serviceChanges: [
        { serviceId: 'srv-sc-ehr', newStatus: 'Caído' },
        { serviceId: 'srv-sc-portal', newStatus: 'Degradado' },
      ],
    },
  ],
  turns: [
    {
      turnNumber: 1,
      id: 's-turn-1-detection',
      phaseName: 'Detección',
      phaseFullTitle: 'Turno 1: Contención del Build Comprometido',
      inject: {
        code: 'INJ-01',
        severity: 'Crítica',
        source: 'Runtime Security (Falco) & AppSec',
        headline: 'Artefacto troyanizado ejecutándose en producción y exfiltrando secretos',
        description:
          'El despliegue v4.12 contiene código malicioso introducido en el pipeline CI/CD. El equipo de desarrollo sigue lanzando nuevos builds que podrían heredar la misma dependencia envenenada.',
      },
      decisions: [
        {
          id: 's1-opt-a',
          key: 'A',
          title: 'Congelar despliegues CI/CD, aislar egress del namespace afectado y hacer rollback a v4.11 firmada',
          summary:
            'Detiene nuevos builds contaminados, bloquea la exfiltración de red en Kubernetes y repone la versión anterior con firma criptográfica válida.',
          hiddenImpact: {
            rtoImpactMinutes: 12,
            rpoImpactMinutes: 0,
            costImpactEur: 13500,
            stressDelta: 3,
            evaluation: 'optimal',
            whatWentWell:
              'Se cortó de raíz la exfiltración por red, se detuvo la propagación en CI/CD y se restauró una versión limpia verificada.',
            whatWentWrong:
              'La pausa temporal de CI/CD retrasó entregas no urgentes de desarrollo.',
            lessonRecommendation: '',
            outcomeSummary:
              'El rollback a la imagen v4.11 firmada eliminó el binario malicioso en producción y frenó la fuga saliente.',
            logLevel: 'INFO',
            serviceChanges: [{ serviceId: 'srv-sc-ehr', newStatus: 'Degradado' }],
          },
        },
        {
          id: 's1-opt-b',
          key: 'B',
          title: 'Lanzar un hotfix rápido desde el mismo pipeline CI/CD para eliminar la dependencia',
          summary:
            'Intenta recompilar y desplegar una versión v4.13 usando los mismos runners comprometidos para acortar tiempos.',
          hiddenImpact: {
            rtoImpactMinutes: 35,
            rpoImpactMinutes: 15,
            costImpactEur: 59000,
            stressDelta: 15,
            evaluation: 'critical',
            whatWentWell:
              'Intención rápida de parcheo desde ingeniería.',
            whatWentWrong:
              'Compilar sobre runners persistentes ya comprometidos volvió a inyectar el backdoor en la versión v4.13 y prolongó la exfiltración.',
            lessonRecommendation:
              'Nunca compiles parches de emergencia sobre un pipeline CI/CD sospechoso de compromiso; congela el pipeline y ejecuta rollback a artefactos firmados previos.',
            outcomeSummary:
              'El nuevo build v4.13 heredó la contaminación del runner, forzando la parada total del entorno clínico.',
            logLevel: 'CRITICAL',
            serviceChanges: [
              { serviceId: 'srv-sc-ehr', newStatus: 'Caído' },
              { serviceId: 'srv-sc-portal', newStatus: 'Caído' },
            ],
          },
        },
        {
          id: 's1-opt-c',
          key: 'C',
          title: 'Apagar por completo todos los clústeres Kubernetes de la compañía',
          summary:
            'Detiene toda la infraestructura en producción y desarrollo sin diferenciar qué cargas usan el artefacto comprometido.',
          hiddenImpact: {
            rtoImpactMinutes: 40,
            rpoImpactMinutes: 10,
            costImpactEur: 64000,
            stressDelta: 12,
            evaluation: 'suboptimal',
            whatWentWell:
              'Se eliminó inmediatamente toda posibilidad de exfiltración activa.',
            whatWentWrong:
              'El apagado indiscriminado derribó servicios clínicos no afectados y generó pérdida de sesiones asistenciales en curso.',
            lessonRecommendation:
              'Aplica políticas NetworkPolicy de aislamiento por namespace y rollback selectivo de imágenes antes de apagar clústeres completos.',
            outcomeSummary:
              'Todos los servicios clínicos quedaron interrumpidos provocando colapso en atención ambulatoria.',
            logLevel: 'WARN',
            serviceChanges: [
              { serviceId: 'srv-sc-ehr', newStatus: 'Caído' },
              { serviceId: 'srv-sc-portal', newStatus: 'Caído' },
              { serviceId: 'srv-sc-billing', newStatus: 'Caído' },
            ],
          },
        },
      ],
    },
    {
      turnNumber: 2,
      id: 's-turn-2-secrets',
      phaseName: 'Contención',
      phaseFullTitle: 'Turno 2: Rotación de Secretos y Credenciales',
      inject: {
        code: 'INJ-02',
        severity: 'Crítica',
        source: 'SecOps & Gestión de Claves',
        headline: 'Tokens de servicio y credenciales de BD expuestos durante 18 minutos',
        description:
          'Los logs de egress revelan que el payload malicioso leyó variables de entorno con tokens de acceso al Gestor de Secretos, credenciales de BD Clínica y API keys de aseguradoras.',
      },
      decisions: [
        {
          id: 's2-opt-a',
          key: 'A',
          title: 'Revocar todos los leases en Vault, rotar credenciales críticas y habilitar identidades Workload OIDC efímeras',
          summary:
            'Invalida los secretos comprometidos en bloque y renueva credenciales de BD y servicios clínicos de forma ordenada.',
          hiddenImpact: {
            rtoImpactMinutes: 15,
            rpoImpactMinutes: 0,
            costImpactEur: 14000,
            stressDelta: -6,
            evaluation: 'optimal',
            whatWentWell:
              'Rotación integral antes de que el atacante reutilizara los secretos filtrados, estabilizando Vault y EHR.',
            whatWentWrong:
              'Requiere reiniciar pods limpios para recoger las nuevas credenciales dinámicas.',
            lessonRecommendation: '',
            outcomeSummary:
              'Todas las credenciales filtradas quedaron invalidadas y el Gestor de Secretos vuelve a estado Operativo.',
            logLevel: 'INFO',
            serviceChanges: [
              { serviceId: 'srv-sc-vault', newStatus: 'Operativo' },
              { serviceId: 'srv-sc-ehr', newStatus: 'Operativo' },
            ],
          },
        },
        {
          id: 's2-opt-b',
          key: 'B',
          title: 'Rotar únicamente la clave de producción del Portal y dejar las de BD Clínica para el fin de semana',
          summary:
            'Pospone la rotación de credenciales de base de datos por temor a causar reinicios en los servicios médicos.',
          hiddenImpact: {
            rtoImpactMinutes: 30,
            rpoImpactMinutes: 20,
            costImpactEur: 82000,
            stressDelta: 15,
            evaluation: 'critical',
            whatWentWell:
              'Se evitó un reinicio inmediato de conexiones a base de datos.',
            whatWentWrong:
              'El atacante utilizó la credencial de BD Clínica aún vigente para acceder al esquema de pacientes.',
            lessonRecommendation:
              'Ante exfiltración confirmada de secretos, rota de inmediato el 100% de credenciales expuestas (especialmente bases de datos) usando leases dinámicos.',
            outcomeSummary:
              'Se detectó un acceso externo usando la credencial no rotada, obligando a una parada forzosa de emergencia.',
            logLevel: 'CRITICAL',
            serviceChanges: [
              { serviceId: 'srv-sc-vault', newStatus: 'Caído' },
              { serviceId: 'srv-sc-ehr', newStatus: 'Caído' },
            ],
          },
        },
        {
          id: 's2-opt-c',
          key: 'C',
          title: 'Bloquear el Gestor de Secretos en modo sellado (sealed) sin plan previo de re-aprovisionamiento',
          summary:
            'Sella Vault manualmente dejando sin respuesta cualquier petición de renovación de certificados.',
          hiddenImpact: {
            rtoImpactMinutes: 28,
            rpoImpactMinutes: 5,
            costImpactEur: 45000,
            stressDelta: 10,
            evaluation: 'suboptimal',
            whatWentWell:
              'Se detuvo cualquier lectura adicional de secretos.',
            whatWentWrong:
              'Sellar Vault sin coordinar los quórums de custodios provocó fallos en cascada en el Portal y Facturación.',
            lessonRecommendation:
              'Utiliza revocación selectiva de roles y leases en lugar de sellar por completo el Gestor de Secretos durante un incidente.',
            outcomeSummary:
              'La expiración de tokens de corta duración tumbó el Portal de Pacientes hasta recomponer el quórum.',
            logLevel: 'WARN',
            serviceChanges: [
              { serviceId: 'srv-sc-vault', newStatus: 'Caído' },
              { serviceId: 'srv-sc-portal', newStatus: 'Caído' },
            ],
          },
        },
      ],
    },
    {
      turnNumber: 3,
      id: 's-turn-3-integrity',
      phaseName: 'Backups',
      phaseFullTitle: 'Turno 3: Verificación de Integridad y Backups',
      inject: {
        code: 'INJ-03',
        severity: 'Alta',
        source: 'DBA & Forense Digital',
        headline: 'Sospecha de alteración de registros clínicos durante la ventana de exposición',
        description:
          'Durante los 18 minutos de exposición del contenedor comprometido, se registraron escrituras anómalas. Tenemos audit-logs inmutables WORM hasta el minuto anterior al despliegue y snapshots verificados de BD.',
      },
      decisions: [
        {
          id: 's3-opt-a',
          key: 'A',
          title: 'Contrastar hashes con audit-logs WORM y aplicar restauración selectiva de registros previos a la intrusión',
          summary:
            'Preserva el historial asistencial legítimo posterior validando cada tabla contra la bitácora inmutable.',
          hiddenImpact: {
            rtoImpactMinutes: 18,
            rpoImpactMinutes: 5,
            costImpactEur: 16000,
            stressDelta: -7,
            evaluation: 'optimal',
            whatWentWell:
              'Se garantizó la integridad clínica (RPO 5 min) sin descartar citas médicas legítimas registradas en paralelo.',
            whatWentWrong:
              'El cruce criptográfico con audit-logs consumió 18 minutos técnicos.',
            lessonRecommendation: '',
            outcomeSummary:
              'Integridad de historias clínicas certificada al 100% con pérdida acotada de 5 minutos.',
            logLevel: 'INFO',
            serviceChanges: [{ serviceId: 'srv-sc-ehr', newStatus: 'Operativo' }],
          },
        },
        {
          id: 's3-opt-b',
          key: 'B',
          title: 'Sobrescribir toda la BD Clínica con la copia diaria de las 00:00 CET',
          summary:
            'Descarta más de 9 horas de actividad médica de la mañana para ahorrar el análisis selectivo.',
          hiddenImpact: {
            rtoImpactMinutes: 35,
            rpoImpactMinutes: 540,
            costImpactEur: 76000,
            stressDelta: 14,
            evaluation: 'critical',
            whatWentWell:
              'Base de datos devuelta a un estado libre de intrusión.',
            whatWentWrong:
              'Se perdieron 9 horas (540 min) de diagnósticos, recetas y triajes hospitalarios del turno de mañana.',
            lessonRecommendation:
              'En entornos sanitarios con RPO de 5 minutos, utiliza bitácoras WORM y PITR en lugar de restaurar copias nocturnas completas.',
            outcomeSummary:
              'Los centros médicos perdieron las evoluciones clínicas de toda la mañana.',
            logLevel: 'CRITICAL',
            serviceChanges: [{ serviceId: 'srv-sc-ehr', newStatus: 'Degradado' }],
          },
        },
        {
          id: 's3-opt-c',
          key: 'C',
          title: 'Confiar en que no hubo alteración de datos y omitir verificación de integridad',
          summary:
            'Mantiene la base de datos tal cual sin contrastar los logs de auditoría.',
          hiddenImpact: {
            rtoImpactMinutes: 15,
            rpoImpactMinutes: 35,
            costImpactEur: 52000,
            stressDelta: 9,
            evaluation: 'suboptimal',
            whatWentWell:
              'No hubo demora adicional inmediata en producción.',
            whatWentWrong:
              'Registros alterados permanecieron en producción hasta ser detectados días después en revisión asistencial.',
            lessonRecommendation:
              'Nunca omitas la verificación de integridad contra logs WORM tras una exposición de credenciales de BD.',
            outcomeSummary:
              'Se detectaron discrepancias posteriores en prescripciones que obligaron a auditoría clínica completa.',
            logLevel: 'WARN',
            serviceChanges: [{ serviceId: 'srv-sc-billing', newStatus: 'Degradado' }],
          },
        },
      ],
    },
    {
      turnNumber: 4,
      id: 's-turn-4-recovery',
      phaseName: 'Recuperación',
      phaseFullTitle: 'Turno 4: Reconstrucción Segura de CI/CD y Portal',
      inject: {
        code: 'INJ-04',
        severity: 'Alta',
        source: 'Platform Engineering',
        headline: 'Reconstrucción del Pipeline CI/CD y reapertura del Portal de Pacientes',
        description:
          'Los equipos de producto necesitan reactivar despliegues y abrir el Portal de Telemedicina. El registro antiguo de contenedores sigue en cuarentena.',
      },
      decisions: [
        {
          id: 's4-opt-a',
          key: 'A',
          title: 'Aprovisionar runners efímeros limpios con verificación SLSA/Cosign y reabrir Portal y Facturación',
          summary:
            'Reconstruye el pipeline desde cero con firmas obligatorias y promueve primero el Portal de Pacientes según BIA.',
          hiddenImpact: {
            rtoImpactMinutes: 20,
            rpoImpactMinutes: 0,
            costImpactEur: 15000,
            stressDelta: -8,
            evaluation: 'optimal',
            whatWentWell:
              'Se eliminó el vector raíz en CI/CD mediante runners efímeros y firma criptográfica de artefactos.',
            whatWentWrong:
              'El equipo de ingeniería tardó unos minutos en migrar sus pipelines al nuevo registro firmado.',
            lessonRecommendation: '',
            outcomeSummary:
              'Portal de Pacientes y Pipeline CI/CD seguro vuelven a estado Operativo con verificación Cosign activa.',
            logLevel: 'INFO',
            serviceChanges: [
              { serviceId: 'srv-sc-cicd', newStatus: 'Operativo' },
              { serviceId: 'srv-sc-portal', newStatus: 'Operativo' },
              { serviceId: 'srv-sc-billing', newStatus: 'Operativo' },
            ],
          },
        },
        {
          id: 's4-opt-b',
          key: 'B',
          title: 'Limpiar manualmente el paquete malicioso del registro antiguo y reabrir los mismos runners',
          summary:
            'Borra el paquete sospechoso detectado sin reinstalar los runners persistentes para ahorrar tiempo.',
          hiddenImpact: {
            rtoImpactMinutes: 32,
            rpoImpactMinutes: 10,
            costImpactEur: 49000,
            stressDelta: 11,
            evaluation: 'suboptimal',
            whatWentWell:
              'Rápida puesta en marcha aparente del registro interno.',
            whatWentWrong:
              'Permanecieron cachés y scripts modificados en los runners persistentes, obligando a repetir el saneamiento.',
            lessonRecommendation:
              'Reemplaza siempre runners persistentes comprometidos por runners efímeros inmutables con políticas admission-controller.',
            outcomeSummary:
              'Se detectó persistencia en caché de compilación, retrasando la reapertura del Portal.',
            logLevel: 'WARN',
            serviceChanges: [
              { serviceId: 'srv-sc-cicd', newStatus: 'Degradado' },
              { serviceId: 'srv-sc-portal', newStatus: 'Degradado' },
            ],
          },
        },
        {
          id: 's4-opt-c',
          key: 'C',
          title: 'Priorizar Facturación de Aseguradoras antes que el Portal de Telemedicina',
          summary:
            'Asigna todo el equipo a levantar facturación administrativa dejando en espera la atención a pacientes.',
          hiddenImpact: {
            rtoImpactMinutes: 55,
            rpoImpactMinutes: 5,
            costImpactEur: 61000,
            stressDelta: 8,
            evaluation: 'critical',
            whatWentWell:
              'La facturación recuperó conectividad anticipadamente.',
            whatWentWrong:
              'Invertir el orden del BIA superó el RTO de 90 min del Portal de Pacientes (780 €/min vs 310 €/min) y bloqueó teleconsultas.',
            lessonRecommendation:
              'Respeta la criticidad asistencial y económica del BIA durante la recuperación: Portal Clínico precede a procesos administrativos.',
            outcomeSummary:
              'Las teleconsultas permanecieron bloqueadas provocando saturación en líneas telefónicas.',
            logLevel: 'CRITICAL',
            serviceChanges: [
              { serviceId: 'srv-sc-billing', newStatus: 'Operativo' },
              { serviceId: 'srv-sc-portal', newStatus: 'Caído' },
            ],
          },
        },
      ],
    },
    {
      turnNumber: 5,
      id: 's-turn-5-closure',
      phaseName: 'Cierre',
      phaseFullTitle: 'Turno 5: Notificación RGPD (Datos de Salud) y Cierre',
      inject: {
        code: 'INJ-05',
        severity: 'Media',
        source: 'DPO, Legal & Dirección Médica',
        headline: 'Evaluación de brecha de datos sanitarios de categoría especial',
        description:
          'Con todos los sistemas recuperándose, el Delegado de Protección de Datos (DPO) evalúa la notificación a la autoridad de protección de datos por el periodo de exposición de tokens.',
      },
      decisions: [
        {
          id: 's5-opt-a',
          key: 'A',
          title: 'Documentar evidencias forenses, notificar al DPO/Autoridad dentro de plazo y activar admisión estricta de imágenes firmadas',
          summary:
            'Asegura cumplimiento RGPD Art. 33 y deja bloqueado en Kubernetes cualquier contenedor no firmado.',
          hiddenImpact: {
            rtoImpactMinutes: 8,
            rpoImpactMinutes: 0,
            costImpactEur: 11000,
            stressDelta: -10,
            evaluation: 'optimal',
            whatWentWell:
              'Cierre regulatorio ejemplar en datos sanitarios y endurecimiento permanente de la cadena de suministro software.',
            whatWentWrong:
              'Carga administrativa moderada por la documentación de evidencias.',
            lessonRecommendation: '',
            outcomeSummary:
              'Todos los servicios clínicos y de ingeniería operan verificados bajo políticas admission-controller.',
            logLevel: 'INFO',
            serviceChanges: [
              { serviceId: 'srv-sc-ehr', newStatus: 'Operativo' },
              { serviceId: 'srv-sc-cicd', newStatus: 'Operativo' },
              { serviceId: 'srv-sc-vault', newStatus: 'Operativo' },
              { serviceId: 'srv-sc-portal', newStatus: 'Operativo' },
              { serviceId: 'srv-sc-billing', newStatus: 'Operativo' },
            ],
          },
        },
        {
          id: 's5-opt-b',
          key: 'B',
          title: 'Omitir notificación al DPO argumentando que los datos estaban en tránsito cifrado',
          summary:
            'Cierra el incidente como fallo técnico interno sin registrar brecha potencial.',
          hiddenImpact: {
            rtoImpactMinutes: 15,
            rpoImpactMinutes: 0,
            costImpactEur: 92000,
            stressDelta: 12,
            evaluation: 'critical',
            whatWentWell:
              'Evitó reuniones regulatorias en el corto plazo.',
            whatWentWrong:
              'Ocultar una posible exposición de datos de salud (categoría especial RGPD) acarrea sanciones severas y pérdida de acreditación.',
            lessonRecommendation:
              'Involucra al DPO desde la fase de contención ante cualquier exposición potencial de credenciales que accedan a datos de salud.',
            outcomeSummary:
              'Una auditoría externa posterior detectó el incidente no reportado generando sanción agravada.',
            logLevel: 'CRITICAL',
            serviceChanges: [
              { serviceId: 'srv-sc-ehr', newStatus: 'Operativo' },
              { serviceId: 'srv-sc-cicd', newStatus: 'Operativo' },
              { serviceId: 'srv-sc-vault', newStatus: 'Operativo' },
              { serviceId: 'srv-sc-portal', newStatus: 'Operativo' },
              { serviceId: 'srv-sc-billing', newStatus: 'Operativo' },
            ],
          },
        },
        {
          id: 's5-opt-c',
          key: 'C',
          title: 'Desactivar la verificación de firmas Cosign en producción para acelerar entregas atrasadas',
          summary:
            'Relaja temporalmente los controles de admisión para recuperar el ritmo de despliegues del equipo.',
          hiddenImpact: {
            rtoImpactMinutes: 5,
            rpoImpactMinutes: 5,
            costImpactEur: 36000,
            stressDelta: 7,
            evaluation: 'suboptimal',
            whatWentWell:
              'Agilidad inmediata en despliegues de producto.',
            whatWentWrong:
              'Desactivar la verificación criptográfica deja el clúster expuesto exactamente al mismo vector de ataque.',
            lessonRecommendation:
              'Mantén obligatoria la verificación de firma de imágenes (Cosign/OPA) como barrera permanente tras un ataque Supply Chain.',
            outcomeSummary:
              'Auditoría de seguridad bloqueó el pase a producción hasta reactivar las firmas.',
            logLevel: 'WARN',
            serviceChanges: [
              { serviceId: 'srv-sc-ehr', newStatus: 'Operativo' },
              { serviceId: 'srv-sc-cicd', newStatus: 'Degradado' },
              { serviceId: 'srv-sc-vault', newStatus: 'Operativo' },
              { serviceId: 'srv-sc-portal', newStatus: 'Operativo' },
              { serviceId: 'srv-sc-billing', newStatus: 'Operativo' },
            ],
          },
        },
      ],
    },
  ],
  slaEscalations: {
    'srv-sc-ehr': {
      channel: 'ESCALADO CRÍTICO · DIRECCIÓN MÉDICA',
      caller: 'Dirección Asistencial & Hospitales',
      headline: 'Historia Clínica Electrónica supera su RTO de 45 minutos',
      quote:
        '"Los facultativos en consulta y urgencias no tienen acceso a alergias ni historial farmacológico. Necesitamos restablecimiento verificado inmediato."',
    },
    'srv-sc-vault': {
      channel: 'ALERTA SEGURIDAD · CRIPTOGRAFÍA & KMS',
      caller: 'CISO & SecOps',
      headline: 'Gestor de Secretos supera su RTO crítico de 30 minutos',
      quote:
        '"Los microservicios no pueden renovar credenciales dinámicas tras la rotación de emergencia."',
    },
    'srv-sc-portal': {
      channel: 'ESCALADO ATENCIÓN AL PACIENTE',
      caller: 'Dirección de Telemedicina',
      headline: 'Portal de Pacientes supera su RTO de 1 h 30 min',
      quote:
        '"Cientos de videoconsultas programadas están fallando y se acumulan incidencias en el call center."',
    },
    'srv-sc-cicd': {
      channel: 'AVISO INGENIERÍA · DESPLIEGUES BLOQUEADOS',
      caller: 'VP of Engineering',
      headline: 'Pipeline CI/CD supera su RTO de 3 horas',
      quote:
        '"Los equipos necesitan un pipeline limpio con runners efímeros para liberar correcciones de producto."',
    },
    'srv-sc-billing': {
      channel: 'AVISO ADMINISTRATIVO · ASEGURADORAS',
      caller: 'Dirección Financiera',
      headline: 'Facturación a Mutuas supera su RTO de 5 horas',
      quote:
        '"Los ficheros de cierre diario con aseguradoras están pendientes de envío."',
    },
  },
};

const BUILT_IN_SCENARIOS = [
  DEFAULT_SCENARIO_DATA,
  CLOUD_OUTAGE_SCENARIO_DATA,
  SUPPLY_CHAIN_SCENARIO_DATA,
];

let activeScenario = deepClone(BUILT_IN_SCENARIOS[0]);

/* ==========================================================================
   2. ESTADO EN MEMORIA DE LA APLICACIÓN
   ========================================================================== */

const appState = {
  phase: activeScenario.initialState.phase, // 'Preparación' | 'Incidente Activo' | 'Pausado' | 'Finalizado'
  downtimeSeconds: activeScenario.initialState.downtimeSeconds,
  realRpoMinutes: activeScenario.initialState.realRpoMinutes,
  elapsedExerciseSeconds: 0,
  accumulatedCostEur: activeScenario.initialState.accumulatedCostEur,
  decisionCostEur: activeScenario.initialState.decisionCostEur,
  teamStressPercent: activeScenario.initialState.teamStressPercent,
  speedMultiplier: 1,
  biaFilter: 'ALL',
  logFilter: 'ALL',
  selectedServiceId: activeScenario.biaServices[0].id,
  currentTurnIndex: 0,
  turnRemainingSeconds: TURN_TIME_LIMIT_SECONDS,
  decisionHistory: [],
  services: [],
  logs: [],
  triggeredEventIndices: new Set(),
  rtoBreachedServiceIds: new Set(),
  activeSlaAlerts: [],
  isAlertModalOpen: false,
  isScenarioModalOpen: false,
  isHelpModalOpen: false,
  isCustomScenario: false,
  latestSlaAlert: null,
  tickIntervalId: null,
  lastTickTimestamp: null,
};

/* ==========================================================================
   3. REFERENCIAS AL DOM
   ========================================================================== */

const dom = {
  commandCenterView: document.getElementById('command-center-view'),
  aarScreen: document.getElementById('aar-screen'),

  btnOpenHelp: document.getElementById('btn-open-help'),
  btnStartExercise: document.getElementById('btn-start-exercise'),
  btnStartLabel: document.getElementById('btn-start-label'),
  btnStartIcon: document.getElementById('btn-start-icon'),
  btnPauseExercise: document.getElementById('btn-pause-exercise'),
  btnPauseLabel: document.getElementById('btn-pause-label'),
  btnResetExercise: document.getElementById('btn-reset-exercise'),
  btnExportLog: document.getElementById('btn-export-log'),
  btnOpenLoadScenario: document.getElementById('btn-open-load-scenario'),
  btnOpenExportScenario: document.getElementById('btn-open-export-scenario'),
  scenarioSelect: /** @type {HTMLSelectElement | null} */ (document.getElementById('scenario-select')),

  exercisePhaseBadge: document.getElementById('exercise-phase-badge'),
  exercisePhaseText: document.getElementById('exercise-phase-text'),
  scenarioCode: document.getElementById('scenario-code'),
  scenarioOrg: document.getElementById('scenario-org'),
  scenarioTitle: document.getElementById('scenario-title'),
  scenarioDescription: document.getElementById('scenario-description'),
  statusPhaseNote: document.getElementById('status-phase-note'),

  metricDowntime: document.getElementById('metric-downtime'),
  downtimeStateTag: document.getElementById('downtime-state-tag'),
  metricImpactedServices: document.getElementById('metric-impacted-services'),
  metricRpo: document.getElementById('metric-rpo'),
  rpoStateTag: document.getElementById('rpo-state-tag'),
  metricRpoNote: document.getElementById('metric-rpo-note'),
  metricCost: document.getElementById('metric-cost'),
  metricBurnRate: document.getElementById('metric-burn-rate'),
  kpiStressCard: document.getElementById('kpi-stress-card'),
  metricStressIcon: document.getElementById('metric-stress-icon'),
  metricStressValue: document.getElementById('metric-stress-value'),
  metricStressLabel: document.getElementById('metric-stress-label'),
  metricStressBar: document.getElementById('metric-stress-bar'),
  stressProgressbar: document.getElementById('stress-progressbar'),

  turnCounterLabel: document.getElementById('turn-counter-label'),
  turnStepper: document.getElementById('turn-stepper'),
  turnTimerContainer: document.getElementById('turn-timer-container'),
  turnTimerStatus: document.getElementById('turn-timer-status'),
  turnTimerBar: document.getElementById('turn-timer-bar'),
  turnTimerValue: document.getElementById('turn-timer-value'),
  triageBody: document.getElementById('triage-body'),

  slaBreachBanner: document.getElementById('sla-breach-banner'),
  slaBannerTitle: document.getElementById('sla-banner-title'),
  slaBannerMessage: document.getElementById('sla-banner-message'),
  btnOpenLatestSlaAlert: document.getElementById('btn-open-latest-sla-alert'),

  slaAlertModal: document.getElementById('sla-alert-modal'),
  slaModalChannel: document.getElementById('sla-modal-channel'),
  slaModalCaller: document.getElementById('sla-modal-caller'),
  slaModalTitle: document.getElementById('sla-modal-title'),
  slaModalServiceMeta: document.getElementById('sla-modal-service-meta'),
  slaModalQuote: document.getElementById('sla-modal-quote'),
  btnCloseSlaModal: document.getElementById('btn-close-sla-modal'),

  scenarioModal: document.getElementById('scenario-modal'),
  btnCloseScenarioModal: document.getElementById('btn-close-scenario-modal'),
  tabScenarioImport: document.getElementById('tab-scenario-import'),
  tabScenarioExport: document.getElementById('tab-scenario-export'),
  scenarioImportPane: document.getElementById('scenario-import-pane'),
  scenarioExportPane: document.getElementById('scenario-export-pane'),
  scenarioImportTextarea: /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById('scenario-import-textarea')
  ),
  scenarioExportTextarea: /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById('scenario-export-textarea')
  ),
  scenarioExportMeta: document.getElementById('scenario-export-meta'),
  scenarioModalFeedback: document.getElementById('scenario-modal-feedback'),
  valChipJson: document.getElementById('val-chip-json'),
  valChipId: document.getElementById('val-chip-id'),
  valChipNombre: document.getElementById('val-chip-nombre'),
  valChipEventos: document.getElementById('val-chip-eventos'),
  btnRestoreDefaultScenario: document.getElementById('btn-restore-default-scenario'),
  btnApplyImportedScenario: /** @type {HTMLButtonElement | null} */ (
    document.getElementById('btn-apply-imported-scenario')
  ),
  btnDownloadScenarioJson: document.getElementById('btn-download-scenario-json'),
  btnCopyScenarioBase64: document.getElementById('btn-copy-scenario-base64'),
  btnCopyScenarioLabel: document.getElementById('btn-copy-scenario-label'),

  helpModal: document.getElementById('help-modal'),
  btnCloseHelpModal: document.getElementById('btn-close-help-modal'),

  biaTableBody: document.getElementById('bia-table-body'),
  biaServiceDetail: document.getElementById('bia-service-detail'),
  eventLogConsole: document.getElementById('event-log-console'),
  eventLogD3Chart: document.getElementById('event-log-d3-chart'),
  eventChartTooltip: document.getElementById('event-chart-tooltip'),
  logCountLabel: document.getElementById('log-count-label'),

  speedButtons: document.querySelectorAll('.speed-btn'),
  biaFilterButtons: document.querySelectorAll('.bia-filter-btn'),
  logFilterButtons: document.querySelectorAll('.log-filter-btn'),
};

/* ==========================================================================
   4. UTILIDADES DE FORMATO Y CÁLCULO
   ========================================================================== */

function formatDurationHHMMSS(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

function formatRpoDuration(totalMinutes) {
  const safeMin = Math.max(0, Math.round(totalMinutes));
  if (safeMin === 0) return '0 min';
  if (safeMin < 60) return `${safeMin} min`;
  const hours = Math.floor(safeMin / 60);
  const mins = safeMin % 60;
  if (mins === 0) return `${hours} h`;
  return `${hours} h ${mins} min`;
}

function formatCurrencyEur(amount, includeDecimals = true) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: includeDecimals ? 2 : 0,
  }).format(amount);
}

function getCurrentTimestampString() {
  const now = new Date();
  return now.toLocaleTimeString('es-ES', { hour12: false });
}

function getCurrentBurnRatePerMinute() {
  return appState.services.reduce((total, srv) => {
    if (srv.status === 'Caído') return total + srv.costPerMinuteEur;
    if (srv.status === 'Degradado') return total + srv.costPerMinuteEur * 0.45;
    return total;
  }, 0);
}

function getImpactedServicesCount() {
  return appState.services.filter((srv) => srv.status !== 'Operativo').length;
}

function getStressClassification(percent) {
  if (percent < 25) {
    return {
      label: 'Calma operativa',
      textClass: 'text-emerald-400',
      valueClass: 'text-slate-50',
      barClass: 'bg-emerald-500',
      cardBorderClass: 'border-slate-800',
    };
  }
  if (percent < 40) {
    return {
      label: 'Tensión inicial',
      textClass: 'text-lime-400',
      valueClass: 'text-slate-50',
      barClass: 'bg-lime-500',
      cardBorderClass: 'border-slate-800',
    };
  }
  if (percent < 60) {
    return {
      label: 'Alerta moderada',
      textClass: 'text-amber-300',
      valueClass: 'text-amber-100',
      barClass: 'bg-amber-400',
      cardBorderClass: 'border-amber-500/25',
    };
  }
  if (percent < 75) {
    return {
      label: 'Presión alta',
      textClass: 'text-amber-400',
      valueClass: 'text-amber-200',
      barClass: 'bg-amber-500',
      cardBorderClass: 'border-amber-500/40',
    };
  }
  if (percent < 85) {
    return {
      label: 'Umbral crítico',
      textClass: 'text-orange-400',
      valueClass: 'text-orange-200',
      barClass: 'bg-orange-500',
      cardBorderClass: 'border-orange-500/50',
    };
  }
  if (percent < 95) {
    return {
      label: 'Estrés crítico',
      textClass: 'text-red-400',
      valueClass: 'text-red-200',
      barClass: 'bg-red-500',
      cardBorderClass: 'border-red-500/60',
    };
  }
  return {
    label: 'Saturación extrema',
    textClass: 'text-red-400',
    valueClass: 'text-red-300',
    barClass: 'bg-red-600 animate-pulse',
    cardBorderClass: 'border-red-500/75',
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function copyTextToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
  }
  return Promise.resolve(fallbackCopyText(text));
}

function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch (_err) {
    // Silencioso si el navegador restringe execCommand
  }
  document.body.removeChild(textarea);
}

/* ==========================================================================
   4B. PERSISTENCIA DE ESTADO Y CODIFICACIÓN BASE64 DE ESCENARIO
   ========================================================================== */

function encodeScenarioToBase64(scenarioObj) {
  const jsonString = JSON.stringify(scenarioObj);
  const bytes = new TextEncoder().encode(jsonString);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decodeBase64ToJson(rawInput) {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) {
    throw new Error('Introduce un JSON válido o un string Base64 de escenario.');
  }

  // Soporte directo si el usuario pega JSON sin codificar
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      throw new Error(
        `JSON no parseable: ${err instanceof Error ? err.message : 'sintaxis inválida'}.`
      );
    }
  }

  // Decodificación Base64 estándar o URL-safe hacia JSON UTF-8
  try {
    const normalizedB64 = trimmed.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const paddedB64 = normalizedB64.padEnd(Math.ceil(normalizedB64.length / 4) * 4, '=');
    const binary = atob(paddedB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const jsonString = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(jsonString);
  } catch (err) {
    throw new Error(
      `No es un JSON parseable ni un Base64 válido (${
        err instanceof Error ? err.message : 'error de formato'
      }).`
    );
  }
}

function getScenarioCandidateObject(rawData) {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    return null;
  }
  if (rawData.scenario && typeof rawData.scenario === 'object' && !Array.isArray(rawData.scenario)) {
    return rawData.scenario;
  }
  return rawData;
}

function extractScenarioCoreKeys(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { id: '', nombre: '', eventos: null };
  }

  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const nombre =
    typeof candidate.nombre === 'string' && candidate.nombre.trim()
      ? candidate.nombre.trim()
      : typeof candidate.title === 'string' && candidate.title.trim()
      ? candidate.title.trim()
      : '';

  const eventos =
    Array.isArray(candidate.eventos)
      ? candidate.eventos
      : Array.isArray(candidate.turns)
      ? candidate.turns
      : null;

  return { id, nombre, eventos };
}

function buildDefaultDecisionsForSimpleEvent(turnIndex, eventLabel) {
  return [
    {
      id: `t${turnIndex + 1}-opt-a`,
      key: 'A',
      title: `Aplicar contención selectiva y protocolo DRP para "${eventLabel}"`,
      summary:
        'Aísla los sistemas afectados manteniendo operativos los servicios esenciales y activa el plan de contingencia.',
      hiddenImpact: {
        rtoImpactMinutes: 12,
        rpoImpactMinutes: 0,
        costImpactEur: 12000,
        stressDelta: -2,
        evaluation: 'optimal',
        whatWentWell: 'Contención rápida y alineada con prioridades del BIA.',
        whatWentWrong: 'Impacto mínimo derivado de la ventana inicial de respuesta.',
        lessonRecommendation: '',
        outcomeSummary: 'La respuesta selectiva estabilizó el incidente sin pérdida de datos.',
        logLevel: 'INFO',
        serviceChanges: [],
      },
    },
    {
      id: `t${turnIndex + 1}-opt-b`,
      key: 'B',
      title: 'Escalar revisión manual completa antes de intervenir en producción',
      summary:
        'Posponer medidas de aislamiento mientras se recopilan evidencias adicionales.',
      hiddenImpact: {
        rtoImpactMinutes: 40,
        rpoImpactMinutes: 15,
        costImpactEur: 48000,
        stressDelta: 10,
        evaluation: 'suboptimal',
        whatWentWell: 'Se conservaron evidencias previas al cambio.',
        whatWentWrong: 'La demora en ejecutar la contención incrementó el downtime y el coste.',
        lessonRecommendation:
          'Prioriza medidas de contención inmediata antes de extender análisis manuales.',
        outcomeSummary: 'El incidente continuó afectando a la operación durante la espera.',
        logLevel: 'WARN',
        serviceChanges: [],
      },
    },
  ];
}

function validateAndNormalizeScenario(rawData) {
  const candidate = getScenarioCandidateObject(rawData);
  if (!candidate) {
    throw new Error('El JSON debe representar un objeto raíz de escenario válido.');
  }

  const core = extractScenarioCoreKeys(candidate);
  const missingKeys = [];
  if (!core.id) missingKeys.push('id');
  if (!core.nombre) missingKeys.push('nombre');
  if (!Array.isArray(core.eventos) || core.eventos.length === 0) missingKeys.push('eventos');

  if (missingKeys.length > 0) {
    throw new Error(
      `Faltan llaves obligatorias o están vacías: ${missingKeys.join(', ')}.`
    );
  }

  const rawServices = Array.isArray(candidate.biaServices)
    ? candidate.biaServices
    : Array.isArray(candidate.servicios)
    ? candidate.servicios
    : null;

  if (rawServices !== null && rawServices.length === 0) {
    throw new Error('Si defines "biaServices" o "servicios", debe incluir al menos un servicio.');
  }

  const servicesToNormalize =
    rawServices && rawServices.length > 0
      ? rawServices
      : deepClone(DEFAULT_SCENARIO_DATA.biaServices.slice(0, 3));

  const normalizedServices = servicesToNormalize.map((srv, idx) => {
    if (!srv || typeof srv !== 'object' || (!srv.name && !srv.nombre)) {
      throw new Error(`El servicio BIA #${idx + 1} no tiene un nombre válido.`);
    }
    const srvName = String(srv.name || srv.nombre);
    const rtoMin = Number(srv.rtoMinutes ?? srv.rto ?? 60);
    const rpoMin = Number(srv.rpoMinutes ?? srv.rpo ?? 15);
    const costPerMin = Number(srv.costPerMinuteEur ?? srv.costePorMinuto ?? 500);
    if (!Number.isFinite(rtoMin) || rtoMin <= 0) {
      throw new Error(`El servicio "${srvName}" requiere un "rtoMinutes" mayor que 0.`);
    }
    return {
      id: String(srv.id || `srv-custom-${idx + 1}`),
      name: srvName,
      category: String(srv.category || srv.categoria || 'Infraestructura'),
      criticality: String(srv.criticality || srv.criticidad || 'Crítico'),
      rtoMinutes: rtoMin,
      rtoLabel: String(srv.rtoLabel || formatRpoDuration(rtoMin)),
      rpoMinutes: Number.isFinite(rpoMin) && rpoMin >= 0 ? rpoMin : 15,
      rpoLabel: String(srv.rpoLabel || formatRpoDuration(Number.isFinite(rpoMin) ? rpoMin : 15)),
      costPerMinuteEur: Number.isFinite(costPerMin) && costPerMin >= 0 ? costPerMin : 500,
      initialStatus: ['Operativo', 'Degradado', 'Caído'].includes(srv.initialStatus)
        ? srv.initialStatus
        : 'Operativo',
      owner: String(srv.owner || srv.responsable || 'Equipo de Operaciones'),
      dependencies: Array.isArray(srv.dependencies)
        ? srv.dependencies.map(String)
        : ['Infraestructura Base'],
      recoveryStrategy: String(
        srv.recoveryStrategy ||
          srv.estrategia ||
          'Procedimiento de contingencia y validación forense estándar.'
      ),
    };
  });

  const normalizedTurns = core.eventos.map((rawEvent, tIdx) => {
    if (typeof rawEvent === 'string' && rawEvent.trim()) {
      const text = rawEvent.trim();
      return {
        turnNumber: tIdx + 1,
        id: `turn-${tIdx + 1}`,
        phaseName: `Fase ${tIdx + 1}`,
        phaseFullTitle: `Turno ${tIdx + 1}: Evento operativo`,
        inject: {
          code: `INJ-0${tIdx + 1}`,
          severity: 'Alta',
          source: 'SOC Tier 2',
          headline: text,
          description: text,
        },
        decisions: buildDefaultDecisionsForSimpleEvent(tIdx, text),
      };
    }

    if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) {
      throw new Error(`El elemento #${tIdx + 1} de "eventos" debe ser un objeto válido.`);
    }

    const injectObj = rawEvent.inject && typeof rawEvent.inject === 'object' ? rawEvent.inject : rawEvent;
    const headline = String(
      injectObj.headline || injectObj.titulo || injectObj.title || injectObj.nombre || ''
    ).trim();
    const description = String(
      injectObj.description || injectObj.descripcion || injectObj.mensaje || headline
    ).trim();

    if (!headline && !description) {
      throw new Error(
        `El evento #${tIdx + 1} requiere al menos un título ("titulo"/"headline") o descripción.`
      );
    }

    const rawDecisions = Array.isArray(rawEvent.decisions)
      ? rawEvent.decisions
      : Array.isArray(rawEvent.decisiones)
      ? rawEvent.decisiones
      : null;

    if (rawDecisions !== null && rawDecisions.length < 2) {
      throw new Error(`El evento #${tIdx + 1} debe tener al menos 2 opciones si define "decisions".`);
    }

    const normalizedDecisions = rawDecisions
      ? rawDecisions.map((opt, dIdx) => {
          if (!opt || typeof opt !== 'object' || (!opt.title && !opt.titulo)) {
            throw new Error(`La opción #${dIdx + 1} del evento #${tIdx + 1} no tiene título válido.`);
          }
          const imp = opt.hiddenImpact || opt.impacto || {};
          return {
            id: String(opt.id || `t${tIdx + 1}-opt-${dIdx + 1}`),
            key: String(opt.key || String.fromCharCode(65 + dIdx)),
            title: String(opt.title || opt.titulo),
            summary: String(
              opt.summary || opt.resumen || 'Acción operativa propuesta para el turno actual.'
            ),
            hiddenImpact: {
              rtoImpactMinutes: Number(imp.rtoImpactMinutes ?? imp.rto ?? 15) || 0,
              rpoImpactMinutes: Number(imp.rpoImpactMinutes ?? imp.rpo ?? 0) || 0,
              costImpactEur: Number(imp.costImpactEur ?? imp.coste ?? 15000) || 0,
              stressDelta: Number(imp.stressDelta ?? imp.estres ?? 0) || 0,
              evaluation: ['optimal', 'suboptimal', 'critical'].includes(imp.evaluation)
                ? imp.evaluation
                : 'suboptimal',
              whatWentWell: String(imp.whatWentWell || 'Se ejecutó una respuesta táctica registrada.'),
              whatWentWrong: String(
                imp.whatWentWrong || 'Impacto operativo asumido según la decisión.'
              ),
              lessonRecommendation: String(imp.lessonRecommendation || ''),
              outcomeSummary: String(
                imp.outcomeSummary || 'Decisión procesada por el motor de simulación.'
              ),
              logLevel: ['INFO', 'WARN', 'CRITICAL'].includes(imp.logLevel) ? imp.logLevel : 'INFO',
              serviceChanges: Array.isArray(imp.serviceChanges) ? imp.serviceChanges : [],
            },
          };
        })
      : buildDefaultDecisionsForSimpleEvent(tIdx, headline || `Evento ${tIdx + 1}`);

    const phaseName = String(
      rawEvent.phaseName || rawEvent.fase || `Fase ${tIdx + 1}`
    );

    return {
      turnNumber: Number(rawEvent.turnNumber) || tIdx + 1,
      id: String(rawEvent.id || `turn-${tIdx + 1}`),
      phaseName,
      phaseFullTitle: String(
        rawEvent.phaseFullTitle || `Turno ${tIdx + 1}: ${phaseName}`
      ),
      inject: {
        code: String(injectObj.code || `INJ-0${tIdx + 1}`),
        severity: ['Crítica', 'Alta', 'Media'].includes(injectObj.severity || injectObj.severidad)
          ? injectObj.severity || injectObj.severidad
          : 'Alta',
        source: String(injectObj.source || injectObj.origen || 'SOC Tier 2'),
        headline: headline || `Evento ${tIdx + 1}`,
        description,
      },
      decisions: normalizedDecisions,
    };
  });

  const init = candidate.initialState || {};
  return {
    id: core.id,
    code: String(candidate.code || candidate.codigo || core.id.toUpperCase()),
    title: core.nombre,
    organization: String(
      candidate.organization || candidate.organizacion || 'Organización Evaluada (GhostAcademy)'
    ),
    description: String(
      candidate.description ||
        candidate.descripcion ||
        'Escenario personalizado cargado y validado en tiempo real.'
    ),
    initialState: {
      phase: 'Preparación',
      downtimeSeconds: Number(init.downtimeSeconds) || 0,
      realRpoMinutes: Number(init.realRpoMinutes) || 0,
      accumulatedCostEur: Number(init.accumulatedCostEur) || 0,
      decisionCostEur: Number(init.decisionCostEur) || 0,
      teamStressPercent: Number.isFinite(Number(init.teamStressPercent))
        ? Number(init.teamStressPercent)
        : 15,
    },
    biaServices: normalizedServices,
    initialLogs:
      Array.isArray(candidate.initialLogs) && candidate.initialLogs.length > 0
        ? candidate.initialLogs
        : [
            {
              timeOffsetSeconds: 0,
              level: 'INFO',
              source: 'SOC-PLATFORM',
              message: `Escenario personalizado cargado: "${core.nombre}".`,
            },
            {
              timeOffsetSeconds: 0,
              level: 'INFO',
              source: 'DIRECTOR',
              message: 'Sistema en estado de Preparación. Pulsa "Iniciar Ejercicio" para activar el Turno 1.',
            },
          ],
    timelineEvents: Array.isArray(candidate.timelineEvents) ? candidate.timelineEvents : [],
    turns: normalizedTurns,
    slaEscalations:
      candidate.slaEscalations && typeof candidate.slaEscalations === 'object'
        ? candidate.slaEscalations
        : {},
  };
}

function inspectScenarioInput(rawInput) {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) {
    return {
      isEmpty: true,
      isValid: false,
      checks: { json: 'pending', id: 'pending', nombre: 'pending', eventos: 'pending' },
      error: '',
      summary: '',
      normalizedScenario: null,
    };
  }

  let decodedObj;
  try {
    decodedObj = decodeBase64ToJson(trimmed);
  } catch (err) {
    return {
      isEmpty: false,
      isValid: false,
      checks: { json: 'invalid', id: 'invalid', nombre: 'invalid', eventos: 'invalid' },
      error: err instanceof Error ? err.message : 'JSON no parseable.',
      summary: '',
      normalizedScenario: null,
    };
  }

  const candidate = getScenarioCandidateObject(decodedObj);
  if (!candidate) {
    return {
      isEmpty: false,
      isValid: false,
      checks: { json: 'invalid', id: 'invalid', nombre: 'invalid', eventos: 'invalid' },
      error: 'El JSON es válido sintácticamente, pero debe ser un objeto ({ ... }) de escenario.',
      summary: '',
      normalizedScenario: null,
    };
  }

  const core = extractScenarioCoreKeys(candidate);
  const checks = {
    json: 'valid',
    id: core.id ? 'valid' : 'invalid',
    nombre: core.nombre ? 'valid' : 'invalid',
    eventos: Array.isArray(core.eventos) && core.eventos.length > 0 ? 'valid' : 'invalid',
  };

  try {
    const normalizedScenario = validateAndNormalizeScenario(decodedObj);
    return {
      isEmpty: false,
      isValid: true,
      checks,
      error: '',
      summary: `Escenario válido: "${normalizedScenario.title}" (ID: ${normalizedScenario.id} · ${normalizedScenario.turns.length} ${
        normalizedScenario.turns.length === 1 ? 'evento' : 'eventos'
      }). Listo para cargar.`,
      normalizedScenario,
    };
  } catch (err) {
    return {
      isEmpty: false,
      isValid: false,
      checks,
      error: err instanceof Error ? err.message : 'Estructura de escenario inválida.',
      summary: '',
      normalizedScenario: null,
    };
  }
}

function exportCurrentScenarioBase64() {
  return encodeScenarioToBase64(activeScenario);
}

function saveSessionToStorage() {
  try {
    const payload = {
      version: 1,
      isCustomScenario: appState.isCustomScenario,
      scenario: activeScenario,
      state: {
        phase: appState.phase,
        downtimeSeconds: appState.downtimeSeconds,
        realRpoMinutes: appState.realRpoMinutes,
        elapsedExerciseSeconds: appState.elapsedExerciseSeconds,
        accumulatedCostEur: appState.accumulatedCostEur,
        decisionCostEur: appState.decisionCostEur,
        teamStressPercent: appState.teamStressPercent,
        speedMultiplier: appState.speedMultiplier,
        selectedServiceId: appState.selectedServiceId,
        currentTurnIndex: appState.currentTurnIndex,
        turnRemainingSeconds: appState.turnRemainingSeconds,
        decisionHistory: appState.decisionHistory,
        services: appState.services,
        logs: appState.logs.slice(-80),
        triggeredEventIndices: Array.from(appState.triggeredEventIndices),
        rtoBreachedServiceIds: Array.from(appState.rtoBreachedServiceIds),
        activeSlaAlerts: appState.activeSlaAlerts,
        latestSlaAlert: appState.latestSlaAlert,
      },
    };
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch (_err) {
    // Ignorar errores de cuota o restricciones de almacenamiento privado
  }
}

function restoreSessionFromStorage() {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.scenario || !parsed.state) return false;

    activeScenario = validateAndNormalizeScenario(parsed.scenario);
    appState.isCustomScenario = Boolean(parsed.isCustomScenario);

    const saved = parsed.state;
    // Solo restaurar progreso automáticamente si hay escenario personalizado o una sesión avanzada/finalizada
    const hasProgress =
      appState.isCustomScenario ||
      saved.phase === 'Finalizado' ||
      (Array.isArray(saved.decisionHistory) && saved.decisionHistory.length > 0);

    if (!hasProgress) return false;

    appState.phase = saved.phase === 'Incidente Activo' ? 'Pausado' : saved.phase || 'Preparación';
    appState.downtimeSeconds = Number(saved.downtimeSeconds) || 0;
    appState.realRpoMinutes = Number(saved.realRpoMinutes) || 0;
    appState.elapsedExerciseSeconds = Number(saved.elapsedExerciseSeconds) || 0;
    appState.accumulatedCostEur = Number(saved.accumulatedCostEur) || 0;
    appState.decisionCostEur = Number(saved.decisionCostEur) || 0;
    appState.teamStressPercent = Number.isFinite(Number(saved.teamStressPercent))
      ? Number(saved.teamStressPercent)
      : 15;
    appState.speedMultiplier = Number(saved.speedMultiplier) || 1;
    appState.selectedServiceId = saved.selectedServiceId || activeScenario.biaServices[0].id;
    appState.currentTurnIndex = Number(saved.currentTurnIndex) || 0;
    appState.turnRemainingSeconds = Number.isFinite(Number(saved.turnRemainingSeconds))
      ? Number(saved.turnRemainingSeconds)
      : TURN_TIME_LIMIT_SECONDS;
    appState.decisionHistory = Array.isArray(saved.decisionHistory) ? saved.decisionHistory : [];
    appState.services =
      Array.isArray(saved.services) && saved.services.length > 0
        ? saved.services
        : activeScenario.biaServices.map((srv) => ({
            ...srv,
            status: srv.initialStatus,
            downtimeSeconds: 0,
          }));
    appState.logs = Array.isArray(saved.logs) ? saved.logs : [];
    appState.triggeredEventIndices = new Set(saved.triggeredEventIndices || []);
    appState.rtoBreachedServiceIds = new Set(saved.rtoBreachedServiceIds || []);
    appState.activeSlaAlerts = Array.isArray(saved.activeSlaAlerts) ? saved.activeSlaAlerts : [];
    appState.latestSlaAlert = saved.latestSlaAlert || null;
    appState.isAlertModalOpen = false;
    appState.lastTickTimestamp = null;

    if (appState.phase === 'Pausado') {
      appendLog('INFO', 'PERSISTENCIA', 'Sesión restaurada automáticamente en estado Pausado.');
    }

    renderAll();
    return true;
  } catch (_err) {
    return false;
  }
}

/* ==========================================================================
   5. GESTIÓN DEL ESTADO, TURNOS Y BUCLE DE SIMULACIÓN
   ========================================================================== */

function initializeState(persistAfterInit = false) {
  stopSimulationLoop();

  appState.phase = activeScenario.initialState.phase;
  appState.downtimeSeconds = activeScenario.initialState.downtimeSeconds;
  appState.realRpoMinutes = activeScenario.initialState.realRpoMinutes;
  appState.elapsedExerciseSeconds = 0;
  appState.accumulatedCostEur = activeScenario.initialState.accumulatedCostEur;
  appState.decisionCostEur = activeScenario.initialState.decisionCostEur;
  appState.teamStressPercent = activeScenario.initialState.teamStressPercent;
  appState.currentTurnIndex = 0;
  appState.turnRemainingSeconds = TURN_TIME_LIMIT_SECONDS;
  appState.decisionHistory = [];
  appState.triggeredEventIndices = new Set();
  appState.rtoBreachedServiceIds = new Set();
  appState.activeSlaAlerts = [];
  appState.isAlertModalOpen = false;
  appState.latestSlaAlert = null;
  appState.lastTickTimestamp = null;

  if (dom.slaAlertModal) {
    dom.slaAlertModal.classList.add('hidden');
  }

  appState.services = activeScenario.biaServices.map((srv) => ({
    ...srv,
    status: srv.initialStatus,
    downtimeSeconds: 0,
  }));

  appState.selectedServiceId = appState.services.length > 0 ? appState.services[0].id : null;

  const baseTime = getCurrentTimestampString();
  appState.logs = activeScenario.initialLogs.map((entry) => ({
    id: cryptoRandomId(),
    timestamp: baseTime,
    simTime: '00:00:00',
    turnNumber: 0,
    level: entry.level,
    source: entry.source,
    message: entry.message,
    animate: false,
  }));

  if (persistAfterInit) {
    saveSessionToStorage();
  }

  renderAll();
}

function cryptoRandomId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getCurrentLogTurnNumber() {
  if (appState.phase === 'Preparación') return 0;
  const totalTurns = Math.max(1, activeScenario.turns.length);
  return Math.min(totalTurns, appState.currentTurnIndex + 1);
}

function appendLog(level, source, message) {
  appState.logs.push({
    id: cryptoRandomId(),
    timestamp: getCurrentTimestampString(),
    simTime: formatDurationHHMMSS(appState.elapsedExerciseSeconds),
    turnNumber: getCurrentLogTurnNumber(),
    level,
    source,
    message,
    animate: true,
  });
  renderEventLog(true);
}

function startExercise() {
  if (appState.phase === 'Incidente Activo' || appState.phase === 'Finalizado') {
    return;
  }

  if (appState.phase === 'Preparación') {
    appState.phase = 'Incidente Activo';
    appState.lastTickTimestamp = performance.now();
    processTimelineEvents();

    const firstTurn = activeScenario.turns[0];
    if (firstTurn) {
      appendLog(
        'WARN',
        'MOTOR-TURNOS',
        `${firstTurn.phaseFullTitle} activado (${firstTurn.inject.code}): ${firstTurn.inject.headline}.`
      );
    }

    startSimulationLoop();
    saveSessionToStorage();
    renderAll();
  } else if (appState.phase === 'Pausado') {
    resumeExercise();
  }
}

function pauseExercise() {
  if (appState.phase !== 'Incidente Activo') return;
  appState.phase = 'Pausado';
  stopSimulationLoop();
  appendLog('INFO', 'SOC-PLATFORM', 'Simulación pausada por el coordinador del ejercicio.');
  saveSessionToStorage();
  renderControlsAndHeader();
  renderStatusPanel();
  renderTriagePanel();
}

function resumeExercise() {
  if (appState.phase !== 'Pausado') return;
  appState.phase = 'Incidente Activo';
  appState.lastTickTimestamp = performance.now();
  appendLog('INFO', 'SOC-PLATFORM', 'Simulación reanudada.');
  startSimulationLoop();
  saveSessionToStorage();
  renderControlsAndHeader();
  renderStatusPanel();
  renderTriagePanel();
}

function resetExercise() {
  initializeState(true);
}

function startSimulationLoop() {
  stopSimulationLoop();
  appState.lastTickTimestamp = performance.now();
  appState.tickIntervalId = window.setInterval(handleSimulationTick, 250);
}

function stopSimulationLoop() {
  if (appState.tickIntervalId !== null) {
    window.clearInterval(appState.tickIntervalId);
    appState.tickIntervalId = null;
  }
}

function handleSimulationTick() {
  if (appState.phase !== 'Incidente Activo') return;

  const now = performance.now();
  const realDeltaSeconds = Math.min(1, Math.max(0, (now - (appState.lastTickTimestamp || now)) / 1000));
  appState.lastTickTimestamp = now;

  // Pausar cronómetro de simulación y presión temporal mientras se lee una alerta crítica modal
  if (appState.isAlertModalOpen) {
    return;
  }

  const simDeltaSeconds = realDeltaSeconds * appState.speedMultiplier;
  appState.elapsedExerciseSeconds += simDeltaSeconds;

  const impactedCount = getImpactedServicesCount();
  if (impactedCount > 0) {
    appState.downtimeSeconds += simDeltaSeconds;
  }

  // Acumular coste económico basado en servicios actualmente afectados
  const burnRatePerMinute = getCurrentBurnRatePerMinute();
  appState.accumulatedCostEur += (burnRatePerMinute / 60) * simDeltaSeconds;

  // Actualizar tiempo de inactividad por servicio y verificar incumplimientos de RTO
  let statusUpdated = false;
  appState.services.forEach((srv) => {
    if (srv.status !== 'Operativo') {
      srv.downtimeSeconds += simDeltaSeconds;
      statusUpdated = true;
      checkServiceRtoBreach(srv);
    }
  });

  // Escalamiento gradual del estrés mientras persista el incidente sin contención
  if (impactedCount > 0) {
    appState.teamStressPercent = Math.min(100, appState.teamStressPercent + 0.06 * simDeltaSeconds);
  }

  // Motor de Presión Temporal del turno (cuenta regresiva en tiempo real para que sea legible)
  appState.turnRemainingSeconds = Math.max(0, appState.turnRemainingSeconds - realDeltaSeconds);
  renderTurnTimer();

  if (appState.turnRemainingSeconds <= 0) {
    handleTurnTimeout();
    return;
  }

  processTimelineEvents();

  renderStatusPanel();
  if (statusUpdated) {
    renderBiaPanel();
  }
}

function checkServiceRtoBreach(srv) {
  const rtoSeconds = srv.rtoMinutes * 60;
  if (srv.downtimeSeconds >= rtoSeconds && !appState.rtoBreachedServiceIds.has(srv.id)) {
    appState.rtoBreachedServiceIds.add(srv.id);
    appState.teamStressPercent = Math.min(100, appState.teamStressPercent + 6);

    const escalation = activeScenario.slaEscalations[srv.id] || {
      channel: 'ALERTA SLA · COMITÉ DE CRISIS',
      caller: 'Dirección de Operaciones',
      headline: `${srv.name} supera su RTO teórico de ${srv.rtoLabel}`,
      quote: '"Se solicita actualización inmediata del plan de recuperación tras superar el SLA comprometido."',
    };

    const alertData = {
      serviceId: srv.id,
      serviceName: srv.name,
      rtoLabel: srv.rtoLabel,
      actualDowntimeFormatted: formatDurationHHMMSS(srv.downtimeSeconds),
      channel: escalation.channel,
      caller: escalation.caller,
      headline: escalation.headline,
      quote: escalation.quote,
    };

    appState.activeSlaAlerts.push(alertData);
    appState.latestSlaAlert = alertData;

    appendLog(
      'CRITICAL',
      'BIA-MONITOR',
      `RTO/SLA INCUMPLIDO en "${srv.name}" (objetivo ${srv.rtoLabel}). Escalado recibido de ${escalation.caller}.`
    );

    renderSlaBreachBanner();
    openSlaAlertModal(alertData);
  }
}

function openSlaAlertModal(alertData) {
  if (!alertData || !dom.slaAlertModal) return;
  appState.isAlertModalOpen = true;

  dom.slaModalChannel.textContent = alertData.channel;
  dom.slaModalCaller.textContent = alertData.caller;
  dom.slaModalTitle.textContent = alertData.headline;
  dom.slaModalServiceMeta.textContent = `${alertData.serviceName} · RTO Teórico: ${alertData.rtoLabel} · Downtime Real: ${alertData.actualDowntimeFormatted}`;
  dom.slaModalQuote.textContent = alertData.quote;

  dom.slaAlertModal.classList.remove('hidden');
  if (dom.btnCloseSlaModal) {
    dom.btnCloseSlaModal.focus();
  }
}

function closeSlaAlertModal() {
  if (!dom.slaAlertModal) return;
  appState.isAlertModalOpen = false;
  appState.lastTickTimestamp = performance.now();
  dom.slaAlertModal.classList.add('hidden');
}

function renderSlaBreachBanner() {
  if (!dom.slaBreachBanner) return;
  if (appState.rtoBreachedServiceIds.size === 0 || appState.phase === 'Preparación') {
    dom.slaBreachBanner.classList.add('hidden');
    return;
  }

  const breachedNames = appState.services
    .filter((srv) => appState.rtoBreachedServiceIds.has(srv.id))
    .map((srv) => srv.name);

  dom.slaBannerTitle.textContent = `ALERTA SLA / RTO INCUMPLIDO (${breachedNames.length} ${
    breachedNames.length === 1 ? 'SERVICIO' : 'SERVICIOS'
  })`;
  dom.slaBannerMessage.textContent = `${breachedNames.join(', ')} ha${
    breachedNames.length === 1 ? '' : 'n'
  } superado su límite teórico de recuperación. Presión directa de Dirección y clientes.`;

  dom.slaBreachBanner.classList.remove('hidden');
}

function processTimelineEvents() {
  let serviceChanged = false;

  activeScenario.timelineEvents.forEach((evt, index) => {
    const turnMatch =
      typeof evt.onlyDuringTurnIndex !== 'number' ||
      appState.currentTurnIndex === evt.onlyDuringTurnIndex;

    if (
      turnMatch &&
      !appState.triggeredEventIndices.has(index) &&
      appState.elapsedExerciseSeconds >= evt.delaySeconds
    ) {
      appState.triggeredEventIndices.add(index);

      if (typeof evt.stressDelta === 'number') {
        appState.teamStressPercent = Math.min(
          100,
          Math.max(0, appState.teamStressPercent + evt.stressDelta)
        );
      }

      if (Array.isArray(evt.serviceChanges)) {
        evt.serviceChanges.forEach((change) => {
          const target = appState.services.find((s) => s.id === change.serviceId);
          if (target && target.status !== change.newStatus) {
            target.status = change.newStatus;
            serviceChanged = true;
          }
        });
      }

      appendLog(evt.level, evt.source, evt.message);
    }
  });

  if (serviceChanged) {
    renderBiaPanel();
  }
}

function getWorstDecisionForTurn(turn) {
  if (!turn || !Array.isArray(turn.decisions) || turn.decisions.length === 0) return null;
  return turn.decisions.reduce((worst, current) => {
    const worstScore =
      worst.hiddenImpact.costImpactEur + worst.hiddenImpact.rtoImpactMinutes * 1000;
    const currentScore =
      current.hiddenImpact.costImpactEur + current.hiddenImpact.rtoImpactMinutes * 1000;
    return currentScore > worstScore ? current : worst;
  }, turn.decisions[0]);
}

function handleTurnTimeout() {
  if (appState.phase !== 'Incidente Activo') return;
  const currentTurn = activeScenario.turns[appState.currentTurnIndex];
  if (!currentTurn) return;

  const worstDecision = getWorstDecisionForTurn(currentTurn);
  if (!worstDecision) return;

  appendLog(
    'CRITICAL',
    'TEMPORIZADOR',
    `TIEMPO AGOTADO (${TURN_TIME_LIMIT_SECONDS}s) en ${currentTurn.phaseFullTitle}. El sistema aplica la opción más adversa (${worstDecision.key}) y una penalización por parálisis operativa.`
  );

  applyDecisionOutcome(currentTurn, worstDecision, true);
}

function handleDecisionSelection(decisionId) {
  if (appState.phase !== 'Incidente Activo') return;

  const currentTurn = activeScenario.turns[appState.currentTurnIndex];
  if (!currentTurn) return;

  const selectedDecision = currentTurn.decisions.find((opt) => opt.id === decisionId);
  if (!selectedDecision) return;

  applyDecisionOutcome(currentTurn, selectedDecision, false);
}

function applyDecisionOutcome(currentTurn, selectedDecision, isTimeout = false) {
  const impact = selectedDecision.hiddenImpact;
  const extraRto = isTimeout ? TIMEOUT_PENALTY.rtoMinutes : 0;
  const extraRpo = isTimeout ? TIMEOUT_PENALTY.rpoMinutes : 0;
  const extraCost = isTimeout ? TIMEOUT_PENALTY.costEur : 0;
  const extraStress = isTimeout ? TIMEOUT_PENALTY.stressDelta : 0;

  const totalRtoMinutes = impact.rtoImpactMinutes + extraRto;
  const totalRpoMinutes = impact.rpoImpactMinutes + extraRpo;
  const totalCostEur = impact.costImpactEur + extraCost;
  const totalStressDelta = impact.stressDelta + extraStress;

  const addedDowntimeSeconds = totalRtoMinutes * 60;

  // 1. Aplicar impacto oculto en RTO real (suma tiempo de inactividad)
  appState.downtimeSeconds += addedDowntimeSeconds;
  appState.services.forEach((srv) => {
    if (srv.status !== 'Operativo') {
      srv.downtimeSeconds += addedDowntimeSeconds;
      checkServiceRtoBreach(srv);
    }
  });

  // 2. Aplicar impacto oculto en RPO real (pérdida de datos)
  appState.realRpoMinutes += totalRpoMinutes;

  // 3. Aplicar impacto oculto en coste económico y estrés del equipo
  appState.accumulatedCostEur += totalCostEur;
  appState.decisionCostEur += totalCostEur;
  appState.teamStressPercent = Math.min(
    100,
    Math.max(0, appState.teamStressPercent + totalStressDelta)
  );

  // 4. Actualizar estados de servicios BIA según consecuencias de la decisión
  if (Array.isArray(impact.serviceChanges)) {
    impact.serviceChanges.forEach((change) => {
      const target = appState.services.find((s) => s.id === change.serviceId);
      if (target) {
        target.status = change.newStatus;
      }
    });
  }

  const outcomeText = isTimeout
    ? `[TIEMPO AGOTADO] ${impact.outcomeSummary} Penalización añadida: +${extraRto} min RTO, +${extraRpo} min RPO y +${formatCurrencyEur(
        extraCost,
        false
      )}.`
    : impact.outcomeSummary;

  // 5. Registrar decisión en historial para debrief inmediato y After Action Report
  appState.decisionHistory.push({
    turnNumber: currentTurn.turnNumber,
    phaseName: currentTurn.phaseName,
    injectCode: currentTurn.inject.code,
    decisionKey: selectedDecision.key,
    decisionTitle: selectedDecision.title,
    timedOut: isTimeout,
    evaluation: isTimeout ? 'critical' : impact.evaluation || 'suboptimal',
    whatWentWell: isTimeout
      ? 'Ninguno: la falta de decisión dentro del tiempo límite dejó al incidente sin dirección táctica.'
      : impact.whatWentWell || 'Acción ejecutada dentro del plazo operativo.',
    whatWentWrong: isTimeout
      ? `Se superó el límite de ${TURN_TIME_LIMIT_SECONDS}s y el sistema aplicó la peor respuesta posible con penalización adicional.`
      : impact.whatWentWrong || 'Se asumieron costes y tiempos de recuperación evitables.',
    lessonRecommendation: isTimeout
      ? `En ${currentTurn.phaseFullTitle}, el exceso de tiempo en triaje generó parálisis operativa. Define criterios previos de decisión rápida en el comité DRP.`
      : impact.lessonRecommendation || '',
    rtoImpactMinutes: totalRtoMinutes,
    rpoImpactMinutes: totalRpoMinutes,
    costImpactEur: totalCostEur,
    stressDelta: totalStressDelta,
    outcomeSummary: outcomeText,
  });

  // 6. Registrar decisión y consecuencias en la consola SOC
  appendLog(
    isTimeout ? 'CRITICAL' : 'INFO',
    `DECISIÓN-T${currentTurn.turnNumber}`,
    `${isTimeout ? '[AUTO POR TIMEOUT] ' : ''}Opción ${selectedDecision.key} ejecutada: "${
      selectedDecision.title
    }".`
  );
  appendLog(
    isTimeout ? 'CRITICAL' : impact.logLevel || 'INFO',
    currentTurn.inject.source,
    `${outcomeText} [Impacto real: +${totalRtoMinutes} min RTO · +${totalRpoMinutes} min RPO · +${formatCurrencyEur(
      totalCostEur,
      false
    )}]`
  );

  // 7. Avanzar al siguiente turno y reiniciar reloj de presión temporal
  appState.currentTurnIndex += 1;
  appState.turnRemainingSeconds = TURN_TIME_LIMIT_SECONDS;

  if (appState.currentTurnIndex < activeScenario.turns.length) {
    const nextTurn = activeScenario.turns[appState.currentTurnIndex];
    appendLog(
      nextTurn.inject.severity === 'Crítica' ? 'CRITICAL' : 'WARN',
      'MOTOR-TURNOS',
      `${nextTurn.phaseFullTitle} (${nextTurn.inject.code}): ${nextTurn.inject.headline}.`
    );
  } else {
    appState.phase = 'Finalizado';
    appState.isAlertModalOpen = false;
    if (dom.slaAlertModal) {
      dom.slaAlertModal.classList.add('hidden');
    }
    stopSimulationLoop();
    appendLog(
      'INFO',
      'COMITÉ-DRP',
      `Ejercicio completado. RTO real acumulado: ${formatDurationHHMMSS(
        appState.downtimeSeconds
      )} · RPO real: ${formatRpoDuration(appState.realRpoMinutes)} · Coste total: ${formatCurrencyEur(
        appState.accumulatedCostEur,
        true
      )}.`
    );
  }

  saveSessionToStorage();
  renderAll();
}

/* ==========================================================================
   6. FUNCIONES DE RENDERIZADO DE INTERFAZ Y AFTER ACTION REPORT (AAR)
   ========================================================================== */

function renderAll() {
  renderScenarioMetadata();
  renderControlsAndHeader();

  if (appState.phase === 'Finalizado') {
    if (dom.commandCenterView) dom.commandCenterView.classList.add('hidden');
    if (dom.aarScreen) dom.aarScreen.classList.remove('hidden');
    renderAfterActionReport();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (dom.commandCenterView) dom.commandCenterView.classList.remove('hidden');
  if (dom.aarScreen) dom.aarScreen.classList.add('hidden');

  renderSlaBreachBanner();
  renderStatusPanel();
  renderTriagePanel();
  renderBiaPanel();
  renderEventLog(false);
}

function renderScenarioMetadata() {
  dom.scenarioCode.textContent = appState.isCustomScenario
    ? `${activeScenario.code} · PERSONALIZADO`
    : activeScenario.code;
  dom.scenarioOrg.textContent = activeScenario.organization;
  dom.scenarioTitle.textContent = activeScenario.title;
  dom.scenarioDescription.textContent = activeScenario.description;
}

function renderControlsAndHeader() {
  const isPrep = appState.phase === 'Preparación';
  const isActive = appState.phase === 'Incidente Activo';
  const isPaused = appState.phase === 'Pausado';
  const isFinished = appState.phase === 'Finalizado';

  // Badge de fase del ejercicio
  dom.exercisePhaseText.textContent = appState.phase;
  dom.exercisePhaseBadge.className =
    'inline-flex items-center gap-1.5 font-mono font-semibold px-2.5 py-1 rounded-md border text-xs ';

  if (isPrep) {
    dom.exercisePhaseBadge.className += 'border-sky-500/30 bg-sky-500/10 text-sky-300';
    dom.statusPhaseNote.textContent =
      'En espera de activación del ejercicio para iniciar telemetría e injects.';
  } else if (isActive) {
    dom.exercisePhaseBadge.className += 'border-red-500/40 bg-red-500/15 text-red-300';
    dom.statusPhaseNote.textContent =
      'Simulación en curso: cada decisión impacta directamente en RTO, RPO, coste y estrés.';
  } else if (isPaused) {
    dom.exercisePhaseBadge.className += 'border-amber-500/40 bg-amber-500/15 text-amber-300';
    dom.statusPhaseNote.textContent = 'Simulación pausada. Puedes reanudar o reiniciar el escenario.';
  } else {
    dom.exercisePhaseBadge.className += 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
    dom.statusPhaseNote.textContent =
      'Ejercicio completado. Revisa el balance post-mortem en el Centro de Triaje.';
  }

  // Botón principal en la barra superior
  if (isPrep) {
    dom.btnStartLabel.textContent = 'Iniciar Ejercicio';
    dom.btnStartExercise.disabled = false;
    dom.btnStartExercise.className =
      'inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[40px] rounded-lg text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-soc-canvas';
    dom.btnStartIcon.innerHTML = '<polygon points="6 3 20 12 6 21 6 3"></polygon>';
  } else if (isActive) {
    dom.btnStartLabel.textContent = 'Incidente Activo';
    dom.btnStartExercise.disabled = true;
    dom.btnStartExercise.className =
      'inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[40px] rounded-lg text-sm font-semibold bg-red-600/20 border border-red-500/40 text-red-200 cursor-default transition-colors duration-150 whitespace-nowrap shrink-0';
    dom.btnStartIcon.innerHTML =
      '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>';
  } else if (isPaused) {
    dom.btnStartLabel.textContent = 'Reanudar Ejercicio';
    dom.btnStartExercise.disabled = false;
    dom.btnStartExercise.className =
      'inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[40px] rounded-lg text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-soc-canvas';
    dom.btnStartIcon.innerHTML = '<polygon points="6 3 20 12 6 21 6 3"></polygon>';
  } else {
    dom.btnStartLabel.textContent = 'Ejercicio Finalizado';
    dom.btnStartExercise.disabled = true;
    dom.btnStartExercise.className =
      'inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[40px] rounded-lg text-sm font-semibold bg-emerald-600/20 border border-emerald-500/40 text-emerald-200 cursor-default transition-colors duration-150 whitespace-nowrap shrink-0';
    dom.btnStartIcon.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
  }

  // Botones secundarios
  dom.btnPauseExercise.disabled = isPrep || isFinished;
  dom.btnPauseLabel.textContent = isPaused ? 'Reanudar' : 'Pausar';
  dom.btnResetExercise.disabled = isPrep;

  // Selector de escenario predefinido
  syncScenarioSelectControl(isActive || isPaused);

  // Botones de velocidad
  dom.speedButtons.forEach((btn) => {
    const speed = Number(btn.dataset.speed);
    const active = speed === appState.speedMultiplier;
    btn.className = `speed-btn px-2.5 py-1.5 text-xs font-mono font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 ${
      active ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-100'
    }`;
  });
}

function syncScenarioSelectControl(isLocked) {
  if (!dom.scenarioSelect) return;
  const existingCustomOpt = dom.scenarioSelect.querySelector('option[value="__custom__"]');

  if (appState.isCustomScenario) {
    if (!existingCustomOpt) {
      const opt = document.createElement('option');
      opt.value = '__custom__';
      opt.textContent = `${activeScenario.code} · Personalizado (${activeScenario.title})`;
      dom.scenarioSelect.appendChild(opt);
    } else {
      existingCustomOpt.textContent = `${activeScenario.code} · Personalizado (${activeScenario.title})`;
    }
    dom.scenarioSelect.value = '__custom__';
  } else {
    if (existingCustomOpt) {
      existingCustomOpt.remove();
    }
    const hasMatch = BUILT_IN_SCENARIOS.some((s) => s.id === activeScenario.id);
    if (hasMatch) {
      dom.scenarioSelect.value = activeScenario.id;
    }
  }

  dom.scenarioSelect.disabled = Boolean(isLocked);
}

function switchBuiltInScenario(scenarioId) {
  if (appState.phase === 'Incidente Activo' || appState.phase === 'Pausado') {
    syncScenarioSelectControl(true);
    return;
  }
  const found = BUILT_IN_SCENARIOS.find((s) => s.id === scenarioId);
  if (!found) return;
  activeScenario = deepClone(found);
  appState.isCustomScenario = false;
  initializeState(true);
}

function renderStatusPanel() {
  const impactedCount = getImpactedServicesCount();
  const totalServices = appState.services.length;
  const burnRate = getCurrentBurnRatePerMinute();
  const stressRounded = Math.round(appState.teamStressPercent);
  const stressInfo = getStressClassification(stressRounded);

  // 1. Downtime / RTO real
  dom.metricDowntime.textContent = formatDurationHHMMSS(appState.downtimeSeconds);
  if (appState.phase === 'Preparación') {
    dom.downtimeStateTag.textContent = 'En espera';
    dom.downtimeStateTag.className = 'text-xs font-mono text-slate-400';
  } else if (appState.phase === 'Finalizado') {
    dom.downtimeStateTag.textContent = 'RTO final';
    dom.downtimeStateTag.className = 'text-xs font-mono text-emerald-400';
  } else if (impactedCount > 0) {
    dom.downtimeStateTag.textContent = 'Contabilizando';
    dom.downtimeStateTag.className = 'text-xs font-mono text-red-400';
  } else {
    dom.downtimeStateTag.textContent = 'Estabilizado';
    dom.downtimeStateTag.className = 'text-xs font-mono text-emerald-400';
  }
  dom.metricImpactedServices.textContent = `${impactedCount} de ${totalServices} servicios críticos afectados`;

  // 2. Pérdida de datos (RPO real)
  dom.metricRpo.textContent = formatRpoDuration(appState.realRpoMinutes);
  if (appState.realRpoMinutes === 0) {
    dom.rpoStateTag.textContent = 'Sin pérdida';
    dom.rpoStateTag.className = 'text-xs font-mono text-emerald-400';
  } else if (appState.realRpoMinutes <= 30) {
    dom.rpoStateTag.textContent = 'Dentro de umbral';
    dom.rpoStateTag.className = 'text-xs font-mono text-amber-400';
  } else {
    dom.rpoStateTag.textContent = 'Pérdida severa';
    dom.rpoStateTag.className = 'text-xs font-mono text-red-400';
  }
  dom.metricRpoNote.textContent =
    appState.realRpoMinutes === 0
      ? 'Ventana de datos no recuperados'
      : 'Datos perdidos acumulados por decisiones';

  // 3. Coste acumulado
  dom.metricCost.textContent = formatCurrencyEur(appState.accumulatedCostEur, true);
  dom.metricBurnRate.innerHTML = `Tasa actual: <span class="font-mono ${
    burnRate > 0 ? 'text-amber-300' : 'text-slate-300'
  }">${formatCurrencyEur(burnRate, false)}/min</span> <span aria-hidden="true">·</span> Decisiones: <span class="font-mono text-slate-300">${formatCurrencyEur(
    appState.decisionCostEur,
    false
  )}</span>`;

  // 4. Nivel de estrés (transición suave verde -> ámbar -> rojo con clases dinámicas Tailwind)
  dom.metricStressValue.textContent = `${stressRounded}%`;
  dom.metricStressValue.className = `text-3xl font-mono font-semibold tracking-tight tabular-nums transition-colors duration-500 ${stressInfo.valueClass}`;
  dom.metricStressLabel.textContent = stressInfo.label;
  dom.metricStressLabel.className = `text-xs font-medium transition-colors duration-500 ${stressInfo.textClass}`;
  if (dom.metricStressIcon) {
    dom.metricStressIcon.setAttribute(
      'class',
      `w-3.5 h-3.5 shrink-0 transition-colors duration-500 ${stressInfo.textClass}`
    );
  }
  if (dom.kpiStressCard) {
    dom.kpiStressCard.className = `rounded-xl border bg-soc-surface p-5 flex flex-col justify-between gap-4 transition-colors duration-500 ${stressInfo.cardBorderClass}`;
  }
  dom.metricStressBar.style.width = `${stressRounded}%`;
  dom.metricStressBar.className = `h-full rounded-full transition-all duration-500 ease-out ${stressInfo.barClass}`;
  dom.stressProgressbar.setAttribute('aria-valuenow', String(stressRounded));
}

function renderTurnStepper() {
  const totalTurns = activeScenario.turns.length;

  if (appState.phase === 'Preparación') {
    dom.turnCounterLabel.textContent = `0 / ${totalTurns} turnos`;
  } else if (appState.phase === 'Finalizado') {
    dom.turnCounterLabel.textContent = `${totalTurns} / ${totalTurns} completados`;
  } else {
    dom.turnCounterLabel.textContent = `Turno ${appState.currentTurnIndex + 1} de ${totalTurns}`;
  }

  dom.turnStepper.innerHTML = activeScenario.turns
    .map((turn, idx) => {
      const isCompleted =
        appState.phase === 'Finalizado' || idx < appState.currentTurnIndex;
      const isCurrent =
        (appState.phase === 'Incidente Activo' || appState.phase === 'Pausado') &&
        idx === appState.currentTurnIndex;

      let stateClass = 'border-slate-800 bg-soc-canvas/60 text-slate-500';
      let prefix = `${turn.turnNumber}.`;

      if (isCompleted) {
        stateClass = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
        prefix = '✓';
      } else if (isCurrent) {
        stateClass = 'border-sky-500/50 bg-sky-500/15 text-sky-200 font-semibold';
      }

      return `
        <li class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${stateClass} whitespace-nowrap shrink-0">
          <span class="font-mono">${escapeHtml(prefix)}</span>
          <span>${escapeHtml(turn.phaseName)}</span>
        </li>
      `;
    })
    .join('');
}

function getInjectSeverityHtml(severity) {
  if (severity === 'Crítica') {
    return `<span class="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400">
      <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
      <span>Severidad Crítica</span>
    </span>`;
  }
  if (severity === 'Alta') {
    return `<span class="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
      <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
      <span>Severidad Alta</span>
    </span>`;
  }
  return `<span class="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-400">
    <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
    <span>Severidad Media</span>
  </span>`;
}

function renderTurnTimer() {
  if (!dom.turnTimerContainer) return;

  const isRunningOrPaused =
    appState.phase === 'Incidente Activo' || appState.phase === 'Pausado';

  if (!isRunningOrPaused) {
    dom.turnTimerContainer.classList.add('hidden');
    return;
  }

  dom.turnTimerContainer.classList.remove('hidden');

  const remainingCeil = Math.max(0, Math.ceil(appState.turnRemainingSeconds));
  const percent = Math.max(
    0,
    Math.min(100, (appState.turnRemainingSeconds / TURN_TIME_LIMIT_SECONDS) * 100)
  );
  const mins = Math.floor(remainingCeil / 60);
  const secs = remainingCeil % 60;
  dom.turnTimerValue.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  dom.turnTimerBar.style.width = `${percent}%`;

  if (appState.phase === 'Pausado') {
    dom.turnTimerStatus.textContent = 'En pausa';
    dom.turnTimerStatus.className = 'text-xs font-mono text-amber-400';
    dom.turnTimerBar.className = 'h-full rounded-full bg-amber-500 transition-all duration-200 ease-linear';
    dom.turnTimerValue.className = 'font-mono text-sm font-semibold text-amber-300 tabular-nums w-14 text-right shrink-0';
    return;
  }

  if (remainingCeil <= 10) {
    dom.turnTimerStatus.textContent = 'Crítico · Decisión inminente';
    dom.turnTimerStatus.className = 'text-xs font-mono font-semibold text-red-400 animate-pulse';
    dom.turnTimerBar.className = 'h-full rounded-full bg-red-500 transition-all duration-200 ease-linear animate-pulse';
    dom.turnTimerValue.className = 'font-mono text-sm font-semibold text-red-400 tabular-nums w-14 text-right shrink-0 animate-pulse';
  } else if (remainingCeil <= 25) {
    dom.turnTimerStatus.textContent = 'Tiempo limitado';
    dom.turnTimerStatus.className = 'text-xs font-mono text-amber-400';
    dom.turnTimerBar.className = 'h-full rounded-full bg-amber-500 transition-all duration-200 ease-linear';
    dom.turnTimerValue.className = 'font-mono text-sm font-semibold text-amber-300 tabular-nums w-14 text-right shrink-0';
  } else {
    dom.turnTimerStatus.textContent = 'En plazo';
    dom.turnTimerStatus.className = 'text-xs font-mono text-sky-400';
    dom.turnTimerBar.className = 'h-full rounded-full bg-sky-500 transition-all duration-200 ease-linear';
    dom.turnTimerValue.className = 'font-mono text-sm font-semibold text-slate-100 tabular-nums w-14 text-right shrink-0';
  }
}

function renderTriagePanel() {
  renderTurnStepper();
  renderTurnTimer();

  // Estado 1: Preparación
  if (appState.phase === 'Preparación') {
    const totalTurnsCount = activeScenario.turns.length;
    dom.triageBody.innerHTML = `
      <div class="rounded-lg border border-slate-800 bg-soc-canvas/70 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div class="space-y-2 max-w-2xl">
          <div class="flex flex-wrap items-center gap-2 text-xs font-mono text-sky-400">
            <span>Sala de Triaje en Preparación · ${totalTurnsCount} Fases Configuradas</span>
            ${
              appState.isCustomScenario
                ? '<span class="px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">Escenario Personalizado Activo</span>'
                : ''
            }
          </div>
          <h3 class="text-base font-semibold text-slate-100">
            Motor de Turnos e Injects listo para activación
          </h3>
          <p class="text-sm text-slate-300 leading-relaxed">
            Al pulsar <strong>Iniciar Ejercicio</strong>, recibirás el primer Inject en tiempo real. En cada turno deberás elegir una respuesta bajo presión sin conocer de antemano su impacto oculto en RTO real, RPO y coste financiero. Supera los <strong>80 puntos</strong> para obtener el flag CTF de GhostAcademy.
          </p>
        </div>
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          <button
            type="button"
            id="btn-triage-load-string"
            class="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-medium border border-slate-700 bg-soc-elevated hover:bg-slate-800 text-slate-200 transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <svg class="w-4 h-4 text-sky-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span>Cargar Escenario desde String</span>
          </button>

          <button
            type="button"
            id="btn-triage-start-inline"
            class="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-lg text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polygon points="6 3 20 12 6 21 6 3"></polygon>
            </svg>
            <span>Iniciar Ejercicio ahora</span>
          </button>
        </div>
      </div>
    `;
    const inlineStartBtn = document.getElementById('btn-triage-start-inline');
    if (inlineStartBtn) {
      inlineStartBtn.addEventListener('click', startExercise);
    }
    const inlineLoadBtn = document.getElementById('btn-triage-load-string');
    if (inlineLoadBtn) {
      inlineLoadBtn.addEventListener('click', () => openScenarioModal('import'));
    }
    return;
  }

  // Estado 2: Finalizado (Informe Post-Mortem)
  if (appState.phase === 'Finalizado') {
    const historyRows = appState.decisionHistory
      .map(
        (item) => `
        <tr class="border-b border-slate-800/70 last:border-b-0 text-xs">
          <td class="py-3 pr-3 font-mono text-slate-300 whitespace-nowrap">
            Turno ${item.turnNumber} · ${escapeHtml(item.phaseName)}
            ${
              item.timedOut
                ? '<span class="block text-[10px] font-mono text-red-400 mt-0.5">Timeout auto</span>'
                : ''
            }
          </td>
          <td class="py-3 px-3 text-slate-100">
            <span class="font-mono text-sky-400 mr-1.5">[${escapeHtml(item.decisionKey)}]</span>
            ${escapeHtml(item.decisionTitle)}
            <p class="text-slate-400 mt-0.5">${escapeHtml(item.outcomeSummary)}</p>
          </td>
          <td class="py-3 px-3 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">+${
            item.rtoImpactMinutes
          } min</td>
          <td class="py-3 px-3 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">+${formatRpoDuration(
            item.rpoImpactMinutes
          )}</td>
          <td class="py-3 pl-3 text-right font-mono tabular-nums text-amber-300 whitespace-nowrap">+${formatCurrencyEur(
            item.costImpactEur,
            false
          )}</td>
        </tr>
      `
      )
      .join('');

    dom.triageBody.innerHTML = `
      <div class="space-y-5">
        <div class="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-1">
            <div class="text-xs font-mono text-emerald-400">Evaluación Post-Mortem · Escenario Completado</div>
            <h3 class="text-lg font-semibold text-slate-50">
              Resumen de Decisiones e Impacto Real del Incidente
            </h3>
            <p class="text-xs text-slate-300">
              RTO Real Total: <strong class="font-mono text-slate-100">${formatDurationHHMMSS(
                appState.downtimeSeconds
              )}</strong> · RPO Real (Pérdida de datos): <strong class="font-mono text-slate-100">${formatRpoDuration(
      appState.realRpoMinutes
    )}</strong> · Coste Total: <strong class="font-mono text-slate-100">${formatCurrencyEur(
      appState.accumulatedCostEur,
      true
    )}</strong>
            </p>
          </div>
          <button
            type="button"
            id="btn-triage-restart"
            class="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[40px] rounded-lg text-xs font-semibold bg-soc-elevated hover:bg-slate-800 border border-slate-700 text-slate-100 transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <span>Reiniciar Simulación</span>
          </button>
        </div>

        <div class="overflow-x-auto rounded-lg border border-slate-800 bg-soc-canvas/60 px-4">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-slate-800 text-[11px] font-medium text-slate-400">
                <th scope="col" class="py-3 pr-3">Fase</th>
                <th scope="col" class="py-3 px-3">Decisión tomada y consecuencia</th>
                <th scope="col" class="py-3 px-3 text-right">Impacto RTO</th>
                <th scope="col" class="py-3 px-3 text-right">Impacto RPO</th>
                <th scope="col" class="py-3 pl-3 text-right">Coste directo</th>
              </tr>
            </thead>
            <tbody>${historyRows}</tbody>
          </table>
        </div>
      </div>
    `;

    const restartBtn = document.getElementById('btn-triage-restart');
    if (restartBtn) {
      restartBtn.addEventListener('click', resetExercise);
    }
    return;
  }

  // Estado 3: Turno Activo o Pausado
  const currentTurn = activeScenario.turns[appState.currentTurnIndex];
  if (!currentTurn) return;

  const isPaused = appState.phase === 'Pausado';
  const lastDecision =
    appState.decisionHistory.length > 0
      ? appState.decisionHistory[appState.decisionHistory.length - 1]
      : null;

  const lastOutcomeHtml = lastDecision
    ? `
      <div class="mt-4 rounded-lg border border-slate-800 bg-soc-canvas/70 p-4 space-y-1.5">
        <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
          <span>Resultado Turno ${lastDecision.turnNumber} (${escapeHtml(lastDecision.phaseName)})</span>
          <span class="text-slate-300 tabular-nums">+${lastDecision.rtoImpactMinutes}m RTO · +${formatRpoDuration(
        lastDecision.rpoImpactMinutes
      )} RPO · +${formatCurrencyEur(lastDecision.costImpactEur, false)}</span>
        </div>
        <p class="text-xs text-slate-300 leading-relaxed">
          ${escapeHtml(lastDecision.outcomeSummary)}
        </p>
      </div>
    `
    : '';

  const decisionButtonsHtml = currentTurn.decisions
    .map(
      (opt) => `
      <button
        type="button"
        data-decision-id="${escapeHtml(opt.id)}"
        ${isPaused ? 'disabled' : ''}
        class="decision-btn w-full text-left rounded-lg border border-slate-800 bg-soc-canvas/80 hover:bg-soc-elevated hover:border-sky-500/50 p-4 transition-colors duration-150 group disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        <div class="flex items-start gap-3.5">
          <span class="mt-0.5 h-7 w-7 rounded-md border border-slate-700 bg-soc-elevated group-hover:border-sky-500/60 group-hover:text-sky-300 font-mono text-xs font-semibold text-slate-300 flex items-center justify-center shrink-0 transition-colors duration-150">
            ${escapeHtml(opt.key)}
          </span>
          <div class="space-y-1 flex-1 min-w-0">
            <div class="text-sm font-semibold text-slate-100 group-hover:text-sky-200 transition-colors duration-150">
              ${escapeHtml(opt.title)}
            </div>
            <p class="text-xs text-slate-400 leading-relaxed">
              ${escapeHtml(opt.summary)}
            </p>
          </div>
          <span class="text-xs font-medium text-slate-500 group-hover:text-sky-400 shrink-0 self-center transition-colors duration-150 hidden sm:inline">
            Ejecutar →
          </span>
        </div>
      </button>
    `
    )
    .join('');

  dom.triageBody.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <!-- Columna izquierda: Inject / Situación Actual -->
      <div class="lg:col-span-5 flex flex-col">
        <div class="rounded-lg border border-slate-700/80 bg-soc-elevated p-5 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs font-mono text-slate-300">
              ${escapeHtml(currentTurn.inject.code)} <span aria-hidden="true">·</span> ${escapeHtml(
    currentTurn.inject.source
  )}
            </span>
            ${getInjectSeverityHtml(currentTurn.inject.severity)}
          </div>

          <div class="space-y-1.5">
            <div class="text-xs font-medium text-sky-400">${escapeHtml(currentTurn.phaseFullTitle)}</div>
            <h3 class="text-base sm:text-lg font-semibold text-slate-50 leading-snug">
              ${escapeHtml(currentTurn.inject.headline)}
            </h3>
          </div>

          <p class="text-sm text-slate-300 leading-relaxed">
            ${escapeHtml(currentTurn.inject.description)}
          </p>
        </div>

        ${lastOutcomeHtml}
      </div>

      <!-- Columna derecha: Panel de Decisiones Bajo Presión -->
      <div class="lg:col-span-7 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-slate-100">
            Decisiones Bajo Presión
          </h3>
          <span class="text-xs text-slate-400">
            ${
              isPaused
                ? 'Simulación pausada: reanuda el ejercicio para tomar una decisión.'
                : 'Selecciona una acción del comité (impacto oculto hasta confirmar).'
            }
          </span>
        </div>

        <div class="space-y-2.5">
          ${decisionButtonsHtml}
        </div>
      </div>
    </div>
  `;
}

function getStatusBadgeHtml(status) {
  if (status === 'Operativo') {
    return `<span class="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 whitespace-nowrap">
      <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
      <span>Operativo</span>
    </span>`;
  }
  if (status === 'Degradado') {
    return `<span class="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 whitespace-nowrap">
      <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
      <span>Degradado</span>
    </span>`;
  }
  return `<span class="inline-flex items-center gap-1.5 text-xs font-medium text-red-400 whitespace-nowrap">
    <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
    <span>Caído</span>
  </span>`;
}

function getBiaRtoIndicator(srv) {
  const rtoSeconds = srv.rtoMinutes * 60;
  const ratio = rtoSeconds > 0 ? srv.downtimeSeconds / rtoSeconds : 0;
  const actualMin = Math.floor(srv.downtimeSeconds / 60);

  if (ratio >= 1) {
    return {
      textClass: 'text-red-400 font-semibold',
      barClass: 'bg-red-500 animate-pulse',
      barWidth: 100,
      statusText: `Excedido (${actualMin}m)`,
    };
  }
  if (ratio >= 0.6) {
    return {
      textClass: 'text-amber-400 font-medium',
      barClass: 'bg-amber-500',
      barWidth: Math.min(100, Math.round(ratio * 100)),
      statusText: `En riesgo (${actualMin}m)`,
    };
  }
  return {
    textClass: 'text-emerald-400',
    barClass: 'bg-emerald-500',
    barWidth: Math.max(srv.downtimeSeconds > 0 ? 8 : 0, Math.round(ratio * 100)),
    statusText: srv.downtimeSeconds > 0 ? `En objetivo (${actualMin}m)` : 'En objetivo',
  };
}

function getBiaRpoIndicator(srv) {
  const realRpo = appState.phase === 'Preparación' ? 0 : appState.realRpoMinutes;

  if (srv.rpoMinutes === 0) {
    if (realRpo > 0) {
      return {
        textClass: 'text-red-400 font-semibold',
        barClass: 'bg-red-500',
        barWidth: 100,
        statusText: `Excedido (${formatRpoDuration(realRpo)})`,
      };
    }
    return {
      textClass: 'text-emerald-400',
      barClass: 'bg-emerald-500',
      barWidth: 0,
      statusText: 'En objetivo',
    };
  }

  const ratio = realRpo / srv.rpoMinutes;
  if (realRpo > srv.rpoMinutes) {
    return {
      textClass: 'text-red-400 font-semibold',
      barClass: 'bg-red-500',
      barWidth: 100,
      statusText: `Excedido (${formatRpoDuration(realRpo)})`,
    };
  }
  if (ratio >= 0.6) {
    return {
      textClass: 'text-amber-400 font-medium',
      barClass: 'bg-amber-500',
      barWidth: Math.min(100, Math.round(ratio * 100)),
      statusText: `Al límite (${formatRpoDuration(realRpo)})`,
    };
  }
  return {
    textClass: 'text-emerald-400',
    barClass: 'bg-emerald-500',
    barWidth: Math.round(ratio * 100),
    statusText: realRpo > 0 ? `En objetivo (${formatRpoDuration(realRpo)})` : 'En objetivo',
  };
}

function renderBiaPanel() {
  dom.biaFilterButtons.forEach((btn) => {
    const active = btn.dataset.biaFilter === appState.biaFilter;
    btn.className = `bia-filter-btn px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 ${
      active ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-100'
    }`;
  });

  const filteredServices = appState.services.filter((srv) => {
    if (appState.biaFilter === 'CRITICAL') return srv.criticality === 'Crítico';
    if (appState.biaFilter === 'IMPACTED') return srv.status !== 'Operativo';
    return true;
  });

  if (filteredServices.length === 0) {
    dom.biaTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="py-10 px-5 text-center text-xs text-slate-400">
          No hay servicios que coincidan con el filtro seleccionado.
        </td>
      </tr>
    `;
  } else {
    dom.biaTableBody.innerHTML = filteredServices
      .map((srv) => {
        const isSelected = srv.id === appState.selectedServiceId;
        const rtoInd = getBiaRtoIndicator(srv);
        const rpoInd = getBiaRpoIndicator(srv);
        const isRtoBreached = appState.rtoBreachedServiceIds.has(srv.id);

        return `
          <tr
            data-service-id="${escapeHtml(srv.id)}"
            tabindex="0"
            role="button"
            aria-pressed="${isSelected ? 'true' : 'false'}"
            class="bia-row cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:bg-slate-800/70 ${
              isRtoBreached
                ? 'bg-red-950/20 hover:bg-red-950/35'
                : isSelected
                ? 'bg-slate-800/50'
                : 'hover:bg-slate-800/30'
            }"
          >
            <td class="py-3.5 pl-5 pr-3 align-top">
              <div class="font-medium text-slate-100 flex items-center gap-2">
                <span>${escapeHtml(srv.name)}</span>
                ${
                  isRtoBreached
                    ? '<span class="text-[10px] font-mono font-semibold text-red-400 animate-pulse">SLA ROTO</span>'
                    : ''
                }
              </div>
              <div class="text-xs text-slate-400 mt-0.5">
                ${escapeHtml(srv.category)} <span aria-hidden="true">·</span> Nivel ${escapeHtml(srv.criticality)}
              </div>
            </td>
            <td class="py-3.5 px-3 text-right font-mono tabular-nums align-top">
              <div class="text-slate-200">${escapeHtml(srv.rtoLabel)}</div>
              <div class="mt-1 h-1.5 w-20 ml-auto rounded-full bg-slate-800 overflow-hidden">
                <div class="h-full rounded-full ${rtoInd.barClass}" style="width: ${rtoInd.barWidth}%;"></div>
              </div>
              <span class="block text-[11px] mt-1 ${rtoInd.textClass}">${escapeHtml(rtoInd.statusText)}</span>
            </td>
            <td class="py-3.5 px-3 text-right font-mono tabular-nums align-top">
              <div class="text-slate-200">${escapeHtml(srv.rpoLabel)}</div>
              <div class="mt-1 h-1.5 w-20 ml-auto rounded-full bg-slate-800 overflow-hidden">
                <div class="h-full rounded-full ${rpoInd.barClass}" style="width: ${rpoInd.barWidth}%;"></div>
              </div>
              <span class="block text-[11px] mt-1 ${rpoInd.textClass}">${escapeHtml(rpoInd.statusText)}</span>
            </td>
            <td class="py-3.5 px-3 text-right font-mono tabular-nums text-slate-300 align-top">
              ${formatCurrencyEur(srv.costPerMinuteEur, false)}/min
            </td>
            <td class="py-3.5 pl-3 pr-5 text-right align-top">
              ${getStatusBadgeHtml(srv.status)}
            </td>
          </tr>
        `;
      })
      .join('');
  }

  renderSelectedServiceDetail();
}

function renderSelectedServiceDetail() {
  const selected =
    appState.services.find((srv) => srv.id === appState.selectedServiceId) || appState.services[0];

  if (!selected) {
    dom.biaServiceDetail.innerHTML = '';
    return;
  }

  dom.biaServiceDetail.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div class="space-y-1">
        <div class="text-xs font-medium text-slate-400">
          Ficha técnica BIA · <span class="text-slate-200">${escapeHtml(selected.name)}</span>
        </div>
        <p class="text-xs text-slate-300 leading-relaxed">
          <strong class="font-semibold text-slate-200">Estrategia de recuperación:</strong>
          ${escapeHtml(selected.recoveryStrategy)}
        </p>
      </div>
      <div class="text-xs text-slate-400 sm:text-right shrink-0 space-y-1">
        <div>Responsable: <span class="text-slate-200">${escapeHtml(selected.owner)}</span></div>
        <div>Dependencias: <span class="text-slate-300">${escapeHtml(selected.dependencies.join(', '))}</span></div>
      </div>
    </div>
  `;
}

function getLogLevelStyle(level) {
  if (level === 'CRITICAL') {
    return { tagClass: 'text-red-400 font-semibold', label: 'CRÍTICO' };
  }
  if (level === 'WARN') {
    return { tagClass: 'text-amber-400 font-semibold', label: 'ALERTA' };
  }
  return { tagClass: 'text-sky-400 font-medium', label: 'INFO' };
}

function resolveLogTurnNumber(entry) {
  if (typeof entry.turnNumber === 'number' && Number.isFinite(entry.turnNumber)) {
    return entry.turnNumber;
  }
  const srcMatch = String(entry.source || '').match(/T(\d+)/i);
  if (srcMatch) return Number(srcMatch[1]);
  const msgMatch = String(entry.message || '').match(/Turno\s+(\d+)/i);
  if (msgMatch) return Number(msgMatch[1]);
  return 0;
}

function renderEventLogChart() {
  if (!dom.eventLogD3Chart) return;
  const d3 = /** @type {any} */ (window).d3;

  const severities = [
    { key: 'CRITICAL', label: 'Crítico', color: '#ef4444' },
    { key: 'WARN', label: 'Alerta', color: '#f59e0b' },
    { key: 'INFO', label: 'Info', color: '#38bdf8' },
  ];

  const buckets = [
    { turnNumber: 0, key: 'Prep', CRITICAL: 0, WARN: 0, INFO: 0 },
    ...activeScenario.turns.map((t) => ({
      turnNumber: t.turnNumber,
      key: `T${t.turnNumber}`,
      CRITICAL: 0,
      WARN: 0,
      INFO: 0,
    })),
  ];

  const bucketByTurn = new Map(buckets.map((b) => [b.turnNumber, b]));
  appState.logs.forEach((entry) => {
    const tNum = resolveLogTurnNumber(entry);
    const bucket = bucketByTurn.get(tNum) || buckets[buckets.length - 1];
    if (!bucket) return;
    if (entry.level === 'CRITICAL' || entry.level === 'WARN' || entry.level === 'INFO') {
      bucket[entry.level] += 1;
    } else {
      bucket.INFO += 1;
    }
  });

  if (!d3) {
    dom.eventLogD3Chart.innerHTML =
      '<div class="h-full flex items-center justify-center text-xs font-mono text-slate-500">Visualización D3 no disponible sin conexión.</div>';
    return;
  }

  const width = 460;
  const height = 146;
  const margin = { top: 10, right: 8, bottom: 24, left: 26 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const container = d3.select(dom.eventLogD3Chart);
  container.selectAll('*').remove();

  const svg = container
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('class', 'w-full h-full overflow-visible');

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x0 = d3
    .scaleBand()
    .domain(buckets.map((b) => b.key))
    .range([0, innerWidth])
    .paddingInner(0.24)
    .paddingOuter(0.08);

  const x1 = d3
    .scaleBand()
    .domain(severities.map((s) => s.key))
    .range([0, x0.bandwidth()])
    .padding(0.14);

  const maxCount =
    d3.max(buckets, (b) => Math.max(b.CRITICAL, b.WARN, b.INFO)) || 0;
  const yDomainMax = Math.max(3, maxCount);

  const y = d3.scaleLinear().domain([0, yDomainMax]).nice().range([innerHeight, 0]);
  const integerTicks = y.ticks(Math.min(4, yDomainMax)).filter((t) => Number.isInteger(t));

  // Líneas de cuadrícula horizontales
  g.append('g')
    .attr('class', 'grid-lines')
    .selectAll('line')
    .data(integerTicks)
    .join('line')
    .attr('x1', 0)
    .attr('x2', innerWidth)
    .attr('y1', (d) => y(d))
    .attr('y2', (d) => y(d))
    .attr('stroke', '#1e293b')
    .attr('stroke-dasharray', '2,2');

  // Eje Y
  const yAxis = g
    .append('g')
    .call(
      d3
        .axisLeft(y)
        .tickValues(integerTicks)
        .tickFormat(d3.format('d'))
        .tickSize(0)
        .tickPadding(6)
    );
  yAxis.select('.domain').remove();
  yAxis
    .selectAll('text')
    .attr('fill', '#64748b')
    .attr('font-family', '"JetBrains Mono", monospace')
    .attr('font-size', '10px');

  // Eje X (turnos)
  const xAxis = g
    .append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x0).tickSizeOuter(0).tickSizeInner(0).tickPadding(7));
  xAxis.select('.domain').attr('stroke', '#1e293b');
  xAxis
    .selectAll('text')
    .attr('fill', (d) => {
      const currentKey =
        appState.phase === 'Preparación'
          ? 'Prep'
          : `T${Math.min(activeScenario.turns.length, appState.currentTurnIndex + 1)}`;
      return d === currentKey && appState.phase !== 'Finalizado' ? '#38bdf8' : '#94a3b8';
    })
    .attr('font-family', '"JetBrains Mono", monospace')
    .attr('font-size', '10px')
    .attr('font-weight', '500');

  // Grupos de barras por turno y severidad
  const turnGroups = g
    .selectAll('g.turn-group')
    .data(buckets)
    .join('g')
    .attr('class', 'turn-group')
    .attr('transform', (d) => `translate(${x0(d.key)},0)`);

  const tooltip = dom.eventChartTooltip;

  turnGroups
    .selectAll('rect')
    .data((bucket) =>
      severities.map((sev) => ({
        turnKey: bucket.key,
        severity: sev.key,
        label: sev.label,
        color: sev.color,
        count: bucket[sev.key],
      }))
    )
    .join('rect')
    .attr('x', (d) => x1(d.severity))
    .attr('y', (d) => (d.count > 0 ? Math.min(innerHeight - 2, y(d.count)) : innerHeight))
    .attr('width', Math.max(4, x1.bandwidth()))
    .attr('height', (d) => (d.count > 0 ? Math.max(2, innerHeight - y(d.count)) : 0))
    .attr('rx', 2)
    .attr('ry', 2)
    .attr('fill', (d) => d.color)
    .attr('opacity', (d) =>
      appState.logFilter === 'ALL' || appState.logFilter === d.severity ? 0.92 : 0.22
    )
    .style('cursor', 'pointer')
    .on('mouseenter', function (_event, d) {
      d3.select(this).attr('opacity', 1);
      if (tooltip) {
        tooltip.textContent = `${d.turnKey} · ${d.label}: ${d.count} ${
          d.count === 1 ? 'evento' : 'eventos'
        }`;
        tooltip.classList.remove('hidden');
      }
    })
    .on('mousemove', (event) => {
      if (!tooltip || !dom.eventLogD3Chart) return;
      const bounds = dom.eventLogD3Chart.getBoundingClientRect();
      const relX = Math.max(8, Math.min(bounds.width - 150, event.clientX - bounds.left + 10));
      const relY = Math.max(0, event.clientY - bounds.top - 30);
      tooltip.style.left = `${relX}px`;
      tooltip.style.top = `${relY}px`;
    })
    .on('mouseleave', function (_event, d) {
      d3.select(this).attr(
        'opacity',
        appState.logFilter === 'ALL' || appState.logFilter === d.severity ? 0.92 : 0.22
      );
      if (tooltip) {
        tooltip.classList.add('hidden');
      }
    })
    .on('click', (_event, d) => {
      appState.logFilter = appState.logFilter === d.severity ? 'ALL' : d.severity;
      renderEventLog(false);
    });
}

function renderEventLog(autoScroll = false) {
  dom.logFilterButtons.forEach((btn) => {
    const active = btn.dataset.logFilter === appState.logFilter;
    btn.className = `log-filter-btn px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 ${
      active ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-100'
    }`;
  });

  renderEventLogChart();

  const filteredLogs = appState.logs.filter((entry) => {
    if (appState.logFilter === 'ALL') return true;
    return entry.level === appState.logFilter;
  });

  dom.logCountLabel.textContent = `${filteredLogs.length} ${filteredLogs.length === 1 ? 'entrada' : 'entradas'}`;

  if (filteredLogs.length === 0) {
    dom.eventLogConsole.innerHTML =
      '<div class="text-slate-500 py-8 text-center">No hay eventos registrados para el filtro seleccionado.</div>';
    return;
  }

  dom.eventLogConsole.innerHTML = filteredLogs
    .map((entry) => {
      const style = getLogLevelStyle(entry.level);
      const animClass = entry.animate ? 'log-entry-animate' : '';
      entry.animate = false;
      return `
        <div class="${animClass} border-b border-slate-800/50 pb-2 last:border-b-0">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400 tabular-nums">
            <span class="text-slate-500">[${escapeHtml(entry.timestamp)}]</span>
            <span class="${style.tagClass}">[${style.label}]</span>
            <span class="text-slate-300 font-medium">${escapeHtml(entry.source)}</span>
            <span class="text-slate-600">·</span>
            <span class="text-slate-500">T+${escapeHtml(entry.simTime)}</span>
          </div>
          <p class="text-slate-200 mt-1">${escapeHtml(entry.message)}</p>
        </div>
      `;
    })
    .join('');

  if (autoScroll) {
    dom.eventLogConsole.scrollTop = dom.eventLogConsole.scrollHeight;
  }
}

function exportLogsToTxt() {
  const header = [
    `DRP TABLETOP — REGISTRO DE EVENTOS SOC`,
    `Escenario: ${activeScenario.title} (${activeScenario.code})`,
    `Organización: ${activeScenario.organization}`,
    `Estado: ${appState.phase}`,
    `RTO real acumulado: ${formatDurationHHMMSS(appState.downtimeSeconds)}`,
    `RPO real (pérdida de datos): ${formatRpoDuration(appState.realRpoMinutes)}`,
    `Coste acumulado: ${formatCurrencyEur(appState.accumulatedCostEur, true)}`,
    `------------------------------------------------------------------------`,
    '',
  ].join('\n');

  const lines = appState.logs
    .map(
      (entry) =>
        `[${entry.timestamp}] [T+${entry.simTime}] [${entry.level}] [${entry.source}] ${entry.message}`
    )
    .join('\n');

  const blob = new Blob([header + lines], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `drp-event-log-${activeScenario.code.toLowerCase()}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function generateLessonsLearned() {
  const lessons = [];
  const seen = new Set();

  function addLesson(priority, title, text) {
    if (seen.has(title)) return;
    seen.add(title);
    lessons.push({ priority, title, text });
  }

  // 1. Lecciones derivadas directamente de decisiones subóptimas, críticas o timeouts
  appState.decisionHistory.forEach((item) => {
    if (item.evaluation !== 'optimal' && item.lessonRecommendation) {
      const priority = item.evaluation === 'critical' || item.timedOut ? 'Alta' : 'Media';
      addLesson(
        priority,
        `Turno ${item.turnNumber} · ${item.phaseName}`,
        item.lessonRecommendation
      );
    }
  });

  // 2. Lecciones por incumplimiento de RTO o RPO del BIA
  const breachedServices = appState.services.filter((srv) =>
    appState.rtoBreachedServiceIds.has(srv.id)
  );
  if (breachedServices.length > 0) {
    addLesson(
      'Alta',
      'Cumplimiento de SLA / RTO en servicios críticos',
      `Se superó el RTO teórico en ${breachedServices
        .map((s) => s.name)
        .join(', ')}. Automatiza procedimientos de conmutación (failover) y valida periódicamente los tiempos reales de recuperación mediante pruebas técnicas.`
    );
  }

  const rpoExceededCount = appState.services.filter(
    (srv) => appState.realRpoMinutes > srv.rpoMinutes
  ).length;
  if (rpoExceededCount > 0) {
    addLesson(
      'Alta',
      'Protección frente a pérdida de datos (RPO)',
      `La pérdida acumulada de datos (${formatRpoDuration(
        appState.realRpoMinutes
      )}) superó el RPO teórico en ${rpoExceededCount} servicio(s). Refuerza la replicación síncrona y las copias inmutables (WORM) aisladas de red.`
    );
  }

  // 3. Si el usuario tomó decisiones óptimas en todos los turnos
  if (lessons.length === 0) {
    addLesson(
      'Mejora continua',
      'Respuesta alineada con el Plan de Continuidad (DRP)',
      'El comité ejecutó con precisión el aislamiento selectivo, el failover transaccional y la recuperación escalonada desde copias inmutables. Programa simulacros periódicos para mantener estos tiempos.'
    );
    addLesson(
      'Mejora continua',
      'Automatización de runbooks SOC y BIA',
      'Documenta las decisiones exitosas de este ejercicio en playbooks automatizados (SOAR) para reducir aún más el tiempo de reacción inicial.'
    );
  }

  return lessons;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getCorporateRank(score) {
  if (score >= 90) {
    return {
      title: 'CISO Legendario',
      subtitle: 'Dirección táctica impecable. Continuidad blindada bajo presión extrema.',
      badgeClass: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
      ringColor: '#10b981',
    };
  }
  if (score > 80) {
    return {
      title: 'Arquitecto de Resiliencia',
      subtitle: 'Superaste el umbral de excelencia operativa de GhostAcademy.',
      badgeClass: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
      ringColor: '#0ea5e9',
    };
  }
  if (score >= 65) {
    return {
      title: 'Analista SOC Senior',
      subtitle: 'Contención funcional con margen de optimización en SLAs y costes.',
      badgeClass: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
      ringColor: '#f59e0b',
    };
  }
  if (score >= 45) {
    return {
      title: 'Administrador Novato',
      subtitle: 'Decisiones inconsistentes que comprometieron objetivos clave del BIA.',
      badgeClass: 'border-amber-500/50 bg-amber-500/15 text-amber-300',
      ringColor: '#f59e0b',
    };
  }
  return {
    title: 'Despedido',
    subtitle: 'Incumplimiento grave de RTO/RPO y pérdidas críticas de negocio.',
    badgeClass: 'border-red-500/50 bg-red-500/15 text-red-300',
    ringColor: '#ef4444',
  };
}

function calculateFinalScore() {
  const totalServices = Math.max(1, appState.services.length);
  const servicesWithinRto = appState.services.filter(
    (srv) => srv.downtimeSeconds <= srv.rtoMinutes * 60
  ).length;
  const servicesWithinRpo = appState.services.filter(
    (srv) => appState.realRpoMinutes <= srv.rpoMinutes
  ).length;

  const turns = activeScenario.turns || [];
  const bestRtoMinutes = turns.reduce(
    (acc, t) => acc + Math.min(...t.decisions.map((d) => d.hiddenImpact.rtoImpactMinutes)),
    0
  );
  const worstRtoMinutes =
    turns.reduce(
      (acc, t) => acc + Math.max(...t.decisions.map((d) => d.hiddenImpact.rtoImpactMinutes)),
      0
    ) +
    turns.length * TIMEOUT_PENALTY.rtoMinutes;

  const bestRpoMinutes = turns.reduce(
    (acc, t) => acc + Math.min(...t.decisions.map((d) => d.hiddenImpact.rpoImpactMinutes)),
    0
  );
  const maxBiaRpo = Math.max(...appState.services.map((s) => s.rpoMinutes), 30);
  const rpoEffectiveMax = Math.max(bestRpoMinutes + 60, maxBiaRpo * 3);

  const totalMaxBurnPerMin = appState.services.reduce((acc, s) => acc + s.costPerMinuteEur, 0);
  const bestDecisionCostSum = turns.reduce(
    (acc, t) => acc + Math.min(...t.decisions.map((d) => d.hiddenImpact.costImpactEur)),
    0
  );
  const worstDecisionCostSum = turns.reduce(
    (acc, t) => acc + Math.max(...t.decisions.map((d) => d.hiddenImpact.costImpactEur)),
    0
  );
  const worstDecisionRtoSum = turns.reduce(
    (acc, t) => acc + Math.max(...t.decisions.map((d) => d.hiddenImpact.rtoImpactMinutes)),
    0
  );

  const bestCostBenchmarkEur = Math.round(
    bestDecisionCostSum + bestRtoMinutes * totalMaxBurnPerMin * 0.25
  );
  const worstCostBenchmarkEur = Math.round(
    worstDecisionCostSum +
      turns.length * TIMEOUT_PENALTY.costEur +
      worstDecisionRtoSum * totalMaxBurnPerMin * 0.45
  );

  const actualDowntimeMinutes = appState.downtimeSeconds / 60;
  const rtoCompliancePts = (servicesWithinRto / totalServices) * 20;
  const rtoEfficiencyRatio = clampNumber(
    (worstRtoMinutes - actualDowntimeMinutes) / Math.max(1, worstRtoMinutes - bestRtoMinutes),
    0,
    1
  );
  const rtoScore = Math.round(rtoCompliancePts + rtoEfficiencyRatio * 15);

  const rpoCompliancePts = (servicesWithinRpo / totalServices) * 15;
  const rpoEfficiencyRatio = clampNumber(
    (rpoEffectiveMax - appState.realRpoMinutes) / Math.max(1, rpoEffectiveMax - bestRpoMinutes),
    0,
    1
  );
  const rpoScore = Math.round(rpoCompliancePts + rpoEfficiencyRatio * 15);

  const moneySavedEur = Math.max(
    0,
    Math.round(worstCostBenchmarkEur - appState.accumulatedCostEur)
  );
  const costEfficiencyRatio = clampNumber(
    (worstCostBenchmarkEur - appState.accumulatedCostEur) /
      Math.max(1, worstCostBenchmarkEur - bestCostBenchmarkEur),
    0,
    1
  );
  const costScore = Math.round(costEfficiencyRatio * 35);

  const totalScore = clampNumber(rtoScore + rpoScore + costScore, 0, 100);
  const rank = getCorporateRank(totalScore);

  return {
    totalScore,
    rtoScore,
    rpoScore,
    costScore,
    moneySavedEur,
    worstCostBenchmarkEur,
    rank,
  };
}

function fnv1aHashHex(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/**
 * La bandera CTF solo vale en un escenario oficial sin modificar. Antes bastaba importar un escenario
 * con el mismo código y decisiones sin impacto para obtener una bandera de 100 puntos indistinguible.
 * Se compara el escenario activo con los integrados (tal cual y normalizados, como quedan al importar
 * o al restaurar la sesión).
 */
let officialScenarioSnapshots = null;
function isOfficialScenario(scenario) {
  if (!officialScenarioSnapshots) {
    officialScenarioSnapshots = new Set();
    for (const builtIn of BUILT_IN_SCENARIOS) {
      let current = deepClone(builtIn);
      officialScenarioSnapshots.add(JSON.stringify(current));
      for (let round = 0; round < 2; round += 1) {
        try {
          current = validateAndNormalizeScenario(deepClone(current));
          officialScenarioSnapshots.add(JSON.stringify(current));
        } catch (_err) {
          break;
        }
      }
    }
  }
  return officialScenarioSnapshots.has(JSON.stringify(scenario));
}

function generateCtfFlag(scoreResult) {
  if (!isOfficialScenario(activeScenario)) {
    return { unlocked: false, flag: null, pointsMissing: 0, customScenario: true };
  }
  if (scoreResult.totalScore <= 80) {
    return {
      unlocked: false,
      flag: null,
      pointsMissing: 81 - scoreResult.totalScore,
    };
  }

  const optimalCount = appState.decisionHistory.filter((d) => d.evaluation === 'optimal').length;
  const seed = `GhostAcademy:${activeScenario.code}:${scoreResult.totalScore}:${optimalCount}:${Math.round(
    appState.downtimeSeconds
  )}:${appState.realRpoMinutes}:${Math.round(appState.accumulatedCostEur)}`;
  const checksum = fnv1aHashHex(seed);

  return {
    unlocked: true,
    flag: `CTF{DRP_M4st3r_${scoreResult.totalScore}PTS_${checksum}}`,
    pointsMissing: 0,
  };
}

function renderAfterActionReport() {
  if (!dom.aarScreen) return;

  const totalServices = appState.services.length;
  const servicesWithinRto = appState.services.filter(
    (srv) => srv.downtimeSeconds <= srv.rtoMinutes * 60
  ).length;
  const servicesWithinRpo = appState.services.filter(
    (srv) => appState.realRpoMinutes <= srv.rpoMinutes
  ).length;

  const optimalCount = appState.decisionHistory.filter((d) => d.evaluation === 'optimal').length;
  const timeoutCount = appState.decisionHistory.filter((d) => d.timedOut).length;
  const totalTurns = appState.decisionHistory.length;

  const scoreResult = calculateFinalScore();
  const ctfResult = generateCtfFlag(scoreResult);

  const downtimeOperationalCost = Math.max(
    0,
    appState.accumulatedCostEur - appState.decisionCostEur
  );
  const totalCost = Math.max(1, appState.accumulatedCostEur);
  const operationalCostPct = Math.round((downtimeOperationalCost / totalCost) * 100);
  const decisionCostPct = Math.max(0, 100 - operationalCostPct);

  let verdictTitle = 'Resiliencia Óptima';
  let verdictTone = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  let verdictSummary =
    'El comité protegió la continuidad de negocio manteniendo la mayoría de servicios dentro de sus umbrales BIA.';

  if (servicesWithinRto <= 2 || optimalCount <= 1 || timeoutCount >= 2) {
    verdictTitle = 'Exposición Crítica de Negocio';
    verdictTone = 'text-red-400 border-red-500/30 bg-red-500/10';
    verdictSummary =
      'Múltiples servicios críticos superaron su RTO/RPO teórico, generando impacto financiero severo y escalados de dirección.';
  } else if (servicesWithinRto < totalServices || optimalCount < totalTurns) {
    verdictTitle = 'Impacto Moderado · Mejorable';
    verdictTone = 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    verdictSummary =
      'Se logró contener el incidente, aunque ciertas decisiones o demoras comprometieron objetivos específicos del BIA.';
  }

  const mostDemandingRtoMinutes = Math.min(...appState.services.map((s) => s.rtoMinutes));
  const mostDemandingRpoMinutes = Math.min(...appState.services.map((s) => s.rpoMinutes));
  const globalDowntimeMinutes = Math.round(appState.downtimeSeconds / 60);

  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference * (1 - scoreResult.totalScore / 100);

  // Filas comparativas BIA: Teórico vs. Real (RTO y RPO con gráficos de barras CSS)
  const biaComparisonRowsHtml = appState.services
    .map((srv) => {
      const realRtoMin = Math.round(srv.downtimeSeconds / 60);
      const rtoMet = srv.downtimeSeconds <= srv.rtoMinutes * 60;
      const rpoMet = appState.realRpoMinutes <= srv.rpoMinutes;

      const rtoScaleMax = Math.max(srv.rtoMinutes, realRtoMin, 1);
      const rtoTheoWidth = Math.round((srv.rtoMinutes / rtoScaleMax) * 100);
      const rtoRealWidth = Math.round((realRtoMin / rtoScaleMax) * 100);

      const rpoScaleMax = Math.max(srv.rpoMinutes, appState.realRpoMinutes, 1);
      const rpoTheoWidth = srv.rpoMinutes === 0 ? 4 : Math.round((srv.rpoMinutes / rpoScaleMax) * 100);
      const rpoRealWidth =
        appState.realRpoMinutes === 0
          ? 0
          : Math.max(4, Math.round((appState.realRpoMinutes / rpoScaleMax) * 100));

      return `
        <tr class="border-b border-slate-800/80 last:border-b-0 text-xs">
          <td class="py-4 pl-4 pr-3 align-top">
            <div class="font-semibold text-slate-100">${escapeHtml(srv.name)}</div>
            <div class="text-slate-400 mt-0.5">${escapeHtml(srv.category)} · Nivel ${escapeHtml(
        srv.criticality
      )}</div>
          </td>

          <!-- Comparativa RTO -->
          <td class="py-4 px-3 align-top min-w-[200px]">
            <div class="flex items-center justify-between font-mono tabular-nums text-[11px] mb-1.5">
              <span class="text-slate-400">Teórico: ${escapeHtml(srv.rtoLabel)}</span>
              <span class="${rtoMet ? 'text-emerald-400' : 'text-red-400'} font-semibold">
                Real: ${formatDurationHHMMSS(srv.downtimeSeconds)}
              </span>
            </div>
            <div class="space-y-1">
              <div class="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden" title="RTO Teórico">
                <div class="h-full rounded-full bg-slate-500" style="width: ${rtoTheoWidth}%;"></div>
              </div>
              <div class="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden" title="RTO Real">
                <div class="h-full rounded-full ${
                  rtoMet ? 'bg-emerald-500' : 'bg-red-500'
                }" style="width: ${rtoRealWidth}%;"></div>
              </div>
            </div>
          </td>

          <!-- Comparativa RPO -->
          <td class="py-4 px-3 align-top min-w-[200px]">
            <div class="flex items-center justify-between font-mono tabular-nums text-[11px] mb-1.5">
              <span class="text-slate-400">Teórico: ${escapeHtml(srv.rpoLabel)}</span>
              <span class="${rpoMet ? 'text-emerald-400' : 'text-red-400'} font-semibold">
                Real: ${formatRpoDuration(appState.realRpoMinutes)}
              </span>
            </div>
            <div class="space-y-1">
              <div class="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden" title="RPO Teórico">
                <div class="h-full rounded-full bg-slate-500" style="width: ${rpoTheoWidth}%;"></div>
              </div>
              <div class="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden" title="RPO Real">
                <div class="h-full rounded-full ${
                  rpoMet ? 'bg-emerald-500' : 'bg-red-500'
                }" style="width: ${rpoRealWidth}%;"></div>
              </div>
            </div>
          </td>

          <!-- Cumplimiento BIA -->
          <td class="py-4 pl-3 pr-4 text-right align-top whitespace-nowrap">
            <div class="font-mono text-[11px] ${
              rtoMet && rpoMet
                ? 'text-emerald-400'
                : !rtoMet && !rpoMet
                ? 'text-red-400'
                : 'text-amber-400'
            } font-semibold">
              ${
                rtoMet && rpoMet
                  ? '✓ SLA Cumplido'
                  : !rtoMet && !rpoMet
                  ? '✕ RTO y RPO Excedidos'
                  : !rtoMet
                  ? '✕ RTO Excedido'
                  : '✕ RPO Excedido'
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  // Desglose cronológico de decisiones
  const decisionCardsHtml = appState.decisionHistory
    .map((item) => {
      let evalLabel = 'Acierto operativo';
      let evalClass = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
      if (item.evaluation === 'suboptimal') {
        evalLabel = 'Decisión subóptima';
        evalClass = 'text-amber-400 border-amber-500/30 bg-amber-500/10';
      } else if (item.evaluation === 'critical') {
        evalLabel = item.timedOut ? 'Timeout automático (Crítico)' : 'Error crítico';
        evalClass = 'text-red-400 border-red-500/30 bg-red-500/10';
      }

      return `
        <article class="aar-card rounded-lg border border-slate-800 bg-soc-canvas/60 p-4 sm:p-5 space-y-3">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="text-xs font-mono text-slate-400">
                Turno ${item.turnNumber} · ${escapeHtml(item.phaseName)} · ${escapeHtml(
        item.injectCode
      )}
              </div>
              <h4 class="text-sm font-semibold text-slate-100 mt-1">
                <span class="font-mono text-sky-400 mr-1.5">[Opción ${escapeHtml(
                  item.decisionKey
                )}]</span>
                ${escapeHtml(item.decisionTitle)}
              </h4>
            </div>

            <span class="text-[11px] font-mono font-semibold px-2.5 py-1 rounded border ${evalClass} whitespace-nowrap shrink-0">
              ${escapeHtml(evalLabel)}
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div class="aar-subtle-surface rounded-md border border-slate-800/80 bg-soc-surface/70 p-3">
              <div class="font-semibold text-emerald-400 mb-1">Qué se hizo bien</div>
              <p class="text-slate-300 leading-relaxed">${escapeHtml(item.whatWentWell)}</p>
            </div>
            <div class="aar-subtle-surface rounded-md border border-slate-800/80 bg-soc-surface/70 p-3">
              <div class="font-semibold ${
                item.evaluation === 'optimal' ? 'text-slate-300' : 'text-red-400'
              } mb-1">Qué falló o riesgo asumido</div>
              <p class="text-slate-300 leading-relaxed">${escapeHtml(item.whatWentWrong)}</p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-400 tabular-nums pt-1 border-t border-slate-800/60">
            <span>Impacto RTO: <strong class="text-slate-200">+${item.rtoImpactMinutes} min</strong></span>
            <span>Impacto RPO: <strong class="text-slate-200">+${formatRpoDuration(
              item.rpoImpactMinutes
            )}</strong></span>
            <span>Coste directo: <strong class="text-amber-300">+${formatCurrencyEur(
              item.costImpactEur,
              false
            )}</strong></span>
            <span>Estrés: <strong class="text-slate-200">${
              item.stressDelta >= 0 ? `+${item.stressDelta}` : item.stressDelta
            }%</strong></span>
          </div>
        </article>
      `;
    })
    .join('');

  // Lecciones aprendidas automatizadas
  const lessons = generateLessonsLearned();
  const lessonsHtml = lessons
    .map((lesson, idx) => {
      const toneClass =
        lesson.priority === 'Alta'
          ? 'text-red-400'
          : lesson.priority === 'Media'
          ? 'text-amber-400'
          : 'text-emerald-400';

      return `
        <li class="aar-card rounded-lg border border-slate-800 bg-soc-canvas/60 p-4 flex items-start gap-3.5">
          <span class="font-mono text-xs font-semibold text-slate-400 mt-0.5 shrink-0">0${idx + 1}.</span>
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-slate-100">${escapeHtml(lesson.title)}</span>
              <span class="text-xs font-mono ${toneClass}">Prioridad ${escapeHtml(
        lesson.priority
      )}</span>
            </div>
            <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">${escapeHtml(
              lesson.text
            )}</p>
          </div>
        </li>
      `;
    })
    .join('');

  const ctfPanelHtml = ctfResult.unlocked
    ? `
      <section class="rounded-xl border border-emerald-500/50 bg-emerald-950/20 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 text-xs font-mono font-semibold text-emerald-400">
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
              <line x1="4" y1="22" x2="4" y2="15"></line>
            </svg>
            <span>CTF MODE · FLAG DESBLOQUEADO (&gt; 80 PUNTOS)</span>
          </div>
          <h2 class="text-base sm:text-lg font-semibold text-slate-50">
            Token de Verificación GhostAcademy
          </h2>
          <p class="text-xs sm:text-sm text-slate-300">
            Puntuación validada (${scoreResult.totalScore}/100). Introduce este flag en la plataforma GhostAcademy para acreditar la resolución del incidente.
          </p>
        </div>

        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          <code
            id="ctf-flag-value"
            class="ctf-token-box px-4 py-2.5 rounded-lg border border-emerald-500/60 bg-soc-terminal font-mono text-sm font-semibold text-emerald-300 tracking-wide select-all text-center"
          >${escapeHtml(ctfResult.flag)}</code>
          <button
            id="btn-copy-ctf-flag"
            type="button"
            class="no-print inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[42px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span id="btn-copy-ctf-label">Copiar Flag</span>
          </button>
        </div>
      </section>
    `
    : `
      <section class="rounded-xl border border-slate-800 bg-soc-surface p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-start sm:items-center gap-3.5">
          <span class="h-10 w-10 rounded-lg border border-slate-700 bg-soc-canvas text-slate-400 flex items-center justify-center shrink-0">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </span>
          <div>
            <div class="text-xs font-mono font-semibold text-slate-400">
              CTF MODE · FLAG BLOQUEADO
            </div>
            <p class="text-xs sm:text-sm text-slate-300 mt-0.5">
              ${
                ctfResult.customScenario
                  ? 'Escenario personalizado: el token <code class="font-mono text-sky-300">CTF{DRP_M4st3r_...}</code> solo se genera en los escenarios oficiales de GhostAcademy sin modificar.'
                  : `Se requiere una puntuación superior a <strong>80/100</strong> para generar el token <code class="font-mono text-sky-300">CTF{DRP_M4st3r_...}</code> (faltan ${ctfResult.pointsMissing} puntos).`
              }
            </p>
          </div>
        </div>
        <span class="text-xs font-mono text-slate-400 tabular-nums shrink-0">
          ${ctfResult.customScenario ? 'Personalizado' : `${scoreResult.totalScore} / 81 mín.`}
        </span>
      </section>
    `;

  dom.aarScreen.innerHTML = `
    <!-- Encabezado exclusivo para impresión PDF -->
    <div class="aar-print-header hidden items-center justify-between border-b border-slate-300 pb-4 mb-4">
      <div class="flex items-center gap-3">
        <img src="./assets/logo.png" alt="Logo" class="h-10 w-10 object-contain" />
        <div>
          <div class="text-base font-bold text-slate-900">After Action Report (AAR) — DRP Tabletop · GhostAcademy</div>
          <div class="text-xs text-slate-600">${escapeHtml(activeScenario.organization)} · ${escapeHtml(
    activeScenario.code
  )}</div>
        </div>
      </div>
      <div class="text-right text-xs text-slate-600 font-mono">
        Puntuación: ${scoreResult.totalScore}/100 · Fecha: ${new Date().toLocaleDateString('es-ES')}
      </div>
    </div>

    <!-- Cabecera ejecutiva del AAR -->
    <section class="rounded-xl border border-slate-800 bg-soc-surface p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
      <div class="space-y-2 max-w-3xl">
        <div class="flex flex-wrap items-center gap-2.5 text-xs">
          <span class="font-mono font-semibold px-2.5 py-1 rounded border ${verdictTone}">
            ${escapeHtml(verdictTitle)}
          </span>
          <span class="text-slate-400 font-mono">${escapeHtml(activeScenario.code)} · ${escapeHtml(
    activeScenario.organization
  )}</span>
        </div>
        <h1 id="aar-main-title" class="text-2xl font-semibold tracking-tight text-slate-50 text-balance">
          After Action Report (AAR): ${escapeHtml(activeScenario.title)}
        </h1>
        <p class="text-sm text-slate-300 leading-relaxed">
          ${escapeHtml(verdictSummary)}
        </p>
      </div>

      <div class="no-print flex flex-wrap items-center gap-2.5 shrink-0">
        <button
          id="btn-print-aar"
          type="button"
          class="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[42px] rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
          <span>Exportar Informe</span>
        </button>

        <button
          id="btn-export-aar-md"
          type="button"
          class="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[42px] rounded-lg border border-slate-700 bg-soc-canvas hover:bg-slate-800 text-slate-200 text-xs sm:text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <svg class="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          <span>Exportar (.md)</span>
        </button>

        <button
          id="btn-aar-export-b64"
          type="button"
          class="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[42px] rounded-lg border border-slate-700 bg-soc-canvas hover:bg-slate-800 text-slate-200 text-xs sm:text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <svg class="w-4 h-4 text-sky-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
          <span>Exportar Base64</span>
        </button>

        <button
          id="btn-aar-restart"
          type="button"
          class="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[42px] rounded-lg border border-slate-700 bg-soc-elevated hover:bg-slate-800 text-slate-100 text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <span>Nueva Simulación</span>
        </button>
      </div>
    </section>

    <!-- Puntuación Final (0–100) y Rango Corporativo -->
    <section class="rounded-xl border border-slate-800 bg-soc-surface p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
      <div class="lg:col-span-5 flex items-center gap-5">
        <div class="relative h-24 w-24 shrink-0 flex items-center justify-center">
          <svg class="h-24 w-24 -rotate-90" viewBox="0 0 96 96" aria-hidden="true">
            <circle cx="48" cy="48" r="${radius}" stroke="#1e293b" stroke-width="8" fill="none"></circle>
            <circle
              cx="48"
              cy="48"
              r="${radius}"
              stroke="${scoreResult.rank.ringColor}"
              stroke-width="8"
              stroke-linecap="round"
              fill="none"
              stroke-dasharray="${circumference.toFixed(2)}"
              stroke-dashoffset="${strokeOffset.toFixed(2)}"
            ></circle>
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span class="text-2xl font-mono font-bold text-slate-50 tabular-nums">${scoreResult.totalScore}</span>
            <span class="text-[10px] font-mono text-slate-400">/ 100</span>
          </div>
        </div>

        <div class="space-y-1.5 min-w-0">
          <div class="text-xs font-mono text-slate-400">EVALUACIÓN FINAL DEL AUDITOR</div>
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-md border text-sm font-semibold ${scoreResult.rank.badgeClass}">
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="7"></circle>
              <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
            </svg>
            <span>${escapeHtml(scoreResult.rank.title)}</span>
          </div>
          <p class="text-xs text-slate-300 leading-relaxed">
            ${escapeHtml(scoreResult.rank.subtitle)}
          </p>
        </div>
      </div>

      <div class="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="aar-subtle-surface rounded-lg border border-slate-800 bg-soc-canvas/70 p-4 space-y-1.5">
          <div class="flex items-center justify-between text-xs text-slate-400">
            <span>Pilar RTO</span>
            <span class="font-mono text-slate-200 font-semibold tabular-nums">${scoreResult.rtoScore} / 35</span>
          </div>
          <div class="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div class="h-full rounded-full bg-sky-500" style="width: ${Math.round(
              (scoreResult.rtoScore / 35) * 100
            )}%;"></div>
          </div>
          <p class="text-[11px] text-slate-400 tabular-nums">${servicesWithinRto}/${totalServices} servicios en SLA</p>
        </div>

        <div class="aar-subtle-surface rounded-lg border border-slate-800 bg-soc-canvas/70 p-4 space-y-1.5">
          <div class="flex items-center justify-between text-xs text-slate-400">
            <span>Pilar RPO</span>
            <span class="font-mono text-slate-200 font-semibold tabular-nums">${scoreResult.rpoScore} / 30</span>
          </div>
          <div class="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div class="h-full rounded-full bg-emerald-500" style="width: ${Math.round(
              (scoreResult.rpoScore / 30) * 100
            )}%;"></div>
          </div>
          <p class="text-[11px] text-slate-400 tabular-nums">Pérdida: ${formatRpoDuration(
            appState.realRpoMinutes
          )}</p>
        </div>

        <div class="aar-subtle-surface rounded-lg border border-slate-800 bg-soc-canvas/70 p-4 space-y-1.5">
          <div class="flex items-center justify-between text-xs text-slate-400">
            <span>Dinero Salvado</span>
            <span class="font-mono text-slate-200 font-semibold tabular-nums">${scoreResult.costScore} / 35</span>
          </div>
          <div class="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div class="h-full rounded-full bg-amber-500" style="width: ${Math.round(
              (scoreResult.costScore / 35) * 100
            )}%;"></div>
          </div>
          <p class="text-[11px] text-emerald-400 font-mono tabular-nums">+${formatCurrencyEur(
            scoreResult.moneySavedEur,
            false
          )} evitados</p>
        </div>
      </div>
    </section>

    ${ctfPanelHtml}

    <!-- Resumen cuantitativo comparativo -->
    <section class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" aria-label="Métricas finales del incidente">
      <article class="rounded-xl border border-slate-800 bg-soc-surface p-5 space-y-2">
        <div class="text-xs font-medium text-slate-400">RTO Teórico vs. RTO Real</div>
        <div class="text-2xl font-mono font-semibold text-slate-50 tabular-nums">
          ${formatDurationHHMMSS(appState.downtimeSeconds)}
        </div>
        <div class="text-xs text-slate-400 font-mono tabular-nums">
          Umbral crítico BIA: ${mostDemandingRtoMinutes} min · Real: ${globalDowntimeMinutes} min
        </div>
        <div class="text-xs ${
          servicesWithinRto === totalServices ? 'text-emerald-400' : 'text-red-400'
        } font-medium">
          ${servicesWithinRto} de ${totalServices} servicios dentro de RTO
        </div>
      </article>

      <article class="rounded-xl border border-slate-800 bg-soc-surface p-5 space-y-2">
        <div class="text-xs font-medium text-slate-400">RPO Teórico vs. RPO Real</div>
        <div class="text-2xl font-mono font-semibold text-slate-50 tabular-nums">
          ${formatRpoDuration(appState.realRpoMinutes)}
        </div>
        <div class="text-xs text-slate-400 font-mono tabular-nums">
          Umbral más estricto: ${mostDemandingRpoMinutes} min (Síncrono)
        </div>
        <div class="text-xs ${
          servicesWithinRpo === totalServices ? 'text-emerald-400' : 'text-amber-400'
        } font-medium">
          ${servicesWithinRpo} de ${totalServices} servicios dentro de RPO
        </div>
      </article>

      <article class="rounded-xl border border-slate-800 bg-soc-surface p-5 space-y-2.5">
        <div class="text-xs font-medium text-slate-400">Impacto Financiero Total Estimado</div>
        <div class="text-2xl font-mono font-semibold text-slate-50 tabular-nums">
          ${formatCurrencyEur(appState.accumulatedCostEur, true)}
        </div>
        <div class="w-full h-2 rounded-full bg-slate-800 overflow-hidden flex" aria-hidden="true">
          <div class="h-full bg-sky-500" style="width: ${operationalCostPct}%;"></div>
          <div class="h-full bg-amber-500" style="width: ${decisionCostPct}%;"></div>
        </div>
        <div class="flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
          <span>Caída: ${formatCurrencyEur(downtimeOperationalCost, false)}</span>
          <span>Decisiones: ${formatCurrencyEur(appState.decisionCostEur, false)}</span>
        </div>
      </article>

      <article class="rounded-xl border border-slate-800 bg-soc-surface p-5 space-y-2">
        <div class="text-xs font-medium text-slate-400">Desempeño del Comité DRP</div>
        <div class="text-2xl font-mono font-semibold text-slate-50 tabular-nums">
          ${optimalCount} / ${totalTurns} óptimas
        </div>
        <div class="text-xs text-slate-400 font-mono tabular-nums">
          Estrés final: ${Math.round(appState.teamStressPercent)}% · Timeouts: ${timeoutCount}
        </div>
        <div class="text-xs ${
          optimalCount >= 4 ? 'text-emerald-400' : optimalCount >= 2 ? 'text-amber-400' : 'text-red-400'
        } font-medium">
          ${
            optimalCount === totalTurns
              ? 'Ejecución ejemplar sin desviaciones'
              : 'Revisar oportunidades de mejora abajo'
          }
        </div>
      </article>
    </section>

    <!-- Comparativa BIA Teórico vs. Real por servicio -->
    <section class="rounded-xl border border-slate-800 bg-soc-surface overflow-hidden">
      <div class="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-slate-100">
            Comparativa BIA: Objetivos Teóricos vs. Resultados Reales
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">
            Barra superior gris: objetivo teórico BIA · Barra inferior: valor real alcanzado (verde en objetivo, rojo excedido).
          </p>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-slate-800 text-xs font-medium text-slate-400 bg-soc-canvas/40">
              <th scope="col" class="py-3 pl-4 pr-3">Servicio Crítico</th>
              <th scope="col" class="py-3 px-3">RTO Teórico vs. Real</th>
              <th scope="col" class="py-3 px-3">RPO Teórico vs. Real</th>
              <th scope="col" class="py-3 pl-3 pr-4 text-right">Cumplimiento</th>
            </tr>
          </thead>
          <tbody>${biaComparisonRowsHtml}</tbody>
        </table>
      </div>
    </section>

    <!-- Desglose cronológico de decisiones y Lecciones Aprendidas -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <section class="lg:col-span-7 rounded-xl border border-slate-800 bg-soc-surface p-5 sm:p-6 space-y-4">
        <div>
          <h2 class="text-base font-semibold text-slate-100">
            Desglose Cronológico de Decisiones
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">
            Evaluación turno a turno de aciertos operativos, errores e impacto acumulado.
          </p>
        </div>
        <div class="space-y-3">
          ${decisionCardsHtml}
        </div>
      </section>

      <section class="lg:col-span-5 rounded-xl border border-slate-800 bg-soc-surface p-5 sm:p-6 space-y-4">
        <div>
          <h2 class="text-base font-semibold text-slate-100">
            Lecciones Aprendidas y Recomendaciones
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">
            Plan de acción automatizado según el desempeño observado durante el ejercicio.
          </p>
        </div>
        <ol class="space-y-3">
          ${lessonsHtml}
        </ol>
      </section>
    </div>
  `;

  const printBtn = document.getElementById('btn-print-aar');
  if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
  }

  const exportMdBtn = document.getElementById('btn-export-aar-md');
  if (exportMdBtn) {
    exportMdBtn.addEventListener('click', () => exportAarToMarkdown(scoreResult, ctfResult, lessons));
  }

  const exportB64Btn = document.getElementById('btn-aar-export-b64');
  if (exportB64Btn) {
    exportB64Btn.addEventListener('click', () => openScenarioModal('export'));
  }

  const copyCtfBtn = document.getElementById('btn-copy-ctf-flag');
  if (copyCtfBtn && ctfResult.unlocked && ctfResult.flag) {
    copyCtfBtn.addEventListener('click', () => {
      copyTextToClipboard(ctfResult.flag).then(() => {
        const lbl = document.getElementById('btn-copy-ctf-label');
        if (lbl) {
          lbl.textContent = 'Flag copiado ✓';
          window.setTimeout(() => {
            lbl.textContent = 'Copiar Flag';
          }, 2200);
        }
      });
    });
  }

  const restartBtn = document.getElementById('btn-aar-restart');
  if (restartBtn) {
    restartBtn.addEventListener('click', resetExercise);
  }
}

function exportAarToMarkdown(scoreResult, ctfResult, lessons) {
  const biaRows = appState.services
    .map((srv) => {
      const rtoMet = srv.downtimeSeconds <= srv.rtoMinutes * 60 ? 'Cumplido' : 'Excedido';
      const rpoMet = appState.realRpoMinutes <= srv.rpoMinutes ? 'Cumplido' : 'Excedido';
      return `| ${srv.name} | ${srv.rtoLabel} | ${formatDurationHHMMSS(srv.downtimeSeconds)} (${rtoMet}) | ${srv.rpoLabel} | ${formatRpoDuration(appState.realRpoMinutes)} (${rpoMet}) |`;
    })
    .join('\n');

  const decisionsMd = appState.decisionHistory
    .map(
      (item) =>
        `### Turno ${item.turnNumber} · ${item.phaseName} (${item.injectCode})\n` +
        `- **Decisión [${item.decisionKey}]**: ${item.decisionTitle}${item.timedOut ? ' *(Timeout automático)*' : ''}\n` +
        `- **Impacto**: +${item.rtoImpactMinutes} min RTO · +${formatRpoDuration(item.rpoImpactMinutes)} RPO · +${formatCurrencyEur(item.costImpactEur, false)} · Estrés ${item.stressDelta >= 0 ? `+${item.stressDelta}` : item.stressDelta}%\n` +
        `- **Qué se hizo bien**: ${item.whatWentWell}\n` +
        `- **Riesgo / fallo**: ${item.whatWentWrong}\n`
    )
    .join('\n');

  const lessonsMd = lessons
    .map((lesson, idx) => `${idx + 1}. **[Prioridad ${lesson.priority}] ${lesson.title}**: ${lesson.text}`)
    .join('\n');

  const mdContent = [
    `# After Action Report (AAR) — ${activeScenario.title}`,
    '',
    `- **Código de escenario**: ${activeScenario.code}`,
    `- **Organización**: ${activeScenario.organization}`,
    `- **Fecha**: ${new Date().toLocaleDateString('es-ES')}`,
    `- **Puntuación final**: ${scoreResult.totalScore}/100 (**${scoreResult.rank.title}**)`,
    `- **Pilares**: RTO ${scoreResult.rtoScore}/35 · RPO ${scoreResult.rpoScore}/30 · Dinero Salvado ${scoreResult.costScore}/35 (+${formatCurrencyEur(scoreResult.moneySavedEur, false)} evitados)`,
    `- **RTO Real acumulado**: ${formatDurationHHMMSS(appState.downtimeSeconds)}`,
    `- **RPO Real (pérdida de datos)**: ${formatRpoDuration(appState.realRpoMinutes)}`,
    `- **Impacto económico total**: ${formatCurrencyEur(appState.accumulatedCostEur, true)}`,
    ctfResult.unlocked
      ? `- **Token CTF GhostAcademy**: \`${ctfResult.flag}\``
      : ctfResult.customScenario
        ? `- **Token CTF GhostAcademy**: No disponible (solo en escenarios oficiales sin modificar)`
        : `- **Token CTF GhostAcademy**: Bloqueado (requiere > 80 puntos)`,
    '',
    '## Comparativa BIA: Teórico vs. Real',
    '',
    '| Servicio Crítico | RTO Teórico | RTO Real | RPO Teórico | RPO Real |',
    '| :--- | :--- | :--- | :--- | :--- |',
    biaRows,
    '',
    '## Desglose Cronológico de Decisiones',
    '',
    decisionsMd,
    '## Lecciones Aprendidas y Plan de Acción',
    '',
    lessonsMd,
    '',
    '---',
    '*Generado por DRP Tabletop — GhostAcademy (https://www.unfantasmaenelsistema.com/)*',
  ].join('\n');

  const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `aar-${activeScenario.code.toLowerCase()}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ==========================================================================
   6B. MODAL DE PERSISTENCIA DE ESCENARIO (BASE64)
   ========================================================================== */

function setScenarioModalFeedback(message, isError = false) {
  if (!dom.scenarioModalFeedback) return;
  if (!message) {
    dom.scenarioModalFeedback.classList.add('hidden');
    dom.scenarioModalFeedback.textContent = '';
    return;
  }

  dom.scenarioModalFeedback.textContent = message;
  dom.scenarioModalFeedback.className = isError
    ? 'rounded-lg border border-red-500/50 bg-red-950/50 px-3.5 py-2.5 text-xs text-red-200'
    : 'rounded-lg border border-emerald-500/50 bg-emerald-950/40 px-3.5 py-2.5 text-xs text-emerald-200';
}

function switchScenarioModalTab(mode) {
  const isImport = mode === 'import';

  if (dom.scenarioImportPane) dom.scenarioImportPane.classList.toggle('hidden', !isImport);
  if (dom.scenarioExportPane) dom.scenarioExportPane.classList.toggle('hidden', isImport);

  if (dom.tabScenarioImport) {
    dom.tabScenarioImport.className = isImport
      ? 'px-3.5 py-2 text-xs font-semibold border-b-2 border-sky-500 text-sky-300 transition-colors duration-150'
      : 'px-3.5 py-2 text-xs font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition-colors duration-150';
  }
  if (dom.tabScenarioExport) {
    dom.tabScenarioExport.className = !isImport
      ? 'px-3.5 py-2 text-xs font-semibold border-b-2 border-sky-500 text-sky-300 transition-colors duration-150'
      : 'px-3.5 py-2 text-xs font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition-colors duration-150';
  }

  if (!isImport && dom.scenarioExportTextarea) {
    const b64 = exportCurrentScenarioBase64();
    dom.scenarioExportTextarea.value = b64;
    if (dom.scenarioExportMeta) {
      dom.scenarioExportMeta.textContent = `${b64.length.toLocaleString('es-ES')} caracteres Base64`;
    }
  }
}

function updateValidationChip(el, state, label) {
  if (!el) return;
  let icon = '○';
  let classes =
    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-mono transition-colors duration-150 ';

  if (state === 'valid') {
    icon = '✓';
    classes += 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  } else if (state === 'invalid') {
    icon = '✕';
    classes += 'border-red-500/40 bg-red-500/10 text-red-300';
  } else {
    classes += 'border-slate-800 bg-soc-canvas text-slate-400';
  }

  el.className = classes;
  el.innerHTML = `<span>${icon}</span><span>${escapeHtml(label)}</span>`;
}

function runRealtimeScenarioValidation() {
  if (!dom.scenarioImportTextarea) return null;
  const result = inspectScenarioInput(dom.scenarioImportTextarea.value);

  updateValidationChip(dom.valChipJson, result.checks.json, 'JSON válido');
  updateValidationChip(dom.valChipId, result.checks.id, 'id');
  updateValidationChip(dom.valChipNombre, result.checks.nombre, 'nombre');
  updateValidationChip(dom.valChipEventos, result.checks.eventos, 'eventos');

  if (dom.btnApplyImportedScenario) {
    dom.btnApplyImportedScenario.disabled = !result.isValid;
  }

  if (result.isEmpty) {
    dom.scenarioImportTextarea.className =
      'w-full rounded-lg border border-slate-700 bg-soc-terminal p-3 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors duration-150';
    setScenarioModalFeedback('');
  } else if (result.isValid) {
    dom.scenarioImportTextarea.className =
      'w-full rounded-lg border border-emerald-500/70 bg-soc-terminal p-3 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-150';
    setScenarioModalFeedback(result.summary, false);
  } else {
    dom.scenarioImportTextarea.className =
      'w-full rounded-lg border border-red-500/70 bg-soc-terminal p-3 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors duration-150';
    setScenarioModalFeedback(result.error, true);
  }

  return result;
}

function openScenarioModal(initialTab = 'import') {
  if (!dom.scenarioModal) return;
  appState.isScenarioModalOpen = true;
  switchScenarioModalTab(initialTab);
  if (initialTab === 'import') {
    runRealtimeScenarioValidation();
  } else {
    setScenarioModalFeedback('');
  }
  dom.scenarioModal.classList.remove('hidden');

  if (initialTab === 'import' && dom.scenarioImportTextarea) {
    dom.scenarioImportTextarea.focus();
  } else if (dom.scenarioExportTextarea) {
    dom.scenarioExportTextarea.focus();
    dom.scenarioExportTextarea.select();
  }
}

function closeScenarioModal() {
  if (!dom.scenarioModal) return;
  appState.isScenarioModalOpen = false;
  dom.scenarioModal.classList.add('hidden');
}

function handleApplyImportedScenario() {
  if (!dom.scenarioImportTextarea) return;
  const validation = runRealtimeScenarioValidation();
  if (!validation || !validation.isValid || !validation.normalizedScenario) {
    return;
  }

  activeScenario = validation.normalizedScenario;
  appState.isCustomScenario = true;
  initializeState(true);
  appendLog(
    'INFO',
    'PERSISTENCIA',
    `Escenario personalizado "${activeScenario.title}" (${activeScenario.code}) cargado y validado.`
  );
  closeScenarioModal();
}

function openHelpModal() {
  if (!dom.helpModal) return;
  appState.isHelpModalOpen = true;
  dom.helpModal.classList.remove('hidden');
  if (dom.btnCloseHelpModal) {
    dom.btnCloseHelpModal.focus();
  }
}

function closeHelpModal() {
  if (!dom.helpModal) return;
  appState.isHelpModalOpen = false;
  dom.helpModal.classList.add('hidden');
}

function handleRestoreDefaultScenario() {
  activeScenario = deepClone(BUILT_IN_SCENARIOS[0]);
  appState.isCustomScenario = false;
  if (dom.scenarioImportTextarea) {
    dom.scenarioImportTextarea.value = '';
  }
  initializeState(true);
  runRealtimeScenarioValidation();
  setScenarioModalFeedback('Escenario base de GhostAcademy restaurado correctamente.', false);
}

function downloadCurrentScenarioJson() {
  const jsonContent = JSON.stringify(activeScenario, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `escenario-${activeScenario.code.toLowerCase()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ==========================================================================
   7. VINCULACIÓN DE EVENTOS DE INTERFAZ
   ========================================================================== */

function bindEvents() {
  dom.btnStartExercise.addEventListener('click', startExercise);

  dom.btnPauseExercise.addEventListener('click', () => {
    if (appState.phase === 'Incidente Activo') {
      pauseExercise();
    } else if (appState.phase === 'Pausado') {
      resumeExercise();
    }
  });

  dom.btnResetExercise.addEventListener('click', resetExercise);
  dom.btnExportLog.addEventListener('click', exportLogsToTxt);

  if (dom.btnOpenLoadScenario) {
    dom.btnOpenLoadScenario.addEventListener('click', () => openScenarioModal('import'));
  }
  if (dom.btnOpenExportScenario) {
    dom.btnOpenExportScenario.addEventListener('click', () => openScenarioModal('export'));
  }
  if (dom.btnCloseScenarioModal) {
    dom.btnCloseScenarioModal.addEventListener('click', closeScenarioModal);
  }
  if (dom.tabScenarioImport) {
    dom.tabScenarioImport.addEventListener('click', () => switchScenarioModalTab('import'));
  }
  if (dom.tabScenarioExport) {
    dom.tabScenarioExport.addEventListener('click', () => switchScenarioModalTab('export'));
  }
  if (dom.btnApplyImportedScenario) {
    dom.btnApplyImportedScenario.addEventListener('click', handleApplyImportedScenario);
  }
  if (dom.scenarioImportTextarea) {
    dom.scenarioImportTextarea.addEventListener('input', runRealtimeScenarioValidation);
  }
  if (dom.btnRestoreDefaultScenario) {
    dom.btnRestoreDefaultScenario.addEventListener('click', handleRestoreDefaultScenario);
  }
  if (dom.btnDownloadScenarioJson) {
    dom.btnDownloadScenarioJson.addEventListener('click', downloadCurrentScenarioJson);
  }
  if (dom.btnCopyScenarioBase64) {
    dom.btnCopyScenarioBase64.addEventListener('click', () => {
      if (!dom.scenarioExportTextarea) return;
      copyTextToClipboard(dom.scenarioExportTextarea.value).then(() => {
        if (dom.btnCopyScenarioLabel) {
          dom.btnCopyScenarioLabel.textContent = 'String copiado ✓';
          window.setTimeout(() => {
            dom.btnCopyScenarioLabel.textContent = 'Copiar String Base64';
          }, 2200);
        }
      });
    });
  }
  if (dom.scenarioModal) {
    dom.scenarioModal.addEventListener('click', (event) => {
      if (event.target === dom.scenarioModal) {
        closeScenarioModal();
      }
    });
  }

  dom.speedButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.speedMultiplier = Number(btn.dataset.speed) || 1;
      renderControlsAndHeader();
    });
  });

  dom.biaFilterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.biaFilter = btn.dataset.biaFilter || 'ALL';
      renderBiaPanel();
    });
  });

  dom.logFilterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.logFilter = btn.dataset.logFilter || 'ALL';
      renderEventLog(false);
    });
  });

  // Delegación de clics para las opciones de "Decisiones Bajo Presión"
  dom.triageBody.addEventListener('click', (event) => {
    const decisionBtn = event.target.closest('button[data-decision-id]');
    if (!decisionBtn || decisionBtn.disabled) return;
    handleDecisionSelection(decisionBtn.dataset.decisionId);
  });

  // Delegación de clics y teclado en filas de la tabla BIA
  dom.biaTableBody.addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-service-id]');
    if (!row) return;
    appState.selectedServiceId = row.dataset.serviceId;
    renderBiaPanel();
  });

  dom.biaTableBody.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('tr[data-service-id]');
    if (!row) return;
    event.preventDefault();
    appState.selectedServiceId = row.dataset.serviceId;
    renderBiaPanel();
  });

  if (dom.btnCloseSlaModal) {
    dom.btnCloseSlaModal.addEventListener('click', closeSlaAlertModal);
  }

  if (dom.btnOpenLatestSlaAlert) {
    dom.btnOpenLatestSlaAlert.addEventListener('click', () => {
      if (appState.latestSlaAlert) {
        openSlaAlertModal(appState.latestSlaAlert);
      }
    });
  }

  if (dom.slaAlertModal) {
    dom.slaAlertModal.addEventListener('click', (event) => {
      if (event.target === dom.slaAlertModal) {
        closeSlaAlertModal();
      }
    });
  }

  if (dom.scenarioSelect) {
    dom.scenarioSelect.addEventListener('change', (event) => {
      const target = /** @type {HTMLSelectElement} */ (event.target);
      if (target && target.value && target.value !== '__custom__') {
        switchBuiltInScenario(target.value);
      }
    });
  }

  if (dom.btnOpenHelp) {
    dom.btnOpenHelp.addEventListener('click', openHelpModal);
  }
  if (dom.btnCloseHelpModal) {
    dom.btnCloseHelpModal.addEventListener('click', closeHelpModal);
  }
  if (dom.helpModal) {
    dom.helpModal.addEventListener('click', (event) => {
      if (event.target === dom.helpModal) {
        closeHelpModal();
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (appState.isHelpModalOpen) {
        closeHelpModal();
      } else if (appState.isScenarioModalOpen) {
        closeScenarioModal();
      } else if (appState.isAlertModalOpen) {
        closeSlaAlertModal();
      }
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const activeEl = document.activeElement;
    const tag = activeEl ? activeEl.tagName : '';
    const isEditable =
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      (activeEl && /** @type {HTMLElement} */ (activeEl).isContentEditable);
    if (isEditable) return;

    if (event.key === '?' && !appState.isScenarioModalOpen && !appState.isAlertModalOpen) {
      event.preventDefault();
      if (appState.isHelpModalOpen) {
        closeHelpModal();
      } else {
        openHelpModal();
      }
      return;
    }

    if (appState.isHelpModalOpen || appState.isScenarioModalOpen || appState.isAlertModalOpen) {
      return;
    }

    const lowerKey = event.key.toLowerCase();
    if (lowerKey === 'p') {
      if (appState.phase === 'Incidente Activo') {
        event.preventDefault();
        pauseExercise();
      } else if (appState.phase === 'Pausado') {
        event.preventDefault();
        resumeExercise();
      }
      return;
    }

    if (appState.phase === 'Incidente Activo') {
      const currentTurn = activeScenario.turns[appState.currentTurnIndex];
      if (!currentTurn || !Array.isArray(currentTurn.decisions)) return;

      const keyMap = { '1': 0, a: 0, '2': 1, b: 1, '3': 2, c: 2, '4': 3, d: 3 };
      if (Object.prototype.hasOwnProperty.call(keyMap, lowerKey)) {
        const option = currentTurn.decisions[keyMap[lowerKey]];
        if (option) {
          event.preventDefault();
          handleDecisionSelection(option.id);
        }
      }
    }
  });
}

/* ==========================================================================
   8. INICIALIZACIÓN
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  if (!restoreSessionFromStorage()) {
    initializeState(false);
  }
});
