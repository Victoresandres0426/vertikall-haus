-- ============================================================
-- 100 — Agregar 'aprobada' al enum estado_factura
-- ============================================================
-- La migración 099 asumía que "estado" en facturas_cliente era TEXT
-- libre (así es en otras tablas de este proyecto), pero en realidad
-- es un ENUM (estado_factura) con una lista fija de valores válidos.
-- Por eso falló: "invalid input value for enum estado_factura:
-- aprobada" -- el valor nuevo no existía en el tipo.
--
-- IMPORTANTE: esta migración debe correrse SOLA, en su propio Run,
-- ANTES de (re)correr la 099. Postgres no permite usar un valor de
-- enum recién agregado dentro de la misma transacción en la que se
-- agregó (para funciones, políticas RLS, etc.) -- así que si pegas
-- este archivo y la 099 juntos en un solo Run, va a volver a fallar.
-- Corre este archivo primero, espera a que diga éxito, y LUEGO corre
-- (o re-corre) la 099 en un Run aparte.
-- ============================================================

ALTER TYPE estado_factura ADD VALUE IF NOT EXISTS 'aprobada';
