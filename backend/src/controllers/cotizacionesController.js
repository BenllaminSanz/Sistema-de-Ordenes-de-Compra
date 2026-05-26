import transporter, { enviarCorreoCotizacion } from '../config/mailer.js';
import { listarPorRequerimiento, crear as _crear, obtenerPorId, actualizar as _actualizar, seleccionar as _seleccionar, eliminar as _eliminar } from '../models/cotizaciones.js';

async function listar(req, res) {
  try {
    res.json(await listarPorRequerimiento(req.params.requerimiento_id));
  } catch (err) {
    console.error('[listar cotizaciones]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function crear(req, res) {
  try {
    const { proveedor_id, monto_total, moneda, archivo_url,
            fecha_envio, fecha_recepcion, notas } = req.body;

    if (!proveedor_id || monto_total === undefined) {
      return res.status(400).json({ mensaje: 'proveedor_id y monto_total son requeridos' });
    }
    if (isNaN(monto_total) || Number(monto_total) < 0) {
      return res.status(400).json({ mensaje: 'monto_total debe ser un número positivo' });
    }
    
    const id = await _crear({
      requerimiento_id: req.params.requerimiento_id,
      proveedor_id, monto_total, moneda,
      archivo_url, fecha_envio, fecha_recepcion, notas,
    });

    const envio = await enviarCorreoCotizacion(req.body.correo, req.body.id);

    // ENVIAR UNA SOLA RESPUESTA Y USAR RETURN
    if (envio.success) {
        return res.status(201).json({ message: "Cotización creada y correo enviado" });
    } else {
        // Si falló el correo, igual devolvemos algo pero detenemos el flujo
        return res.status(201).json({ message: "Cotización creada, pero falló el envío de correo" });
    }

  } catch (err) {
    console.error('[crear cotizacion]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function actualizar(req, res) {
  try {
    const afectados = await _actualizar(req.params.id, req.body);
    if (!afectados) {
      return res.status(404).json({ mensaje: 'Cotización no encontrada o ya fue seleccionada' });
    }
    res.json(await obtenerPorId(req.params.id));
  } catch (err) {
    console.error('[actualizar cotizacion]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function seleccionar(req, res) {
  try {
    await _seleccionar(
      req.params.id,
      req.params.requerimiento_id
    );
    res.json({ mensaje: 'Cotización seleccionada correctamente' });
  } catch (err) {
    console.error('[seleccionar cotizacion]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function eliminar(req, res) {
  try {
    const afectados = await _eliminar(req.params.id);
    if (!afectados) {
      return res.status(404).json({ mensaje: 'Cotización no encontrada o ya fue seleccionada' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('[eliminar cotizacion]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

export { listar, crear, actualizar, seleccionar, eliminar };