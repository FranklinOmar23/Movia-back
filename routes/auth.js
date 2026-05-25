/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Autenticación y gestión de usuarios
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

/**
 * @swagger
 * components:
 *   schemas:
 *     RegisterRequest:
 *       type: object
 *       required:
 *         - full_name
 *         - email
 *         - password
 *       properties:
 *         full_name:
 *           type: string
 *           description: Nombre completo del usuario
 *           example: Juan Pérez
 *         email:
 *           type: string
 *           format: email
 *           description: Correo electrónico del usuario
 *           example: juan.perez@example.com
 *         password:
 *           type: string
 *           format: password
 *           description: Contraseña (mínimo 6 caracteres)
 *           example: MiPassword123
 *         role:
 *           type: string
 *           description: Rol del usuario (user por defecto)
 *           enum: [user, admin]
 *           default: user
 *           example: user
 *     
 *     RegisterResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: Usuario registrado exitosamente
 *         token:
 *           type: string
 *           description: JWT token para autenticación
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *               example: 1
 *             full_name:
 *               type: string
 *               example: Juan Pérez
 *             email:
 *               type: string
 *               example: juan.perez@example.com
 *             role:
 *               type: string
 *               example: user
 *             is_active:
 *               type: boolean
 *               example: true
 *             created_at:
 *               type: string
 *               format: date-time
 *     
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: juan.perez@example.com
 *         password:
 *           type: string
 *           format: password
 *           example: MiPassword123
 *     
 *     LoginResponse:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *             email:
 *               type: string
 *             full_name:
 *               type: string
 *             role:
 *               type: string
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Registrar un nuevo usuario
 *     description: Crea una nueva cuenta de usuario y devuelve un token JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Usuario registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RegisterResponse'
 *       400:
 *         description: Datos inválidos (email inválido, contraseña muy corta, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: La contraseña debe tener al menos 6 caracteres
 *       409:
 *         description: El email ya está registrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: El email ya está registrado
 *       500:
 *         description: Error del servidor
 */
router.post('/register', authController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Iniciar sesión
 *     description: Autentica un usuario y devuelve un token JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Email y contraseña requeridos
 *       401:
 *         description: Credenciales inválidas
 *       403:
 *         description: Cuenta desactivada
 *       500:
 *         description: Error del servidor
 */
router.post('/login', authController.login);

module.exports = router;