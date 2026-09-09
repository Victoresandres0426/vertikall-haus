// ── Interruptores rápidos de features en desarrollo/ajuste ──
// No borran código ni datos -- solo esconden algo temporalmente hasta
// que se termine de ajustar. Para reactivar, solo cambiar a true.

// "Mi desempeño de la semana" en /mi-obra -- desactivado a pedido de
// Andres (9-sep-2026): por ahora no quiere que los trabajadores vean
// cuánto están cobrando por día mientras se terminan de afinar las
// reglas de pago (destajo, reserva del 10%, horas aditivas, etc.).
// Esto esconde los botones ("Ver mi desempeño...") Y bloquea la propia
// página -- no basta con quitar el botón, porque el link ya se pudo
// haber compartido o guardado.
export const MI_OBRA_DESEMPENO_HABILITADO = false
