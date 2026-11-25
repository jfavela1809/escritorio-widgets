# Saca el icono de cada ruta igual que lo dibuja el Explorador de Windows (IShellItemImageFactory):
# respeta el icono propio de los accesos directos (.ico, .exe, .dll con índice), las carpetas de
# red, las apps de Chrome/Edge, etc. Solo LEE: no modifica ningún archivo del usuario.
# Entrada: -Lista <json con [{ "ruta": "...", "archivo": "C:\...\xxx.png" }]>  Tamaño en px: -Tam
# Salida (stdout): una línea por ruta lograda: OK<TAB>archivo
param([Parameter(Mandatory = $true)][string]$Lista, [int]$Tam = 96)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class IconoShell {
  [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx; public int cy; }

  [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItemImageFactory { [PreserveSig] int GetImage(SIZE size, int flags, out IntPtr phbm); }

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr pbc,
    [MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory ppv);

  [StructLayout(LayoutKind.Sequential)] struct BITMAP { public int bmType, bmWidth, bmHeight, bmWidthBytes; public ushort bmPlanes, bmBitsPixel; public IntPtr bmBits; }
  [StructLayout(LayoutKind.Sequential)] struct BITMAPINFOHEADER { public int biSize, biWidth, biHeight; public short biPlanes, biBitCount; public int biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant; }
  [StructLayout(LayoutKind.Sequential)] struct DIBSECTION { public BITMAP dsBm; public BITMAPINFOHEADER dsBmih; public int b0, b1, b2; public IntPtr dshSection; public int dsOffset; }

  [DllImport("gdi32.dll")] static extern int GetObject(IntPtr h, int size, ref DIBSECTION ds);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);

  const int SIIGBF_BIGGERSIZEOK = 0x1, SIIGBF_ICONONLY = 0x4;

  public static bool Guardar(string ruta, string archivo, int tam) {
    IShellItemImageFactory f;
    SHCreateItemFromParsingName(ruta, IntPtr.Zero, typeof(IShellItemImageFactory).GUID, out f);
    IntPtr hbm;
    SIZE s; s.cx = tam; s.cy = tam;
    int hr = f.GetImage(s, SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK, out hbm);
    Marshal.ReleaseComObject(f);
    if (hr != 0 || hbm == IntPtr.Zero) return false;
    try {
      DIBSECTION ds = new DIBSECTION();
      if (GetObject(hbm, Marshal.SizeOf(typeof(DIBSECTION)), ref ds) == 0 || ds.dsBm.bmBits == IntPtr.Zero || ds.dsBm.bmBitsPixel != 32) return false;
      int w = ds.dsBm.bmWidth, h = ds.dsBm.bmHeight, stride = ds.dsBm.bmWidthBytes;
      bool abajoArriba = ds.dsBmih.biHeight > 0;
      // Píxeles BGRA premultiplicados (así los entrega el shell).
      using (Bitmap bmp = new Bitmap(w, h, PixelFormat.Format32bppPArgb)) {
        BitmapData d = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppPArgb);
        byte[] fila = new byte[w * 4];
        for (int y = 0; y < h; y++) {
          int origen = abajoArriba ? (h - 1 - y) : y;
          Marshal.Copy(new IntPtr(ds.dsBm.bmBits.ToInt64() + (long)origen * stride), fila, 0, w * 4);
          Marshal.Copy(fila, 0, new IntPtr(d.Scan0.ToInt64() + (long)y * d.Stride), w * 4);
        }
        bmp.UnlockBits(d);
        bmp.Save(archivo, ImageFormat.Png);
      }
      return true;
    } finally { DeleteObject(hbm); }
  }
}
'@

$items = Get-Content -LiteralPath $Lista -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($it in @($items)) {
  try {
    if ([IconoShell]::Guardar([string]$it.ruta, [string]$it.archivo, $Tam)) { [Console]::Out.WriteLine("OK`t" + $it.archivo) }
  } catch { }
}
