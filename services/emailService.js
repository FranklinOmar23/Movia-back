const nodemailer = require('nodemailer');

const emailPort = parseInt(process.env.EMAIL_PORT, 10);
const emailSecure = process.env.EMAIL_SECURE === 'true' || emailPort === 465;

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

transporter.verify().then(() => {
  console.log('✅ Email transporter conectado correctamente.');
}).catch((err) => {
  console.error('❌ Error al verificar transporte de correo:', err.message || err);
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

async function sendPaymentSetupEmail(email, username, subscriptionName, price, nextPaymentDate, sessionUrl) {
  const html = `
    <h2>Hola ${username}</h2>
    <p>Tu cuenta en MOVIA ha sido creada. Para activar tu suscripción <strong>${subscriptionName}</strong> ($${price}), 
    registra tu tarjeta en el siguiente enlace:</p>
    <a href="${sessionUrl}">Registrar tarjeta</a>
    <p>Tu próxima fecha de pago: ${nextPaymentDate}</p>
  `;
  return sendEmail({ to: email, subject: 'Completa tu registro de pago - MOVIA', html });
}

async function sendChargeSuccessEmail(email, username, amount, nextDate) {
  const html = `
    <h2>Hola ${username}</h2>
    <p>Se ha realizado un cobro de <strong>$${amount}</strong> a tu tarjeta por tu suscripción MOVIA.</p>
    <p>Próximo pago programado: ${nextDate}</p>
  `;
  return sendEmail({ to: email, subject: 'Pago procesado - MOVIA', html });
}

async function sendChargeFailedEmail(email, username, amount) {
  const html = `
    <h2>Hola ${username}</h2>
    <p>El cobro de <strong>$${amount}</strong> no pudo ser procesado.</p>
    <p>Por favor actualiza tu método de pago para continuar disfrutando MOVIA.</p>
  `;
  return sendEmail({ to: email, subject: 'Problema con tu pago - MOVIA', html });
}

module.exports = { sendPaymentSetupEmail, sendChargeSuccessEmail, sendChargeFailedEmail };