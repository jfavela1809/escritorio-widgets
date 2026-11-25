'use strict';
// API mínima expuesta al renderer. No se expone ipcRenderer ni nada más.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invocar = (canal, ...args) => ipcRenderer.invoke(canal, ...args);

function suscribir(canal) {
  return (cb) => {
    if (typeof cb !== 'function') return () => {};
    const f = (_e, d) => cb(d);
    ipcRenderer.on(canal, f);
    return () => ipcRenderer.removeListener(canal, f);
  };
}

contextBridge.exposeInMainWorld('escritorio', {
  cargar: () => invocar('datos:cargar'),
  guardar: (d) => invocar('datos:guardar', d),
  infoRutas: (lista) => invocar('rutas:info', lista),
  resolverRutas: (lista) => invocar('rutas:resolver', lista),
  elegir: (tipo) => invocar('dialogo:elegir', tipo),
  abrir: (ruta) => invocar('rutas:abrir', ruta),
  mostrarEnCarpeta: (ruta) => invocar('rutas:mostrar', ruta),
  // Clic a través: true = las zonas vacías dejan pasar el ratón; false = la ventana lo recibe.
  ignorarRaton: (v) => ipcRenderer.send('ventana:ignorar', v === true),
  // Zonas interactivas ([x, y, ancho, alto]) para que el proceso principal maneje el clic a través
  // incluso durante un arrastre de Windows. capturando = el lienzo está arrastrando o editando.
  reportarZonas: (zonas, capturando) => ipcRenderer.send('ventana:zonas', { zonas, capturando: capturando === true }),
  iconosDeWindows: () => invocar('escritorio:iconos-windows'),
  // Qué se ve: { appOculta, windows (true/false/null = no se pudo leer), modo }.
  // fijarVista('ambos' | 'app' | 'windows') cambia los dos y devuelve el estado nuevo.
  estadoVista: () => invocar('vista:estado'),
  fijarVista: (modo) => invocar('vista:fijar', String(modo)),
  // { appOculta }: cambió desde otro monitor o desde la bandeja.
  alCambiarVista: suscribir('escritorio:vista'),
  // Buscador: [{ ruta, nombre, carpeta, pantalla }] de todos los monitores.
  listaParaBuscar: () => invocar('buscar:lista'),
  alPedirBuscar: suscribir('escritorio:buscar'),
  // Pide el teclado para este lienzo (antes de escribir en un campo).
  enfocar: () => invocar('ventana:enfocar'),
  bateria: { leer: () => invocar('bateria:leer') },
  // Abre en el navegador un enlace guardado en un widget "Enlaces". Devuelve { ok, error? }.
  abrirWeb: (url) => invocar('web:abrir', String(url)),
  // Rutas de los archivos soltados desde el Explorador (File no trae .path en Electron moderno).
  rutasDeArchivos: (archivos) => {
    const salida = [];
    for (const f of Array.from(archivos || [])) {
      try { const r = webUtils.getPathForFile(f); if (r) salida.push(r); } catch (_) { /* no es un archivo del disco */ }
    }
    return salida;
  },
  // Widgets: todo lo que necesita sistema o red pasa por aquí (validado en el proceso principal).
  sistema: { leer: (reiniciar) => invocar('sistema:leer', reiniciar === true) },
  clima: {
    obtener: (forzar) => invocar('clima:obtener', forzar === true),
    buscar: (texto) => invocar('clima:buscar', String(texto == null ? '' : texto)),
    fijarCiudad: (c) => invocar('clima:ciudad', c),
  },
  notas: { leer: () => invocar('notas:leer'), guardar: (texto) => invocar('notas:guardar', String(texto)) },
  // Varios monitores: pasar un elemento a otro monitor (destino = clave, o null = donde está el
  // ratón). Devuelve { ok, nombre } o { ok: false, error }.
  moverAPantalla: (id, destino, offX, offY) => invocar('pantalla:mover', {
    id: String(id), destino: typeof destino === 'string' ? destino : null, offX: Number(offX) || 0, offY: Number(offY) || 0,
  }),
  // El lienzo de este monitor recibe un elemento de otro; cb devuelve (o promete) true si lo acomodó.
  alRecibirElemento: (cb) => suscribir('pantalla:recibir')(async (d) => {
    let ok = false;
    try { ok = (await cb(d)) === true; } catch (_) { ok = false; }
    ipcRenderer.send('pantalla:recibido', { pid: d && d.pid, ok });
  }),
  // Cada suscripción devuelve la función para darla de baja (así no se acumulan listeners).
  alRecibirRutas: suscribir('escritorio:rutas-nuevas'),
  // { area, otras, datos }: cambió algún monitor (se conectó, se quitó o cambió de tamaño).
  alCambiarPantalla: suscribir('escritorio:pantalla'),
});
