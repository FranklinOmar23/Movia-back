const nodemailer = require('nodemailer');
const path = require('path');
// Cargar .env desde la raíz del proyecto
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function testHostingerEmail() {
  console.log('📧 Probando configuración de Hostinger...');
  console.log('Host:', process.env.EMAIL_HOST);
  console.log('Port:', process.env.EMAIL_PORT);
  console.log('User:', process.env.EMAIL_USER);
  console.log('Pass:', process.env.EMAIL_PASS ? '***configurado***' : '❌ NO CONFIGURADO');
  
  // Verificar que las variables existen
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('❌ Faltan variables de entorno. Revisa tu archivo .env');
    console.error('   EMAIL_HOST:', process.env.EMAIL_HOST || 'undefined');
    console.error('   EMAIL_USER:', process.env.EMAIL_USER || 'undefined');
    console.error('   EMAIL_PASS:', process.env.EMAIL_PASS ? 'presente' : 'ausente');
    return;
  }
  
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
    debug: true,
    logger: true,
  });
  
  try {
    // Verificar conexión
    await transporter.verify();
    console.log('✅ Conexión exitosa con Hostinger!');
    
    // Enviar correo de prueba
    const info = await transporter.sendMail({
      from: `"MOVIA" <${process.env.EMAIL_USER}>`,
      to: 'elianjosedelossantos@gmail.com',
      subject: 'Prueba de correo MOVIA',
      html: '<h1>✅ Configuración exitosa!</h1><p>El correo de Hostinger funciona correctamente.</p>'
    });
    
    console.log('✅ Correo enviado:', info.messageId);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code) console.error('Código:', error.code);
  }
}

testHostingerEmail();