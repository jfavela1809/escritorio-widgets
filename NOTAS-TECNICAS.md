# Notas técnicas — prueba de ventana de escritorio (paso 1)

Medido el 2026-11-24 en una laptop (Windows 11, pantalla 1536×864 DIP al 125 %,
1920×1080 físicos, Electron 45.3.3, koffi 3.3.8). Código en `spike/` (`npm run spike`;
variables `SPIKE_MATRIZ=1` y `SPIKE_SONDEO=1` para los modos de medición; lanzador con
redirección a archivo en `scripts/lanzar-spike.ps1`). Cada ejecución es automática y se
cierra sola.

## Qué se midió y cómo

Ventana transparente, sin marco, `thickFrame:false`, `skipTaskbar`, sin `alwaysOnTop`, con
un cuadro magenta de 240×140 como "widget". Para saber si la caja se ve de verdad se
captura la pantalla real con `desktopCapturer` y se cuenta cuántos píxeles magenta hay en
su rectángulo (1.0 = visible entera, 0 = tapada). Las pruebas de ventanas usan koffi con
`user32`/`dwmapi` (`SetWindowPos`, `GetWindow`, `IsIconic`, `IsWindowVisible`,
`DwmGetWindowAttribute(CLOAKED)`, `WindowFromPoint`, `mouse_event`, `keybd_event`).
Win+D se probó de dos formas: `Shell.Application.ToggleDesktop()` por PowerShell y
Win+D "real" con `keybd_event`. En total unas 10 conmutaciones del escritorio; después de
cada una se restauró y se comprobó que las ventanas de usuario volvían al mismo número.

## Resultados

1. **Tamaño con `setBounds`**: la ventana queda exactamente igual al `workArea`
   (0,0,1536,816), sin pixeles de más (con `thickFrame:false`). `WS_EX_TOOLWINDOW` no
   queda puesto por `skipTaskbar` (el estilo extendido es `WS_EX_LAYERED|WS_EX_TRANSPARENT`).
2. **Clic a través**: funciona. Con `setIgnoreMouseEvents(true,{forward:true})` y movimientos
   de ratón *reales* (`mouse_event`), el renderer recibe los `mousemove` reenviados; al
   entrar al cuadro pide `ignorar=false` y la ventana pasa a recibir el ratón
   (`WindowFromPoint` devuelve la ventana de Chromium); al salir pide `true` y
   `WindowFromPoint` devuelve el escritorio (`SysListView32`, los iconos reales). La secuencia
   de peticiones fue `[false, true]`. Ojo: con `SetCursorPos` (movimiento sintético) los
   eventos reenviados NO llegan; para pruebas automáticas hay que usar `mouse_event`.
3. **Win+D oculta la ventana aunque la API diga que está visible.** Con Win+D (las dos
   formas) la ventana NO se minimiza ni se oculta: `isVisible()` sigue en `true`,
   `isMinimized()` y `IsIconic` en `false`, `cloaked=0`, y no se dispara ningún evento
   `minimize` ni `hide`. Lo que hace Windows es subir `Progman` (el escritorio) en el
   orden z hasta una posición cercana al tope (índice ~107 de 523) y minimizar las demás
   ventanas; todo lo que queda por debajo de `Progman` desaparece (captura: caja con
   0 % visible). Por eso la idea (c) (`showInactive()` en `minimize`/`hide`) **no sirve**:
   esos eventos nunca llegan. Una ventana que estuviera por encima de esa posición
   sobreviviría, pero eso equivale a ir encima de todas las apps.
4. **koffi y `SetWindowPos(HWND_BOTTOM)`**: funciona (devuelve true, la ventana baja al
   fondo del orden z; `win.show()`/`focus()` la suben de nuevo). Pero el fondo absoluto
   queda *por debajo* de `Progman`, y ahí Win+D la tapa igual. La colocación útil es
   **justo encima de `Progman`** (`SetWindowPos(hwnd, GetWindow(Progman, GW_HWNDPREV), 0,0,0,0,
   SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE)`): se ve sobre el escritorio y bajo todas las apps.
5. **Solución medida: sondeo cada 150 ms.** Un temporizador comprueba si la ventana
   inmediatamente por encima de `Progman` es la nuestra; si no, la recoloca con el
   `SetWindowPos` anterior (1–2 llamadas Win32 baratas por tic). Resultado con Win+D
   (ToggleDesktop y teclado): el widget desaparece un instante y reaparece a los
   ~370–380 ms (medido con capturas, incluye el coste de capturar), se queda visible con el
   escritorio mostrado, y al volver a pulsar Win+D todo vuelve a su sitio (las ventanas
   de usuario volvieron de 2 a 5 y la ventana nuestra quedó de nuevo encima de `Progman`).
6. **Clic real sobre la ventana** (cuando el punto es nuestro): la ventana se activa
   (`isFocused()=true`) pero **no pasa por encima de las demás apps**: sigue justo sobre
   `Progman`, y el sondeo no tuvo que hacer nada relevante (1 corrección por el cambio de
   índices). Es decir, el riesgo (2) del plan (tapar otras apps al hacer clic) no se
   presentó en esta medición.

## Lo que no se pudo medir o queda sin verificar

- Solo hay una pantalla; varios monitores quedan fuera de v1 (como dice el plan).
- El cuadro de pruebas estaba en una zona sin ventanas del usuario encima. No se midió el
  clic cuando una app de usuario tapa el widget (en ese caso el clic va a la app, que es
  lo correcto). No se probó arrastrar y soltar de archivos reales con ratón.
- El parpadeo de ~0.4 s tras Win+D es visible; se podría bajar con un sondeo más rápido
  (60–80 ms), a costa de más CPU. No se midió el consumo de CPU del sondeo; son 2 llamadas
  Win32 por tic.
- No se probó con juegos o apps a pantalla completa, ni con "Vista de tareas" (Win+Tab),
  ni con bloqueo/suspensión.
- El atajo Ctrl+Alt+E y el menú de bandeja se mantienen como respaldo del plan (sube la
  ventana al frente para ver/usar los widgets).

## Decisión

- Una sola ventana lienzo del tamaño del `workArea`, transparente, `thickFrame:false`,
  `skipTaskbar`, **no** `alwaysOnTop`, colocada con `setBounds` y `Math.round(x)||0`.
- Clic a través con `setIgnoreMouseEvents(true,{forward:true})` y el renderer que pide
  `ignorar=false` al pasar sobre elementos.
- **Se usa koffi** (dependencia de producción, FFI sin compilar) para mantener la ventana
  justo encima de `Progman` con un sondeo de 150 ms. No bastan los listeners
  `minimize`/`hide` + `showInactive()` porque Win+D no los dispara. Si koffi no carga, la
  app arranca igual y solo pierde esta función (sigue el atajo Ctrl+Alt+E).
- Respaldo: `Ctrl+Alt+E` y "Mostrar widgets" en la bandeja suben el lienzo al frente y
  lo reenfocan; al perder el foco vuelve a su sitio.
