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

/**
 * Enviar correo con link de pago de PayPal
 * @param {string} email - Correo del usuario
 * @param {string} username - Nombre del usuario
 * @param {string} paymentLink - Link de pago de PayPal
 * @param {string} planName - Nombre del plan
 * @param {number|string} price - Precio del plan
 * @param {string} currency - Moneda (DOP, USD, etc)
 */
async function sendPaymentLinkEmail(email, username, paymentLink, planName, price, currency) {
  const subject = '💳 Completa tu pago - Suscripción MOVIA';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pago MOVIA</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px 0; background: #1a1a2e; color: white; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .plan-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .price { font-size: 24px; font-weight: bold; color: #0070ba; }
        .btn { 
          display: inline-block; 
          background: #0070ba; 
          color: white; 
          padding: 14px 35px; 
          text-decoration: none; 
          border-radius: 25px; 
          font-weight: bold;
          margin: 20px 0;
          transition: background 0.3s;
        }
        .btn:hover { background: #005c9e; }
        .link { word-break: break-all; color: #0070ba; font-size: 12px; margin-top: 20px; padding: 10px; background: #eee; border-radius: 5px; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        hr { margin: 20px 0; border: none; border-top: 1px solid #ddd; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎬 MOVIA</h1>
          <p>Tu plataforma de streaming favorita</p>
        </div>
        <div class="content">
          <h2>¡Hola ${username}!</h2>
          
          <p>Has solicitado una suscripción al plan <strong>${planName}</strong>. Para activar tu cuenta y comenzar a disfrutar de todo nuestro contenido, necesitamos que completes el proceso de pago.</p>
          
          <div class="plan-details">
            <h3>📋 Detalles de tu suscripción:</h3>
            <p><strong>Plan:</strong> ${planName}</p>
            <p><strong>Monto a pagar:</strong> <span class="price">${price} ${currency}</span></p>
            <p><strong>Ciclo de facturación:</strong> Mensual</p>
            <p><strong>Beneficios:</strong> Acceso ilimitado a todo el contenido, sin publicidad, calidad HD.</p>
          </div>
          
          <div style="text-align: center;">
            <a href="${paymentLink}" class="btn">💰 Proceder al pago con PayPal</a>
          </div>
          
          <p>Al hacer clic en el botón, serás redirigido a PayPal donde podrás completar tu pago de forma segura. Una vez realizado el pago, tu suscripción se activará automáticamente.</p>
          
          <div class="link">
            <strong>🔗 Si el botón no funciona, copia y pega este enlace en tu navegador:</strong><br>
            <a href="${paymentLink}" style="color:#0070ba;">${paymentLink}</a>
          </div>
          
          <hr>
          
          <p><strong>⚠️ Importante:</strong></p>
          <ul>
            <li>El enlace de pago expirará después de 24 horas.</li>
            <li>Si no completas el pago, tu suscripción no será activada.</li>
            <li>¿Problemas con el pago? Contacta a nuestro soporte: <a href="mailto:movia@arcodedominicana.com">movia@arcodedominicana.com</a></li>
          </ul>
        </div>
        <div class="footer">
          <p>© 2024 MOVIA - Todos los derechos reservados</p>
          <p>Este es un correo automático, por favor no responder a este mensaje.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return sendEmail({ to: email, subject, html });
}

/**
 * Enviar correo de confirmación de pago exitoso
 * @param {string} email - Correo del usuario
 * @param {string} username - Nombre del usuario
 * @param {number|string} amount - Monto cobrado
 * @param {string} nextDate - Próxima fecha de pago
 */
async function sendChargeSuccessEmail(email, username, amount, nextDate) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pago exitoso - MOVIA</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .amount { font-size: 28px; font-weight: bold; color: #4CAF50; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>✅ ¡Pago confirmado!</h2>
        </div>
        <div class="content">
          <h2>Hola ${username}</h2>
          <p>Se ha realizado un cobro de <strong class="amount">$${amount}</strong> a tu método de pago por tu suscripción MOVIA.</p>
          <p>📅 <strong>Próximo pago programado:</strong> ${nextDate}</p>
          <p>🎬 ¡Sigue disfrutando de todo el contenido de MOVIA!</p>
          <hr>
          <p style="font-size: 12px; color: #666;">Si tienes alguna duda, contáctanos a movia@arcodedominicana.com</p>
        </div>
        <div class="footer">
          <p>© 2024 MOVIA - Todos los derechos reservados</p>
        </div>
      </div>
    </body>
    </html>
  `;
  return sendEmail({ to: email, subject: '✅ Pago procesado - MOVIA', html });
}

/**
 * Enviar correo de pago fallido
 * @param {string} email - Correo del usuario
 * @param {string} username - Nombre del usuario
 * @param {number|string} amount - Monto que falló
 */
async function sendChargeFailedEmail(email, username, amount) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pago fallido - MOVIA</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f44336; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .btn { background: #0070ba; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>⚠️ Problema con tu pago</h2>
        </div>
        <div class="content">
          <h2>Hola ${username}</h2>
          <p>El cobro de <strong>$${amount}</strong> no pudo ser procesado correctamente.</p>
          <p><strong>Posibles causas:</strong></p>
          <ul>
            <li>Tarjeta vencida o sin fondos</li>
            <li>Problemas con PayPal</li>
            <li>Método de pago desactualizado</li>
          </ul>
          <p>Por favor, inicia sesión en tu cuenta y actualiza tu método de pago para continuar disfrutando de MOVIA.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'https://movia.arcodedominicana.com'}/payment-methods" class="btn">Actualizar método de pago</a>
          </div>
          <hr>
          <p style="font-size: 12px; color: #666;">Si el problema persiste, contacta a movia@arcodedominicana.com</p>
        </div>
        <div class="footer">
          <p>© 2024 MOVIA - Todos los derechos reservados</p>
        </div>
      </div>
    </body>
    </html>
  `;
  return sendEmail({ to: email, subject: '⚠️ Problema con tu pago - MOVIA', html });
}

async function sendPaymentSuccessEmail(email, username, planName, price, nextBillingDate) {
  const subject = '🎉 ¡Pago confirmado! Tu suscripción MOVIA está activa';
  
  const formattedDate = nextBillingDate ? new Date(nextBillingDate).toLocaleDateString('es-DO') : 'en 30 días';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Suscripción Activada - MOVIA</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 30px 0; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .success-icon { font-size: 64px; text-align: center; margin: 20px 0; }
        .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .price { font-size: 28px; font-weight: bold; color: #4CAF50; }
        .btn { 
          display: inline-block; 
          background: #667eea; 
          color: white; 
          padding: 12px 30px; 
          text-decoration: none; 
          border-radius: 25px; 
          font-weight: bold;
          margin: 20px 0;
        }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎬 MOVIA</h1>
          <p>¡Suscripción Activada!</p>
        </div>
        <div class="content">
          <div class="success-icon">✅</div>
          
          <h2>¡Gracias ${username}!</h2>
          
          <p>Tu pago ha sido procesado exitosamente y tu suscripción ya está activa.</p>
          
          <div class="details">
            <h3>📋 Detalles de tu suscripción:</h3>
            <p><strong>Plan:</strong> ${planName}</p>
            <p><strong>Monto pagado:</strong> <span class="price">$${price} DOP</span></p>
            <p><strong>Estado:</strong> Activo ✓</p>
            <p><strong>Próxima facturación:</strong> ${formattedDate}</p>
          </div>
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'https://movia.arcodedominicana.com'}/dashboard" class="btn">🎬 Comenzar a Ver</a>
          </div>
          
          <p>Ya puedes disfrutar de todo el contenido de MOVIA. ¡Bienvenido a bordo!</p>
          
          <hr>
          
          <p style="font-size: 12px; color: #666;">
            ¿Tienes preguntas? Contáctanos a movia@arcodedominicana.com<br>
            © 2024 MOVIA - Todos los derechos reservados
          </p>
        </div>
        <div class="footer">
          <p>Este es un correo automático, por favor no responder a este mensaje.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return sendEmail({ to: email, subject, html });
}

/**
 * Enviar correo con el enlace para registrar tarjeta (Stripe)
 * @param {string} email - Correo del usuario
 * @param {string} username - Nombre del usuario
 * @param {string} subscriptionName - Nombre de la suscripción
 * @param {number|string} price - Precio
 * @param {string} nextPaymentDate - Próxima fecha de pago
 * @param {string} sessionUrl - URL de Stripe
 */
async function sendPaymentSetupEmail(email, username, subscriptionName, price, nextPaymentDate, sessionUrl) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Registra tu método de pago - MOVIA</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1a1a2e; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .btn { background: #635bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>🎬 Bienvenido a MOVIA</h2>
        </div>
        <div class="content">
          <h2>Hola ${username}</h2>
          <p>Tu cuenta en MOVIA ha sido creada exitosamente.</p>
          <p>Para activar tu suscripción <strong>${subscriptionName}</strong> ($${price}), necesitas registrar tu método de pago.</p>
          <p><strong>📅 Próxima fecha de pago:</strong> ${nextPaymentDate}</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${sessionUrl}" class="btn">💳 Registrar tarjeta</a>
          </div>
          <p>Al registrar tu tarjeta, autorizas el cobro automático de tu suscripción mensual.</p>
        </div>
        <div class="footer">
          <p>© 2024 MOVIA - Todos los derechos reservados</p>
        </div>
      </div>
    </body>
    </html>
  `;
  return sendEmail({ to: email, subject: 'Completa tu registro de pago - MOVIA', html });
}

async function sendPaymentReminderEmail(email, username, paymentLink, planName, price, currency) {
  const subject = '⏰ Recuerda activar tu cuenta MOVIA';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 30px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .alert-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px 20px; border-radius: 8px; margin: 20px 0; }
        .plan-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f5576c; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .price { font-size: 24px; font-weight: bold; color: #f5576c; }
        .btn { 
          display: inline-block; 
          background: #f5576c; 
          color: white !important; 
          padding: 14px 40px; 
          text-decoration: none; 
          border-radius: 25px; 
          font-weight: bold;
          font-size: 16px;
          margin: 20px 0;
        }
        .steps { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .link-box { word-break: break-all; font-size: 12px; margin-top: 20px; padding: 10px; background: #eee; border-radius: 5px; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎬 MOVIA</h1>
          <p>¡Tu cuenta te está esperando!</p>
        </div>
        <div class="content">
          <h2>Hola ${username} 👋</h2>

          <div class="alert-box">
            <strong>⚠️ Tu cuenta está inactiva</strong><br>
            Notamos que completaste tu registro pero aún no has realizado el pago para activar tu suscripción.
          </div>

          <p>¡No te quedes sin acceso a todo el contenido de MOVIA! Completa tu pago en pocos minutos y empieza a disfrutar.</p>

          <div class="plan-box">
            <h3>📋 Tu plan pendiente:</h3>
            <p><strong>Plan:</strong> ${planName}</p>
            <p><strong>Precio:</strong> <span class="price">${price} ${currency}</span> / mes</p>
            <p><strong>Beneficios:</strong> Acceso ilimitado, sin publicidad, calidad HD.</p>
          </div>

          <div class="steps">
            <h3>Solo falta un paso 🚀</h3>
            <p>1️⃣ Haz clic en el botón de abajo</p>
            <p>2️⃣ Completa el pago con PayPal</p>
            <p>3️⃣ ¡Tu cuenta se activa al instante! ✅</p>
          </div>

          <div style="text-align: center;">
            <a href="${paymentLink}" class="btn">💰 Activar mi cuenta ahora</a>
          </div>

          <div class="link-box">
            <strong>🔗 Si el botón no funciona, copia este enlace:</strong><br>
            <a href="${paymentLink}" style="color:#f5576c;">${paymentLink}</a>
          </div>

          <p><strong>⚠️ Importante:</strong> Si el enlace expiró, contáctanos y te enviaremos uno nuevo.</p>

          <p style="font-size: 12px; color: #666;">
            ¿Necesitas ayuda? Escríbenos a 
            <a href="mailto:movia@arcodedominicana.com">movia@arcodedominicana.com</a>
          </p>
        </div>
        <div class="footer">
          <p>© 2024 MOVIA - Todos los derechos reservados</p>
          <p>Este es un correo automático, por favor no responder.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return sendEmail({ to: email, subject, html });
}

async function sendWelcomeEmail(email, username, paymentLink, planName, price, currency) {
  const subject = '🎬 ¡Bienvenido a MOVIA! Activa tu suscripción';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .plan-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .price { font-size: 24px; font-weight: bold; color: #667eea; }
        .btn { 
          display: inline-block; 
          background: #0070ba; 
          color: white !important; 
          padding: 14px 40px; 
          text-decoration: none; 
          border-radius: 25px; 
          font-weight: bold;
          font-size: 16px;
          margin: 20px 0;
        }
        .steps { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .step { display: flex; margin: 10px 0; align-items: center; }
        .link-box { word-break: break-all; color: #0070ba; font-size: 12px; margin-top: 20px; padding: 10px; background: #eee; border-radius: 5px; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎬 MOVIA</h1>
          <p>¡Tu cuenta está lista!</p>
        </div>
        <div class="content">
          <h2>¡Bienvenido ${username}! 🎉</h2>
          
          <p>Tu cuenta en MOVIA ha sido creada exitosamente. Solo falta un paso para comenzar a disfrutar de todo nuestro contenido: <strong>completar tu pago</strong>.</p>

          <div class="plan-box">
            <h3>📋 Tu plan seleccionado:</h3>
            <p><strong>Plan:</strong> ${planName}</p>
            <p><strong>Precio:</strong> <span class="price">${price} ${currency}</span> / mes</p>
            <p><strong>Beneficios:</strong> Acceso ilimitado, sin publicidad, calidad HD.</p>
          </div>

          <div class="steps">
            <h3>¿Cómo activar tu cuenta?</h3>
            <p>1️⃣ Haz clic en el botón de pago</p>
            <p>2️⃣ Completa el pago con PayPal</p>
            <p>3️⃣ Tu cuenta se activa automáticamente ✅</p>
          </div>

          <div style="text-align: center;">
            <a href="${paymentLink}" class="btn">💰 Pagar y activar mi cuenta</a>
          </div>

          <div class="link-box">
            <strong>🔗 Si el botón no funciona, copia este enlace:</strong><br>
            <a href="${paymentLink}">${paymentLink}</a>
          </div>

          <p><strong>⚠️ Importante:</strong> El enlace expira en 24 horas. Si no completas el pago, tu cuenta permanecerá inactiva.</p>

          <p style="font-size: 12px; color: #666;">¿Problemas? Escríbenos a <a href="mailto:movia@arcodedominicana.com">movia@arcodedominicana.com</a></p>
        </div>
        <div class="footer">
          <p>© 2024 MOVIA - Todos los derechos reservados</p>
          <p>Este es un correo automático, por favor no responder.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return sendEmail({ to: email, subject, html });
}


module.exports = { 
  sendEmail,
  sendPaymentLinkEmail,
  sendWelcomeEmail,
  sendPaymentSetupEmail,
  sendPaymentSuccessEmail,
  sendChargeSuccessEmail, 
  sendChargeFailedEmail,
  sendPaymentReminderEmail
};