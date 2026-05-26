import nodemailer from 'nodemailer';

async function enviarCorreo() {
  // Configuración del transporte SMTP
  let transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false, // TLS
    auth: {
        type: "OAuth2",
        user: "jebesari48@gmail.com",
        clientId: "CLIENT_ID",
        clientSecret: "CLIENT_SECRET",
        refreshToken: "REFRESH_TOKEN",
        accessToken: "ACCESS_TOKEN"
  }
    }
  });

  // Contenido del correo
  let info = await transporter.sendMail({
    from: "jebesari48@gmail.com",
    to: "jebesari48@gmail.com", // puedes enviártelo a ti mismo
    subject: "Prueba automática con SMTP",
    text: "Hola Benjamin, este es un correo de prueba enviado desde Node.js usando Outlook SMTP."
  });

  console.log("Correo enviado:", info.messageId);
}

enviarCorreo().catch(console.error);
