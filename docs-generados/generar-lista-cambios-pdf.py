# -*- coding: utf-8 -*-
"""Genera PDF de comparación: observaciones del cliente vs cambios implementados."""
from pathlib import Path
from datetime import date

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch, cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable, ListFlowable, ListItem,
)

OUT = Path(__file__).resolve().parent / "Lista-cambios-vs-observaciones-cliente.pdf"

# ── Colores ──────────────────────────────────────────────────────────────────
NAVY = colors.HexColor("#1e3a5f")
BLUE = colors.HexColor("#185FA5")
GREEN = colors.HexColor("#166534")
GREEN_BG = colors.HexColor("#dcfce7")
AMBER = colors.HexColor("#92400e")
AMBER_BG = colors.HexColor("#fef3c7")
RED = colors.HexColor("#991b1b")
RED_BG = colors.HexColor("#fee2e2")
GRAY = colors.HexColor("#64748b")
LIGHT = colors.HexColor("#f1f5f9")
WHITE = colors.white

def styles():
    base = getSampleStyleSheet()
    s = {
        "title": ParagraphStyle(
            "T", parent=base["Title"], fontSize=16, textColor=NAVY,
            spaceAfter=6, leading=20, alignment=TA_CENTER,
        ),
        "sub": ParagraphStyle(
            "S", parent=base["Normal"], fontSize=10, textColor=GRAY,
            alignment=TA_CENTER, spaceAfter=14,
        ),
        "h1": ParagraphStyle(
            "H1", parent=base["Heading1"], fontSize=12, textColor=NAVY,
            spaceBefore=14, spaceAfter=8, leading=15,
        ),
        "h2": ParagraphStyle(
            "H2", parent=base["Heading2"], fontSize=10.5, textColor=BLUE,
            spaceBefore=10, spaceAfter=5, leading=13,
        ),
        "body": ParagraphStyle(
            "B", parent=base["Normal"], fontSize=9, leading=12,
            textColor=colors.HexColor("#0f172a"), alignment=TA_JUSTIFY,
            spaceAfter=4,
        ),
        "small": ParagraphStyle(
            "SM", parent=base["Normal"], fontSize=8, leading=10,
            textColor=GRAY, spaceAfter=3,
        ),
        "cell": ParagraphStyle(
            "C", parent=base["Normal"], fontSize=7.5, leading=9.5,
            textColor=colors.HexColor("#0f172a"),
        ),
        "cellb": ParagraphStyle(
            "CB", parent=base["Normal"], fontSize=7.5, leading=9.5,
            textColor=NAVY, fontName="Helvetica-Bold",
        ),
        "ok": ParagraphStyle(
            "OK", parent=base["Normal"], fontSize=8, leading=10,
            textColor=GREEN, fontName="Helvetica-Bold",
        ),
        "partial": ParagraphStyle(
            "P", parent=base["Normal"], fontSize=8, leading=10,
            textColor=AMBER, fontName="Helvetica-Bold",
        ),
        "pend": ParagraphStyle(
            "PE", parent=base["Normal"], fontSize=8, leading=10,
            textColor=RED, fontName="Helvetica-Bold",
        ),
        "quote": ParagraphStyle(
            "Q", parent=base["Normal"], fontSize=8, leading=11,
            textColor=colors.HexColor("#334155"), leftIndent=8,
            borderPadding=4, spaceAfter=6, spaceBefore=2,
        ),
    }
    return s

def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, letter[1] - 28, letter[0], 28, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(0.75 * inch, letter[1] - 18, "Sistema de Órdenes de Compra — Lista de cambios")
    canvas.drawRightString(letter[0] - 0.75 * inch, letter[1] - 18, "Entrega / revisión con cliente")
    canvas.setFillColor(GRAY)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(0.75 * inch, 0.45 * inch, f"Generado: {date.today().isoformat()}")
    canvas.drawRightString(letter[0] - 0.75 * inch, 0.45 * inch, f"Pág. {doc.page}")
    canvas.setStrokeColor(LIGHT)
    canvas.line(0.75 * inch, 0.6 * inch, letter[0] - 0.75 * inch, 0.6 * inch)
    canvas.restoreState()

def status_para(estado, st):
    e = (estado or "").upper()
    if e in ("HECHO", "OK", "IMPLEMENTADO", "CUBIERTO"):
        return Paragraph("HECHO", st["ok"])
    if e in ("PARCIAL", "PARCIALMENTE"):
        return Paragraph("PARCIAL", st["partial"])
    if e in ("PENDIENTE", "NO", "ABIERTO"):
        return Paragraph("PENDIENTE", st["pend"])
    return Paragraph(estado or "—", st["cell"])

def make_table(headers, rows, col_widths, st):
    data = [[Paragraph(f"<b>{h}</b>", st["cellb"]) for h in headers]]
    for row in rows:
        data.append(row)
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("BACKGROUND", (0, 1), (-1, -1), WHITE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    # Pintar header cells as Paragraphs already navy text via style - fix header bg with white text
    for i, h in enumerate(headers):
        data[0][i] = Paragraph(f'<font color="white"><b>{h}</b></font>', st["cell"])
    return t

def build():
    st = styles()
    story = []

    story.append(Paragraph("Lista de cambios vs observaciones del cliente", st["title"]))
    story.append(Paragraph(
        "Sistema de Órdenes de Compra — Comparativo de implementación<br/>"
        "Fuente: CHANGELOG [Unreleased] + trabajo en sesión + chat WhatsApp (3/8/2026)",
        st["sub"],
    ))
    story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=10))

    # ── 1. Contexto WhatsApp ────────────────────────────────────────────────
    story.append(Paragraph("1. Contexto del chat con el cliente (3/8/2026)", st["h1"]))
    story.append(Paragraph(
        "Extracto de conversación entre <b>Benjamin SR</b> y <b>Araceli (Hilos de Yecapixtla)</b>:",
        st["body"],
    ))
    quotes = [
        ("Benjamin", "¿Ya se puede hacer la entrega de esta versión?"),
        ("Araceli", "Te mandé un correo el viernes pasado con unas observaciones."),
        ("Benjamin", "Sobre el flujo: poder regresar a un estado anterior y cancelarlo en cualquier punto del ciclo de vida."),
        ("Araceli", "Lo que yo veo es que no hay diferencia cuando el usuario lo manda a revisión y cuando me lo entrega a mí. Puede hacer 20 requerimientos y mandarlos a revisión, pero a mí solo me lleguen 15. ¿De qué manera voy a validar que sí llegaron conmigo?"),
        ("Benjamin", "Cuando están en borrador solo ellos pueden editarlos. No es hasta que se entrega que se genera y te llega a ti."),
    ]
    for who, text in quotes:
        story.append(Paragraph(f"<b>{who}:</b> <i>«{text}»</i>", st["quote"]))

    story.append(Paragraph(
        "<b>Interpretación operativa del flujo (estado actual del sistema):</b> "
        "mientras el REQ está en <b>borrador</b>, solo el solicitante lo ve/edita; "
        "al <b>Enviar a revisión</b> pasa a estado <b>en_revisión</b> y Contabilidad/Admin lo ven en el listado "
        "(filtro «En revisión»). No hay un estado intermedio adicional «recibido por Contabilidad»; "
        "la validación de que «llegó» es el conteo de REQs en <b>en_revisión</b> (y el historial de cada REQ).",
        st["body"],
    ))
    story.append(Paragraph(
        "Si el cliente exige un <b>paso de acuse de recibo</b> explícito (Contabilidad marca «recibido»), "
        "eso <b>aún no está modelado</b> como estado aparte — se lista abajo como posible pendiente de negocio.",
        st["body"],
    ))

    # ── 2. Tabla comparativa principal ──────────────────────────────────────
    story.append(Paragraph("2. Comparativo: observación / necesidad vs implementación", st["h1"]))
    story.append(Paragraph(
        "Estado: <font color='#166534'><b>HECHO</b></font> · "
        "<font color='#92400e'><b>PARCIAL</b></font> · "
        "<font color='#991b1b'><b>PENDIENTE</b></font>",
        st["small"],
    ))

    # (id, observacion, implementado, estado)
    items = [
        (
            "1",
            "Regresar a estados anteriores en el ciclo (REQ pre-OC y OC)",
            "REQ: aprobado→revisión; incompleto→revisión/cancelar. OC: regresar generada/distribuida/en proceso; cancelar desde generada.",
            "HECHO",
        ),
        (
            "2",
            "Cancelar en cualquier punto del ciclo (pre-OC en REQ; post-OC en la orden)",
            "Cancelar REQ (rechazado) sin OC; con OC se cancela la orden. Cancelar OC en generada/distribuida/en proceso.",
            "HECHO",
        ),
        (
            "3",
            "Contabilidad/Admin editen áreas y departamentos del catálogo",
            "Menú Administración → Áreas y Departamentos (CRUD + historial). Renombre propaga a REQs.",
            "HECHO",
        ),
        (
            "4",
            "Corregir área/depto en un REQ ya creado (error del solicitante)",
            "Botón «Corregir» en detalle REQ → PATCH /requerimientos/:id/area-departamento (cualquier estado).",
            "HECHO",
        ),
        (
            "5",
            "Filtro por usuario/solicitante en listados",
            "Select «Todos los usuarios» en REQ y OC (solo contabilidad/admin).",
            "HECHO",
        ),
        (
            "6",
            "Ordenar listados por fecha / columnas",
            "Clic en cabeceras con flechas ↑/↓ (fecha, consecutivo, solicitante, estado, etc.).",
            "HECHO",
        ),
        (
            "7",
            "Al generar OC con PO «NA» capturar fecha (cierre/registro)",
            "Fecha obligatoria con PO numérico y con NA; backend valida fecha_po.",
            "HECHO",
        ),
        (
            "8",
            "Tras capturar PO/fecha al generar OC, no saltar a pestaña Órdenes",
            "Permanece en Requerimientos y recarga el detalle del mismo REQ.",
            "HECHO",
        ),
        (
            "9",
            "Export catálogo: respetar filtro de proveedor",
            "Exporta solo lo filtrado (proveedor, tipo, búsqueda, activos).",
            "HECHO",
        ),
        (
            "10",
            "Export REQ: que aparezca proveedor y detalle (no solo tipo servicio)",
            "Proveedor desde OC → cotización → catálogo. Columna «Tipo de servicio» = título + notas + ítems.",
            "HECHO",
        ),
        (
            "11",
            "Historial de REQs no visible (caso Isai Fonseca / nombres Excel)",
            "Reasignación de REQs import → usuario activo; alias Jose Isai Fonseca; matching de import mejorado.",
            "HECHO",
        ),
        (
            "12",
            "Proveedor de servicios con costo: al elegirlo no salían ítems",
            "Al seleccionar proveedor se listan ítems del tipo; fix de escape de costos/descripciones.",
            "HECHO",
        ),
        (
            "13",
            "PARTES sin precio deben poder cotizarse",
            "requiere_cotizacion si falta costo_referencia; panel RFQ y aprobación exigen cotización ganadora.",
            "HECHO",
        ),
        (
            "14",
            "SERVICIOS con ítem de catálogo (reparación) deben poder cotizarse/enviar RFQ",
            "SERVICIOS siempre requieren cotización; botón enviar correo habilitado aunque el ítem esté en catálogo.",
            "HECHO",
        ),
        (
            "15",
            "En correo RFQ deben aparecer números de parte",
            "Correo incluye «No. de parte» (código catálogo / codigo_catalogo) + descripción + cantidad.",
            "HECHO",
        ),
        (
            "16",
            "Nota / último estatus visible (ej. cotización enviada con fecha)",
            "Bloque «Último estatus / nota» en detalle REQ + historial tipo «Nota de estatus».",
            "HECHO",
        ),
        (
            "17",
            "Validar que los REQs «llegaron» a Contabilidad (20 enviados vs 15 recibidos)",
            "Hoy: borrador = solo solicitante; Enviar a revisión = en_revisión visible para Contabilidad. "
            "No hay acuse de recibo ni notificación push. Validación = listado filtrado por «En revisión» + usuario.",
            "PARCIAL",
        ),
        (
            "18",
            "Paso de estado explícito «entregado / recibido por Contabilidad» (si se confirma como requisito)",
            "No implementado como estado nuevo. El flujo usa en_revisión como entrada a Contabilidad.",
            "PENDIENTE",
        ),
    ]

    rows = []
    for num, obs, impl, est in items:
        rows.append([
            Paragraph(num, st["cell"]),
            Paragraph(obs, st["cell"]),
            Paragraph(impl, st["cell"]),
            status_para(est, st),
        ])

    w = letter[0] - 1.5 * inch
    story.append(make_table(
        ["#", "Observación / necesidad del cliente", "Qué se implementó en el sistema", "Estado"],
        rows,
        [0.35 * inch, 2.35 * inch, 3.45 * inch, 0.85 * inch],
        st,
    ))

    # ── 3. Resumen ──────────────────────────────────────────────────────────
    story.append(Paragraph("3. Resumen de cobertura", st["h1"]))
    hechos = sum(1 for *_, e in items if e == "HECHO")
    parciales = sum(1 for *_, e in items if e == "PARCIAL")
    pend = sum(1 for *_, e in items if e == "PENDIENTE")
    story.append(Paragraph(
        f"<b>{hechos}</b> hechos · <b>{parciales}</b> parciales · <b>{pend}</b> pendientes "
        f"(de {len(items)} puntos listados).",
        st["body"],
    ))

    story.append(Paragraph("4. Puntos a validar con el cliente en entrega", st["h1"]))
    story.append(Paragraph(
        "1. <b>Regresiones de estado y cancelaciones</b> — probrar un REQ de punta a punta y una OC "
        "(regresar y cancelar en los puntos permitidos).",
        st["body"],
    ))
    story.append(Paragraph(
        "2. <b>Cotización de servicios y partes sin precio</b> — alta de reparación, RFQ con No. de parte en el correo.",
        st["body"],
    ))
    story.append(Paragraph(
        "3. <b>Export Excel REQ</b> — proveedor y detalle en columna de servicio/descripción.",
        st["body"],
    ))
    story.append(Paragraph(
        "4. <b>Visibilidad Contabilidad</b> — confirmar si basta el filtro «En revisión» o se requiere "
        "acuse de recibo / notificación (punto 17–18).",
        st["body"],
    ))
    story.append(Paragraph(
        "5. <b>Usuarios importados</b> — Isai Fonseca y homólogos ya reasignados en BD local; "
        "en servidor correr vinculación si aún no se hizo.",
        st["body"],
    ))

    story.append(Paragraph("5. Notas técnicas de despliegue", st["h1"]))
    story.append(Paragraph(
        "• Sin migración de esquema crítica (salvo columnas ya automáticas al arranque, p. ej. email de proveedor nullable).<br/>"
        "• Conservar en servidor: <b>.env</b> y <b>backend/uploads/</b>.<br/>"
        "• Empaquetar: <font face='Courier'>powershell -File .\\empaquetar-deploy.ps1</font><br/>"
        "• Reiniciar Node/PM2 tras desplegar.<br/>"
        "• Historial detallado: <b>CHANGELOG.md</b> sección [Unreleased].",
        st["body"],
    ))

    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GRAY, spaceAfter=6))
    story.append(Paragraph(
        "Documento interno de seguimiento para entrega de versión. "
        "No sustituye el correo de observaciones del cliente; lo cruza con el trabajo ya realizado en código.",
        st["small"],
    ))

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=letter,
        leftMargin=0.7 * inch,
        rightMargin=0.7 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.75 * inch,
        title="Lista de cambios vs observaciones del cliente",
        author="Sistema OC / xAI",
    )
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(f"OK: {OUT}")
    return OUT

if __name__ == "__main__":
    build()
