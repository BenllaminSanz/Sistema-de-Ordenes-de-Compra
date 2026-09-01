-- Schema mínimo para tests de integración (ordenes_compra_test)
-- Idempotente: DROP + CREATE

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS recepcion_items;
DROP TABLE IF EXISTS recepciones;
DROP TABLE IF EXISTS historial_estados;
DROP TABLE IF EXISTS ordenes_compra;
DROP TABLE IF EXISTS cotizacion_items;
DROP TABLE IF EXISTS cotizaciones;
DROP TABLE IF EXISTS requerimiento_items_libres;
DROP TABLE IF EXISTS requerimiento_items;
DROP TABLE IF EXISTS requerimientos;
DROP TABLE IF EXISTS catalogo;
DROP TABLE IF EXISTS proveedores;
DROP TABLE IF EXISTS consecutivos_control;
DROP TABLE IF EXISTS unidades_medida;
DROP TABLE IF EXISTS configuracion_smtp;
DROP TABLE IF EXISTS configuracion_app;
DROP TABLE IF EXISTS usuarios;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE usuarios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('solicitante','compras','admin') NOT NULL DEFAULT 'solicitante',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  email_verificado TINYINT(1) NOT NULL DEFAULT 0,
  token_verificacion VARCHAR(128) NULL,
  token_expiracion DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE proveedores (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  num_proveedor VARCHAR(20) NULL,
  nombre VARCHAR(200) NOT NULL,
  email VARCHAR(190) NULL,
  telefono VARCHAR(50) NULL,
  rfc VARCHAR(20) NULL,
  notas TEXT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_prov_num (num_proveedor)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE catalogo (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo ENUM('PARTES','SERVICIOS','FLETES','PRODUCTOS') NOT NULL DEFAULT 'PARTES',
  codigo VARCHAR(100) NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  unidad VARCHAR(50) NULL,
  costo_referencia DECIMAL(14,4) NULL,
  moneda CHAR(3) NOT NULL DEFAULT 'MXN',
  proveedor_id INT UNSIGNED NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_catalogo_codigo (codigo),
  KEY idx_cat_prov (proveedor_id),
  CONSTRAINT fk_cat_prov FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE requerimientos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  consecutivo VARCHAR(40) NULL,
  solicitante_id INT UNSIGNED NOT NULL,
  titulo_solicitud VARCHAR(300) NOT NULL,
  area VARCHAR(120) NULL,
  departamento VARCHAR(120) NULL,
  tipo ENUM('PARTES','SERVICIOS','FLETES') NULL,
  notas TEXT NULL,
  requiere_cotizacion TINYINT(1) NOT NULL DEFAULT 0,
  estado ENUM(
    'borrador','en_revision','recibido','aprobado','incompleto','rechazado','cerrado'
  ) NOT NULL DEFAULT 'borrador',
  datatextnow_id VARCHAR(80) NULL,
  notas_rechazo TEXT NULL,
  orden_compra_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_req_sol (solicitante_id),
  KEY idx_req_estado (estado),
  CONSTRAINT fk_req_sol FOREIGN KEY (solicitante_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE requerimiento_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  requerimiento_id INT UNSIGNED NOT NULL,
  catalogo_id INT UNSIGNED NOT NULL,
  cantidad DECIMAL(14,3) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_ri_req (requerimiento_id),
  KEY idx_ri_cat (catalogo_id),
  CONSTRAINT fk_ri_req FOREIGN KEY (requerimiento_id) REFERENCES requerimientos(id) ON DELETE CASCADE,
  CONSTRAINT fk_ri_cat FOREIGN KEY (catalogo_id) REFERENCES catalogo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE requerimiento_items_libres (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  requerimiento_id INT UNSIGNED NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  cantidad DECIMAL(14,3) NOT NULL DEFAULT 1,
  unidad VARCHAR(50) NULL,
  notas TEXT NULL,
  referencia_tipo ENUM('link','archivo') NULL,
  referencia_url VARCHAR(500) NULL,
  referencia_nombre VARCHAR(255) NULL,
  catalogo_asignado_id INT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_ril_req (requerimiento_id),
  CONSTRAINT fk_ril_req FOREIGN KEY (requerimiento_id) REFERENCES requerimientos(id) ON DELETE CASCADE,
  CONSTRAINT fk_ril_cat FOREIGN KEY (catalogo_asignado_id) REFERENCES catalogo(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cotizaciones (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  requerimiento_id INT UNSIGNED NOT NULL,
  proveedor_id INT UNSIGNED NOT NULL,
  monto_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  monto_subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  iva DECIMAL(14,2) NOT NULL DEFAULT 0,
  moneda CHAR(3) NOT NULL DEFAULT 'MXN',
  archivo_url VARCHAR(500) NULL,
  fecha_envio DATETIME NULL,
  scheduled_at DATETIME NULL,
  email_sent_at DATETIME NULL,
  idioma_correo VARCHAR(5) NOT NULL DEFAULT 'es',
  notas TEXT NULL,
  estado VARCHAR(40) NOT NULL DEFAULT 'en_revision',
  seleccionada TINYINT(1) NOT NULL DEFAULT 0,
  fecha_seleccion DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cot_req (requerimiento_id),
  CONSTRAINT fk_cot_req FOREIGN KEY (requerimiento_id) REFERENCES requerimientos(id) ON DELETE CASCADE,
  CONSTRAINT fk_cot_prov FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cotizacion_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cotizacion_id INT UNSIGNED NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  codigo_catalogo VARCHAR(100) NULL,
  catalogo_id INT UNSIGNED NULL,
  cantidad DECIMAL(14,3) NOT NULL DEFAULT 1,
  unidad VARCHAR(50) NULL,
  precio_unitario DECIMAL(14,4) NOT NULL DEFAULT 0,
  notas_item TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_ci_cot (cotizacion_id),
  CONSTRAINT fk_ci_cot FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_ci_cat FOREIGN KEY (catalogo_id) REFERENCES catalogo(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ordenes_compra (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  numero_oc VARCHAR(60) NOT NULL,
  requerimiento_id INT UNSIGNED NOT NULL,
  cotizacion_id INT UNSIGNED NULL,
  proveedor_id INT UNSIGNED NULL,
  monto_total DECIMAL(14,2) NULL,
  moneda CHAR(3) NOT NULL DEFAULT 'MXN',
  autorizado_por INT UNSIGNED NOT NULL,
  estado ENUM(
    'generada','distribuida','en_proceso','recibida','cerrada','cancelada'
  ) NOT NULL DEFAULT 'generada',
  fecha_autorizacion DATETIME NULL,
  datatextnow_id VARCHAR(80) NULL,
  fecha_po DATE NULL,
  notas TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_oc_numero (numero_oc),
  KEY idx_oc_req (requerimiento_id),
  CONSTRAINT fk_oc_req FOREIGN KEY (requerimiento_id) REFERENCES requerimientos(id),
  CONSTRAINT fk_oc_auth FOREIGN KEY (autorizado_por) REFERENCES usuarios(id),
  CONSTRAINT fk_oc_cot FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_oc_prov FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE recepciones (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  orden_compra_id INT UNSIGNED NOT NULL,
  recibido_por INT UNSIGNED NOT NULL,
  estado ENUM('recibido_parcial','recibido_completo') NOT NULL DEFAULT 'recibido_completo',
  notas TEXT NULL,
  datatextnow_id VARCHAR(80) NULL,
  fecha_recepcion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rec_oc (orden_compra_id),
  CONSTRAINT fk_rec_oc FOREIGN KEY (orden_compra_id) REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  CONSTRAINT fk_rec_user FOREIGN KEY (recibido_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE recepcion_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  recepcion_id INT UNSIGNED NOT NULL,
  item_key VARCHAR(64) NOT NULL,
  descripcion VARCHAR(500) NULL,
  codigo VARCHAR(100) NULL,
  cantidad_solicitada DECIMAL(14,3) NOT NULL DEFAULT 0,
  cantidad_recibida DECIMAL(14,3) NOT NULL DEFAULT 0,
  unidad VARCHAR(50) NULL,
  numero_recibo VARCHAR(80) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_recepcion_items_rec (recepcion_id),
  CONSTRAINT fk_recepcion_items_rec FOREIGN KEY (recepcion_id)
    REFERENCES recepciones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE historial_estados (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  entidad_tipo VARCHAR(40) NOT NULL,
  entidad_id INT UNSIGNED NOT NULL,
  estado_anterior VARCHAR(40) NULL,
  estado_nuevo VARCHAR(40) NOT NULL,
  cambiado_por INT UNSIGNED NULL,
  notas TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hist_ent (entidad_tipo, entidad_id),
  CONSTRAINT fk_hist_user FOREIGN KEY (cambiado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE consecutivos_control (
  anio INT NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  ultimo_numero INT NOT NULL DEFAULT 0,
  PRIMARY KEY (anio, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE unidades_medida (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL,
  nombre VARCHAR(80) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_unidad_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE configuracion_app (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  frontend_url VARCHAR(255) NULL,
  notif_req_revision TINYINT(1) NOT NULL DEFAULT 1,
  email_notif_compras VARCHAR(500) NULL,
  notif_roles VARCHAR(80) NOT NULL DEFAULT 'compras,admin',
  reporte_diario TINYINT(1) NOT NULL DEFAULT 1,
  reporte_diario_dias VARCHAR(32) NOT NULL DEFAULT '1,2,3,4,5',
  reporte_diario_ultimo DATE NULL,
  purga_borradores TINYINT(1) NOT NULL DEFAULT 1,
  purga_borradores_ultimo DATE NULL,
  updated_by INT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO configuracion_app (id, notif_req_revision) VALUES (1, 1);

CREATE TABLE configuracion_smtp (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  host VARCHAR(200) NOT NULL,
  port INT NOT NULL DEFAULT 587,
  secure TINYINT(1) NOT NULL DEFAULT 0,
  user VARCHAR(200) NOT NULL,
  pass_encrypted TEXT NULL,
  from_name VARCHAR(200) NULL,
  from_email VARCHAR(200) NULL,
  cc_cotizaciones VARCHAR(500) NULL,
  tls_ciphers VARCHAR(80) NULL,
  reject_unauthorized TINYINT(1) NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  updated_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
