# Escritorio Widgets

Carpetas y widgets tipo Android sobre el escritorio de Windows 10/11:

- **Carpetas**: suelta un acceso sobre otro y se juntan; clic abre una ventanita con todo lo
  que tiene. Se pueden ordenar, renombrar y pintar de color.
- **Widgets**: reloj y fecha, clima, uso de PC, notas, calendario, batería, pendientes y
  enlaces web. Se mueven y se cambian de tamaño.
- **Buscador** (`Ctrl+F`), **deshacer** (`Ctrl+Z`), un lienzo en cada monitor y opción para
  ver solo los iconos de la app, solo los de Windows o los dos.

La app solo guarda rutas: nunca mueve, borra ni cambia tus archivos. Sin instalador: corre
con Electron desde la carpeta del proyecto. El plan está en `PLAN.md` y las medidas de la
ventana sobre el escritorio en `NOTAS-TECNICAS.md`.

## Instalar

Necesitas Windows 10 u 11, [Git](https://git-scm.com/) y [Node.js](https://nodejs.org/) 20 o
más nuevo.

```
git clone https://github.com/jfavela1809/escritorio-widgets.git
cd escritorio-widgets
npm install
```

## Cómo arrancarla

- Doble clic en `abrir.bat` (la abre sin tocar el inicio de Windows), o `npm start`.
- Doble clic en `iniciar-con-windows.bat`: la abre y además la registra para arrancar con
  Windows (ver abajo). `quitar-inicio.bat` la quita del inicio.
- Clic derecho en el icono de la bandeja → "Salir" la cierra.

El clima usa [Open-Meteo](https://open-meteo.com/) (sin cuenta ni clave). La ciudad por
defecto es Ciudad Juárez; se cambia con clic derecho en el widget → "Cambiar ciudad…".

Si `npm install` no dejó Electron listo (no aparece `node_modules\electron\dist\electron.exe`),
correr `node node_modules/electron/install.js` y volver a intentarlo.

### Arrancar con Windows

- `iniciar-con-windows.bat`: escribe la entrada `EscritorioWidgets` en
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` (apunta a `electron.exe` con la
  ruta del proyecto), arranca la app y hace pausa.
- `quitar-inicio.bat`: borra esa entrada.
- Lanzar los dos con doble clic desde el Explorador o con `explorer.exe`. No desde la app
  de Claude: esa app es MSIX y virtualiza `HKCU`, así que la entrada no quedaría en el
  registro real.
- Verificar con: `powershell "Get-CimInstance Win32_StartupCommand | ? Name -like '*escritorio*'"`

## Cómo se usa

- **Acceso**: se pone sobre el escritorio con el mismo tamaño de celda. Clic lo abre con el
  programa o archivo asociado.
- **Carpeta**: soltar un acceso sobre otro crea una carpeta con los dos. Soltar un acceso
  sobre una carpeta lo mete dentro. Clic en la carpeta abre una ventanita con cuadrícula;
  Esc o clic fuera la cierra.
- **Sacar de una carpeta**: arrastrar un acceso fuera de la ventanita lo devuelve al
  escritorio. Una carpeta con un solo acceso se deshace sola; una vacía desaparece.
- **Clic derecho** sobre un acceso, carpeta o widget: abre el menú (abrir, renombrar,
  abrir ubicación, quitar del escritorio). Sobre el fondo: agregar acceso, carpeta de
  Windows o widget.
- **Botón `+`** abajo a la derecha: agrega accesos o widgets.
- **Agregar archivos**: también se puede soltar archivos o carpetas del Explorador sobre
  el escritorio o sobre el `+`.
- **Widgets**: "Agregar widget…" muestra el panel tipo Android; el widget se coloca en la
  primera zona libre y se puede mover o quitar.
- **Tamaño de un widget**: al pasar el ratón aparece una esquina abajo a la derecha; arrastrarla
  lo agranda o achica por celdas (de 1×1 a 8×8). Si crece parejo (p. ej. reloj de 2×2 a 4×4) el
  contenido se ve más grande; si solo se ensancha, gana espacio sin cambiar la letra. La sombra
  roja indica que choca con otro elemento. Clic derecho → "Tamaño original" lo regresa.
- **Varias pantallas**: hay un lienzo (con su propio `+`) en cada monitor. Para pasar algo de una
  pantalla a otra: arrastrarlo y soltarlo en la otra pantalla, o clic derecho → "Pasar a la
  pantalla de la izquierda (HDMI)". Si se desconecta un monitor, lo suyo se ve en el principal y
  regresa a su pantalla cuando se vuelve a conectar.
- **Deshacer**: `Ctrl+Z` deshace el último cambio (mover, juntar en carpeta, quitar, renombrar,
  tamaño, orden, color…) y `Ctrl+Y` lo rehace; también desde el menú ("Deshacer: …") y con el botón
  del aviso. Guarda los últimos 30 pasos de cada pantalla. Pasar algo a otra pantalla no se deshace.
- **Buscar**: `Ctrl+F`, "Buscar…" en el menú o en la bandeja. Encuentra accesos aunque estén dentro
  de carpetas o en la otra pantalla, sin importar acentos ni mayúsculas; Enter abre el primero.
- **Ordenar una carpeta**: dentro de la ventanita, arrastrar un acceso a otra posición. También
  clic derecho en la carpeta → "Ordenar por nombre".
- **Color de carpeta**: clic derecho en la carpeta → fila "Color" (9 colores).
- **Widgets nuevos**: Batería (2×1), Pendientes con casillas (2×2; Enter agrega, × quita, clic
  derecho → "Borrar los terminados") y Enlaces web (2×2; "+" agrega una página, clic la abre en el
  navegador; solo se abren direcciones http/https guardadas en el widget).
- **Copia diaria**: `escritorio.json.respaldo-AAAAMMDD` junto a `escritorio.json` (las últimas 7).
- **Qué se ve**: en el menú del `+` (y en el de la bandeja) se elige "Ver los de la app y los de
  Windows", "Ver solo los de la app" (esconde los iconos de Windows, como Ver → Mostrar iconos del
  escritorio) o "Ver solo los de Windows" (esconde los de la app; el `+` se queda para volver).
  Agregar algo con la app escondida la vuelve a mostrar. No se borra ni se mueve nada.
- **Traer al frente**: `Ctrl+Alt+E` sube los widgets por encima de las ventanas; al hacer
  clic en otra cosa vuelven a su sitio.
- **Bandeja** (icono junto al reloj): clic en el icono alterna Mostrar widgets. El menú
  tiene "Mostrar widgets", los tres modos de "Qué se ve", "Agregar acceso…" y "Salir".

## Dónde guarda los datos

`%APPDATA%\escritorio-widgets\escritorio.json` (la carpeta de datos de Electron sale del
nombre del paquete). Se escribe de forma atómica. Si ese archivo se daña, la app lo renombra
a `escritorio.json.roto-<fecha>` y arranca vacía; el original no se pierde.

Para pruebas, la variable `ESCRITORIO_DATA_DIR` redirige los datos a otra carpeta.

## Qué no hace

- **Nunca borra, mueve ni modifica archivos del usuario.** Solo guarda rutas de accesos y
  carpetas. "Quitar del escritorio" quita el acceso de esta app y nada más; los archivos y
  programas quedan como estaban.
- No usa internet salvo para el clima (Open-Meteo, sin clave). Los widgets no hacen
  peticiones desde el renderer.

## Cómo probarla

- `npm test`: pruebas unitarias (datos, carpetas, cuadrícula, clima, sistema, widgets).
  No abre ventanas.
- `npm run smoke`: abre la app con datos temporales, simula arrastres y menús, agrega los
  cinco widgets y guarda capturas PNG en `scripts/`. No toca los datos reales.

## Límites conocidos

- Cada monitor se reconoce por su nombre y su resolución física: si se cambia la resolución de
  un monitor, sus elementos pasan al principal (no se pierden).
- Con Win+D los widgets desaparecen y reaparecen en unos 370 ms (medido en la laptop) gracias
  al sondeo cada 150 ms que los vuelve a colocar encima de `Progman`.
- El control del orden (koffi) es opcional: si no carga, la app arranca igual y solo se
  pierde ese comportamiento; `Ctrl+Alt+E` y la bandeja siguen funcionando.
- No probado con juegos ni apps a pantalla completa, con Vista de tareas (Win+Tab), ni tras
  bloqueo o suspensión.
- Soltar archivos desde el Explorador de Windows no se ha probado a mano; las pruebas
  automáticas usan rutas simuladas.
- Los dos widgets de notas comparten el mismo texto (se guarda una sola nota en
  `escritorio.json`).
- Sin enlaces web en v1; sin calendario de Google u Outlook (el calendario es el mes actual).
