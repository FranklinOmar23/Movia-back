const nodemailer = require('nodemailer');

const emailPort = parseInt(process.env.EMAIL_PORT, 10);

const emailSecure =
  process.env.EMAIL_SECURE === 'true' || emailPort === 465;

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: emailPort,
  secure: emailSecure,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

transporter
  .verify()
  .then(() => {
    console.log('✅ Email transporter conectado correctamente.');
  })
  .catch((err) => {
    console.error(
      '❌ Error al verificar transporte de correo:',
      err.message || err
    );
  });

async function sendEmail({ to, subject, html }) {
  const mailOptions = {
    from: `"MOVIA" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  };

  try {
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('❌ Error enviando correo:', error.message || error);
    throw error;
  }
}

/* =========================================================
   TEMPLATE BASE MOVIA
========================================================= */

function emailTemplate({
  title,
  subtitle,
  content,
  buttonText,
  buttonLink,
  accent = '#9b6dff',
}) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        background: #090511;
        font-family: 'Segoe UI', Arial, sans-serif;
        color: #ffffff;
        padding: 20px;
      }

      .wrapper {
        width: 100%;
        padding: 30px 0;
      }

      .container {
        max-width: 620px;
        margin: auto;
        background: #120d1d;
        border-radius: 28px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.05);
        box-shadow: 0 0 50px rgba(0,0,0,0.5);
      }

      .header {
        padding: 60px 35px 45px;
        text-align: center;
        background:
          linear-gradient(
            180deg,
            rgba(155,109,255,0.18) 0%,
            rgba(18,13,29,1) 100%
          );
      }

      .logo {
        font-size: 42px;
        font-weight: 800;
        color: #b78cff;
        letter-spacing: 1px;
      }

      .logo-subtitle {
        color: #8f8aa7;
        margin-top: 8px;
        font-size: 13px;
        letter-spacing: 4px;
      }

      .hero-title {
        margin-top: 30px;
        font-size: 30px;
        font-weight: 700;
        color: #ffffff;
      }

      .hero-subtitle {
        margin-top: 12px;
        color: #b8b5c7;
        font-size: 15px;
        line-height: 1.7;
      }

      .content {
        padding: 35px;
      }

      .card {
        background: #181225;
        border-radius: 22px;
        padding: 24px;
        margin: 25px 0;
        border: 1px solid rgba(255,255,255,0.05);
      }

      .card h3 {
        margin-bottom: 16px;
        color: white;
        font-size: 20px;
      }

      .card p {
        color: #d2cfe1;
        margin-bottom: 12px;
        line-height: 1.7;
      }

      .price {
        color: ${accent};
        font-size: 34px;
        font-weight: 800;
      }

      .button-wrapper {
        text-align: center;
        margin: 35px 0;
      }

      .btn {
        display: inline-block;
        background: linear-gradient(
          135deg,
          ${accent} 0%,
          #7b4dff 100%
        );
        color: #ffffff !important;
        text-decoration: none;
        padding: 16px 38px;
        border-radius: 999px;
        font-weight: 700;
        font-size: 15px;
      }

      .info-box {
        background: rgba(155,109,255,0.08);
        border-left: 4px solid ${accent};
        padding: 18px;
        border-radius: 14px;
        margin-top: 25px;
      }

      .info-box p {
        margin: 0;
        color: #cfcfe7;
      }

      .link-box {
        margin-top: 25px;
        padding: 16px;
        border-radius: 14px;
        background: #0e0918;
        word-break: break-all;
        font-size: 12px;
        color: #b58cff;
      }

      .link-box a {
        color: #b58cff;
        text-decoration: none;
      }

      .footer {
        text-align: center;
        padding: 30px;
        border-top: 1px solid rgba(255,255,255,0.05);
      }

      .footer p {
        color: #7f7b95;
        font-size: 12px;
        margin-bottom: 8px;
      }

      ul {
        padding-left: 18px;
        margin-top: 10px;
      }

      li {
        color: #d2cfe1;
        margin-bottom: 10px;
      }

      strong {
        color: #ffffff;
      }
    </style>
  </head>

  <body>
    <div class="wrapper">
      <div class="container">

        <div class="header">
          <div class="logo">MOVIA</div>

          <div class="logo-subtitle">
            MOVIES & SERIES
          </div>

          <div class="hero-title">
            ${title}
          </div>

          <div class="hero-subtitle">
            ${subtitle}
          </div>
        </div>

        <div class="content">
          ${content}

          ${
            buttonText && buttonLink
              ? `
            <div class="button-wrapper">
              <a href="${buttonLink}" class="btn">
                ${buttonText}
              </a>
            </div>
          `
              : ''
          }

          ${
            buttonLink
              ? `
            <div class="link-box">
              <strong>🔗 Si el botón no funciona:</strong>
              <br /><br />
              <a href="${buttonLink}">
                ${buttonLink}
              </a>
            </div>
          `
              : ''
          }
        </div>

        <div class="footer">
          <p>© 2026 MOVIA - Todos los derechos reservados</p>
          <p>Este es un correo automático, por favor no responder.</p>
        </div>

      </div>
    </div>
  </body>
  </html>
  `;
}

/* =========================================================
   PAYMENT LINK EMAIL
========================================================= */

async function sendPaymentLinkEmail(
  email,
  username,
  paymentLink,
  planName,
  price,
  currency
) {
  const subject =
    '💳 Completa tu pago - Suscripción MOVIA';

  const html = emailTemplate({
    title: 'Completa tu pago',
    subtitle:
      'Activa tu suscripción y comienza a disfrutar MOVIA.',
    buttonText: '💳 Proceder al pago',
    buttonLink: paymentLink,

    content: `
      <h2 style="margin-bottom:20px;">
        Hola ${username} 👋
      </h2>

      <p style="color:#cfcfe7;">
        Tu cuenta está casi lista.
        Solo falta completar el pago para activar tu suscripción.
      </p>

      <div class="card">
        <h3>📦 Detalles del plan</h3>

        <p><strong>Plan:</strong> ${planName}</p>

        <p>
          <strong>Precio:</strong>
          <span class="price">${price} ${currency}</span>
        </p>

        <p><strong>Facturación:</strong> Mensual</p>

        <p>
          Acceso ilimitado a películas, series
          y contenido exclusivo en HD.
        </p>
      </div>

      <div class="info-box">
        <p>
          ⚠️ El enlace expirará en 24 horas.
        </p>
      </div>
    `,
  });

  return sendEmail({
    to: email,
    subject,
    html,
  });
}

/* =========================================================
   SUCCESS PAYMENT
========================================================= */

async function sendPaymentSuccessEmail(
  email,
  username,
  planName,
  price,
  nextBillingDate
) {
  const subject =
    '🎉 Tu suscripción MOVIA está activa';

  const formattedDate = nextBillingDate
    ? new Date(nextBillingDate).toLocaleDateString(
        'es-DO'
      )
    : 'en 30 días';

  const html = emailTemplate({
    title: '¡Pago Confirmado!',
    subtitle:
      'Tu suscripción ya está activa.',
    buttonText: '🎬 Comenzar a ver',
    buttonLink: `${
      process.env.FRONTEND_URL ||
      'https://movia.arcodedominicana.com'
    }/dashboard`,

    content: `
      <h2 style="margin-bottom:20px;">
        Gracias ${username} ✅
      </h2>

      <p style="color:#cfcfe7;">
        Tu pago fue procesado exitosamente.
      </p>

      <div class="card">
        <h3>📋 Resumen</h3>

        <p><strong>Plan:</strong> ${planName}</p>

        <p>
          <strong>Monto pagado:</strong>
          <span class="price">${price} DOP</span>
        </p>

        <p><strong>Estado:</strong> Activo</p>

        <p>
          <strong>Próxima facturación:</strong>
          ${formattedDate}
        </p>
      </div>

      <div class="info-box">
        <p>
          🎬 Ya puedes disfrutar de todo
          el catálogo de MOVIA.
        </p>
      </div>
    `,
  });

  return sendEmail({
    to: email,
    subject,
    html,
  });
}

/* =========================================================
   FAILED PAYMENT
========================================================= */

async function sendChargeFailedEmail(
  email,
  username,
  amount
) {
  const subject =
    '⚠️ Problema con tu pago - MOVIA';

  const paymentUrl = `${
    process.env.FRONTEND_URL ||
    'https://movia.arcodedominicana.com'
  }/payment-methods`;

  const html = emailTemplate({
    title: 'Pago Fallido',
    subtitle:
      'No pudimos procesar tu pago.',
    buttonText: '💳 Actualizar método de pago',
    buttonLink: paymentUrl,
    accent: '#ff5f7a',

    content: `
      <h2 style="margin-bottom:20px;">
        Hola ${username}
      </h2>

      <p style="color:#cfcfe7;">
        El cobro de ${amount} no pudo ser procesado.
      </p>

      <div class="card">
        <h3>⚠️ Posibles causas</h3>

        <ul>
          <li>Tarjeta sin fondos</li>
          <li>Método vencido</li>
          <li>Problema con PayPal</li>
          <li>Banco rechazó el cobro</li>
        </ul>
      </div>

      <div class="info-box">
        <p>
          Actualiza tu método de pago
          para evitar interrupciones.
        </p>
      </div>
    `,
  });

  return sendEmail({
    to: email,
    subject,
    html,
  });
}

/* =========================================================
   REMINDER EMAIL
========================================================= */

async function sendPaymentReminderEmail(
  email,
  username,
  paymentLink,
  planName,
  price,
  currency
) {
  const subject =
    '⏰ Tu cuenta MOVIA aún no está activa';

  const html = emailTemplate({
    title: 'Activa tu cuenta',
    subtitle:
      'Tu suscripción está esperando por ti.',
    buttonText: '🚀 Activar cuenta',
    buttonLink: paymentLink,
    accent: '#ff7b72',

    content: `
      <h2 style="margin-bottom:20px;">
        Hola ${username} 👋
      </h2>

      <p style="color:#cfcfe7;">
        Notamos que aún no has completado
        tu pago.
      </p>

      <div class="card">
        <h3>📦 Plan pendiente</h3>

        <p><strong>Plan:</strong> ${planName}</p>

        <p>
          <strong>Precio:</strong>
          <span class="price">
            ${price} ${currency}
          </span>
        </p>

        <p>
          Acceso ilimitado y sin publicidad.
        </p>
      </div>

      <div class="info-box">
        <p>
          ⚠️ Si el enlace expiró,
          solicita uno nuevo.
        </p>
      </div>
    `,
  });

  return sendEmail({
    to: email,
    subject,
    html,
  });
}

/* =========================================================
   WELCOME EMAIL
========================================================= */

async function sendWelcomeEmail(
  email,
  username,
  paymentLink,
  planName,
  price,
  currency
) {
  const subject =
    '🎬 Bienvenido a MOVIA';

  const html = emailTemplate({
    title: 'Tu cuenta está lista',
    subtitle:
      'Solo falta activar tu suscripción.',
    buttonText: '💳 Activar suscripción',
    buttonLink: paymentLink,

    content: `
      <h2 style="margin-bottom:20px;">
        Bienvenido ${username} 🎉
      </h2>

      <p style="color:#cfcfe7;">
        Gracias por registrarte en MOVIA.
      </p>

      <div class="card">
        <h3>📦 Plan seleccionado</h3>

        <p><strong>Plan:</strong> ${planName}</p>

        <p>
          <strong>Precio:</strong>
          <span class="price">
            ${price} ${currency}
          </span>
        </p>

        <p>
          Acceso ilimitado a todo el contenido.
        </p>
      </div>

      <div class="info-box">
        <p>
          🚀 Completa tu pago y comienza
          a disfrutar MOVIA.
        </p>
      </div>
    `,
  });

  return sendEmail({
    to: email,
    subject,
    html,
  });
}

/* =========================================================
   STRIPE SETUP EMAIL
========================================================= */

async function sendPaymentSetupEmail(
  email,
  username,
  subscriptionName,
  price,
  nextPaymentDate,
  sessionUrl
) {
  const subject =
    '💳 Configura tu método de pago';

  const html = emailTemplate({
    title: 'Configura tu tarjeta',
    subtitle:
      'Activa el cobro automático de tu suscripción.',
    buttonText: '💳 Registrar tarjeta',
    buttonLink: sessionUrl,

    content: `
      <h2 style="margin-bottom:20px;">
        Hola ${username}
      </h2>

      <p style="color:#cfcfe7;">
        Tu cuenta fue creada exitosamente.
      </p>

      <div class="card">
        <h3>📋 Suscripción</h3>

        <p>
          <strong>Plan:</strong>
          ${subscriptionName}
        </p>

        <p>
          <strong>Precio:</strong>
          <span class="price">$${price}</span>
        </p>

        <p>
          <strong>Próximo pago:</strong>
          ${nextPaymentDate}
        </p>
      </div>

      <div class="info-box">
        <p>
          🔒 Tus pagos son procesados
          de forma segura.
        </p>
      </div>
    `,
  });

  return sendEmail({
    to: email,
    subject,
    html,
  });
}

/* =========================================================
   CHARGE SUCCESS
========================================================= */

async function sendChargeSuccessEmail(
  email,
  username,
  amount,
  nextDate
) {
  const subject =
    '✅ Pago procesado correctamente';

  const html = emailTemplate({
    title: 'Pago realizado',
    subtitle:
      'Tu suscripción sigue activa.',

    content: `
      <h2 style="margin-bottom:20px;">
        Hola ${username}
      </h2>

      <div class="card">
        <h3>💳 Cobro exitoso</h3>

        <p>
          <strong>Monto:</strong>
          <span class="price">$${amount}</span>
        </p>

        <p>
          <strong>Próximo pago:</strong>
          ${nextDate}
        </p>
      </div>

      <div class="info-box">
        <p>
          🎬 Gracias por seguir siendo
          parte de MOVIA.
        </p>
      </div>
    `,
  });

  return sendEmail({
    to: email,
    subject,
    html,
  });
}

module.exports = {
  sendEmail,
  sendPaymentLinkEmail,
  sendWelcomeEmail,
  sendPaymentSetupEmail,
  sendPaymentSuccessEmail,
  sendChargeSuccessEmail,
  sendChargeFailedEmail,
  sendPaymentReminderEmail,
};