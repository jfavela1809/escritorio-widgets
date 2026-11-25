# Escritorio Widgets — plan de trabajo

App personal para el escritorio de Windows 11: carpetas tipo Android
(juntar accesos parecidos, abrirlas en una ventanita) y widgets tipo Android
(reloj/fecha, clima, uso de PC, notas/calendario). Pensada para una sola PC, sin
instalador. Plan escrito por Opus; construcción por subagentes Sonnet/Haiku.

## Decisiones (respuestas del usuario, 2026-11-24)

- Plataforma: escritorio de Windows (app Electron, como Notas Laterales).
- Contenido de carpetas: programas (.exe / .lnk) y archivos o carpetas de Windows
  (también rutas de red como `\\servidor\carpeta\...`). Sin enlaces web en v1.
- Widgets v1: reloj y fecha, clima, uso de PC (RAM/CPU/disco), notas y calendario.
- Publicar = instalada solo en su PC, arrancando con Windows.

## Base técnica

- Electron **45.3.3** (la misma de `../notas-laterales`, ya probada aquí), JavaScript
  plano, sin empaquetador ni framework. CommonJS en el proceso principal.
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, preload con
  una API mínima por IPC. Nada de `eval` ni HTML sin escapar.
- Sin dependencias de producción salvo que el paso 1 demuestre que hace falta
  `koffi` (FFI puro, sin compilar) para el orden de ventanas.
- Datos en `app.getPath('userData')\escritorio.json`, escritura atómica (copiar
  `fs-atomico.js` de Notas Laterales). Variable `ESCRITORIO_DATA_DIR` para pruebas.
- **La app nunca borra, mueve ni modifica archivos del usuario.** Solo guarda rutas.
  "Quitar" un acceso lo quita del escritorio de la app, nada más.

## Trampas ya medidas en esta laptop (de Notas Laterales)

- Pantalla al 125 %: usar `setBounds` completo con `thickFrame: false`; nunca
  `setPosition`; `Math.round(x) || 0` para evitar `-0`.
- La app de Claude es MSIX: lo que se lanza desde aquí escribe en un HKCU/AppData
  virtual. El registro de inicio se hace con un `.bat` lanzado por `explorer.exe`
  y se verifica con `Get-CimInstance Win32_StartupCommand`.
- Lanzar Electron en pruebas con `Start-Process ... -RedirectStandardOutput` y
  `WaitForExit`: un error del proceso principal abre un diálogo modal y cuelga
  una tubería.

## Arquitectura

Una sola ventana "lienzo" transparente, sin marco, del tamaño del área de trabajo
de la pantalla principal, `skipTaskbar`, **no** siempre encima. Las zonas vacías
dejan pasar el ratón (`setIgnoreMouseEvents(true, { forward: true })`) para que
los iconos reales del escritorio sigan funcionando; al pasar sobre un widget,
carpeta o acceso el renderer pide `ignorar=false`.

Una sola ventana permite arrastrar entre carpetas y la cuadrícula sin coordinar
varias ventanas.

### Riesgo principal (lo mide el paso 1 antes de construir nada)

1. **Win+D / "Mostrar escritorio"** puede ocultar o minimizar la ventana.
2. Al hacer clic en un widget la ventana pasa al frente y tapa otras apps (solo
   donde hay widgets, porque lo demás es transparente).

Medir en esta laptop: (a) qué pasa con Win+D con `skipTaskbar` (WS_EX_TOOLWINDOW);
(b) si con `koffi` + `SetWindowPos(HWND_BOTTOM)` tras cada clic/`blur` la ventana se
queda al fondo; (c) si al restaurarse con `showInactive()` en `minimize`/`hide`
basta. Elegir lo más simple que funcione y anotar el resultado en `NOTAS-TECNICAS.md`.
Respaldo siempre presente: atajo `Ctrl+Alt+E` y menú de bandeja "Mostrar widgets".
Queda descartado colgar la ventana de WorkerW (ahí no llegan clics en Windows 11 24H2).

### Modelo de datos (`escritorio.json`, versión 1)

```json
{
  "version": 1,
  "celda": 96,
  "elementos": [
    { "id": "a1", "tipo": "acceso", "ruta": "C:\\...\\Excel.lnk", "nombre": "Excel", "col": 0, "fila": 0 },
    { "id": "c1", "tipo": "carpeta", "nombre": "Oficina", "col": 1, "fila": 0,
      "hijos": [ { "id": "a2", "tipo": "acceso", "ruta": "...", "nombre": "Word" } ] },
    { "id": "w1", "tipo": "widget", "widget": "reloj", "col": 4, "fila": 0, "ancho": 2, "alto": 2, "opciones": {} }
  ],
  "clima": { "nombre": "Ciudad Juárez", "lat": 31.69, "lon": -106.42 },
  "notas": { "texto": "" },
  "iniciarConWindows": false
}
```

Validar y normalizar todo al leer (como `config.js` de Notas Laterales); un JSON
roto se renombra a `.roto-<fecha>` y se arranca vacío, sin perder el original.

### Carpetas (comportamiento Android)

- Soltar un acceso sobre otro → carpeta nueva "Carpeta" con los dos.
- Soltar sobre una carpeta → entra. Clic en carpeta → ventanita flotante con
  cuadrícula de 4 columnas, nombre editable y botón "+" (diálogo de archivos).
- Arrastrar un hijo fuera de la ventanita → vuelve al escritorio. Una carpeta con
  un solo hijo se deshace; vacía se borra.
- Icono de carpeta = mini vista 2×2 de los primeros 4 iconos.
- Esc o clic fuera cierra la ventanita.
- Umbral de arrastre 6 px para no confundir clic con arrastre. Ajuste a la cuadrícula;
  colisiones → la celda libre más cercana.
- Clic en acceso → `shell.openPath`. Ruta inexistente → icono gris y opción "Quitar".
- Íconos con `app.getFileIcon(ruta, { size: 'large' })`, `.lnk` resuelto con
  `shell.readShortcutLink` para el nombre; caché en memoria.
- Agregar: soltar archivos del Explorador sobre cualquier elemento o sobre el botón
  "+" del lienzo; menú contextual "Agregar acceso…" y "Agregar widget…".
- Clic derecho: renombrar, quitar del escritorio, abrir ubicación.

### Widgets

| Widget | Tamaño | Fuente |
|---|---|---|
| Reloj y fecha | 2×2 | reloj local, `Intl` en es-MX |
| Clima | 4×1 (píldora como la del celular) | Open-Meteo (sin clave): temperatura, icono, atardecer; geocodificación de Open-Meteo para elegir ciudad. Cada 30 min; sin red muestra el último dato con su hora |
| Uso de PC | 2×1 | `os.totalmem/freemem`, CPU por diferencia de `os.cpus()` cada 2 s, disco C: con `fs.statfs` |
| Notas | 2×2 | texto libre guardado en `escritorio.json` (guardado con espera de 500 ms) |
| Calendario | 2×2 | mes actual, hoy resaltado (sin cuentas externas en v1) |

Panel "Agregar widget" tipo Android: lista con vista previa; se coloca en la primera
zona libre. Cada widget es un módulo en `src/renderer/widgets/<nombre>.js` que
exporta `{ id, nombre, ancho, alto, montar(el, opciones, api), desmontar() }`.
Los widgets que necesitan sistema o red los piden al proceso principal por IPC
(el renderer no hace `fetch` a internet: CSP `default-src 'self'`).

## Pasos

| # | Paso | Modelo | Archivos | Listo cuando |
|---|---|---|---|---|
| 1 | Prueba de ventana de escritorio (Win+D, orden al fondo, clic transparente) | Sonnet | `spike/`, `NOTAS-TECNICAS.md` | Resultado medido de (a)(b)(c) y decisión escrita |
| 2 | Núcleo: lienzo, cuadrícula, accesos, carpetas, datos, bandeja, atajo | Sonnet | `src/main/*`, `src/preload/*`, `src/renderer/{index.html,app.js,styles.css,cuadricula.js,carpetas.js}` | `npm test` pasa; smoke crea carpeta soltando un acceso sobre otro |
| 3 | Widgets y panel "Agregar widget" | Sonnet | `src/renderer/widgets/*`, `src/main/sistema.js`, `src/main/clima.js` | Los 5 widgets visibles en el smoke; pruebas de parseo de clima y cálculo de CPU |
| 4 | Pruebas, smoke con captura, `.bat` de inicio (sin ejecutarlo) | Haiku | `test/*`, `scripts/*`, `iniciar-con-windows.bat`, `README.md` | Pruebas verdes; capturas en `scripts/`; README con cómo usar |
| 5 | Revisión de todo y lista de correcciones | Opus | — | Lista entregada al usuario |

Los pasos 2→3→4 van en orden: cada uno usa lo del anterior y tocan archivos
compartidos (`app.js`, preload).

## Fuera de v1

Varios monitores, enlaces web, calendario de Google/Outlook, temas, ocultar al
estar en pantalla completa, sincronizar con el celular.
