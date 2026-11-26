// Escritor mínimo de ZIP (sin compresión, método "store") -- sin dependencias.
// Las fotos/PDF ya vienen comprimidos, así que no se pierde casi nada.

const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(b: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export type EntradaZip = { nombre: string; datos: Uint8Array }

export function crearZip(entradas: EntradaZip[]): Blob {
  const enc = new TextEncoder()
  const ahora = new Date()
  const dosHora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1)
  const dosFecha = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate()

  const partes: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const e of entradas) {
    const nombre = enc.encode(e.nombre)
    const crc = crc32(e.datos)
    const size = e.datos.length

    const lh = new Uint8Array(30 + nombre.length)
    const v = new DataView(lh.buffer)
    v.setUint32(0, 0x04034b50, true)
    v.setUint16(4, 20, true)
    v.setUint16(6, 0x0800, true) // nombres en UTF-8
    v.setUint16(8, 0, true)
    v.setUint16(10, dosHora, true)
    v.setUint16(12, dosFecha, true)
    v.setUint32(14, crc, true)
    v.setUint32(18, size, true)
    v.setUint32(22, size, true)
    v.setUint16(26, nombre.length, true)
    v.setUint16(28, 0, true)
    lh.set(nombre, 30)

    const ch = new Uint8Array(46 + nombre.length)
    const c = new DataView(ch.buffer)
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true)
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(10, 0, true)
    c.setUint16(12, dosHora, true)
    c.setUint16(14, dosFecha, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, size, true)
    c.setUint32(24, size, true)
    c.setUint16(28, nombre.length, true)
    c.setUint32(42, offset, true)
    ch.set(nombre, 46)

    partes.push(lh, e.datos)
    central.push(ch)
    offset += lh.length + size
  }

  const tamCentral = central.reduce((s, x) => s + x.length, 0)
  const fin = new Uint8Array(22)
  const f = new DataView(fin.buffer)
  f.setUint32(0, 0x06054b50, true)
  f.setUint16(8, entradas.length, true)
  f.setUint16(10, entradas.length, true)
  f.setUint32(12, tamCentral, true)
  f.setUint32(16, offset, true)

  return new Blob([...partes, ...central, fin] as BlobPart[], { type: "application/zip" })
}
